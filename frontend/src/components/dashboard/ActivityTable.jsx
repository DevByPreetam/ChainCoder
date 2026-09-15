import { useNavigate } from "react-router-dom";

function ActivityTable({ activities = [] }) {
  const navigate = useNavigate();

  const defaultActivities = [
    {
      action: "Identity Registered",
      resource: "BEL001",
      status: "SUCCESS",
      time: "Today, 10:42 AM",
    },
    {
      action: "Asset Minted",
      resource: "ASSET001",
      status: "SUCCESS",
      time: "Today, 09:18 AM",
    },
    {
      action: "Access Granted",
      resource: "CON001 ➔ ASSET001",
      status: "SUCCESS",
      time: "Yesterday, 04:32 PM",
    },
  ];

  const displayActivities = activities.length > 0 ? activities : defaultActivities;

  return (
    <div className="dashboard-section">

      <div className="section-header">
        <div>
          <h3>Recent Blockchain Activity</h3>
          <p>Latest transactions recorded on ChainCoder</p>
        </div>

        <button
          className="view-all-button"
          onClick={() => navigate("/audit-history")}
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
              {displayActivities.map((activity, index) => (
                <tr key={index}>
                  <td>{activity.action}</td>
                  <td>{activity.resource}</td>
  
                  <td>
                    <span className="status-badge">
                      {activity.status}
                    </span>
                  </td>
  
                  <td className="activity-time">
                    {activity.time}
                  </td>
                </tr>
              ))}
            </tbody>
  
          </table>
        </div>
  
      </div>
    );
  }
  
  export default ActivityTable;