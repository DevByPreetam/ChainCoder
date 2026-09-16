$ErrorActionPreference = [System.Management.Automation.ActionPreference]::Continue
$PSNativeCommandUseErrorActionPreference = $false

$peer = 'C:\ChainCoder\ChainCoder\blockchain\fabric-samples\bin\peer.exe'
$env:FABRIC_CFG_PATH = 'C:\ChainCoder\ChainCoder\blockchain\fabric-samples\config'
$netDir = 'C:\ChainCoder\ChainCoder\blockchain\sih-network'
$orgDir  = $netDir + '\organizations'
$ccDir   = $netDir + '\chaincode\sih-contract'
$ordCa   = $orgDir + '\ordererOrganizations\sih26125.local\msp\tlscacerts\tls-localhost-10054-OrdererCA.pem'
$belTls  = $orgDir + '\peerOrganizations\bel.sih26125.local\peers\peer0.bel.sih26125.local\tls\tlscacerts\tls-localhost-7054.pem'
$audTls  = $orgDir + '\peerOrganizations\auditor.sih26125.local\peers\peer0.auditor.sih26125.local\tls\tlscacerts\tls-localhost-8054.pem'
$conTls  = $orgDir + '\peerOrganizations\contractor.sih26125.local\peers\peer0.contractor.sih26125.local\tls\tlscacerts\tls-localhost-9054.pem'
$belAdminMsp  = $orgDir + '\peerOrganizations\bel.sih26125.local\users\beladmin\msp'
$audAdminMsp  = $netDir + '\.msp-enroll\auditorchanneladmin\msp'
$conAdminMsp  = $orgDir + '\peerOrganizations\contractor.sih26125.local\users\contractoradmin\msp'
$policy  = 'OR(''BELMSP.peer'',''AuditorMSP.peer'',''ContractorMSP.peer'')'
$version = '2.8'
$sequence = 6

Write-Host 'Packaging sih-contract v2.8 (NFT token alignment)...' -ForegroundColor Cyan
$env:CORE_PEER_LOCALMSPID = 'BELMSP'
$env:CORE_PEER_MSPCONFIGPATH = $belAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:7051'
$env:CORE_PEER_TLS_ENABLED = 'true'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $belTls
$pkgFile = Join-Path $netDir 'sih-contract_2.8.tar.gz'
Remove-Item -Force -ErrorAction SilentlyContinue $pkgFile
$r = & $peer lifecycle chaincode package $pkgFile --path $ccDir --lang node --label sih-contract_2.8 2>&1
Write-Host $r

Write-Host 'Installing on BEL peer...' -ForegroundColor Yellow
$r = & $peer lifecycle chaincode install $pkgFile 2>&1
Write-Host $r

Write-Host 'Installing on Auditor peer...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'AuditorMSP'
$env:CORE_PEER_MSPCONFIGPATH = $audAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:8051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $audTls
$r = & $peer lifecycle chaincode install $pkgFile 2>&1
Write-Host $r

Write-Host 'Installing on Contractor peer...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'ContractorMSP'
$env:CORE_PEER_MSPCONFIGPATH = $conAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:9051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $conTls
$r = & $peer lifecycle chaincode install $pkgFile 2>&1
Write-Host $r

# Get new package ID
$env:CORE_PEER_LOCALMSPID = 'BELMSP'
$env:CORE_PEER_MSPCONFIGPATH = $belAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:7051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $belTls
$installed = & $peer lifecycle chaincode queryinstalled 2>&1
$pkgId = $null
foreach ($line in $installed) { if ($line -match '(sih-contract_2.8:[a-f0-9]+)') { $pkgId = $Matches[1]; break } }
Write-Host 'New Package ID:' $pkgId -ForegroundColor Green

# Approve Seq6 for BEL
Write-Host 'Approving Seq6 for BEL...' -ForegroundColor Yellow
$r = & $peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version $version --sequence $sequence --tls --cafile $ordCa --package-id $pkgId --signature-policy $policy 2>&1
Write-Host $r

# Approve Seq6 for Auditor
Write-Host 'Approving Seq6 for Auditor...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'AuditorMSP'
$env:CORE_PEER_MSPCONFIGPATH = $audAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:8051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $audTls
$r = & $peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version $version --sequence $sequence --tls --cafile $ordCa --package-id $pkgId --signature-policy $policy 2>&1
Write-Host $r

# Approve Seq6 for Contractor
Write-Host 'Approving Seq6 for Contractor...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'ContractorMSP'
$env:CORE_PEER_MSPCONFIGPATH = $conAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:9051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $conTls
$r = & $peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version $version --sequence $sequence --tls --cafile $ordCa --package-id $pkgId --signature-policy $policy 2>&1
Write-Host $r

# Commit Seq6
Write-Host 'Committing Seq6...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'BELMSP'
$env:CORE_PEER_MSPCONFIGPATH = $belAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:7051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $belTls
$r = & $peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version $version --sequence $sequence --tls --cafile $ordCa --peerAddresses localhost:7051 --tlsRootCertFiles $belTls --peerAddresses localhost:8051 --tlsRootCertFiles $audTls --peerAddresses localhost:9051 --tlsRootCertFiles $conTls --signature-policy $policy 2>&1
Write-Host $r

# Verify commit
$v = & $peer lifecycle chaincode querycommitted --channelID sihchannel --name sih-contract 2>&1
Write-Host 'Verification:' $v -ForegroundColor Green
Write-Host 'DEPLOY DONE' -ForegroundColor Cyan
