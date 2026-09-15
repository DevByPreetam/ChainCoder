# ============================================================
# ChainCoder - Network Health Test
# scripts/test-network.ps1
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\test-network.ps1
#
# Tests:
#   1. Docker running
#   2. Fabric containers (CAs, orderers, peers)
#   3. IPFS API
#   4. Backend health endpoint
#   5. Blockchain test endpoint
# ============================================================

$ErrorActionPreference = "Continue"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ChainCoder - Network Health Test" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$allPassed = $true

function Write-Pass { param([string]$Label)
    Write-Host "  [PASS] $Label" -ForegroundColor Green
}

function Write-Fail { param([string]$Label, [string]$Hint = "")
    Write-Host "  [FAIL] $Label" -ForegroundColor Red
    if ($Hint) {
        Write-Host "         $Hint" -ForegroundColor Yellow
    }
    $script:allPassed = $false
}

function Write-Warn { param([string]$Label, [string]$Hint = "")
    Write-Host "  [WARN] $Label" -ForegroundColor Yellow
    if ($Hint) {
        Write-Host "         $Hint" -ForegroundColor Gray
    }
}

# ============================================================
# TEST 1 - Docker
# ============================================================

Write-Host "--- TEST 1: Docker ---" -ForegroundColor Yellow
$dockerResult = docker ps 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Pass "Docker"
} else {
    Write-Fail "Docker" "Start Docker Desktop and wait for it to be ready."
}
Write-Host ""

# ============================================================
# TEST 2 - Fabric Containers
# ============================================================

Write-Host "--- TEST 2: Fabric Containers ---" -ForegroundColor Yellow
$running = docker ps --format "{{.Names}}" 2>$null

$expectedContainers = @{
    "ca-bel"                           = "BEL Certificate Authority"
    "ca-auditor"                       = "Auditor Certificate Authority"
    "ca-contractor"                    = "Contractor Certificate Authority"
    "ca-orderer"                       = "Orderer Certificate Authority"
    "orderer1.sih26125.local"          = "Orderer 1 (Raft)"
    "orderer2.sih26125.local"          = "Orderer 2 (Raft)"
    "orderer3.sih26125.local"          = "Orderer 3 (Raft)"
    "peer0.bel.sih26125.local"         = "BEL Peer"
    "peer0.auditor.sih26125.local"     = "Auditor Peer"
    "peer0.contractor.sih26125.local"  = "Contractor Peer"
}

$fabricOk = $true
foreach ($container in $expectedContainers.Keys) {
    $desc = $expectedContainers[$container]
    if ($running -match [regex]::Escape($container)) {
        Write-Pass "$desc ($container)"
    } else {
        Write-Fail "$desc ($container)" "Run: powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1"
        $fabricOk = $false
    }
}

if ($fabricOk) {
    Write-Host ""
    Write-Pass "Fabric network - all containers running"
} else {
    Write-Host ""
    Write-Fail "Fabric network - some containers missing"
}
Write-Host ""

# ============================================================
# TEST 3 - IPFS
# ============================================================

Write-Host "--- TEST 3: IPFS ---" -ForegroundColor Yellow

$ipfsApiOk = $false
try {
    $ipfsResponse = Invoke-WebRequest -Uri "http://127.0.0.1:5001/api/v0/id" -Method POST -UserAgent "curl/7.68.0" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($ipfsResponse.StatusCode -eq 200) {
        $ipfsData = $ipfsResponse.Content | ConvertFrom-Json
        Write-Pass "IPFS API (http://127.0.0.1:5001/api/v0)"
        Write-Host "         Peer ID: $($ipfsData.ID)" -ForegroundColor Gray
        $ipfsApiOk = $true
    }
} catch {
    Write-Fail "IPFS API" "IPFS daemon is not running. Run: powershell -ExecutionPolicy Bypass -File .\scripts\start-ipfs.ps1"
}

