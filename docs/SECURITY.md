# ChainCoder Security Architecture & Defense Hardening (Milestone 3)

## 1. Executive Summary

ChainCoder is an enterprise-grade, defense-oriented digital asset tracking and verifiable identity platform built for Bharat Electronics Limited (BEL). This document provides the complete security specification for **Milestone 3: Advanced Security & Blockchain Hardening**, establishing defense-grade cryptographic guarantees, multi-party access enforcement, Private Data Collections (PDC), identity lifecycle management, and Hardware Security Module (HSM) readiness.

---

## 2. Fabric CA Identity Lifecycle & PKI

ChainCoder utilizes dedicated Hyperledger Fabric Certificate Authorities (CAs) for each network organization:
- **BELCA** (`ca-bel:7054`): Issues certificates for BEL defense personnel and administrators.
- **AuditorCA** (`ca-auditor:8054`): Issues compliance and inspection certificates for independent defense auditors.
- **ContractorCA** (`ca-contractor:9054`): Issues restricted vendor certificates for authorized contractors.

### 2.1 Enrollment, Registration & Revocation
- **Registration**: Performed strictly by authorized organizational administrators through `backend/src/services/caService.js` calling `fabric-ca-client register`.
- **Certificate Revocation**: When an identity is revoked, `fabric-ca-client revoke -e <identityId> -r cessationofoperation --gencrl` invalidates the X.509 certificate and immediately updates the organization's Certificate Revocation List (CRL).
- **CRL Generation**: The generated CRL is stored at `msp/crls/crl.pem` and synchronized with peer MSP validation stores.
- **Dual-Layer Revocation**: Revocation is anchored both on the Fabric distributed ledger (`status: 'REVOKED'`) and in the Fabric CA PKI layer. Login attempts and transaction proposals by revoked identities are blocked immediately with HTTP `401/403` and chaincode execution denials.

---

## 3. Hyperledger Fabric Private Data Collections (PDC)

To satisfy defense data sovereignty requirements, sensitive data is stored off-ledger in peer-local Private Data Collections (PDCs), preventing unauthorized peers from ever seeing or replicating the raw data. Only cryptographic state hashes are written to the channel ledger blocks.

### 3.1 PDC Configuration (`collections_config.json`)

```json
[
  {
    "name": "identityKycDetails",
    "policy": "OR('BELMSP.member', 'AuditorMSP.member')",
    "requiredPeerCount": 0,
    "maxPeerCount": 2,
    "blockToLive": 0,
    "memberOnlyRead": true,
    "memberOnlyWrite": true
  },
  {
    "name": "assetDocumentDetails",
    "policy": "OR('BELMSP.member', 'AuditorMSP.member', 'ContractorMSP.member')",
    "requiredPeerCount": 0,
    "maxPeerCount": 3,
    "blockToLive": 0,
    "memberOnlyRead": true,
    "memberOnlyWrite": true
  }
]
```

### 3.2 Collection Specifications
1. `identityKycDetails`:
   - **Members**: `BELMSP`, `AuditorMSP`.
   - **Content**: Personnel National IDs, security clearance levels, biometrics hashes.
   - **Isolation**: Strictly inaccessible to `ContractorMSP`. Unauthorized query attempts are rejected with chaincode response `500 Access denied`.
2. `assetDocumentDetails`:
   - **Members**: `BELMSP`, `AuditorMSP`, `ContractorMSP`.
   - **Content**: Defense procurement references, internal pricing, bill of materials, KMS key IDs.

### 3.3 Transient Data Handling
Private data is transmitted via the Fabric proposal `transient` map (`ctx.stub.getTransient()`), ensuring sensitive payloads never appear in the plain transaction invocation arguments or the ordering service ledger logs.

---

## 4. Multi-Party Endorsement Policies

To prevent rogue insider actions or single-point-of-compromise vulnerabilities, sensitive operations require multi-party consensus:
- **Chaincode Commitment Policy**: Committed across `sihchannel` requiring consensus from BEL, Auditor, and Contractor organizations.
- **Auditor Co-Endorsement**: Critical transactions (`MintAsset`, `RevokeIdentity`, `GrantAccess`) emit chaincode endorsement events and record Auditor co-signatures via `EndorseTransaction(ctx, txType, targetId)`.
- **Audit Verification**: Auditors inspect and cross-sign on-chain defense actions, providing independent non-repudiation.

---

## 5. Fabric Transaction Events & Real-Time Sync

The backend maintains a persistent gRPC event stream (`backend/src/services/eventListenerService.js`) listening directly to `sihchannel` for all smart contract events:
1. `IdentityRegistered`: Automatically creates PostgreSQL audit log and notifies administrators.
2. `IdentityRevoked`: Updates PostgreSQL user status to `REVOKED` and dispatches immediate high-priority warning notifications.
3. `AssetMinted`: Records asset token creation and notifies the assigned asset owner.
4. `AssetTransferred`: Logs asset ownership provenance and alerts both predecessor and successor custodians.
5. `AssetDocumentUpdated`: Synchronizes document revision history with SHA-256 integrity metadata.
6. `AccessGranted`: Notifies the grantee with specific permission details (`READ`, `TRANSFER`, `AUDIT`).
7. `AccessRevoked`: Immediately invalidates cached access permissions.
8. `TransactionEndorsed`: Confirms multi-party auditor co-endorsements.

---

## 6. IPFS Cryptographic Tamper & Integrity Verification

