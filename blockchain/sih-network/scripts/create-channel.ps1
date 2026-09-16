# ============================================================
# ChainCoder - Channel Creation & Peer Join Script
# blockchain/sih-network/scripts/create-channel.ps1
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\blockchain\sih-network\scripts\create-channel.ps1
#
# Steps:
#   1. Verifies channel-genesis.block exists.
#   2. Starts orderers and peers if not running.
#   3. Joins orderer1 (7053), orderer2 (8053), orderer3 (9053)
#      to "sihchannel" using osnadmin with mutual TLS.
#   4. Joins BEL, Auditor, and Contractor peers to "sihchannel".
#   5. Verifies all 3 peers successfully joined sihchannel.
# ============================================================

[CmdletBinding()]
param(
    [string]$FabricBinPath = ""
)

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------
# 1. Robust Path Calculation
# ------------------------------------------------------------
$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$NetworkDir    = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$BlockchainDir = (Resolve-Path (Join-Path $NetworkDir "..")).Path
$ProjectRoot   = (Resolve-Path (Join-Path $BlockchainDir "..")).Path

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ChainCoder - Creating & Joining Channel: sihchannel" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Project Root: $ProjectRoot" -ForegroundColor Gray
Write-Host "  Network Dir:  $NetworkDir" -ForegroundColor Gray
Write-Host ""

# ------------------------------------------------------------
# 2. Check Genesis Block Exists
# ------------------------------------------------------------
$genesisBlock = Join-Path $NetworkDir "channel-genesis.block"
if (-not (Test-Path $genesisBlock)) {
    Write-Host "ERROR: channel-genesis.block not found in $NetworkDir." -ForegroundColor Red
    Write-Host "You must run generate-identities.ps1 before creating the channel." -ForegroundColor Yellow
    exit 1
}

# ------------------------------------------------------------
# 3. Locate Fabric Binaries
# ------------------------------------------------------------
$searchDirs = @()
if ($FabricBinPath) { $searchDirs += $FabricBinPath }
if ($env:FABRIC_BIN_PATH) { $searchDirs += $env:FABRIC_BIN_PATH }
$searchDirs += (Join-Path $ProjectRoot "blockchain\fabric-samples\bin")
$searchDirs += (Join-Path $ProjectRoot "..\fabric-samples\bin")
$searchDirs += (Join-Path $env:USERPROFILE "Desktop\fabric-samples\bin")

$osnadminExe = $null
$peerExe     = $null

$onPathOsn = Get-Command "osnadmin" -ErrorAction SilentlyContinue
if ($onPathOsn) { $osnadminExe = $onPathOsn.Source }

$onPathPeer = Get-Command "peer" -ErrorAction SilentlyContinue
if ($onPathPeer) { $peerExe = $onPathPeer.Source }

foreach ($dir in $searchDirs) {
    if (-not $osnadminExe -and (Test-Path (Join-Path $dir "osnadmin.exe"))) {
        $osnadminExe = Join-Path $dir "osnadmin.exe"
    }
    if (-not $peerExe -and (Test-Path (Join-Path $dir "peer.exe"))) {
        $peerExe = Join-Path $dir "peer.exe"
    }
}

if (-not $osnadminExe) {
    Write-Host "ERROR: osnadmin binary not found." -ForegroundColor Red
    exit 1
}
if (-not $peerExe) {
    Write-Host "ERROR: peer binary not found." -ForegroundColor Red
    exit 1
}

$binDir = Split-Path -Parent $peerExe
$env:PATH = "$binDir;$env:PATH"

# ------------------------------------------------------------
# 4. Ensure Orderers and Peers are running
# ------------------------------------------------------------
Write-Host "Starting orderers and peers ..." -ForegroundColor Yellow
Push-Location $NetworkDir
docker compose -f docker/docker-compose-network.yaml up -d
docker compose -f docker/docker-compose-peer.yaml up -d
Pop-Location

Write-Host "Waiting for containers to initialize (6s) ..." -ForegroundColor Gray
Start-Sleep -Seconds 6

# ------------------------------------------------------------
# 5. Join Orderers to sihchannel via osnadmin
# ------------------------------------------------------------
Write-Host ""
Write-Host "--- Joining Orderers to Channel via osnadmin ---" -ForegroundColor Yellow

$ordOrgDir     = Join-Path $NetworkDir "organizations\ordererOrganizations\sih26125.local"
$ordAdminTls   = Join-Path $ordOrgDir "users\Admin@sih26125.local\tls"
$ordCaCert     = Join-Path $ordOrgDir "msp\tlscacerts\tls-localhost-10054-OrdererCA.pem"
$ordClientCert = Join-Path $ordAdminTls "signcerts\cert.pem"

# Dynamically locate client key
$ordClientKey = $null
$freshAdminKey = Get-ChildItem -Path (Join-Path $ordAdminTls "keystore") -Filter "*_sk" | Select-Object -First 1
if ($freshAdminKey) {
    $ordClientKey = $freshAdminKey.FullName
} elseif (Test-Path (Join-Path $ordAdminTls "server.key")) {
    $ordClientKey = Join-Path $ordAdminTls "server.key"
}

if (-not $ordClientKey) {
    Write-Host "ERROR: Orderer admin TLS client key not found in $ordAdminTls" -ForegroundColor Red
    exit 1
}

$ordererPorts = @(7053, 8053, 9053)
$ordNum = 1

