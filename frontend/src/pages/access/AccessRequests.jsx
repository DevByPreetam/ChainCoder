import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import ConfirmModal from "../../components/common/ConfirmModal";
import {
  createAccessRequest,
  getMyAccessRequests,
  getPendingAccessRequests,
  getAccessRequests,
  getAccessRequest,
  approveAccessRequest,
  rejectAccessRequest,
  auditorApproveAccessRequest,
} from "../../services/accessRequestService";

import "../../styles/layout.css";
import "../../styles/assets.css";
import "../../styles/access.css";
import "../../styles/access-requests.css";

function AccessRequests() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const paramAssetId = searchParams.get("assetId");

  const isContractor = user?.organization === "Contractor";
  const isBelApprover =
    user?.organization === "BEL" &&
    (user?.role === "Admin" || user?.role === "Manager");
  const isAuditor =
    user?.organization === "Auditor" && user?.role === "Auditor";
  const isRequester = isContractor || user?.role === "Employee";

  const isAuthorized = isRequester || isBelApprover || isAuditor;

  // Tabs
  // Requester (Contractor/Employee): 'submit' | 'my'
  // BEL Approver: 'pending' | 'all'
  // Auditor: 'awaiting_auditor' | 'all'
  const defaultTab = paramAssetId && isRequester
    ? "submit"
    : isRequester
    ? "my"
    : isBelApprover
    ? "pending"
    : "awaiting_auditor";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Requester Form State
  const [identityId, setIdentityId] = useState(user?.userId || "");
  const [assetId, setAssetId] = useState(paramAssetId || "");
  const [permission, setPermission] = useState("READ");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // Data lists
  const [requests, setRequests] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState("");

  // Inspect Request Details Modal State
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Action State (Approve / Reject)
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState("");
  const [actionError, setActionError] = useState("");

  // Reject Modal Target
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  // Mobile drawer state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Filter for 'all' tab
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Keep identityId updated if user loads late
  useEffect(() => {
    if (user?.userId && !identityId) {
      setIdentityId(user.userId);
    }
  }, [user, identityId]);

  // Load requests based on active tab and role
  async function loadRequests(tabToLoad = activeTab) {
    if (!isAuthorized) return;

    try {
      setLoadingList(true);
      setListError("");
      let data = [];

      if (isRequester) {
        data = await getMyAccessRequests();
      } else if (isBelApprover) {
        if (tabToLoad === "pending") {
          data = await getPendingAccessRequests();
        } else {
          data = await getAccessRequests();
        }
      } else if (isAuditor) {
        const all = await getAccessRequests();
        if (tabToLoad === "awaiting_auditor") {
          data = all.filter((r) => r.status === "BEL_APPROVED");
        } else {
          data = all;
        }
      }

      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      setListError(err.message || "Failed to load access requests");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      loadRequests(activeTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isAuthorized]);

  function handleTabChange(newTab) {
    setActiveTab(newTab);
    setSubmitSuccess(null);
    setSubmitError("");
    setActionError("");
    setActionFeedback("");
    if (newTab !== "submit") {
      loadRequests(newTab);
    }
  }

  // Handle Contractor Request Submission
  async function handleSubmitRequest(e) {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess(null);

    const trimmedIdentity = identityId.trim();
    const trimmedAsset = assetId.trim();
    const trimmedReason = reason.trim();

    if (!trimmedIdentity) {
      setSubmitError("Identity ID is required.");
      return;
    }
    if (!trimmedAsset) {
      setSubmitError("Asset ID is required.");
      return;
    }
    if (!permission) {
      setSubmitError("Requested permission is required.");
      return;
    }

    try {
      setSubmitting(true);
      const newRequest = await createAccessRequest({
        identityId: trimmedIdentity,
        assetId: trimmedAsset,
        permission,
        reason: trimmedReason,
      });

      setSubmitSuccess(newRequest);
      setAssetId("");
      setReason("");
      if (user?.role !== "Admin") {
        setIdentityId(user?.userId || "");
      }
    } catch (err) {
      setSubmitError(err.message || "Failed to submit access request.");
    } finally {
      setSubmitting(false);
    }
  }

  // Handle BEL Approval
  async function handleBelApprove(reqItem) {
    try {
      setActionLoading(true);
      setActionError("");
      setActionFeedback("");

      await approveAccessRequest(reqItem.requestId);
      setActionFeedback(
        `Request ${reqItem.requestId} approved by BEL. It now awaits Auditor co-approval.`
      );
      loadRequests(activeTab);
    } catch (err) {
      setActionError(err.message || "Failed to approve access request.");
    } finally {
      setActionLoading(false);
    }
  }

  // Handle BEL Rejection Confirm
  async function handleConfirmReject() {
    if (!rejectTarget) return;

    try {
      setActionLoading(true);
      setActionError("");
      setActionFeedback("");

      await rejectAccessRequest(rejectTarget.requestId, rejectReason.trim());
      setActionFeedback(
        `Request ${rejectTarget.requestId} was rejected.`
      );
      setRejectTarget(null);
      setRejectReason("");
      loadRequests(activeTab);
    } catch (err) {
      setActionError(err.message || "Failed to reject access request.");
    } finally {
      setActionLoading(false);
    }
  }

  // Handle Auditor Co-Approval
  async function handleAuditorApprove(reqItem) {
    try {
      setActionLoading(true);
      setActionError("");
      setActionFeedback("");

      await auditorApproveAccessRequest(reqItem.requestId);
      setActionFeedback(
        `Request ${reqItem.requestId} co-approved and finalized on Hyperledger Fabric ledger! Status is now ACTIVE.`
      );
      loadRequests(activeTab);
    } catch (err) {
      setActionError(err.message || "Failed to complete auditor approval on Fabric.");
    } finally {
      setActionLoading(false);
    }
  }

  // View Details Modal
  async function handleViewDetails(requestId) {
    try {
      setLoadingDetails(true);
      const details = await getAccessRequest(requestId);
      setSelectedRequest(details);
    } catch (err) {
      setActionError(err.message || "Unable to fetch request details.");
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

  function formatDate(val) {
    if (!val) return "—";
    try {
      return new Date(val).toLocaleString();
    } catch {
      return val;
    }
  }

  // Filter requests if on 'all' tab
  const displayedRequests = requests.filter((r) => {
    if (statusFilter === "ALL") return true;
    return r.status === statusFilter;
  });

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Access Requests"
          subtitle="Manage approvals & request access"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          {/* Page Header */}
          <div className="page-header">
            <div>
              <h2>
                {isRequester
                  ? "Resource Access Requests"
                  : isBelApprover
                  ? "Access Requests Approval Queue"
                  : "Auditor Co-Endorsement Queue"}
              </h2>
              <p>
                Two-step multi-party authorization workflow: Access requests
                require BEL approval and Auditor co-endorsement to become
                active on Hyperledger Fabric.
              </p>
            </div>
          </div>

          {!isAuthorized ? (
            <div className="asset-error">
              <strong>Access Denied:</strong> This section is available only to
              authorized Employees, Contractor identity holders, BEL Approvers, and Compliance
              Auditors.
            </div>
          ) : (
            <>
              {/* Visual 2-Step Workflow Diagram */}
              <div className="request-workflow-diagram">
                <div className="request-step">
                  <div className="request-step-circle step-contractor">1</div>
                  <div className="request-step-info">
                    <span className="request-step-title">Contractor Request</span>
                    <span className="request-step-role">Submits Request</span>
                  </div>
                </div>

                <div className="request-step-arrow">➔</div>

                <div className="request-step">
                  <div className="request-step-circle step-bel">2</div>
                  <div className="request-step-info">
                    <span className="request-step-title">BEL Review</span>
                    <span className="request-step-role">Admin / Manager Decision</span>
                  </div>
                </div>

                <div className="request-step-arrow">➔</div>

                <div className="request-step">
                  <div className="request-step-circle step-auditor">3</div>
                  <div className="request-step-info">
                    <span className="request-step-title">Auditor Co-Sign</span>
                    <span className="request-step-role">Multi-Org Co-Endorsement</span>
                  </div>
                </div>

                <div className="request-step-arrow">➔</div>

                <div className="request-step">
                  <div className="request-step-circle step-active">✓</div>
                  <div className="request-step-info">
                    <span className="request-step-title">Active Access</span>
                    <span className="request-step-role">Recorded on Fabric Ledger</span>
                  </div>
                </div>
              </div>

              {/* Feedback Alerts */}
              {actionFeedback && (
                <div className="asset-verify-result asset-verify-success" style={{ marginBottom: "18px" }}>
                  <div className="asset-verify-status">✓ {actionFeedback}</div>
                </div>
              )}
              {actionError && <div className="asset-error">{actionError}</div>}
              {listError && <div className="asset-error">{listError}</div>}

              {/* Tab Navigation */}
              <div className="access-tabs">
                {isRequester && (
                  <>
                    <button
                      type="button"
                      className={`access-tab-btn ${
                        activeTab === "my" ? "active" : ""
                      }`}
                      onClick={() => handleTabChange("my")}
                    >
                      <span>📋</span> My Submitted Requests
                    </button>
                    <button
                      type="button"
                      className={`access-tab-btn ${
                        activeTab === "submit" ? "active" : ""
                      }`}
                      onClick={() => handleTabChange("submit")}
                    >
                      <span>➕</span> Submit Access Request
                    </button>
                  </>
                )}

                {isBelApprover && (
                  <>
                    <button
                      type="button"
                      className={`access-tab-btn ${
                        activeTab === "pending" ? "active" : ""
                      }`}
                      onClick={() => handleTabChange("pending")}
                    >
                      <span>⏳</span> Pending BEL Approvals (
                      {requests.filter((r) => r.status === "PENDING").length || 0}
                      )
                    </button>
                    <button
                      type="button"
                      className={`access-tab-btn ${
                        activeTab === "all" ? "active" : ""
                      }`}
                      onClick={() => handleTabChange("all")}
                    >
                      <span>📑</span> All Requests History
                    </button>
                  </>
                )}

                {isAuditor && (
                  <>
                    <button
                      type="button"
                      className={`access-tab-btn ${
                        activeTab === "awaiting_auditor" ? "active" : ""
                      }`}
                      onClick={() => handleTabChange("awaiting_auditor")}
                    >
                      <span>🛡️</span> Awaiting Auditor Co-Sign (
                      {requests.filter((r) => r.status === "BEL_APPROVED").length || 0}
                      )
                    </button>
                    <button
                      type="button"
                      className={`access-tab-btn ${
                        activeTab === "all" ? "active" : ""
                      }`}
                      onClick={() => handleTabChange("all")}
                    >
                      <span>📑</span> All Requests
                    </button>
                  </>
                )}
              </div>

              {/* REQUESTER TAB: SUBMIT REQUEST */}
              {isRequester && activeTab === "submit" && (
                <div>
                  {submitError && <div className="asset-error">{submitError}</div>}

                  {submitSuccess && (
                    <div className="asset-success-container">
                      <div className="asset-success-header">
                        <div className="asset-success-icon">✓</div>
                        <div>
                          <h3 className="asset-success-title">
                            Access Request Submitted Successfully
                          </h3>
                          <p className="asset-success-subtitle">
                            Request ID: <strong>{submitSuccess.requestId}</strong> has been
                            dispatched to BEL Admin/Manager for primary review.
                          </p>
                        </div>
                      </div>

                      <div className="asset-info-grid">
                        <div className="asset-info-item">
                          <span className="asset-info-label">Request ID</span>
                          <span className="asset-info-value">{submitSuccess.requestId}</span>
                        </div>
                        <div className="asset-info-item">
                          <span className="asset-info-label">Target Asset</span>
                          <span className="asset-info-value">{submitSuccess.assetId}</span>
                        </div>
                        <div className="asset-info-item">
                          <span className="asset-info-label">Identity ID</span>
                          <span className="asset-info-value">{submitSuccess.identityId}</span>
                        </div>
                        <div className="asset-info-item">
                          <span className="asset-info-label">Requested Permission</span>
                          <span className="asset-info-value">
                            <span className="access-permission-tag">
                              {submitSuccess.permission}
                            </span>
                          </span>
                        </div>
                        <div className="asset-info-item">
                          <span className="asset-info-label">Initial Status</span>
                          <span className="asset-info-value">
                            {getStatusBadge(submitSuccess.status)}
                          </span>
                        </div>
                        <div className="asset-info-item">
                          <span className="asset-info-label">Submitted At</span>
                          <span className="asset-info-value">
                            {formatDate(submitSuccess.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div className="asset-actions" style={{ marginTop: "20px" }}>
                        <button
                          type="button"
                          className="asset-search-button"
                          onClick={() => handleTabChange("my")}
                        >
                          View In My Requests ➔
                        </button>
                        <button
                          type="button"
                          className="asset-action-button"
                          onClick={() => setSubmitSuccess(null)}
                        >
                          Submit Another Request
                        </button>
                      </div>
                    </div>
                  )}

                  {!submitSuccess && (
                    <form onSubmit={handleSubmitRequest} className="access-form-card">
                      <h3 style={{ margin: "0 0 8px", fontSize: "17px", color: "#e5e9ef" }}>
                        Request Access to Platform Asset
                      </h3>
                      <p style={{ margin: "0 0 22px", fontSize: "12px", color: "#748095" }}>
                        Submit an access authorization proposal for BEL and Auditor co-approval.
                      </p>

                      <div className="access-form-grid">
                        {/* Identity ID */}
                        <div className="access-form-group">
                          <label className="access-form-label">
                            Identity ID <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="access-form-input"
                            value={identityId}
                            onChange={(e) => setIdentityId(e.target.value)}
                            disabled={submitting || user?.role !== "Admin"}
                            placeholder="e.g. CON001"
                            required
                          />
                          <span className="access-form-help">
                            {user?.role === "Admin"
                              ? "Admins may request on behalf of own org members"
                              : "Requesters must request for their own identity ID"}
                          </span>
                        </div>

                        {/* Asset ID */}
                        <div className="access-form-group">
                          <label className="access-form-label">
                            Target Asset ID <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <input
                            type="text"
                            className="access-form-input"
                            placeholder="e.g. AST-0001"
                            value={assetId}
                            onChange={(e) => setAssetId(e.target.value)}
                            disabled={submitting}
                            required
                          />
                          <span className="access-form-help">
                            The identifier of the asset you need access to
                          </span>
                        </div>

                        {/* Permission */}
                        <div className="access-form-group">
                          <label className="access-form-label">
                            Requested Permission <span style={{ color: "#ef4444" }}>*</span>
                          </label>
                          <select
                            className="access-form-select"
                            value={permission}
                            onChange={(e) => setPermission(e.target.value)}
                            disabled={submitting}
                          >
                            <option value="READ">READ (Read metadata & decrypt document)</option>
                            <option value="WRITE">WRITE (Update document & asset metadata)</option>
                          </select>
                          <span className="access-form-help">
                            Supported access levels: READ or WRITE
                          </span>
                        </div>

                        {/* Reason / Business Purpose */}
                        <div className="access-form-group access-form-group-full">
                          <label className="access-form-label">
                            Business Justification / Purpose (Optional)
                          </label>
                          <input
                            type="text"
                            className="access-form-input"
                            placeholder="e.g. Required for audit of supplier equipment delivery"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={submitting}
                          />
                          <span className="access-form-help">
                            Shared with BEL and Auditor approvers during review
                          </span>
                        </div>
                      </div>

                      <div className="access-form-actions">
                        <button
                          type="submit"
                          className="access-btn-primary"
                          disabled={submitting}
                        >
                          {submitting ? "Submitting to Queue..." : "Submit Access Request"}
                        </button>
                        <button
                          type="button"
                          className="asset-action-button"
                          onClick={() => {
                            setAssetId("");
                            setReason("");
                            setSubmitError("");
                          }}
                          disabled={submitting}
                        >
                          Reset
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* LIST VIEWS (Contractor 'my', BEL 'pending'/'all', Auditor 'awaiting_auditor'/'all') */}
              {activeTab !== "submit" && (
                <div className="access-table-card">
                  <div className="access-table-header-row">
                    <div>
                      <h3>
                        {isRequester
                          ? "My Access Requests"
                          : activeTab === "pending"
                          ? "Pending Access Requests Awaiting BEL Decision"
                          : activeTab === "awaiting_auditor"
                          ? "Requests Awaiting Auditor Co-Sign"
                          : "Access Requests Directory"}
                      </h3>
                      <span style={{ fontSize: "12px", color: "#748095" }}>
                        {displayedRequests.length} request(s) found
                      </span>
                    </div>

                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={() => loadRequests(activeTab)}
                      disabled={loadingList || actionLoading}
                    >
                      {loadingList ? "Refreshing..." : "↻ Refresh List"}
                    </button>
                  </div>

                  {/* Filter bar for 'all' tab */}
                  {activeTab === "all" && (
                    <div className="request-filter-bar" style={{ padding: "12px 20px 0" }}>
                      <span style={{ fontSize: "12px", color: "#748095" }}>Filter:</span>
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

                  {loadingList && (
                    <div className="asset-message">Loading requests...</div>
                  )}

                  {!loadingList && displayedRequests.length === 0 && (
                    <div className="asset-empty">
                      {isRequester
                        ? "You have not submitted any access requests yet."
                        : activeTab === "pending"
                        ? "No pending access requests awaiting BEL decision."
                        : activeTab === "awaiting_auditor"
                        ? "No requests currently awaiting Auditor co-signature."
                        : "No access requests found matching the current filter."}
                    </div>
                  )}

                  {!loadingList && displayedRequests.length > 0 && (
                    <div className="access-table-wrapper">
                      <table className="access-table">
                        <thead>
                          <tr>
                            <th>Request ID</th>
                            <th>Target Asset</th>
                            <th>Requester / Org</th>
                            <th>Permission</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th>Actions</th>
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
                                {reqItem.identityId}
                                <div style={{ fontSize: "10px", color: "#748095" }}>
                                  by {reqItem.requesterId} ({reqItem.organization})
                                </div>
                              </td>
                              <td>
                                <span className="access-permission-tag">
                                  {reqItem.permission}
                                </span>
                              </td>
                              <td>{getStatusBadge(reqItem.status)}</td>
                              <td className="access-table-time">
                                {formatDate(reqItem.createdAt)}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                  {/* BEL APPROVE / REJECT ACTIONS */}
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

                                  {/* AUDITOR CO-APPROVE ACTION */}
                                  {isAuditor && reqItem.status === "BEL_APPROVED" && (
                                    <button
                                      type="button"
                                      className="btn-auditor-approve"
                                      onClick={() => handleAuditorApprove(reqItem)}
                                      disabled={actionLoading}
                                      title="Co-sign and commit to Hyperledger Fabric"
                                    >
                                      Co-Approve on Fabric
                                    </button>
                                  )}

                                  {/* INSPECT DETAILS BUTTON */}
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
              )}

              {/* REQUEST DETAILS MODAL */}
              {selectedRequest && (
                <div className="modal-backdrop" onClick={() => setSelectedRequest(null)}>
                  <div
                    className="modal-container"
                    style={{ maxWidth: "600px" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="modal-header">
                      <h3>Access Request Details</h3>
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
                          <span className="request-detail-value" style={{ fontFamily: "monospace", fontSize: "11px" }}>
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
                          <span className="request-detail-label">Requester ID</span>
                          <span className="request-detail-value">
                            {selectedRequest.requesterId} ({selectedRequest.organization})
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

                        <div className="request-detail-item" style={{ gridColumn: "1 / -1" }}>
                          <span className="request-detail-label">Justification / Reason</span>
                          <span className="request-detail-value">
                            {selectedRequest.reason || "None provided"}
                          </span>
                        </div>

                        <div className="request-detail-item">
                          <span className="request-detail-label">Created At</span>
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

                        {/* BEL Approval info */}
                        {selectedRequest.approvedBy && (
                          <div className="request-detail-item">
                            <span className="request-detail-label">BEL Approved By</span>
                            <span className="request-detail-value" style={{ color: "#86efac" }}>
                              {selectedRequest.approvedBy} ({formatDate(selectedRequest.approvedAt)})
                            </span>
                          </div>
                        )}

                        {/* Auditor Approval info */}
                        {selectedRequest.auditorApprovedBy && (
                          <div className="request-detail-item">
                            <span className="request-detail-label">Auditor Approved By</span>
                            <span className="request-detail-value" style={{ color: "#38bdf8" }}>
                              {selectedRequest.auditorApprovedBy} ({formatDate(selectedRequest.auditorApprovedAt)})
                            </span>
                          </div>
                        )}

                        {/* Rejection info */}
                        {selectedRequest.rejectedBy && (
                          <div className="request-detail-item" style={{ gridColumn: "1 / -1" }}>
                            <span className="request-detail-label">Rejection Information</span>
                            <span className="request-detail-value" style={{ color: "#f87171" }}>
                              Rejected by {selectedRequest.rejectedBy} on {formatDate(selectedRequest.rejectedAt)}
                              {selectedRequest.rejectionReason && (
                                <div>Reason: {selectedRequest.rejectionReason}</div>
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
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* REJECT CONFIRMATION MODAL WITH REASON INPUT */}
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
                      placeholder="e.g. Ineligible contractor security level"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </div>
                }
                confirmText="Reject Request"
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

export default AccessRequests;
