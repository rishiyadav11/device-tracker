<#
  Removes the DeviceTracker agent: unregisters the Scheduled Task and deletes
  the installed files. Run with:  irm <url>/agent/uninstall.ps1 | iex
#>

$ErrorActionPreference = "SilentlyContinue"

$taskName = "DeviceTracker Agent"
$dir = Join-Path $env:LOCALAPPDATA "DeviceTracker"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Remove-Item -Recurse -Force -Path $dir

Write-Host "DeviceTracker agent removed. This PC will no longer report its location." -ForegroundColor Green
