<#
  DeviceTracker background agent.

  Determines this Windows PC's location and reports it to the DeviceTracker
  website. Designed to be run by a Scheduled Task at logon and on an interval,
  so it works whether or not any browser is open.

  Location sources, in order of preference:
    1. Windows Location service (Windows.Devices.Geolocation) -> WiFi-based
       positioning, accurate to tens of meters when Location is enabled.
    2. IP-based geolocation (ip-api.com) -> coarse, city-level fallback used
       when the Windows Location service is unavailable or turned off.

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

# Awaits a WinRT IAsyncOperation<T> from Windows PowerShell 5.1.
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
    $locator = New-Object Windows.Devices.Geolocation.Geolocator
    $locator.DesiredAccuracy = [Windows.Devices.Geolocation.PositionAccuracy]::High

    $pos = Await ($locator.GetGeopositionAsync()) ([Windows.Devices.Geolocation.Geoposition])
    $c = $pos.Coordinate
    return [pscustomobject]@{
      lat            = [double]$c.Point.Position.Latitude
      lng            = [double]$c.Point.Position.Longitude
      accuracyMeters = [double]$c.Accuracy
      source         = "gps"
    }
  } catch {
    return $null
  }
}

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

$loc = Get-WindowsLocation
if (-not $loc) { $loc = Get-IpLocation }

if (-not $loc) {
  Write-Error "Could not determine location from Windows Location service or IP."
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
