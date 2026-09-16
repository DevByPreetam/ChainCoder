import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import ConfirmModal from "../../components/common/ConfirmModal";
import {
  getAccessRequests,
  getAuditorAccessRequests,
  getAccessRequest,
  approveAccessRequest,
  rejectAccessRequest,
  auditorApproveAccessRequest,
} from "../../services/accessRequestService";

import "../../styles/layout.css";
import "../../styles/assets.css";
import "../../styles/access.css";
import "../../styles/access-requests.css";

function Approvals() {
  const { user } = useAuth();

  const isBelApprover =
    user?.organization === "BEL" &&
    (user?.role === "Admin" || user?.role === "Manager");
  const isAuditor =
    user?.organization === "Auditor" && user?.role === "Auditor";

  const isAuthorized = isBelApprover || isAuditor;

  // Tabs: 'action_required' | 'all'
  const [activeTab, setActiveTab] = useState("action_required");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Data state
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Inspect Request Modal
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Actions
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [actionError, setActionError] = useState("");

  // Rejection modal
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  // Fetch all requests relevant to the approver
  async function loadApprovalData() {
    if (!isAuthorized) return;

    try {
      setLoading(true);
      setError("");

      let data = [];
      if (isBelApprover) {
        data = await getAccessRequests();
      } else if (isAuditor) {
        data = await getAuditorAccessRequests();
      }

      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Failed to load approval requests from server");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      loadApprovalData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized]);

  // Derived statistics from actual data
  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === "PENDING").length;
    const belApproved = requests.filter((r) => r.status === "BEL_APPROVED").length;
    const active = requests.filter((r) => r.status === "ACTIVE").length;
    const rejected = requests.filter((r) => r.status === "REJECTED").length;

    const actionNeeded = isBelApprover
      ? pending
      : isAuditor
      ? belApproved
      : 0;

    return {
      actionNeeded,
      pending,
      belApproved,
      active,
      rejected,
      total: requests.length,
    };
  }, [requests, isBelApprover, isAuditor]);

  // Filtered requests for the current tab
  const displayedRequests = useMemo(() => {
    if (activeTab === "action_required") {
      if (isBelApprover) {
        return requests.filter((r) => r.status === "PENDING");
      }
      if (isAuditor) {
        return requests.filter((r) => r.status === "BEL_APPROVED");
      }
      return [];
    }

    // 'all' tab
    if (statusFilter === "ALL") return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, activeTab, statusFilter, isBelApprover, isAuditor]);

  // Actions
  async function handleBelApprove(reqItem) {
    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await approveAccessRequest(reqItem.requestId);
      setFeedback(
        `Request ${reqItem.requestId} approved by BEL. Workflow progressed to BEL_APPROVED (awaiting Auditor co-sign).`
      );
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to approve access request.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmReject() {
    if (!rejectTarget) return;

    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await rejectAccessRequest(rejectTarget.requestId, rejectReason.trim());
      setFeedback(
        `Request ${rejectTarget.requestId} has been rejected and terminated.`
      );
      setRejectTarget(null);
      setRejectReason("");
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to reject access request.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAuditorApprove(reqItem) {
    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await auditorApproveAccessRequest(reqItem.requestId);
      setFeedback(
        `Request ${reqItem.requestId} co-approved and committed to Hyperledger Fabric! Permission is now ACTIVE on-chain.`
      );
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to complete auditor approval on Fabric.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleViewDetails(requestId) {
    try {
      setLoadingDetails(true);
      const details = await getAccessRequest(requestId);
      setSelectedRequest(details);
    } catch (err) {
      setActionError(err.message || "Unable to retrieve request details.");
    } finally {
      setLoadingDetails(false);
    }
  }

  function getStatusBadge(status) {
    switch (status) {
      case "PENDING":
        return (
          <span className="access-badge status-badge-pending">
            ⏳ PENDING (Awaiting BEL)
          </span>
        );
      case "BEL_APPROVED":
        return (
          <span className="access-badge status-badge-bel-approved">
            ✓ BEL_APPROVED (Awaiting Auditor)
          </span>
        );
      case "ACTIVE":
        return (
          <span className="access-badge status-badge-active">
            ● ACTIVE (Fabric Granted)
          </span>
        );
      case "REJECTED":
        return (
          <span className="access-badge status-badge-rejected">
            ✕ REJECTED
          </span>
        );
      default:
        return <span className="access-badge">{status || "UNKNOWN"}</span>;
    }
  }

  function getStagePill(status) {
    switch (status) {
      case "PENDING":
        return (
          <span
            className={`stage-pill stage-pill-pending ${
              isBelApprover ? "stage-pill-urgent" : ""
            }`}
          >
            Stage 1: BEL Review Needed
          </span>
        );
      case "BEL_APPROVED":
        return (
          <span
            className={`stage-pill stage-pill-awaiting-auditor ${
              isAuditor ? "stage-pill-urgent" : ""
            }`}
          >
            Stage 2: Auditor Co-Sign Needed
          </span>
        );
      case "ACTIVE":
        return <span className="stage-pill stage-pill-active">Final: On Ledger</span>;
      case "REJECTED":
        return <span className="stage-pill stage-pill-rejected">Terminated</span>;
      default:
        return null;
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

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Multi-Party Governance Approvals"
          subtitle="Review access proposals, authorize stage transitions, and co-sign on-chain grants"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          {/* Header */}
          <div className="page-header">
            <div>
              <h2>Centralized Approval Management</h2>
              <p>
                Multi-party endorsement dashboard: Review access proposals,
                authorize stage transitions, and co-sign on-chain grants.
              </p>
            </div>
          </div>

          {!isAuthorized ? (
            <div className="asset-error" style={{ padding: "24px" }}>
              <h3 style={{ margin: "0 0 8px", color: "#f87171" }}>
                Access Denied: Approver Role Required
              </h3>
              <p style={{ margin: "0 0 16px", color: "#c88d8d", fontSize: "13px" }}>
                Approval management controls are restricted strictly to BEL
                Platform Administrators, BEL Managers, and Independent
                Auditors.
              </p>
              {user?.organization === "Contractor" && (
                <Link
                  to="/access/requests"
                  className="asset-search-button"
                  style={{ textDecoration: "none", display: "inline-block" }}
                >
                  Go to Contractor Access Requests Portal ➔
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Approval Summary Statistics Grid */}
              <div className="approval-stats-grid">
                <div className="approval-stat-card stat-action-needed">
                  <span className="approval-stat-count">{stats.actionNeeded}</span>
                  <span className="approval-stat-label">Action Required</span>
                  <span className="approval-stat-desc">
                    {isBelApprover
                      ? "Requests awaiting your BEL review"
                      : "Requests awaiting Auditor co-sign"}
                  </span>
                </div>

                <div className="approval-stat-card stat-pending">
                  <span className="approval-stat-count">{stats.pending}</span>
                  <span className="approval-stat-label">Pending BEL</span>
                  <span className="approval-stat-desc">Initial contractor requests</span>
                </div>

                <div className="approval-stat-card stat-bel-approved">
                  <span className="approval-stat-count">{stats.belApproved}</span>
                  <span className="approval-stat-label">Awaiting Auditor</span>
                  <span className="approval-stat-desc">Approved by BEL, needs co-sign</span>
                </div>

                <div className="approval-stat-card stat-active">
                  <span className="approval-stat-count">{stats.active}</span>
                  <span className="approval-stat-label">Active on Fabric</span>
                  <span className="approval-stat-desc">Fully endorsed ledger grants</span>
                </div>

                <div className="approval-stat-card stat-rejected">
                  <span className="approval-stat-count">{stats.rejected}</span>
                  <span className="approval-stat-label">Rejected</span>
                  <span className="approval-stat-desc">Denied by reviewer</span>
                </div>
              </div>

              {/* Feedback Banners */}
              {feedback && (
                <div
                  className="asset-verify-result asset-verify-success"
                  style={{ marginBottom: "18px" }}
                >
                  <div className="asset-verify-status">✓ {feedback}</div>
                </div>
              )}
              {actionError && <div className="asset-error">{actionError}</div>}
              {error && <div className="asset-error">{error}</div>}

              {/* Tab Navigation */}
              <div className="access-tabs">
                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "action_required" ? "active" : ""
                  }`}
                  onClick={() => {
                    setActiveTab("action_required");
                    setFeedback("");
                    setActionError("");
                  }}
                >
                  <span>⚡</span> Action Required by You ({stats.actionNeeded})
                </button>

                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "all" ? "active" : ""
                  }`}
                  onClick={() => {
                    setActiveTab("all");
                    setFeedback("");
                    setActionError("");
                  }}
                >
                  <span>📑</span> All Approval Requests ({stats.total})
                </button>
              </div>

              {/* Approval Queue Table Card */}
              <div className="access-table-card">
                <div className="access-table-header-row">
                  <div>
                    <h3>
                      {activeTab === "action_required"
                        ? isBelApprover
                          ? "Pending BEL Decision Queue"
                          : "Awaiting Auditor Co-Endorsement Queue"
                        : "Comprehensive Approval Registry"}
                    </h3>
                    <span style={{ fontSize: "12px", color: "#748095" }}>
                      Showing {displayedRequests.length} request(s)
                    </span>
                  </div>

                  <button
                    type="button"
                    className="asset-action-button"
                    onClick={loadApprovalData}
                    disabled={loading || actionLoading}
                  >
                    {loading ? "Refreshing..." : "↻ Refresh Queue"}
                  </button>
                </div>

                {/* Sub-filters for 'all' tab */}
                {activeTab === "all" && (
                  <div className="request-filter-bar" style={{ padding: "14px 20px 0" }}>
                    <span style={{ fontSize: "12px", color: "#748095" }}>Filter Status:</span>
                    {["ALL", "PENDING", "BEL_APPROVED", "ACTIVE", "REJECTED"].map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`filter-pill ${statusFilter === st ? "active" : ""}`}
                        onClick={() => setStatusFilter(st)}
                      >
                        {st.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>
                )}

                {loading && (
                  <div className="asset-message">Loading approval requests...</div>
                )}

                {!loading && displayedRequests.length === 0 && (
                  <div className="asset-empty">
                    {activeTab === "action_required"
                      ? "✓ All caught up! No requests currently require your role's review."
                      : "No access requests found matching the current filter."}
                  </div>
                )}

                {!loading && displayedRequests.length > 0 && (
                  <div className="access-table-wrapper">
                    <table className="access-table">
                      <thead>
                        <tr>
                          <th>Request ID</th>
                          <th>Target Asset</th>
                          <th>Requester & Org</th>
                          <th>Permission</th>
                          <th>Current Status</th>
                          <th>Workflow Stage</th>
                          <th>Timestamps</th>
                          <th>Decision Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRequests.map((reqItem) => (
                          <tr key={reqItem.requestId}>
                            <td style={{ fontFamily: "monospace", fontSize: "11px", color: "#94a3b8" }}>
                              {reqItem.requestId}
                            </td>
                            <td style={{ fontWeight: 600, color: "#e5e9ef" }}>
                              {reqItem.assetId}
                            </td>
                            <td>
                              <div>{reqItem.identityId}</div>
                              <div style={{ fontSize: "10px", color: "#748095" }}>
                                {reqItem.requesterId} ({reqItem.organization})
                              </div>
                            </td>
                            <td>
                              <span className="access-permission-tag">
                                {reqItem.permission}
                              </span>
                            </td>
                            <td>{getStatusBadge(reqItem.status)}</td>
                            <td>{getStagePill(reqItem.status)}</td>
                            <td className="access-table-time">
                              <div>Created: {formatDate(reqItem.createdAt)}</div>
                              {reqItem.updatedAt !== reqItem.createdAt && (
                                <div style={{ fontSize: "10px", color: "#5a6678" }}>
                                  Updated: {formatDate(reqItem.updatedAt)}
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                {/* BEL DECISION BUTTONS */}
                                {isBelApprover && reqItem.status === "PENDING" && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-approve"
                                      onClick={() => handleBelApprove(reqItem)}
                                      disabled={actionLoading}
                                      title="Approve as BEL (advances to BEL_APPROVED)"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-reject"
                                      onClick={() => {
                                        setRejectTarget(reqItem);
                                        setRejectReason("");
                                      }}
                                      disabled={actionLoading}
                                      title="Reject request"
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}

                                {/* AUDITOR DECISION BUTTON */}
                                {isAuditor && reqItem.status === "BEL_APPROVED" && (
                                  <button
                                    type="button"
                                    className="btn-auditor-approve"
                                    onClick={() => handleAuditorApprove(reqItem)}
                                    disabled={actionLoading}
                                    title="Co-endorse and grant on Hyperledger Fabric"
                                  >
                                    Co-Approve on Fabric
                                  </button>
                                )}

                                {/* INSPECTION DETAILS */}
                                <button
                                  type="button"
                                  className="asset-action-button"
                                  style={{ padding: "6px 10px", fontSize: "11px" }}
                                  onClick={() => handleViewDetails(reqItem.requestId)}
                                  disabled={loadingDetails}
                                >
                                  Details
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* REQUEST REVIEW INSPECTION MODAL */}
              {selectedRequest && (
                <div
                  className="modal-backdrop"
                  onClick={() => setSelectedRequest(null)}
                >
                  <div
                    className="modal-container"
                    style={{ maxWidth: "620px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="modal-header">
                      <h3>Approval Request Dossier</h3>
                      <button
                        type="button"
                        className="modal-close-btn"
                        onClick={() => setSelectedRequest(null)}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="modal-body">
                      <div className="request-detail-grid">
                        <div className="request-detail-item">
                          <span className="request-detail-label">Request ID</span>
                          <span
                            className="request-detail-value"
                            style={{ fontFamily: "monospace", fontSize: "11px" }}
                          >
                            {selectedRequest.requestId}
                          </span>
                        </div>

                        <div className="request-detail-item">
                          <span className="request-detail-label">Status</span>
                          <span className="request-detail-value">
                            {getStatusBadge(selectedRequest.status)}
                          </span>
                        </div>

                        <div className="request-detail-item">
                          <span className="request-detail-label">Target Asset</span>
                          <span className="request-detail-value">
                            {selectedRequest.assetId}
                          </span>
                        </div>

                        <div className="request-detail-item">
                          <span className="request-detail-label">Identity ID</span>
                          <span className="request-detail-value">
                            {selectedRequest.identityId}
                          </span>
                        </div>

                        <div className="request-detail-item">
                          <span className="request-detail-label">Requester</span>
                          <span className="request-detail-value">
                            {selectedRequest.requesterName || selectedRequest.requesterId} (
                            {selectedRequest.organization})
                          </span>
                        </div>

                        <div className="request-detail-item">
                          <span className="request-detail-label">Permission</span>
                          <span className="request-detail-value">
                            <span className="access-permission-tag">
                              {selectedRequest.permission}
                            </span>
                          </span>
                        </div>

                        <div
                          className="request-detail-item"
                          style={{ gridColumn: "1 / -1" }}
                        >
                          <span className="request-detail-label">
                            Business Purpose / Justification
                          </span>
                          <span className="request-detail-value">
                            {selectedRequest.reason || "No reason provided by requester"}
                          </span>
                        </div>

                        <div className="request-detail-item">
                          <span className="request-detail-label">Submission Date</span>
                          <span className="request-detail-value">
                            {formatDate(selectedRequest.createdAt)}
                          </span>
                        </div>

                        <div className="request-detail-item">
                          <span className="request-detail-label">Last Updated</span>
                          <span className="request-detail-value">
                            {formatDate(selectedRequest.updatedAt)}
                          </span>
                        </div>

                        {/* BEL Review Stamp */}
                        {selectedRequest.approvedBy && (
                          <div
                            className="request-detail-item"
                            style={{ gridColumn: "1 / -1" }}
                          >
                            <span className="request-detail-label">
                              BEL Primary Approval
                            </span>
                            <span
                              className="request-detail-value"
                              style={{ color: "#86efac" }}
                            >
                              ✓ Approved by {selectedRequest.approvedBy} on{" "}
                              {formatDate(selectedRequest.approvedAt)}
                            </span>
                          </div>
                        )}

                        {/* Auditor Review Stamp */}
                        {selectedRequest.auditorApprovedBy && (
                          <div
                            className="request-detail-item"
                            style={{ gridColumn: "1 / -1" }}
                          >
                            <span className="request-detail-label">
                              Auditor Co-Endorsement (Fabric On-Chain)
                            </span>
                            <span
                              className="request-detail-value"
                              style={{ color: "#38bdf8" }}
                            >
                              ✓ Co-Signed by {selectedRequest.auditorApprovedBy} on{" "}
                              {formatDate(selectedRequest.auditorApprovedAt)}
                            </span>
                          </div>
                        )}

                        {/* Rejection Stamp */}
                        {selectedRequest.rejectedBy && (
                          <div
                            className="request-detail-item"
                            style={{ gridColumn: "1 / -1" }}
                          >
                            <span className="request-detail-label">
                              Rejection Details
                            </span>
                            <span
                              className="request-detail-value"
                              style={{ color: "#f87171" }}
                            >
                              ✕ Rejected by {selectedRequest.rejectedBy} on{" "}
                              {formatDate(selectedRequest.rejectedAt)}
                              {selectedRequest.rejectionReason && (
                                <div style={{ marginTop: "4px" }}>
                                  Reason: {selectedRequest.rejectionReason}
                                </div>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="modal-actions">
                      <button
                        type="button"
                        className="modal-cancel-btn"
                        onClick={() => setSelectedRequest(null)}
                      >
                        Close Dossier
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* REJECTION CONFIRMATION MODAL */}
              <ConfirmModal
                isOpen={!!rejectTarget}
                title="Reject Access Request"
                message={
                  <div>
                    <p style={{ margin: "0 0 10px" }}>
                      Are you sure you want to reject request{" "}
                      <strong>{rejectTarget?.requestId}</strong> for asset{" "}
                      <strong>{rejectTarget?.assetId}</strong>?
                    </p>
                    <label
                      style={{
                        fontSize: "11px",
                        color: "#8b98a9",
                        display: "block",
                        marginTop: "12px",
                      }}
                    >
                      Rejection Reason (Optional):
                    </label>
                    <input
                      type="text"
                      className="reject-reason-input"
                      placeholder="e.g. Non-compliant contractor security clearance"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </div>
                }
                confirmText="Confirm Rejection"
                cancelText="Cancel"
                confirmVariant="danger"
                loading={actionLoading}
                onConfirm={handleConfirmReject}
                onClose={() => {
                  if (!actionLoading) setRejectTarget(null);
                }}
              />
            </>
          )}
        </main>
      </section>
    </div>
  );
}

export default Approvals;
