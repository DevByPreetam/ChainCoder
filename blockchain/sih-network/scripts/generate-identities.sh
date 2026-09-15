#!/usr/bin/env bash
# ============================================================
# ChainCoder - Fabric Identity & Genesis Generation Script (Bash)
# blockchain/sih-network/scripts/generate-identities.sh
#
# DYNAMIC KEY RESOLUTION:
#   Zero hardcoded private key hashes. Newly enrolled keys (*_sk)
#   are dynamically detected and mapped to whatever filenames
#   the Docker Compose files expect.
# ============================================================

set -euo pipefail

# ------------------------------------------------------------
# 1. Robust Path Calculation
# ------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BLOCKCHAIN_DIR="$(cd "${NETWORK_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${BLOCKCHAIN_DIR}/.." && pwd)"

echo ""
echo "============================================================"
echo "  ChainCoder - Generating Fresh Fabric Network Identities"
echo "============================================================"
echo "  Project Root: ${PROJECT_ROOT}"
echo "  Network Dir:  ${NETWORK_DIR}"
echo ""

# ------------------------------------------------------------
# 2. Check Idempotency
# ------------------------------------------------------------
ORGS_DIR="${NETWORK_DIR}/organizations"
BEL_MSP_DIR="${ORGS_DIR}/peerOrganizations/bel.sih26125.local/msp"

if [ -d "${BEL_MSP_DIR}" ]; then
    echo "Fabric organizations already exist at: ${ORGS_DIR}"
    echo "Identities are already generated. Skipping regeneration."
    echo ""
    exit 0
fi

# ------------------------------------------------------------
# 3. Locate Fabric Binaries
# ------------------------------------------------------------
export PATH="${NETWORK_DIR}/../fabric-samples/bin:${PROJECT_ROOT}/blockchain/fabric-samples/bin:${PATH}"

if ! command -v fabric-ca-client &> /dev/null; then
    echo "ERROR: fabric-ca-client binary not found in PATH."
    exit 1
fi
if ! command -v configtxgen &> /dev/null; then
    echo "ERROR: configtxgen binary not found in PATH."
    exit 1
fi

echo "  Using fabric-ca-client: $(command -v fabric-ca-client)"
echo "  Using configtxgen:      $(command -v configtxgen)"
echo ""

# ------------------------------------------------------------
# 4. Check Docker & Ensure Docker Network Exists
# ------------------------------------------------------------
if ! docker ps &> /dev/null; then
    echo "ERROR: Docker Desktop is not running. Please start Docker first."
    exit 1
fi

if ! docker network ls --filter name=sih_network --format "{{.Name}}" | grep -q "sih_network"; then
    echo "Creating Docker network 'sih_network' ..."
    docker network create sih_network
fi

# ------------------------------------------------------------
# 5. Start Certificate Authorities
# ------------------------------------------------------------
echo "Starting Certificate Authorities ..."
cd "${NETWORK_DIR}"
docker compose -f docker/docker-compose-ca.yaml up -d
echo "Waiting for CAs to initialize ..."
sleep 8

# ------------------------------------------------------------
# Dynamic Key & Config Helpers
# ------------------------------------------------------------
PEER_COMPOSE="${NETWORK_DIR}/docker/docker-compose-peer.yaml"
NETWORK_COMPOSE="${NETWORK_DIR}/docker/docker-compose-network.yaml"

get_expected_tls_key_filename() {
    local compose_file="$1"
    local service_name="$2"
    grep -A 25 "${service_name}:" "${compose_file}" | grep "/keystore/" | head -n 1 | sed 's/.*\/keystore\///' | tr -d '" \r\n'
}

sync_fresh_tls_keys() {
    local tls_dir="$1"
    local compose_file="$2"
    local service_name="$3"

    local fresh_key
    fresh_key=$(find "${tls_dir}/keystore" -name "*_sk" | head -n 1)
    if [ -z "${fresh_key}" ]; then
        echo "ERROR: No generated private key (*_sk) found in ${tls_dir}/keystore"
        exit 1
    fi

    cp "${fresh_key}" "${tls_dir}/server.key"

    local expected_name
    expected_name=$(get_expected_tls_key_filename "${compose_file}" "${service_name}")
    if [ -n "${expected_name}" ] && [ "${expected_name}" != "$(basename "${fresh_key}")" ]; then
        cp "${fresh_key}" "${tls_dir}/keystore/${expected_name}"
    fi
}

