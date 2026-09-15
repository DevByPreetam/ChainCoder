# ============================================================
# ChainCoder - Start Fabric Network Script
# scripts/start-network.ps1
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1
#
# Idempotent Startup Flow:
#   1. Starts CAs (docker-compose-ca.yaml)
#   2. Starts Orderers (docker-compose-network.yaml)
#   3. Starts Peers (docker-compose-peer.yaml)
#   4. Checks Channel State:
#      - If "sihchannel" is NOT yet joined on peers: runs create-channel.ps1
#        and deploy-chaincode.ps1 (fresh network bootstrap).
#      - If "sihchannel" IS already joined and chaincode committed:
#        preserves existing state without re-executing lifecycle!
#   5. Verifies all 10 Fabric containers are running.
#
# IMPORTANT:
#   - Never uses "docker compose down -v"
#   - Preserves all Docker volumes and ledger data.
# ============================================================

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# 1. Robust Path Calculation
# ------------------------------------------------------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$NetworkDir  = Join-Path $ProjectRoot "blockchain\sih-network"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ChainCoder - Starting Fabric Network" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Project Root: $ProjectRoot" -ForegroundColor Gray
Write-Host "  Network Dir:  $NetworkDir" -ForegroundColor Gray
Write-Host ""

# ------------------------------------------------------------
# 2. Check Docker
# ------------------------------------------------------------
Write-Host "Checking Docker ..." -ForegroundColor Yellow
$dockerPs = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker Desktop is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}
Write-Host "Docker is running." -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 3. Check if identities have been generated
# ------------------------------------------------------------
$orgDir = Join-Path $NetworkDir "organizations\peerOrganizations\bel.sih26125.local\msp"
if (-not (Test-Path $orgDir)) {
    Write-Host "Fabric organizations not found. Bootstrapping fresh network identities first..." -ForegroundColor Yellow
    $genScript = Join-Path $NetworkDir "scripts\generate-identities.ps1"
    if (Test-Path $genScript) {
        & powershell -ExecutionPolicy Bypass -File "$genScript"
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: Identity generation failed." -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "ERROR: Run .\scripts\setup-windows.ps1 first." -ForegroundColor Red
        exit 1
    }
}

# ------------------------------------------------------------
# 4. Ensure Docker network exists
# ------------------------------------------------------------
$netExists = docker network ls --filter name=sih_network --format "{{.Name}}" 2>$null
if ($netExists -notmatch "sih_network") {
    Write-Host "Creating Docker network: sih_network" -ForegroundColor Gray
    docker network create sih_network | Out-Null
}

# ------------------------------------------------------------
# 5. Start CAs
# ------------------------------------------------------------
Write-Host "STEP 1 - Starting Certificate Authorities ..." -ForegroundColor Yellow
Push-Location $NetworkDir
docker compose -f docker/docker-compose-ca.yaml up -d
Pop-Location
Write-Host "CAs started." -ForegroundColor Green
Start-Sleep -Seconds 3

# ------------------------------------------------------------
# 6. Start Orderers
# ------------------------------------------------------------
Write-Host "STEP 2 - Starting Orderers ..." -ForegroundColor Yellow
Push-Location $NetworkDir
docker compose -f docker/docker-compose-network.yaml up -d
Pop-Location
Write-Host "Orderers started." -ForegroundColor Green
Start-Sleep -Seconds 3

# ------------------------------------------------------------
# 7. Start Peers
# ------------------------------------------------------------
Write-Host "STEP 3 - Starting Peers ..." -ForegroundColor Yellow
Push-Location $NetworkDir
docker compose -f docker/docker-compose-peer.yaml up -d
Pop-Location
Write-Host "Peers started." -ForegroundColor Green
Start-Sleep -Seconds 4

# ------------------------------------------------------------
# 8. Check Channel & Chaincode State (Idempotent)
# ------------------------------------------------------------
Write-Host "STEP 4 - Checking channel & chaincode state ..." -ForegroundColor Yellow

$desktopPath = [System.Environment]::GetFolderPath("Desktop")
$searchCandidates = @()
if ($env:FABRIC_BIN_PATH) { $searchCandidates += $env:FABRIC_BIN_PATH }
$searchCandidates += (Join-Path $ProjectRoot "blockchain\fabric-samples\bin")
$searchCandidates += (Join-Path $ProjectRoot "..\fabric-samples\bin")
$searchCandidates += (Join-Path $desktopPath "fabric-samples\bin")

