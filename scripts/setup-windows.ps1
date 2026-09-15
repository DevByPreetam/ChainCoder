# ============================================================
# ChainCoder - Windows Developer Setup Script
# scripts/setup-windows.ps1
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
#
# This script:
#   1. Checks all required prerequisites (Git, Node, npm, Docker,
#      peer, configtxgen, osnadmin, fabric-ca-client, ipfs)
#   2. Verifies Docker Desktop is running
#   3. Installs frontend & backend npm dependencies
#   4. Prepares backend/.env from .env.example (never overwriting)
#   5. Detects if this is a fresh machine or an existing setup:
#      - Fresh machine: generates fresh Fabric organizations,
#        identities, and channel genesis block.
#      - Existing machine: preserves all identities and ledger data.
#   6. Checks/initializes IPFS repository
#   7. Prints clear instructions for running the system
# ============================================================

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ChainCoder - Windows Developer Setup" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# Helper functions
# ============================================================

function Check-Command {
    param(
        [string]$Command,
        [string]$Description,
        [string]$InstallHint
    )
    Write-Host -NoNewline "  Checking $Description ... "
    $result = Get-Command $Command -ErrorAction SilentlyContinue
    if ($result) {
        $version = ""
        try {
            if ($Command -eq "docker") {
                $version = (docker --version 2>$null) -replace "Docker version ", ""
            } elseif ($Command -eq "node") {
                $version = (node --version 2>$null)
            } elseif ($Command -eq "npm") {
                $version = (npm --version 2>$null)
            } elseif ($Command -eq "git") {
                $version = (git --version 2>$null) -replace "git version ", ""
            } elseif ($Command -eq "ipfs") {
                $version = (ipfs version 2>$null)
            }
        } catch {}
        Write-Host "OK  $version" -ForegroundColor Green
        return $true
    } else {
        Write-Host "MISSING" -ForegroundColor Red
        Write-Host "    --> $InstallHint" -ForegroundColor Yellow
        return $false
    }
}

function Check-DockerCompose {
    Write-Host -NoNewline "  Checking docker compose (plugin) ... "
    $result = docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK  $result" -ForegroundColor Green
        return $true
    } else {
        Write-Host "MISSING" -ForegroundColor Red
        Write-Host "    --> Install Docker Desktop (includes Compose V2 plugin)" -ForegroundColor Yellow
        return $false
    }
}

function Invoke-Npm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $npmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
    if ($npmCmd) {
        & $npmCmd.Source @Arguments
    } else {
        npm @Arguments
    }
}

# ============================================================
# STEP 1 - Check Prerequisites
# ============================================================

Write-Host "STEP 1 - Checking prerequisites" -ForegroundColor Yellow
Write-Host ""

$allOk = $true

$allOk = (Check-Command "git"    "Git"     "https://git-scm.com/download/win") -and $allOk
$allOk = (Check-Command "node"   "Node.js" "https://nodejs.org/ (LTS recommended)") -and $allOk
$allOk = (Check-Command "npm"    "npm"     "Comes with Node.js") -and $allOk
$allOk = (Check-Command "docker" "Docker"  "https://www.docker.com/products/docker-desktop/") -and $allOk
$allOk = (Check-DockerCompose) -and $allOk

# Locate Fabric binaries (peer, configtxgen, osnadmin, fabric-ca-client)
$desktopPath = [System.Environment]::GetFolderPath("Desktop")
$searchCandidates = @()
if ($env:FABRIC_BIN_PATH) { $searchCandidates += $env:FABRIC_BIN_PATH }
$searchCandidates += (Join-Path $ProjectRoot "blockchain\fabric-samples\bin")
$searchCandidates += (Join-Path $ProjectRoot "..\fabric-samples\bin")
$searchCandidates += (Join-Path $desktopPath "fabric-samples\bin")

$foundFabricBin = $null
foreach ($cand in $searchCandidates) {
    if (Test-Path (Join-Path $cand "peer.exe")) {
        $foundFabricBin = $cand
        $env:PATH = "$cand;$env:PATH"
        break
    }
}

