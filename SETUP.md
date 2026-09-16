# ChainCoder – Complete Windows Setup & Developer Guide

This guide explains how to set up, run, and develop **ChainCoder** on a Windows environment.

It is designed for a **teammate cloning the repository onto a brand-new Windows laptop**, as well as for **daily startup** on an already-configured machine.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Prerequisites](#3-prerequisites)
4. [First-Time Setup (Fresh Machine)](#4-first-time-setup-fresh-machine)
5. [Fresh Identity & MSP Generation](#5-fresh-identity--msp-generation)
6. [Channel Creation & Orderer Participation](#6-channel-creation--orderer-participation)
7. [Chaincode Lifecycle Deployment](#7-chaincode-lifecycle-deployment)
8. [IPFS Setup](#8-ipfs-setup)
9. [Backend Setup & Configuration](#9-backend-setup--configuration)
10. [Frontend Setup](#10-frontend-setup)
11. [Testing & Verification](#11-testing--verification)
12. [Daily Startup Flow (Already Set Up)](#12-daily-startup-flow-already-set-up)
13. [Daily Shutdown](#13-daily-shutdown)
14. [Troubleshooting Guide](#14-troubleshooting-guide)
15. [Security & Git Hygiene](#15-security--git-hygiene)
16. [Resetting the Network (Danger Zone)](#16-resetting-the-network-danger-zone)
17. [Team Member Independence](#17-team-member-independence)

---

## 1. Project Overview

**ChainCoder** is a decentralized document verification and access-control platform built for SIH 2026.

- **Blockchain Layer**: Hyperledger Fabric v2.5.x with Raft consensus.
- **Smart Contract (Chaincode)**: `sih-contract` (Node.js contract implementing identity, asset minting, access control, and document hashing).
- **Off-Chain Storage**: IPFS (Kubo) for storing large documents; document hashes and CIDs are anchored on-chain.
- **Backend**: Node.js & Express API server (`:5000`) using the `@hyperledger/fabric-gateway` SDK.
- **Frontend**: React + Vite application (`:5173`) with role-based dashboards.

---

## 2. Architecture

```
                                  +-----------------------+
                                  |    React Frontend     |
                                  |  (http://localhost:   |
                                  |          5173)        |
                                  +-----------+-----------+
                                              |
                                              v
                                  +-----------------------+
                                  |   Node.js / Express   |
                                  |   (http://localhost:  |
                                  |          5000)        |
                                  +-----+-----------+-----+
                                        |           |
                      Fabric Gateway    |           |  HTTP API (:5001)
                                        v           v
                    +-----------------------+   +-------------------+
                    |  Hyperledger Fabric   |   |     IPFS Kubo     |
                    |      sihchannel       |   |  Daemon (:5001)   |
                    +-----------+-----------+   |  Gateway (:8080)  |
                                |               +-------------------+
        +-----------------------+-----------------------+
        |                       |                       |
        v                       v                       v
+---------------+       +---------------+       +---------------+
|    BEL Peer   |       |  Auditor Peer |       |Contractor Peer|
| localhost:7051|       | localhost:8051|       | localhost:9051|
+---------------+       +---------------+       +---------------+
        \                       |                       /
         \                      |                      /
          +---------------------+---------------------+
                                |
                                v
                    +-----------------------+
                    |  3x Raft Orderers     |
                    |  orderer1 (:7050)     |
                    |  orderer2 (:8050)     |
                    |  orderer3 (:9050)     |
                    +-----------------------+
```

### Network Topology

| Component | Container Name | Service Port | Admin / CA Port |
|---|---|---|---|
| **BEL CA** | `ca-bel` | — | 7054 |
| **Auditor CA** | `ca-auditor` | — | 8054 |
| **Contractor CA** | `ca-contractor` | — | 9054 |
| **Orderer CA** | `ca-orderer` | — | 10054 |
| **Orderer 1** | `orderer1.sih26125.local` | 7050 (gRPC) | 7053 (Admin/osnadmin) |
| **Orderer 2** | `orderer2.sih26125.local` | 8050 (gRPC) | 8053 (Admin/osnadmin) |
| **Orderer 3** | `orderer3.sih26125.local` | 9050 (gRPC) | 9053 (Admin/osnadmin) |
| **BEL Peer** | `peer0.bel.sih26125.local` | 7051 (gRPC) | 7052 (Chaincode) |
| **Auditor Peer** | `peer0.auditor.sih26125.local` | 8051 (gRPC) | 8052 (Chaincode) |
| **Contractor Peer**| `peer0.contractor.sih26125.local`| 9051 (gRPC) | 9052 (Chaincode) |

---

## 3. Prerequisites

Install the following on your Windows laptop before starting:

### 3.1 Git for Windows
- **Download**: https://git-scm.com/download/win
- **Verify**: `git --version`

### 3.2 Node.js (LTS v20+ or v24) & npm
- **Download**: https://nodejs.org/
- **Verify**:
  ```powershell
  node --version
  npm --version
  ```

### 3.3 Docker Desktop
- **Download**: https://www.docker.com/products/docker-desktop/
- Start Docker Desktop and wait until the status displays **"Docker Desktop is running"**.
- Ensure Docker Compose V2 is active (default in modern Docker Desktop).
- **Verify**:
  ```powershell
  docker --version
  docker compose version
  ```

### 3.4 Hyperledger Fabric Binaries (v2.5.x) & Fabric CA Client (v1.5.x)
The project requires:
- `peer.exe` (v2.5.16)
- `configtxgen.exe` (v2.5.16)
- `osnadmin.exe` (v2.5.16)
- `fabric-ca-client.exe` (v1.5.17)

**Option A (Recommended)**: Clone `fabric-samples` into your home Desktop or parent directory:
```bash
# In Git Bash
cd ~/Desktop
git clone https://github.com/hyperledger/fabric-samples.git
cd fabric-samples
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.12 1.5.17 -d -s
```
Or download the Fabric 2.5.16 Windows binary release and extract it to `C:\fabric-bin\`.

**Option B**: Set the environment variable `FABRIC_BIN_PATH` in PowerShell:
```powershell
$env:FABRIC_BIN_PATH = "C:\path\to\fabric-samples\bin"
```
The setup scripts automatically scan `PATH`, `$env:FABRIC_BIN_PATH`, and `fabric-samples/bin`.

- **Verify**:
  ```powershell
  peer version
  fabric-ca-client version
  configtxgen -version
  osnadmin --help
  ```

### 3.5 IPFS / Kubo
- **Download**: https://dist.ipfs.tech/#kubo
- Extract `ipfs.exe` to `C:\ipfs\` and add `C:\ipfs` to your system `PATH`.
- **Verify**: `ipfs version`

---

## 4. First-Time Setup (Fresh Machine)

Follow these steps when cloning the project on a new laptop:

### Step 4.1: Clone the Repository
```powershell
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd ChainCoder
```

### Step 4.2: Run the Setup Script
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

This automated script will:
1. Verify all required CLI tools are present.
2. Verify Docker Desktop is active.
3. Install dependencies in `frontend/` and `backend/`.
4. Initialize `backend/.env` from `backend/.env.example`.
5. Detect that this is a fresh setup and automatically invoke `blockchain/sih-network/scripts/generate-identities.ps1` to:
   - Start the 4 Fabric CAs (`ca-bel`, `ca-auditor`, `ca-contractor`, `ca-orderer`).
   - Register and enroll all organization identities (admins, users, peers, orderers).
   - Generate `config.yaml` with NodeOUs enabled for all organizations.
   - Set up `backend/fabric/bel/` with the fresh BEL identity.
   - Run `configtxgen` to produce the channel genesis block (`channel-genesis.block`).
6. Check and initialize your local IPFS repository (`~/.ipfs`).

---

## 5. Fresh Identity & MSP Generation

The identity generation process is completely automated by `blockchain/sih-network/scripts/generate-identities.ps1`.

Here is what it generates locally (and keeps gitignored):

```
blockchain/sih-network/
├── organizations/
│   ├── fabric-ca/                      <-- CA databases and TLS certs
│   │   ├── bel/ca-cert.pem
│   │   ├── auditor/ca-cert.pem
│   │   ├── contractor/ca-cert.pem
│   │   └── orderer/ca-cert.pem
│   ├── peerOrganizations/
│   │   ├── bel.sih26125.local/         <-- BEL MSP & peer TLS
│   │   ├── auditor.sih26125.local/     <-- Auditor MSP & peer TLS
│   │   └── contractor.sih26125.local/  <-- Contractor MSP & peer TLS
│   └── ordererOrganizations/
│       └── sih26125.local/             <-- Orderer MSP & 3 orderer TLS
├── .msp-enroll/                        <-- Admin enrollment identities
└── channel-genesis.block               <-- Channel genesis configuration block
```

### Roles and Generated Users

| Organization | Enrolled Identity | Role | MSP Directory |
|---|---|---|---|
| **BEL** | `beladmin` | Admin | `organizations/peerOrganizations/bel.sih26125.local/users/beladmin/msp` |
| **BEL** | `belchanneladmin` | Channel Admin | `.msp-enroll/belchanneladmin/msp` (and `backend/fabric/bel/msp`) |
| **BEL** | `employee` | Client / Employee | `users/employee/msp` |
| **BEL** | `manager` | Client / Manager | `users/manager/msp` |
| **Auditor** | `auditoradmin` | Admin | `users/auditor/msp` |
| **Auditor** | `auditorchanneladmin` | Channel Admin | `.msp-enroll/auditorchanneladmin/msp` |
| **Contractor**| `contractoradmin` | Admin | `users/contractoradmin/msp` |
| **Contractor**| `contractorchanneladmin` | Channel Admin | `.msp-enroll/contractorchanneladmin/msp` |
| **OrdererOrg**| `Admin@sih26125.local` | Orderer Admin | `ordererOrganizations/sih26125.local/users/Admin@sih26125.local/msp` |

---

## 6. Channel Creation & Orderer Participation

Fabric 2.5 uses the **Channel Participation API** (`osnadmin`) instead of legacy system channels.

Channel creation is handled by `blockchain/sih-network/scripts/create-channel.ps1`:

1. **Orderer Channel Join**:
   Each Raft orderer joins `sihchannel` with mutual TLS authentication using `Admin@sih26125.local`'s TLS certificate:
   - `orderer1` on `localhost:7053`
   - `orderer2` on `localhost:8053`
   - `orderer3` on `localhost:9053`
2. **Peer Channel Join**:
   Each organization's peer joins `sihchannel` via `peer channel join -b channel-genesis.block`:
   - `peer0.bel.sih26125.local:7051`
   - `peer0.auditor.sih26125.local:8051`
   - `peer0.contractor.sih26125.local:9051`

---

## 7. Chaincode Lifecycle Deployment

`blockchain/sih-network/scripts/deploy-chaincode.ps1` deploys `sih-contract` across all three organizations:

1. **Package**:
   ```bash
   peer lifecycle chaincode package sih-contract.tar.gz \
     --path chaincode/sih-contract \
     --lang node \
     --label sih-contract_2.4
   ```
2. **Install**:
   Installed on BEL, Auditor, and Contractor peers.
3. **Approve**:
   Approved for `BELMSP`, `AuditorMSP`, and `ContractorMSP` with **Sequence 1**.
4. **Commit**:
   Committed to `sihchannel` with endorsement required from peers of all 3 organizations.
5. **Verify**:
   Runs a test query on chaincode:
   ```bash
   peer chaincode query -C sihchannel -n sih-contract -c '{"function":"test","Args":[]}'
   ```

---

## 8. IPFS Setup

Start the local IPFS daemon using the helper script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-ipfs.ps1
```

- **API Endpoint**: `http://127.0.0.1:5001/api/v0`
- **Gateway**: `http://127.0.0.1:8080`

To stop IPFS:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-ipfs.ps1
```

---

## 9. Backend Setup & Configuration

The backend is configured via `backend/.env`. The setup script automatically creates this file from `backend/.env.example`.

```env
PORT=5000
FABRIC_CHANNEL=sihchannel
FABRIC_CHAINCODE=sih-contract

# BEL Peer Gateway
BEL_MSP_ID=BELMSP
BEL_PEER_ENDPOINT=localhost:7051
BEL_TLS_SERVER_NAME=peer0.bel.sih26125.local
BEL_MSP_PATH=./fabric/bel/msp
BEL_TLS_CA_PATH=./fabric/bel/tls-ca.pem

# IPFS
IPFS_API_URL=http://127.0.0.1:5001/api/v0
IPFS_GATEWAY_URL=http://127.0.0.1:8080

JWT_SECRET=chaincoder-development-secret-change-in-production
NODE_ENV=development
```

Start the backend:
```powershell
cd backend
npm run dev
```

The backend server will listen on: **http://localhost:5000**

---

## 10. Frontend Setup

Start the React development server:
```powershell
cd frontend
npm run dev
```

The application will be available at: **http://localhost:5173**

### Development Login Credentials

| User ID | Password | Role | Organization |
|---|---|---|---|
| `BEL001` | `BelAdmin@123` | Admin | BEL |
| `BEL002` | `BelManager@123` | Manager | BEL |
| `BEL003` | `BelEmployee@123`| Employee | BEL |
| `AUD001` | `Auditor@123` | Auditor | Auditor |
| `CON001` | `ContractorAdmin@123` | Admin | Contractor |
| `CON002` | `Contractor@123` | User | Contractor |

---

## 11. Testing & Verification

Run the comprehensive health check script:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-network.ps1
```

Expected output:
```
  [PASS] Docker
  [PASS] BEL Certificate Authority (ca-bel)
  [PASS] Auditor Certificate Authority (ca-auditor)
  [PASS] Contractor Certificate Authority (ca-contractor)
  [PASS] Orderer Certificate Authority (ca-orderer)
  [PASS] Orderer 1 (Raft)
  [PASS] Orderer 2 (Raft)
  [PASS] Orderer 3 (Raft)
  [PASS] BEL Peer
  [PASS] Auditor Peer
  [PASS] Contractor Peer
  [PASS] IPFS API
  [PASS] Backend health (http://localhost:5000/api/health)
  [PASS] Blockchain test (http://localhost:5000/api/blockchain/test)
```

You can also test REST endpoints directly via PowerShell:
```powershell
Invoke-RestMethod http://localhost:5000/api/health
Invoke-RestMethod http://localhost:5000/api/blockchain/test
```

---

## 12. Daily Startup Flow (Already Set Up)

Once your fresh network has been bootstrapped, you do **not** need to recreate anything.

Simply open 4 terminal windows:

### Terminal 1: Fabric Network
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1
```

### Terminal 2: IPFS
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-ipfs.ps1
```

### Terminal 3: Backend
```powershell
cd backend
npm run dev
```

### Terminal 4: Frontend
```powershell
cd frontend
npm run dev
```

---

## 13. Daily Shutdown

To stop the system cleanly without deleting your ledger or identities:

```powershell
# Stop Fabric network (preserves all data)
powershell -ExecutionPolicy Bypass -File .\scripts\stop-network.ps1

# Stop IPFS
powershell -ExecutionPolicy Bypass -File .\scripts\stop-ipfs.ps1
```

---

## 14. Troubleshooting Guide

### Issue: "failed to connect to docker API"
- **Cause**: Docker Desktop is not running.
- **Fix**: Open Docker Desktop from your Start menu and wait for the status to show "running".

### Issue: Port Conflicts (e.g., 7050, 7051, 7054 already in use)
- **Cause**: Another service or orphaned container is using the port.
- **Fix**:
  ```powershell
  Get-NetTCPConnection -LocalPort 7051 -ErrorAction SilentlyContinue
  docker ps
  ```

### Issue: "npm : File npm.ps1 cannot be loaded because running scripts is disabled"
- **Cause**: PowerShell Execution Policy blocks unsigned scripts.
- **Fix**: Run scripts using:
  ```powershell
  powershell -ExecutionPolicy Bypass -File .\<script-path>.ps1
  ```

### Issue: Backend returns "Unable to query the blockchain"
- **Checklist**:
  1. Verify all 10 Fabric containers are running: `docker ps`
  2. Check BEL peer logs: `docker logs peer0.bel.sih26125.local`
  3. Ensure `backend/fabric/bel/msp` contains a valid `*_sk` key file.

---

## 15. Security & Git Hygiene

The `.gitignore` file is strictly configured to protect your cryptographic keys and secrets.

### NEVER Commit to Git:
- `backend/.env`
- `blockchain/sih-network/organizations/`
- `blockchain/sih-network/.msp-enroll/`
- `backend/fabric/bel/`
- Any `*_sk` private key file
- Channel blocks (`*.block`)
- Docker volumes or ledger databases

### ALWAYS Committed to Git:
- Docker compose files (`blockchain/sih-network/docker/`)
- Channel configuration (`blockchain/sih-network/configtx/`)
- Chaincode source (`blockchain/sih-network/chaincode/`)
- Automation scripts (`scripts/` and `blockchain/sih-network/scripts/`)
- Documentation (`README.md`, `SETUP.md`)
- `backend/.env.example`

---

## 16. Resetting the Network (Danger Zone)

If you intentionally wish to wipe all blockchain data, ledgers, and identities to start completely fresh:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\reset-network.ps1
```

> ⚠️ **WARNING**: This is a destructive operation. It removes all Docker volumes, ledgers, certificates, and channel state. You will be prompted to type `DESTROY-ALL-DATA` before proceeding.

---

## 17. Team Member Independence
 
Every team member runs an **independent local development network**:
 
- **Developer A**: Own local CAs, own MSP identities, own ledger, own IPFS.
- **Developer B**: Own local CAs, own MSP identities, own ledger, own IPFS.
 
> ⚠️ **IMPORTANT**: Do not copy `organizations/`, `.msp-enroll/`, `backend/fabric/bel/`, CA databases, private keys, or ledger data from another developer.
> All certificates, identities, channel genesis blocks, and cryptographic material are generated locally from scratch by `setup-windows.ps1` and `generate-identities.ps1`. Running these scripts on a fresh clone produces a completely self-contained, working Hyperledger Fabric network without any external artifacts.

