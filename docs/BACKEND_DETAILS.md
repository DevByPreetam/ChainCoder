# ChainCoder — Backend Architecture & Technical Reference

## 1. Executive Summary

The **ChainCoder Backend** is a Node.js and Express.js REST application operating as the central secure bridge between the browser client, the **Hyperledger Fabric** blockchain network, and the **IPFS** distributed storage cluster.

It is responsible for:
- Authenticating users using bcrypt-hashed credentials and standard JWT tokens.
- Enforcing Role-Based Access Control (RBAC) across three enterprise organizations (`BEL`, `Auditor`, `Contractor`).
- Orchestrating multi-party approval workflows (e.g., dual BEL + Auditor access grant approval).
- Submitting transactions to Hyperledger Fabric peers using `@hyperledger/fabric-gateway`.
- Hashing files using SHA-256 and uploading them to IPFS via Kubo API.
- Providing real-time audit logs and live blockchain activity aggregation.

---

## 2. Architecture & File Organization

```
backend/
├── package.json                   ← CommonJS, nodemon dev runtime
├── src/
│   ├── app.js                     ← Express initialization, CORS, global routing
│   ├── middleware/
│   │   └── authMiddleware.js      ← JWT authentication & organization/role guards
│   ├── controllers/
│   │   ├── authController.js      ← Login, session, token generation
│   │   ├── identityController.js  ← User identity & DID registration
│   │   ├── didController.js       ← W3C DID document resolution & verification
│   │   ├── assetController.js     ← Asset minting, transfer, download, provenance
│   │   ├── accessController.js    ← Direct access checks, grant & revoke
│   │   ├── accessRequestController.js ← Multi-tier access request workflow
│   │   ├── auditorController.js   ← Auditor oversight, export, recent activities
│   │   ├── verificationController.js ← Public unauthenticated verification
│   │   └── notificationController.js ← In-app alerts & state notifications
│   ├── services/
│   │   ├── fabricService.js       ← Fabric Gateway connection pool & transaction handler
│   │   ├── authService.js         ← User credential store, seed records, bcrypt verify
│   │   ├── assetService.js        ← Asset business logic wrapper
│   │   ├── accessService.js       ← Ledger access query wrapper
│   │   ├── accessRequestService.js← In-memory pending access request state machine
│   │   ├── auditLogService.js     ← Audit log event buffer & CSV exporter
│   │   ├── notificationService.js ← Role-targeted notification dispatcher
│   │   ├── fileService.js         ← IPFS daemon integration & SHA-256 calculation
│   │   └── authorizationService.js← Deep resource ownership & permission policies
│   ├── routes/
│   │   ├── authRoutes.js          ← /api/auth
│   │   ├── identityRoutes.js      ← /api/identities
│   │   ├── didRoutes.js           ← /api/did
│   │   ├── assetRoutes.js         ← /api/assets
│   │   ├── accessRoutes.js        ← /api/access
│   │   ├── auditorRoutes.js       ← /api/auditor
│   │   ├── auditRoutes.js         ← /api/audit (recent activity & transactions)
│   │   ├── verifyRoutes.js        ← /api/verify
│   │   └── notificationRoutes.js  ← /api/notifications
│   └── utils/
│       ├── auth.js                ← JWT token generation & verification
│       └── errors.js              ← AppError, error mapping, sendSuccess, sendError
```

---

## 3. End-to-End Request Lifecycle

```
[Browser Client]
       │
       ▼ (HTTP Request with Bearer JWT)
[app.js] ➔ [CORS & JSON Body Parser]
       │
       ▼
[authMiddleware.authenticate] (Verifies JWT, extracts { userId, organization, role })
       │
       ▼
[Role/Org Middleware] (Optional: authorizeOrganization / authorizeOrganizationRoles)
       │
       ▼
[Controller] (Validates parameters, asserts safe ID strings)
       │
       ▼
[Authorization Service] (canViewAsset / canModifyAssetDocument / canTransferAsset)
       │
       ▼
[Service Layer]
   ├── [fileService] ───────► IPFS Kubo Node (5001) [Stream file, return CID]
   │                             │
   │                             ▼ (Calculated SHA-256 digest)
   └── [fabricService] ─────► Hyperledger Fabric Peer (7051/8051/9051)
                                 ├── evaluateTransaction() (Read query: LevelDB)
                                 └── submitTransaction()   (Write invoke: Consensus)
       │
       ▼
[auditLogService] (Records event: USER_ID, ACTION, RESOURCE, TX_ID, TIMESTAMP)
       │
       ▼
[sendSuccess] (Formats standardized JSON response) ➔ [Browser Client]
```

---

## 4. Key Subsystems Deep Dive

### 4.1 Fabric Gateway Integration (`fabricService.js`)

- Uses `@hyperledger/fabric-gateway` and `@grpc/grpc-js` to establish gRPC connections to Fabric peers.
- Loads admin identity credentials and TLS certificates dynamically for the requested organization (`BEL`, `Auditor`, or `Contractor`).
- **Read Operations (`evaluateTransaction`)**:
  - Sent directly to the organization's peer node.
  - Does NOT incur consensus overhead or transaction ordering fees.
  - Used for `GetAsset`, `GetIdentity`, `ResolveDID`, `CheckAccess`, `GetAssetHistory`.
