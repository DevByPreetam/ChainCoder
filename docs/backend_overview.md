# ChainCoder — Backend Architecture & API Reference

## What Is This Project?

**ChainCoder** is a **Blockchain-Based Secure Platform for Identity, Access Control & Digital Asset Management** (SIH project). It uses **Hyperledger Fabric** as the trust layer — meaning every sensitive operation (registering an identity, minting an asset, granting access) is recorded as an immutable transaction on-chain. The Node.js/Express backend is a REST API wrapper that sits between the browser and the Fabric network.

---

## Architecture at a Glance

```
Browser / Frontend
       │  REST (JSON)
       ▼
  Express Backend  (port 5000)
  ├── Auth Middleware (JWT)
  ├── Controllers  (input validation, orchestration)
  ├── Services
  │   ├── fabricService.js  ──────────────────────────► Hyperledger Fabric Peers
  │   ├── authService.js      (in-memory users, bcrypt, JWT)
  │   ├── accessRequestService.js  (in-memory pending queue)
  │   ├── auditLogService.js  (in-memory event log)
  │   ├── notificationService.js  (in-memory notifications)
  │   └── fileService.js  ──────────────────────────────► IPFS (port 5001)
  └── Routes  (URL → controller mapping)
```

### Key Technology Choices
| Layer | Tech |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Blockchain | Hyperledger Fabric (via `@hyperledger/fabric-gateway`) |
| File storage | IPFS (`/api/v0`) |
| Auth | bcryptjs password hashing + JWT tokens |
| File upload | Multer (disk storage → IPFS) |

---

## Organizations & Roles

Three real orgs participate on the Fabric channel:

| Org | Roles | What they can do |
|---|---|---|
| **BEL** | `Admin`, `Manager`, `Employee` | Full platform control — mint assets, grant/revoke access, register any identity |
| **Auditor** | `Auditor` | Read-only across all orgs, co-signs sensitive tx, exports compliance reports |
| **Contractor** | `Admin`, `User` | Request access, transfer own assets, register own org's users |

> [!IMPORTANT]
> The **two-step approval** flow for access requests mirrors the on-chain endorsement policy: BEL must approve first (`BEL_APPROVED`), then the Auditor co-approves (`ACTIVE`). Neither org can unilaterally grant access.

---

## Backend File Map

```
backend/src/
├── app.js                        ← Express entry point, route mounting
├── config/
│   └── fabric.js                 ← Fabric Gateway connection setup
├── middleware/
│   ├── authMiddleware.js         ← JWT verify + org/role guards
│   └── errorHandler.js           ← Global error & 404 handler
├── routes/
│   ├── authRoutes.js
│   ├── identityRoutes.js
│   ├── assetRoutes.js
│   ├── accessRoutes.js
│   ├── auditorRoutes.js          ← Auditor-only endpoints
│   ├── auditRoutes.js            ← Alias → auditorRoutes
│   ├── notificationRoutes.js
│   └── verifyRoutes.js           ← Public (no auth) asset verification
├── controllers/
│   ├── authController.js
│   ├── identityController.js
│   ├── assetController.js
│   ├── accessController.js
│   ├── accessRequestController.js
│   ├── auditorController.js
│   └── notificationController.js
└── services/
    ├── fabricService.js          ← All chaincode calls (submit/evaluate)
    ├── authService.js            ← In-memory users, login, enroll
    ├── accessRequestService.js   ← In-memory access-request queue
    ├── accessService.js          ← Thin wrapper over fabricService for access
    ├── assetService.js           ← Thin wrapper over fabricService for assets
    ├── authorizationService.js   ← Business-logic permission checks
    ├── auditLogService.js        ← In-memory event log + CSV export
    ├── notificationService.js    ← In-memory notification store
    └── fileService.js            ← Multer → IPFS upload/retrieve/hash
```

---

## All APIs

### 🔐 Auth — `/api/auth`

| Method | Endpoint | Auth Required | Who Can Call | What It Does |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | ❌ No | Anyone | Validates `userId` + `password` against the in-memory user store (bcrypt), returns a JWT token |
| `POST` | `/api/auth/enroll` | ✅ JWT | BEL Admin, BEL Manager (BEL only), Contractor Admin (Contractor only) | Adds a new user to the in-memory store; role-gated — a Manager can only enroll BEL staff |

