import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import {
  getAuditorTransactions,
  getAuditorAssetHistory,
  exportAuditorData,
} from "../../services/auditorService";

import "../../styles/layout.css";
import "../../styles/access.css";
import "../../styles/identity.css";
import "../../styles/auditor.css";
import "../../styles/audit-history.css";

const ACTION_OPTIONS = [
  { value: "ALL", label: "All Actions" },
  { value: "IDENTITY_REGISTERED", label: "IDENTITY_REGISTERED" },
  { value: "IDENTITY_REVOKED", label: "IDENTITY_REVOKED" },
  { value: "LOGIN", label: "LOGIN" },
  { value: "USER_ENROLLED", label: "USER_ENROLLED" },
  { value: "ACCESS_GRANTED", label: "ACCESS_GRANTED" },
  { value: "ACCESS_REVOKED", label: "ACCESS_REVOKED" },
  { value: "ACCESS_REQUEST_CREATED", label: "ACCESS_REQUEST_CREATED" },
  { value: "ACCESS_REQUEST_APPROVED", label: "ACCESS_REQUEST_APPROVED" },
  { value: "ACCESS_REQUEST_REJECTED", label: "ACCESS_REQUEST_REJECTED" },
  { value: "ASSET_MINTED", label: "ASSET_MINTED" },
  { value: "ASSET_TRANSFERRED", label: "ASSET_TRANSFERRED" },
  { value: "ASSET_DOCUMENT_UPDATED", label: "ASSET_DOCUMENT_UPDATED" },
];

const RESOURCE_TYPE_OPTIONS = [
  { value: "ALL", label: "All Resource Types" },
  { value: "identity", label: "identity" },
  { value: "asset", label: "asset" },
  { value: "access", label: "access" },
  { value: "accessRequest", label: "accessRequest" },
  { value: "auth", label: "auth" },
];

