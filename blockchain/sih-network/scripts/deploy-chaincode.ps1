# ============================================================
# ChainCoder - Chaincode Packaging & Deployment Script
# blockchain/sih-network/scripts/deploy-chaincode.ps1
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\blockchain\sih-network\scripts\deploy-chaincode.ps1
#
# Arguments:
#   -Sequence: Lifecycle sequence (defaults to 1 for fresh networks)
#   -Version:  Chaincode version (defaults to "2.4")
#
# Steps:
#   1. Verifies if chaincode is already committed (idempotency)
#   2. Packages chaincode/sih-contract as sih-contract_2.4
#   3. Installs package on BEL, Auditor, and Contractor peers
#   4. Obtains Package ID dynamically from peer queryinstalled
#   5. Approves definition for BEL, Auditor, and Contractor
#   6. Checks commit readiness
#   7. Commits chaincode definition to sihchannel
#   8. Verifies committed definition
#   9. Runs a test query ("test") against chaincode and asserts output
# ============================================================

[CmdletBinding()]
param(
    [string]$FabricBinPath = "",
    [int]$Sequence = 13,
    [string]$Version = "3.3"
)

$ErrorActionPreference = "Continue"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

# ------------------------------------------------------------
# 1. Robust Path Calculation
# ------------------------------------------------------------
$ScriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$NetworkDir    = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$BlockchainDir = (Resolve-Path (Join-Path $NetworkDir "..")).Path
$ProjectRoot   = (Resolve-Path (Join-Path $BlockchainDir "..")).Path

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ChainCoder - Deploying Chaincode: sih-contract v$Version (Seq $Sequence)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Project Root: $ProjectRoot" -ForegroundColor Gray
Write-Host "  Network Dir:  $NetworkDir" -ForegroundColor Gray
Write-Host ""

# ------------------------------------------------------------
# 2. Locate Fabric peer binary & config
# ------------------------------------------------------------
$searchDirs = @()
if ($FabricBinPath) { $searchDirs += $FabricBinPath }
if ($env:FABRIC_BIN_PATH) { $searchDirs += $env:FABRIC_BIN_PATH }
$searchDirs += (Join-Path $ProjectRoot "blockchain\fabric-samples\bin")
$searchDirs += (Join-Path $ProjectRoot "..\fabric-samples\bin")
$searchDirs += (Join-Path $env:USERPROFILE "Desktop\fabric-samples\bin")

$peerExe = $null
$onPathPeer = Get-Command "peer" -ErrorAction SilentlyContinue
if ($onPathPeer) { $peerExe = $onPathPeer.Source }

foreach ($dir in $searchDirs) {
    if (-not $peerExe -and (Test-Path (Join-Path $dir "peer.exe"))) {
        $peerExe = Join-Path $dir "peer.exe"
    }
}

if (-not $peerExe) {
    Write-Host "ERROR: peer binary not found." -ForegroundColor Red
    exit 1
}

$binDir = Split-Path -Parent $peerExe
$env:PATH = "$binDir;$env:PATH"

$fabricCfg = Join-Path $NetworkDir "..\fabric-samples\config"
if (-not (Test-Path $fabricCfg)) {
    $fabricCfg = Join-Path $ProjectRoot "blockchain\fabric-samples\config"
}
if (Test-Path $fabricCfg) {
    $env:FABRIC_CFG_PATH = $fabricCfg
}

# ------------------------------------------------------------
# TLS & Admin Paths
# ------------------------------------------------------------
$ordererCaFile = Join-Path $NetworkDir "organizations\ordererOrganizations\sih26125.local\msp\tlscacerts\tls-localhost-10054-OrdererCA.pem"
$belTlsCert    = Join-Path $NetworkDir "organizations\peerOrganizations\bel.sih26125.local\peers\peer0.bel.sih26125.local\tls\tlscacerts\tls-localhost-7054.pem"
$audTlsCert    = Join-Path $NetworkDir "organizations\peerOrganizations\auditor.sih26125.local\peers\peer0.auditor.sih26125.local\tls\tlscacerts\tls-localhost-8054.pem"
$conTlsCert    = Join-Path $NetworkDir "organizations\peerOrganizations\contractor.sih26125.local\peers\peer0.contractor.sih26125.local\tls\tlscacerts\tls-localhost-9054.pem"

