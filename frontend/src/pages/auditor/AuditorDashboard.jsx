import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import {
  getAuditorIdentities,
  getAuditorAssets,
  getAuditorAssetHistory,
  getAuditorAccess,
  getAuditorAccessRequests,
  getAuditorTransactions,
  exportAuditorData,
} from "../../services/auditorService";

import "../../styles/layout.css";
import "../../styles/access.css";
import "../../styles/identity.css";
import "../../styles/auditor.css";

function AuditorDashboard() {
  const { user } = useAuth();

  // Strict Role Guard: Only Auditor role of Auditor organization allowed
  const isAuditor =
    user?.organization === "Auditor" && user?.role === "Auditor";

  // Tab State: "overview" | "identities" | "assets" | "access" | "requests" | "transactions"
  const [activeTab, setActiveTab] = useState("overview");

  // Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState({});

  const [identities, setIdentities] = useState([]);
  const [assets, setAssets] = useState([]);
  const [accessList, setAccessList] = useState([]);
  const [requests, setRequests] = useState([]);
  const [transactions, setTransactions] = useState([]);

  // Search Filter State
  const [searchQuery, setSearchQuery] = useState("");

  // Asset History Modal State
  const [historyAssetId, setHistoryAssetId] = useState(null);
  const [assetHistory, setAssetHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  // Export State
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState(false);

  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load all Auditor data
  async function loadData() {
    const newErrors = {};

    const [identitiesRes, assetsRes, accessRes, requestsRes, txRes] =
      await Promise.allSettled([
        getAuditorIdentities(),
        getAuditorAssets(),
        getAuditorAccess(),
        getAuditorAccessRequests(),
        getAuditorTransactions(),
      ]);

    // 1. Identities
    if (identitiesRes.status === "fulfilled") {
      setIdentities(identitiesRes.value.identities || []);
    } else {
      newErrors.identities = identitiesRes.reason?.message || "Failed to load identities";
      setIdentities([]);
    }

    // 2. Assets
    if (assetsRes.status === "fulfilled") {
      setAssets(assetsRes.value.assets || []);
    } else {
      newErrors.assets = assetsRes.reason?.message || "Failed to load assets";
      setAssets([]);
    }

    // 3. Access
    if (accessRes.status === "fulfilled") {
      setAccessList(accessRes.value.access || []);
    } else {
      newErrors.access = accessRes.reason?.message || "Failed to load access records";
      setAccessList([]);
    }

    // 4. Access Requests
    if (requestsRes.status === "fulfilled") {
      setRequests(requestsRes.value.requests || []);
    } else {
      newErrors.requests = requestsRes.reason?.message || "Failed to load access requests";
      setRequests([]);
    }

    // 5. Transactions
    if (txRes.status === "fulfilled") {
      const txData = txRes.value;
      setTransactions(Array.isArray(txData) ? txData : txData.transactions || []);
    } else {
      newErrors.transactions = txRes.reason?.message || "Failed to load transactions";
      setTransactions([]);
    }

    setErrors(newErrors);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  useEffect(() => {
    if (!isAuditor) return;

    let isMounted = true;
    (async () => {
      await loadData();
      if (isMounted) {
        setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isAuditor]);

  // Handle Export CSV
  async function handleExport() {
    try {
      setExporting(true);
      setExportError("");
      setExportSuccess(false);
      await exportAuditorData();
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 4000);
    } catch (err) {
      setExportError(err.message || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  // Handle View Asset History
  async function handleOpenHistory(assetId) {
    setHistoryAssetId(assetId);
    setHistoryLoading(true);
    setHistoryError("");
    setAssetHistory([]);

    try {
      const hist = await getAuditorAssetHistory(assetId);
      setAssetHistory(hist);
    } catch (err) {
      setHistoryError(err.message || "Failed to fetch asset history");
    } finally {
      setHistoryLoading(false);
    }
  }

  function handleCloseHistory() {
    setHistoryAssetId(null);
    setAssetHistory([]);
    setHistoryError("");
  }

  // Access Denied Guard
  if (!isAuditor) {
    return (
      <div className="app-layout">
        <Sidebar
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />
        <section className="main-area">
          <Topbar
            title="Auditor Portal"
            subtitle="Access restricted"
            onMenuClick={() => setMobileMenuOpen(true)}
          />
          <main className="main-content">
            <div className="access-denied-box">
              <h2>Access Denied</h2>
              <p>Auditor access is required to view this dashboard.</p>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                Current Role: {user?.organization || "None"} · {user?.role || "None"}
              </span>
            </div>
          </main>
        </section>
      </div>
    );
  }

  // Derived Summary Metrics from actual backend arrays
  const activeIdentitiesCount = identities.filter(
    (i) => i.status === "ACTIVE"
  ).length;
  const revokedIdentitiesCount = identities.filter(
    (i) => i.status === "REVOKED"
  ).length;
  const activeAssetsCount = assets.filter((a) => a.status === "ACTIVE").length;
  const pendingRequestsCount = requests.filter(
    (r) => r.status === "PENDING" || r.status === "BEL_APPROVED"
  ).length;

  // Client-side search filters
  const q = searchQuery.toLowerCase().trim();

  const filteredIdentities = identities.filter(
    (i) =>
      !q ||
      i.identityId?.toLowerCase().includes(q) ||
      i.name?.toLowerCase().includes(q) ||
      i.organization?.toLowerCase().includes(q) ||
      i.role?.toLowerCase().includes(q) ||
      i.status?.toLowerCase().includes(q)
  );

  const filteredAssets = assets.filter(
    (a) =>
      !q ||
      a.assetId?.toLowerCase().includes(q) ||
      a.name?.toLowerCase().includes(q) ||
      a.assetType?.toLowerCase().includes(q) ||
      a.owner?.toLowerCase().includes(q) ||
      a.status?.toLowerCase().includes(q)
  );

  const filteredAccess = accessList.filter(
    (acc) =>
      !q ||
      acc.identityId?.toLowerCase().includes(q) ||
      acc.assetId?.toLowerCase().includes(q) ||
      acc.permission?.toLowerCase().includes(q)
  );

  const filteredRequests = requests.filter(
    (r) =>
      !q ||
      r.requestId?.toLowerCase().includes(q) ||
      r.identityId?.toLowerCase().includes(q) ||
      r.assetId?.toLowerCase().includes(q) ||
      r.status?.toLowerCase().includes(q)
  );

  const filteredTransactions = transactions.filter(
    (t) =>
      !q ||
      t.id?.toLowerCase().includes(q) ||
      t.action?.toLowerCase().includes(q) ||
      t.resourceType?.toLowerCase().includes(q) ||
      t.resourceId?.toLowerCase().includes(q) ||
      t.userId?.toLowerCase().includes(q) ||
      t.organization?.toLowerCase().includes(q) ||
      t.transactionId?.toLowerCase().includes(q)
  );

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Auditor Portal"
          subtitle="Multi-org ledger oversight & compliance"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          {/* Header */}
          <div className="auditor-header-container">
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: "24px" }}>
                Auditor Dashboard
              </h2>
              <p style={{ margin: 0, color: "#748095", fontSize: "13px" }}>
                Blockchain-backed compliance, transaction integrity, and organizational activity oversight.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div className="auditor-compliance-pill">
                <span>⚖</span>
                <span>READ-ONLY COMPLIANCE VIEW</span>
              </div>

              <button
                type="button"
                className="auditor-btn-refresh"
                onClick={handleRefresh}
                disabled={loading || refreshing}
              >
                ↻ {refreshing ? "Refreshing..." : "Refresh"}
              </button>

              <button
                type="button"
                className="auditor-btn-export"
                onClick={handleExport}
                disabled={exporting}
              >
                ⤓ {exporting ? "Exporting CSV..." : "Export Audit Log (CSV)"}
              </button>
            </div>
          </div>

          {/* Export Notifications */}
          {exportError && (
            <div className="identity-error" style={{ marginBottom: "18px" }}>
              ✕ Export error: {exportError}
            </div>
          )}
          {exportSuccess && (
            <div className="identity-banner-success" style={{ marginBottom: "18px" }}>
              ✓ Audit log export generated and downloaded successfully.
            </div>
          )}

          {/* Oversight Capability Banner */}
          <div className="auditor-oversight-banner">
            <span style={{ fontSize: "18px" }}>🛡️</span>
            <div>
              <strong>Auditor Oversight Authority:</strong> As an authorized Auditor, you have comprehensive read-only oversight across all organizational records, access permissions, digital asset provenance, and transaction audit trails. Mutation controls (mint, transfer, grant, revoke) are disabled to guarantee audit neutrality.
            </div>
          </div>

          {/* Summary Metrics Cards */}
          <div className="auditor-metrics-grid">
            <div className="auditor-metric-card">
              <span>Total Identities</span>
              <strong>{loading ? "…" : identities.length}</strong>
              <div className="auditor-metric-subtext">
                {activeIdentitiesCount} Active · {revokedIdentitiesCount} Revoked
              </div>
            </div>

            <div className="auditor-metric-card">
              <span>Digital Assets</span>
              <strong>{loading ? "…" : assets.length}</strong>
              <div className="auditor-metric-subtext">
                {activeAssetsCount} Active on Fabric
              </div>
            </div>

            <div className="auditor-metric-card">
              <span>Access Records</span>
              <strong>{loading ? "…" : accessList.length}</strong>
              <div className="auditor-metric-subtext">
                Active permissions tracked
              </div>
            </div>

            <div className="auditor-metric-card">
              <span>Access Requests</span>
              <strong>{loading ? "…" : requests.length}</strong>
              <div className="auditor-metric-subtext">
                {pendingRequestsCount} Pending Approval
              </div>
            </div>

            <div className="auditor-metric-card">
              <span>Audit Transactions</span>
              <strong>{loading ? "…" : transactions.length}</strong>
              <div className="auditor-metric-subtext">
                Immutable ledger events
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="auditor-tabs-container">
            <button
              type="button"
              className={`auditor-tab-btn ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              <span>⌂</span>
              <span>Overview</span>
            </button>

            <button
              type="button"
              className={`auditor-tab-btn ${activeTab === "identities" ? "active" : ""}`}
              onClick={() => setActiveTab("identities")}
            >
              <span>◎</span>
              <span>Identities</span>
              <span className="auditor-tab-count">{identities.length}</span>
            </button>

            <button
              type="button"
              className={`auditor-tab-btn ${activeTab === "assets" ? "active" : ""}`}
              onClick={() => setActiveTab("assets")}
            >
              <span>◆</span>
              <span>Assets</span>
              <span className="auditor-tab-count">{assets.length}</span>
            </button>

            <button
              type="button"
              className={`auditor-tab-btn ${activeTab === "access" ? "active" : ""}`}
              onClick={() => setActiveTab("access")}
            >
              <span>⇄</span>
              <span>Access Control</span>
              <span className="auditor-tab-count">{accessList.length}</span>
            </button>

            <button
              type="button"
              className={`auditor-tab-btn ${activeTab === "requests" ? "active" : ""}`}
              onClick={() => setActiveTab("requests")}
            >
              <span>↗</span>
              <span>Access Requests</span>
              <span className="auditor-tab-count">{requests.length}</span>
            </button>

            <button
              type="button"
              className={`auditor-tab-btn ${activeTab === "transactions" ? "active" : ""}`}
              onClick={() => setActiveTab("transactions")}
            >
              <span>▤</span>
              <span>Transactions</span>
              <span className="auditor-tab-count">{transactions.length}</span>
            </button>
          </div>

          {/* Search Toolbar (for tabs with list data) */}
          {activeTab !== "overview" && (
            <div className="auditor-toolbar">
              <input
                type="text"
                className="auditor-search-input"
                placeholder={`Search ${activeTab}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="table-btn-inspect"
                  onClick={() => setSearchQuery("")}
                >
                  Clear Search
                </button>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: OVERVIEW                                            */}
          {/* ======================================================== */}
          {activeTab === "overview" && (
            <div>
              {/* Recent Transactions Box */}
              <div className="auditor-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <h3 style={{ margin: 0, fontSize: "16px", color: "#ffffff" }}>
                    Recent Ledger Activity
                  </h3>
                  <button
                    type="button"
                    className="table-btn-inspect"
                    onClick={() => setActiveTab("transactions")}
                  >
                    View All {transactions.length} Transactions →
                  </button>
                </div>

                {loading ? (
                  <p style={{ color: "#748095" }}>Loading transaction history...</p>
                ) : transactions.length === 0 ? (
                  <p style={{ color: "#748095" }}>No transactions recorded on ledger yet.</p>
                ) : (
                  <div className="auditor-table-wrapper">
                    <table className="auditor-table">
                      <thead>
                        <tr>
                          <th>Timestamp</th>
                          <th>Action</th>
                          <th>Resource</th>
                          <th>Actor</th>
                          <th>Status</th>
                          <th>Transaction ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.slice(-6).reverse().map((tx, idx) => (
                          <tr key={tx.id || idx}>
                            <td className="mono-cell" style={{ color: "#94a3b8" }}>
                              {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "—"}
                            </td>
                            <td>
                              <strong style={{ color: "#ffffff" }}>{tx.action}</strong>
                            </td>
                            <td>
                              <span className="org-tag">
                                {tx.resourceType}: {tx.resourceId || "—"}
                              </span>
                            </td>
                            <td>
                              {tx.userId} ({tx.organization} · {tx.role})
                            </td>
                            <td>
                              <span
                                className={`status-pill ${
                                  tx.success ? "pill-active" : "pill-revoked"
                                }`}
                              >
                                {tx.success ? "SUCCESS" : "FAILED"}
                              </span>
                            </td>
                            <td className="mono-cell" style={{ color: "#64748b" }}>
                              {tx.transactionId ? `${tx.transactionId.substring(0, 10)}…` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: IDENTITIES                                          */}
          {/* ======================================================== */}
          {activeTab === "identities" && (
            <div className="auditor-card">
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", color: "#ffffff" }}>
                Identity Registry Oversight
              </h3>

              {errors.identities && (
                <div className="identity-error" style={{ marginBottom: "14px" }}>
                  ✕ {errors.identities}
                </div>
              )}

              {loading ? (
                <p style={{ color: "#748095" }}>Loading identity records from blockchain...</p>
              ) : filteredIdentities.length === 0 ? (
                <p style={{ color: "#748095" }}>No identity records match your query.</p>
              ) : (
                <div className="auditor-table-wrapper">
                  <table className="auditor-table">
                    <thead>
                      <tr>
                        <th>Identity ID</th>
                        <th>Name</th>
                        <th>Organization</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Registration Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIdentities.map((item) => (
                        <tr key={item.identityId}>
                          <td className="mono-cell" style={{ color: "#ffffff", fontWeight: 700 }}>
                            {item.identityId}
                          </td>
                          <td>{item.name || "—"}</td>
                          <td>
                            <span className="org-tag">{item.organization || "—"}</span>
                          </td>
                          <td>{item.role || "—"}</td>
                          <td>
                            <span
                              className={`status-pill ${
                                item.status === "REVOKED" ? "pill-revoked" : "pill-active"
                              }`}
                            >
                              {item.status || "ACTIVE"}
                            </span>
                          </td>
                          <td style={{ color: "#94a3b8" }}>
                            {item.createdAt ? new Date(item.createdAt).toLocaleString() : "Genesis"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: ASSETS                                              */}
          {/* ======================================================== */}
          {activeTab === "assets" && (
            <div className="auditor-card">
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", color: "#ffffff" }}>
                Digital Assets & Provenance Oversight
              </h3>

              {errors.assets && (
                <div className="identity-error" style={{ marginBottom: "14px" }}>
                  ✕ {errors.assets}
                </div>
              )}

              {loading ? (
                <p style={{ color: "#748095" }}>Loading assets from blockchain...</p>
              ) : filteredAssets.length === 0 ? (
                <p style={{ color: "#748095" }}>No digital assets found.</p>
              ) : (
                <div className="auditor-table-wrapper">
                  <table className="auditor-table">
                    <thead>
                      <tr>
                        <th>Asset ID</th>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Owner</th>
                        <th>Status</th>
                        <th>Document Hash</th>
                        <th style={{ textAlign: "right" }}>Provenance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssets.map((asset) => (
                        <tr key={asset.assetId}>
                          <td className="mono-cell" style={{ color: "#ffffff", fontWeight: 700 }}>
                            {asset.assetId}
                          </td>
                          <td>{asset.name}</td>
                          <td>
                            <span className="org-tag">{asset.assetType || "FILE"}</span>
                          </td>
                          <td>{asset.owner}</td>
                          <td>
                            <span className="status-pill pill-active">
                              {asset.status || "ACTIVE"}
                            </span>
                          </td>
                          <td className="mono-cell" style={{ color: "#64748b" }}>
                            {asset.documentHash ? `${asset.documentHash.substring(0, 12)}…` : "—"}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              className="auditor-btn-view"
                              onClick={() => handleOpenHistory(asset.assetId)}
                            >
                              Inspect History
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: ACCESS CONTROL                                      */}
          {/* ======================================================== */}
          {activeTab === "access" && (
            <div className="auditor-card">
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", color: "#ffffff" }}>
                Access Permissions Oversight
              </h3>

              {errors.access && (
                <div className="identity-error" style={{ marginBottom: "14px" }}>
                  ✕ {errors.access}
                </div>
              )}

              {loading ? (
                <p style={{ color: "#748095" }}>Loading access records from blockchain...</p>
              ) : filteredAccess.length === 0 ? (
                <p style={{ color: "#748095" }}>No active access permissions found.</p>
              ) : (
                <div className="auditor-table-wrapper">
                  <table className="auditor-table">
                    <thead>
                      <tr>
                        <th>Identity ID</th>
                        <th>Asset ID</th>
                        <th>Permission Level</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAccess.map((acc, index) => (
                        <tr key={`${acc.identityId}-${acc.assetId}-${index}`}>
                          <td className="mono-cell" style={{ color: "#ffffff", fontWeight: 700 }}>
                            {acc.identityId}
                          </td>
                          <td className="mono-cell">{acc.assetId}</td>
                          <td>
                            <span className="org-tag">{acc.permission || "READ"}</span>
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                acc.hasAccess ? "pill-active" : "pill-revoked"
                              }`}
                            >
                              {acc.hasAccess ? "ACTIVE GRANT" : "NO ACCESS"}
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

          {/* ======================================================== */}
          {/* TAB: ACCESS REQUESTS                                     */}
          {/* ======================================================== */}
          {activeTab === "requests" && (
            <div className="auditor-card">
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", color: "#ffffff" }}>
                Access Request Workflow Oversight
              </h3>

              {errors.requests && (
                <div className="identity-error" style={{ marginBottom: "14px" }}>
                  ✕ {errors.requests}
                </div>
              )}

              {loading ? (
                <p style={{ color: "#748095" }}>Loading access request records...</p>
              ) : filteredRequests.length === 0 ? (
                <p style={{ color: "#748095" }}>No access requests found.</p>
              ) : (
                <div className="auditor-table-wrapper">
                  <table className="auditor-table">
                    <thead>
                      <tr>
                        <th>Request ID</th>
                        <th>Requester</th>
                        <th>Asset ID</th>
                        <th>Permission</th>
                        <th>Status</th>
                        <th>BEL Endorsement</th>
                        <th>Auditor Endorsement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((req) => (
                        <tr key={req.requestId}>
                          <td className="mono-cell" style={{ color: "#ffffff", fontWeight: 700 }}>
                            {req.requestId}
                          </td>
                          <td>{req.identityId}</td>
                          <td className="mono-cell">{req.assetId}</td>
                          <td>
                            <span className="org-tag">{req.permission}</span>
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                req.status === "ACTIVE"
                                  ? "pill-active"
                                  : req.status === "REJECTED"
                                  ? "pill-revoked"
                                  : "status-pill"
                              }`}
                            >
                              {req.status}
                            </span>
                          </td>
                          <td style={{ fontSize: "12px", color: "#94a3b8" }}>
                            {req.approvedByBel
                              ? `✓ ${req.approvedByBel}`
                              : req.status === "REJECTED"
                              ? "✕ Rejected"
                              : "⏳ Awaiting BEL"}
                          </td>
                          <td style={{ fontSize: "12px", color: "#94a3b8" }}>
                            {req.approvedByAuditor
                              ? `✓ ${req.approvedByAuditor}`
                              : req.status === "BEL_APPROVED"
                              ? "⏳ Pending Auditor Co-Approval"
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB: TRANSACTIONS                                        */}
          {/* ======================================================== */}
          {activeTab === "transactions" && (
            <div className="auditor-card">
              <h3 style={{ margin: "0 0 14px", fontSize: "16px", color: "#ffffff" }}>
                Complete Blockchain Transaction Trail
              </h3>

              {errors.transactions && (
                <div className="identity-error" style={{ marginBottom: "14px" }}>
                  ✕ {errors.transactions}
                </div>
              )}

              {loading ? (
                <p style={{ color: "#748095" }}>Loading transactions from audit log...</p>
              ) : filteredTransactions.length === 0 ? (
                <p style={{ color: "#748095" }}>No transactions found.</p>
              ) : (
                <div className="auditor-table-wrapper">
                  <table className="auditor-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Action</th>
                        <th>Resource</th>
                        <th>Resource ID</th>
                        <th>Actor</th>
                        <th>Org · Role</th>
                        <th>Result</th>
                        <th>Transaction ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransactions.slice().reverse().map((tx, index) => (
                        <tr key={tx.id || index}>
                          <td className="mono-cell" style={{ color: "#94a3b8" }}>
                            {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : "—"}
                          </td>
                          <td>
                            <strong style={{ color: "#ffffff" }}>{tx.action}</strong>
                          </td>
                          <td>
                            <span className="org-tag">{tx.resourceType || "—"}</span>
                          </td>
                          <td className="mono-cell">{tx.resourceId || "—"}</td>
                          <td>{tx.userId || "—"}</td>
                          <td>
                            {tx.organization} · {tx.role}
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                tx.success ? "pill-active" : "pill-revoked"
                              }`}
                            >
                              {tx.success ? "SUCCESS" : "FAILED"}
                            </span>
                          </td>
                          <td className="mono-cell" style={{ color: "#64748b" }}>
                            {tx.transactionId ? `${tx.transactionId.substring(0, 12)}…` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* ASSET HISTORY MODAL                                      */}
          {/* ======================================================== */}
          {historyAssetId && (
            <div className="auditor-modal-backdrop" onClick={handleCloseHistory}>
              <div
                className="auditor-modal-box"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="auditor-modal-header">
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: "16px", color: "#ffffff" }}>
                      Asset Provenance Trail: {historyAssetId}
                    </h3>
                    <p style={{ margin: 0, color: "#748095", fontSize: "12px" }}>
                      Cryptographically verified transaction history on Hyperledger Fabric
                    </p>
                  </div>
                  <button
                    type="button"
                    className="auditor-modal-close"
                    onClick={handleCloseHistory}
                  >
                    ✕
                  </button>
                </div>

                <div className="auditor-modal-body">
                  {historyLoading ? (
                    <p style={{ color: "#748095" }}>Fetching provenance history from blockchain...</p>
                  ) : historyError ? (
                    <div className="identity-error">✕ {historyError}</div>
                  ) : assetHistory.length === 0 ? (
                    <p style={{ color: "#748095" }}>No history entries recorded for this asset.</p>
                  ) : (
                    <div className="auditor-table-wrapper">
                      <table className="auditor-table">
                        <thead>
                          <tr>
                            <th>Transaction</th>
                            <th>Action / Type</th>
                            <th>Actor / Owner</th>
                            <th>Timestamp</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assetHistory.map((item, idx) => (
                            <tr key={item.txId || idx}>
                              <td className="mono-cell" style={{ color: "#38bdf8" }}>
                                {item.txId ? `${item.txId.substring(0, 10)}…` : "—"}
                              </td>
                              <td>{item.action || item.type || "STATE_UPDATE"}</td>
                              <td>{item.actor || item.owner || item.value?.owner || "—"}</td>
                              <td style={{ color: "#94a3b8" }}>
                                {item.timestamp ? new Date(item.timestamp).toLocaleString() : "—"}
                              </td>
                              <td>
                                <span className="status-pill pill-active">
                                  {item.isDelete ? "DELETED" : "COMMITTED"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

export default AuditorDashboard;
