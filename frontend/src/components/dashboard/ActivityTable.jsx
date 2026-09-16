import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Icon from "../common/Icon";

function ActivityTable({ activities = [] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [copiedTx, setCopiedTx] = useState(null);

  const isAuditor = user?.organization === "Auditor" && user?.role === "Auditor";

  const handleViewAll = () => {
    if (isAuditor) {
      navigate("/audit-history");
    } else {
      navigate("/assets");
    }
  };

  const copyToClipboard = (text, id) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTx(id);
    setTimeout(() => setCopiedTx(null), 2000);
  };

  const getStatusBadgeClass = (status) => {
    const s = (status || "").toUpperCase();
    if (s.includes("SUCCESS") || s.includes("GRANTED") || s.includes("ACTIVE") || s.includes("APPROVED") || s.includes("MINTED")) {
      return "badge-active";
    }
    if (s.includes("PENDING") || s.includes("REQUESTED")) {
      return "badge-pending";
    }
    if (s.includes("REVOKED") || s.includes("REJECTED") || s.includes("FAILED")) {
      return "badge-revoked";
    }
    return "badge-neutral";
  };

  return (
    <div className="dashboard-section">
      <div className="section-header">
        <div>
          <h3>Recent Blockchain Transactions</h3>
          <p>Real-time audit log streamed from Hyperledger Fabric and local state</p>
        </div>

        <button
          type="button"
          className="btn btn-outline"
          onClick={handleViewAll}
          style={{ fontSize: "12px", padding: "6px 12px" }}
        >
          <span>View All Transactions</span>
          <Icon name="arrow-right" size={14} />
        </button>
      </div>

      <div className="table-responsive">
        <table className="enterprise-table">
          <thead>
            <tr>
              <th>Operation / Event</th>
              <th>Target Resource</th>
              <th>Transaction ID</th>
              <th>Ledger Status</th>
              <th style={{ textAlign: "right" }}>Timestamp</th>
            </tr>
          </thead>

          <tbody>
            {activities.length > 0 ? (
              activities.map((activity, index) => {
                const rowId = activity.txId || index;
                const isCopied = copiedTx === rowId;

                return (
                  <tr key={rowId}>
                    <td>
                      <div className="table-action-cell">
                        <span className="table-action-indicator" />
                        <strong className="table-action-name">{activity.action}</strong>
                      </div>
                    </td>

                    <td>
                      <span className="table-resource-pill" title={activity.resource}>
                        {activity.resource || "System"}
                      </span>
                    </td>

                    <td>
                      {activity.txId ? (
                        <button
                          type="button"
                          className={`btn-copy ${isCopied ? "copied" : ""}`}
                          onClick={() => copyToClipboard(activity.txId, rowId)}
                          title={`Click to copy full TxID: ${activity.txId}`}
                        >
                          <span style={{ fontFamily: "monospace" }}>
                            {activity.txId.substring(0, 8)}...{activity.txId.substring(activity.txId.length - 6)}
                          </span>
                          <Icon name={isCopied ? "check" : "copy"} size={12} />
                        </button>
                      ) : (
                        <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>Local State</span>
                      )}
                    </td>

                    <td>
                      <span className={`badge ${getStatusBadgeClass(activity.status)}`}>
                        {activity.status || "CONFIRMED"}
                      </span>
                    </td>

                    <td style={{ textAlign: "right", color: "var(--text-muted)", fontSize: "12px" }}>
                      {activity.time}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="5">
                  <div className="empty-state">
                    <Icon name="history" size={32} className="empty-state-icon" />
                    <h3>No Transactions Recorded Yet</h3>
                    <p>Actions performed across the platform will be cryptographically anchored and appear here.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ActivityTable;