$peerExe = $null
$onPathPeer = Get-Command "peer" -ErrorAction SilentlyContinue
if ($onPathPeer) { $peerExe = $onPathPeer.Source }
foreach ($cand in $searchCandidates) {
    if (-not $peerExe -and (Test-Path (Join-Path $cand "peer.exe"))) {
        $peerExe = Join-Path $cand "peer.exe"
        $env:PATH = "$cand;$env:PATH"
        break
    }
}

if (-not $peerExe) {
    Write-Host "WARNING: peer binary not found. Cannot verify channel or chaincode state directly." -ForegroundColor Yellow
} else {
    $fabricCfg = Join-Path $NetworkDir "..\fabric-samples\config"
    if (-not (Test-Path $fabricCfg)) {
        $fabricCfg = Join-Path $ProjectRoot "blockchain\fabric-samples\config"
    }
    if (Test-Path $fabricCfg) { $env:FABRIC_CFG_PATH = $fabricCfg }

    $env:CORE_PEER_LOCALMSPID = "BELMSP"
    $env:CORE_PEER_ADDRESS = "localhost:7051"
    $env:CORE_PEER_TLS_ENABLED = "true"
    $env:CORE_PEER_TLS_ROOTCERT_FILE = Join-Path $NetworkDir "organizations\peerOrganizations\bel.sih26125.local\peers\peer0.bel.sih26125.local\tls\tlscacerts\tls-localhost-7054.pem"
    $env:CORE_PEER_MSPCONFIGPATH = Join-Path $NetworkDir ".msp-enroll\belchanneladmin\msp"

    $channelList = & $peerExe channel list 2>&1

    if ($channelList -notmatch "sihchannel") {
        Write-Host "  Channel 'sihchannel' not yet joined. Running channel creation..." -ForegroundColor Yellow
        $createChanScript = Join-Path $NetworkDir "scripts\create-channel.ps1"
        if (Test-Path $createChanScript) {
            & powershell -ExecutionPolicy Bypass -File "$createChanScript"
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Channel creation failed." -ForegroundColor Red
                exit 1
            }
        }

        Write-Host "  Deploying chaincode 'sih-contract' ..." -ForegroundColor Yellow
        $deployCcScript = Join-Path $NetworkDir "scripts\deploy-chaincode.ps1"
        if (Test-Path $deployCcScript) {
            & powershell -ExecutionPolicy Bypass -File "$deployCcScript"
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Chaincode deployment failed." -ForegroundColor Red
                exit 1
            }
        }
    } else {
        Write-Host "  Channel 'sihchannel' is already joined on peers." -ForegroundColor Green

        # Check if chaincode is committed
        $committedCheck = & $peerExe lifecycle chaincode querycommitted --channelID sihchannel --name sih-contract 2>&1
        if ($committedCheck -notmatch "sih-contract") {
            Write-Host "  Chaincode 'sih-contract' not yet committed. Deploying now..." -ForegroundColor Yellow
            $deployCcScript = Join-Path $NetworkDir "scripts\deploy-chaincode.ps1"
            if (Test-Path $deployCcScript) {
                & powershell -ExecutionPolicy Bypass -File "$deployCcScript"
            }
        } else {
            Write-Host "  Chaincode 'sih-contract' is already committed. Preserving existing state." -ForegroundColor Green
        }
    }
}

# ------------------------------------------------------------
# 9. Verify All 10 Containers
# ------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Running Containers:" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Write-Host ""

$running = docker ps --format "{{.Names}}" 2>$null
$expected = @(
    "ca-bel", "ca-auditor", "ca-contractor", "ca-orderer",
    "orderer1.sih26125.local", "orderer2.sih26125.local", "orderer3.sih26125.local",
    "peer0.bel.sih26125.local", "peer0.auditor.sih26125.local", "peer0.contractor.sih26125.local"
)

$allRunning = $true
foreach ($container in $expected) {
    if ($running -match [regex]::Escape($container)) {
        Write-Host "  [OK] $container" -ForegroundColor Green
    } else {
        Write-Host "  [!!] $container - NOT running" -ForegroundColor Yellow
        $allRunning = $false
    }
}

Write-Host ""
if ($allRunning) {
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "  Fabric Network is fully active and operational." -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
} else {
    Write-Host "WARNING: Some containers are missing. Run 'docker logs <name>'." -ForegroundColor Yellow
}
Write-Host ""