**Login payload:**
```json
{ "userId": "BEL001", "password": "BelAdmin@123" }
```

**Pre-seeded dev users:**
| userId | org | role | password |
|---|---|---|---|
| BEL001 | BEL | Admin | `BelAdmin@123` |
| BEL002 | BEL | Manager | `BelManager@123` |
| BEL003 | BEL | Employee | `BelEmployee@123` |
| AUD001 | Auditor | Auditor | `Auditor@123` |
| CON001 | Contractor | Admin | `ContractorAdmin@123` |
| CON002 | Contractor | User | `Contractor@123` |

---

### 👤 Identities — `/api/identities`

> These call **Hyperledger Fabric chaincode** (`RegisterIdentity`, `GetIdentity`, `RevokeIdentity`).

| Method | Endpoint | Auth Required | Who Can Call | What It Does |
|---|---|---|---|---|
| `POST` | `/api/identities` | ✅ JWT | BEL Admin/Manager, Contractor Admin | Calls `RegisterIdentity` on Fabric; BEL Admin can register anyone, Manager can only register BEL staff, Contractor Admin can only register Contractor users |
| `GET` | `/api/identities/:identityId` | ✅ JWT | Any authenticated user | Calls `GetIdentity` on Fabric; returns identity if caller is allowed to view it |
| `PATCH` | `/api/identities/:identityId/revoke` | ✅ JWT | BEL Admin only | Calls `RevokeIdentity` on Fabric; fires a notification to the revoked identity |

**Fabric calls:**
- `RegisterIdentity(identityId, name, organization, role)` → **submit** (write)
- `GetIdentity(identityId)` → **evaluate** (read-only)
- `RevokeIdentity(identityId)` → **submit** (write)

---

### 📦 Assets — `/api/assets`

> Calls chaincode: `MintAsset`, `GetAsset`, `TransferAsset`, `UpdateAssetDocument`, `GetAssetHistory`. Files go to **IPFS** and only the **hash + CID** go on-chain.

| Method | Endpoint | Auth | Who Can Call | What It Does |
|---|---|---|---|---|
| `POST` | `/api/assets` | ✅ | BEL Admin/Manager | Mints a new asset on Fabric (`MintAsset`). Requires `assetId, name, assetType, owner, documentHash, documentCID` |
| `GET` | `/api/assets/:assetId` | ✅ | Any authenticated (view permission checked) | Fetches asset from Fabric (`GetAsset`) |
| `GET` | `/api/assets/:assetId/history` | ✅ | Any authenticated (view permission checked) | Returns full tamper-proof provenance of the asset (`GetAssetHistory`) |
| `PATCH` | `/api/assets/:assetId/transfer` | ✅ | BEL Admin, Contractor Admin/User (own assets) | Transfers ownership on-chain (`TransferAsset`). Notifies old & new owner |
| `POST` | `/api/assets/:assetId/upload` | ✅ | BEL Admin/Manager | Accepts a file (max 10 MB, pdf/png/jpg/txt/doc/docx), uploads it to **IPFS**, then calls `UpdateAssetDocument` on Fabric with the CID + SHA-256 hash |
| `GET` | `/api/assets/:assetId/verify` | ✅ | Any authenticated (view permission checked) | Pulls the file from IPFS by CID, re-hashes it, compares against the on-chain hash — returns `verified: true/false` |
| `GET` | `/api/assets/:assetId/document` | ✅ | Any authenticated (download permission checked) | Streams the actual file bytes from IPFS as a download |

**Fabric calls:**
- `MintAsset(assetId, name, assetType, owner, documentHash, documentCID)` → submit
- `GetAsset(assetId)` → evaluate
- `TransferAsset(assetId, newOwner)` → submit
- `UpdateAssetDocument(assetId, documentHash, documentCID)` → submit
- `GetAssetHistory(assetId)` → evaluate

---

### 🔑 Access Control — `/api/access`

Two sub-systems here: **direct access grants** (BEL admin action) and the **access request workflow** (Contractor → BEL → Auditor two-step).

#### Direct Access (BEL-only actions)

