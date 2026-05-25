$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvPath = Join-Path $ProjectRoot ".env.local"
$Port = if ($env:SIDUS_PORT) { [int]$env:SIDUS_PORT } else { 3000 }
$BaseUrl = "http://localhost:$Port"
$LogDir = Join-Path $ProjectRoot ".sidus-logs"
$StdoutLogPath = Join-Path $LogDir "verify-real-api-dev.out.log"
$StderrLogPath = Join-Path $LogDir "verify-real-api-dev.err.log"

function Write-Step($Message) {
  Write-Host "==> $Message"
}

if (!(Test-Path $EnvPath)) {
  throw ".env.local does not exist. Create it from .env.example and set OPENAI_API_KEY."
}

$EnvContent = Get-Content -Path $EnvPath -Encoding UTF8
$ApiKeyLine = $EnvContent | Where-Object { $_ -match "^OPENAI_API_KEY=.+$" } | Select-Object -First 1

if (!$ApiKeyLine -or $ApiKeyLine.Trim() -eq "OPENAI_API_KEY=") {
  throw "OPENAI_API_KEY is empty. Add a rotated key to .env.local, then run npm run verify:real-api again."
}

if (!(Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

Write-Step "Stopping existing dev server on port $Port if present"
$Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$ProcessIds = $Connections | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($ProcessId in $ProcessIds) {
  if ($ProcessId -and $ProcessId -ne $PID) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Start-Sleep -Seconds 2

Write-Step "Starting Next.js dev server on $BaseUrl"
$NpmPath = (Get-Command npm.cmd).Source
$DevProcess = Start-Process `
  -FilePath $NpmPath `
  -ArgumentList @("run", "dev", "--", "--hostname", "127.0.0.1", "--port", "$Port") `
  -WorkingDirectory $ProjectRoot `
  -RedirectStandardOutput $StdoutLogPath `
  -RedirectStandardError $StderrLogPath `
  -WindowStyle Hidden `
  -PassThru

Write-Step "Waiting for dev server"
$Ready = $false
for ($Attempt = 1; $Attempt -le 45; $Attempt++) {
  try {
    $Response = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 2
    if ($Response.StatusCode -ge 200 -and $Response.StatusCode -lt 500) {
      $Ready = $true
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (!$Ready) {
  throw "Dev server did not become ready. Check $StdoutLogPath and $StderrLogPath"
}

Write-Step "Running real API smoke test"
$env:SIDUS_BASE_URL = $BaseUrl
$NodePath = (Get-Command node).Source
& $NodePath (Join-Path $ProjectRoot "scripts/smoke-real-api.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "Real API smoke test failed with exit code $LASTEXITCODE"
}

Write-Step "Real API verification finished. Dev server is still running. Logs: $StdoutLogPath and $StderrLogPath"