# Test IPFS Gateway
if ($ipfsApiOk) {
    try {
        $gwResponse = Invoke-WebRequest -Uri "http://127.0.0.1:8080" -Method GET -TimeoutSec 5 -ErrorAction SilentlyContinue
        Write-Pass "IPFS Gateway (http://127.0.0.1:8080)"
    } catch {
        Write-Warn "IPFS Gateway" "Gateway may not be reachable, but API is working."
    }
}
Write-Host ""

# ============================================================
# TEST 4 - Backend Health
# ============================================================

Write-Host "--- TEST 4: Backend Health ---" -ForegroundColor Yellow

$backendRunning = $false
try {
    $healthResp = Invoke-WebRequest -Uri "http://localhost:5000/api/health" -Method GET -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($healthResp.StatusCode -eq 200) {
        $healthData = $healthResp.Content | ConvertFrom-Json
        if ($healthData.success -eq $true) {
            Write-Pass "Backend health (http://localhost:5000/api/health)"
            Write-Host "         Message: $($healthData.message)" -ForegroundColor Gray
            $backendRunning = $true
        } else {
            Write-Fail "Backend health" "Response received but success=false"
        }
    }
} catch {
    Write-Warn "Backend health" "Backend is not running. Start with: cd backend; npm run dev"
    Write-Host "         (Skipping blockchain test - backend required)" -ForegroundColor Gray
}
Write-Host ""

# ============================================================
# TEST 5 - Blockchain test (only if backend is running)
# ============================================================

Write-Host "--- TEST 5: Blockchain Test ---" -ForegroundColor Yellow

if (-not $backendRunning) {
    Write-Warn "Blockchain test" "Skipped - backend is not running."
} else {
    try {
        $bcResp = Invoke-WebRequest -Uri "http://localhost:5000/api/blockchain/test" -Method GET -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        if ($bcResp.StatusCode -eq 200) {
            $bcData = $bcResp.Content | ConvertFrom-Json
            if ($bcData.success -eq $true) {
                Write-Pass "Blockchain test (http://localhost:5000/api/blockchain/test)"
                Write-Host "         Response: $($bcResp.Content.Substring(0, [Math]::Min(120, $bcResp.Content.Length)))" -ForegroundColor Gray
            } else {
                Write-Fail "Blockchain test" "Response received but success=false. Check Fabric containers and backend/.env"
            }
        }
    } catch {
        $errMsg = $_.Exception.Message
        Write-Fail "Blockchain test" "Could not reach chaincode. Ensure Fabric is running and backend/.env is correct."
        Write-Host "         Error: $errMsg" -ForegroundColor Red
        Write-Host "         Troubleshooting:" -ForegroundColor Yellow
        Write-Host "           1. Check Fabric containers: docker ps" -ForegroundColor Yellow
        Write-Host "           2. Check BEL peer logs: docker logs peer0.bel.sih26125.local" -ForegroundColor Yellow
        Write-Host "           3. Check backend logs for Fabric connection errors" -ForegroundColor Yellow
        Write-Host "           4. Verify backend\.env has correct BEL_MSP_PATH and BEL_TLS_CA_PATH" -ForegroundColor Yellow
    }
}
Write-Host ""

# ============================================================
# Summary
# ============================================================

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($allPassed) {
    Write-Host "  All tests passed. ChainCoder is fully operational." -ForegroundColor Green
} else {
    Write-Host "  Some tests failed. See details above." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Quick reference:" -ForegroundColor Cyan
    Write-Host "    Start Fabric:   powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1" -ForegroundColor Gray
    Write-Host "    Start IPFS:     powershell -ExecutionPolicy Bypass -File .\scripts\start-ipfs.ps1" -ForegroundColor Gray
    Write-Host "    Start backend:  cd backend; npm run dev" -ForegroundColor Gray
    Write-Host "    Start frontend: cd frontend; npm run dev" -ForegroundColor Gray
}
Write-Host ""
