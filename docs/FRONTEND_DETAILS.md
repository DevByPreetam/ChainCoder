# ChainCoder — Frontend Architecture & Technical Reference

## 1. Executive Summary

The **ChainCoder Frontend** is a Single-Page Application (SPA) built with **React 18** and **Vite**, designed specifically for defense and enterprise consortium identity, access control, and digital asset workflows.

It is designed around:
- A responsive, mission-critical dark-theme interface.
- Role-based view segregation (`BEL`, `Auditor`, `Contractor`).
- Native integration with decentralized identity (DID) standards (`did:chaincoder:<org>:<id>`).
- Cryptographic asset verification and immutable transaction inspection.
- Complete client-side isolation from direct blockchain or IPFS connections (all traffic routes through the secure backend API).

---

## 2. Architecture & File Organization

```
frontend/
├── package.json                   ← Vite, React 18, react-router-dom, lucide-react
├── vite.config.js                 ← Dev server config (port 5173), proxy definitions
├── src/
│   ├── main.jsx                   ← React root entry point
│   ├── App.jsx                    ← App wrapper, AuthProvider, AppRoutes
│   ├── context/
│   │   └── AuthContext.jsx        ← User authentication state, token storage, role decoding
│   ├── routes/
│   │   └── AppRoutes.jsx          ← Route definitions & role-based ProtectedRoute guards
│   ├── pages/
│   │   ├── auth/
│   │   │   └── Login.jsx          ← Identity login with credential hints
│   │   ├── dashboard/
│   │   │   └── Dashboard.jsx      ← Core metrics, real blockchain activity, quick actions
│   │   ├── identity/
│   │   │   ├── Identities.jsx     ← Directory of registered consortium identities
│   │   │   ├── MyIdentity.jsx     ← User's DID card, public key, and W3C document
│   │   │   └── RegisterIdentity.jsx ← Identity enrollment & DID generation form
│   │   ├── assets/
│   │   │   ├── Assets.jsx         ← Asset inventory & NFT catalog
│   │   │   ├── AssetDetails.jsx   ← Provenance timeline, IPFS verify, transfer dialog
│   │   │   └── MintAsset.jsx      ← Token minting, file upload & SHA-256 generation
│   │   ├── access/
│   │   │   ├── AccessManagement.jsx ← Active grants & permissions table
│   │   │   └── AccessRequests.jsx   ← Two-tier request approval workflow
│   │   ├── audit/
│   │   │   ├── AuditorDashboard.jsx ← Auditor KPI overview
│   │   │   └── AuditHistory.jsx     ← Advanced ledger explorer, filter & CSV export
│   │   ├── verification/
│   │   │   └── VerifyAsset.jsx    ← Public, unauthenticated verification tool
│   │   └── settings/
│   │       └── Settings.jsx       ← Security preferences, CA certificates, network stats
│   ├── components/
│   │   ├── common/
│   │   │   ├── ProtectedRoute.jsx ← Route authentication & organization/role guards
│   │   │   ├── Navbar.jsx         ← Top public navigation bar (for /verify)
│   │   │   └── Modal.jsx          ← Reusable modal component
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx        ← Dynamic left navigation with role-aware links
│   │   │   └── Topbar.jsx         ← Header bar with user badge, DID chip & notifications
│   │   └── dashboard/
│   │       ├── StatCard.jsx       ← Metric indicator card
│   │       ├── QuickActions.jsx   ← Primary action buttons
│   │       └── ActivityTable.jsx  ← Live blockchain activity table
│   ├── services/
│   │   ├── authService.js         ← Authentication API client
│   │   ├── identityService.js     ← Identity lookup, register & revoke API
│   │   ├── didService.js          ← W3C DID document resolver & verifier API
│   │   ├── assetService.js        ← Asset minting, transfer, download & history API
│   │   ├── accessService.js       ← Permission check & direct grant API
│   │   ├── accessRequestService.js← Multi-tier access request workflow API
│   │   ├── auditorService.js      ← Auditor transactions, CSV export & recent activity API
│   │   ├── notificationService.js ← User notification alerts API
│   │   └── verificationService.js ← Public asset & DID verification API
│   └── styles/
│       ├── layout.css             ← Global app-layout, sidebar & topbar styles
│       ├── dashboard.css          ← Metrics grid, stat-card & activity table styles
│       ├── identity.css           ← Identity directory & W3C DID card styles
│       ├── assets.css             ← Asset cards, NFT badges & timeline styles
│       ├── access.css             ← Access permission & request approval styles
│       ├── auditor.css            ← Auditor dashboard styles
│       ├── audit-history.css      ← Audit explorer table, filters & pagination
│       ├── verify.css             ← Public asset verification styles
│       └── login.css              ← Authentication screen styles
```

---

## 3. Core Frontend Subsystems

### 3.1 Authentication & Global Context (`AuthContext.jsx`)

- **State Management**: Holds `user`, `token`, `loading`, and `isAuthenticated`.
- **Persistence**: Persists JWT token in browser `localStorage` under key `chaincoder_token`.
- **Hydration**: On initial load, reads token, decodes payload (`userId`, `organization`, `role`), and validates session via `/api/auth/profile`.
- **Login / Logout**: Centralized functions that update state and redirect across protected boundaries.

### 3.2 Dynamic Role-Based Routing (`AppRoutes.jsx` & `ProtectedRoute.jsx`)

