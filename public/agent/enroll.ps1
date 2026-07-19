<#
  DeviceTracker self-enroll installer.

  Run this on ANY Windows PC you want to track — no browser needed on that PC.
  It enrolls the PC as a new device under your account (using your account
  enrollment token), then installs the background agent as a hidden Scheduled
  Task that reports location at logon and every 2 minutes.

  Run with a single command (copy it from the website):

    $env:DT_TOKEN='<enrollment-token>'; $env:DT_URL='<https url>'; irm <url>/agent/enroll.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$Token   = $env:DT_TOKEN
$BaseUrl = $env:DT_URL

if (-not $Token -or -not $BaseUrl) {
  Write-Error "Set DT_TOKEN and DT_URL before running this installer."
  return
}

$BaseUrl = $BaseUrl.TrimEnd("/")
$deviceName = $env:COMPUTERNAME
if (-not $deviceName) { $deviceName = "Windows PC" }

Write-Host "Enrolling this PC ($deviceName)..."
$enrollBody = @{ token = $Token; name = $deviceName } | ConvertTo-Json
try {
  $resp = Invoke-RestMethod -Uri "$BaseUrl/api/enroll" -Method Post `
    -ContentType "application/json" -Body $enrollBody -TimeoutSec 30
} catch {
  Write-Error "Enrollment failed: $($_.Exception.Message). Check that the command is current (re-generate it on the website if needed)."
  return
}

$DeviceId = $resp.deviceId
$Secret   = $resp.secret
if (-not $DeviceId -or -not $Secret) {
  Write-Error "Enrollment did not return device credentials."
  return
}

$taskName = "DeviceTracker Agent"
$dir = Join-Path $env:LOCALAPPDATA "DeviceTracker"
$agentPath = Join-Path $dir "agent.ps1"

New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host "Downloading agent..."
Invoke-WebRequest -Uri "$BaseUrl/agent/devicetracker-agent.ps1" -OutFile $agentPath -UseBasicParsing

# Credentials are passed as Scheduled Task arguments, not written to disk.
$psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agentPath`" " +
          "-DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArgs

$atLogon = New-ScheduledTaskTrigger -AtLogOn
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 2) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action `
  -Trigger $atLogon, $repeat -Settings $settings `
  -Description "Reports this PC's location to DeviceTracker in the background." `
  -Force | Out-Null

Write-Host "Installed. Sending a first location now..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentPath `
  -DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl

Write-Host ""
Write-Host "Done. '$deviceName' now reports its location at logon and every 2 minutes." -ForegroundColor Green
Write-Host "To stop tracking, run:  irm $BaseUrl/agent/uninstall.ps1 | iex"
