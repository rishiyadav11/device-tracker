<#
  DeviceTracker agent installer.

  Downloads the agent script and registers a Scheduled Task that runs it at
  logon and every 2 minutes, in the background, for the current user.

  Credentials are read from environment variables so the whole thing can be
  run with a single `irm ... | iex` command:

    $env:DT_DEVICE='<device-id>'; $env:DT_SECRET='<secret>'; $env:DT_URL='<https url>'; irm <url>/agent/install.ps1 | iex
#>

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
try {
  Invoke-WebRequest -Uri "$BaseUrl/agent/devicetracker-agent.ps1" -OutFile $agentPath -UseBasicParsing
} catch {
  Write-Error "Could not download the agent: $($_.Exception.Message)"
  return
}

# --- Register the background Scheduled Task -------------------------------
# Registration can fail with "Access is denied" on some Windows setups (local
# policy, managed/corporate devices, some Home builds) even for a task that
# only runs as the current user. Try the modern cmdlet first, then fall back
# to schtasks.exe, which succeeds in some environments where the cmdlet is
# blocked. Neither path requires an admin-elevated PowerShell in most cases.
$psExe = (Get-Command powershell.exe).Source
$psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agentPath`" " +
          "-DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl"

$taskInstalled = $false
try {
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
    -Force -ErrorAction Stop | Out-Null
  $taskInstalled = $true
} catch {
  Write-Host "Standard task registration was denied ($($_.Exception.Message)). Trying an alternate method..." -ForegroundColor Yellow
  try {
    $trValue = "`"$psExe`" $psArgs"
    schtasks.exe /Create /TN $taskName /TR $trValue /SC MINUTE /MO 2 /RL LIMITED /F 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $taskInstalled = $true }
  } catch {
    # fall through — $taskInstalled stays $false
  }
}

# Send a first location regardless of whether the recurring task installed,
# so something shows up on the dashboard even if scheduling needs a retry.
Write-Host "Sending a first location now..."
try {
  & $psExe -NoProfile -ExecutionPolicy Bypass -File $agentPath `
    -DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl
} catch {
  Write-Host "Could not send an initial location: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
if ($taskInstalled) {
  Write-Host "Done. This PC will now report its location at logon and every 2 minutes." -ForegroundColor Green
  Write-Host "To stop tracking, run:  irm $BaseUrl/agent/uninstall.ps1 | iex"
} else {
  Write-Host "This PC sent one location, but the recurring background task could not be" -ForegroundColor Yellow
  Write-Host "created (Windows denied permission to schedule tasks here)." -ForegroundColor Yellow
  Write-Host "Fix: right-click PowerShell -> 'Run as administrator', then run this command again:" -ForegroundColor Yellow
  Write-Host "  `$env:DT_DEVICE='$DeviceId'; `$env:DT_SECRET='$Secret'; `$env:DT_URL='$BaseUrl'; irm $BaseUrl/agent/install.ps1 | iex"
}
