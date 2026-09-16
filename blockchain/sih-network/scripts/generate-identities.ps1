# ============================================================
# ChainCoder - Fabric Identity & Genesis Generation Script
# blockchain/sih-network/scripts/generate-identities.ps1
#
# Generates fresh cryptographic material and MSPs for:
#   - BEL Organization (BELMSP)
#   - Auditor Organization (AuditorMSP)
#   - Contractor Organization (ContractorMSP)
#   - Orderer Organization (OrdererMSP)
#
# Then generates channel genesis block (channel-genesis.block)
# via configtxgen for profile "SIH26125Channel".
#
# DYNAMIC KEY RESOLUTION:
#   Zero hardcoded private key hashes. Newly enrolled keys (*_sk)
#   are dynamically detected and mapped to whatever filenames
#   the Docker Compose files expect.
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
Write-Host "  ChainCoder - Generating Fresh Fabric Network Identities" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Project Root: $ProjectRoot" -ForegroundColor Gray
Write-Host "  Network Dir:  $NetworkDir" -ForegroundColor Gray
Write-Host ""

# ------------------------------------------------------------
# 2. Check Idempotency - Do not regenerate if already exists
# ------------------------------------------------------------
$OrgsDir = Join-Path $NetworkDir "organizations"
$belMspDir = Join-Path $OrgsDir "peerOrganizations\bel.sih26125.local\msp"

if (Test-Path $belMspDir) {
    Write-Host "Fabric organizations already exist at: $OrgsDir" -ForegroundColor Green
    Write-Host "Identities are already generated. Skipping regeneration." -ForegroundColor Green
    Write-Host ""
    exit 0
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

$caClientExe    = $null
$configtxgenExe = $null

$onPathCa = Get-Command "fabric-ca-client" -ErrorAction SilentlyContinue
if ($onPathCa) { $caClientExe = $onPathCa.Source }

$onPathCfg = Get-Command "configtxgen" -ErrorAction SilentlyContinue
if ($onPathCfg) { $configtxgenExe = $onPathCfg.Source }

foreach ($dir in $searchDirs) {
    if (-not $caClientExe -and (Test-Path (Join-Path $dir "fabric-ca-client.exe"))) {
        $caClientExe = Join-Path $dir "fabric-ca-client.exe"
    }
    if (-not $configtxgenExe -and (Test-Path (Join-Path $dir "configtxgen.exe"))) {
        $configtxgenExe = Join-Path $dir "configtxgen.exe"
    }
}

if (-not $caClientExe) {
    Write-Host "ERROR: fabric-ca-client binary not found." -ForegroundColor Red
    Write-Host "Please install Fabric CA client or set FABRIC_BIN_PATH." -ForegroundColor Yellow
    exit 1
}
if (-not $configtxgenExe) {
    Write-Host "ERROR: configtxgen binary not found." -ForegroundColor Red
    Write-Host "Please install Fabric binaries or set FABRIC_BIN_PATH." -ForegroundColor Yellow
    exit 1
}

$binDir = Split-Path -Parent $caClientExe
$env:PATH = "$binDir;$env:PATH"

Write-Host "  Using fabric-ca-client: $caClientExe" -ForegroundColor Green
Write-Host "  Using configtxgen:      $configtxgenExe" -ForegroundColor Green
Write-Host ""

# ------------------------------------------------------------
# 4. Check Docker is Running & Ensure Docker Network Exists
# ------------------------------------------------------------
$dockerCheck = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker Desktop is not running. Please start Docker first." -ForegroundColor Red
    exit 1
}

$netExists = docker network ls --filter name=sih_network --format "{{.Name}}" 2>$null
if ($netExists -notmatch "sih_network") {
    Write-Host "Creating Docker network 'sih_network' ..." -ForegroundColor Gray
    docker network create sih_network | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Failed to create Docker network 'sih_network'." -ForegroundColor Red
        exit 1
    }
}

# ------------------------------------------------------------
# 5. Start Certificate Authorities
# ------------------------------------------------------------
Write-Host "Starting Certificate Authorities ..." -ForegroundColor Yellow
Push-Location $NetworkDir
docker compose -f docker/docker-compose-ca.yaml up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to start CA containers." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "Waiting for CAs to initialize ..." -ForegroundColor Gray