write_nodeou() {
    local target_file="$1"
    local ca_cert_rel="$2"
    local enable="${3:-true}"
    mkdir -p "$(dirname "${target_file}")"
    cat > "${target_file}" <<EOF
NodeOUs:
  Enable: ${enable}

  ClientOUIdentifier:
    Certificate: ${ca_cert_rel}
    OrganizationalUnitIdentifier: client

  PeerOUIdentifier:
    Certificate: ${ca_cert_rel}
    OrganizationalUnitIdentifier: peer

  AdminOUIdentifier:
    Certificate: ${ca_cert_rel}
    OrganizationalUnitIdentifier: admin

  OrdererOUIdentifier:
    Certificate: ${ca_cert_rel}
    OrganizationalUnitIdentifier: orderer
EOF
}

register_identity() {
    local caname="$1"
    local id_name="$2"
    local id_secret="$3"
    local id_type="$4"
    local ca_cert="$5"
    set +e
    reg_out=$(fabric-ca-client register --caname "${caname}" --id.name "${id_name}" --id.secret "${id_secret}" --id.type "${id_type}" --tls.certfiles "${ca_cert}" 2>&1)
    reg_rc=$?
    set -e
    if [ ${reg_rc} -ne 0 ] && ! echo "${reg_out}" | grep -q "already registered"; then
        echo "ERROR: Failed to register ${id_name}: ${reg_out}"
        exit 1
    fi
}

# ============================================================
# 6. Generate BEL Organization (BELMSP)
# ============================================================
echo "--- Generating BEL Organization (BELMSP) ---"
BEL_ORG="${ORGS_DIR}/peerOrganizations/bel.sih26125.local"
BEL_CA_CERT="${ORGS_DIR}/fabric-ca/bel/ca-cert.pem"
export FABRIC_CA_CLIENT_HOME="${NETWORK_DIR}/.ca-admin/bel"

fabric-ca-client enroll -u https://admin:adminpw@localhost:7054 --caname BELCA --tls.certfiles "${BEL_CA_CERT}"

for item in "peer0:peer0pw:peer" "beladmin:beladminpw:admin" "belchanneladmin:belchanneladminpw:admin" "employee:employeepw:client" "manager:managerpw:client"; do
    IFS=":" read -r name secret otype <<< "$item"
    register_identity "BELCA" "$name" "$secret" "$otype" "${BEL_CA_CERT}"
done

fabric-ca-client enroll -u https://peer0:peer0pw@localhost:7054 --caname BELCA -M "${BEL_ORG}/peers/peer0.bel.sih26125.local/msp" --tls.certfiles "${BEL_CA_CERT}"
write_nodeou "${BEL_ORG}/peers/peer0.bel.sih26125.local/msp/config.yaml" "cacerts/localhost-7054-BELCA.pem"

fabric-ca-client enroll -u https://peer0:peer0pw@localhost:7054 --caname BELCA -M "${BEL_ORG}/peers/peer0.bel.sih26125.local/tls" --enrollment.profile tls --csr.hosts "peer0.bel.sih26125.local,localhost" --tls.certfiles "${BEL_CA_CERT}"

sync_fresh_tls_keys "${BEL_ORG}/peers/peer0.bel.sih26125.local/tls" "${PEER_COMPOSE}" "peer0.bel.sih26125.local"
cp "${BEL_ORG}/peers/peer0.bel.sih26125.local/tls/tlscacerts/"*.pem "${BEL_ORG}/peers/peer0.bel.sih26125.local/tls/tlscacerts/tls-localhost-7054.pem"

fabric-ca-client enroll -u https://beladmin:beladminpw@localhost:7054 --caname BELCA -M "${BEL_ORG}/users/beladmin/msp" --tls.certfiles "${BEL_CA_CERT}"
write_nodeou "${BEL_ORG}/users/beladmin/msp/config.yaml" "cacerts/localhost-7054-BELCA.pem"

mkdir -p "${NETWORK_DIR}/.msp-enroll/belchanneladmin/msp"
fabric-ca-client enroll -u https://belchanneladmin:belchanneladminpw@localhost:7054 --caname BELCA -M "${NETWORK_DIR}/.msp-enroll/belchanneladmin/msp" --tls.certfiles "${BEL_CA_CERT}"
write_nodeou "${NETWORK_DIR}/.msp-enroll/belchanneladmin/msp/config.yaml" "cacerts/localhost-7054-BELCA.pem"

