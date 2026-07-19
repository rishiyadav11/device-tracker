<#
  Removes the DeviceTracker agent: unregisters the Scheduled Task (if any),
  stops any startup-folder fallback loop, and deletes the installed files.
  Run with:  irm <url>/agent/uninstall.ps1 | iex
#>

$ErrorActionPreference = "SilentlyContinue"

$taskName = "DeviceTracker Agent"
$dir = Join-Path $env:LOCALAPPDATA "DeviceTracker"
$startupDir = [Environment]::GetFolderPath("Startup")
$lnkPath = Join-Path $startupDir "DeviceTracker Agent.lnk"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like "*loop-agent.ps1*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Remove-Item -Force -Path $lnkPath
Remove-Item -Recurse -Force -Path $dir

Write-Host "DeviceTracker agent removed. This PC will no longer report its location." -ForegroundColor Green