The routing layer ensures users can only access screens permitted by their organization and role:

| Route Path | Allowed Organizations & Roles | Primary Purpose |
| :--- | :--- | :--- |
| `/login` | Public (Unauthenticated) | Secure user login |
| `/verify` | Public (Unauthenticated) | Public document hash & DID verification |
| `/dashboard` | All Authenticated Roles | System status, metrics & recent blockchain activity |
| `/my-identity`| All Authenticated Roles | View personal DID document, public key & status |
| `/assets` | All Authenticated Roles | Browse owned/accessible assets & NFTs |
| `/assets/:id` | All Authenticated Roles | Inspect asset details, IPFS verification & provenance |
| `/mint-asset` | BEL (Admin, Manager) | Mint new digital asset / NFT on ledger |
| `/identities` | BEL (All), Contractor (Admin) | Consortium identity directory |
| `/access` | All Authenticated Roles | Access control management & permissions |
| `/access-requests` | All Authenticated Roles | Submit & review multi-party access requests |
| `/auditor` | Auditor (`Auditor`) | Auditor command center |
| `/audit-history`| Auditor (`Auditor`) | Full consortium blockchain transaction explorer |
| `/settings` | All Authenticated Roles | Node connectivity, CA identity & security preferences |

### 3.3 Dashboard Real-Time Metrics & Blockchain Feed (`Dashboard.jsx`)

The dashboard aggregates four live metrics directly from the backend services:
1. **My Assets**: Counts digital assets accessible to or owned by the logged-in user.
2. **Active Access**: Counts active, unexpired permission grants.
3. **Pending Approvals**: Counts access requests awaiting the user's role approval.
4. **Blockchain Events**: Reflects genuine transactions committed on the Fabric ledger.

#### Real Data Activity Table (`ActivityTable.jsx`)
- Consumes the `GET /api/audit/recent` feed.
- Formats relative time ("Today, 11:42 AM", "Yesterday, 07:30 PM", "15 Sep, 07:50 PM").
- Renders genuine action tags (`NFT Minted`, `Asset Transferred`, `Document Stored (IPFS)`, `Identity Login`).
- Displays clickable/hoverable Fabric transaction ID badges (`tx`).
- Displays a clean empty state if no activity exists; never falls back to mock dummy data.

---

## 4. Key User Workflows

### 4.1 Decentralized Identity (DID) Workflow (`MyIdentity.jsx`)
1. User navigates to `/my-identity`.
2. Frontend requests `/api/identities/:userId/did` and `/api/did/:did`.
3. Displays:
   - Formatted DID String: `did:chaincoder:BEL:BEL001` with one-click copy button.
   - Status Badge: `ACTIVE` or `REVOKED`.
   - Organization & MSP ID: `BEL` (`BELMSP`).
   - Cryptographic Reference: Fabric CA certificate thumbprint.
   - Verification Method: JSON Web Key (JWK) representation of public key.
   - Full W3C DID Document in collapsible syntax-highlighted JSON viewer.

### 4.2 Digital Asset & NFT Minting Workflow (`MintAsset.jsx`)
1. Authorized BEL user fills in Asset Name, Type (`Blueprint`, `Contract`, `Report`, `Certificate`), and Owner.
2. User selects a document (PDF, PNG, CAD, etc.).
3. Frontend calculates client-side metadata and uploads via multipart form.
4. Backend streams file to IPFS, calculates SHA-256, and invokes `MintAsset` on Fabric.
5. On success, redirects to `/assets/:id` with token ID and IPFS CID preview.

### 4.3 Provenance & Asset Verification Workflow (`AssetDetails.jsx`)
1. User opens `/assets/:assetId`.
2. The page loads asset attributes, current owner DID, and token standard (`CHAINCODER-NFT`).
3. **IPFS Verification**: User clicks "Verify On-Chain Integrity":
   - Queries `/api/assets/:id/verify`.
   - Verifies that `hashFromIPFS === blockchainDocumentHash`.
   - Displays animated verification badge ("100% Cryptographically Verified").
4. **Provenance Timeline**:
   - Queries `/api/assets/:id/history`.
   - Renders chronological audit cards with block timestamps, transaction IDs, actors, and state transitions.

### 4.4 Public Asset & DID Verification (`VerifyAsset.jsx`)
- Available without logging in at `/verify`.
- Allows external third parties, defense inspectors, or auditors to enter any `assetId` or `did`.
- Directs query to `/api/verify/asset/:id` or `/api/verify/did/:did`.
- Displays tamper-detection results, IPFS CID, and blockchain confirmation without exposing internal data.

---

## 5. UI/UX & Design System

- **Color Palette**:
  - Background: `#0c1017` / `#111620` (Deep Midnight Obsidian)
  - Card & Container Surface: `#161c27` / `#1c2433`
  - Primary Accent & Action: `#2563eb` / `#3b82f6` (Electric Blue)
  - Success & Verified: `#10b981` / `#34d399` (Emerald Green)
  - Warning / Pending: `#f59e0b` (Amber)
  - Error / Revoked: `#ef4444` (Crimson)
- **Typography**: Clean monospace fonts for hashes, DIDs, and transaction IDs; modern sans-serif for UI typography.
- **Component Consistency**: Modular CSS stylesheets isolated by feature domain preventing style collisions.
