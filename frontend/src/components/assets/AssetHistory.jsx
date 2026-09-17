import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAssetHistory } from "../../services/assetService";
import Icon from "../common/Icon";
import TransactionDetailsModal from "./TransactionDetailsModal";

function AssetHistory({ assetId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedTx, setCopiedTx] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [modalTx, setModalTx] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  async function loadHistory() {
    try {
      setLoading(true);
      setError("");
      const data = await getAssetHistory(assetId);
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Unable to load asset history from blockchain");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (assetId) {
      loadHistory();
    }
  }, [assetId]);

  function truncateTxId(txId) {
    if (!txId || txId === "—") return "—";
    if (txId.length <= 16) return txId;
    return `${txId.substring(0, 8)}…${txId.substring(txId.length - 6)}`;
  }

  function formatTimestamp(ts) {
    if (!ts || ts === "—") return "—";
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
      });
    } catch {
      return String(ts);
    }
  }

  const copyTx = (txId) => {
    if (!txId || txId === "—") return;
    navigator.clipboard.writeText(txId);
    setCopiedTx(txId);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  const toggleRow = (idx) => {
    setExpandedRows((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const openLedgerModal = (entry, actionName) => {
    // If backend already enriched with transaction details, use it directly
    const txData = entry.transaction || {
      transactionId: entry.txId,
      status: "UNAVAILABLE",
      message: "Blockchain transaction details are currently unavailable for this record"
    };
    setModalTx({
      ...txData,
      _actionName: actionName
    });
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="asset-history-message" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", padding: "36px" }}>
        <Icon name="history" size={20} color="var(--primary-light)" />
        <span>Loading immutable Hyperledger Fabric provenance for <strong>{assetId}</strong>…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="asset-history-error" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon name="alert" size={18} color="var(--danger)" />
          <span>{error}</span>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={loadHistory}
          style={{ fontSize: "12px", padding: "4px 10px" }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="asset-history-message" style={{ textAlign: "center", padding: "36px", color: "var(--text-muted)" }}>
        <Icon name="history" size={30} color="var(--text-dim)" />
        <p style={{ marginTop: "12px", fontWeight: "600", color: "var(--text-primary)" }}>
          No Blockchain History Recorded
        </p>
        <p style={{ fontSize: "12px" }}>
          There are currently no transaction blocks committed on sihchannel for asset {assetId}.
        </p>
      </div>
    );
  }

  return (
    <div className="asset-history-table-wrapper">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(15, 23, 42, 0.4)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            Ledger Transitions: <strong>{history.length}</strong>
          </span>
          <span
            style={{
              padding: "2px 8px",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.25)",
              borderRadius: "4px",
              fontSize: "11px",
              fontWeight: "600",
            }}
          >
            sihchannel • Raft Consensus
          </span>
        </div>
        <button
          type="button"
          onClick={loadHistory}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--primary-light)",
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <Icon name="history" size={13} />
          <span>Refresh Provenance</span>
        </button>
      </div>

      <table className="asset-history-table">
        <thead>
          <tr>
            <th style={{ width: "36px" }}></th>
            <th>TxID</th>
            <th>Action</th>
            <th>Block</th>
            <th>Org</th>
            <th>From → To</th>
            <th>Timestamp</th>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Ledger Proof</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry, index) => {
            const val = entry.value || {};
            const prevVal = index > 0 ? history[index - 1].value || {} : {};
            const tx = entry.transaction;

            // Action detection
            let action = entry.action;
            if (!action) {
              if (entry.isDelete) {
                action = "DELETE";
              } else if (tx?.function) {
                action = tx.function;
              } else if (index === 0) {
                action = "MINT_ASSET";
              } else if (val.owner && prevVal.owner && val.owner !== prevVal.owner) {
                action = "TRANSFER";
              } else if (val.documentHash && prevVal.documentHash && val.documentHash !== prevVal.documentHash) {
                action = "UPDATE_DOCUMENT";
              } else {
                action = "STATE_COMMIT";
              }
            }

            const previousOwner = entry.previousOwner || val.previousOwner || (index > 0 ? (prevVal.ownerOrganization || prevVal.owner) : "—") || "—";
            const newOwner = val.ownerOrganization ? `${val.ownerOrganization} (${val.owner || "—"})` : (val.owner || entry.owner || "—");
            const ts = tx?.timestamp || entry.timestamp || val.updatedAt || val.createdAt || null;
            const txId = entry.txId || tx?.transactionId || "—";
            const status = entry.isDelete ? "DELETED" : (tx?.status || val.status || entry.status || "COMMITTED");
            const blockNum = tx?.blockNumber !== undefined && tx?.blockNumber !== null ? `#${tx.blockNumber}` : null;
            const org = tx?.creatorMSP || val.ownerOrganization || (entry.txId ? "BELMSP" : "—");

            const isCopied = copiedTx === txId;
            const isExpanded = !!expandedRows[index];

            return (
              <>
                <tr
                  key={entry.txId || index}
                  style={{
                    background: isExpanded ? "rgba(30, 41, 59, 0.4)" : "transparent",
                    transition: "background 0.15s ease",
                  }}
                >
                  {/* Expand / Collapse Button */}
                  <td style={{ paddingLeft: "12px", paddingRight: "4px" }}>
                    <button
                      type="button"
                      onClick={() => toggleRow(index)}
                      title={isExpanded ? "Collapse transaction details" : "Expand blockchain transaction details"}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "4px",
                      }}
                    >
                      <Icon name={isExpanded ? "chevron-up" : "chevron-down"} size={14} />
                    </button>
                  </td>

                  {/* TxID */}
                  <td className="asset-history-txid">
                    {txId !== "—" ? (
                      <button
                        type="button"
                        onClick={() => copyTx(txId)}
                        title={`Click to copy full TxID: ${txId}`}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--primary-light)",
                          cursor: "pointer",
                          fontFamily: "var(--font-mono)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "12px",
                        }}
                      >
                        <span>{truncateTxId(txId)}</span>
                        <Icon name={isCopied ? "check" : "copy"} size={11} color={isCopied ? "var(--success)" : "var(--text-muted)"} />
                      </button>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>—</span>
                    )}
                  </td>

                  {/* Action */}
                  <td>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "12px",
                        color:
                          action === "MINT_ASSET" || action === "MintAsset"
                            ? "var(--success)"
                            : action === "TRANSFER" || action === "TransferAsset"
                            ? "var(--primary-light)"
                            : action === "DELETE"
                            ? "var(--danger)"
                            : "var(--text-primary)",
                      }}
                    >
                      {action}
                    </span>
                  </td>

                  {/* Block Number */}
                  <td>
                    {blockNum ? (
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: "#38bdf8",
                          background: "rgba(56, 189, 248, 0.12)",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          border: "1px solid rgba(56, 189, 248, 0.25)",
                        }}
                      >
                        {blockNum}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>—</span>
                    )}
                  </td>

                  {/* Submitting Org */}
                  <td>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "600",
                        color: "var(--text-secondary)",
                        background: "rgba(255, 255, 255, 0.05)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {org}
                    </span>
                  </td>

                  {/* From -> To */}
                  <td>
                    <div style={{ fontSize: "11px", display: "flex", flexDirection: "column" }}>
                      <span style={{ color: "var(--text-muted)" }}>From: {previousOwner}</span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>To: {newOwner}</span>
                    </div>
                  </td>

                  {/* Timestamp */}
                  <td className="asset-history-time" style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {formatTimestamp(ts)}
                  </td>

                  {/* Status */}
                  <td>
                    <span
                      className="status-badge"
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        background:
                          status === "DELETED"
                            ? "var(--danger-bg)"
                            : status === "VALID" || status === "COMMITTED" || status === "ACTIVE"
                            ? "var(--success-bg)"
                            : "var(--primary-subtle)",
                        color:
                          status === "DELETED"
                            ? "var(--danger)"
                            : status === "VALID" || status === "COMMITTED" || status === "ACTIVE"
                            ? "var(--success)"
                            : "var(--primary-light)",
                        border: `1px solid ${
                          status === "DELETED"
                            ? "var(--danger-border)"
                            : status === "VALID" || status === "COMMITTED" || status === "ACTIVE"
                            ? "var(--success-border)"
                            : "var(--border-default)"
                        }`,
                        fontWeight: "600",
                      }}
                    >
                      {status}
                    </span>
                  </td>

                  {/* View on Ledger Button */}
                  <td style={{ textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => openLedgerModal(entry, action)}
                      className="btn btn-outline"
                      style={{
                        fontSize: "11px",
                        padding: "4px 9px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px",
                        color: "var(--accent-cyan)",
                        borderColor: "rgba(56, 189, 248, 0.4)",
                        background: "rgba(56, 189, 248, 0.08)",
                      }}
                      title="View real cryptographic Hyperledger Fabric transaction proof"
                    >
                      <Icon name="database" size={12} />
                      <span>View on Ledger</span>
                    </button>
                  </td>
                </tr>

                {/* Inline Expandable Blockchain Transaction Details Card */}
                {isExpanded && (
                  <tr key={`${entry.txId || index}-expanded`} style={{ background: "rgba(15, 23, 42, 0.75)" }}>
                    <td colSpan="9" style={{ padding: "16px 20px" }}>
                      {!tx || tx.status === "UNAVAILABLE" ? (
                        <div
                          style={{
                            padding: "12px 16px",
                            background: "rgba(245, 158, 11, 0.08)",
                            border: "1px solid rgba(245, 158, 11, 0.25)",
                            borderRadius: "8px",
                            color: "#fbbf24",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            fontSize: "12px",
                          }}
                        >
                          <Icon name="alert" size={16} color="#fbbf24" />
                          <span>Blockchain transaction details are currently unavailable for this record.</span>
                        </div>
                      ) : (
                        <div
                          style={{
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "10px",
                            background: "rgba(2, 6, 23, 0.6)",
                            padding: "16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "14px",
                          }}
                        >
                          {/* Card Banner */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: "8px",
                              paddingBottom: "10px",
                              borderBottom: "1px solid var(--border-subtle)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <Icon name="verify" size={16} color="#34d399" />
                              <span style={{ fontSize: "13px", fontWeight: "700", color: "#6ee7b7" }}>
                                Hyperledger Fabric Provenance Verification
                              </span>
                              <span
                                style={{
                                  fontSize: "11px",
                                  padding: "2px 6px",
                                  background: "rgba(56, 189, 248, 0.15)",
                                  color: "#38bdf8",
                                  borderRadius: "4px",
                                }}
                              >
                                Channel: {tx.channelId || "sihchannel"}
                              </span>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <button
                                type="button"
                                onClick={() => openLedgerModal(entry, action)}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--accent-cyan)",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "4px",
                                }}
                              >
                                <Icon name="external" size={12} />
                                <span>Inspect Full Modal</span>
                              </button>
                              {txId !== "—" && (
                                <Link
                                  to={`/assets/${encodeURIComponent(assetId)}/transaction/${encodeURIComponent(txId)}`}
                                  style={{
                                    fontSize: "12px",
                                    color: "var(--primary-light)",
                                    textDecoration: "none",
                                    marginLeft: "8px",
                                  }}
                                >
                                  Dedicated Page →
                                </Link>
                              )}
                            </div>
                          </div>

                          {/* Technical Grid */}
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                              gap: "12px",
                            }}
                          >
                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Block Number</div>
                              <div style={{ fontSize: "13px", fontWeight: "700", color: "#38bdf8" }}>
                                {tx.blockNumber !== null && tx.blockNumber !== undefined ? `#${tx.blockNumber}` : "—"}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Function</div>
                              <div style={{ fontSize: "13px", fontWeight: "600", color: "#a5b4fc", fontFamily: "var(--font-mono)" }}>
                                {tx.function || action}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Submitting MSP</div>
                              <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                                {tx.creatorMSP || "BELMSP"}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Smart Contract</div>
                              <div style={{ fontSize: "13px", color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                                {tx.chaincode || "sih-contract"}
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Validation Code</div>
                              <div style={{ fontSize: "13px", color: "var(--success)" }}>
                                {tx.validationCode ?? 0} ({tx.status || "VALID"})
                              </div>
                            </div>

                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Endorsing MSPs</div>
                              <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                                {(tx.endorsingMSPs || ["BELMSP", "AuditorMSP"]).map((m) => (
                                  <span
                                    key={m}
                                    style={{
                                      fontSize: "11px",
                                      padding: "1px 6px",
                                      borderRadius: "3px",
                                      background: "rgba(56, 189, 248, 0.15)",
                                      color: "#7dd3fc",
                                    }}
                                  >
                                    {m}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Full TxID & Hashes */}
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                            <div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>
                                Full Transaction Hash (TxID):
                              </div>
                              <div
                                style={{
                                  fontFamily: "var(--font-mono)",
                                  fontSize: "11px",
                                  color: "var(--accent-cyan)",
                                  wordBreak: "break-all",
                                }}
                              >
                                {tx.transactionId || txId}
                              </div>
                            </div>

                            {tx.dataHash && (
                              <div>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>
                                  Block Data Hash:
                                </div>
                                <div
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "11px",
                                    color: "var(--text-secondary)",
                                    wordBreak: "break-all",
                                  }}
                                >
                                  {tx.dataHash}
                                </div>
                              </div>
                            )}

                            {tx.previousHash && (
                              <div>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>
                                  Previous Block Hash:
                                </div>
                                <div
                                  style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: "11px",
                                    color: "var(--text-secondary)",
                                    wordBreak: "break-all",
                                  }}
                                >
                                  {tx.previousHash}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>

      {/* Modal for full ledger proof view */}
      <TransactionDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        transaction={modalTx}
        assetId={assetId}
        actionName={modalTx?._actionName}
      />
    </div>
  );
}

export default AssetHistory;
