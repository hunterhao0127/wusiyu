param(
    [Parameter(Mandatory = $true)]
    [string]$BackendPath
)

$ErrorActionPreference = 'Stop'
$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$dataDir = Join-Path $tempRoot 'wusiyu-smoke-data'
$booksDir = Join-Path $dataDir 'books'
$backupPath = Join-Path $tempRoot 'wusiyu-smoke-backup.zip'
New-Item -ItemType Directory -Force -Path $booksDir | Out-Null
[IO.File]::WriteAllText((Join-Path $booksDir 'sample.txt'), 'A shared Windows backend smoke test.', [Text.Encoding]::UTF8)

$env:WUSIYU_ELECTRON = '1'
$env:WUSIYU_DATA_DIR = $dataDir
$process = Start-Process -FilePath $BackendPath -WindowStyle Hidden -PassThru

try {
    $version = $null
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
        try {
            $version = Invoke-RestMethod -Uri 'http://127.0.0.1:5980/api/version' -TimeoutSec 2
            break
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    if (-not $version.success -or $version.version -ne '1.6.0') {
        throw '后端版本接口未就绪或版本不匹配'
    }

    $books = Invoke-RestMethod -Uri 'http://127.0.0.1:5980/api/books'
    if (-not $books.success -or $books.books.Count -ne 1) {
        throw '共享书库接口冒烟测试失败'
    }

    $record = @{
        id = 'word:windows-smoke'
        type = 'vocabulary'
        updatedAt = 1
        deviceId = 'windows-runner'
        deletedAt = $null
        payload = @{ id = 'word:windows-smoke'; type = 'word'; text = 'smoke' }
    }
    $backup = @{
        format = 'wusiyu-learning-backup'
        version = 2
        exportedAt = '2026-09-09T00:00:00.000Z'
        sourceDeviceId = 'windows-runner'
        records = @($record)
    }
    $body = @{ backup = $backup; filenames = @('sample.txt') } | ConvertTo-Json -Depth 8
    Invoke-WebRequest -Uri 'http://127.0.0.1:5980/api/backup/export' -Method Post -ContentType 'application/json' -Body $body -OutFile $backupPath
    if ((Get-Item $backupPath).Length -le 0) {
        throw 'ZIP 导出产物为空'
    }

    $syncBody = @{ records = @($record) } | ConvertTo-Json -Depth 6
    Invoke-RestMethod -Uri 'http://127.0.0.1:5980/api/sync-records' -Method Put -ContentType 'application/json' -Body $syncBody | Out-Null
    $saved = Invoke-RestMethod -Uri 'http://127.0.0.1:5980/api/sync-records'
    if ($saved.records.Count -ne 1 -or $saved.records[0].payload.text -ne 'smoke') {
        throw '同步记录往返失败'
    }

    Write-Host 'Windows backend smoke test: OK'
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
}
