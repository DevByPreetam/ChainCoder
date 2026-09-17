import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../styles/blockchain-landing.css";

const API_BASE = "http://localhost:5000/api/public/blockchain";

export default function BlockchainLanding() {
  const { isAuthenticated } = useAuth();

  const [blocks, setBlocks] = useState([]);
  const [network, setNetwork] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [autoPulse, setAutoPulse] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedHash, setCopiedHash] = useState(null);
  const [newBlockId, setNewBlockId] = useState(null);

  const railRef = useRef(null);

  // Fetch chain data from backend
  async function loadChainData(isInitial = false) {
    try {
      if (isInitial) setLoading(true);
      const res = await fetch(`${API_BASE}/blocks`);
      const data = await res.json();

      if (data.success) {
        setBlocks(data.blocks || []);
        setNetwork(data.network || null);

        // Auto-select latest block if none selected or initial
        if (isInitial && data.blocks?.length > 0) {
          setSelectedBlock(data.blocks[data.blocks.length - 1]);
        }
      }
    } catch (err) {
      console.error("Failed to load blockchain data:", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  }

  useEffect(() => {
    loadChainData(true);
  }, []);

  // Auto-scroll rail to the end when blocks update
  useEffect(() => {
    if (railRef.current && blocks.length > 0) {
      railRef.current.scrollLeft = railRef.current.scrollWidth;
    }
  }, [blocks.length]);

  // Live Auto-Pulse toggle (simulates a heartbeat / new telemetry block every 7 seconds)
  useEffect(() => {
    let timer = null;
    if (autoPulse) {
      timer = setInterval(() => {
        triggerSimulation("AutomatedTelemetryPing", "AST-20", "Automated Defense Sensor Hash Commitment");
      }, 7000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [autoPulse]);

  // Trigger block simulation
  async function triggerSimulation(functionType = "DefenseAssetVerification", assetId = "AST-20", desc = "Multi-Party Cryptographic Seal Endorsement") {
    try {
      setSimulating(true);
      const res = await fetch(`${API_BASE}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          functionType,
          assetId,
          identityId: "BEL006",
          actionDescription: desc
        })
      });

      const data = await res.json();
      if (data.success && data.block) {
        setNewBlockId(data.block.blockNumber);
        await loadChainData(false);
        setSelectedBlock(data.block);

        setTimeout(() => setNewBlockId(null), 2000);
      }
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setSimulating(false);
    }
  }

  function handleCopy(text) {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  }

  // Filtered blocks
  const filteredBlocks = blocks.filter((b) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const matchesNum = b.blockNumber.toString().includes(term);
    const matchesHash = b.blockHash.toLowerCase().includes(term);
    const matchesTx = b.transactions?.some(
      (t) =>
        t.txId?.toLowerCase().includes(term) ||
        t.function?.toLowerCase().includes(term) ||
        JSON.stringify(t.payload).toLowerCase().includes(term)
    );
    return matchesNum || matchesHash || matchesTx;
  });

  return (
    <div className="bcl-page">
      {/* ─── TOP NAVBAR ────────────────────────────────────────────── */}
      <nav className="bcl-nav">
        <Link to="/" className="bcl-nav-brand">
          <div className="bcl-nav-logo">🛡️</div>
          <div>
            <div className="bcl-nav-title">
              ChainCoder <span className="bcl-nav-badge">SIH 2026 DEFENSE</span>
            </div>
          </div>
        </Link>

        <div className="bcl-nav-center">
          <div className="bcl-channel-pill">
            <span className="bcl-pulse-dot"></span>
            <span>Channel: <strong style={{ color: "#38bdf8" }}>sihchannel</strong></span>
            <span>•</span>
            <span>3 Peers Online</span>
          </div>
        </div>

        <div className="bcl-nav-actions">
          <Link to="/verify" className="bcl-btn-secondary">
            🔍 Verify Document
          </Link>
          <Link
            to={isAuthenticated ? "/dashboard" : "/login"}
            className="bcl-btn-secondary"
          >
            📊 Dashboard
          </Link>
          <Link
            to={isAuthenticated ? "/dashboard" : "/login"}
            className="bcl-btn-primary"
          >
            {isAuthenticated ? "Go to Dashboard ➔" : "Sign In to Platform ➔"}
          </Link>
        </div>
      </nav>

      {/* ─── HERO SECTION ─────────────────────────────────────────── */}
      <header className="bcl-hero">
        <div className="bcl-hero-tag">
          ⚡ Hyperledger Fabric v2.5+ Distributed Ledger Simulation
        </div>
        <h1 className="bcl-hero-title">
          India's Defense Asset Ledger Explorer
        </h1>
        <p className="bcl-hero-desc">
          Live visualization of cryptographically linked blocks on <strong>sihchannel</strong>.
          Every asset mint, access grant, and identity is co-endorsed by Bharat Electronics Limited (BEL) and the Defense Auditor.
        </p>
      </header>

      {/* ─── NETWORK STATS RIBBON ─────────────────────────────────── */}
      <div className="bcl-stats-ribbon">
        <div className="bcl-stat-card">
          <span className="bcl-stat-label">Block Height</span>
          <span className="bcl-stat-val">#{network?.blockHeight ?? blocks.length}</span>
          <span className="bcl-stat-sub">✓ Chained Blocks</span>
        </div>

        <div className="bcl-stat-card">
          <span className="bcl-stat-label">Total Transactions</span>
          <span className="bcl-stat-val">{network?.totalTransactions ?? 0}</span>
          <span className="bcl-stat-sub">100% Validated (VSCC)</span>
        </div>

        <div className="bcl-stat-card">
          <span className="bcl-stat-label">Consensus Protocol</span>
          <span className="bcl-stat-val" style={{ fontSize: "16px" }}>etcdraft (Raft)</span>
          <span className="bcl-stat-sub">3-Node Orderer Cluster</span>
        </div>

        <div className="bcl-stat-card">
          <span className="bcl-stat-label">Endorsement Policy</span>
          <span className="bcl-stat-val" style={{ fontSize: "16px", color: "#818cf8" }}>BEL + Auditor</span>
          <span className="bcl-stat-sub">Multi-Party Co-Endorsed</span>
        </div>

        <div className="bcl-stat-card">
          <span className="bcl-stat-label">Smart Contract</span>
          <span className="bcl-stat-val" style={{ fontSize: "16px", color: "#38bdf8" }}>sih-contract v3.2</span>
          <span className="bcl-stat-sub">Sequence 12 Committed</span>
        </div>
      </div>

      {/* ─── INTERACTIVE TOOLBAR ───────────────────────────────────── */}
      <div className="bcl-toolbar">
        <div className="bcl-toolbar-left">
          <button
            type="button"
            className="bcl-sim-btn"
            onClick={() => triggerSimulation()}
            disabled={simulating}
          >
            {simulating ? "⚡ Endorsing Block..." : "⚡ Simulate New Block"}
          </button>

          <button
            type="button"
            className={`bcl-auto-btn ${autoPulse ? "active" : ""}`}
            onClick={() => setAutoPulse(!autoPulse)}
          >
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: autoPulse ? "#38bdf8" : "#64748b",
              }}
            ></span>
            {autoPulse ? "Live Stream: ACTIVE (7s)" : "Live Stream: PAUSED"}
          </button>

          <button
            type="button"
            className="bcl-auto-btn"
            onClick={() => loadChainData(false)}
          >
            ↻ Sync Chain
          </button>
        </div>

        <div>
          <input
            type="text"
            className="bcl-search-input"
            placeholder="Search Block #, TxID, AST-20, BEL006..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* ─── HORIZONTAL BLOCKCHAIN RAIL ────────────────────────────── */}
      <div className="bcl-chain-container">
        <div className="bcl-chain-header">
          <div className="bcl-chain-title">
            <span>🔗</span> Cryptographic Block Chain ({filteredBlocks.length} blocks rendered)
          </div>
          <span style={{ fontSize: "12px", color: "#64748b" }}>
            Click any block to inspect cryptographic headers, payloads, & read/write sets
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
            Loading blockchain ledger state...
          </div>
        ) : (
          <div className="bcl-rail-scroll" ref={railRef}>
            {filteredBlocks.map((blk, idx) => {
              const isSelected = selectedBlock?.blockNumber === blk.blockNumber;
              const isNew = newBlockId === blk.blockNumber;
              const tx = blk.transactions?.[0];

              let badgeClass = "bcl-badge-tx";
              if (blk.blockNumber === 0) badgeClass = "bcl-badge-genesis";
              else if (blk.type?.includes("CONFIG") || blk.blockNumber === 1) badgeClass = "bcl-badge-config";
              else if (blk.type?.includes("SIMULATED")) badgeClass = "bcl-badge-sim";

              return (
                <div key={blk.blockNumber} className="bcl-block-node">
                  <div
                    className={`bcl-block-card ${isSelected ? "selected" : ""} ${isNew ? "is-new" : ""}`}
                    onClick={() => setSelectedBlock(blk)}
                  >
                    <div className="bcl-block-top">
                      <span className="bcl-block-num">Block #{blk.blockNumber}</span>
                      <span className={`bcl-block-badge ${badgeClass}`}>
                        {blk.blockNumber === 0 ? "GENESIS" : blk.type?.replace("_BLOCK", "")}
                      </span>
                    </div>

                    <div className="bcl-block-meta">
                      <div className="bcl-block-fn">
                        {tx ? `⚡ ${tx.function || tx.type}` : "1 Transaction"}
                      </div>
                      <div className="bcl-block-time">
                        {new Date(blk.timestamp).toLocaleTimeString()} · {blk.txCount || 1} tx(s)
                      </div>

                      <div className="bcl-block-hash-preview" title={blk.blockHash}>
                        <span>{blk.blockHash?.substring(0, 14)}...</span>
                        <span style={{ color: "#38bdf8", fontSize: "9px" }}>SHA-256</span>
                      </div>
                    </div>
                  </div>

                  {idx < filteredBlocks.length - 1 && (
                    <div className="bcl-chain-arrow" title="Cryptographically Chained via prevHash">
                      ➔
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── DEEP BLOCK INSPECTOR DOSSIER ─────────────────────────── */}
      {selectedBlock && (
        <div className="bcl-inspector-card">
          <div className="bcl-inspector-body">
            <div className="bcl-inspector-head">
              <div>
                <div className="bcl-inspector-title">
                  <span>📦</span> Deep Block Dossier: Block #{selectedBlock.blockNumber}
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "4px" }}>
                  Channel: <strong>sihchannel</strong> · Committed on: {new Date(selectedBlock.timestamp).toLocaleString()}
                </div>
              </div>

              <div className="bcl-verify-badge">
                <span>✓</span> Cryptographically Chained (SHA-256 Validated)
              </div>
            </div>

            {/* Hashes Grid */}
            <div className="bcl-hash-grid">
              <div className="bcl-hash-box">
                <div className="bcl-hash-label">Current Block Hash</div>
                <div className="bcl-hash-val">
                  {selectedBlock.blockHash}
                  <button
                    type="button"
                    onClick={() => handleCopy(selectedBlock.blockHash)}
                    style={{
                      marginLeft: "8px",
                      background: "none",
                      border: "none",
                      color: "#93c5fd",
                      cursor: "pointer",
                      fontSize: "11px",
                    }}
                  >
                    {copiedHash === selectedBlock.blockHash ? "✓ Copied" : "📋 Copy"}
                  </button>
                </div>
              </div>

              <div className="bcl-hash-box">
                <div className="bcl-hash-label">Previous Block Hash (Merkle Chain Link)</div>
                <div className="bcl-hash-val" style={{ color: "#94a3b8" }}>
                  {selectedBlock.prevHash}
                </div>
              </div>
            </div>

            {/* Transactions Section */}
            <div className="bcl-tx-section-title">
              Block Payload: {selectedBlock.transactions?.length || 0} Endorsed Transaction(s)
            </div>

            {selectedBlock.transactions?.map((tx, tIdx) => (
              <div key={tx.txId || tIdx} className="bcl-tx-item">
                <div className="bcl-tx-header">
                  <div>
                    <span style={{ fontSize: "11px", color: "#64748b", marginRight: "6px" }}>Tx #{tIdx + 1}:</span>
                    <span className="bcl-tx-id">{tx.txId}</span>
                  </div>
                  <span
                    style={{
                      padding: "2px 8px",
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "#34d399",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: 700,
                    }}
                  >
                    VALID (VSCC_PASSED)
                  </span>
                </div>

                <div className="bcl-tx-grid">
                  <div className="bcl-tx-grid-item">
                    <span className="bcl-tx-grid-label">Smart Contract Function</span>
                    <span className="bcl-tx-grid-val" style={{ color: "#38bdf8" }}>{tx.function}</span>
                  </div>

                  <div className="bcl-tx-grid-item">
                    <span className="bcl-tx-grid-label">Invoking MSP</span>
                    <span className="bcl-tx-grid-val">{tx.creatorMSP} ({tx.creatorId})</span>
                  </div>

                  <div className="bcl-tx-grid-item">
                    <span className="bcl-tx-grid-label">Endorsement Signatures</span>
                    <span className="bcl-tx-grid-val" style={{ fontSize: "11px", color: "#a78bfa" }}>
                      {tx.endorsingPeers?.join(", ") || "BELMSP + AuditorMSP"}
                    </span>
                  </div>
                </div>

                {/* Read/Write Set Box */}
                {tx.readWriteSet && (
                  <div className="bcl-rw-box">
                    <div className="bcl-rw-title">Ledger Read / Write Set (State Transitions)</div>
                    <div style={{ color: "#e2e8f0" }}>
                      <div>
                        <span style={{ color: "#64748b" }}>Writes:</span>{" "}
                        {tx.readWriteSet.writes?.map((w) => (
                          <span key={w.key} style={{ marginRight: "10px", color: "#34d399" }}>
                            {w.key} ➔ {typeof w.value === "object" ? JSON.stringify(w.value) : w.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Raw Payload Preview */}
                <div style={{ marginTop: "12px" }}>
                  <details style={{ cursor: "pointer", fontSize: "11px", color: "#94a3b8" }}>
                    <summary style={{ fontWeight: 600 }}>View Raw Transaction Decoded JSON Payload</summary>
                    <pre
                      style={{
                        background: "#050811",
                        padding: "12px",
                        borderRadius: "6px",
                        marginTop: "8px",
                        overflowX: "auto",
                        color: "#38bdf8",
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {JSON.stringify(tx.payload, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── CONSORTIUM TOPOLOGY SECTION ──────────────────────────── */}
      <section className="bcl-peers-section">
        <div className="bcl-peers-title">
          <span>🏛️</span> Active Consortium Topology (sihchannel)
        </div>

        <div className="bcl-peers-grid">
          <div className="bcl-peer-card">
            <div className="bcl-peer-head">
              <span className="bcl-peer-id">peer0.bel</span>
              <span className="bcl-peer-status"><span className="bcl-pulse-dot"></span> Online</span>
            </div>
            <span className="bcl-peer-role">Lead Endorser & Committer</span>
            <span className="bcl-peer-endpoint">localhost:7051 (BELMSP)</span>
          </div>

          <div className="bcl-peer-card">
            <div className="bcl-peer-head">
              <span className="bcl-peer-id">peer0.auditor</span>
              <span className="bcl-peer-status"><span className="bcl-pulse-dot"></span> Online</span>
            </div>
            <span className="bcl-peer-role">Independent Co-Signer & Auditor</span>
            <span className="bcl-peer-endpoint">localhost:8051 (AuditorMSP)</span>
          </div>

          <div className="bcl-peer-card">
            <div className="bcl-peer-head">
              <span className="bcl-peer-id">peer0.contractor</span>
              <span className="bcl-peer-status"><span className="bcl-pulse-dot"></span> Online</span>
            </div>
            <span className="bcl-peer-role">Defense Supplier Client Peer</span>
            <span className="bcl-peer-endpoint">localhost:9051 (ContractorMSP)</span>
          </div>

          <div className="bcl-peer-card">
            <div className="bcl-peer-head">
              <span className="bcl-peer-id">orderer1</span>
              <span className="bcl-peer-status"><span className="bcl-pulse-dot"></span> Raft Leader</span>
            </div>
            <span className="bcl-peer-role">Consensus & Block Sequencing</span>
            <span className="bcl-peer-endpoint">localhost:7050 (OrdererMSP)</span>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ────────────────────────────────────────────────── */}
      <footer className="bcl-footer">
        <div>
          ChainCoder Defense Asset Platform · Smart India Hackathon 2026 (SIH 2026)
        </div>
        <div style={{ marginTop: "6px", fontSize: "11px" }}>
          Built with Hyperledger Fabric v2.5+, Raft Consensus, InterPlanetary File System (IPFS), and React.
        </div>
      </footer>
    </div>
  );
}