import { useEffect, useState } from "react";
import { getAssetHistory } from "../../services/assetService";

function AssetHistory({ assetId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadHistory() {
      try {
        setLoading(true);
        setError("");
        const data = await getAssetHistory(assetId);
        setHistory(data);
      } catch (err) {
        setError(err.message || "Unable to load history");
      } finally {
        setLoading(false);
      }
    }

    if (assetId) {
      loadHistory();
    }
  }, [assetId]);

  function truncateTxId(txId) {
    if (!txId || txId.length <= 16) {
      return txId || "—";
    }
    return txId.substring(0, 8) + "…" + txId.substring(txId.length - 8);
  }

  function formatTimestamp(ts) {
    if (!ts) return "—";
    try {
      return new Date(ts).toLocaleString();
    } catch {
      return ts;
    }
  }

  if (loading) {
    return (
      <div className="asset-history-message">
        Loading blockchain history…
      </div>
    );
  }

  if (error) {
    return (
      <div className="asset-history-error">
        {error}
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="asset-history-message">
        No blockchain history available for this asset.
      </div>
    );
  }

  return (
    <div className="asset-history-table-wrapper">
      <table className="asset-history-table">
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Action</th>
            <th>Actor</th>
            <th>Timestamp</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry, index) => {
            const val = entry.value || {};
            const action = entry.action || (entry.isDelete ? "DELETE" : index === 0 ? "MINT_ASSET" : "UPDATE_ASSET");
            const actor = entry.actor || val.owner || entry.owner || "—";
            const ts = entry.timestamp || val.updatedAt || val.createdAt || entry.createdAt;

            return (
              <tr key={entry.txId || index}>
                <td className="asset-history-txid">
                  {truncateTxId(entry.txId)}
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: action === "MINT_ASSET" ? "#34d399" : "#60a5fa" }}>
                    {action}
                  </span>
                </td>
                <td>
                  <span style={{ fontFamily: "monospace", color: "#f1f5f9" }}>
                    {actor}
                  </span>
                </td>
                <td className="asset-history-time">
                  {formatTimestamp(ts)}
                </td>
                <td>
                  <span className="status-badge">
                    {val.status || entry.status || "COMMITTED"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default AssetHistory;
