import { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import {
  getPendingMintProposals,
  getAllMintProposals,
  approveMintProposal,
  rejectMintProposal,
  getDeletionProposals,
  getPendingDeletionProposals,
  approveDeletionProposal,
  rejectDeletionProposal,
} from "../../services/assetService";
import {
  getRevocationProposals,
  approveIdentityRevocation,
  rejectIdentityRevocation,
} from "../../services/identityService";

import "../../styles/layout.css";
import "../../styles/assets.css";
import "../../styles/access.css";
import "../../styles/access-requests.css";

function Approvals() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isBelApprover =
    user?.organization === "BEL" &&
    (user?.role === "Admin" || user?.role === "Manager");
  const isAuditor =
    user?.organization === "Auditor" && user?.role === "Auditor";

  const isAuthorized = isBelApprover || isAuditor;

  const validTabs = [
    "action_required",
    "all",
    "mint_proposals",
    "deletion_proposals",
    "revocation_proposals",
  ];
  const tabFromQuery = searchParams.get("tab");

  // Tabs: 'action_required' | 'all' | 'mint_proposals' | 'deletion_proposals' | 'revocation_proposals'
  const [activeTab, setActiveTab] = useState(
    tabFromQuery && validTabs.includes(tabFromQuery) ? tabFromQuery : "action_required"
  );
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Sync activeTab if searchParams change (e.g. user clicked notification while on approvals page)
  useEffect(() => {
    const currentTab = searchParams.get("tab");
    if (currentTab && validTabs.includes(currentTab) && currentTab !== activeTab) {
      setActiveTab(currentTab);
    }
  }, [searchParams]);

  const handleSelectTab = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    setFeedback("");
    setActionError("");
  };

  // Data state
  const [requests, setRequests] = useState([]);
  const [mintProposals, setMintProposals] = useState([]);
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

  // Mint proposal reject modal
  const [rejectMintTarget, setRejectMintTarget] = useState(null);
  const [rejectMintReason, setRejectMintReason] = useState("");

  // Deletion proposal state (multi-party governance)
  const [deletionProposals, setDeletionProposals] = useState([]);
  const [rejectDeleteTarget, setRejectDeleteTarget] = useState(null);
  const [rejectDeleteReason, setRejectDeleteReason] = useState("");
  const [approveDeleteTarget, setApproveDeleteTarget] = useState(null);

  // Identity Revocation proposal state (multi-party governance)
  const [revocationProposals, setRevocationProposals] = useState([]);
  const [rejectRevokeTarget, setRejectRevokeTarget] = useState(null);
  const [rejectRevokeReason, setRejectRevokeReason] = useState("");
  const [approveRevokeTarget, setApproveRevokeTarget] = useState(null);

  // Fetch all requests + proposals relevant to the approver
  async function loadApprovalData() {
    if (!isAuthorized) return;

    try {
      setLoading(true);
      setError("");

      let data = [];
      if (isBelApprover) {
        data = await getAccessRequests();
        // BEL Admin/Manager can also see all mint proposals, deletion proposals, and revocation proposals
        try {
          const proposals = await getAllMintProposals();
          setMintProposals(Array.isArray(proposals) ? proposals : []);
        } catch (e) {
          console.warn("Could not load mint proposals:", e.message);
        }
        try {
          const delProposals = await getDeletionProposals();
          setDeletionProposals(Array.isArray(delProposals) ? delProposals : []);
        } catch (e) {
          console.warn("Could not load deletion proposals:", e.message);
        }
        try {
          const revProposals = await getRevocationProposals();
          setRevocationProposals(Array.isArray(revProposals) ? revProposals : []);
        } catch (e) {
          console.warn("Could not load revocation proposals:", e.message);
        }
      } else if (isAuditor) {
        data = await getAuditorAccessRequests();
        // Auditor fetches pending mint proposals, deletion proposals, and revocation proposals
        try {
          const proposals = await getPendingMintProposals();
          setMintProposals(Array.isArray(proposals) ? proposals : []);
        } catch (e) {
          console.warn("Could not load pending mint proposals:", e.message);
        }
        try {
          const delProposals = await getPendingDeletionProposals();
          setDeletionProposals(Array.isArray(delProposals) ? delProposals : []);
        } catch (e) {
          console.warn("Could not load pending deletion proposals:", e.message);
        }
        try {
          const revProposals = await getRevocationProposals();
          setRevocationProposals(Array.isArray(revProposals) ? revProposals : []);
        } catch (e) {
          console.warn("Could not load revocation proposals:", e.message);
        }
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
    const pendingDeletions = deletionProposals.filter((p) => p.status === "PENDING").length;
    const pendingRevocations = revocationProposals.filter((p) => p.status === "PENDING").length;

    const actionNeeded = isBelApprover
      ? pending
      : isAuditor
      ? belApproved + pendingDeletions + pendingRevocations
      : 0;

    return {
      actionNeeded,
      pending,
      belApproved,
      active,
      rejected,
      pendingDeletions,
      pendingRevocations,
      total: requests.length,
    };
  }, [requests, deletionProposals, revocationProposals, isBelApprover, isAuditor]);

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

  async function handleAuditorApproveMintProposal(proposal) {
    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await approveMintProposal(proposal.proposalId);
      setFeedback(
        `Mint proposal ${proposal.proposalId} co-approved! Asset "${proposal.assetId}" is now ACTIVE on Hyperledger Fabric.`
      );
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to co-approve mint proposal.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmRejectMintProposal() {
    if (!rejectMintTarget) return;
    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await rejectMintProposal(rejectMintTarget.proposalId, rejectMintReason.trim());
      setFeedback(
        `Mint proposal ${rejectMintTarget.proposalId} rejected. Asset "${rejectMintTarget.assetId}" will NOT be minted.`
      );
      setRejectMintTarget(null);
      setRejectMintReason("");
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to reject mint proposal.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmApproveDeletion() {
    if (!approveDeleteTarget) return;
    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await approveDeletionProposal(approveDeleteTarget.proposalId);
      setFeedback(
        `Asset deletion co-approved! Asset "${approveDeleteTarget.assetId}" (${approveDeleteTarget.assetName || ''}) is now officially DECOMMISSIONED/DELETED.`
      );
      setApproveDeleteTarget(null);
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to co-approve asset deletion.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmRejectDeletion() {
    if (!rejectDeleteTarget) return;
    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await rejectDeletionProposal(rejectDeleteTarget.proposalId, rejectDeleteReason.trim());
      setFeedback(
        `Asset deletion proposal ${rejectDeleteTarget.proposalId} rejected. Asset "${rejectDeleteTarget.assetId}" remains active.`
      );
      setRejectDeleteTarget(null);
      setRejectDeleteReason("");
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to reject deletion proposal.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmApproveRevocation() {
    if (!approveRevokeTarget) return;
    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await approveIdentityRevocation(approveRevokeTarget.identityId, approveRevokeTarget.proposalId);
      setFeedback(
        `Identity revocation co-approved! Identity "${approveRevokeTarget.identityId}" is now permanently REVOKED on Hyperledger Fabric and Fabric CA.`
      );
      setApproveRevokeTarget(null);
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to co-approve identity revocation.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmRejectRevocation() {
    if (!rejectRevokeTarget) return;
    try {
      setActionLoading(true);
      setActionError("");
      setFeedback("");

      await rejectIdentityRevocation(
        rejectRevokeTarget.identityId,
        rejectRevokeTarget.proposalId,
        rejectRevokeReason.trim()
      );
      setFeedback(
        `Revocation proposal ${rejectRevokeTarget.proposalId} rejected. Identity "${rejectRevokeTarget.identityId}" remains active.`
      );
      setRejectRevokeTarget(null);
      setRejectRevokeReason("");
      loadApprovalData();
    } catch (err) {
      setActionError(err.message || "Failed to reject revocation proposal.");
    } finally {
      setActionLoading(false);
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
                  onClick={() => handleSelectTab("action_required")}
                >
                  <span>⚡</span> Action Required by You ({stats.actionNeeded})
                </button>

                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "all" ? "active" : ""
                  }`}
                  onClick={() => handleSelectTab("all")}
                >
                  <span>📑</span> All Approval Requests ({stats.total})
                </button>

                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "mint_proposals" ? "active" : ""
                  }`}
                  onClick={() => handleSelectTab("mint_proposals")}
                  style={{ borderColor: activeTab === "mint_proposals" ? "#7c3aed" : undefined }}
                >
                  <span>🏭</span> Mint Proposals ({mintProposals.length})
                  {isAuditor && mintProposals.filter(p => p.status === "PENDING").length > 0 && (
                    <span style={{
                      marginLeft: "6px",
                      background: "#7c3aed",
                      color: "#fff",
                      borderRadius: "10px",
                      padding: "1px 7px",
                      fontSize: "11px",
                      fontWeight: 700
                    }}>
                      {mintProposals.filter(p => p.status === "PENDING").length} pending
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "deletion_proposals" ? "active" : ""
                  }`}
                  onClick={() => handleSelectTab("deletion_proposals")}
                  style={{ borderColor: activeTab === "deletion_proposals" ? "#ef4444" : undefined }}
                >
                  <span>🗑️</span> Deletion Proposals ({deletionProposals.length})
                  {isAuditor && deletionProposals.filter(p => p.status === "PENDING").length > 0 && (
                    <span style={{
                      marginLeft: "6px",
                      background: "#dc2626",
                      color: "#fff",
                      borderRadius: "10px",
                      padding: "1px 7px",
                      fontSize: "11px",
                      fontWeight: 700
                    }}>
                      {deletionProposals.filter(p => p.status === "PENDING").length} pending
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className={`access-tab-btn ${
                    activeTab === "revocation_proposals" ? "active" : ""
                  }`}
                  onClick={() => handleSelectTab("revocation_proposals")}
                  style={{ borderColor: activeTab === "revocation_proposals" ? "#ea580c" : undefined }}
                >
                  <span>🚫</span> Identity Revocations ({revocationProposals.length})
                  {isAuditor && stats.pendingRevocations > 0 && (
                    <span style={{
                      marginLeft: "6px",
                      background: "#ea580c",
                      color: "#fff",
                      borderRadius: "10px",
                      padding: "1px 7px",
                      fontSize: "11px",
                      fontWeight: 700
                    }}>
                      {stats.pendingRevocations} pending
                    </span>
                  )}
                </button>
              </div>

              {/* Approval Queue Table Card */}
              {(activeTab === "action_required" || activeTab === "all") && (
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

                                {/* AUDITOR DECISION BUTTONS */}
                                {isAuditor && reqItem.status === "BEL_APPROVED" && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-auditor-approve"
                                      onClick={() => handleAuditorApprove(reqItem)}
                                      disabled={actionLoading}
                                      title="Co-endorse and grant on Hyperledger Fabric"
                                    >
                                      Co-Approve on Fabric
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
              )}

              {/* ─── MINT PROPOSALS SECTION ─────────────────────────────── */}
              {activeTab === "mint_proposals" && (
                <div className="access-table-card" style={{ marginTop: "20px" }}>
                  <div className="access-table-header-row">
                    <div>
                      <h3>🏭 Mint Proposals — Auditor Co-Approval Queue</h3>
                      <span style={{ fontSize: "12px", color: "#748095" }}>
                        {isAuditor
                          ? "Review mint proposals submitted by BEL Admin. Co-approve to write the asset to Hyperledger Fabric."
                          : "All mint proposals submitted for Auditor co-approval."}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={loadApprovalData}
                      disabled={loading || actionLoading}
                    >
                      {loading ? "Refreshing..." : "↻ Refresh"}
                    </button>
                  </div>

                  {loading && (
                    <div className="asset-message">Loading mint proposals...</div>
                  )}

                  {!loading && mintProposals.length === 0 && (
                    <div className="asset-empty">
                      ✓ No pending mint proposals at this time.
                    </div>
                  )}

                  {!loading && mintProposals.length > 0 && (
                    <div className="access-table-wrapper">
                      <table className="access-table">
                        <thead>
                          <tr>
                            <th>Proposal ID</th>
                            <th>Asset ID</th>
                            <th>Name / Type</th>
                            <th>Owner</th>
                            <th>Proposed By</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mintProposals.map((mp) => (
                            <tr key={mp.proposalId}>
                              <td style={{ fontFamily: "monospace", fontSize: "10px", color: "#94a3b8" }}>
                                {mp.proposalId}
                              </td>
                              <td style={{ fontWeight: 700, color: "#38bdf8" }}>
                                {mp.assetId}
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: "#e5e9ef" }}>{mp.name}</div>
                                <div style={{ fontSize: "10px", color: "#748095" }}>{mp.assetType}</div>
                              </td>
                              <td style={{ color: "#c4cdd9" }}>{mp.owner}</td>
                              <td>
                                <div style={{ color: "#c4cdd9" }}>{mp.proposedByName || mp.proposedBy}</div>
                                <div style={{ fontSize: "10px", color: "#748095" }}>BEL</div>
                              </td>
                              <td>
                                {mp.status === "PENDING" && (
                                  <span className="access-badge status-badge-pending">⏳ PENDING</span>
                                )}
                                {mp.status === "APPROVED" && (
                                  <span className="access-badge status-badge-active">● APPROVED (On-Chain)</span>
                                )}
                                {mp.status === "REJECTED" && (
                                  <span className="access-badge status-badge-rejected">✕ REJECTED</span>
                                )}
                              </td>
                              <td className="access-table-time">
                                {formatDate(mp.createdAt)}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  {isAuditor && mp.status === "PENDING" && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-auditor-approve"
                                        onClick={() => handleAuditorApproveMintProposal(mp)}
                                        disabled={actionLoading}
                                        title="Co-approve and mint on Hyperledger Fabric"
                                      >
                                        ✅ Co-Approve
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-reject"
                                        onClick={() => {
                                          setRejectMintTarget(mp);
                                          setRejectMintReason("");
                                        }}
                                        disabled={actionLoading}
                                        title="Reject this mint proposal"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {mp.status !== "PENDING" && (
                                    <span style={{ fontSize: "11px", color: "#748095" }}>
                                      {mp.status === "APPROVED"
                                        ? `✓ by ${mp.auditorId || "auditor"}`
                                        : `✕ by ${mp.auditorId || "auditor"}`}
                                    </span>
                                  )}
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

              {/* ─── DELETION PROPOSALS SECTION ───────────────────────────── */}
              {activeTab === "deletion_proposals" && (
                <div className="access-table-card" style={{ marginTop: "20px" }}>
                  <div className="access-table-header-row">
                    <div>
                      <h3>🗑️ Asset Deletion & Decommissioning Queue</h3>
                      <span style={{ fontSize: "12px", color: "#748095" }}>
                        {isAuditor
                          ? "Review asset decommissioning proposals submitted by BEL Administrators. Mandatory co-approval required before deactivating."
                          : "All asset deletion proposals submitted for Auditor co-approval."}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={loadApprovalData}
                      disabled={loading || actionLoading}
                    >
                      {loading ? "Refreshing..." : "↻ Refresh"}
                    </button>
                  </div>

                  {loading && (
                    <div className="asset-message">Loading deletion proposals...</div>
                  )}

                  {!loading && deletionProposals.length === 0 && (
                    <div className="asset-empty">
                      ✓ No asset deletion proposals found. All active assets remain in good standing.
                    </div>
                  )}

                  {!loading && deletionProposals.length > 0 && (
                    <div className="access-table-wrapper">
                      <table className="access-table">
                        <thead>
                          <tr>
                            <th>Proposal ID</th>
                            <th>Target Asset</th>
                            <th>Asset Name & Type</th>
                            <th>Proposed By</th>
                            <th>Reason for Decommissioning</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th>Decisions & Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deletionProposals.map((dp) => (
                            <tr key={dp.proposalId}>
                              <td style={{ fontFamily: "monospace", fontSize: "10px", color: "#94a3b8" }}>
                                {dp.proposalId}
                              </td>
                              <td style={{ fontWeight: 700, color: "#38bdf8" }}>
                                <Link
                                  to={`/assets/${encodeURIComponent(dp.assetId)}`}
                                  style={{ color: "#38bdf8", textDecoration: "none" }}
                                  title="View Asset Details"
                                >
                                  {dp.assetId} ↗
                                </Link>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: "#e5e9ef" }}>{dp.assetName || dp.assetId}</div>
                                <div style={{ fontSize: "10px", color: "#748095" }}>{dp.assetType || "DEFENSE_ASSET"}</div>
                              </td>
                              <td>
                                <div style={{ color: "#c4cdd9" }}>{dp.proposedByName || dp.proposedBy}</div>
                                <div style={{ fontSize: "10px", color: "#748095" }}>BEL Admin</div>
                              </td>
                              <td style={{ maxWidth: "260px" }}>
                                <div style={{
                                  fontSize: "12px",
                                  color: "#fca5a5",
                                  background: "rgba(127, 29, 29, 0.2)",
                                  padding: "6px 10px",
                                  borderRadius: "4px",
                                  borderLeft: "3px solid #ef4444"
                                }}>
                                  "{dp.reason}"
                                </div>
                              </td>
                              <td>
                                {dp.status === "PENDING" && (
                                  <span className="access-badge status-badge-pending">⏳ PENDING AUDITOR</span>
                                )}
                                {dp.status === "APPROVED" && (
                                  <span className="access-badge status-badge-rejected">✕ DECOMMISSIONED</span>
                                )}
                                {dp.status === "REJECTED" && (
                                  <span className="access-badge status-badge-bel-approved">● REJECTED (ACTIVE)</span>
                                )}
                              </td>
                              <td className="access-table-time">
                                {formatDate(dp.createdAt)}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  {isAuditor && dp.status === "PENDING" && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-auditor-approve"
                                        style={{ background: "#dc2626", borderColor: "#ef4444" }}
                                        onClick={() => setApproveDeleteTarget(dp)}
                                        disabled={actionLoading}
                                        title="Co-approve decommissioning of this asset"
                                      >
                                        🗑️ Co-Approve Deletion
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-reject"
                                        onClick={() => {
                                          setRejectDeleteTarget(dp);
                                          setRejectDeleteReason("");
                                        }}
                                        disabled={actionLoading}
                                        title="Reject decommissioning proposal"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {dp.status !== "PENDING" && (
                                    <span style={{ fontSize: "11px", color: "#748095" }}>
                                      {dp.status === "APPROVED"
                                        ? `✓ Co-approved by ${dp.auditorId || "Auditor"}`
                                        : `✕ Rejected by ${dp.auditorId || "Auditor"}`}
                                    </span>
                                  )}
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

              {/* ─── IDENTITY REVOCATION PROPOSALS SECTION ─────────────────── */}
              {activeTab === "revocation_proposals" && (
                <div className="access-table-card" style={{ marginTop: "20px" }}>
                  <div className="access-table-header-row">
                    <div>
                      <h3>🚫 Identity Revocation Governance Queue</h3>
                      <span style={{ fontSize: "12px", color: "#748095" }}>
                        {isAuditor
                          ? "Review identity revocation proposals submitted by BEL Administrators. Independent Auditor co-approval is required before on-chain ledger & CA revocation."
                          : "Identity revocation proposals submitted to Auditor for multi-party co-approval."}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={loadApprovalData}
                      disabled={loading || actionLoading}
                    >
                      {loading ? "Refreshing..." : "↻ Refresh"}
                    </button>
                  </div>

                  {loading && (
                    <div className="asset-message">Loading revocation proposals...</div>
                  )}

                  {!loading && revocationProposals.length === 0 && (
                    <div className="asset-empty">
                      ✓ No identity revocation proposals found. All identities are in good standing.
                    </div>
                  )}

                  {!loading && revocationProposals.length > 0 && (
                    <div className="access-table-wrapper">
                      <table className="access-table">
                        <thead>
                          <tr>
                            <th>Proposal ID</th>
                            <th>Target Identity</th>
                            <th>Organization</th>
                            <th>Proposed By</th>
                            <th>Revocation Reason</th>
                            <th>Status</th>
                            <th>Submitted</th>
                            <th>Decisions & Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {revocationProposals.map((rp) => (
                            <tr key={rp.proposalId}>
                              <td style={{ fontFamily: "monospace", fontSize: "10px", color: "#94a3b8" }}>
                                {rp.proposalId}
                              </td>
                              <td>
                                <div style={{ fontWeight: 700, color: "#f87171" }}>
                                  {rp.identityId}
                                </div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: "#e5e9ef" }}>{rp.organization || "BEL"}</div>
                                <span className="org-tag" style={{ fontSize: "10px", marginTop: "2px" }}>
                                  {rp.organization === "Contractor" ? "ContractorMSP" : rp.organization === "Auditor" ? "AuditorMSP" : "BELMSP"}
                                </span>
                              </td>
                              <td>
                                <div style={{ color: "#c4cdd9" }}>{rp.proposedByName || rp.proposedBy}</div>
                                <div style={{ fontSize: "10px", color: "#748095" }}>BEL Admin</div>
                              </td>
                              <td style={{ maxWidth: "260px" }}>
                                <div style={{
                                  fontSize: "12px",
                                  color: "#fca5a5",
                                  background: "rgba(127, 29, 29, 0.2)",
                                  padding: "6px 10px",
                                  borderRadius: "4px",
                                  borderLeft: "3px solid #ef4444"
                                }}>
                                  "{rp.reason}"
                                </div>
                              </td>
                              <td>
                                {rp.status === "PENDING" && (
                                  <span className="access-badge status-badge-pending">⏳ PENDING AUDITOR</span>
                                )}
                                {rp.status === "APPROVED" && (
                                  <span className="access-badge status-badge-rejected">● REVOKED ON-CHAIN</span>
                                )}
                                {rp.status === "REJECTED" && (
                                  <span className="access-badge status-badge-bel-approved">✕ REJECTED (ACTIVE)</span>
                                )}
                              </td>
                              <td className="access-table-time">
                                {formatDate(rp.createdAt)}
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  {isAuditor && rp.status === "PENDING" && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-auditor-approve"
                                        style={{ background: "#dc2626", borderColor: "#ef4444" }}
                                        onClick={() => setApproveRevokeTarget(rp)}
                                        disabled={actionLoading}
                                        title="Co-approve revocation and revoke on Hyperledger Fabric"
                                      >
                                        🚫 Co-Approve
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-reject"
                                        onClick={() => {
                                          setRejectRevokeTarget(rp);
                                          setRejectRevokeReason("");
                                        }}
                                        disabled={actionLoading}
                                        title="Reject revocation proposal"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                  {rp.status !== "PENDING" && (
                                    <div style={{ fontSize: "11px", color: "#748095" }}>
                                      {rp.status === "APPROVED" ? (
                                        <>
                                          <span style={{ color: "#ef4444", fontWeight: 600 }}>
                                            ✓ Co-approved by {rp.auditorId || "Auditor"}
                                          </span>
                                          {rp.fabricTxId && (
                                            <div
                                              style={{ fontFamily: "monospace", fontSize: "10px", color: "#64748b", marginTop: "2px" }}
                                              title={rp.fabricTxId}
                                            >
                                              Tx: {rp.fabricTxId.slice(0, 10)}...
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <span style={{ color: "#94a3b8" }}>
                                          ✕ Rejected by {rp.auditorId || "Auditor"}
                                        </span>
                                      )}
                                    </div>
                                  )}
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

              {/* MINT PROPOSAL REJECT MODAL */}

              <ConfirmModal
                isOpen={!!rejectMintTarget}
                title="Reject Mint Proposal"
                message={
                  <div>
                    <p style={{ margin: "0 0 10px" }}>
                      Are you sure you want to reject the mint proposal for asset{" "}
                      <strong>{rejectMintTarget?.assetId}</strong> ("{rejectMintTarget?.name}")?
                      The asset will <strong>NOT</strong> be written to Hyperledger Fabric.
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
                      placeholder="e.g. Incomplete documentation or policy violation"
                      value={rejectMintReason}
                      onChange={(e) => setRejectMintReason(e.target.value)}
                    />
                  </div>
                }
                confirmText="Reject Proposal"
                cancelText="Cancel"
                confirmVariant="danger"
                loading={actionLoading}
                onConfirm={handleConfirmRejectMintProposal}
                onClose={() => {
                  if (!actionLoading) setRejectMintTarget(null);
                }}
              />

              {/* CO-APPROVE DELETION MODAL */}
              <ConfirmModal
                isOpen={!!approveDeleteTarget}
                title="Co-Approve Asset Decommissioning"
                message={
                  <div>
                    <p style={{ margin: "0 0 10px", color: "#f87171" }}>
                      Are you sure you want to co-approve the permanent decommissioning of asset{" "}
                      <strong>{approveDeleteTarget?.assetId}</strong> ("{approveDeleteTarget?.assetName}")?
                    </p>
                    <div style={{
                      background: "#1e1b2e",
                      border: "1px solid #7f1d1d",
                      borderRadius: "6px",
                      padding: "10px",
                      fontSize: "12px",
                      color: "#fecaca"
                    }}>
                      <strong>BEL Admin Reason for Decommissioning:</strong>
                      <div style={{ marginTop: "4px", fontStyle: "italic" }}>
                        "{approveDeleteTarget?.reason}"
                      </div>
                    </div>
                    <p style={{ marginTop: "10px", fontSize: "12px", color: "#94a3b8" }}>
                      This action will officially mark the asset as DELETED / DECOMMISSIONED on the ledger and permanently prevent future access grants, transfers, and updates.
                    </p>
                  </div>
                }
                confirmText="Co-Approve & Decommission"
                cancelText="Cancel"
                confirmVariant="danger"
                loading={actionLoading}
                onConfirm={handleConfirmApproveDeletion}
                onClose={() => {
                  if (!actionLoading) setApproveDeleteTarget(null);
                }}
              />

              {/* REJECT DELETION MODAL */}
              <ConfirmModal
                isOpen={!!rejectDeleteTarget}
                title="Reject Asset Decommissioning Proposal"
                message={
                  <div>
                    <p style={{ margin: "0 0 10px" }}>
                      Are you sure you want to reject the deletion proposal for asset{" "}
                      <strong>{rejectDeleteTarget?.assetId}</strong> ("{rejectDeleteTarget?.assetName}")?
                      The asset will remain <strong>ACTIVE</strong> on the ledger.
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
                      placeholder="e.g. Asset still required for ongoing mission or insufficient justification"
                      value={rejectDeleteReason}
                      onChange={(e) => setRejectDeleteReason(e.target.value)}
                    />
                  </div>
                }
                confirmText="Reject Deletion"
                cancelText="Cancel"
                confirmVariant="danger"
                loading={actionLoading}
                onConfirm={handleConfirmRejectDeletion}
                onClose={() => {
                  if (!actionLoading) setRejectDeleteTarget(null);
                }}
              />

              {/* CO-APPROVE IDENTITY REVOCATION MODAL */}
              <ConfirmModal
                isOpen={!!approveRevokeTarget}
                title="Co-Approve Identity Revocation (Multi-Party Governance)"
                message={
                  <div>
                    <p style={{ margin: "0 0 10px", color: "#f87171" }}>
                      Are you sure you want to co-approve the permanent revocation of identity{" "}
                      <strong>{approveRevokeTarget?.identityId}</strong> ({approveRevokeTarget?.organization})?
                    </p>
                    <div style={{
                      background: "#1e1b2e",
                      border: "1px solid #7f1d1d",
                      borderRadius: "6px",
                      padding: "10px",
                      fontSize: "12px",
                      color: "#fecaca"
                    }}>
                      <strong>BEL Admin Revocation Justification:</strong>
                      <div style={{ marginTop: "4px", fontStyle: "italic" }}>
                        "{approveRevokeTarget?.reason}"
                      </div>
                    </div>
                    <p style={{ marginTop: "10px", fontSize: "12px", color: "#94a3b8" }}>
                      ⚠️ <strong>Ledger Impact:</strong> Co-approving executes an on-chain RevokeIdentity transaction on Hyperledger Fabric and revokes user certificates in the Fabric CA. This identity will no longer be permitted to log in or interact with the ledger.
                    </p>
                  </div>
                }
                confirmText="Co-Approve & Revoke"
                cancelText="Cancel"
                confirmVariant="danger"
                loading={actionLoading}
                onConfirm={handleConfirmApproveRevocation}
                onClose={() => {
                  if (!actionLoading) setApproveRevokeTarget(null);
                }}
              />

              {/* REJECT IDENTITY REVOCATION MODAL */}
              <ConfirmModal
                isOpen={!!rejectRevokeTarget}
                title="Reject Identity Revocation Proposal"
                message={
                  <div>
                    <p style={{ margin: "0 0 10px" }}>
                      Are you sure you want to reject the revocation proposal for identity{" "}
                      <strong>{rejectRevokeTarget?.identityId}</strong>?
                      The identity will remain <strong>ACTIVE</strong> on Hyperledger Fabric.
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
                      placeholder="e.g. Insufficient justification or credentials still valid"
                      value={rejectRevokeReason}
                      onChange={(e) => setRejectRevokeReason(e.target.value)}
                    />
                  </div>
                }
                confirmText="Reject Proposal"
                cancelText="Cancel"
                confirmVariant="danger"
                loading={actionLoading}
                onConfirm={handleConfirmRejectRevocation}
                onClose={() => {
                  if (!actionLoading) setRejectRevokeTarget(null);
                }}
              />


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
