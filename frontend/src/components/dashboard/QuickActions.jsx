import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Icon from "../common/Icon";

function QuickActions() {
  const { user } = useAuth();

  const isBelAdmin = user?.organization === "BEL" && user?.role === "Admin";
  const isBelManager = user?.organization === "BEL" && user?.role === "Manager";
  const isAuditor = user?.organization === "Auditor" && user?.role === "Auditor";
  const isContractor = user?.organization === "Contractor";

  // Build role-specific high-impact actions
  const actions = [];

  // Actions for BEL Admin & Manager
  if (isBelAdmin || isBelManager) {
    actions.push({
      to: "/assets/mint",
      title: "Mint Digital Asset",
      description: "Anchor defense specifications to IPFS & Fabric",
      icon: "mint",
      badge: "Blockchain NFT",
      color: "#3b82f6",
    });
  }

  // Identity Registration for BEL Admin, BEL Manager, Contractor Admin
  if (isBelAdmin || isBelManager || (isContractor && user?.role === "Admin")) {
    actions.push({
      to: "/identities",
      title: "Register Identity",
      description: "Provision CA certificates & W3C DIDs",
      icon: "identities",
      badge: "CA-Backed",
      color: "#10b981",
    });
  }

  // Approvals Queue for Managers and Auditors
  if (isBelAdmin || isBelManager || isAuditor) {
    actions.push({
      to: "/approvals",
      title: "Review Approvals Queue",
      description: "Evaluate pending two-tier access requests",
      icon: "approvals",
      badge: "Governance",
      color: "#f59e0b",
    });
  }

  // Request Access for Contractors & Employees
  if (isContractor || user?.role === "Employee") {
    actions.push({
      to: isContractor ? "/access/requests" : "/assets",
      title: "Request Resource Access",
      description: "Submit multi-party endorsement request",
      icon: "requests",
      badge: "Two-Tier",
      color: "#8b5cf6",
    });
  }

  // Auditor-specific actions
  if (isAuditor) {
    actions.push({
      to: "/audit-history",
      title: "Audit Ledger History",
      description: "Query immutable Fabric transaction provenance",
      icon: "audit-history",
      badge: "Compliance",
      color: "#06b6d4",
    });
  }

  // Standard Actions for all roles
  actions.push({
    to: "/verify",
    title: "Public Verification",
    description: "Verify cryptographic integrity and provenance",
    icon: "verify",
    badge: "Trustless",
    color: "#10b981",
  });

  actions.push({
    to: "/assets",
    title: "My Digital Assets",
    description: "Inspect owned & authorized asset tokens",
    icon: "assets",
    badge: "Repository",
    color: "#6366f1",
  });

  // Display top 4-6 actions
  const displayActions = actions.slice(0, 6);

  return (
    <div className="dashboard-section">
      <div className="section-header">
        <div>
          <h3>Quick Operations</h3>
          <p>Actions authorized for your {user?.organization} {user?.role} credential</p>
        </div>
      </div>

      <div className="quick-actions-grid">
        {displayActions.map((action, i) => (
          <Link to={action.to} key={i} className="quick-action-card">
            <div
              className="quick-action-icon-wrap"
              style={{ background: `rgba(${action.color === '#10b981' ? '16, 185, 129' : action.color === '#f59e0b' ? '245, 158, 11' : '59, 130, 246'}, 0.12)`, color: action.color }}
            >
              <Icon name={action.icon} size={20} />
            </div>

            <div className="quick-action-content">
              <div className="quick-action-header">
                <strong>{action.title}</strong>
                {action.badge && (
                  <span className="quick-action-badge">{action.badge}</span>
                )}
              </div>
              <span>{action.description}</span>
            </div>

            <span className="quick-action-arrow">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default QuickActions;