const ORG_OPTIONS = [
  { value: "ALL", label: "All Organizations" },
  { value: "BEL", label: "BEL" },
  { value: "Auditor", label: "Auditor" },
  { value: "Contractor", label: "Contractor" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Results" },
  { value: "SUCCESS", label: "SUCCESS" },
  { value: "FAILED", label: "FAILED" },
];

function AuditHistory() {
  const { user } = useAuth();

  // Strict Role Guard: Only Auditor role of Auditor organization
  const isAuditor =
    user?.organization === "Auditor" && user?.role === "Auditor";

  // Data state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [transactions, setTransactions] = useState([]);

  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAction, setSelectedAction] = useState("ALL");
  const [selectedResourceType, setSelectedResourceType] = useState("ALL");
  const [selectedOrg, setSelectedOrg] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Event Detail Modal State
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Asset History Investigation Modal State
  const [investigateAssetId, setInvestigateAssetId] = useState(null);
  const [assetHistory, setAssetHistory] = useState([]);
  const [assetHistoryLoading, setAssetHistoryLoading] = useState(false);
  const [assetHistoryError, setAssetHistoryError] = useState("");
  const [customAssetInput, setCustomAssetInput] = useState("");

  // Export State
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState(false);

  // Load transactions
  async function loadTransactions() {
    try {
      setError("");
      const data = await getAuditorTransactions();
      const list = Array.isArray(data) ? data : data.transactions || [];
      setTransactions(list);
    } catch (err) {
      setError(err.message || "Unable to load audit history. Please try again.");
      setTransactions([]);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  }

  useEffect(() => {
    if (!isAuditor) return;

    let isMounted = true;
    (async () => {
      await loadTransactions();
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
      setExportError(err.message || "Unable to export audit log");
    } finally {
      setExporting(false);
    }
  }

  // Handle Asset History Investigation
  async function handleInvestigateAsset(assetId) {
    if (!assetId) return;
    setInvestigateAssetId(assetId);
    setAssetHistoryLoading(true);
    setAssetHistoryError("");
    setAssetHistory([]);

    try {
      const history = await getAuditorAssetHistory(assetId);
      setAssetHistory(history);
    } catch (err) {
      setAssetHistoryError(err.message || "Failed to retrieve asset history from blockchain");
    } finally {
      setAssetHistoryLoading(false);
    }
  }

  function handleCloseAssetHistory() {
    setInvestigateAssetId(null);
    setAssetHistory([]);
    setAssetHistoryError("");
  }

  // Clear all filters
  function handleClearFilters() {
    setSearchQuery("");
    setSelectedAction("ALL");
    setSelectedResourceType("ALL");
    setSelectedOrg("ALL");
    setSelectedStatus("ALL");
    setDateFrom("");
    setDateTo("");
    setCurrentPage(1);
  }

  // Filtered dataset computation
  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return transactions
      .filter((entry) => {
        // 1. Text Search across fields
        if (q) {
          const matchId = entry.id?.toLowerCase().includes(q);
          const matchAction = entry.action?.toLowerCase().includes(q);
          const matchResType = entry.resourceType?.toLowerCase().includes(q);
          const matchResId = entry.resourceId?.toLowerCase().includes(q);
          const matchUser = entry.userId?.toLowerCase().includes(q);
          const matchOrg = entry.organization?.toLowerCase().includes(q);
          const matchTx = entry.transactionId?.toLowerCase().includes(q);
          const matchMsg = entry.message?.toLowerCase().includes(q);

          if (
            !matchId &&
            !matchAction &&
            !matchResType &&
            !matchResId &&
            !matchUser &&
            !matchOrg &&
            !matchTx &&
            !matchMsg
          ) {
            return false;
          }
        }

        // 2. Action Filter
        if (selectedAction !== "ALL" && entry.action !== selectedAction) {
          return false;
        }

        // 3. Resource Type Filter
        if (
          selectedResourceType !== "ALL" &&
          entry.resourceType !== selectedResourceType
        ) {
          return false;
        }

        // 4. Organization Filter
        if (selectedOrg !== "ALL" && entry.organization !== selectedOrg) {
          return false;
        }

        // 5. Status Filter
        if (selectedStatus !== "ALL") {
          const isSuccess = Boolean(entry.success);
          if (selectedStatus === "SUCCESS" && !isSuccess) return false;
          if (selectedStatus === "FAILED" && isSuccess) return false;
        }

        // 6. Date Range Filter
        if (dateFrom && entry.timestamp) {
          const entryDate = new Date(entry.timestamp).toISOString().split("T")[0];
          if (entryDate < dateFrom) return false;
        }

        if (dateTo && entry.timestamp) {
          const entryDate = new Date(entry.timestamp).toISOString().split("T")[0];
          if (entryDate > dateTo) return false;
        }

        return true;
      })
      .reverse(); // Newest first
  }, [
    transactions,
    searchQuery,
    selectedAction,
    selectedResourceType,
    selectedOrg,
    selectedStatus,
    dateFrom,
    dateTo,
  ]);

  // Pagination calculation
  const totalItems = filteredEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedEvents = filteredEvents.slice(startIndex, startIndex + pageSize);

  // Dynamic Summary Metrics
  const totalCount = transactions.length;
  const successCount = transactions.filter((t) => t.success).length;
  const failedCount = transactions.filter((t) => !t.success).length;
  const uniqueActorsCount = new Set(
    transactions.map((t) => t.userId).filter(Boolean)
  ).size;
  const uniqueResourcesCount = new Set(
    transactions.map((t) => `${t.resourceType}::${t.resourceId}`).filter(Boolean)
  ).size;

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
            title="Audit History"
            subtitle="Access restricted"
            onMenuClick={() => setMobileMenuOpen(true)}
          />
          <main className="main-content">
            <div className="access-denied-box">
              <h2>Access Denied</h2>
              <p>Auditor access is required to view this dashboard.</p>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                Current User: {user?.organization || "None"} · {user?.role || "None"}
              </span>
            </div>
          </main>
        </section>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Audit History"
          subtitle="Immutable transaction ledger records"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          {/* Header */}
          <div className="audit-history-header">
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: "24px" }}>
                Audit History & Activity Explorer
              </h2>
              <p style={{ margin: 0, color: "#748095", fontSize: "13px" }}>
                Immutable blockchain activity and compliance trail across all organizations.
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div className="audit-badge-readonly">
                <span>🛡</span>
                <span>READ-ONLY AUDIT VIEW</span>
              </div>

              <Link to="/auditor" className="auditor-btn-refresh" style={{ textDecoration: "none" }}>
                ⛨ Auditor Dashboard
              </Link>

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

          {/* Summary Metrics Cards */}
          <div className="auditor-metrics-grid" style={{ marginBottom: "24px" }}>
            <div className="auditor-metric-card">
              <span>Total Events</span>
              <strong>{loading ? "…" : totalCount}</strong>
              <div className="auditor-metric-subtext">Logged transactions</div>
            </div>

            <div className="auditor-metric-card">
              <span>Successful Events</span>
              <strong style={{ color: "#34d399" }}>{loading ? "…" : successCount}</strong>
              <div className="auditor-metric-subtext">Verified on ledger</div>
            </div>

            <div className="auditor-metric-card">
              <span>Failed Events</span>
              <strong style={{ color: failedCount > 0 ? "#f87171" : "#94a3b8" }}>
                {loading ? "…" : failedCount}
              </strong>
              <div className="auditor-metric-subtext">Aborted or rejected</div>
            </div>

            <div className="auditor-metric-card">
              <span>Unique Actors</span>
              <strong>{loading ? "…" : uniqueActorsCount}</strong>
              <div className="auditor-metric-subtext">Distinct identities</div>
            </div>

            <div className="auditor-metric-card">
              <span>Tracked Resources</span>
              <strong>{loading ? "…" : uniqueResourcesCount}</strong>
              <div className="auditor-metric-subtext">Identities, assets, access</div>
            </div>
          </div>

          {/* Quick Asset History Lookup Box */}
          <div className="audit-filter-card" style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <strong style={{ color: "#ffffff", fontSize: "14px" }}>
                  Direct Asset Provenance Lookup
                </strong>
                <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "12px" }}>
                  Query full cryptographic provenance for a specific digital asset ID.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (customAssetInput.trim()) {
                    handleInvestigateAsset(customAssetInput.trim());
                  }
                }}
                style={{ display: "flex", gap: "8px" }}
              >
                <input
                  type="text"
                  className="audit-filter-input"
                  placeholder="Enter Asset ID (e.g. AST-001)..."
                  value={customAssetInput}
                  onChange={(e) => setCustomAssetInput(e.target.value)}
                  style={{ width: "240px" }}
                />
                <button
                  type="submit"
                  className="table-btn-inspect"
                  disabled={!customAssetInput.trim() || assetHistoryLoading}
                >
                  {assetHistoryLoading ? "Querying..." : "Inspect Provenance"}
                </button>
              </form>
            </div>
          </div>

          {/* Filters & Search Card */}
          <div className="audit-filter-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: "15px", color: "#ffffff" }}>
                Filter & Search Audit Events
              </h3>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Showing {filteredEvents.length} of {totalCount} events
              </span>
            </div>

            <div className="audit-filter-grid">
              {/* Search */}
              <div className="audit-filter-group" style={{ gridColumn: "span 2" }}>
                <label>Search Query</label>
                <input
                  type="text"
                  className="audit-filter-input"
                  placeholder="Search by action, actor, resource ID, or tx ID..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              {/* Action */}
              <div className="audit-filter-group">
                <label>Action / Event</label>
                <select
                  className="audit-filter-select"
                  value={selectedAction}
                  onChange={(e) => {
                    setSelectedAction(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Resource Type */}
              <div className="audit-filter-group">
                <label>Resource Type</label>
                <select
                  className="audit-filter-select"
                  value={selectedResourceType}
                  onChange={(e) => {
                    setSelectedResourceType(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  {RESOURCE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Organization */}
              <div className="audit-filter-group">
                <label>Organization</label>
                <select
                  className="audit-filter-select"
                  value={selectedOrg}
                  onChange={(e) => {
                    setSelectedOrg(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  {ORG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="audit-filter-group">
                <label>Result Status</label>
                <select
                  className="audit-filter-select"
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div className="audit-filter-group">
                <label>From Date</label>
                <input
                  type="date"
                  className="audit-filter-input"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              {/* Date To */}
              <div className="audit-filter-group">
                <label>To Date</label>
                <input
                  type="date"
                  className="audit-filter-input"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            </div>

            <div className="audit-filter-actions">
              <button
                type="button"
                className="audit-btn-clear"
                onClick={handleClearFilters}
              >
                ✕ Reset Filters
              </button>
            </div>
          </div>

          {/* Audit Event Timeline Table */}
          <div className="audit-table-card">
            <div className="audit-table-header-row">
              <h3 style={{ margin: 0, fontSize: "16px", color: "#ffffff" }}>
                Immutable Event Timeline
              </h3>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "12px", color: "#64748b" }}>Rows per page:</span>
                <select
                  className="audit-filter-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{ width: "70px", padding: "4px 8px" }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {error && (
              <div className="identity-error" style={{ marginBottom: "16px" }}>
                ✕ {error}
              </div>
            )}

            {loading ? (
              <p style={{ color: "#748095" }}>Loading audit transactions from ledger...</p>
            ) : paginatedEvents.length === 0 ? (
              <p style={{ color: "#748095" }}>No audit events match your criteria.</p>
            ) : (
              <div className="auditor-table-wrapper">
                <table className="auditor-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action / Event</th>
                      <th>Resource</th>
                      <th>Actor</th>
                      <th>Organization</th>
                      <th>Result</th>
                      <th>Transaction ID</th>
                      <th style={{ textAlign: "right" }}>Inspection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedEvents.map((item, index) => (
                      <tr key={item.id || index}>
                        <td className="mono-cell" style={{ color: "#94a3b8" }}>
                          {item.timestamp ? new Date(item.timestamp).toLocaleString() : "—"}
                        </td>
                        <td>
                          <span className="audit-action-tag">{item.action}</span>
                        </td>
                        <td>
                          <div>
                            <span className="audit-resource-tag">{item.resourceType}</span>
                            <span style={{ marginLeft: "6px", fontFamily: "monospace", color: "#f1f5f9" }}>
                              {item.resourceId || "—"}
                            </span>
                          </div>
                        </td>
                        <td>
                          <strong style={{ color: "#ffffff" }}>{item.userId || "—"}</strong>
                          {item.role && (
                            <span style={{ color: "#64748b", fontSize: "11px", display: "block" }}>
                              {item.role}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="org-tag">{item.organization || "—"}</span>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${
                              item.success ? "pill-active" : "pill-revoked"
                            }`}
                          >
                            {item.success ? "SUCCESS" : "FAILED"}
                          </span>
                        </td>
                        <td className="mono-cell" style={{ color: "#64748b" }}>
                          {item.transactionId ? `${item.transactionId.substring(0, 12)}…` : "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "6px" }}>
                            <button
                              type="button"
                              className="audit-btn-inspect"
                              onClick={() => setSelectedEvent(item)}
                            >
                              Details
                            </button>

                            {item.resourceType === "asset" && item.resourceId && (
                              <button
                                type="button"
                                className="audit-btn-history-link"
                                onClick={() => handleInvestigateAsset(item.resourceId)}
                                title="Inspect Asset Provenance"
                              >
                                History
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="audit-pagination-bar">
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Page {currentPage} of {totalPages} ({totalItems} total events)
                </span>

                <div className="audit-pagination-controls">
                  <button
                    type="button"
                    className="audit-page-btn"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    className="audit-page-btn"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* EVENT DETAIL MODAL                                       */}
          {/* ======================================================== */}
          {selectedEvent && (
            <div className="auditor-modal-backdrop" onClick={() => setSelectedEvent(null)}>
              <div
                className="auditor-modal-box"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "700px" }}
              >
                <div className="auditor-modal-header">
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: "16px", color: "#ffffff" }}>
                      Event Audit Record: {selectedEvent.id || "AUD-EVENT"}
                    </h3>
                    <span className="audit-action-tag">{selectedEvent.action}</span>
                  </div>
                  <button
                    type="button"
                    className="auditor-modal-close"
                    onClick={() => setSelectedEvent(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className="auditor-modal-body">
                  <div className="audit-detail-grid">
                    <div className="audit-detail-card">
                      <span>Event Timestamp</span>
                      <strong>
                        {selectedEvent.timestamp
                          ? new Date(selectedEvent.timestamp).toLocaleString()
                          : "—"}
                      </strong>
                    </div>

                    <div className="audit-detail-card">
                      <span>Execution Result</span>
                      <strong style={{ color: selectedEvent.success ? "#34d399" : "#f87171" }}>
                        {selectedEvent.success ? "● SUCCESS" : "■ FAILED"}
                      </strong>
                    </div>

                    <div className="audit-detail-card">
                      <span>Actor Identity</span>
                      <strong>{selectedEvent.userId || "—"}</strong>
                    </div>

                    <div className="audit-detail-card">
                      <span>Organization & Role</span>
                      <strong>
                        {selectedEvent.organization || "—"} · {selectedEvent.role || "—"}
                      </strong>
                    </div>

                    <div className="audit-detail-card">
                      <span>Resource Type</span>
                      <strong>{selectedEvent.resourceType || "—"}</strong>
                    </div>

                    <div className="audit-detail-card">
                      <span>Resource Identifier</span>
                      <strong className="mono-cell">{selectedEvent.resourceId || "—"}</strong>
                    </div>

                    <div className="audit-detail-card">
                      <span>Originating IP Address</span>
                      <strong className="mono-cell">{selectedEvent.ipAddress || "Internal / Gateway"}</strong>
                    </div>

                    <div className="audit-detail-card">
                      <span>Blockchain Transaction ID</span>
                      <strong className="mono-cell" style={{ color: "#38bdf8", wordBreak: "break-all" }}>
                        {selectedEvent.transactionId || "Recorded in Audit Store"}
                      </strong>
                    </div>
                  </div>

                  {selectedEvent.message && (
                    <div style={{ marginTop: "14px" }}>
                      <span style={{ display: "block", fontSize: "11px", color: "#64748b", marginBottom: "6px" }}>
                        EVENT MESSAGE / ERROR DETAILS
                      </span>
                      <div className="audit-payload-box">{selectedEvent.message}</div>
                    </div>
                  )}

                  {selectedEvent.resourceType === "asset" && selectedEvent.resourceId && (
                    <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="audit-btn-history-link"
                        onClick={() => {
                          const id = selectedEvent.resourceId;
                          setSelectedEvent(null);
                          handleInvestigateAsset(id);
                        }}
                      >
                        Inspect Full Asset Provenance History →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* ASSET HISTORY MODAL                                      */}
          {/* ======================================================== */}
          {investigateAssetId && (
            <div className="auditor-modal-backdrop" onClick={handleCloseAssetHistory}>
              <div
                className="auditor-modal-box"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "800px" }}
              >
                <div className="auditor-modal-header">
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: "16px", color: "#ffffff" }}>
                      Cryptographic Provenance Trail: {investigateAssetId}
                    </h3>
                    <p style={{ margin: 0, color: "#748095", fontSize: "12px" }}>
                      Chronological ledger modifications retrieved via Hyperledger Fabric peer evaluation
                    </p>
                  </div>
                  <button
                    type="button"
                    className="auditor-modal-close"
                    onClick={handleCloseAssetHistory}
                  >
                    ✕
                  </button>
                </div>

                <div className="auditor-modal-body">
                  {assetHistoryLoading ? (
                    <p style={{ color: "var(--text-muted)", padding: "16px 0" }}>Fetching blockchain provenance from ledger...</p>
                  ) : assetHistoryError ? (
                    <div className="identity-error">✕ {assetHistoryError}</div>
                  ) : assetHistory.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", padding: "16px 0" }}>No history entries recorded for this asset.</p>
                  ) : (
                    <div className="auditor-table-wrapper">
                      <table className="auditor-table">
                        <thead>
                          <tr>
                            <th>TxID</th>
                            <th>Action</th>
                            <th>From (Prev Owner)</th>
                            <th>To (New Owner)</th>
                            <th>Actor</th>
                            <th>Timestamp</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assetHistory.map((item, idx) => {
                            const val = item.value || {};
                            const prevVal = idx > 0 ? assetHistory[idx - 1].value || {} : {};
                            const action = item.action || (item.isDelete ? "DELETE" : idx === 0 ? "MINT_ASSET" : (val.owner !== prevVal.owner ? "TRANSFER" : "UPDATE_ASSET"));
                            const prevOwner = item.previousOwner || val.previousOwner || (idx > 0 ? (prevVal.ownerOrganization || prevVal.owner) : "—") || "—";
                            const newOwner = val.ownerOrganization ? `${val.ownerOrganization} (${val.owner || "—"})` : (val.owner || item.owner || "—");
                            const actor = item.actor || item.performedBy || val.updatedBy || val.owner || "—";
                            const ts = item.timestamp || val.updatedAt || val.createdAt || null;
                            const status = item.isDelete ? "DELETED" : (val.status || item.status || "COMMITTED");

                            return (
                              <tr key={item.txId || idx}>
                                <td className="mono-cell" style={{ color: "var(--primary-light)" }}>
                                  {item.txId ? `${item.txId.substring(0, 10)}…` : "—"}
                                </td>
                                <td>
                                  <span style={{ fontWeight: 600 }}>{action}</span>
                                </td>
                                <td style={{ color: "var(--text-secondary)" }}>{prevOwner}</td>
                                <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{newOwner}</td>
                                <td className="mono-cell">{actor}</td>
                                <td style={{ color: "var(--text-muted)" }}>
                                  {ts ? new Date(ts).toLocaleString() : "—"}
                                </td>
                                <td>
                                  <span className={`status-pill ${status === "DELETED" ? "pill-revoked" : "pill-active"}`}>
                                    {status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
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

export default AuditHistory;
