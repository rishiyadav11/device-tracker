<#
  DeviceTracker background agent.

  Determines this Windows PC's location and reports it to the DeviceTracker
  website. Designed to be run repeatedly in the background (via a Scheduled
  Task or a startup-folder loop), so it works whether or not any browser is
  open.

  Location sources, in order of preference:
    1. Browser relay - launches the installed Edge/Chrome to a small page
       that uses the browser's own (richer, crowdsourced) network-location
       database, same as visiting a site in a normal tab. Most accurate.
       Uses a dedicated, persistent browser profile: the first run shows the
       window so you can grant location permission once; every run after
       that reuses the same profile and can run fully invisibly.
    2. Windows Location service (Windows.Devices.Geolocation) - WiFi-based
       positioning via the OS API directly, accurate to tens/hundreds of
       meters depending on how well-mapped the area is.
    3. IP-based geolocation (ip-api.com) - coarse, city-level fallback used
       when neither of the above is available.

  Parameters may be passed on the command line or via the DT_DEVICE / DT_SECRET
  / DT_URL environment variables (the installer uses the latter).
#>
param(
  [string]$DeviceId = $env:DT_DEVICE,
  [string]$Secret   = $env:DT_SECRET,
  [string]$BaseUrl  = $env:DT_URL
)

$ErrorActionPreference = "Stop"

if (-not $DeviceId -or -not $Secret -or -not $BaseUrl) {
  Write-Error "DeviceId, Secret and BaseUrl are required."
  exit 1
}

$BaseUrl = $BaseUrl.TrimEnd("/")
$dir = Join-Path $env:LOCALAPPDATA "DeviceTracker"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# --- Method 1: browser relay (most accurate) -------------------------------
function Get-BrowserExe {
  $regKeys = @(
    "HKLM:\SOFTWARE\Clients\StartMenuInternet\Microsoft Edge\shell\open\command",
    "HKLM:\SOFTWARE\Clients\StartMenuInternet\Google Chrome\shell\open\command",
    "HKLM:\SOFTWARE\WOW6432Node\Clients\StartMenuInternet\Google Chrome\shell\open\command"
  )
  foreach ($key in $regKeys) {
    try {
      $val = (Get-ItemProperty -Path $key -ErrorAction Stop).'(default)'
      if ($val) {
        $exePath = $val.Trim('"')
        if (Test-Path $exePath) { return $exePath }
      }
    } catch {}
  }

  $candidates = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { return $c }
  }
  return $null
}

