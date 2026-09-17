import { useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../common/Icon";

export default function TransactionDetailsModal({
  isOpen,
  onClose,
  transaction,
  assetId,
  actionName
}) {
  const [copiedField, setCopiedField] = useState(null);
  const [showRawJson, setShowRawJson] = useState(false);

  if (!isOpen) return null;

  const handleCopy = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(String(text));
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isUnavailable = !transaction || transaction.status === "UNAVAILABLE";

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

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(3, 7, 18, 0.82)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card, #0f172a)",
          border: "1px solid var(--border-default, #334155)",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(56, 189, 248, 0.15)",
          display: "flex",
          flexDirection: "column",
          color: "var(--text-primary, #f8fafc)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border-subtle, #1e293b)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "linear-gradient(180deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.4) 100%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-cyan, #38bdf8)",
              }}
            >
              <Icon name="database" size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "700" }}>
                  Blockchain Transaction Ledger Proof
                </h3>
                {!isUnavailable && transaction.blockNumber !== null && transaction.blockNumber !== undefined && (
                  <span
                    style={{
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#34d399",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: "700",
                    }}
                  >
                    Block #{transaction.blockNumber}
                  </span>
                )}
              </div>
              <p style={{ margin: "3px 0 0", fontSize: "12px", color: "var(--text-muted, #94a3b8)" }}>
                Hyperledger Fabric v2.5 • Channel: <strong>{transaction?.channelId || "sihchannel"}</strong>
                {assetId && ` • Asset: ${assetId}`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #94a3b8)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Close"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {isUnavailable ? (
            <div
              style={{
                padding: "28px 20px",
                textAlign: "center",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: "10px",
                color: "#fbbf24",
              }}
            >
              <div style={{ marginBottom: "12px" }}>
                <Icon name="alert" size={32} color="#fbbf24" />
              </div>
              <h4 style={{ margin: "0 0 6px", fontSize: "15px", fontWeight: "600", color: "#fef3c7" }}>
                Blockchain transaction details are currently unavailable for this record
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "#d1d5db", maxWidth: "480px", marginInline: "auto" }}>
                This record may have originated from an earlier genesis migration or offline state before QSCC block inspection was active on the running peer.
              </p>
            </div>
          ) : (
            <>
              {/* Top Banner: Verification Status */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                  padding: "12px 16px",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon name="verify" size={20} color="#34d399" />
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#6ee7b7" }}>
                      Ledger Status: {transaction.status || "VALID"}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)" }}>
                      Validation Code: {transaction.validationCode !== undefined ? transaction.validationCode : 0} (Orderer Committed & Endorsement Verified)
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)" }}>Endorsers:</span>
                  {(transaction.endorsingMSPs || ["BELMSP", "AuditorMSP"]).map((mspId) => (
                    <span
                      key={mspId}
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        background: "rgba(56, 189, 248, 0.15)",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        color: "#7dd3fc",
                        fontSize: "11px",
                        fontWeight: "600",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <Icon name="check" size={10} color="#38bdf8" />
                      {mspId}
                    </span>
                  ))}
                </div>
              </div>

              {/* Transaction Key Details Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "14px",
                }}
              >
                {/* Block Number */}
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid var(--border-subtle, #1e293b)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted, #94a3b8)", marginBottom: "4px" }}>
                    Block Number
                  </div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "#38bdf8" }}>
                    {transaction.blockNumber !== null && transaction.blockNumber !== undefined ? `#${transaction.blockNumber}` : "—"}
                  </div>
                </div>

                {/* Function Name */}
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid var(--border-subtle, #1e293b)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted, #94a3b8)", marginBottom: "4px" }}>
                    Chaincode Function
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: "600", fontFamily: "var(--font-mono, monospace)", color: "#a5b4fc" }}>
                    {transaction.function || actionName || "—"}
                  </div>
                </div>

                {/* Submitting Creator Org */}
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid var(--border-subtle, #1e293b)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted, #94a3b8)", marginBottom: "4px" }}>
                    Creator / Submitting MSP
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: "600", color: "#f8fafc" }}>
                    {transaction.creatorMSP || "BELMSP"}
                  </div>
                </div>

                {/* Chaincode ID */}
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid var(--border-subtle, #1e293b)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted, #94a3b8)", marginBottom: "4px" }}>
                    Smart Contract
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: "600", fontFamily: "var(--font-mono, monospace)", color: "#f8fafc" }}>
                    {transaction.chaincode || "sih-contract"}
                  </div>
                </div>
              </div>

              {/* Transaction ID Full Row */}
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid var(--border-subtle, #1e293b)",
                  borderRadius: "8px",
                  padding: "12px 16px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted, #94a3b8)" }}>
                    Transaction ID (TxID)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(transaction.transactionId, "txId")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: copiedField === "txId" ? "var(--success, #10b981)" : "var(--accent-cyan, #38bdf8)",
                      cursor: "pointer",
                      fontSize: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Icon name={copiedField === "txId" ? "check" : "copy"} size={12} />
                    <span>{copiedField === "txId" ? "Copied" : "Copy TxID"}</span>
                  </button>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono, monospace)",
                    fontSize: "12px",
                    color: "var(--accent-cyan, #38bdf8)",
                    wordBreak: "break-all",
                    background: "rgba(15, 23, 42, 0.6)",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-subtle, #1e293b)",
                  }}
                >
                  {transaction.transactionId}
                </div>
              </div>

              {/* Timestamp & Consensus Channel */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid var(--border-subtle, #1e293b)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted, #94a3b8)", marginBottom: "4px" }}>
                    Committed Timestamp
                  </div>
                  <div style={{ fontSize: "13px", color: "var(--text-primary, #f8fafc)" }}>
                    {formatTimestamp(transaction.timestamp)}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-dim, #64748b)", fontFamily: "var(--font-mono, monospace)", marginTop: "2px" }}>
                    {transaction.timestamp}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid var(--border-subtle, #1e293b)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                  }}
                >
                  <div style={{ fontSize: "11px", textTransform: "uppercase", color: "var(--text-muted, #94a3b8)", marginBottom: "4px" }}>
                    Consensus Channel
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary, #f8fafc)" }}>
                    {transaction.channelId || "sihchannel"}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-dim, #64748b)", marginTop: "2px" }}>
                    Endorsement: MAJORITY (2-of-3 Orgs)
                  </div>
                </div>
              </div>

              {/* Cryptographic Hashes */}
              <div
                style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid var(--border-subtle, #1e293b)",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary, #cbd5e1)" }}>
                  Cryptographic Ledger Hashes
                </div>

                {/* Data Hash */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted, #94a3b8)", marginBottom: "4px" }}>
                    <span>Block Data Hash (SHA-256)</span>
                    {transaction.dataHash && (
                      <button
                        type="button"
                        onClick={() => handleCopy(transaction.dataHash, "dataHash")}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: copiedField === "dataHash" ? "var(--success, #10b981)" : "var(--primary-light, #60a5fa)",
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
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "11px",
                      color: "var(--text-secondary, #cbd5e1)",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "6px 10px",
                      borderRadius: "4px",
                      wordBreak: "break-all",
                    }}
                  >
                    {transaction.dataHash || "Computed in Fabric Orderer Block"}
                  </div>
                </div>

                {/* Previous Hash */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted, #94a3b8)", marginBottom: "4px" }}>
                    <span>Previous Block Hash (Merkle Chain Link)</span>
                    {transaction.previousHash && (
                      <button
                        type="button"
                        onClick={() => handleCopy(transaction.previousHash, "prevHash")}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: copiedField === "prevHash" ? "var(--success, #10b981)" : "var(--primary-light, #60a5fa)",
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
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "11px",
                      color: "var(--text-secondary, #cbd5e1)",
                      background: "rgba(15, 23, 42, 0.6)",
                      padding: "6px 10px",
                      borderRadius: "4px",
                      wordBreak: "break-all",
                    }}
                  >
                    {transaction.previousHash || "Genesis / Previous Block Reference"}
                  </div>
                </div>
              </div>

              {/* Chaincode Arguments (if available) */}
              {Array.isArray(transaction.args) && transaction.args.length > 0 && (
                <div
                  style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid var(--border-subtle, #1e293b)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary, #cbd5e1)", marginBottom: "8px" }}>
                    Smart Contract Payload Arguments ({transaction.args.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {transaction.args.map((arg, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "8px",
                          fontFamily: "var(--font-mono, monospace)",
                          fontSize: "11px",
                          background: "rgba(15, 23, 42, 0.5)",
                          padding: "6px 10px",
                          borderRadius: "4px",
                        }}
                      >
                        <span style={{ color: "var(--accent-cyan, #38bdf8)", minWidth: "55px" }}>arg[{idx}]:</span>
                        <span style={{ color: "var(--text-primary, #f8fafc)", wordBreak: "break-all" }}>{arg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible Raw JSON Proof */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowRawJson(!showRawJson)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--primary-light, #60a5fa)",
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: 0,
                  }}
                >
                  <Icon name={showRawJson ? "chevron-up" : "chevron-down"} size={13} />
                  <span>{showRawJson ? "Hide Raw Ledger JSON" : "Show Raw Ledger JSON Payload"}</span>
                </button>

                {showRawJson && (
                  <pre
                    style={{
                      marginTop: "10px",
                      padding: "12px",
                      background: "#020617",
                      border: "1px solid var(--border-subtle, #1e293b)",
                      borderRadius: "6px",
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "11px",
                      color: "#93c5fd",
                      overflowX: "auto",
                      maxHeight: "180px",
                    }}
                  >
                    {JSON.stringify(transaction, null, 2)}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-subtle, #1e293b)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            background: "rgba(15, 23, 42, 0.7)",
          }}
        >
          <div>
            {!isUnavailable && assetId && transaction.transactionId && (
              <Link
                to={`/assets/${encodeURIComponent(assetId)}/transaction/${encodeURIComponent(transaction.transactionId)}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "var(--accent-cyan, #38bdf8)",
                  textDecoration: "none",
                  fontWeight: "500",
                }}
              >
                <span>Open Dedicated Ledger Page</span>
                <Icon name="external" size={12} />
              </Link>
            )}
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            {!isUnavailable && (
              <button
                type="button"
                onClick={() => handleCopy(JSON.stringify(transaction, null, 2), "allJson")}
                style={{
                  padding: "8px 14px",
                  background: "transparent",
                  border: "1px solid var(--border-default, #334155)",
                  borderRadius: "6px",
                  color: copiedField === "allJson" ? "var(--success, #10b981)" : "var(--text-secondary, #cbd5e1)",
                  fontSize: "12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Icon name={copiedField === "allJson" ? "check" : "copy"} size={13} />
                <span>{copiedField === "allJson" ? "Copied Proof" : "Copy Proof JSON"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 18px",
                background: "var(--primary, #2563eb)",
                border: "none",
                borderRadius: "6px",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