foreach ($port in $ordererPorts) {
    Write-Host "  Checking orderer$ordNum (localhost:$port) ..." -ForegroundColor Gray
    
    $listResult = & $osnadminExe channel list -o "localhost:$port" --ca-file "$ordCaCert" --client-cert "$ordClientCert" --client-key "$ordClientKey" 2>&1
    if ($listResult -match "sihchannel") {
        Write-Host "    orderer$ordNum is already joined to sihchannel." -ForegroundColor Green
    } else {
        Write-Host "    Joining orderer$ordNum to sihchannel ..." -ForegroundColor Gray
        $joinOutput = & $osnadminExe channel join --channelID sihchannel --config-block "$genesisBlock" -o "localhost:$port" --ca-file "$ordCaCert" --client-cert "$ordClientCert" --client-key "$ordClientKey" 2>&1
        $joinExit = $LASTEXITCODE

        if ($joinExit -ne 0 -and ($joinOutput -notmatch "already joined" -and $joinOutput -notmatch "Status: 201")) {
            Write-Host "ERROR: Failed to join orderer$ordNum to sihchannel: $joinOutput" -ForegroundColor Red
            exit 1
        }
        Write-Host "    orderer$ordNum joined successfully." -ForegroundColor Green
    }
    $ordNum++
}

Write-Host "Waiting for Raft consensus to form (4s) ..." -ForegroundColor Gray
Start-Sleep -Seconds 4

# ------------------------------------------------------------
# 6. Join Peers to sihchannel
# ------------------------------------------------------------
Write-Host ""
Write-Host "--- Joining Peers to Channel ---" -ForegroundColor Yellow

$fabricCfg = Join-Path $NetworkDir "..\fabric-samples\config"
if (-not (Test-Path $fabricCfg)) {
    $fabricCfg = Join-Path $ProjectRoot "blockchain\fabric-samples\config"
}
if (Test-Path $fabricCfg) {
    $env:FABRIC_CFG_PATH = $fabricCfg
}

# Helper to join peer and verify
function Join-And-Verify-Peer {
    param(
        [string]$OrgName,
        [string]$MspId,
        [string]$Endpoint,
        [string]$TlsCaFile,
        [string]$AdminMspDir
    )
    Write-Host "  Checking $OrgName peer ($Endpoint) ..." -ForegroundColor Gray

    $env:CORE_PEER_LOCALMSPID = $MspId
    $env:CORE_PEER_ADDRESS = $Endpoint
    $env:CORE_PEER_TLS_ENABLED = "true"
    $env:CORE_PEER_TLS_ROOTCERT_FILE = $TlsCaFile
    $env:CORE_PEER_MSPCONFIGPATH = $AdminMspDir

    $channelList = & $script:peerExe channel list 2>&1
    if ($channelList -match "sihchannel") {
        Write-Host "    $OrgName peer is already joined to sihchannel." -ForegroundColor Green
    } else {
        Write-Host "    Joining $OrgName peer to sihchannel ..." -ForegroundColor Gray
        $joinOut = & $script:peerExe channel join -b "$script:genesisBlock" 2>&1
        $joinExit = $LASTEXITCODE

        if ($joinExit -ne 0 -and $joinOut -notmatch "already joined") {
            Write-Host "ERROR: Failed to join $OrgName peer to sihchannel: $joinOut" -ForegroundColor Red
            exit 1
        }
        Write-Host "    $OrgName peer joined successfully." -ForegroundColor Green
    }

    # Verify membership
    $verifyList = & $script:peerExe channel list 2>&1
    if ($verifyList -notmatch "sihchannel") {
        Write-Host "ERROR: Verification failed: $OrgName peer is NOT in sihchannel." -ForegroundColor Red
        Write-Host "Output: $verifyList" -ForegroundColor Gray
        exit 1
    }
}

# 6a. BEL Peer
Join-And-Verify-Peer -OrgName "BEL" `
    -MspId "BELMSP" `
    -Endpoint "localhost:7051" `
    -TlsCaFile (Join-Path $NetworkDir "organizations\peerOrganizations\bel.sih26125.local\peers\peer0.bel.sih26125.local\tls\tlscacerts\tls-localhost-7054.pem") `
    -AdminMspDir (Join-Path $NetworkDir ".msp-enroll\belchanneladmin\msp")

# 6b. Auditor Peer
Join-And-Verify-Peer -OrgName "Auditor" `
    -MspId "AuditorMSP" `
    -Endpoint "localhost:8051" `
    -TlsCaFile (Join-Path $NetworkDir "organizations\peerOrganizations\auditor.sih26125.local\peers\peer0.auditor.sih26125.local\tls\tlscacerts\tls-localhost-8054.pem") `
    -AdminMspDir (Join-Path $NetworkDir ".msp-enroll\auditorchanneladmin\msp")

# 6c. Contractor Peer
Join-And-Verify-Peer -OrgName "Contractor" `
    -MspId "ContractorMSP" `
    -Endpoint "localhost:9051" `
    -TlsCaFile (Join-Path $NetworkDir "organizations\peerOrganizations\contractor.sih26125.local\peers\peer0.contractor.sih26125.local\tls\tlscacerts\tls-localhost-9054.pem") `
    -AdminMspDir (Join-Path $NetworkDir ".msp-enroll\contractorchanneladmin\msp")

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Channel sihchannel Created & Verified on All Peers." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
