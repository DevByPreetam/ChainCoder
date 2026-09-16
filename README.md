# ChainCoder – SIH 2026

A decentralized, blockchain-based document verification and access-control platform built with **Hyperledger Fabric v2.5**, **IPFS (Kubo)**, **Node.js / Express**, and **React + Vite**.

---

## Architecture Overview

```
Frontend (React + Vite :5173)  <--->  Backend (Express :5000)
                                            |
                         +------------------+------------------+
                         |                                     |
                         v                                     v
             Hyperledger Fabric (sihchannel)             IPFS Kubo (:5001)
             - BEL Peer        (:7051)                   - Local Daemon
             - Auditor Peer    (:8051)                   - Off-Chain Docs
             - Contractor Peer (:9051)
             - 3x Raft Orderers(:7050, 8050, 9050)
             - 4x Fabric CAs   (:7054, 8054, 9054, 10054)
```

---

## Quick Start (Fresh Windows Laptop)

> ⚠️ **IMPORTANT**: Do not copy `organizations/`, `.msp-enroll/`, `backend/fabric/bel/`, CA databases, private keys, or ledger data from another developer. All certificates, identities, channel blocks, and cryptographic material are generated locally and deterministically by `setup-windows.ps1` and `generate-identities.ps1`.

### 1. Prerequisites
Ensure you have installed:
- **Git**: https://git-scm.com/download/win
- **Node.js (v20+ LTS)**: https://nodejs.org/
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/ (Start it)
- **Fabric Binaries (v2.5.x)**: `peer`, `configtxgen`, `osnadmin`, `fabric-ca-client`
- **IPFS (Kubo)**: https://dist.ipfs.tech/#kubo (in `C:\ipfs` and on `PATH`)

See **[SETUP.md](./SETUP.md)** for detailed installation commands.

### 2. Clone and Setup
Open PowerShell and run:

```powershell
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd ChainCoder

# Run setup (installs deps, checks tools, generates fresh Fabric network)
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1
```

### 3. Start the Network
```powershell
# Starts Fabric CAs, orderers, peers, creates sihchannel, and deploys chaincode
powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1
```

### 4. Start IPFS Daemon
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-ipfs.ps1
```

### 5. Start Backend & Frontend
Terminal 1 (Backend):
```powershell
cd backend
npm run dev
```
Backend API will run at: **http://localhost:5000**

Terminal 2 (Frontend):
```powershell
cd frontend
npm run dev
```
Frontend UI will run at: **http://localhost:5173**

### 6. Verify Health
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\test-network.ps1
```

---

## Daily Startup Flow (Already Set Up)

After the initial setup, you only need to run:

```powershell
# 1. Start Fabric
powershell -ExecutionPolicy Bypass -File .\scripts\start-network.ps1

# 2. Start IPFS
powershell -ExecutionPolicy Bypass -File .\scripts\start-ipfs.ps1

# 3. Start Backend
cd backend; npm run dev

# 4. Start Frontend
cd frontend; npm run dev
```

---

## Stopping the Network

```powershell
# Stops Fabric containers safely (preserves ledger and volumes)
powershell -ExecutionPolicy Bypass -File .\scripts\stop-network.ps1

# Stops IPFS
powershell -ExecutionPolicy Bypass -File .\scripts\stop-ipfs.ps1
```

---

## Available Scripts

| Script | Purpose |
|---|---|
| `scripts\setup-windows.ps1` | Checks prerequisites, installs npm dependencies, generates local Fabric identities. |
| `scripts\start-network.ps1` | Starts Fabric network (creates channel and deploys chaincode on first run). |
| `scripts\stop-network.ps1` | Stops Fabric network safely without deleting ledger data. |
| `scripts\start-ipfs.ps1` | Starts the local IPFS daemon. |
| `scripts\stop-ipfs.ps1` | Stops the local IPFS daemon. |
| `scripts\test-network.ps1` | Full health test of Docker, Fabric, IPFS, Backend, and Chaincode. |
| `scripts\reset-network.ps1` | ⚠️ Destructive reset script (requires explicit confirmation). |

---

## Demo Credentials (In-Memory Auth)

| User ID | Password | Role | Organization |
|---|---|---|---|
| `BEL001` | `BelAdmin@123` | Admin | BEL |
| `BEL002` | `BelManager@123` | Manager | BEL |
| `BEL003` | `BelEmployee@123`| Employee | BEL |
| `AUD001` | `Auditor@123` | Auditor | Auditor |
| `CON001` | `ContractorAdmin@123` | Admin | Contractor |
| `CON002` | `Contractor@123` | User | Contractor |

---

## Full Documentation

For full architectural details, channel lifecycle walkthrough, troubleshooting, and security guidelines, see **[SETUP.md](./SETUP.md)**.
