import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function ActivityTable({ activities = [] }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAuditor = user?.organization === "Auditor" && user?.role === "Auditor";

  const handleViewAll = () => {
    if (isAuditor) {
      navigate("/audit-history");
    } else {
      navigate("/assets");
    }
  };

  return (
    <div className="dashboard-section">
      <div className="section-header">
        <div>
          <h3>Recent Blockchain Activity</h3>
          <p>Latest transactions recorded on ChainCoder</p>
        </div>

        <button
          className="view-all-button"
          onClick={handleViewAll}
        >
          View All
        </button>
      </div>

      <div className="activity-table-wrapper">
        <table className="activity-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Resource</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>

          <tbody>
            {activities.length > 0 ? (
              activities.map((activity, index) => (
                <tr key={activity.txId || index} title={activity.txId ? `TxID: ${activity.txId}` : undefined}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>{activity.action}</span>
                      {activity.txId && (
                        <span
                          style={{
                            fontSize: "9px",
                            padding: "1px 4px",
                            borderRadius: "3px",
                            background: "#1e293b",
                            color: "#94a3b8",
                            fontFamily: "monospace",
                          }}
                          title={`Fabric TxID: ${activity.txId}`}
                        >
                          tx
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activity.resource}
                  </td>
                  <td>
                    <span className="status-badge">
                      {activity.status}
                    </span>
                  </td>
                  <td className="activity-time">
                    {activity.time}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" style={{ textAlign: "center", padding: "32px 16px", color: "#64748b", fontSize: "12px" }}>
                  No recent blockchain activity recorded.
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