function Wait-Port {
    param([int]$Port, [string]$Name, [int]$TimeoutSeconds = 30)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $asyncResult = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
            $success = $asyncResult.AsyncWaitHandle.WaitOne(1000)
            if ($success) {
                $client.EndConnect($asyncResult)
                $client.Close()
                Write-Host "  $Name (port $Port) is ready." -ForegroundColor Green
                return $true
            }
            $client.Close()
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    Write-Host "ERROR: $Name (port $Port) did not become ready within $TimeoutSeconds seconds." -ForegroundColor Red
    exit 1
}

Wait-Port -Port 7054  -Name "BEL CA"
Wait-Port -Port 8054  -Name "Auditor CA"
Wait-Port -Port 9054  -Name "Contractor CA"
Wait-Port -Port 10054 -Name "Orderer CA"
Write-Host ""

# ------------------------------------------------------------
# Dynamic Key & Config Helpers
# ------------------------------------------------------------

function Get-ExpectedTlsKeyFileName {
    param([string]$ComposeFilePath, [string]$ServiceName)
    if (-not (Test-Path $ComposeFilePath)) { return $null }
    $lines = Get-Content $ComposeFilePath
    $inService = $false
    foreach ($line in $lines) {
        if ($line -match "^\s{2}${ServiceName}:") { $inService = $true; continue }
        if ($inService -and $line -match "^\s{2}[a-zA-Z0-9_-]+:") { break }
        if ($inService -and ($line -match "/keystore/([^/""'\s]+)")) {
            return $matches[1].Trim()
        }
    }
    return $null
}

function Sync-FreshTlsKeys {
    param(
        [string]$TlsDir,
        [string]$ComposeFilePath,
        [string]$ServiceName
    )
    $keystoreDir = Join-Path $TlsDir "keystore"
    if (-not (Test-Path $keystoreDir)) {
        Write-Host "ERROR: Keystore directory not found at $keystoreDir" -ForegroundColor Red
        exit 1
    }
    $freshKey = Get-ChildItem -Path $keystoreDir -Filter "*_sk" | Select-Object -First 1
    if (-not $freshKey) {
        Write-Host "ERROR: No generated private key (*_sk) found in $keystoreDir" -ForegroundColor Red
        exit 1
    }
    # Always provide server.key
    Copy-Item -Path $freshKey.FullName -Destination (Join-Path $TlsDir "server.key") -Force

    # Dynamically map to the expected filename in Docker Compose
    $expectedKeyName = Get-ExpectedTlsKeyFileName -ComposeFilePath $ComposeFilePath -ServiceName $ServiceName
    if ($expectedKeyName -and ($expectedKeyName -ne $freshKey.Name)) {
        Copy-Item -Path $freshKey.FullName -Destination (Join-Path $keystoreDir $expectedKeyName) -Force
    }
}

function Write-NodeOUConfig {
    param([string]$FilePath, [string]$CaCertRelativePath, [bool]$Enable = $true)
    $content = @"
NodeOUs:
  Enable: $($Enable.ToString().ToLower())

  ClientOUIdentifier:
    Certificate: $CaCertRelativePath
    OrganizationalUnitIdentifier: client

  PeerOUIdentifier:
    Certificate: $CaCertRelativePath
    OrganizationalUnitIdentifier: peer

  AdminOUIdentifier:
    Certificate: $CaCertRelativePath
    OrganizationalUnitIdentifier: admin

  OrdererOUIdentifier:
    Certificate: $CaCertRelativePath
    OrganizationalUnitIdentifier: orderer
"@
    $parent = Split-Path -Parent $FilePath
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Set-Content -Path $FilePath -Value $content -Encoding UTF8
}

$peerComposeFile    = Join-Path $NetworkDir "docker\docker-compose-peer.yaml"
$networkComposeFile = Join-Path $NetworkDir "docker\docker-compose-network.yaml"

