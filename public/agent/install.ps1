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
# policy, managed/corporate devices, some Home builds), even for a task that
# only runs as the current user. Three tiers, each only attempted if the
# previous one failed:
#   1. The modern cmdlet, non-elevated.
#   2. schtasks.exe, non-elevated (works in some environments where the
#      cmdlet's CIM provider is blocked but the task itself wouldn't be).
#   3. Self-elevate via a UAC prompt and register from there - this is the
#      one that actually succeeds when the account is genuinely restricted
#      from scheduling tasks at all.
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
  Write-Host "Standard task registration was denied. Trying an alternate method..." -ForegroundColor Yellow
  try {
    $trValue = "`"$psExe`" $psArgs"
    schtasks.exe /Create /TN $taskName /TR $trValue /SC MINUTE /MO 2 /RL LIMITED /F 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $taskInstalled = $true }
  } catch {
    # fall through to elevation
  }
}

if (-not $taskInstalled) {
  Write-Host "This Windows account isn't allowed to schedule tasks without elevation." -ForegroundColor Yellow
  Write-Host "Requesting administrator access to finish installing (approve the prompt that appears)..." -ForegroundColor Yellow

  $registerScript = Join-Path $dir "register-task.ps1"
  @'
param(
  [Parameter(Mandatory)][string]$TaskName,
  [Parameter(Mandatory)][string]$AgentPath,
  [Parameter(Mandatory)][string]$DeviceId,
  [Parameter(Mandatory)][string]$Secret,
  [Parameter(Mandatory)][string]$BaseUrl
)
try {
  $psArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$AgentPath`" -DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl"
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $psArgs
  $atLogon = New-ScheduledTaskTrigger -AtLogOn
  $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 2) -RepetitionDuration (New-TimeSpan -Days 3650)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $atLogon, $repeat -Settings $settings -Description "Reports this PC's location to DeviceTracker in the background." -Force -ErrorAction Stop | Out-Null
  exit 0
} catch {
  exit 1
}
'@ | Set-Content -Path $registerScript -Encoding UTF8

  try {
    $proc = Start-Process -FilePath $psExe -ArgumentList @(
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $registerScript,
      "-TaskName", $taskName, "-AgentPath", $agentPath,
      "-DeviceId", $DeviceId, "-Secret", $Secret, "-BaseUrl", $BaseUrl
    ) -Verb RunAs -Wait -PassThru -ErrorAction Stop
    if ($proc.ExitCode -eq 0) { $taskInstalled = $true }
  } catch {
    # UAC prompt was declined, or elevation isn't available at all.
  }
}

# Send a first location regardless of whether the recurring task installed,
# so something shows up on the dashboard even if scheduling still failed.
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
  Write-Host "This PC sent one location, but the recurring background task still could not" -ForegroundColor Yellow
  Write-Host "be created - this account is blocked from scheduling tasks even with elevation," -ForegroundColor Yellow
  Write-Host "likely by a local or organization policy on this PC." -ForegroundColor Yellow
}