function Get-LastSeenAt {
  try {
    $r = Invoke-RestMethod -Uri "$BaseUrl/api/devices/$DeviceId/last-report" `
      -Headers @{ Authorization = "Bearer $Secret" } -TimeoutSec 15
    return $r.lastSeenAt
  } catch {
    return $null
  }
}

function Invoke-BrowserRelay {
  $browser = Get-BrowserExe
  if (-not $browser) { return $false }

  # A dedicated, persistent profile (not --inprivate/--incognito, which wipe
  # permissions every launch and would leave the geolocation prompt with no
  # one able to click it). The first-ever run creates this profile and shows
  # the window so you can grant location access once; it's then remembered
  # for every future invisible run against the same profile folder.
  $profileDir = Join-Path $dir "BrowserProfile"
  $isFirstRun = -not (Test-Path $profileDir)
  $relayUrl = "$BaseUrl/relay?device=$DeviceId&secret=$Secret"

  $processArgs = @("--app=$relayUrl", "--user-data-dir=$profileDir", "--no-first-run")
  if ($isFirstRun) {
    Write-Host "First-time setup: a small browser window will open asking for location permission." -ForegroundColor Cyan
    Write-Host "Click 'Allow' when prompted - this only needs to happen once." -ForegroundColor Cyan
    $waitSeconds = 30
  } else {
    $processArgs += @("--window-size=200,150", "--window-position=-3000,-3000")
    $waitSeconds = 10
  }

  # A browser launching successfully doesn't mean the page actually reported
  # a location (permission ignored, prompt missed, page error, etc.) - check
  # the server's own record of the last report before and after, so a launch
  # that didn't actually result in a report correctly falls through to the
  # other methods below instead of silently reporting nothing this cycle.
  $before = Get-LastSeenAt

  try {
    $proc = Start-Process -FilePath $browser -ArgumentList $processArgs -PassThru -ErrorAction Stop
    for ($i = 0; $i -lt $waitSeconds; $i++) {
      Start-Sleep -Seconds 1
      if ($proc.HasExited) { break }
    }
    if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  } catch {
    return $false
  }

  $after = Get-LastSeenAt
  if ($after -and $after -ne $before) {
    Write-Host "Browser relay confirmed: last report updated to $after" -ForegroundColor Cyan
    return $true
  }
  Write-Host "Browser relay launched but did not result in a new report - falling back." -ForegroundColor Yellow
  return $false
}

# --- Method 2: Windows Location service (OS API directly) ------------------
# Required for [System.WindowsRuntimeSystemExtensions] (the WinRT-to-.NET
# async bridge used below) to be available at all in Windows PowerShell 5.1 -
# without this, every WinRT async call fails before it even starts.
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

function Await($WinRtTask, $ResultType) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.GetParameters().Count -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    })[0]
  $netTask = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

function Get-WindowsLocation {
  try {
    [void][Windows.Devices.Geolocation.Geolocator, Windows.Devices.Geolocation, ContentType = WindowsRuntime]
    [void][Windows.Devices.Geolocation.GeolocationAccessStatus, Windows.Devices.Geolocation, ContentType = WindowsRuntime]
    [void][Windows.Devices.Geolocation.PositionStatus, Windows.Devices.Geolocation, ContentType = WindowsRuntime]

    $accessStatus = Await ([Windows.Devices.Geolocation.Geolocator]::RequestAccessAsync()) ([Windows.Devices.Geolocation.GeolocationAccessStatus])
    if ($accessStatus -ne [Windows.Devices.Geolocation.GeolocationAccessStatus]::Allowed) {
      Write-Host "Windows Location access: $accessStatus (not Allowed)." -ForegroundColor Yellow
      return $null
    }

    $locator = New-Object Windows.Devices.Geolocation.Geolocator
    $locator.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High

    if ($locator.LocationStatus -eq [Windows.Devices.Geolocation.PositionStatus]::Disabled) {
      Write-Host "Windows Location is turned off in Settings > Privacy & security > Location." -ForegroundColor Yellow
      return $null
    }

    $pos = Await ($locator.GetGeopositionAsync()) ([Windows.Devices.Geolocation.Geoposition])
    $c = $pos.Coordinate
    Write-Host "Windows Location source: $($c.PositionSource), accuracy: $([math]::Round($c.Accuracy)) m" -ForegroundColor Cyan
    return [pscustomobject]@{
      lat            = [double]$c.Point.Position.Latitude
      lng            = [double]$c.Point.Position.Longitude
      accuracyMeters = [double]$c.Accuracy
      source         = "gps"
    }
  } catch {
    Write-Host "Windows Location unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
    return $null
  }
}

# --- Method 3: IP geolocation (coarse fallback) -----------------------------
function Get-IpLocation {
  try {
    $r = Invoke-RestMethod -Uri "http://ip-api.com/json/?fields=status,lat,lon" -TimeoutSec 15
    if ($r.status -ne "success") { return $null }
    return [pscustomobject]@{
      lat            = [double]$r.lat
      lng            = [double]$r.lon
      accuracyMeters = 5000
      source         = "ip"
    }
  } catch {
    return $null
  }
}

# --- Run: browser relay first (reports itself), else fall back and report --
if (Invoke-BrowserRelay) {
  Write-Output "Reported location via browser relay (see the dashboard for exact coordinates)."
  exit 0
}

$loc = Get-WindowsLocation
if (-not $loc) { $loc = Get-IpLocation }

if (-not $loc) {
  Write-Error "Could not determine location by any method."
  exit 1
}

$body = @{
  lat            = $loc.lat
  lng            = $loc.lng
  accuracyMeters = $loc.accuracyMeters
  source         = $loc.source
} | ConvertTo-Json

try {
  Invoke-RestMethod `
    -Uri "$BaseUrl/api/devices/$DeviceId/location" `
    -Method Post `
    -Headers @{ Authorization = "Bearer $Secret" } `
    -ContentType "application/json" `
    -Body $body `
    -TimeoutSec 30 | Out-Null
  Write-Output "Reported $($loc.source) location: $($loc.lat), $($loc.lng) (+/- $([math]::Round($loc.accuracyMeters)) m)"
} catch {
  Write-Error "Failed to report location: $($_.Exception.Message)"
  exit 1
}
