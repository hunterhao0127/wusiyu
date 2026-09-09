$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendSource = Join-Path $projectRoot '02-Mac版/flask-app'
$windowsBackend = Join-Path $projectRoot '01-Windows版/backend'

Push-Location $backendSource
try {
    python -m PyInstaller --clean --noconfirm wusiyu_backend.spec
} finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path $windowsBackend | Out-Null
Copy-Item -Force (Join-Path $backendSource 'dist/wusiyu_backend.exe') (Join-Path $windowsBackend 'wusiyu_backend.exe')
Write-Host '共享 Desktop 后端已生成: 01-Windows版/backend/wusiyu_backend.exe'
