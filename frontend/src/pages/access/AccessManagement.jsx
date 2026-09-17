import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import ConfirmModal from "../../components/common/ConfirmModal";
import {
  grantAccess,
  getAccess,
  revokeAccess,
  getAccessHistory,
} from "../../services/accessService";
import { getAllMintProposals } from "../../services/assetService";

import "../../styles/layout.css";
import "../../styles/assets.css";
import "../../styles/access.css";

const PERMISSION_OPTIONS = [
  { value: "READ", label: "READ (Read-only access to asset metadata & documents)" },
  { value: "WRITE", label: "WRITE (Update documents & asset attributes)" },
  { value: "READ_WRITE", label: "READ_WRITE (Full read and write permissions)" },
  { value: "ADMIN", label: "ADMIN (Administrative management)" },
];

function generateDefaultAccessId() {
  return `ACC-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase()}`;
}

function AccessManagement() {
  const { user } = useAuth();

  // Role guard: BEL Admin and BEL Manager only
  const isAuthorized =
    user?.organization === "BEL" &&
    (user?.role === "Admin" || user?.role === "Manager");

  // Tab state: "manage" | "grant" | "history"
  const [activeTab, setActiveTab] = useState("manage");

  // Search & Check state
  const [searchIdentityId, setSearchIdentityId] = useState("");
  const [searchAssetId, setSearchAssetId] = useState("");
  const [searching, setSearching] = useState(false);
  const [checkedAccess, setCheckedAccess] = useState(null);
  const [searchError, setSearchError] = useState("");

  // Grant form state
  const [accessId, setAccessId] = useState(generateDefaultAccessId());
  const [grantIdentityId, setGrantIdentityId] = useState("");
  const [grantAssetId, setGrantAssetId] = useState("");
  const [grantTo, setGrantTo] = useState("");
  const [permission, setPermission] = useState("READ");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [grantSuccess, setGrantSuccess] = useState(null);
  const [availableAssets, setAvailableAssets] = useState([]);

  useEffect(() => {
    async function loadAssets() {
      try {
        const proposals = await getAllMintProposals();
        if (Array.isArray(proposals)) {
          const approved = proposals.filter((p) => p.status === "APPROVED");
          setAvailableAssets(approved);
        }
      } catch {
        // Non-blocking
      }
    }
    loadAssets();
  }, []);

  // Revocation state
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState("");

  // History state
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-sync grantTo when grantIdentityId changes (if grantTo is untouched or same)
  function handleGrantIdentityChange(val) {
    setGrantIdentityId(val);
    if (!grantTo || grantTo === grantIdentityId) {
      setGrantTo(val);
    }
  }

  // Load history when switching to history tab or refreshing
  async function loadHistory() {
    try {
      setHistoryLoading(true);
      setHistoryError("");
      const data = await getAccessHistory();
      setHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      setHistoryError(err.message || "Failed to load access history");
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    if (tab === "history") {
      loadHistory();
    }
  }

  // Handle Search / Check Access
  async function handleCheckAccess(e) {
    e?.preventDefault();
    const idId = searchIdentityId.trim();
    const astId = searchAssetId.trim();

    if (!idId || !astId) {
      setSearchError("Both Identity ID and Asset ID are required to check access.");
      return;
    }

    try {
      setSearching(true);
      setSearchError("");
      setCheckedAccess(null);
      const access = await getAccess(idId, astId);

      // Try to enrich created timestamp from on-chain audit history if not present
      if (access && !access.createdAt && !access.timestamp) {
        try {
          const histLogs = await getAccessHistory();
          if (Array.isArray(histLogs)) {
            const match = histLogs.find(
              (h) =>
                h.resourceId === `${idId}::${astId}` ||
                h.resourceId === astId ||
                (h.message && h.message.includes(idId) && h.message.includes(astId))
            );
            if (match?.timestamp) {
              access.createdAt = match.timestamp;
            }
          }
        } catch {
          // Non-blocking fallback
        }
      }

      setCheckedAccess(access);
    } catch (err) {
      setSearchError(err.message || "Access record not found or inaccessible.");
    } finally {
      setSearching(false);
    }
  }

  // Handle Grant Access
  async function handleGrantSubmit(e) {
    e.preventDefault();
    setGrantError("");
    setGrantSuccess(null);

    const aId = accessId.trim();
    const idId = grantIdentityId.trim();
    const astId = grantAssetId.trim();
    const to = (grantTo.trim() || idId);
    const perm = permission;

    if (!aId) {
      setGrantError("Access ID is required.");
      return;
    }
    if (!idId) {
      setGrantError("Identity ID is required.");
      return;
    }
    if (!astId) {
      setGrantError("Asset ID is required.");
      return;
    }
    if (!to) {
      setGrantError("Grantee (Granted To) is required.");
      return;
    }
    if (!perm) {
      setGrantError("Permission is required.");
      return;
    }

    try {
      setGranting(true);
      const created = await grantAccess({
        accessId: aId,
        identityId: idId,
        assetId: astId,
        grantedTo: to,
        permission: perm,
      });

      setGrantSuccess(created);
      // Reset form fields with fresh ID
      setAccessId(generateDefaultAccessId());
      setGrantIdentityId("");
      setGrantAssetId("");
      setGrantTo("");
      setPermission("READ");
    } catch (err) {
      setGrantError(err.message || "Failed to grant access on blockchain.");
    } finally {
      setGranting(false);
    }
  }

  // Revoke Access
  async function handleConfirmRevoke() {
    if (!revokeTarget) return;

    try {
      setRevoking(true);
      setRevokeError("");

      const updated = await revokeAccess(
        revokeTarget.identityId,
        revokeTarget.assetId
      );

      // Update current displayed access record if matches
      if (
        checkedAccess &&
        checkedAccess.identityId === revokeTarget.identityId &&
        checkedAccess.assetId === revokeTarget.assetId
      ) {
        setCheckedAccess(updated);
      }

      setRevokeTarget(null);
      // Refresh history if active
      if (activeTab === "history") {
        loadHistory();
      }
    } catch (err) {
      setRevokeError(err.message || "Failed to revoke access on blockchain.");
    } finally {
      setRevoking(false);
    }
  }

  function formatDate(val) {
    if (!val) return "—";
    try {
      return new Date(val).toLocaleString();
    } catch {
      return val;
    }
  }

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Access Control"
          subtitle="Manage permissions & policies"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          {/* Header */}
          <div className="page-header">
            <div>
              <h2>Access Control Management</h2>
              <p>
                Authoritative multi-org access registry: Grant, inspect, and
                revoke permissions on Hyperledger Fabric.
              </p>
            </div>
          </div>

          {!isAuthorized ? (
            <div className="asset-error">
              <strong>Access Denied:</strong> Access management operations are
              restricted to BEL Admin and BEL Manager.
            </div>
          ) : (
            <>
              {/* Tab Navigation */}
              <div className="access-tabs">
                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "manage" ? "active" : ""
                  }`}
                  onClick={() => handleTabChange("manage")}
                >
                  <span>🔍</span> Check & Inspect Access
                </button>

                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "grant" ? "active" : ""
                  }`}
                  onClick={() => handleTabChange("grant")}
                >
                  <span>➕</span> Grant Access
                </button>

                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "history" ? "active" : ""
                  }`}
                  onClick={() => handleTabChange("history")}
                >
                  <span>📜</span> Access History
                </button>
              </div>

              {/* Global Error Alerts */}
              {revokeError && <div className="asset-error">{revokeError}</div>}

              {/* TAB 1: CHECK & MANAGE ACCESS */}
              {activeTab === "manage" && (
                <div>
                  <div className="access-search-card">
                    <h3 style={{ margin: "0 0 6px", fontSize: "16px", color: "#e5e9ef" }}>
                      Query On-Chain Access Permission
                    </h3>
                    <p style={{ margin: 0, fontSize: "12px", color: "#748095" }}>
                      Check current ledger permission state between an Identity and Digital Asset.
                    </p>

                    <form onSubmit={handleCheckAccess} className="access-search-row">
                      <input
                        type="text"
                        className="access-search-input"
                        placeholder="Identity ID (e.g. CON001, BEL003)"
                        value={searchIdentityId}
                        onChange={(e) => setSearchIdentityId(e.target.value)}
                        disabled={searching}
                      />
                      <input
                        type="text"
                        className="access-search-input"
                        placeholder="Asset ID (e.g. ASSET001)"
                        value={searchAssetId}
                        onChange={(e) => setSearchAssetId(e.target.value)}
                        disabled={searching}
                      />
                      <button
                        type="submit"
                        className="access-btn-primary"
                        disabled={searching || !searchIdentityId.trim() || !searchAssetId.trim()}
                      >
                        {searching ? "Checking..." : "Check Access"}
                      </button>
                    </form>

                    <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>Active Grants on Ledger:</span>
                      {[
                        { id: "BEL003", ast: "ASSET001" },
                        { id: "CON001", ast: "ASSET001" },
                        { id: "CON001", ast: "ASSET002" },
                        { id: "CON002", ast: "ASSET003" },
                        { id: "AUD001", ast: "ASSET001" },
                      ].map((item) => (
                        <button
                          key={`${item.id}-${item.ast}`}
                          type="button"
                          onClick={() => {
                            setSearchIdentityId(item.id);
                            setSearchAssetId(item.ast);
                          }}
                          style={{
                            background: "rgba(30, 41, 59, 0.7)",
                            border: "1px solid #334155",
                            color: "#94a3b8",
                            borderRadius: "6px",
                            padding: "3px 8px",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontFamily: "monospace"
                          }}
                        >
                          {item.id} ➔ {item.ast}
                        </button>
                      ))}
                    </div>
                  </div>

                  {searchError && (
                    <div className="asset-error">{searchError}</div>
                  )}

                  {/* Checked Access Display Card */}
                  {checkedAccess && !checkedAccess.hasAccess && checkedAccess.hasAccess !== undefined && (
                    <div className="asset-error" style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#f87171", padding: "16px", borderRadius: "10px", marginTop: "16px" }}>
                      <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "4px" }}>No Access Permission Found</div>
                      <div style={{ fontSize: "13px", color: "#cbd5e1" }}>
                        Identity <strong>{checkedAccess.identityId}</strong> has <strong>NO</strong> active access permission for asset <strong>{checkedAccess.assetId}</strong> on the Hyperledger Fabric ledger.
                      </div>
                    </div>
                  )}

                  {checkedAccess && (checkedAccess.hasAccess || checkedAccess.status === "ACTIVE") && (
                    <div className="access-record-card">
                      <div className="access-record-header">
                        <div>
                          <h3>Access Relationship Record</h3>
                          <span style={{ fontSize: "11px", color: "#748095" }}>
                            Access ID: {checkedAccess.accessId || "—"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <span
                            className={`access-badge ${
                              checkedAccess.status === "REVOKED"
                                ? "access-badge-revoked"
                                : "access-badge-active"
                            }`}
                          >
                            {checkedAccess.status || (checkedAccess.hasAccess ? "ACTIVE" : "NO ACCESS")}
                          </span>

                          {(checkedAccess.status === "ACTIVE" || checkedAccess.hasAccess) && (
                            <button
                              type="button"
                              className="access-btn-revoke"
                              onClick={() => setRevokeTarget(checkedAccess)}
                            >
                              Revoke Access
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Visual flow: Identity -> Permission -> Asset */}
                      <div className="access-relationship-flow">
                        <div className="access-entity-pill">
                          <span className="access-entity-label">Identity</span>
                          <span className="access-entity-value">
                            {checkedAccess.identityId}
                          </span>
                        </div>

                        <div className="access-arrow">➔</div>

                        <div className="access-entity-pill">
                          <span className="access-entity-label">Permission Level</span>
                          <span className="access-entity-value">
                            <span className="access-permission-tag">
                              {checkedAccess.permission || "Read"}
                            </span>
                          </span>
                        </div>

                        <div className="access-arrow">➔</div>

                        <div className="access-entity-pill">
                          <span className="access-entity-label">Target Asset</span>
                          <span className="access-entity-value">
                            {checkedAccess.assetId}
                          </span>
                        </div>
                      </div>

                      <div className="access-grid-details">
                        <div className="access-detail-item">
                          <span className="access-detail-label">Granted To (User)</span>
                          <span className="access-detail-value">
                            {checkedAccess.grantedTo || checkedAccess.identityId}
                          </span>
                        </div>

                        <div className="access-detail-item">
                          <span className="access-detail-label">Current Status</span>
                          <span className="access-detail-value">
                            {checkedAccess.status || (checkedAccess.hasAccess ? "ACTIVE" : "NO ACCESS")}
                          </span>
                        </div>

                        <div className="access-detail-item">
                          <span className="access-detail-label">Created / Granted Date</span>
                          <span className="access-detail-value">
                            {formatDate(checkedAccess.createdAt || checkedAccess.timestamp || checkedAccess.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: GRANT ACCESS */}
              {activeTab === "grant" && (
                <div>
                  {grantError && <div className="asset-error">{grantError}</div>}

                  {grantSuccess && (
                    <div className="asset-success-container">
                      <div className="asset-success-header">
                        <div
                          className="asset-success-icon"
                          style={{
                            background:
                              grantSuccess.status === "ACTIVE"
                                ? undefined
                                : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                          }}
                        >
                          {grantSuccess.status === "ACTIVE" ? "✓" : "⏳"}
                        </div>
                        <div>
                          <h3 className="asset-success-title">
                            {grantSuccess.status === "ACTIVE"
                              ? "Access Granted Successfully"
                              : "Access Grant Proposed — Awaiting Auditor Co-Approval"}
                          </h3>
                          <p className="asset-success-subtitle">
                            {grantSuccess.status === "ACTIVE"
                              ? `Endorsed and registered on Hyperledger Fabric ledger for ${grantSuccess.identityId} on ${grantSuccess.assetId}.`
                              : `Authorized by BEL Admin (${user?.userId}). The grant is queued in the Approvals Queue and requires Auditor co-approval before being written to Hyperledger Fabric.`}
                          </p>
                        </div>
                      </div>

                      <div className="asset-info-grid">
                        <div className="asset-info-item">
                          <span className="asset-info-label">Access ID</span>
                          <span className="asset-info-value" style={{ color: "#38bdf8", fontWeight: 700 }}>
                            {grantSuccess.accessId}
                          </span>
                        </div>

                        <div className="asset-info-item">
                          <span className="asset-info-label">Identity ID</span>
                          <span className="asset-info-value">{grantSuccess.identityId}</span>
                        </div>

                        <div className="asset-info-item">
                          <span className="asset-info-label">Asset ID</span>
                          <span className="asset-info-value">{grantSuccess.assetId}</span>
                        </div>

                        <div className="asset-info-item">
                          <span className="asset-info-label">Granted To</span>
                          <span className="asset-info-value">{grantSuccess.grantedTo}</span>
                        </div>

                        <div className="asset-info-item">
                          <span className="asset-info-label">Permission</span>
                          <span className="asset-info-value">
                            <span className="access-permission-tag">
                              {grantSuccess.permission}
                            </span>
                          </span>
                        </div>

                        <div className="asset-info-item">
                          <span className="asset-info-label">Status</span>
                          <span className="asset-info-value">
                            {grantSuccess.status === "ACTIVE" ? (
                              <span className="access-badge access-badge-active">
                                ACTIVE (On-Chain)
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: "2px 10px",
                                  borderRadius: "4px",
                                  background: "#1e1b4b",
                                  color: "#a78bfa",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  border: "1px solid #7c3aed",
                                }}
                              >
                                ⏳ BEL_APPROVED (Awaiting Auditor)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="asset-actions" style={{ marginTop: "20px" }}>
                        <Link
                          to="/approvals"
                          className="asset-search-button"
                          style={{ textDecoration: "none", display: "inline-block" }}
                        >
                          View in Approvals Queue ➔
                        </Link>

                        <button
                          type="button"
                          className="asset-action-button"
                          onClick={() => setGrantSuccess(null)}
                        >
                          Grant Another Access
                        </button>
                      </div>
                    </div>
                  )}

                  {!grantSuccess && (
                    <form onSubmit={handleGrantSubmit} className="access-form-card">
                      <h3 style={{ margin: "0 0 8px", fontSize: "17px", color: "#e5e9ef" }}>
                        Grant New Permission on Blockchain
                      </h3>
                      <p style={{ margin: "0 0 22px", fontSize: "12px", color: "#748095" }}>
                        Submit an access authorization proposal that requires Auditor co-approval before being committed to Hyperledger Fabric.
                      </p>

                      <div className="access-form-grid">
                        <div className="access-form-group">
                          <label className="access-form-label">
                            Access ID <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="access-form-input"
                            value={accessId}
                            onChange={(e) => setAccessId(e.target.value)}
                            disabled={granting}
                            required
                          />
                          <span className="access-form-help">
                            Unique record ID for this access grant
                          </span>
                        </div>

                        <div className="access-form-group">
                          <label className="access-form-label">
                            Permission Level <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <select
                            className="access-form-select"
                            value={permission}
                            onChange={(e) => setPermission(e.target.value)}
                            disabled={granting}
                          >
                            {PERMISSION_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <span className="access-form-help">
                            Level of rights granted to the identity
                          </span>
                        </div>

                        <div className="access-form-group">
                          <label className="access-form-label">
                            Identity ID <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="access-form-input"
                            placeholder="e.g. CON001 or BEL003"
                            value={grantIdentityId}
                            onChange={(e) => handleGrantIdentityChange(e.target.value)}
                            disabled={granting}
                            required
                          />
                          <span className="access-form-help">
                            Identity receiving permission to the resource
                          </span>
                        </div>

                        <div className="access-form-group">
                          <label className="access-form-label">
                            Target Asset ID <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="access-form-input"
                            placeholder="e.g. AST-20 or AST-019"
                            list="ledger-asset-suggestions"
                            value={grantAssetId}
                            onChange={(e) => setGrantAssetId(e.target.value)}
                            disabled={granting}
                            required
                          />
                          <datalist id="ledger-asset-suggestions">
                            {availableAssets.map((a) => (
                              <option key={a.assetId} value={a.assetId}>
                                {a.name ? `${a.assetId} (${a.name})` : a.assetId}
                              </option>
                            ))}
                          </datalist>
                          <span className="access-form-help">
                            {availableAssets.length > 0 ? (
                              <span>
                                Active assets on Fabric:{" "}
                                {availableAssets.map((a) => (
                                  <button
                                    key={a.assetId}
                                    type="button"
                                    onClick={() => setGrantAssetId(a.assetId)}
                                    style={{
                                      background: "rgba(56, 189, 248, 0.1)",
                                      border: "1px solid rgba(56, 189, 248, 0.3)",
                                      borderRadius: "4px",
                                      color: "#38bdf8",
                                      cursor: "pointer",
                                      padding: "1px 6px",
                                      margin: "2px 3px",
                                      fontFamily: "monospace",
                                      fontSize: "11px",
                                      fontWeight: 600,
                                    }}
                                    title={`Click to select ${a.assetId}`}
                                  >
                                    {a.assetId}
                                  </button>
                                ))}
                              </span>
                            ) : (
                              "The digital asset token registered on Hyperledger Fabric"
                            )}
                          </span>
                        </div>

                        <div className="access-form-group access-form-group-full">
                          <label className="access-form-label">
                            Granted To (User ID / Holder) <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="access-form-input"
                            placeholder="e.g. CON001"
                            value={grantTo}
                            onChange={(e) => setGrantTo(e.target.value)}
                            disabled={granting}
                            required
                          />
                          <span className="access-form-help">
                            Target user account bound to this identity
                          </span>
                        </div>
                      </div>

                      <div className="access-form-actions">
                        <button
                          type="submit"
                          className="access-btn-primary"
                          disabled={granting}
                        >
                          {granting ? "Submitting Grant Proposal..." : "Submit for Auditor Co-Approval"}
                        </button>

                        <button
                          type="button"
                          className="asset-action-button"
                          onClick={() => {
                            setAccessId(generateDefaultAccessId());
                            setGrantIdentityId("");
                            setGrantAssetId("");
                            setGrantTo("");
                            setPermission("READ");
                            setGrantError("");
                          }}
                          disabled={granting}
                        >
                          Reset
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* TAB 3: ACCESS HISTORY */}
              {activeTab === "history" && (
                <div className="access-table-card">
                  <div className="access-table-header-row">
                    <div>
                      <h3>On-Chain Access Audit History</h3>
                      <span style={{ fontSize: "12px", color: "#748095" }}>
                        Real-time audit log of access grants and revocations
                      </span>
                    </div>

                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={loadHistory}
                      disabled={historyLoading}
                    >
                      {historyLoading ? "Refreshing..." : "↻ Refresh History"}
                    </button>
                  </div>

                  {historyError && (
                    <div className="asset-error" style={{ margin: "16px" }}>
                      {historyError}
                    </div>
                  )}

                  {historyLoading && (
                    <div className="asset-message">Loading access audit logs...</div>
                  )}

                  {!historyLoading && history.length === 0 && !historyError && (
                    <div className="asset-empty">
                      No access events recorded yet in the audit log.
                    </div>
                  )}

                  {!historyLoading && history.length > 0 && (
                    <div className="access-table-wrapper">
                      <table className="access-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Action</th>
                            <th>Resource (Identity # Asset)</th>
                            <th>Initiated By</th>
                            <th>Organization</th>
                            <th>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((event, idx) => (
                            <tr key={event.id || idx}>
                              <td className="access-table-time">
                                {formatDate(event.timestamp)}
                              </td>
                              <td className="access-table-action">
                                <span
                                  className={
                                    event.action === "ACCESS_GRANTED"
                                      ? "access-action-granted"
                                      : "access-action-revoked"
                                  }
                                >
                                  {event.action}
                                </span>
                              </td>
                              <td style={{ fontFamily: "monospace", fontSize: "12px" }}>
                                {event.resourceId || "—"}
                              </td>
                              <td>{event.userId || "—"}</td>
                              <td>{event.organization || "—"}</td>
                              <td>
                                <span
                                  className={`access-badge ${
                                    event.success
                                      ? "access-badge-active"
                                      : "access-badge-revoked"
                                  }`}
                                >
                                  {event.success ? "SUCCESS" : "FAILED"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Revoke Confirmation Modal */}
          <ConfirmModal
            isOpen={!!revokeTarget}
            title="Revoke Access Permission"
            message={`Are you sure you want to revoke access for Identity "${revokeTarget?.identityId}" on Asset "${revokeTarget?.assetId}"? This will submit an irreversible revocation transaction to Hyperledger Fabric.`}
            confirmText="Revoke Permission"
            cancelText="Cancel"
            confirmVariant="danger"
            loading={revoking}
            onConfirm={handleConfirmRevoke}
            onClose={() => {
              if (!revoking) setRevokeTarget(null);
            }}
          />
        </main>
      </section>
    </div>
  );
}

export default AccessManagement;