# Check peer
Write-Host -NoNewline "  Checking Fabric peer binary ... "
$peerCmd = Get-Command "peer" -ErrorAction SilentlyContinue
if ($peerCmd) {
    $peerVer = (& $peerCmd.Source version 2>$null | Select-String "Version:" | Select-Object -First 1).ToString().Trim()
    Write-Host "OK  $peerVer" -ForegroundColor Green
} else {
    Write-Host "MISSING" -ForegroundColor Red
    Write-Host "    --> Install Fabric binaries or set FABRIC_BIN_PATH." -ForegroundColor Yellow
    $allOk = $false
}

# Check configtxgen
Write-Host -NoNewline "  Checking configtxgen binary ... "
$cfgCmd = Get-Command "configtxgen" -ErrorAction SilentlyContinue
if ($cfgCmd) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "MISSING" -ForegroundColor Red
    Write-Host "    --> configtxgen is required for channel genesis block generation." -ForegroundColor Yellow
    $allOk = $false
}

# Check osnadmin
Write-Host -NoNewline "  Checking osnadmin binary ... "
$osnCmd = Get-Command "osnadmin" -ErrorAction SilentlyContinue
if ($osnCmd) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "MISSING" -ForegroundColor Red
    Write-Host "    --> osnadmin is required for orderer channel participation." -ForegroundColor Yellow
    $allOk = $false
}

# Check fabric-ca-client
Write-Host -NoNewline "  Checking fabric-ca-client binary ... "
$caCmd = Get-Command "fabric-ca-client" -ErrorAction SilentlyContinue
if ($caCmd) {
    $caVer = (& $caCmd.Source version 2>$null | Select-String "Version:" | Select-Object -First 1).ToString().Trim()
    Write-Host "OK  $caVer" -ForegroundColor Green
} else {
    Write-Host "MISSING" -ForegroundColor Red
    Write-Host "    --> fabric-ca-client is required for enrolling fresh identities." -ForegroundColor Yellow
    $allOk = $false
}

# Check IPFS (optional for setup, required for full app)
Write-Host -NoNewline "  Checking IPFS (Kubo) ... "
$ipfsCmd = Get-Command "ipfs" -ErrorAction SilentlyContinue
if (-not $ipfsCmd) {
    $ipfsCandidates = @("C:\ipfs\ipfs.exe", "$env:USERPROFILE\ipfs\ipfs.exe", "$env:LOCALAPPDATA\ipfs\ipfs.exe")
    foreach ($cand in $ipfsCandidates) {
        if (Test-Path $cand) {
            $ipfsDir = Split-Path $cand -Parent
            $env:PATH = "$ipfsDir;$env:PATH"
            $ipfsCmd = Get-Command "ipfs" -ErrorAction SilentlyContinue
            break
        }
    }
}
if ($ipfsCmd) {
    $ipfsVer = (ipfs version 2>$null)
    Write-Host "OK  $ipfsVer" -ForegroundColor Green
} else {
    Write-Host "NOT FOUND" -ForegroundColor Yellow
    Write-Host "    --> Download Kubo: https://dist.ipfs.tech/#kubo" -ForegroundColor Yellow
    Write-Host "    --> Extract ipfs.exe to C:\ipfs\ and add to PATH" -ForegroundColor Yellow
}

Write-Host ""

if (-not $allOk) {
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host "  Some required tools are MISSING. Install them and re-run." -ForegroundColor Red
    Write-Host "============================================================" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ============================================================
# STEP 2 - Check Docker is running
# ============================================================

Write-Host "STEP 2 - Checking Docker Desktop is running" -ForegroundColor Yellow
Write-Host ""

Write-Host -NoNewline "  docker ps ... "
$dockerPs = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "FAILED" -ForegroundColor Red
    Write-Host "  Docker Desktop is NOT running. Please start Docker Desktop and wait" -ForegroundColor Red
    Write-Host "  until it shows 'Docker Desktop is running', then re-run this script." -ForegroundColor Red
    Write-Host ""
    exit 1
}
Write-Host "OK" -ForegroundColor Green
Write-Host ""

# ============================================================
# STEP 3 - Install frontend dependencies
# ============================================================

Write-Host "STEP 3 - Installing frontend dependencies" -ForegroundColor Yellow
Write-Host ""

