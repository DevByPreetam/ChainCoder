# ============================================================
# ChainCoder - Stop Fabric Network (safe - preserves volumes)
# scripts/stop-network.ps1
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\stop-network.ps1
#
# Stops Fabric containers WITHOUT deleting volumes or ledger data.
# Uses "docker compose stop" (not "down") so all data is preserved.
#
# NEVER uses: docker compose down -v
# NEVER uses: docker volume prune
# ============================================================

$ErrorActionPreference = "Stop"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
Set-Location $ProjectRoot

$NetworkDir = Join-Path $ProjectRoot "blockchain\sih-network"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ChainCoder - Stopping Fabric Network (data preserved)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "NOTE: Using 'docker compose stop' - your ledger data is SAFE." -ForegroundColor Green
Write-Host ""

# ============================================================
# STEP 1: Stop Peers first (reverse of startup order)
# ============================================================

Write-Host "STEP 1 - Stopping Peers ..." -ForegroundColor Yellow
Push-Location $NetworkDir
docker compose -f docker/docker-compose-peer.yaml stop
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Error stopping peers (may already be stopped)." -ForegroundColor Yellow
}
Pop-Location
Write-Host "Peers stopped." -ForegroundColor Green
Write-Host ""

# ============================================================
# STEP 2: Stop Orderers
# ============================================================

Write-Host "STEP 2 - Stopping Orderers ..." -ForegroundColor Yellow
Push-Location $NetworkDir
docker compose -f docker/docker-compose-network.yaml stop
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Error stopping orderers (may already be stopped)." -ForegroundColor Yellow
}
Pop-Location
Write-Host "Orderers stopped." -ForegroundColor Green
Write-Host ""

# ============================================================
# STEP 3: Stop CAs
# ============================================================

Write-Host "STEP 3 - Stopping Certificate Authorities ..." -ForegroundColor Yellow
Push-Location $NetworkDir
docker compose -f docker/docker-compose-ca.yaml stop
if ($LASTEXITCODE -ne 0) {
    Write-Host "  WARNING: Error stopping CAs (may already be stopped)." -ForegroundColor Yellow
}
Pop-Location
Write-Host "CAs stopped." -ForegroundColor Green
Write-Host ""

# ============================================================
# Show current state
# ============================================================

Write-Host "Current running containers:" -ForegroundColor Cyan
docker ps --format "table {{.Names}}`t{{.Status}}"
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Fabric network stopped. Ledger data preserved." -ForegroundColor Green
Write-Host "  To restart: powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
