# First conversation, no LLM required (Windows PowerShell 5.1 or PowerShell 7+).
#
# Starts the bundled mock LLM and the Inhouse server wired to it, so the
# full real pipeline runs with zero configuration: your mic -> local Whisper
# -> mock LLM -> local Piper -> your speakers. Run .\scripts\setup.ps1 first.
# Ctrl+C stops everything.

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Say($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

$venvPy = $null
foreach ($p in @('server/.venv/Scripts/python.exe', 'server/.venv/bin/python')) {
    if (Test-Path $p) { $venvPy = $p; break }
}
if (-not $venvPy)                                    { Fail 'server\.venv missing - run .\scripts\setup.ps1 first.' }
if (-not (Test-Path 'web/dist'))                     { Fail 'web\dist missing - run .\scripts\setup.ps1 first.' }
if (-not (Test-Path 'voices/en_US-lessac-medium.onnx')) { Fail 'Piper voice missing - run .\scripts\setup.ps1 first.' }
if (-not (Test-Path 'server/.env'))                  { Copy-Item '.env.example' 'server/.env' }

$port = 8770
$mockPort = 9001

function Test-PortInUse($p) {
    $client = New-Object Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $p); $client.Close(); return $true } catch { return $false }
}
if (Test-PortInUse $port) { Fail "Port $port is already in use - is an Inhouse server already running?" }

# A real fingerprint: only the mock answers a chat completion on this port.
function Test-MockAnswers {
    $body = '{"model":"mock","stream":true,"messages":[{"role":"user","content":"ping"}]}'
    try {
        $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Method Post `
            -ContentType 'application/json' -Body $body `
            "http://127.0.0.1:$mockPort/v1/chat/completions"
        return $resp.StatusCode -eq 200
    } catch { return $false }
}

$mock = $null
if (Test-MockAnswers) {
    Say "Reusing the mock LLM already running on :$mockPort"
} elseif (Test-PortInUse $mockPort) {
    Fail "Port $mockPort is in use by something that isn't the mock LLM - stop it first."
} else {
    Say 'Starting the mock LLM (an offline stand-in so you can hear the pipeline)'
    $mock = Start-Process -FilePath (Resolve-Path $venvPy) `
        -ArgumentList 'scripts/mock_llm.py', '--port', "$mockPort" `
        -WorkingDirectory (Get-Location) -NoNewWindow -PassThru
    for ($i = 0; $i -lt 20; $i++) {
        if (Test-MockAnswers) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-MockAnswers)) {
        if ($mock -and -not $mock.HasExited) { Stop-Process -Id $mock.Id -Force }
        Fail 'The mock LLM did not start (output above has the real error).'
    }
}

Say 'Starting Inhouse (first question downloads the whisper model, ~75 MB - the first reply is slow once)'
Write-Host ''
Write-Host "    Open http://127.0.0.1:$port - hold the mic and talk, or type." -ForegroundColor Green
Write-Host '    Ctrl+C here stops everything.' -ForegroundColor Green
Write-Host ''

$env:INHOUSE_LLM__PROVIDER = 'openai_compat'
$env:INHOUSE_LLM__BASE_URL = "http://127.0.0.1:$mockPort/v1"
$env:INHOUSE_LLM__MODEL    = 'mock'
$env:INHOUSE_LLM__API_KEY  = ''

Push-Location server
try {
    & (Join-Path '..' $venvPy) -m inhouse
} finally {
    Pop-Location
    if ($mock -and -not $mock.HasExited) { Stop-Process -Id $mock.Id -Force -ErrorAction SilentlyContinue }
    Remove-Item Env:INHOUSE_LLM__PROVIDER, Env:INHOUSE_LLM__BASE_URL, Env:INHOUSE_LLM__MODEL, Env:INHOUSE_LLM__API_KEY -ErrorAction SilentlyContinue
}