function Set-OrgEnv {
    param([string]$Org)
    switch ($Org) {
        "BEL" {
            $env:CORE_PEER_LOCALMSPID = "BELMSP"
            $env:CORE_PEER_ADDRESS = "localhost:7051"
            $env:CORE_PEER_TLS_ENABLED = "true"
            $env:CORE_PEER_TLS_ROOTCERT_FILE = $script:belTlsCert
            $env:CORE_PEER_MSPCONFIGPATH = Join-Path $script:NetworkDir ".msp-enroll\belchanneladmin\msp"
        }
        "Auditor" {
            $env:CORE_PEER_LOCALMSPID = "AuditorMSP"
            $env:CORE_PEER_ADDRESS = "localhost:8051"
            $env:CORE_PEER_TLS_ENABLED = "true"
            $env:CORE_PEER_TLS_ROOTCERT_FILE = $script:audTlsCert
            $env:CORE_PEER_MSPCONFIGPATH = Join-Path $script:NetworkDir ".msp-enroll\auditorchanneladmin\msp"
        }
        "Contractor" {
            $env:CORE_PEER_LOCALMSPID = "ContractorMSP"
            $env:CORE_PEER_ADDRESS = "localhost:9051"
            $env:CORE_PEER_TLS_ENABLED = "true"
            $env:CORE_PEER_TLS_ROOTCERT_FILE = $script:conTlsCert
            $env:CORE_PEER_MSPCONFIGPATH = Join-Path $script:NetworkDir ".msp-enroll\contractorchanneladmin\msp"
        }
    }
}

# ------------------------------------------------------------
# 3. Check Idempotency - Already Committed?
# ------------------------------------------------------------
Set-OrgEnv -Org "BEL"
$committedCheck = & $peerExe lifecycle chaincode querycommitted --channelID sihchannel --name sih-contract 2>&1
if ($committedCheck -match "Version: ${Version}") {
    Write-Host "Chaincode 'sih-contract' v$Version is already committed on sihchannel." -ForegroundColor Green
    Write-Host "Verifying chaincode query 'test' ..." -ForegroundColor Gray
    
    $testResult = & $peerExe chaincode query -C sihchannel -n sih-contract -c '{\"function\":\"test\",\"Args\":[]}' 2>&1
    if ($testResult -match "SIH26125 chaincode is working") {
        Write-Host "  [PASS] Chaincode is active and responding." -ForegroundColor Green
        Write-Host "  Response: $testResult" -ForegroundColor Gray
        exit 0
    }
}

# ------------------------------------------------------------
# 4. Package Chaincode
# ------------------------------------------------------------
Write-Host "STEP 1 - Packaging chaincode ..." -ForegroundColor Yellow

$ccSource = Join-Path $NetworkDir "chaincode\sih-contract"
$pkgFile  = Join-Path $NetworkDir "sih-contract.tar.gz"

if (-not (Test-Path (Join-Path $ccSource "package.json"))) {
    Write-Host "ERROR: Chaincode source not found at $ccSource" -ForegroundColor Red
    exit 1
}

Push-Location $NetworkDir
& $peerExe lifecycle chaincode package "$pkgFile" --path "chaincode/sih-contract" --lang node --label "sih-contract_$Version"
$pkgExit = $LASTEXITCODE
Pop-Location

