#!/usr/bin/env bash
# ============================================================
# ChainCoder - Chaincode Packaging & Deployment Script (Bash)
# blockchain/sih-network/scripts/deploy-chaincode.sh
# ============================================================

set -euo pipefail

# ------------------------------------------------------------
# 1. Robust Path Calculation
# ------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BLOCKCHAIN_DIR="$(cd "${NETWORK_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${BLOCKCHAIN_DIR}/.." && pwd)"

export PATH="${NETWORK_DIR}/../fabric-samples/bin:${PROJECT_ROOT}/blockchain/fabric-samples/bin:${PATH}"
export FABRIC_CFG_PATH="${PROJECT_ROOT}/blockchain/fabric-samples/config"

VERSION="${1:-3.3}"
SEQUENCE="${2:-13}"

ORDERER_CA="${NETWORK_DIR}/organizations/ordererOrganizations/sih26125.local/msp/tlscacerts/tls-localhost-10054-OrdererCA.pem"
BEL_TLS_CERT="${NETWORK_DIR}/organizations/peerOrganizations/bel.sih26125.local/peers/peer0.bel.sih26125.local/tls/tlscacerts/tls-localhost-7054.pem"
AUD_TLS_CERT="${NETWORK_DIR}/organizations/peerOrganizations/auditor.sih26125.local/peers/peer0.auditor.sih26125.local/tls/tlscacerts/tls-localhost-8054.pem"
CON_TLS_CERT="${NETWORK_DIR}/organizations/peerOrganizations/contractor.sih26125.local/peers/peer0.contractor.sih26125.local/tls/tlscacerts/tls-localhost-9054.pem"

set_org() {
    local org="$1"
    case "$org" in
        "BEL")
            export CORE_PEER_LOCALMSPID="BELMSP"
            export CORE_PEER_ADDRESS="localhost:7051"
            export CORE_PEER_TLS_ENABLED="true"
            export CORE_PEER_TLS_ROOTCERT_FILE="${BEL_TLS_CERT}"
            export CORE_PEER_MSPCONFIGPATH="${NETWORK_DIR}/.msp-enroll/belchanneladmin/msp"
            ;;
        "Auditor")
            export CORE_PEER_LOCALMSPID="AuditorMSP"
            export CORE_PEER_ADDRESS="localhost:8051"
            export CORE_PEER_TLS_ENABLED="true"
            export CORE_PEER_TLS_ROOTCERT_FILE="${AUD_TLS_CERT}"
            export CORE_PEER_MSPCONFIGPATH="${NETWORK_DIR}/.msp-enroll/auditorchanneladmin/msp"
            ;;
        "Contractor")
            export CORE_PEER_LOCALMSPID="ContractorMSP"
            export CORE_PEER_ADDRESS="localhost:9051"
            export CORE_PEER_TLS_ENABLED="true"
            export CORE_PEER_TLS_ROOTCERT_FILE="${CON_TLS_CERT}"
            export CORE_PEER_MSPCONFIGPATH="${NETWORK_DIR}/.msp-enroll/contractorchanneladmin/msp"
            ;;
    esac
}

# Check if already committed
set_org "BEL"
if peer lifecycle chaincode querycommitted --channelID sihchannel --name sih-contract 2>&1 | grep -q "Version: ${VERSION}"; then
    echo "Chaincode 'sih-contract' v${VERSION} is already committed on sihchannel."
    if peer chaincode query -C sihchannel -n sih-contract -c '{"function":"test","Args":[]}' 2>&1 | grep -q "SIH26125 chaincode is working"; then
        echo "Chaincode test query verified successfully."
        exit 0
    fi
fi

# Package
echo "Packaging chaincode ..."
cd "${NETWORK_DIR}"
peer lifecycle chaincode package sih-contract.tar.gz --path chaincode/sih-contract --lang node --label "sih-contract_${VERSION}"

# Install on all peers
for org in "BEL" "Auditor" "Contractor"; do
    set_org "$org"
    echo "Checking ${org} peer ..."
    if ! peer lifecycle chaincode queryinstalled 2>&1 | grep -q "sih-contract_${VERSION}:[a-f0-9]*"; then
        echo "Installing on ${org} peer ..."
        peer lifecycle chaincode install sih-contract.tar.gz
    else
        echo "${org} peer already has sih-contract_${VERSION} installed."
    fi
done

# Extract Package ID
set_org "BEL"
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep -o "sih-contract_${VERSION}:[a-f0-9]*" | head -n 1)
if [ -z "${PACKAGE_ID}" ]; then
    echo "ERROR: Failed to retrieve Package ID."
    exit 1
fi
echo "Package ID: ${PACKAGE_ID}"

# Approve for each org
for org in "BEL" "Auditor" "Contractor"; do
    set_org "$org"
    echo "Approving for ${org} (Sequence ${SEQUENCE}) ..."
    set +e
    appr_out=$(peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version "${VERSION}" --sequence "${SEQUENCE}" --tls --cafile "${ORDERER_CA}" --package-id "${PACKAGE_ID}" 2>&1)
    appr_rc=$?
    set -e
    if [ ${appr_rc} -ne 0 ] && ! echo "${appr_out}" | grep -q "already approved"; then
        echo "ERROR: Approval failed for ${org}: ${appr_out}"
        exit 1
    fi
    echo "  ${org} approved."
done

# Check commit readiness
set_org "BEL"
readiness=$(peer lifecycle chaincode checkcommitreadiness --channelID sihchannel --name sih-contract --version "${VERSION}" --sequence "${SEQUENCE}" --tls --cafile "${ORDERER_CA}" --output json)
echo "Commit readiness: ${readiness}"
if echo "${readiness}" | grep -q '": false'; then
    echo "ERROR: Not all organizations have approved the chaincode."
    exit 1
fi

# Commit
echo "Committing definition ..."
set_org "BEL"
set +e
commit_out=$(peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer1.sih26125.local --channelID sihchannel --name sih-contract --version "${VERSION}" --sequence "${SEQUENCE}" --tls --cafile "${ORDERER_CA}" --peerAddresses localhost:7051 --tlsRootCertFiles "${BEL_TLS_CERT}" --peerAddresses localhost:8051 --tlsRootCertFiles "${AUD_TLS_CERT}" --peerAddresses localhost:9051 --tlsRootCertFiles "${CON_TLS_CERT}" 2>&1)
commit_rc=$?
set -e
if [ ${commit_rc} -ne 0 ] && ! echo "${commit_out}" | grep -q "already committed"; then
    echo "ERROR: Failed to commit chaincode: ${commit_out}"
    exit 1
fi

# Verify committed
echo "Verifying committed definition ..."
if ! peer lifecycle chaincode querycommitted --channelID sihchannel --name sih-contract 2>&1 | grep -q "Version: ${VERSION}"; then
    echo "ERROR: Verification failed: sih-contract v${VERSION} is not committed."
    exit 1
fi

echo "Waiting for chaincode container to initialize ..."
sleep 8

# Test query
query_res=$(peer chaincode query -C sihchannel -n sih-contract -c '{"function":"test","Args":[]}' 2>&1)
if echo "${query_res}" | grep -q "SIH26125 chaincode is working"; then
    echo "Chaincode test query passed!"
    echo "Response: ${query_res}"
else
    echo "ERROR: Chaincode test query failed: ${query_res}"
    exit 1
fi

echo ""
echo "Chaincode sih-contract v${VERSION} deployed and verified successfully."
