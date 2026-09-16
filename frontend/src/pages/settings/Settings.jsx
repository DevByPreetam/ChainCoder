import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import ConfirmModal from "../../components/common/ConfirmModal";
import { useAuth } from "../../context/AuthContext";

import "../../styles/layout.css";
import "../../styles/settings.css";

function Settings() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogoutConfirm = () => {
    setIsLogoutModalOpen(false);
    logout();
    navigate("/login");
  };

  // Derive role capabilities based on active user role and organization
  const getRoleCapabilities = () => {
    const org = user?.organization;
    const role = user?.role;

    if (org === "BEL" && role === "Admin") {
      return [
        "Mint digital assets to Hyperledger Fabric with IPFS document hashes",
        "Grant and revoke access permissions to contractor identities",
        "Register and revoke BEL and Contractor identities",
        "Review and approve stage-1 access requests from contractors",
        "Full administrative oversight over BEL assets and personnel",
      ];
    }

    if (org === "BEL" && role === "Manager") {
      return [
        "Mint digital assets to Hyperledger Fabric with IPFS document hashes",
        "Grant and revoke access permissions to contractor identities",
        "Register BEL employee identities",
        "Review and approve stage-1 access requests from contractors",
      ];
    }

    if (org === "BEL" && role === "Employee") {
      return [
        "View authorized digital assets and personnel identity records",
        "Access company documentation under active permission grants",
        "Receive real-time notification alerts for asset transfers",
      ];
    }

    if (org === "Auditor" && role === "Auditor") {
      return [
        "Full read-only compliance inspection across all registered identities",
        "Audit digital asset registry, transaction explorer, and Fabric ledger blocks",
        "Co-sign and finalize stage-2 approved contractor access requests",
        "Export audit trail summaries and ledger transactions as CSV",
        "Cryptographically verify asset provenance and document integrity",
      ];
    }

    if (org === "Contractor" && role === "Admin") {
      return [
        "Create and submit access requests for digital assets",
        "Register contractor personnel identities",
        "Track request lifecycles across BEL approval and Auditor co-sign stages",
        "Access and inspect permitted digital asset documentation",
      ];
    }

    if (org === "Contractor" && role === "User") {
      return [
        "Submit access requests for project-required digital assets",
        "Track pending and approved access requests",
        "View and access granted digital assets",
      ];
    }

    return [
      "Access authenticated dashboard and personal identity profile",
      "View accessible assets under current authorization policy",
    ];
  };

  const capabilities = getRoleCapabilities();

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Settings"
          subtitle="Account details, role permissions, and platform status"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          <div className="settings-container">
            {/* Header */}
            <div className="settings-header">
              <h2 className="settings-title">Account & Platform Settings</h2>
              <p className="settings-subtitle">
                Manage your active session, review assigned role permissions,
                and inspect system connectivity.
              </p>
            </div>

            {/* Profile & Identity Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">👤</div>
                <h3 className="settings-card-title">Identity & Profile</h3>
              </div>

              <div className="settings-profile-banner">
                <div className="settings-profile-avatar">
                  {user?.name?.charAt(0) || "U"}
                </div>
                <div className="settings-profile-info">
                  <h3>{user?.name || "Authenticated User"}</h3>
                  <p>
                    <span className="settings-org-pill">
                      {user?.organization || "Organization Unavailable"}
                    </span>
                    <span className="settings-role-pill">
                      {user?.role || "Role Unavailable"}
                    </span>
                    <span className="settings-status-badge">
                      <span className="settings-status-dot" />
                      Session Active
                    </span>
                  </p>
                </div>
              </div>

              <div className="settings-grid">
                <div className="settings-field">
                  <div className="settings-field-label">User Identifier</div>
                  <div className="settings-field-value code">
                    {user?.userId || "Unavailable"}
                  </div>
                </div>

                <div className="settings-field">
                  <div className="settings-field-label">Organization</div>
                  <div className="settings-field-value">
                    {user?.organization || "Unavailable"}
                  </div>
                </div>

                <div className="settings-field">
                  <div className="settings-field-label">Assigned Role</div>
                  <div className="settings-field-value">
                    {user?.role || "Unavailable"}
                  </div>
                </div>

                <div className="settings-field">
                  <div className="settings-field-label">Authentication Token</div>
                  <div className="settings-field-value code">
                    {token ? `${token.substring(0, 16)}••••••••••••` : "Active"}
                  </div>
                </div>
              </div>
            </div>

            {/* Role Capabilities Card */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">🛡️</div>
                <h3 className="settings-card-title">
                  Role Privileges & Access Scope
                </h3>
              </div>

              <div className="settings-capabilities-list">
                {capabilities.map((cap, index) => (
                  <div key={index} className="settings-capability-item">
                    <span className="settings-cap-icon">✓</span>
                    <span>{cap}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Platform & Infrastructure Connectivity */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-icon">⚙️</div>
                <h3 className="settings-card-title">
                  Platform & Network Architecture
                </h3>
              </div>

              <div className="settings-grid">
                <div className="settings-field">
                  <div className="settings-field-label">API Gateway</div>
                  <div className="settings-field-value code">
                    http://localhost:5000/api
                  </div>
                </div>

                <div className="settings-field">
                  <div className="settings-field-label">Blockchain Network</div>
                  <div className="settings-field-value">
                    Hyperledger Fabric (Enterprise Channel)
                  </div>
                </div>

                <div className="settings-field">
                  <div className="settings-field-label">Decentralized Storage</div>
                  <div className="settings-field-value">
                    IPFS (InterPlanetary File System)
                  </div>
                </div>

                <div className="settings-field">
                  <div className="settings-field-label">Identity Credential</div>
                  <div className="settings-field-value">
                    X.509 Cryptographic Certificate / JWT
                  </div>
                </div>
              </div>

              <div className="settings-system-links">
                <Link to="/verify" className="settings-system-btn">
                  🔍 Public Asset Verification Portal →
                </Link>
                <Link to="/notifications" className="settings-system-btn">
                  🔔 Notification Feed →
                </Link>
              </div>
            </div>

            {/* Danger Zone / Sign Out */}
            <div className="settings-card danger-zone">
              <div className="settings-danger-content">
                <div className="settings-danger-text">
                  <h4>Terminate Active Session</h4>
                  <p>
                    Safely disconnect your browser session and clear stored
                    session credentials.
                  </p>
                </div>

                <button
                  type="button"
                  className="settings-logout-btn"
                  onClick={() => setIsLogoutModalOpen(true)}
                >
                  <span>↪</span> Sign Out
                </button>
              </div>
            </div>
          </div>
        </main>
      </section>

      {/* Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={isLogoutModalOpen}
        title="Confirm Sign Out"
        message="Are you sure you want to end your current ChainCoder session? Stored session credentials will be cleared from your browser."
        confirmText="Sign Out"
        cancelText="Stay Signed In"
        confirmVariant="danger"
        onConfirm={handleLogoutConfirm}
        onClose={() => setIsLogoutModalOpen(false)}
      />
    </div>
  );
}

export default Settings;