# ============================================================
# 6. Generate BEL Organization (BELMSP)
# ============================================================
Write-Host "--- Generating BEL Organization (BELMSP) ---" -ForegroundColor Yellow

$belOrgDir = Join-Path $OrgsDir "peerOrganizations\bel.sih26125.local"
$belCaCert = Join-Path $OrgsDir "fabric-ca\bel\ca-cert.pem"
$env:FABRIC_CA_CLIENT_HOME = Join-Path $NetworkDir ".ca-admin\bel"

# Enroll CA bootstrap admin
& $caClientExe enroll -u https://admin:adminpw@localhost:7054 --caname BELCA --tls.certfiles "$belCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll BEL CA admin." -ForegroundColor Red; exit 1 }

# Register identities
$belUsers = @(
    @{ Name="peer0"; Secret="peer0pw"; Type="peer" },
    @{ Name="beladmin"; Secret="beladminpw"; Type="admin" },
    @{ Name="belchanneladmin"; Secret="belchanneladminpw"; Type="admin" },
    @{ Name="employee"; Secret="employeepw"; Type="client" },
    @{ Name="manager"; Secret="managerpw"; Type="client" }
)
foreach ($id in $belUsers) {
    & $caClientExe register --caname BELCA --id.name $id.Name --id.secret $id.Secret --id.type $id.Type --tls.certfiles "$belCaCert" 2>$null
}

