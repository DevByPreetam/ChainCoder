$ErrorActionPreference = [System.Management.Automation.ActionPreference]::Continue
$PSNativeCommandUseErrorActionPreference = $false

$peer = 'C:\ChainCoder\ChainCoder\blockchain\fabric-samples\bin\peer.exe'
$env:FABRIC_CFG_PATH = 'C:\ChainCoder\ChainCoder\blockchain\fabric-samples\config'
$netDir = 'C:\ChainCoder\ChainCoder\blockchain\sih-network'
$orgDir  = $netDir + '\organizations'
$ordCa  = $orgDir + '\ordererOrganizations\sih26125.local\msp\tlscacerts\tls-localhost-10054-OrdererCA.pem'
$belTls = $orgDir + '\peerOrganizations\bel.sih26125.local\peers\peer0.bel.sih26125.local\tls\tlscacerts\tls-localhost-7054.pem'
$audTls = $orgDir + '\peerOrganizations\auditor.sih26125.local\peers\peer0.auditor.sih26125.local\tls\tlscacerts\tls-localhost-8054.pem'
$conTls = $orgDir + '\peerOrganizations\contractor.sih26125.local\peers\peer0.contractor.sih26125.local\tls\tlscacerts\tls-localhost-9054.pem'
$belAdminMsp  = $orgDir + '\peerOrganizations\bel.sih26125.local\users\beladmin\msp'
$audAdminMsp  = $netDir + '\.msp-enroll\auditorchanneladmin\msp'
$conAdminMsp  = $orgDir + '\peerOrganizations\contractor.sih26125.local\users\contractoradmin\msp'
$policy  = 'OR(''BELMSP.peer'',''AuditorMSP.peer'',''ContractorMSP.peer'')'
$version = '2.4'
$sequence = 2

Write-Host 'Upgrading chaincode endorsement policy to OR(any org peer)...' -ForegroundColor Cyan

# Get package ID from BEL peer
$env:CORE_PEER_LOCALMSPID = 'BELMSP'
$env:CORE_PEER_MSPCONFIGPATH = $belAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:7051'
$env:CORE_PEER_TLS_ENABLED = 'true'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $belTls
$installed = & $peer lifecycle chaincode queryinstalled 2>&1
$pkgId = $null
foreach ($line in $installed) { if ($line -match '(sih-contract_2.4:[a-f0-9]+)') { $pkgId = $Matches[1]; break } }
Write-Host 'Package ID:' $pkgId

# Approve Seq2 for BEL
Write-Host 'Approving Seq2 for BEL...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'BELMSP'
$env:CORE_PEER_MSPCONFIGPATH = $belAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:7051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $belTls
$r = & $peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version $version --sequence $sequence --tls --cafile $ordCa --package-id $pkgId --signature-policy $policy 2>&1
Write-Host $r

# Approve Seq2 for Auditor
Write-Host 'Approving Seq2 for Auditor...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'AuditorMSP'
$env:CORE_PEER_MSPCONFIGPATH = $audAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:8051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $audTls
$r = & $peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version $version --sequence $sequence --tls --cafile $ordCa --package-id $pkgId --signature-policy $policy 2>&1
Write-Host $r

# Approve Seq2 for Contractor
Write-Host 'Approving Seq2 for Contractor...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'ContractorMSP'
$env:CORE_PEER_MSPCONFIGPATH = $conAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:9051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $conTls
$r = & $peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version $version --sequence $sequence --tls --cafile $ordCa --package-id $pkgId --signature-policy $policy 2>&1
Write-Host $r

# Commit Seq2
Write-Host 'Committing Seq2 with new policy...' -ForegroundColor Yellow
$env:CORE_PEER_LOCALMSPID = 'BELMSP'
$env:CORE_PEER_MSPCONFIGPATH = $belAdminMsp
$env:CORE_PEER_ADDRESS = 'localhost:7051'
$env:CORE_PEER_TLS_ROOTCERT_FILE = $belTls
$r = & $peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version $version --sequence $sequence --tls --cafile $ordCa --peerAddresses localhost:7051 --tlsRootCertFiles $belTls --peerAddresses localhost:8051 --tlsRootCertFiles $audTls --peerAddresses localhost:9051 --tlsRootCertFiles $conTls --signature-policy $policy 2>&1
Write-Host $r

# Verify
$v = & $peer lifecycle chaincode querycommitted --channelID sihchannel --name sih-contract 2>&1
Write-Host 'Verification:' $v -ForegroundColor Green
Write-Host 'DONE' -ForegroundColor Cyan
