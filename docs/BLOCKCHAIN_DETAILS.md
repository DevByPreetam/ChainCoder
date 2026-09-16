# ChainCoder — Hyperledger Fabric Blockchain Architecture & Technical Reference

## 1. Executive Summary

**ChainCoder** employs **Hyperledger Fabric (v2.5)** as its enterprise permissioned blockchain backbone. Fabric provides a deterministic, high-throughput, and gas-free distributed ledger tailored for defense-grade security, enterprise identity federation, and verifiable digital asset provenance.

Every critical operation in the platform—including identity registration, Decentralized Identifier (DID) resolution, access control permissioning, and NFT asset transfers—is committed as a cryptographically signed transaction to the immutable ledger.

---

## 2. Network Topology & Infrastructure

The ChainCoder blockchain network (`sih-network`) is distributed across three distinct enterprise organizations collaborating on a single consortium channel.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             sihchannel                                   │
│                                                                          │
│   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ │
│   │       BEL MSP       │  │     Auditor MSP     │  │  Contractor MSP │ │
│   │  peer0.bel...:7051  │  │ peer0.auditor..:8051│  │peer0.contract.. │ │
│   │     ca.bel:7054     │  │   ca.auditor:8054   │  │ ca.contract:9054│ │
│   └──────────┬──────────┘  └──────────┬──────────┘  └────────┬────────┘ │
│              │                        │                      │          │
│              └────────────────────────┼──────────────────────┘          │
│                                       ▼                                 │
│                     ┌──────────────────────────────────┐                │
│                     │       Raft Ordering Cluster      │                │
│                     │  orderer1, orderer2, orderer3    │                │
│                     │      (sih26125.local:7050)       │                │
│                     └──────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Organizations & Membership Service Providers (MSPs)

| Organization | MSP ID | Domain | Role & Authority |
| :--- | :--- | :--- | :--- |
| **Bharat Electronics Limited (BEL)** | `BELMSP` | `bel.sih26125.local` | Platform Administrator & Primary Asset Issuer; manages defense blueprints, reports, and master identities. |
| **Auditor** | `AuditorMSP` | `auditor.sih26125.local` | Independent Compliance & Verification Authority; co-signs access grants, monitors provenance, and exports audit logs. |
| **Contractor** | `ContractorMSP` | `contractor.sih26125.local` | External Vendor/Partner; requests asset access, receives transferred NFTs, and manages contractor personnel. |

### 2.2 Core Nodes & Container Infrastructure

All nodes run inside Docker containers attached to the internal bridge network `sih_network`:

1. **Ordering Service (Crash Fault Tolerant - Raft)**:
   - Three Raft orderer nodes (`orderer1.sih26125.local`, `orderer2.sih26125.local`, `orderer3.sih26125.local`).
   - Raft leader election ensures consensus and transaction ordering even if an orderer node fails.
2. **Peer Nodes**:
   - `peer0.bel.sih26125.local:7051` (Gossip & Chaincode listen port `7052`)
   - `peer0.auditor.sih26125.local:8051`
   - `peer0.contractor.sih26125.local:9051`
   - Peers host the ledger state database (LevelDB/GoLevelDB) and execute chaincode.
3. **Fabric Certificate Authorities (CAs)**:
   - Dedicated CA container per organization issuing X.509 ECDSA certificates (curve `secp256r1` / `prime256v1`).
   - `tls-ca` generates Mutual TLS (mTLS) certificates for secure inter-node communication.
4. **Channel**:
   - Channel Name: `sihchannel`
   - Governed by an endorsement policy that requires consensus across the consortium.

---

## 3. Smart Contract (Chaincode) Details

- **Contract Name**: `sih-contract`
- **Current Version**: `2.8` (Sequence 6)
- **Runtime**: Node.js (`fabric-contract-api`, `fabric-shim`)
- **Package ID**: Committed under channel lifecycle with endorsement policy `OR('BELMSP.member','AuditorMSP.member','ContractorMSP.member')` for standard queries and multi-party endorsement for sensitive updates.
- **Contract Class**: `SIHContract` located in `blockchain/sih-network/chaincode/sih-contract/lib/sihContract.js`.

### 3.1 World State Key Architecture

World state keys are partitioned using explicit string prefixes:

| Prefix | Format | Example Key | Purpose |
| :--- | :--- | :--- | :--- |
| `IDENTITY_` | `IDENTITY_<identityId>` | `IDENTITY_BEL001` | Core identity record, role, and CA cryptographic link. |
| `DID_` | `DID_<did>` | `DID_did:chaincoder:BEL:BEL001` | Decentralized identifier mapping to identity record. |
| `ASSET_` | `ASSET_<assetId>` | `ASSET_AST-FINAL-AUDIT-01` | Digital asset metadata, ownership, and NFT attributes. |
| `ACCESS_` | `ACCESS_<identityId>_<assetId>` | `ACCESS_CON001_AST-001` | Time-bounded access permissions and authorization level. |

---

## 4. Chaincode Function Reference

### 4.1 Decentralized Identity (DID) & User Management

#### `RegisterIdentity(ctx, identityId, name, role, organization, publicKey, did)`
- **Purpose**: Registers an enterprise user on the immutable ledger and assigns a W3C-compliant Decentralized Identifier.
- **DID Scheme**: `did:chaincoder:<organization>:<identityId>`
- **Behavior**:
  - Verifies caller authority (BEL can register any; Contractor can register Contractor users).
  - Validates that `identityId` and `did` do not already exist.
  - Stores identity state and secondary `DID_` pointer.
  - Emits `IdentityRegistered` contract event.