if ($pkgExit -ne 0 -or -not (Test-Path $pkgFile)) {
    Write-Host "ERROR: Failed to package chaincode (Exit code $pkgExit)." -ForegroundColor Red
    exit 1
}
Write-Host "  Chaincode packaged: sih-contract.tar.gz" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 5. Install on All Peers
# ------------------------------------------------------------
Write-Host "STEP 2 - Installing chaincode on peers ..." -ForegroundColor Yellow

foreach ($org in @("BEL", "Auditor", "Contractor")) {
    Set-OrgEnv -Org $org
    Write-Host "  Checking $org peer ..." -ForegroundColor Gray
    
    $installed = & $peerExe lifecycle chaincode queryinstalled 2>&1
    if ($installed -match "sih-contract_${Version}:[a-f0-9]+") {
        Write-Host "    $org peer already has sih-contract_$Version installed." -ForegroundColor Green
    } else {
        Write-Host "    Installing on $org peer ..." -ForegroundColor Gray
        $instOut = & $peerExe lifecycle chaincode install "$pkgFile" 2>&1
        $instExit = $LASTEXITCODE
        if ($instExit -ne 0) {
            Write-Host "ERROR: Failed to install on $org peer: $instOut" -ForegroundColor Red
            exit 1
        }
        Write-Host "    Installed on $org peer successfully." -ForegroundColor Green
    }
}

# ------------------------------------------------------------
# 6. Extract Package ID Dynamically
# ------------------------------------------------------------
Write-Host ""
Write-Host "STEP 3 - Querying Package ID ..." -ForegroundColor Yellow

Set-OrgEnv -Org "BEL"
$installedOutput = & $peerExe lifecycle chaincode queryinstalled 2>&1
$packageId = $null

foreach ($line in $installedOutput) {
    if ($line -match "(sih-contract_${Version}:[a-f0-9]+)") {
        $packageId = $matches[1]
        break
    }
}

if (-not $packageId) {
    Write-Host "ERROR: Could not find Package ID for label 'sih-contract_$Version'." -ForegroundColor Red
    Write-Host "queryinstalled output: $installedOutput" -ForegroundColor Gray
    exit 1
}
Write-Host "  Discovered Package ID: $packageId" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 7. Approve for Each Organization
# ------------------------------------------------------------
Write-Host "STEP 4 - Approving chaincode definition (Sequence $Sequence) ..." -ForegroundColor Yellow

foreach ($org in @("BEL", "Auditor", "Contractor")) {
    Set-OrgEnv -Org $org
    Write-Host "  Approving for $org (Sequence $Sequence) ..." -ForegroundColor Gray
    
    $collectionsConfig = Join-Path $script:NetworkDir "chaincode\sih-contract\collections_config.json"
    $apprOut = & $peerExe lifecycle chaincode approveformyorg `
        -o localhost:7050 `
        --ordererTLSHostnameOverride orderer1.sih26125.local `
        --channelID sihchannel `
        --name sih-contract `
        --version "$Version" `
        --sequence $Sequence `
        --tls `
        --cafile "$ordererCaFile" `
        --collections-config "$collectionsConfig" `
        --package-id "$packageId" 2>&1
    $apprExit = $LASTEXITCODE

    if ($apprExit -ne 0 -and $apprOut -notmatch "already approved") {
        Write-Host "ERROR: Failed to approve chaincode for ${org}: $apprOut" -ForegroundColor Red
        exit 1
    }
    Write-Host "    $org approved successfully." -ForegroundColor Green
}

# ------------------------------------------------------------
# 8. Check Commit Readiness
# ------------------------------------------------------------
Write-Host ""
Write-Host "STEP 5 - Checking commit readiness ..." -ForegroundColor Yellow

Set-OrgEnv -Org "BEL"
$collectionsConfigCheck = Join-Path $NetworkDir "chaincode\sih-contract\collections_config.json"
$readiness = & $peerExe lifecycle chaincode checkcommitreadiness `
    --channelID sihchannel `
    --name sih-contract `
    --version "$Version" `
    --sequence $Sequence `
    --tls `
    --cafile "$ordererCaFile" `
    --collections-config "$collectionsConfigCheck" `
    --output json 2>&1