- **Write Operations (`submitTransaction`)**:
  - Requires endorsement by endorsing peers according to the channel policy.
  - Endorsed proposal is submitted to the Raft orderer cluster.
  - Wait for block commitment and validation event before returning success.
  - Used for `MintAsset`, `TransferAsset`, `RegisterIdentity`, `GrantAccess`.

### 4.2 IPFS Off-Chain Storage (`fileService.js`)

- Uploaded files are intercepted by `multer` and saved into a secured temporary folder.
- `fileService` streams the buffer into the local Kubo IPFS daemon via `http://localhost:5001/api/v0/add`.
- Computes SHA-256 digest (`crypto.createHash('sha256')`).
- Produces an immutable Content Identifier (e.g. `QmXGJjtazLy2NiJpgA7kfhuuJpoKgraQ8XNWZqX1ttXZnR`).
- When downloading (`GET /api/assets/:assetId/document`), `fileService` streams the binary from IPFS via `/api/v0/cat` directly to the client with appropriate `Content-Disposition`.

### 4.3 Multi-Tier Authorization & Workflows (`authorizationService.js`)

The platform implements defense-in-depth authorization:
1. **BEL Users**:
   - `Admin`: Full permissions across the system.
   - `Manager`: Mint assets, upload documents, manage departmental access.
   - `Employee`: Read assets within BEL scope or with granted access.
2. **Contractor Users**:
   - `Admin` & `User`: View contractor-owned assets, request access to restricted blueprints, transfer owned digital assets.
3. **Auditor**:
   - Strictly read-only oversight across all three organizations.
   - Holds exclusive power to co-approve access requests and inspect cross-organizational audit logs.

### 4.4 Recent Activity Feed (`GET /api/audit/recent`)

- Combines live in-memory audit logs (`LOGIN`, `ACCESS_REQUEST_CREATED`, etc.) with **genuine blockchain ledger transactions** retrieved via `GetAssetHistory` for all tracked assets.
- Automatically determines state transitions:
  - Initial block: `NFT Minted`
  - Owner change: `Asset Transferred (AST-XXX ➔ NEW_OWNER)`
  - Document update: `Document Stored (IPFS)`
- Emits real Fabric transaction IDs (`txId`) and block timestamps with a 10-second cache to protect peer query performance.

---

## 5. Complete API Endpoint Reference

### 5.1 Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates credentials, returns JWT token + user profile |
| `GET` | `/api/auth/profile` | Bearer JWT | Returns current authenticated user details |

### 5.2 Decentralized Identifiers (`/api/did` & `/api/identities`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/did/:did` | Public | Resolves W3C-compliant DID Document |
| `GET` | `/api/did/:did/verify`| Public | Cryptographically verifies DID validity and issuer status |
| `GET` | `/api/identities/:id/did`| Bearer JWT | Returns DID record for a specific identity ID |
| `GET` | `/api/identities/:id` | Bearer JWT | Returns identity details from blockchain |
| `POST`| `/api/identities` | BEL Admin / Contractor Admin | Registers identity and provisions DID on-chain |
| `DELETE`| `/api/identities/:id` | BEL Admin | Revokes identity on blockchain |

### 5.3 Digital Assets & NFTs (`/api/assets`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/assets` | BEL Admin/Manager | Mints new digital asset / NFT on ledger |
| `GET` | `/api/assets/:assetId` | Authenticated (Permission Checked) | Retrieves asset metadata, owner, and DID |
| `GET` | `/api/assets/:assetId/history` | Authenticated (Permission Checked) | Returns immutable Fabric provenance history |
| `POST` | `/api/assets/:assetId/upload` | BEL Admin/Manager | Uploads document to IPFS and updates on-chain hash |
| `GET` | `/api/assets/:assetId/document` | Authenticated (Permission Checked) | Streams document binary from IPFS |
| `GET` | `/api/assets/:assetId/verify` | Authenticated | Verifies IPFS content matches on-chain hash |
| `PATCH`| `/api/assets/:assetId/transfer`| Asset Owner / BEL Admin | Transfers asset ownership to new identity |

### 5.4 Access Control (`/api/access`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/access/check` | Authenticated | Evaluates if an identity has active access to an asset |
| `POST` | `/api/access/grant` | BEL Admin | Grants access permissions on-chain |
| `POST` | `/api/access/revoke` | BEL Admin | Revokes access permissions on-chain |
| `POST` | `/api/access/request` | Authenticated | Creates a new access request |
| `GET` | `/api/access/requests` | Authenticated | Lists access requests (filtered by user/org role) |
| `PATCH`| `/api/access/requests/:id/approve` | BEL / Auditor | Advances access request in two-step approval flow |
| `PATCH`| `/api/access/requests/:id/reject` | BEL / Auditor | Rejects access request |

### 5.5 Audit & Oversight (`/api/audit` & `/api/auditor`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/audit/recent` | Authenticated (All Roles) | Real-time recent blockchain and system activities |
| `GET` | `/api/auditor/transactions` | Auditor Only | Cross-organization audit trail of all transactions |
| `GET` | `/api/auditor/export` | Auditor Only | Exports compliance audit log as CSV |
| `GET` | `/api/auditor/identities`| Auditor Only | Inspects all enterprise identities on ledger |
| `GET` | `/api/auditor/assets` | Auditor Only | Inspects all assets and NFTs across organizations |

### 5.6 Public Verification (`/api/verify`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/verify/asset/:assetId` | Public | Verifies asset existence and IPFS integrity |
| `GET` | `/api/verify/did/:did` | Public | Verifies DID legitimacy on blockchain |
