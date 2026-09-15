# ============================================================
# ChainCoder - DESTRUCTIVE RESET SCRIPT
# scripts/reset-network.ps1
#
# ⚠️⚠️⚠️ DANGER ZONE ⚠️⚠️⚠️
#
# This script is DESTRUCTIVE. It completely destroys:
#   - All Docker containers and volumes for Fabric
#   - All ledger data and transactions
#   - All CA databases and enrolled identities
#   - The generated organizations/ directory
#   - The generated .msp-enroll/ directory
#   - The channel-genesis.block
#
# NEVER run this script on a demonstration or production machine.
# Only run this if you intentionally want to start over from scratch.
# ============================================================

[CmdletBinding()]
param(
    [switch]$Force = $false
)

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = $PSScriptRoot }
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir "..")).Path
Set-Location $ProjectRoot

$NetworkDir = Join-Path $ProjectRoot "blockchain\sih-network"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Red
Write-Host "  ⚠️  DANGER: DESTRUCTIVE NETWORK RESET  ⚠️" -ForegroundColor Red
Write-Host "============================================================" -ForegroundColor Red
Write-Host ""
Write-Host "This will PERMANENTLY DELETE:" -ForegroundColor Red
Write-Host "  - All Fabric blockchain ledgers and history" -ForegroundColor Yellow
Write-Host "  - All CA databases and user certificates" -ForegroundColor Yellow
Write-Host "  - All Docker volumes (orderer1_data, peer data, etc.)" -ForegroundColor Yellow
Write-Host "  - blockchain\sih-network\organizations\" -ForegroundColor Yellow
Write-Host "  - blockchain\sih-network\.msp-enroll\" -ForegroundColor Yellow
Write-Host "  - blockchain\sih-network\channel-genesis.block" -ForegroundColor Yellow
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "Type 'DESTROY-ALL-DATA' to confirm reset"
    if ($confirm -ne "DESTROY-ALL-DATA") {
        Write-Host "Aborted. No changes made." -ForegroundColor Green
        exit 0
    }
}

Write-Host ""
Write-Host "Stopping and removing Fabric containers and volumes ..." -ForegroundColor Yellow

Push-Location $NetworkDir
docker compose -f docker/docker-compose-peer.yaml down -v 2>$null
docker compose -f docker/docker-compose-network.yaml down -v 2>$null
docker compose -f docker/docker-compose-ca.yaml down -v 2>$null
Pop-Location

Write-Host "Removing generated identity directories ..." -ForegroundColor Yellow
$toRemove = @(
    (Join-Path $NetworkDir "organizations"),
    (Join-Path $NetworkDir ".msp-enroll"),
    (Join-Path $NetworkDir ".ca-admin"),
    (Join-Path $NetworkDir ".tls-enroll"),
    (Join-Path $NetworkDir "channel-genesis.block"),
    (Join-Path $NetworkDir "sih-contract.tar.gz"),
    (Join-Path $ProjectRoot "backend\fabric\bel")
)

foreach ($item in $toRemove) {
    if (Test-Path $item) {
        Remove-Item -Path $item -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Removed: $item" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Network Reset Complete. All state has been wiped." -ForegroundColor Green
Write-Host "  To bootstrap a fresh network, run:" -ForegroundColor Cyan
Write-Host "    powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1" -ForegroundColor Gray
Write-Host "    powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