for u in employee manager; do
    fabric-ca-client enroll -u "https://${u}:${u}pw@localhost:7054" --caname BELCA -M "${BEL_ORG}/users/${u}/msp" --tls.certfiles "${BEL_CA_CERT}"
    write_nodeou "${BEL_ORG}/users/${u}/msp/config.yaml" "cacerts/localhost-7054-BELCA.pem"
done

mkdir -p "${BEL_ORG}/msp/cacerts" "${BEL_ORG}/msp/tlscacerts"
cp "${BEL_CA_CERT}" "${BEL_ORG}/msp/cacerts/localhost-7054-BELCA.pem"
cp "${BEL_CA_CERT}" "${BEL_ORG}/msp/tlscacerts/tls-localhost-7054.pem"
write_nodeou "${BEL_ORG}/msp/config.yaml" "cacerts/localhost-7054-BELCA.pem"

mkdir -p "${PROJECT_ROOT}/backend/fabric/bel/msp"
cp -r "${NETWORK_DIR}/.msp-enroll/belchanneladmin/msp/"* "${PROJECT_ROOT}/backend/fabric/bel/msp/"
cp "${BEL_CA_CERT}" "${PROJECT_ROOT}/backend/fabric/bel/tls-ca.pem"

echo "  BEL Organization generated successfully."

# ============================================================
# 7. Generate Auditor Organization (AuditorMSP)
# ============================================================
echo "--- Generating Auditor Organization (AuditorMSP) ---"
AUD_ORG="${ORGS_DIR}/peerOrganizations/auditor.sih26125.local"
AUD_CA_CERT="${ORGS_DIR}/fabric-ca/auditor/ca-cert.pem"
export FABRIC_CA_CLIENT_HOME="${NETWORK_DIR}/.ca-admin/auditor"

fabric-ca-client enroll -u https://admin:adminpw@localhost:8054 --caname AuditorCA --tls.certfiles "${AUD_CA_CERT}"

for item in "peer0:peer0pw:peer" "auditoradmin:auditoradminpw:admin" "auditorchanneladmin:auditorchanneladminpw:admin" "auditor:auditorpw:client"; do
    IFS=":" read -r name secret otype <<< "$item"
    register_identity "AuditorCA" "$name" "$secret" "$otype" "${AUD_CA_CERT}"
done

fabric-ca-client enroll -u https://peer0:peer0pw@localhost:8054 --caname AuditorCA -M "${AUD_ORG}/peers/peer0.auditor.sih26125.local/msp" --tls.certfiles "${AUD_CA_CERT}"
write_nodeou "${AUD_ORG}/peers/peer0.auditor.sih26125.local/msp/config.yaml" "cacerts/localhost-8054-AuditorCA.pem"

fabric-ca-client enroll -u https://peer0:peer0pw@localhost:8054 --caname AuditorCA -M "${AUD_ORG}/peers/peer0.auditor.sih26125.local/tls" --enrollment.profile tls --csr.hosts "peer0.auditor.sih26125.local,localhost" --tls.certfiles "${AUD_CA_CERT}"

sync_fresh_tls_keys "${AUD_ORG}/peers/peer0.auditor.sih26125.local/tls" "${PEER_COMPOSE}" "peer0.auditor.sih26125.local"
cp "${AUD_ORG}/peers/peer0.auditor.sih26125.local/tls/tlscacerts/"*.pem "${AUD_ORG}/peers/peer0.auditor.sih26125.local/tls/tlscacerts/tls-localhost-8054.pem"

fabric-ca-client enroll -u https://auditor:auditorpw@localhost:8054 --caname AuditorCA -M "${AUD_ORG}/users/auditor/msp" --tls.certfiles "${AUD_CA_CERT}"
write_nodeou "${AUD_ORG}/users/auditor/msp/config.yaml" "cacerts/localhost-8054-AuditorCA.pem"

mkdir -p "${NETWORK_DIR}/.msp-enroll/auditorchanneladmin/msp"
fabric-ca-client enroll -u https://auditorchanneladmin:auditorchanneladminpw@localhost:8054 --caname AuditorCA -M "${NETWORK_DIR}/.msp-enroll/auditorchanneladmin/msp" --tls.certfiles "${AUD_CA_CERT}"
write_nodeou "${NETWORK_DIR}/.msp-enroll/auditorchanneladmin/msp/config.yaml" "cacerts/localhost-8054-AuditorCA.pem"