Write-Host "  Commit readiness: $readiness" -ForegroundColor Gray

if ($readiness -match '"BELMSP":\s*false' -or $readiness -match '"AuditorMSP":\s*false' -or $readiness -match '"ContractorMSP":\s*false') {
    Write-Host "ERROR: Not all organizations have approved the chaincode definition." -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------
# 9. Commit Chaincode Definition
# ------------------------------------------------------------
Write-Host ""
Write-Host "STEP 6 - Committing chaincode definition to sihchannel ..." -ForegroundColor Yellow

Set-OrgEnv -Org "BEL"
$collectionsConfig = Join-Path $NetworkDir "chaincode\sih-contract\collections_config.json"
$commitOut = & $peerExe lifecycle chaincode commit `
    -o localhost:7050 `
    --ordererTLSHostnameOverride orderer1.sih26125.local `
    --channelID sihchannel `
    --name sih-contract `
    --version "$Version" `
    --sequence $Sequence `
    --tls `
    --cafile "$ordererCaFile" `
    --collections-config "$collectionsConfig" `
    --peerAddresses localhost:7051 --tlsRootCertFiles "$belTlsCert" `
    --peerAddresses localhost:8051 --tlsRootCertFiles "$audTlsCert" `
    --peerAddresses localhost:9051 --tlsRootCertFiles "$conTlsCert" 2>&1
$commitExit = $LASTEXITCODE

if ($commitExit -ne 0 -and $commitOut -notmatch "already committed") {
    Write-Host "ERROR: Failed to commit chaincode definition: $commitOut" -ForegroundColor Red
    exit 1
}
Write-Host "  Chaincode definition committed successfully." -ForegroundColor Green

# ------------------------------------------------------------
# 10. Verify Committed Definition
# ------------------------------------------------------------
Write-Host ""
Write-Host "STEP 7 - Verifying committed definition ..." -ForegroundColor Yellow

$committedVerify = & $peerExe lifecycle chaincode querycommitted --channelID sihchannel --name sih-contract 2>&1
$committedVerifyStr = ($committedVerify | Out-String)
if ($committedVerifyStr -notmatch "Version: ${Version}") {
    Write-Host "ERROR: Verification failed: sih-contract v$Version is not committed on sihchannel." -ForegroundColor Red
    Write-Host "Output: $committedVerifyStr" -ForegroundColor Gray
    exit 1
}
Write-Host "  Committed definition verified: $committedVerify" -ForegroundColor Green

# ------------------------------------------------------------
# 11. Test Query Against Chaincode
# ------------------------------------------------------------
Write-Host ""
Write-Host "STEP 8 - Testing chaincode query 'test' ..." -ForegroundColor Yellow
Write-Host "  Waiting for chaincode container to start up (8s) ..." -ForegroundColor Gray
Start-Sleep -Seconds 8

$querySuccess = $false
for ($i = 1; $i -le 4; $i++) {
    Write-Host "  Invoking test query (attempt $i of 4) ..." -ForegroundColor Gray
    $testQuery = & $peerExe chaincode query -C sihchannel -n sih-contract -c '{\"function\":\"test\",\"Args\":[]}' 2>&1
    if (($testQuery | Out-String) -match "SIH26125 chaincode is working") {
        Write-Host "  [PASS] Chaincode response received:" -ForegroundColor Green
        Write-Host "         $testQuery" -ForegroundColor Green
        $querySuccess = $true
        break
    }
    Start-Sleep -Seconds 4
}

if (-not $querySuccess) {
    Write-Host "ERROR: Chaincode query test failed." -ForegroundColor Red
    Write-Host "Last output: $testQuery" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Chaincode sih-contract v$Version Successfully Deployed." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
