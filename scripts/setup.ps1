# Inhouse first-run setup (Windows PowerShell 5.1 or PowerShell 7+).
#
# Idempotent: safe to re-run after a failure or a git pull. It will
#   1. check prerequisites (Python 3.11+, Node 18+)
#   2. create server\.venv and install the server with local STT/TTS
#   3. install web dependencies and build the PWA
#   4. download the Piper voice (~60 MB, once)
#   5. create server\.env from .env.example (never overwrites)
# Then: .\scripts\hello.ps1
#
# If Windows blocks the script, run this first (current window only):
#   Set-ExecutionPolicy -Scope Process Bypass -Force

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Say($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# --- find a real Python 3.11+ (the Microsoft Store stub and old versions fail this probe)
function Probe-Python($exe, $extraArgs) {
    try {
        $out = & $exe @extraArgs -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>$null
    } catch { return $null }
    if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
    $v = "$out".Trim()
    if ($v -notmatch '^\d+\.\d+$') { return $null }
    $parts = $v.Split('.')
    if ([int]$parts[0] -gt 3 -or ([int]$parts[0] -eq 3 -and [int]$parts[1] -ge 11)) {
        # The leading comma keeps the array intact through pipeline unrolling.
        return ,(@($exe) + $extraArgs)
    }
    return $null
}

$python = $null
foreach ($cand in @(
    @('py',      @('-3.13')), @('py', @('-3.12')), @('py', @('-3.11')), @('py', @('-3')),
    @('python3', @()),
    @('python',  @())
)) {
    if (Get-Command $cand[0] -ErrorAction SilentlyContinue) {
        $python = Probe-Python $cand[0] $cand[1]
        if ($python) { break }
    }
}
if (-not $python) {
    Fail ("Python 3.11+ not found. Install it from https://python.org/downloads " +
          "(check 'Add python.exe to PATH' in the installer), then re-run this script.")
}
# PS slicing of single-element arrays wraps backwards; split exe/args explicitly.
$pyExe  = $python[0]
$pyArgs = @()
if ($python.Count -gt 1) { $pyArgs = @($python[1..($python.Count - 1)]) }
$pyVersion = & $pyExe @pyArgs --version
Say "Python: $pyVersion"

# --- Node 18+
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Fail "Node.js not found. Install Node 18+ (LTS) from https://nodejs.org, then re-run."
}
$nodeMajor = [int](& node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
if ($nodeMajor -lt 18) { Fail "Node.js 18+ required (found $(node --version))." }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail "npm not found (it normally ships with Node.js)."
}
Say "Node: $(node --version)"

# --- python venv (server\.venv\Scripts\python.exe on Windows, bin/python elsewhere)
function Get-VenvPython {
    $win = Join-Path 'server' (Join-Path '.venv' (Join-Path 'Scripts' 'python.exe'))
    $nix = Join-Path 'server' (Join-Path '.venv' (Join-Path 'bin' 'python'))
    if (Test-Path $win) { return $win }
    if (Test-Path $nix) { return $nix }
    return $null
}

if (-not (Get-VenvPython)) {
    Say 'Creating server\.venv'
    & $pyExe @pyArgs -m venv 'server/.venv'
    if ($LASTEXITCODE -ne 0) { Fail 'Could not create the Python venv (output above has the real error).' }
}
$venvPy = Get-VenvPython
if (-not $venvPy) { Fail 'venv was created but its python.exe was not found - delete server\.venv and re-run.' }

Say 'Installing server (faster-whisper, Piper, FastAPI - a few minutes first time)'
& $venvPy -m pip install -q --upgrade pip
& $venvPy -m pip install -q -e './server[local,dev]'
if ($LASTEXITCODE -ne 0) {
    Fail ("Python dependency install failed - the output above has the real error. " +
          "Most common cause: a brand-new Python version that piper-tts or faster-whisper " +
          "has no prebuilt Windows wheel for yet. Python 3.11 or 3.12 are the safe choices.")
}

# --- web
Say 'Installing web dependencies'
Push-Location web
npm install --no-fund --no-audit --loglevel=error
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'npm install failed (output above).' }
Say 'Building the PWA'
npm run build | Out-Null
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'PWA build failed (output above).' }
Pop-Location

# --- Piper voice
if (-not (Test-Path 'voices/en_US-lessac-medium.onnx')) {
    Say 'Downloading the Piper voice (~60 MB, one time)'
    New-Item -ItemType Directory -Force -Path voices | Out-Null
    & $venvPy -m piper.download_voices en_US-lessac-medium --data-dir voices
    if ($LASTEXITCODE -ne 0) { Fail 'Voice download failed (output above) - check your network and re-run.' }
} else {
    Say 'Piper voice already present'
}

# --- config
if (-not (Test-Path 'server/.env')) {
    Copy-Item '.env.example' 'server/.env'
    Say 'Created server\.env (defaults: local whisper + Piper, LLM = Ollama on :11434)'
} else {
    Say 'server\.env already exists - leaving it alone'
}

Say 'Setup complete. Hear it talk:  .\scripts\hello.ps1'