if (Test-Path "frontend\package.json") {
    Write-Host "  Running npm install in frontend/ ..." -ForegroundColor Gray
    Push-Location frontend
    Invoke-Npm install
    Pop-Location
    Write-Host "  Frontend dependencies ready." -ForegroundColor Green
} else {
    Write-Host "  WARNING: frontend\package.json not found." -ForegroundColor Yellow
}
Write-Host ""

# ============================================================
# STEP 4 - Install backend dependencies
# ============================================================

Write-Host "STEP 4 - Installing backend dependencies" -ForegroundColor Yellow
Write-Host ""

if (Test-Path "backend\package.json") {
    Write-Host "  Running npm install in backend/ ..." -ForegroundColor Gray
    Push-Location backend
    Invoke-Npm install
    Pop-Location
    Write-Host "  Backend dependencies ready." -ForegroundColor Green
} else {
    Write-Host "  WARNING: backend\package.json not found." -ForegroundColor Yellow
}
Write-Host ""

# ============================================================
# STEP 5 - Configure backend environment
# ============================================================

Write-Host "STEP 5 - Configuring backend environment" -ForegroundColor Yellow
Write-Host ""

$envFile    = "backend\.env"
$envExample = "backend\.env.example"

if (Test-Path $envFile) {
    Write-Host "  backend\.env already exists - preserving existing configuration." -ForegroundColor Green
} else {
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Host "  Created backend\.env from backend\.env.example" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: backend\.env.example not found." -ForegroundColor Yellow
    }
}
Write-Host ""

# ============================================================
# STEP 6 - Fabric Network Setup (Existing vs Fresh)
# ============================================================

Write-Host "STEP 6 - Checking Fabric Network State" -ForegroundColor Yellow
Write-Host ""

$networkDir = Join-Path $ProjectRoot "blockchain\sih-network"
$orgDir     = Join-Path $networkDir "organizations\peerOrganizations\bel.sih26125.local\msp"

if (Test-Path $orgDir) {
    Write-Host "  Existing Fabric organizations detected." -ForegroundColor Green
    Write-Host "  Preserving existing network, ledger, and identities." -ForegroundColor Green
    Write-Host "  To start your network, run: .\scripts\start-network.ps1" -ForegroundColor Gray
} else {
    Write-Host "  *** FRESH SETUP DETECTED ***" -ForegroundColor Yellow
    Write-Host "  Generating new Fabric organizations, identities, and genesis block..." -ForegroundColor Yellow
    Write-Host ""

    $genScript = Join-Path $networkDir "scripts\generate-identities.ps1"
    if (Test-Path $genScript) {
        & powershell -ExecutionPolicy Bypass -File "$genScript"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Fabric identity generation failed." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "ERROR: $genScript not found." -ForegroundColor Red
        exit 1
    }
}
Write-Host ""

# ============================================================
# STEP 7 - IPFS Repository Check
# ============================================================

Write-Host "STEP 7 - Checking IPFS repository" -ForegroundColor Yellow
Write-Host ""

$ipfsRepo = "$env:USERPROFILE\.ipfs"
if ($ipfsCmd) {
    if (Test-Path $ipfsRepo) {
        Write-Host "  IPFS repository found at: $ipfsRepo" -ForegroundColor Green
    } else {
        Write-Host "  Initializing local IPFS repository ..." -ForegroundColor Yellow
        ipfs init
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  IPFS initialized." -ForegroundColor Green
        }
    }
} else {
    Write-Host "  IPFS not found in PATH - install IPFS and run 'ipfs init'." -ForegroundColor Yellow
}
Write-Host ""

# ============================================================
# Done
# ============================================================

Write-Host "============================================================" -ForegroundColor Green
Write-Host "  ChainCoder Setup Complete." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Start Fabric Network (creates channel & deploys chaincode if fresh):" -ForegroundColor White
Write-Host "     powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Start IPFS Daemon:" -ForegroundColor White
Write-Host "     powershell -ExecutionPolicy Bypass -File .\scripts\start-ipfs.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Start Backend (in a new terminal):" -ForegroundColor White
Write-Host "     cd backend; npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  4. Start Frontend (in another terminal):" -ForegroundColor White
Write-Host "     cd frontend; npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  5. Run Health Check:" -ForegroundColor White
Write-Host "     powershell -ExecutionPolicy Bypass -File .\scripts\test-network.ps1" -ForegroundColor Gray
Write-Host ""
