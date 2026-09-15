#!/usr/bin/env bash
# ============================================================
# ChainCoder - Channel Creation & Peer Join Script (Bash)
# blockchain/sih-network/scripts/create-channel.sh
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

GENESIS_BLOCK="${NETWORK_DIR}/channel-genesis.block"
if [ ! -f "${GENESIS_BLOCK}" ]; then
    echo "ERROR: channel-genesis.block not found in ${NETWORK_DIR}."
    echo "Run generate-identities.sh first."
    exit 1
fi

echo "Starting orderers and peers ..."
cd "${NETWORK_DIR}"
docker compose -f docker/docker-compose-network.yaml up -d
docker compose -f docker/docker-compose-peer.yaml up -d
sleep 6

ORD_ORG_DIR="${NETWORK_DIR}/organizations/ordererOrganizations/sih26125.local"
ORD_ADMIN_TLS="${ORD_ORG_DIR}/users/Admin@sih26125.local/tls"
ORD_CA_CERT="${ORD_ORG_DIR}/msp/tlscacerts/tls-localhost-10054-OrdererCA.pem"
ORD_CLIENT_CERT="${ORD_ADMIN_TLS}/signcerts/cert.pem"

ORD_CLIENT_KEY=$(find "${ORD_ADMIN_TLS}/keystore" -name "*_sk" 2>/dev/null | head -n 1)
if [ -z "${ORD_CLIENT_KEY}" ] && [ -f "${ORD_ADMIN_TLS}/server.key" ]; then
    ORD_CLIENT_KEY="${ORD_ADMIN_TLS}/server.key"
fi

if [ -z "${ORD_CLIENT_KEY}" ]; then
    echo "ERROR: Orderer admin TLS key not found."
    exit 1
fi

echo "--- Joining Orderers to Channel via osnadmin ---"
for port in 7053 8053 9053; do
    echo "  Checking orderer on localhost:${port} ..."
    if osnadmin channel list -o "localhost:${port}" --ca-file "${ORD_CA_CERT}" --client-cert "${ORD_CLIENT_CERT}" --client-key "${ORD_CLIENT_KEY}" 2>&1 | grep -q "sihchannel"; then
        echo "    Orderer on localhost:${port} is already joined to sihchannel."
    else
        echo "    Joining orderer on localhost:${port} to sihchannel ..."
        join_out=$(osnadmin channel join --channelID sihchannel --config-block "${GENESIS_BLOCK}" -o "localhost:${port}" --ca-file "${ORD_CA_CERT}" --client-cert "${ORD_CLIENT_CERT}" --client-key "${ORD_CLIENT_KEY}" 2>&1)
        exit_code=$?
        if [ ${exit_code} -ne 0 ] && ! echo "${join_out}" | grep -q "already joined"; then
            echo "ERROR: Failed to join orderer on localhost:${port}: ${join_out}"
            exit 1
        fi
        echo "    Orderer on localhost:${port} joined successfully."
    fi
done

sleep 4

echo "--- Joining Peers to Channel ---"
export FABRIC_CFG_PATH="${PROJECT_ROOT}/blockchain/fabric-samples/config"

join_peer() {
    local org_name="$1"
    local msp_id="$2"
    local address="$3"
    local tls_cert="$4"
    local admin_msp="$5"

    echo "  Checking ${org_name} peer (${address}) ..."
    export CORE_PEER_LOCALMSPID="${msp_id}"
    export CORE_PEER_ADDRESS="${address}"
    export CORE_PEER_TLS_ENABLED="true"
    export CORE_PEER_TLS_ROOTCERT_FILE="${tls_cert}"
    export CORE_PEER_MSPCONFIGPATH="${admin_msp}"

    if peer channel list 2>&1 | grep -q "sihchannel"; then
        echo "    ${org_name} peer is already joined to sihchannel."
    else
        echo "    Joining ${org_name} peer to sihchannel ..."
        join_out=$(peer channel join -b "${GENESIS_BLOCK}" 2>&1)
        exit_code=$?
        if [ ${exit_code} -ne 0 ] && ! echo "${join_out}" | grep -q "already joined"; then
            echo "ERROR: Failed to join ${org_name} peer to sihchannel: ${join_out}"
            exit 1
        fi
        echo "    ${org_name} peer joined successfully."
    fi

    # Verify membership
    if ! peer channel list 2>&1 | grep -q "sihchannel"; then
        echo "ERROR: Verification failed: ${org_name} peer is NOT in sihchannel."
        exit 1
    fi
}

join_peer "BEL" "BELMSP" "localhost:7051" \
    "${NETWORK_DIR}/organizations/peerOrganizations/bel.sih26125.local/peers/peer0.bel.sih26125.local/tls/tlscacerts/tls-localhost-7054.pem" \
    "${NETWORK_DIR}/.msp-enroll/belchanneladmin/msp"

join_peer "Auditor" "AuditorMSP" "localhost:8051" \
    "${NETWORK_DIR}/organizations/peerOrganizations/auditor.sih26125.local/peers/peer0.auditor.sih26125.local/tls/tlscacerts/tls-localhost-8054.pem" \
    "${NETWORK_DIR}/.msp-enroll/auditorchanneladmin/msp"

join_peer "Contractor" "ContractorMSP" "localhost:9051" \
    "${NETWORK_DIR}/organizations/peerOrganizations/contractor.sih26125.local/peers/peer0.contractor.sih26125.local/tls/tlscacerts/tls-localhost-9054.pem" \
    "${NETWORK_DIR}/.msp-enroll/contractorchanneladmin/msp"

echo ""
echo "Channel sihchannel joined and verified on all peers."
