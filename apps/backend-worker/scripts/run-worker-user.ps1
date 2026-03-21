$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$envPath = Join-Path $root ".env.worker.userdirect"

if (!(Test-Path $envPath)) {
  Write-Host "[INFO] Missing .env.worker.userdirect. Creating default local agent config."
  @(
    "# Auto-generated default for local agent",
    "FIREBASE_WEB_API_KEY=AIzaSyCo1W3Fx8hvUqYB5joqjaAKUMnDAz0fqLM",
    "FIREBASE_AUTH_DOMAIN=cognimail-fa0c0.firebaseapp.com",
    "FIREBASE_PROJECT_ID=cognimail-fa0c0",
    "FIREBASE_STORAGE_BUCKET=cognimail-fa0c0.firebasestorage.app",
    "FIREBASE_MESSAGING_SENDER_ID=906136722896",
    "FIREBASE_APP_ID=1:906136722896:web:3dc2809bf51d11ba302dd5",
    "WORKER_INTERVAL_MINUTES=15",
    "WORKER_LIMIT=5",
    "WORKER_AGENT_PORT=41731",
    "OAUTH_CALLBACK_PORT=1455"
  ) -join "`r`n" | Set-Content -Path $envPath -Encoding UTF8
}

if (!(Test-Path (Join-Path $root "dist\worker-user-direct.js"))) {
  Write-Host "[INFO] Building backend..."
  npm.cmd run build | Out-Host
}

$env:WORKER_ENV_PATH = $envPath

Write-Host "[INFO] Starting Cognimail worker (direct user auth mode)..."
node dist\worker-user-direct.js
