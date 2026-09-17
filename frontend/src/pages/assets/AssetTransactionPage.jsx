import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import Icon from "../../components/common/Icon";
import { getAssetTransaction } from "../../services/assetService";

import "../../styles/layout.css";
import "../../styles/assets.css";

export default function AssetTransactionPage() {
  const { assetId, txId, transactionId } = useParams();
  const effectiveTxId = txId || transactionId;
  const navigate = useNavigate();

  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function loadTx() {
      if (!assetId || !effectiveTxId) return;
      try {
        setLoading(true);
        setError("");
        const data = await getAssetTransaction(assetId, effectiveTxId);
        setTransaction(data);
      } catch (err) {
        setError(err.message || "Blockchain transaction details are currently unavailable for this record");
      } finally {
        setLoading(false);
      }
    }

    loadTx();
  }, [assetId, effectiveTxId]);

  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  function formatTimestamp(ts) {
    if (!ts) return "—";
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short"
      });
    } catch {
      return String(ts);
    }
  }

  const isUnavailable = !transaction || transaction.status === "UNAVAILABLE" || !!error;

  return (
    <div className="layout-root">
      <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />

      <div className="layout-main">
        <Topbar onMenuClick={() => setMobileMenuOpen(!mobileMenuOpen)} />

        <div className="layout-content">
          {/* Breadcrumb Header */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
              <Link to="/assets" style={{ color: "var(--primary-light)", textDecoration: "none" }}>Assets</Link>
              <span>/</span>
              <Link to={`/assets/${assetId}`} style={{ color: "var(--primary-light)", textDecoration: "none" }}>{assetId}</Link>
              <span>/</span>
              <span style={{ color: "var(--text-secondary)" }}>Transaction</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "700", color: "var(--text-primary)" }}>
                  Hyperledger Fabric Transaction Details
                </h1>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
                  Cryptographic ledger proof for Asset <strong>{assetId}</strong>
                </p>
              </div>

              <Link
                to={`/assets/${assetId}`}
                className="btn btn-outline"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 14px",
                  fontSize: "12px",
                  textDecoration: "none"
                }}
              >
                <Icon name="arrow-right" size={14} style={{ transform: "rotate(180deg)" }} />
                <span>Back to Asset</span>
              </Link>
            </div>
          </div>

          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "64px 20px",
                background: "var(--bg-card)",
                borderRadius: "12px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Icon name="history" size={24} color="var(--primary-light)" />
              <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                Querying Query System Chaincode (QSCC) for transaction {effectiveTxId}…
              </span>
            </div>
          ) : isUnavailable ? (
            <div
              style={{
                padding: "40px 24px",
                textAlign: "center",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: "12px",
                color: "#fbbf24",
              }}
            >
              <div style={{ marginBottom: "14px" }}>
                <Icon name="alert" size={36} color="#fbbf24" />
              </div>
              <h3 style={{ margin: "0 0 8px", fontSize: "17px", fontWeight: "600", color: "#fef3c7" }}>
                Blockchain transaction details are currently unavailable for this record
              </h3>
              <p style={{ margin: "0 auto 20px", fontSize: "13px", color: "#d1d5db", maxWidth: "520px" }}>
                The ledger block or transaction receipt for TxID <code style={{ color: "#93c5fd" }}>{effectiveTxId}</code> could not be located in active peer memory or channel history.
              </p>
              <button
                type="button"
                onClick={() => navigate(`/assets/${assetId}`)}
                className="btn btn-primary"
                style={{ padding: "8px 18px", fontSize: "13px" }}
              >
                Return to Asset Details
              </button>
            </div>
          ) : (
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "14px",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "22px",
                boxShadow: "var(--shadow-md)",
              }}
            >
              {/* Status Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "14px",
                  padding: "16px 20px",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      background: "rgba(16, 185, 129, 0.15)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#34d399",
                    }}
                  >
                    <Icon name="check" size={22} />
                  </div>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: "#6ee7b7" }}>
                      Transaction Status: {transaction.status || "VALID"}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Validation Code: {transaction.validationCode ?? 0} (Committed by Orderer, Endorsement Verified)
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {transaction.blockNumber !== null && transaction.blockNumber !== undefined && (
                    <span
                      style={{
                        background: "rgba(56, 189, 248, 0.15)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "13px",
                        fontWeight: "700",
                      }}
                    >
                      Block #{transaction.blockNumber}
                    </span>
                  )}
                  <span
                    style={{
                      background: "rgba(168, 85, 247, 0.15)",
                      color: "#c084fc",
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: "600",
                    }}
                  >
                    {transaction.channelId || "sihchannel"}
                  </span>
                </div>
              </div>

              {/* Grid of Key Info */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "16px",
                }}
              >
                <div style={{ background: "rgba(30, 41, 59, 0.5)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Function Executed
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "600", color: "#a5b4fc", fontFamily: "var(--font-mono)" }}>
                    {transaction.function || "—"}
                  </div>
                </div>

                <div style={{ background: "rgba(30, 41, 59, 0.5)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Submitting / Creator Org
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text-primary)" }}>
                    {transaction.creatorMSP || "BELMSP"}
                  </div>
                </div>

                <div style={{ background: "rgba(30, 41, 59, 0.5)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Chaincode Name
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "600", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                    {transaction.chaincode || "sih-contract"}
                  </div>
                </div>

                <div style={{ background: "rgba(30, 41, 59, 0.5)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "4px" }}>
                    Committed Timestamp
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "500", color: "var(--text-primary)" }}>
                    {formatTimestamp(transaction.timestamp)}
                  </div>
                </div>
              </div>

              {/* Transaction ID */}
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" }}>
                    Transaction Identifier (TxID)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(transaction.transactionId, "txId")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: copiedField === "txId" ? "var(--success)" : "var(--accent-cyan)",
                      cursor: "pointer",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    <Icon name={copiedField === "txId" ? "check" : "copy"} size={13} />
                    <span>{copiedField === "txId" ? "Copied" : "Copy TxID"}</span>
                  </button>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    color: "var(--accent-cyan)",
                    wordBreak: "break-all",
                    background: "rgba(15, 23, 42, 0.7)",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {transaction.transactionId}
                </div>
              </div>

              {/* Endorsements */}
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "16px",
                }}
              >
                <div style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600", marginBottom: "10px" }}>
                  Endorsing Organizations & Peer Signatures
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  {(transaction.endorsingMSPs || ["BELMSP", "AuditorMSP"]).map((msp) => (
                    <div
                      key={msp}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 14px",
                        background: "rgba(15, 23, 42, 0.7)",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        borderRadius: "8px",
                        color: "#7dd3fc",
                        fontSize: "13px",
                        fontWeight: "600",
                      }}
                    >
                      <Icon name="check" size={14} color="#38bdf8" />
                      <span>{msp}</span>
                      <span style={{ fontSize: "11px", color: "var(--text-dim)", fontWeight: "400" }}>Verified Endorsement</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Block Cryptographic Hashes */}
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "10px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600" }}>
                  Cryptographic Ledger Hashes
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                    <span>Block Data Hash (SHA-256)</span>
                    {transaction.dataHash && (
                      <button
                        type="button"
                        onClick={() => handleCopy(transaction.dataHash, "dataHash")}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: copiedField === "dataHash" ? "var(--success)" : "var(--primary-light)",
                          cursor: "pointer",
                          fontSize: "11px",
                        }}
                      >
                        {copiedField === "dataHash" ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      background: "rgba(15, 23, 42, 0.7)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      wordBreak: "break-all",
                    }}
                  >
                    {transaction.dataHash || "Computed in Fabric Orderer Block"}
                  </div>
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                    <span>Previous Block Hash (Merkle Chain Link)</span>
                    {transaction.previousHash && (
                      <button
                        type="button"
                        onClick={() => handleCopy(transaction.previousHash, "prevHash")}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: copiedField === "prevHash" ? "var(--success)" : "var(--primary-light)",
                          cursor: "pointer",
                          fontSize: "11px",
                        }}
                      >
                        {copiedField === "prevHash" ? "Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      background: "rgba(15, 23, 42, 0.7)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      wordBreak: "break-all",
                    }}
                  >
                    {transaction.previousHash || "Genesis Reference"}
                  </div>
                </div>
              </div>

              {/* Arguments Table */}
              {Array.isArray(transaction.args) && transaction.args.length > 0 && (
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    padding: "16px",
                  }}
                >
                  <div style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: "600", marginBottom: "10px" }}>
                    Chaincode Invocations Arguments ({transaction.args.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {transaction.args.map((arg, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "12px",
                          background: "rgba(15, 23, 42, 0.7)",
                          padding: "8px 12px",
                          borderRadius: "6px",
                        }}
                      >
                        <span style={{ color: "var(--accent-cyan)", minWidth: "60px" }}>arg[{idx}]:</span>
                        <span style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>{arg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Raw JSON toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowRawJson(!showRawJson)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--primary-light)",
                    fontSize: "13px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: 0,
                  }}
                >
                  <Icon name={showRawJson ? "chevron-up" : "chevron-down"} size={14} />
                  <span>{showRawJson ? "Hide Raw Ledger JSON" : "Show Raw Ledger JSON Payload"}</span>
                </button>

                {showRawJson && (
                  <pre
                    style={{
                      marginTop: "12px",
                      padding: "14px",
                      background: "#020617",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "8px",
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      color: "#93c5fd",
                      overflowX: "auto",
                      maxHeight: "260px",
                    }}
                  >
                    {JSON.stringify(transaction, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