| Method | Endpoint | Auth | Who Can Call | What It Does |
|---|---|---|---|---|
| `POST` | `/api/access` | ✅ | BEL Admin/Manager | Directly grants access on Fabric (`GrantAccess`); requires `accessId, identityId, assetId, grantedTo, permission` |
| `GET` | `/api/access/:identityId/:assetId` | ✅ | Any authenticated (checks own identity or admin) | Checks if an identity has access to an asset on-chain (`CheckAccess`) |
| `PATCH` | `/api/access/:identityId/:assetId/revoke` | ✅ | BEL Admin/Manager | Revokes access on-chain (`RevokeAccess`) and notifies the grantee |
| `GET` | `/api/access/history` | ✅ | BEL Admin/Manager | Returns in-memory audit log filtered to `access` resource type |

#### Access Request Workflow (Contractor → BEL → Auditor)

| Method | Endpoint | Auth | Who Can Call | What It Does |
|---|---|---|---|---|
| `POST` | `/api/access/request` | ✅ | Contractor Admin/User | Creates a pending access request in memory (`PENDING` status) |
| `POST` | `/api/access/requests` | ✅ | Contractor Admin/User | Same as above (alias) |
| `GET` | `/api/access/requests/my` | ✅ | Contractor Admin/User | Lists all requests made by the logged-in user |
| `GET` | `/api/access/requests/pending` | ✅ | BEL Admin/Manager | Lists all `PENDING` requests awaiting BEL approval |
| `GET` | `/api/access/requests` | ✅ | BEL Admin/Manager | Lists all requests (any status) |
| `GET` | `/api/access/requests/:requestId` | ✅ | Any authenticated | Fetches a single request by ID |
| `POST` / `PATCH` | `/api/access/requests/:requestId/approve` | ✅ | BEL Admin/Manager | Moves request from `PENDING` → `BEL_APPROVED` |
| `POST` / `PATCH` | `/api/access/requests/:requestId/reject` | ✅ | BEL Admin/Manager | Moves request from `PENDING` → `REJECTED` |
| `POST` | `/api/access/requests/:requestId/auditor-approve` | ✅ | Auditor only | Moves request from `BEL_APPROVED` → `ACTIVE` (final approval) |

**Request state machine:**
```
Contractor submits → PENDING
                       │
             BEL Admin/Manager decides
            ┌──────────┴──────────┐
        approve                reject
            │                    │
       BEL_APPROVED           REJECTED
            │
     Auditor co-approves
            │
          ACTIVE
```

**Fabric calls:**
- `GrantAccess(accessId, identityId, assetId, grantedTo, permission)` → submit
- `CheckAccess(identityId, assetId)` → evaluate
- `RevokeAccess(identityId, assetId)` → submit

---

### 🔍 Auditor — `/api/auditor` (and alias `/api/audit`)

> All endpoints require `Auditor` org + `Auditor` role.

| Method | Endpoint | What It Does |
|---|---|---|
| `GET` | `/api/auditor/identities` | Loads all known identity IDs from the audit log, fetches each from Fabric, strips sensitive fields |
| `GET` | `/api/auditor/identities/:identityId` | Fetches a single identity from Fabric (sensitive fields stripped) |
| `GET` | `/api/auditor/access` | Loads all known access pairs from audit log, checks each on Fabric |
| `GET` | `/api/auditor/assets` | Loads all known asset IDs from audit log, fetches each from Fabric |
| `GET` | `/api/auditor/assets/:assetId/history` | Full on-chain history of a specific asset |
| `GET` | `/api/auditor/access-requests` | All access requests from in-memory store + access audit events |
| `GET` | `/api/auditor/transactions` | Full in-memory audit log (all event types) |
| `GET` | `/api/auditor/export` | Downloads the entire audit log as a **CSV file** (`chaincoder-audit.csv`) |

---

### 🔔 Notifications — `/api/notifications`

> In-memory store. Notifications are created automatically when assets are minted/transferred, access granted/revoked, identities revoked, etc.

| Method | Endpoint | What It Does |
|---|---|---|
| `GET` | `/api/notifications` | Lists notifications for the logged-in user |
| `GET` | `/api/notifications/unread-count` | Returns the count of unread notifications |
| `PATCH` | `/api/notifications/:id/read` | Marks a specific notification as read |

---