#### `GetIdentity(ctx, identityId)`
- **Purpose**: Retrieves identity attributes by ID.
- **Returns**: `{ identityId, name, role, organization, publicKey, did, status, createdAt, updatedAt }`.

#### `ResolveDID(ctx, did)`
- **Purpose**: Resolves a DID string into a standardized W3C DID Document.
- **DID Document Output**:
  ```json
  {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    "id": "did:chaincoder:BEL:BEL001",
    "controller": "did:chaincoder:BEL:BEL001",
    "verificationMethod": [
      {
        "id": "did:chaincoder:BEL:BEL001#key-1",
        "type": "JsonWebKey2020",
        "controller": "did:chaincoder:BEL:BEL001",
        "publicKeyJwk": {
          "kty": "EC",
          "crv": "P-256",
          "x": "...",
          "y": "..."
        }
      }
    ],
    "authentication": ["did:chaincoder:BEL:BEL001#key-1"],
    "assertionMethod": ["did:chaincoder:BEL:BEL001#key-1"],
    "status": "ACTIVE"
  }
  ```

#### `VerifyDID(ctx, did)`
- **Purpose**: Cryptographically verifies that a DID is registered, active, untampered, and issued by a recognized consortium organization.

#### `RevokeIdentity(ctx, identityId)`
- **Purpose**: Sets identity status to `REVOKED`. Revoked identities immediately lose all access permissions across the network.

---

### 4.2 Digital Assets & NFT Token Management

ChainCoder implements a specialized digital asset token standard (`CHAINCODER-NFT`) designed for tracking high-value defense blueprints, contracts, and compliance certificates.

#### `MintAsset(ctx, assetId, name, assetType, owner, documentHash, documentCID)`
- **Access**: Restricted to `BEL` organization (`Admin`, `Manager`).
- **Behavior**:
  - Initializes token metadata:
    - `tokenId`: Unique token identifier (equals `assetId`).
    - `tokenStandard`: `"CHAINCODER-NFT"`.
    - `ownerDID`: Resolved DID of the owner (e.g. `did:chaincoder:BEL:BEL001`).
    - `ownerOrganization`: Organization of the owner.
    - `documentHash`: SHA-256 cryptographic digest of the asset's file.
    - `documentCID`: IPFS Content Identifier where the encrypted payload is stored.
    - `status`: `"ACTIVE"`.
  - Commits asset to ledger and emits `AssetMinted` event.

#### `GetAsset(ctx, assetId)`
- **Purpose**: Reads asset record from world state.
- **Access**: Any peer evaluating read queries.

#### `TransferAsset(ctx, assetId, newOwner)`
- **Access**: Only the current owner or BEL Admin.
- **Behavior**:
  - Validates that the asset exists and is `ACTIVE`.
  - Resolves `newOwner`'s organization and DID automatically.
  - Updates `owner`, `ownerOrganization`, `ownerDID`, and `updatedAt`.
  - Appends a new immutable block in the asset's transaction history.

#### `UpdateAssetDocument(ctx, assetId, documentHash, documentCID)`
- **Purpose**: Binds a new document version or IPFS CID to an existing asset.
- **Integrity**: Ensures the SHA-256 hash stored on-chain matches the uploaded document.

#### `GetAssetHistory(ctx, assetId)`
- **Purpose**: Queries the Fabric history database using `ctx.stub.getHistoryForKey(key)`.
- **Returns**: Complete chronological ledger transactions:
  - `txId`: Cryptographic Fabric transaction ID.
  - `timestamp`: Block commit timestamp.
  - `isDelete`: Deletion flag.
  - `value`: Asset state at that exact block height.
- **Use Case**: Provenance audit trails, tamper-detection, legal compliance.

---

### 4.3 Access Control & Permissions

#### `GrantAccess(ctx, identityId, assetId, permissions, validUntil)`
- **Purpose**: Commits access rights for an identity to inspect or download an asset.
- **Permissions**: `READ`, `WRITE`, `ADMIN`.
- **Validation**: Enforces two-step verification if requested through the access request workflow.

#### `CheckAccess(ctx, identityId, assetId)`
- **Purpose**: Evaluates whether `identityId` holds active access to `assetId`.
- **Checks**:
  1. Identity must be `ACTIVE` (not revoked).
  2. Asset must be `ACTIVE`.
  3. Direct ownership grants automatic access.
  4. Access record must not have expired (`validUntil > currentTimestamp`).

#### `RevokeAccess(ctx, identityId, assetId)`
- **Purpose**: Immediately deletes or revokes the access key on the ledger.

---

## 5. Ledger Integrity & Cryptographic Security

1. **Dual Off-Chain / On-Chain Pattern**:
   - Sensitive large documents (e.g., CAD blueprints, PDF reports) are stored off-chain in IPFS.
   - Only the immutable SHA-256 hash and IPFS Content Identifier (CID) are written to Fabric.
   - If an off-chain file is modified by even one bit, its calculated SHA-256 hash will fail verification against the blockchain record.
2. **Deterministic State Evolution**:
   - Fabric executes chaincode in isolated Docker containers, guaranteeing identical read/write sets across endorsing peers.
3. **Raft Crash Fault Tolerance**:
   - Multi-node Raft consensus ensures transactions are committed in strictly ordered blocks without single points of failure.