mkdir -p "${AUD_ORG}/msp/cacerts" "${AUD_ORG}/msp/tlscacerts"
cp "${AUD_CA_CERT}" "${AUD_ORG}/msp/cacerts/localhost-8054-AuditorCA.pem"
cp "${AUD_CA_CERT}" "${AUD_ORG}/msp/tlscacerts/tls-localhost-8054.pem"
write_nodeou "${AUD_ORG}/msp/config.yaml" "cacerts/localhost-8054-AuditorCA.pem"

echo "  Auditor Organization generated successfully."

# ============================================================
# 8. Generate Contractor Organization (ContractorMSP)
# ============================================================
echo "--- Generating Contractor Organization (ContractorMSP) ---"
CON_ORG="${ORGS_DIR}/peerOrganizations/contractor.sih26125.local"
CON_CA_CERT="${ORGS_DIR}/fabric-ca/contractor/ca-cert.pem"
export FABRIC_CA_CLIENT_HOME="${NETWORK_DIR}/.ca-admin/contractor"

fabric-ca-client enroll -u https://admin:adminpw@localhost:9054 --caname ContractorCA --tls.certfiles "${CON_CA_CERT}"

for item in "peer0:peer0pw:peer" "contractoradmin:contractoradminpw:admin" "contractorchanneladmin:contractorchanneladminpw:admin" "contractoruser:contractoruserpw:client"; do
    IFS=":" read -r name secret otype <<< "$item"
    register_identity "ContractorCA" "$name" "$secret" "$otype" "${CON_CA_CERT}"
done

fabric-ca-client enroll -u https://peer0:peer0pw@localhost:9054 --caname ContractorCA -M "${CON_ORG}/peers/peer0.contractor.sih26125.local/msp" --tls.certfiles "${CON_CA_CERT}"
write_nodeou "${CON_ORG}/peers/peer0.contractor.sih26125.local/msp/config.yaml" "cacerts/localhost-9054-ContractorCA.pem"

fabric-ca-client enroll -u https://peer0:peer0pw@localhost:9054 --caname ContractorCA -M "${CON_ORG}/peers/peer0.contractor.sih26125.local/tls" --enrollment.profile tls --csr.hosts "peer0.contractor.sih26125.local,localhost" --tls.certfiles "${CON_CA_CERT}"

sync_fresh_tls_keys "${CON_ORG}/peers/peer0.contractor.sih26125.local/tls" "${PEER_COMPOSE}" "peer0.contractor.sih26125.local"
cp "${CON_ORG}/peers/peer0.contractor.sih26125.local/tls/tlscacerts/"*.pem "${CON_ORG}/peers/peer0.contractor.sih26125.local/tls/tlscacerts/tls-localhost-9054.pem"

fabric-ca-client enroll -u https://contractoradmin:contractoradminpw@localhost:9054 --caname ContractorCA -M "${CON_ORG}/users/contractoradmin/msp" --tls.certfiles "${CON_CA_CERT}"
write_nodeou "${CON_ORG}/users/contractoradmin/msp/config.yaml" "cacerts/localhost-9054-ContractorCA.pem"

fabric-ca-client enroll -u https://contractoruser:contractoruserpw@localhost:9054 --caname ContractorCA -M "${CON_ORG}/users/contractoruser/msp" --tls.certfiles "${CON_CA_CERT}"
write_nodeou "${CON_ORG}/users/contractoruser/msp/config.yaml" "cacerts/localhost-9054-ContractorCA.pem"

mkdir -p "${NETWORK_DIR}/.msp-enroll/contractorchanneladmin/msp"
fabric-ca-client enroll -u https://contractorchanneladmin:contractorchanneladminpw@localhost:9054 --caname ContractorCA -M "${NETWORK_DIR}/.msp-enroll/contractorchanneladmin/msp" --tls.certfiles "${CON_CA_CERT}"
write_nodeou "${NETWORK_DIR}/.msp-enroll/contractorchanneladmin/msp/config.yaml" "cacerts/localhost-9054-ContractorCA.pem"

mkdir -p "${CON_ORG}/msp/cacerts" "${CON_ORG}/msp/tlscacerts"
cp "${CON_CA_CERT}" "${CON_ORG}/msp/cacerts/localhost-9054-ContractorCA.pem"
cp "${CON_CA_CERT}" "${CON_ORG}/msp/tlscacerts/tls-localhost-9054.pem"
write_nodeou "${CON_ORG}/msp/config.yaml" "cacerts/localhost-9054-ContractorCA.pem"

