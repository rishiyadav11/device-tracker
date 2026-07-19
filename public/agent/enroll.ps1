<#
  DeviceTracker self-enroll installer.

  Run this on ANY Windows PC you want to track - no browser needed on that PC.
  It enrolls the PC as a new device under your account (using your account
  enrollment token), then installs the background agent as a hidden Scheduled
  Task that reports location at logon and every 2 minutes.

  Run with a single command (copy it from the website):

    $env:DT_TOKEN='<enrollment-token>'; $env:DT_URL='<https url>'; irm <url>/agent/enroll.ps1 | iex
#>

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

  # Write a small standalone helper so the elevated process gets its values as
  # proper, separately-quoted arguments instead of one fragile command string.
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
    Write-Host "Elevated install did not complete: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# --- Tier 4: Startup-folder loop (needs no special permission at all) -----
# If Task Scheduler is blocked entirely by local policy, even elevation won't
# help. The Startup folder is a completely different, unprivileged mechanism
# every standard Windows account can write to for itself: a shortcut there
# runs automatically at every logon. Combined with a small self-looping
# script, this gets the same "report every 2 minutes while logged on" result
# without touching Task Scheduler at all.
$usedStartupFallback = $false
if (-not $taskInstalled) {
  Write-Host "Falling back to a startup-folder method that needs no special permissions..." -ForegroundColor Yellow

  $loopScript = Join-Path $dir "loop-agent.ps1"
  @'
param([string]$AgentPath, [string]$DeviceId, [string]$Secret, [string]$BaseUrl)
while ($true) {
  try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $AgentPath -DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl
  } catch {}
  Start-Sleep -Seconds 120
}
'@ | Set-Content -Path $loopScript -Encoding UTF8

  # Stop any previously started loop for this device so they don't pile up.
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*loop-agent.ps1*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  try {
    $startupDir = [Environment]::GetFolderPath("Startup")
    $lnkPath = Join-Path $startupDir "DeviceTracker Agent.lnk"
    $loopArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$loopScript`" " +
                "-AgentPath `"$agentPath`" -DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl"

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($lnkPath)
    $shortcut.TargetPath = $psExe
    $shortcut.Arguments = $loopArgs
    $shortcut.WindowStyle = 7
    $shortcut.Save()

    # Start it right now too, so tracking begins immediately instead of
    # waiting for the next logon.
    Start-Process -FilePath $psExe -WindowStyle Hidden -ArgumentList @(
      "-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", $loopScript,
      "-AgentPath", $agentPath, "-DeviceId", $DeviceId, "-Secret", $Secret, "-BaseUrl", $BaseUrl
    ) | Out-Null

    $taskInstalled = $true
    $usedStartupFallback = $true
  } catch {
    Write-Host "Startup-folder fallback also failed: $($_.Exception.Message)" -ForegroundColor Red
  }
}

# Send a first location regardless of whether background tracking installed,
# so something shows up on the dashboard even if scheduling still failed.
Write-Host "Sending a first location now..."
try {
  & $psExe -NoProfile -ExecutionPolicy Bypass -File $agentPath `
    -DeviceId $DeviceId -Secret $Secret -BaseUrl $BaseUrl
} catch {
  Write-Host "Could not send an initial location: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
if ($taskInstalled -and -not $usedStartupFallback) {
  Write-Host "Done. '$deviceName' now reports its location at logon and every 2 minutes." -ForegroundColor Green
  Write-Host "To stop tracking, run:  irm $BaseUrl/agent/uninstall.ps1 | iex"
} elseif ($taskInstalled -and $usedStartupFallback) {
  Write-Host "Done. '$deviceName' now reports its location every 2 minutes while you're logged in," -ForegroundColor Green
  Write-Host "restarting automatically each time you log in (Task Scheduler was blocked on this PC," -ForegroundColor Green
  Write-Host "so this uses a startup-folder entry instead)." -ForegroundColor Green
  Write-Host "To stop tracking, run:  irm $BaseUrl/agent/uninstall.ps1 | iex"
} else {
  Write-Host "'$deviceName' was enrolled and sent one location, but background tracking could" -ForegroundColor Yellow
  Write-Host "not be installed by any method. This PC's Windows account is unusually locked down." -ForegroundColor Yellow
  Write-Host "Location won't update again until you re-run this command." -ForegroundColor Yellow
}
