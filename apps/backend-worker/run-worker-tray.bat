@echo off
setlocal
cd /d "%~dp0"

if not exist "WorkerTray.exe" (
  echo [INFO] WorkerTray.exe not found. Building...
  powershell -ExecutionPolicy Bypass -File ".\scripts\generate-worker-icon.ps1"
  powershell -ExecutionPolicy Bypass -Command "Import-Module ps2exe -ErrorAction SilentlyContinue; if (-not (Get-Command Invoke-ps2exe -ErrorAction SilentlyContinue)) { Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force | Out-Null; Set-PSRepository -Name PSGallery -InstallationPolicy Trusted; Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber; Import-Module ps2exe }; Invoke-ps2exe -inputFile '.\scripts\worker-tray.ps1' -outputFile '.\WorkerTray.exe' -iconFile '.\assets\cognimail-worker.ico' -noConsole -title 'CogniMail Worker Tray' -description 'CogniMail local worker tray app' -company 'CogniMail' -product 'CogniMail Worker' -version '1.0.0.0'"
)

start "" "%~dp0WorkerTray.exe"
exit /b 0