echo "  Contractor Organization generated successfully."

# ============================================================
# 9. Generate Orderer Organization (OrdererMSP)
# ============================================================
echo "--- Generating Orderer Organization (OrdererMSP) ---"
ORD_ORG="${ORGS_DIR}/ordererOrganizations/sih26125.local"
ORD_CA_CERT="${ORGS_DIR}/fabric-ca/orderer/ca-cert.pem"
export FABRIC_CA_CLIENT_HOME="${NETWORK_DIR}/.ca-admin/orderer"

fabric-ca-client enroll -u https://admin:adminpw@localhost:10054 --caname OrdererCA --tls.certfiles "${ORD_CA_CERT}"

for item in "orderer1:orderer1pw:orderer" "orderer2:orderer2pw:orderer" "orderer3:orderer3pw:orderer" "ordererAdmin:ordererAdminpw:admin"; do
    IFS=":" read -r name secret otype <<< "$item"
    register_identity "OrdererCA" "$name" "$secret" "$otype" "${ORD_CA_CERT}"
done

fabric-ca-client enroll -u https://ordererAdmin:ordererAdminpw@localhost:10054 --caname OrdererCA -M "${ORD_ORG}/users/Admin@sih26125.local/msp" --tls.certfiles "${ORD_CA_CERT}"
fabric-ca-client enroll -u https://ordererAdmin:ordererAdminpw@localhost:10054 --caname OrdererCA -M "${ORD_ORG}/users/Admin@sih26125.local/tls" --enrollment.profile tls --csr.hosts "localhost" --tls.certfiles "${ORD_CA_CERT}"

admin_key=$(find "${ORD_ORG}/users/Admin@sih26125.local/tls/keystore" -name "*_sk" | head -n 1)
if [ -n "${admin_key}" ]; then
    cp "${admin_key}" "${ORD_ORG}/users/Admin@sih26125.local/tls/server.key"
fi

for name in orderer1 orderer2 orderer3; do
    oDir="${ORD_ORG}/orderers/${name}.sih26125.local"
    fabric-ca-client enroll -u "https://${name}:${name}pw@localhost:10054" --caname OrdererCA -M "${oDir}/msp" --tls.certfiles "${ORD_CA_CERT}"
    fabric-ca-client enroll -u "https://${name}:${name}pw@localhost:10054" --caname OrdererCA -M "${oDir}/tls" --enrollment.profile tls --csr.hosts "${name}.sih26125.local,localhost" --tls.certfiles "${ORD_CA_CERT}"
    sync_fresh_tls_keys "${oDir}/tls" "${NETWORK_COMPOSE}" "${name}.sih26125.local"
    cp "${oDir}/tls/tlscacerts/"*.pem "${oDir}/tls/tlscacerts/tls-localhost-10054-OrdererCA.pem"
done

mkdir -p "${ORD_ORG}/msp/cacerts" "${ORD_ORG}/msp/tlscacerts" "${ORD_ORG}/msp/admincerts"
cp "${ORD_CA_CERT}" "${ORD_ORG}/msp/cacerts/localhost-10054-OrdererCA.pem"
cp "${ORD_CA_CERT}" "${ORD_ORG}/msp/tlscacerts/tls-localhost-10054-OrdererCA.pem"
cp "${ORD_ORG}/users/Admin@sih26125.local/msp/signcerts/cert.pem" "${ORD_ORG}/msp/admincerts/Admin@sih26125.local-cert.pem"
write_nodeou "${ORD_ORG}/msp/config.yaml" "cacerts/localhost-10054-OrdererCA.pem" "false"

echo "  Orderer Organization generated successfully."

# ============================================================
# 10. Generate Channel Genesis Block via configtxgen
# ============================================================
echo ""
echo "--- Generating Channel Genesis Block (configtxgen) ---"
export FABRIC_CFG_PATH="${NETWORK_DIR}/configtx"
cd "${NETWORK_DIR}/configtx"
configtxgen -profile SIH26125Channel -outputBlock "${NETWORK_DIR}/channel-genesis.block" -channelID sihchannel -configPath "${NETWORK_DIR}/configtx"

echo ""
echo "============================================================"
echo "  Fabric Identities & Genesis Block Generation Complete."
echo "============================================================"
echo ""
