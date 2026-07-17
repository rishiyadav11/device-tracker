<#
  DeviceTracker agent installer.

  Downloads the agent script and registers a Scheduled Task that runs it at
  logon and every 10 minutes, in the background, for the current user. No
  administrator rights are required.

  Credentials are read from environment variables so the whole thing can be
  run with a single `irm ... | iex` command:

    $env:DT_DEVICE='<device-id>'; $env:DT_SECRET='<secret>'; $env:DT_URL='<https url>'; irm <url>/agent/install.ps1 | iex
#>

$ErrorActionPreference = "Stop"

$DeviceId = $env:DT_DEVICE
$Secret   = $env:DT_SECRET
$BaseUrl  = $env:DT_URL

if (-not $DeviceId -or -not $Secret -or -not $BaseUrl) {
  Write-Error "Set DT_DEVICE, DT_SECRET and DT_URL before running this installer."
  return
}

$BaseUrl = $BaseUrl.TrimEnd("/")
$taskName = "DeviceTracker Agent"
$dir = Join-Path $env:LOCALAPPDATA "DeviceTracker"
$agentPath = Join-Path $dir "agent.ps1"

New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host "Downloading agent..."
Invoke-WebRequest -Uri "$BaseUrl/agent/devicetracker-agent.ps1" -OutFile $agentPath -UseBasicParsing

# The agent reads credentials from its parameters. We pass them through the
# Scheduled Task's argument list so nothing sensitive is written to disk.
$psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agentPath`" " +
          "-DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArgs

$atLogon = New-ScheduledTaskTrigger -AtLogOn
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes 10) `
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
Write-Host "Done. This PC will now report its location at logon and every 10 minutes." -ForegroundColor Green
Write-Host "To stop tracking, run:  irm $BaseUrl/agent/uninstall.ps1 | iex"
