# Windows Task Scheduler Deployment Script for Sync Service
# Run this script as Administrator

# Configuration
$serviceName = "UrbanVoice-SyncService"
$scriptPath = $PSScriptRoot + "\..\src\index.js"
$workingDirectory = Split-Path -Parent $PSScriptRoot
$nodePath = "C:\Program Files\nodejs\node.exe"
$logPath = $workingDirectory + "\logs\windows-task.log"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Urban Voice Sync Service Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
if (-not (Test-Path $nodePath)) {
    Write-Host "ERROR: Node.js not found at $nodePath" -ForegroundColor Red
    Write-Host "Please install Node.js or update the nodePath variable" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Node.js found at: $nodePath" -ForegroundColor Green

# Check if script exists
if (-not (Test-Path $scriptPath)) {
    Write-Host "ERROR: Script not found at $scriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Script found at: $scriptPath" -ForegroundColor Green

# Remove existing task if it exists
$existingTask = Get-ScheduledTask -TaskName $serviceName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Removing existing task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $serviceName -Confirm:$false
    Write-Host "✓ Existing task removed" -ForegroundColor Green
}

# Create scheduled task action
$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument $scriptPath `
    -WorkingDirectory $workingDirectory

# Create trigger (At system startup)
$trigger = New-ScheduledTaskTrigger -AtStartup

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0)  # No time limit

# Create principal (Run as SYSTEM with highest privileges)
$principal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

# Register the scheduled task
Write-Host "Creating scheduled task..." -ForegroundColor Yellow
Register-ScheduledTask `
    -TaskName $serviceName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Urban Voice Sync Service - Automated fault detection and complaint generation"

Write-Host "✓ Scheduled task created successfully" -ForegroundColor Green
Write-Host ""

# Display task information
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Task Information" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Task Name: $serviceName" -ForegroundColor White
Write-Host "Script Path: $scriptPath" -ForegroundColor White
Write-Host "Working Directory: $workingDirectory" -ForegroundColor White
Write-Host "Trigger: At system startup" -ForegroundColor White
Write-Host "Run As: SYSTEM (Highest Privileges)" -ForegroundColor White
Write-Host ""

# Ask if user wants to start the task now
$response = Read-Host "Do you want to start the task now? (Y/N)"
if ($response -eq 'Y' -or $response -eq 'y') {
    Write-Host "Starting task..." -ForegroundColor Yellow
    Start-ScheduledTask -TaskName $serviceName
    Write-Host "✓ Task started" -ForegroundColor Green
    Write-Host ""
    Write-Host "Check logs at: $workingDirectory\logs\" -ForegroundColor Cyan
} else {
    Write-Host "Task created but not started. It will run on next system startup." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To manage the task:" -ForegroundColor White
Write-Host "  - View: Get-ScheduledTask -TaskName '$serviceName'" -ForegroundColor Gray
Write-Host "  - Start: Start-ScheduledTask -TaskName '$serviceName'" -ForegroundColor Gray
Write-Host "  - Stop: Stop-ScheduledTask -TaskName '$serviceName'" -ForegroundColor Gray
Write-Host "  - Remove: Unregister-ScheduledTask -TaskName '$serviceName'" -ForegroundColor Gray
Write-Host ""