ChainCoder implements off-chain content storage coupled with on-chain cryptographic binding:
1. **Document Ingestion**: Documents are hashed with SHA-256 (`crypto.createHash('sha256')`) and pinned to the local IPFS daemon (Kubo v0.39.0).
2. **On-Chain Binding**: The generated IPFS CID and SHA-256 hash are immutably written to the Fabric ledger during `MintAsset` or `UpdateAssetDocument`.
3. **Public Verification (`GET /api/verify/asset/:id`)**:
   - The document is dynamically retrieved from IPFS by CID.
   - The SHA-256 hash of the retrieved byte stream is computed in memory.
   - The calculated hash is compared byte-for-byte with the blockchain ledger state.
   - If hashes match: Status is `VERIFIED` (`verified: true`).
   - If hashes differ or bytes are corrupted: Status is `UNVERIFIED` (`verified: false`), indicating cryptographic tampering.
4. **Zero-Residual File Cleanup**:
   - Uploaded files in `uploads/` are processed in memory and permanently deleted via `fs.unlinkSync()` inside a `finally` block to prevent lingering plaintext files on backend disks.

---

## 7. Role-Based Access Control (RBAC) Matrix

| Operation | BEL Admin | BEL Manager | BEL Employee | Auditor | Contractor Admin | Contractor User |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Register Identity** | Allowed | Staff Only | Denied (403) | Denied (403) | Contractor Only | Denied (403) |
| **Revoke Identity** | Allowed | Denied (403) | Denied (403) | Denied (403) | Denied (403) | Denied (403) |
| **Mint Defense Asset** | Allowed | Allowed | Denied (403) | Denied (403) | Contractor Scoped | Denied (403) |
| **Transfer Asset** | Allowed | Allowed | Denied (403) | Denied (403) | Own Assets | Denied (403) |
| **View Audit Logs** | Allowed | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| **Auditor Overview** | Denied (403) | Denied (403) | Denied (403) | Allowed | Denied (403) | Denied (403) |
| **Read identityKycDetails (PDC)** | Allowed | Allowed | Denied (403) | Allowed | Denied (403) | Denied (403) |
| **Read assetDocumentDetails (PDC)** | Allowed | Allowed | Denied (403) | Allowed | Allowed | Denied (403) |
| **Public Asset Verify** | Allowed | Allowed | Allowed | Allowed | Allowed | Allowed |

---

## 8. Hardware Security Module (HSM) & KMS Architecture

For production defense deployment in accordance with **FIPS 140-2 Level 3 and Level 4** standards:

```
+-------------------------------------------------------------------------------+
|                             HSM / KMS ARCHITECTURE                            |
+-------------------------------------------------------------------------------+
|                                                                               |
|  [ Cloud KMS (AWS / Azure / GCP) ]            [ On-Premises Hardware HSM ]   |
|         Envelope Encryption                          PKCS#11 Provider         |
|     (AES-256 GCM Key Wrapping)                 (Luna SA / Thales nShield)     |
|                  |                                          |                 |
|                  v                                          v                 |
|  +-------------------------------+          +-------------------------------+ |
|  |     ChainCoder Application    |          |    Hyperledger Fabric Peers   | |
|  |    Encrypted Metadata Store   |          |  Hardware-backed Signer / CA  | |
|  +-------------------------------+          +-------------------------------+ |
|                                                                               |
+-------------------------------------------------------------------------------+
```

### 8.1 PKCS#11 Configuration Specification
Fabric CA and Fabric Gateway client can be configured to delegate all cryptographic signing operations to a PKCS#11 hardware token:

```yaml
# Fabric CA PKCS#11 Configuration (fabric-ca-server-config.yaml)
bccsp:
  default: PKCS11
  pkcs11:
    Library: /opt/etoken/lib/libeToken.so
    Pin: ${HSM_TOKEN_PIN}
    Label: BEL_DEFENSE_HSM_TOKEN
    Hash: SHA256
    Security: 256
    Immutable: true
```

### 8.2 Cloud KMS Envelope Encryption
For assets requiring classified document encryption before IPFS submission:
1. The backend requests a single-use Data Encryption Key (DEK) from AWS KMS / Azure Key Vault / GCP KMS (`kms:GenerateDataKey`).
2. The file is encrypted locally using AES-256-GCM.
3. The encrypted document is pinned to IPFS.
4. The encrypted DEK (Key Wrapping) is stored in the `assetDocumentDetails` Private Data Collection.
5. Only members possessing the KMS key decrypt IAM permission can unwrap the DEK and decrypt the payload.

---

## 9. Backend Security Hardening

1. **HTTP Security Headers (Helmet)**:
   - `Content-Security-Policy`: Default `'self'`, prevents cross-site script injection.
   - `Strict-Transport-Security`: Enforces TLS encryption for 1 year with subdomains.
   - `X-Content-Type-Options: nosniff`: Mitigates MIME sniffing attacks.
   - `X-Frame-Options: SAMEORIGIN`: Defends against clickjacking.
2. **Brute-Force Rate Limiting (`express-rate-limit`)**:
   - `POST /api/auth/login` is protected with an IP-based window limiter (100 requests per 15 minutes), responding with `429 TOO_MANY_REQUESTS`.
3. **Input Sanitization & Safe Identifiers**:
   - All path parameters (`:identityId`, `:assetId`) enforce strict regex character filtering (`assertSafeId`), rejecting path traversal (`../`) and SQL injection sequences with `400 BAD_REQUEST`.
4. **Revocation Enforcement at Login**:
   - Authentication queries both the persistent database and the Fabric distributed ledger. If an identity is marked `REVOKED`, token generation is refused with `401/403 IDENTITY_REVOKED`.
