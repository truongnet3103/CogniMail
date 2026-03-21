@echo off
setlocal

cd /d "%~dp0"

if not exist "dist\worker-user-direct.js" (
  echo [INFO] Building backend...
  call npm.cmd run build
  if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
  )
)

powershell -ExecutionPolicy Bypass -File ".\scripts\run-worker-user.ps1"

endlocal