### 🌐 Public Verify — `/api/verify`

> **No authentication required** — designed as a public demo endpoint.

| Method | Endpoint | What It Does |
|---|---|---|
| `GET` | `/api/verify/asset/:assetId` | Fetches the asset from Fabric (as BEL org), retrieves the file from IPFS by CID, re-hashes it, and returns `verified: true/false` along with the asset metadata. Anyone can paste an assetId and verify integrity. |

---

### 🩺 System — Direct on `app.js`

| Method | Endpoint | What It Does |
|---|---|---|
| `GET` | `/api/health` | Returns `{ success: true, message: "ChainCoder backend is running" }` |
| `GET` | `/api/blockchain/test` | Calls the chaincode `test` function directly to smoke-test the Fabric connection |

---

## How the Fabric Connection Works

[`fabricService.js`](file:///c:/Users/ASUS/Desktop/Project/ChainCoder/backend/src/services/fabricService.js) is the central Fabric layer:

1. **`connectToFabric(organization)`** — opens a `fabric-gateway` connection using the TLS certs and identity for the requested org (`BEL`, `Auditor`, or `Contractor`).
2. **`evaluateTransaction(org, functionName, ...args)`** — read-only query; does NOT go through ordering or create a block.
3. **`submitTransaction(org, functionName, ...args)`** — write operation; goes through endorsement → ordering → commit.
4. The connection is **opened and immediately closed** after each call (per-request connection pooling is not used yet).

The org passed to the call determines **which peer endorses the transaction**, matching the on-chain endorsement policy.

---

## How File Uploads Work (IPFS Integration)

[`fileService.js`](file:///c:/Users/ASUS/Desktop/Project/ChainCoder/backend/src/services/fileService.js):

1. **Multer** saves the incoming file to `backend/uploads/` with a random name.
2. `saveUploadedFile()` reads the file, **computes SHA-256 hash**.
3. Sends the file to local IPFS node (`http://127.0.0.1:5001/api/v0/add?pin=true`).
4. IPFS returns a **CID** (Content Identifier).
5. The `hash` (SHA-256) and `cid` (IPFS CID) are returned to the controller and stored on-chain via `UpdateAssetDocument`.

**Verification:** `hashFromIpfs(cid)` fetches the file back from IPFS and re-hashes it, then compares to the on-chain hash. If they match → `verified: true`.

---

## Auth & Authorization Flow

```
Request arrives
      │
  authMiddleware.js (authenticate)
      │  verifies JWT, attaches req.user = { userId, organization, role }
      │
  authorizeOrganization / authorizeOrganizationRoles
      │  checks org + role against route requirements
      │
  Controller
      │  additional fine-grained checks (authorizationService.js)
      │  e.g. canViewAsset, canTransferAsset, canCheckAccessRecord
      │
  Service → Fabric / IPFS
```

> [!NOTE]
> Auth is currently **in-memory** (`authService.js`). There is no database yet — users are hardcoded or enrolled at runtime and lost on server restart. The plan is to migrate to a proper DB.

---

## In-Memory State (Current Limitations)

These things are **lost on server restart**:
- Enrolled users (beyond the 6 seed users)
- Access requests and their approval states
- Audit log events
- Notifications

Everything on **Fabric is permanent** — identity registrations, asset mints, access grants, transfers.

---

## What Each Chaincode Function Does

| Chaincode Function | Type | Purpose |
|---|---|---|
| `RegisterIdentity` | Submit | Creates an identity record on the ledger |
| `GetIdentity` | Evaluate | Reads an identity by ID |
| `RevokeIdentity` | Submit | Marks identity as revoked |
| `GrantAccess` | Submit | Creates an access grant record |
| `CheckAccess` | Evaluate | Reads current access status |
| `RevokeAccess` | Submit | Revokes an access grant |
| `MintAsset` | Submit | Creates a new asset with owner + document hash |
| `GetAsset` | Evaluate | Reads an asset by ID |
| `TransferAsset` | Submit | Changes asset ownership |
| `UpdateAssetDocument` | Submit | Updates the document hash/CID on an existing asset |
| `GetAssetHistory` | Evaluate | Returns the full Fabric ledger history for an asset |
| `test` | Evaluate | Health-check smoke test |