# Enroll peer0 (MSP)
$belPeerMsp = Join-Path $belOrgDir "peers\peer0.bel.sih26125.local\msp"
& $caClientExe enroll -u https://peer0:peer0pw@localhost:7054 --caname BELCA -M "$belPeerMsp" --tls.certfiles "$belCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll BEL peer0 MSP." -ForegroundColor Red; exit 1 }
Write-NodeOUConfig -FilePath (Join-Path $belPeerMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-7054-BELCA.pem"

# Enroll peer0 (TLS)
$belPeerTls = Join-Path $belOrgDir "peers\peer0.bel.sih26125.local\tls"
& $caClientExe enroll -u https://peer0:peer0pw@localhost:7054 --caname BELCA -M "$belPeerTls" --enrollment.profile tls --csr.hosts "peer0.bel.sih26125.local,localhost" --tls.certfiles "$belCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll BEL peer0 TLS." -ForegroundColor Red; exit 1 }

# Map newly enrolled TLS keys dynamically
Sync-FreshTlsKeys -TlsDir $belPeerTls -ComposeFilePath $peerComposeFile -ServiceName "peer0.bel.sih26125.local"

# Ensure TLS CA cert filename matches Compose
$belTlsCaCert = Get-ChildItem -Path (Join-Path $belPeerTls "tlscacerts") -Filter "*.pem" | Select-Object -First 1
if ($belTlsCaCert) {
    Copy-Item -Path $belTlsCaCert.FullName -Destination (Join-Path $belPeerTls "tlscacerts\tls-localhost-7054.pem") -Force
}

# Enroll beladmin (MSP)
$belAdminMsp = Join-Path $belOrgDir "users\beladmin\msp"
& $caClientExe enroll -u https://beladmin:beladminpw@localhost:7054 --caname BELCA -M "$belAdminMsp" --tls.certfiles "$belCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll beladmin." -ForegroundColor Red; exit 1 }
Write-NodeOUConfig -FilePath (Join-Path $belAdminMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-7054-BELCA.pem"

# Enroll belchanneladmin (MSP)
$belChanAdminMsp = Join-Path $NetworkDir ".msp-enroll\belchanneladmin\msp"
& $caClientExe enroll -u https://belchanneladmin:belchanneladminpw@localhost:7054 --caname BELCA -M "$belChanAdminMsp" --tls.certfiles "$belCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll belchanneladmin." -ForegroundColor Red; exit 1 }
Write-NodeOUConfig -FilePath (Join-Path $belChanAdminMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-7054-BELCA.pem"

# Enroll employee & manager
foreach ($u in @("employee", "manager")) {
    $uMsp = Join-Path $belOrgDir "users\$u\msp"
    & $caClientExe enroll -u https://${u}:${u}pw@localhost:7054 --caname BELCA -M "$uMsp" --tls.certfiles "$belCaCert"
    Write-NodeOUConfig -FilePath (Join-Path $uMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-7054-BELCA.pem"
}

# Set up BEL Org-level MSP
$belOrgMsp = Join-Path $belOrgDir "msp"
New-Item -ItemType Directory -Force -Path (Join-Path $belOrgMsp "cacerts") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $belOrgMsp "tlscacerts") | Out-Null
Copy-Item -Path $belCaCert -Destination (Join-Path $belOrgMsp "cacerts\localhost-7054-BELCA.pem") -Force
Copy-Item -Path $belCaCert -Destination (Join-Path $belOrgMsp "tlscacerts\tls-localhost-7054.pem") -Force
Write-NodeOUConfig -FilePath (Join-Path $belOrgMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-7054-BELCA.pem"

# Copy fresh BEL identity to backend/fabric/bel/
$backendBelMsp = Join-Path $ProjectRoot "backend\fabric\bel\msp"
New-Item -ItemType Directory -Force -Path $backendBelMsp | Out-Null
Copy-Item -Path (Join-Path $belChanAdminMsp "*") -Destination $backendBelMsp -Recurse -Force
Copy-Item -Path $belCaCert -Destination (Join-Path $ProjectRoot "backend\fabric\bel\tls-ca.pem") -Force

Write-Host "  BEL Organization generated successfully." -ForegroundColor Green

# ============================================================
# 7. Generate Auditor Organization (AuditorMSP)
# ============================================================
Write-Host "--- Generating Auditor Organization (AuditorMSP) ---" -ForegroundColor Yellow

$audOrgDir = Join-Path $OrgsDir "peerOrganizations\auditor.sih26125.local"
$audCaCert = Join-Path $OrgsDir "fabric-ca\auditor\ca-cert.pem"
$env:FABRIC_CA_CLIENT_HOME = Join-Path $NetworkDir ".ca-admin\auditor"

& $caClientExe enroll -u https://admin:adminpw@localhost:8054 --caname AuditorCA --tls.certfiles "$audCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll Auditor CA admin." -ForegroundColor Red; exit 1 }

$audUsers = @(
    @{ Name="peer0"; Secret="peer0pw"; Type="peer" },
    @{ Name="auditoradmin"; Secret="auditoradminpw"; Type="admin" },
    @{ Name="auditorchanneladmin"; Secret="auditorchanneladminpw"; Type="admin" },
    @{ Name="auditor"; Secret="auditorpw"; Type="client" }
)
foreach ($id in $audUsers) {
    & $caClientExe register --caname AuditorCA --id.name $id.Name --id.secret $id.Secret --id.type $id.Type --tls.certfiles "$audCaCert" 2>$null
}

$audPeerMsp = Join-Path $audOrgDir "peers\peer0.auditor.sih26125.local\msp"
& $caClientExe enroll -u https://peer0:peer0pw@localhost:8054 --caname AuditorCA -M "$audPeerMsp" --tls.certfiles "$audCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll Auditor peer0 MSP." -ForegroundColor Red; exit 1 }
Write-NodeOUConfig -FilePath (Join-Path $audPeerMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-8054-AuditorCA.pem"

$audPeerTls = Join-Path $audOrgDir "peers\peer0.auditor.sih26125.local\tls"
& $caClientExe enroll -u https://peer0:peer0pw@localhost:8054 --caname AuditorCA -M "$audPeerTls" --enrollment.profile tls --csr.hosts "peer0.auditor.sih26125.local,localhost" --tls.certfiles "$audCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll Auditor peer0 TLS." -ForegroundColor Red; exit 1 }

Sync-FreshTlsKeys -TlsDir $audPeerTls -ComposeFilePath $peerComposeFile -ServiceName "peer0.auditor.sih26125.local"

$audTlsCaCert = Get-ChildItem -Path (Join-Path $audPeerTls "tlscacerts") -Filter "*.pem" | Select-Object -First 1
if ($audTlsCaCert) {
    Copy-Item -Path $audTlsCaCert.FullName -Destination (Join-Path $audPeerTls "tlscacerts\tls-localhost-8054.pem") -Force
}

$audUserMsp = Join-Path $audOrgDir "users\auditor\msp"
& $caClientExe enroll -u https://auditor:auditorpw@localhost:8054 --caname AuditorCA -M "$audUserMsp" --tls.certfiles "$audCaCert"
Write-NodeOUConfig -FilePath (Join-Path $audUserMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-8054-AuditorCA.pem"

$audChanAdminMsp = Join-Path $NetworkDir ".msp-enroll\auditorchanneladmin\msp"
& $caClientExe enroll -u https://auditorchanneladmin:auditorchanneladminpw@localhost:8054 --caname AuditorCA -M "$audChanAdminMsp" --tls.certfiles "$audCaCert"
Write-NodeOUConfig -FilePath (Join-Path $audChanAdminMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-8054-AuditorCA.pem"

$audOrgMsp = Join-Path $audOrgDir "msp"
New-Item -ItemType Directory -Force -Path (Join-Path $audOrgMsp "cacerts") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $audOrgMsp "tlscacerts") | Out-Null
Copy-Item -Path $audCaCert -Destination (Join-Path $audOrgMsp "cacerts\localhost-8054-AuditorCA.pem") -Force
Copy-Item -Path $audCaCert -Destination (Join-Path $audOrgMsp "tlscacerts\tls-localhost-8054.pem") -Force
Write-NodeOUConfig -FilePath (Join-Path $audOrgMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-8054-AuditorCA.pem"

Write-Host "  Auditor Organization generated successfully." -ForegroundColor Green

# ============================================================
# 8. Generate Contractor Organization (ContractorMSP)
# ============================================================
Write-Host "--- Generating Contractor Organization (ContractorMSP) ---" -ForegroundColor Yellow

$conOrgDir = Join-Path $OrgsDir "peerOrganizations\contractor.sih26125.local"
$conCaCert = Join-Path $OrgsDir "fabric-ca\contractor\ca-cert.pem"
$env:FABRIC_CA_CLIENT_HOME = Join-Path $NetworkDir ".ca-admin\contractor"

& $caClientExe enroll -u https://admin:adminpw@localhost:9054 --caname ContractorCA --tls.certfiles "$conCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll Contractor CA admin." -ForegroundColor Red; exit 1 }

$conUsers = @(
    @{ Name="peer0"; Secret="peer0pw"; Type="peer" },
    @{ Name="contractoradmin"; Secret="contractoradminpw"; Type="admin" },
    @{ Name="contractorchanneladmin"; Secret="contractorchanneladminpw"; Type="admin" },
    @{ Name="contractoruser"; Secret="contractoruserpw"; Type="client" }
)
foreach ($id in $conUsers) {
    & $caClientExe register --caname ContractorCA --id.name $id.Name --id.secret $id.Secret --id.type $id.Type --tls.certfiles "$conCaCert" 2>$null
}

$conPeerMsp = Join-Path $conOrgDir "peers\peer0.contractor.sih26125.local\msp"
& $caClientExe enroll -u https://peer0:peer0pw@localhost:9054 --caname ContractorCA -M "$conPeerMsp" --tls.certfiles "$conCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll Contractor peer0 MSP." -ForegroundColor Red; exit 1 }
Write-NodeOUConfig -FilePath (Join-Path $conPeerMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-9054-ContractorCA.pem"

$conPeerTls = Join-Path $conOrgDir "peers\peer0.contractor.sih26125.local\tls"
& $caClientExe enroll -u https://peer0:peer0pw@localhost:9054 --caname ContractorCA -M "$conPeerTls" --enrollment.profile tls --csr.hosts "peer0.contractor.sih26125.local,localhost" --tls.certfiles "$conCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll Contractor peer0 TLS." -ForegroundColor Red; exit 1 }

Sync-FreshTlsKeys -TlsDir $conPeerTls -ComposeFilePath $peerComposeFile -ServiceName "peer0.contractor.sih26125.local"

$conTlsCaCert = Get-ChildItem -Path (Join-Path $conPeerTls "tlscacerts") -Filter "*.pem" | Select-Object -First 1
if ($conTlsCaCert) {
    Copy-Item -Path $conTlsCaCert.FullName -Destination (Join-Path $conPeerTls "tlscacerts\tls-localhost-9054.pem") -Force
}

$conAdminMsp = Join-Path $conOrgDir "users\contractoradmin\msp"
& $caClientExe enroll -u https://contractoradmin:contractoradminpw@localhost:9054 --caname ContractorCA -M "$conAdminMsp" --tls.certfiles "$conCaCert"
Write-NodeOUConfig -FilePath (Join-Path $conAdminMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-9054-ContractorCA.pem"

$conUserMsp = Join-Path $conOrgDir "users\contractoruser\msp"
& $caClientExe enroll -u https://contractoruser:contractoruserpw@localhost:9054 --caname ContractorCA -M "$conUserMsp" --tls.certfiles "$conCaCert"
Write-NodeOUConfig -FilePath (Join-Path $conUserMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-9054-ContractorCA.pem"

$conChanAdminMsp = Join-Path $NetworkDir ".msp-enroll\contractorchanneladmin\msp"
& $caClientExe enroll -u https://contractorchanneladmin:contractorchanneladminpw@localhost:9054 --caname ContractorCA -M "$conChanAdminMsp" --tls.certfiles "$conCaCert"
Write-NodeOUConfig -FilePath (Join-Path $conChanAdminMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-9054-ContractorCA.pem"

$conOrgMsp = Join-Path $conOrgDir "msp"
New-Item -ItemType Directory -Force -Path (Join-Path $conOrgMsp "cacerts") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $conOrgMsp "tlscacerts") | Out-Null
Copy-Item -Path $conCaCert -Destination (Join-Path $conOrgMsp "cacerts\localhost-9054-ContractorCA.pem") -Force
Copy-Item -Path $conCaCert -Destination (Join-Path $conOrgMsp "tlscacerts\tls-localhost-9054.pem") -Force
Write-NodeOUConfig -FilePath (Join-Path $conOrgMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-9054-ContractorCA.pem"

Write-Host "  Contractor Organization generated successfully." -ForegroundColor Green

# ============================================================
# 9. Generate Orderer Organization (OrdererMSP)
# ============================================================
Write-Host "--- Generating Orderer Organization (OrdererMSP) ---" -ForegroundColor Yellow

$ordOrgDir = Join-Path $OrgsDir "ordererOrganizations\sih26125.local"
$ordCaCert = Join-Path $OrgsDir "fabric-ca\orderer\ca-cert.pem"
$env:FABRIC_CA_CLIENT_HOME = Join-Path $NetworkDir ".ca-admin\orderer"

& $caClientExe enroll -u https://admin:adminpw@localhost:10054 --caname OrdererCA --tls.certfiles "$ordCaCert"
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to enroll Orderer CA admin." -ForegroundColor Red; exit 1 }

$ordUsers = @(
    @{ Name="orderer1"; Secret="orderer1pw"; Type="orderer" },
    @{ Name="orderer2"; Secret="orderer2pw"; Type="orderer" },
    @{ Name="orderer3"; Secret="orderer3pw"; Type="orderer" },
    @{ Name="ordererAdmin"; Secret="ordererAdminpw"; Type="admin" }
)
foreach ($id in $ordUsers) {
    & $caClientExe register --caname OrdererCA --id.name $id.Name --id.secret $id.Secret --id.type $id.Type --tls.certfiles "$ordCaCert" 2>$null
}

# Enroll Orderer Admin (MSP + TLS)
$ordAdminMsp = Join-Path $ordOrgDir "users\Admin@sih26125.local\msp"
& $caClientExe enroll -u https://ordererAdmin:ordererAdminpw@localhost:10054 --caname OrdererCA -M "$ordAdminMsp" --tls.certfiles "$ordCaCert"

$ordAdminTls = Join-Path $ordOrgDir "users\Admin@sih26125.local\tls"
& $caClientExe enroll -u https://ordererAdmin:ordererAdminpw@localhost:10054 --caname OrdererCA -M "$ordAdminTls" --enrollment.profile tls --csr.hosts "localhost" --tls.certfiles "$ordCaCert"

$adminKey = Get-ChildItem -Path (Join-Path $ordAdminTls "keystore") -Filter "*_sk" | Select-Object -First 1
if ($adminKey) {
    Copy-Item -Path $adminKey.FullName -Destination (Join-Path $ordAdminTls "server.key") -Force
}

# Enroll each Orderer
foreach ($name in @("orderer1", "orderer2", "orderer3")) {
    $targetDir = Join-Path $ordOrgDir "orderers\$name.sih26125.local"
    $oMsp = Join-Path $targetDir "msp"
    $oTls = Join-Path $targetDir "tls"

    & $caClientExe enroll -u "https://${name}:${name}pw@localhost:10054" --caname OrdererCA -M "$oMsp" --tls.certfiles "$ordCaCert"
    & $caClientExe enroll -u "https://${name}:${name}pw@localhost:10054" --caname OrdererCA -M "$oTls" --enrollment.profile tls --csr.hosts "$name.sih26125.local,localhost" --tls.certfiles "$ordCaCert"

    Sync-FreshTlsKeys -TlsDir $oTls -ComposeFilePath $networkComposeFile -ServiceName "$name.sih26125.local"

    $oTlsCa = Get-ChildItem -Path (Join-Path $oTls "tlscacerts") -Filter "*.pem" | Select-Object -First 1
    if ($oTlsCa) {
        Copy-Item -Path $oTlsCa.FullName -Destination (Join-Path $oTls "tlscacerts\tls-localhost-10054-OrdererCA.pem") -Force
    }
}

# Set up Orderer Org MSP
$ordOrgMsp = Join-Path $ordOrgDir "msp"
New-Item -ItemType Directory -Force -Path (Join-Path $ordOrgMsp "cacerts") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ordOrgMsp "tlscacerts") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $ordOrgMsp "admincerts") | Out-Null

Copy-Item -Path $ordCaCert -Destination (Join-Path $ordOrgMsp "cacerts\localhost-10054-OrdererCA.pem") -Force
Copy-Item -Path $ordCaCert -Destination (Join-Path $ordOrgMsp "tlscacerts\tls-localhost-10054-OrdererCA.pem") -Force
Copy-Item -Path (Join-Path $ordAdminMsp "signcerts\cert.pem") -Destination (Join-Path $ordOrgMsp "admincerts\Admin@sih26125.local-cert.pem") -Force
Write-NodeOUConfig -FilePath (Join-Path $ordOrgMsp "config.yaml") -CaCertRelativePath "cacerts/localhost-10054-OrdererCA.pem" -Enable $false

# Ensure contractor peer's mounted orderer TLS CA cert exists
$conPeerOrdererTlsCa = Join-Path $ordOrgMsp "tlscacerts\tls-localhost-10054-OrdererCA.pem"
if (-not (Test-Path $conPeerOrdererTlsCa)) {
    Copy-Item -Path $ordCaCert -Destination $conPeerOrdererTlsCa -Force
}

Write-Host "  Orderer Organization generated successfully." -ForegroundColor Green

# ============================================================
# 10. Generate Channel Genesis Block via configtxgen
# ============================================================
Write-Host ""
Write-Host "--- Generating Channel Genesis Block (configtxgen) ---" -ForegroundColor Yellow

$genesisBlock = Join-Path $NetworkDir "channel-genesis.block"
$configtxDir  = Join-Path $NetworkDir "configtx"

$env:FABRIC_CFG_PATH = $configtxDir

Push-Location $configtxDir
& $configtxgenExe -profile SIH26125Channel -outputBlock "$genesisBlock" -channelID sihchannel -configPath "$configtxDir"
$cfgExit = $LASTEXITCODE
Pop-Location

if ($cfgExit -ne 0 -or -not (Test-Path $genesisBlock)) {
    Write-Host "ERROR: configtxgen failed to create genesis block (Exit code $cfgExit)." -ForegroundColor Red
    exit 1
}

Write-Host "  channel-genesis.block created successfully." -ForegroundColor Green
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Fabric Identities & Genesis Block Generation Complete." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
