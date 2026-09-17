import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import ConfirmModal from "../../components/common/ConfirmModal";
import {
  createIdentity,
  getIdentity,
  revokeIdentity,
  proposeRevokeIdentity,
} from "../../services/identityService";
import { getAuditorIdentities } from "../../services/auditorService";

import "../../styles/layout.css";
import "../../styles/access.css";
import "../../styles/identity.css";

const NETWORK_IDENTITY_IDS = [
  "BEL001",
  "BEL002",
  "BEL003",
  "AUD001",
  "CON001",
  "CON002"
];

const SESSION_IDENTITIES_KEY = "chaincoder_session_identities";

function getStoredSessionIdentities() {
  try {
    const raw = sessionStorage.getItem(SESSION_IDENTITIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessionIdentities(list) {
  try {
    sessionStorage.setItem(SESSION_IDENTITIES_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota
  }
}

function IdentityManagement() {
  const { user } = useAuth();

  // Role permissions following backend authorization rules:
  // BEL Admin: Can register for BEL or Contractor (any role), and can revoke identities
  // BEL Manager: Can only register BEL staff identities with role in [Admin, Manager, Employee]
  // Contractor Admin: Can only register Contractor identities with role in [Admin, User]
  // Auditor, BEL Employee, Contractor User: Cannot register or revoke
  const isBelAdmin = user?.organization === "BEL" && user?.role === "Admin";
  const isBelManager = user?.organization === "BEL" && user?.role === "Manager";
  const isContractorAdmin = user?.organization === "Contractor" && user?.role === "Admin";
  const isAuditor = user?.organization === "Auditor" && user?.role === "Auditor";

  const canRegister = isBelAdmin || isBelManager || isContractorAdmin;
  const canRevoke = isBelAdmin;

  // Active Tab: "directory" | "register"
  const [activeTab, setActiveTab] = useState("directory");

  // Search & Lookup State
  const [searchId, setSearchId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchedIdentity, setSearchedIdentity] = useState(null);
  const [searchError, setSearchError] = useState("");
  const [sessionIdentities, setSessionIdentities] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);

  // Load real identities from ledger/auditor and initialize directory with all network participants
  useEffect(() => {
    let isMounted = true;

    async function loadDirectory() {
      try {
        setDirectoryLoading(true);
        if (isAuditor) {
          const res = await getAuditorIdentities();
          const list = res?.identities || res || [];
          if (isMounted && Array.isArray(list)) {
            setSessionIdentities(list);
            saveSessionIdentities(list);
          }
        } else {
          // For BEL Admin, BEL Manager, Contractor Admin:
          // Gather candidate IDs from network candidates, user self, and sessionStorage
          const stored = getStoredSessionIdentities();
          const candidateSet = new Set([
            ...NETWORK_IDENTITY_IDS,
            ...(user?.userId ? [user.userId] : []),
            ...stored.map((i) => i.identityId),
          ]);

          // Filter candidates if Contractor Admin (can only view Contractor identities + self)
          const targetIds = Array.from(candidateSet).filter((id) => {
            if (isContractorAdmin) {
              return id.startsWith("CON") || id === user?.userId;
            }
            return true;
          });

          const results = await Promise.allSettled(
            targetIds.map((id) => getIdentity(id))
          );

          const loaded = [];
          for (const r of results) {
            if (r.status === "fulfilled" && r.value && r.value.identityId) {
              loaded.push(r.value);
            }
          }

          if (isMounted) {
            // Sort: current user first, then alphabetical by ID
            loaded.sort((a, b) => {
              if (a.identityId === user?.userId) return -1;
              if (b.identityId === user?.userId) return 1;
              return a.identityId.localeCompare(b.identityId);
            });
            setSessionIdentities(loaded);
            saveSessionIdentities(loaded);
          }
        }
      } catch (err) {
        console.warn("Could not load initial identity directory:", err.message);
      } finally {
        if (isMounted) setDirectoryLoading(false);
      }
    }

    loadDirectory();

    return () => {
      isMounted = false;
    };
  }, [isAuditor, isContractorAdmin, user?.userId]);

  // Register Form State
  const initialOrg = isContractorAdmin ? "Contractor" : "BEL";
  const initialRole = isContractorAdmin ? "User" : "Employee";

  const [regId, setRegId] = useState("");
  const [regName, setRegName] = useState("");
  const [regOrg, setRegOrg] = useState(initialOrg);
  const [regRole, setRegRole] = useState(initialRole);
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState(null);

  // Revocation Modal State (Multi-Party Governance Proposal)
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState("");
  const [revokeSuccess, setRevokeSuccess] = useState("");

  // Update role options when organization changes
  const handleOrgChange = (newOrg) => {
    setRegOrg(newOrg);
    if (newOrg === "BEL") {
      setRegRole("Employee");
    } else if (newOrg === "Contractor") {
      setRegRole("User");
    } else if (newOrg === "Auditor") {
      setRegRole("Auditor");
    }
  };

  // Search / Lookup Identity
  const handleSearch = async (e, directId) => {
    if (e) e.preventDefault();
    const idToLookup = (directId || searchId).trim();
    if (!idToLookup) {
      setSearchError("Please enter an Identity ID to search.");
      return;
    }

    try {
      setSearching(true);
      setSearchError("");
      setRevokeSuccess("");
      const result = await getIdentity(idToLookup);
      setSearchedIdentity(result);

      // Update or prepend to session identities
      setSessionIdentities((prev) => {
        const exists = prev.some((item) => item.identityId === result.identityId);
        const updated = exists
          ? prev.map((item) => (item.identityId === result.identityId ? { ...item, ...result } : item))
          : [result, ...prev];
        saveSessionIdentities(updated);
        return updated;
      });
    } catch (err) {
      setSearchedIdentity(null);
      setSearchError(err.message || "Identity not found or access denied.");
    } finally {
      setSearching(false);
    }
  };

  // Submit Registration
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegisterError("");
    setRegisterSuccess(null);

    const trimmedId = regId.trim();
    const trimmedName = regName.trim();

    // Client-side validation
    if (!trimmedId) {
      setRegisterError("Identity ID is required.");
      return;
    }

    // Check for illegal characters (matching backend assertSafeId)
    if (trimmedId.includes("..") || trimmedId.includes("/") || trimmedId.includes("\\")) {
      setRegisterError("Identity ID contains invalid characters (slashes or double dots).");
      return;
    }

    if (!trimmedName) {
      setRegisterError("Full Name is required.");
      return;
    }

    if (!regOrg) {
      setRegisterError("Organization is required.");
      return;
    }

    if (!regRole) {
      setRegisterError("Role is required.");
      return;
    }

    if (!regPassword) {
      setRegisterError("Password is required for the new account.");
      return;
    }

    if (regPassword.length < 8) {
      setRegisterError("Password must be at least 8 characters long.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegisterError("Passwords do not match.");
      return;
    }

    // Role safety validation based on caller
    if (isBelManager && regOrg !== "BEL") {
      setRegisterError("BEL Manager can only register BEL staff.");
      return;
    }

    if (isContractorAdmin && regOrg !== "Contractor") {
      setRegisterError("Contractor Admin can only register Contractor users.");
      return;
    }

    try {
      setRegistering(true);
      const newIdentity = await createIdentity({
        identityId: trimmedId,
        name: trimmedName,
        organization: regOrg,
        role: regRole,
        password: regPassword,
      });

      const confirmedIdentity = {
        identityId: newIdentity.identityId || newIdentity.userId || trimmedId,
        name: newIdentity.name || trimmedName,
        organization: newIdentity.organization || regOrg,
        role: newIdentity.role || regRole,
        status: newIdentity.status || "ACTIVE",
        did: newIdentity.did || `did:chaincoder:${regOrg}:${trimmedId}`,
        createdAt: newIdentity.createdAt || new Date().toISOString(),
      };

      setRegisterSuccess(confirmedIdentity);

      // Add to session list and select it in lookup view
      setSessionIdentities((prev) => {
        const updated = [
          confirmedIdentity,
          ...prev.filter((i) => i.identityId !== confirmedIdentity.identityId),
        ];
        saveSessionIdentities(updated);
        return updated;
      });
      setSearchedIdentity(confirmedIdentity);

      // Clear input fields for next entry
      setRegId("");
      setRegName("");
      setRegPassword("");
      setRegConfirmPassword("");
    } catch (err) {
      setRegisterError(err.message || "Unable to register identity on blockchain.");
    } finally {
      setRegistering(false);
    }
  };

  // Open Revocation Modal
  const handleOpenRevokeModal = (identity) => {
    if (!isBelAdmin) return;
    setRevokeTarget(identity);
    setRevokeReason("");
    setRevokeError("");
  };

  // Confirm Revocation Proposal (Multi-Party Governance)
  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;

    const trimmedReason = revokeReason.trim();
    if (!trimmedReason) {
      setRevokeError("A revocation reason is required for security governance audit.");
      return;
    }

    try {
      setRevoking(true);
      setRevokeError("");
      const result = await proposeRevokeIdentity(revokeTarget.identityId, trimmedReason);

      setRevokeSuccess(
        `Revocation proposal for identity "${revokeTarget.identityId}" (${revokeTarget.name}) submitted successfully. It is now awaiting independent Auditor co-approval in the Approvals Queue.`
      );
      setRevokeTarget(null);
      setRevokeReason("");
    } catch (err) {
      setRevokeError(err.message || "Failed to submit identity revocation proposal.");
    } finally {
      setRevoking(false);
    }
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Identity Lifecycle Management"
          subtitle="Provision Fabric CA identities, deterministic W3C DIDs, and audit status"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          {/* Page Header */}
          <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2>Identity Management</h2>
              <p>
                Blockchain-backed identity registration, directory inspection, and lifecycle governance.
              </p>
            </div>

            <div className="identity-role-pill">
              <span className="identity-label" style={{ margin: 0, marginRight: "8px" }}>Caller Role:</span>
              <strong>{user?.organization} · {user?.role}</strong>
            </div>
          </div>

          {/* Role Capability Alert Banner */}
          <div className="identity-authority-banner">
            <span className="authority-icon">⚖</span>
            <div className="authority-text">
              {isBelAdmin && (
                <span>
                  <strong>BEL Admin Authority:</strong> You have full administrative governance. You can register identities across BEL and Contractor organizations, inspect all records, and revoke active identities on the blockchain.
                </span>
              )}
              {isBelManager && (
                <span>
                  <strong>BEL Manager Authority:</strong> You can register BEL staff identities (Admin, Manager, Employee) and inspect identity records. Identity revocation is restricted to BEL Admin.
                </span>
              )}
              {isContractorAdmin && (
                <span>
                  <strong>Contractor Admin Authority:</strong> You can register Contractor identities (Admin, User) and inspect Contractor records.
                </span>
              )}
              {isAuditor && (
                <span>
                  <strong>Auditor Oversight:</strong> Read-only compliance view. You can inspect all registered blockchain identities and audit status records.
                </span>
              )}
              {!canRegister && !isAuditor && (
                <span>
                  <strong>Standard User View:</strong> You may search and inspect identity records permitted by your organization's security policy.
                </span>
              )}
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="access-tabs" style={{ marginTop: "20px" }}>
            <button
              type="button"
              className={`access-tab-btn ${activeTab === "directory" ? "active" : ""}`}
              onClick={() => setActiveTab("directory")}
            >
              <span>◎</span>
              <span>Directory & Lookup</span>
            </button>

            {canRegister && (
              <button
                type="button"
                className={`access-tab-btn ${activeTab === "register" ? "active" : ""}`}
                onClick={() => setActiveTab("register")}
              >
                <span>+</span>
                <span>Register Identity</span>
              </button>
            )}
          </div>

          {/* Success / Info Alerts */}
          {revokeSuccess && (
            <div className="identity-banner-success" style={{ marginBottom: "20px" }}>
              <span>✓</span>
              <span>{revokeSuccess}</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 1: DIRECTORY & LOOKUP                                   */}
          {/* ============================================================ */}
          {activeTab === "directory" && (
            <div className="identity-directory-tab">
              {/* Search Card */}
              <div className="access-search-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
                  <div>
                    <h3 style={{ margin: "0 0 4px", fontSize: "16px", color: "#ffffff" }}>
                      Blockchain Identity Lookup
                    </h3>
                    <p style={{ margin: 0, color: "#748095", fontSize: "12px" }}>
                      Query any identity record directly from Hyperledger Fabric ledger.
                    </p>
                  </div>

                  {/* Seed Shortcut Chips */}
                  <div className="identity-seed-shortcuts">
                    <span style={{ fontSize: "11px", color: "#64748b" }}>Quick Search:</span>
                    {["BEL001", "BEL002", "AUD001", "CON001", "CON002"].map((presetId) => (
                      <button
                        key={presetId}
                        type="button"
                        className="identity-chip-btn"
                        onClick={(e) => {
                          setSearchId(presetId);
                          handleSearch(e, presetId);
                        }}
                      >
                        {presetId}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={(e) => handleSearch(e)} className="access-search-row">
                  <input
                    type="text"
                    className="access-search-input"
                    placeholder="Enter Identity ID (e.g. BEL001, CON001)..."
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="access-btn-primary"
                    disabled={searching || !searchId.trim()}
                  >
                    {searching ? "Querying Blockchain..." : "Search Identity"}
                  </button>
                </form>

                {searchError && (
                  <div className="identity-error" style={{ marginTop: "14px" }}>
                    ✕ {searchError}
                  </div>
                )}
              </div>

              {/* Searched Identity Profile View */}
              {searchedIdentity && (
                <div className="identity-inspected-card">
                  <div className="identity-status-card" style={{ marginBottom: "14px" }}>
                    <div>
                      <span className="identity-label">Identity Status</span>
                      <h3>
                        {searchedIdentity.name} ({searchedIdentity.identityId})
                      </h3>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        className={
                          searchedIdentity.status === "REVOKED"
                            ? "identity-status-badge badge-revoked"
                            : "identity-status-badge badge-active"
                        }
                      >
                        {searchedIdentity.status === "REVOKED" ? "■ REVOKED" : "● ACTIVE"}
                      </div>

                      <div className="verified-badge">
                        ✓ VERIFIED ON-CHAIN
                      </div>
                    </div>
                  </div>

                  <div className="identity-grid">
                    <div className="identity-card">
                      <span>Identity ID</span>
                      <strong>{searchedIdentity.identityId}</strong>
                    </div>

                    <div className="identity-card">
                      <span>Full Name</span>
                      <strong>{searchedIdentity.name}</strong>
                    </div>

                    <div className="identity-card">
                      <span>Organization</span>
                      <strong>{searchedIdentity.organization}</strong>
                    </div>

                    <div className="identity-card">
                      <span>Role</span>
                      <strong>{searchedIdentity.role}</strong>
                    </div>

                    <div className="identity-card">
                      <span>Membership Service Provider (MSP)</span>
                      <strong>{searchedIdentity.mspId || (searchedIdentity.organization === "Contractor" ? "ContractorMSP" : searchedIdentity.organization === "Auditor" ? "AuditorMSP" : "BELMSP")}</strong>
                    </div>

                    <div className="identity-card">
                      <span>Registration Timestamp</span>
                      <strong>
                        {searchedIdentity.createdAt
                          ? new Date(searchedIdentity.createdAt).toLocaleString()
                          : "Genesis Record"}
                      </strong>
                    </div>
                  </div>

                  {/* Revoke Identity Action Area */}
                  {canRevoke && (
                    <div className="identity-governance-box">
                      <div className="governance-info">
                        <strong>Identity Revocation Governance (Multi-Party)</strong>
                        <p>
                          Revoking an identity requires a multi-party governance workflow. Submitting a proposal queues the request for independent Auditor co-approval before deactivation on Hyperledger Fabric and Fabric CA.
                        </p>
                      </div>

                      <div>
                        {searchedIdentity.status === "REVOKED" ? (
                          <button
                            type="button"
                            className="identity-btn-revoked"
                            disabled
                          >
                            Identity Already Revoked
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="identity-btn-danger"
                            onClick={() => handleOpenRevokeModal(searchedIdentity)}
                          >
                            Propose Revocation
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Session Identity Directory Table */}
              <div className="identity-table-card">
                <div className="table-header-row">
                  <div>
                    <h3 style={{ margin: 0, fontSize: "15px", color: "#ffffff" }}>
                      Identity Directory (Session Records)
                    </h3>
                    <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "12px" }}>
                      Active participants and recently queried identities.
                    </p>
                  </div>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    {sessionIdentities.length} records available
                  </span>
                </div>

                <div className="identity-table-wrapper">
                  <table className="identity-table">
                    <thead>
                      <tr>
                        <th>Identity ID</th>
                        <th>Name</th>
                        <th>Organization</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {directoryLoading ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: "center", padding: "28px", color: "var(--text-muted)" }}>
                            Querying Hyperledger Fabric directory...
                          </td>
                        </tr>
                      ) : sessionIdentities.length > 0 ? (
                        sessionIdentities.map((item) => (
                          <tr key={item.identityId}>
                            <td>
                              <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                                {item.identityId}
                              </strong>
                            </td>
                            <td>{item.name}</td>
                            <td>
                              <span className="org-tag">{item.organization}</span>
                            </td>
                            <td>{item.role}</td>
                            <td>
                              <span
                                className={`status-pill ${
                                  item.status === "REVOKED" ? "pill-revoked" : "pill-active"
                                }`}
                              >
                                {item.status || "ACTIVE"}
                              </span>
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <div style={{ display: "inline-flex", gap: "8px" }}>
                                <button
                                  type="button"
                                  className="table-btn-inspect"
                                  onClick={(e) => {
                                    setSearchId(item.identityId);
                                    handleSearch(e, item.identityId);
                                  }}
                                >
                                  Inspect
                                </button>

                                {canRevoke && item.status !== "REVOKED" && (
                                  <button
                                    type="button"
                                    className="table-btn-revoke"
                                    onClick={() => handleOpenRevokeModal(item)}
                                    title="Propose identity revocation for Auditor co-approval"
                                  >
                                    Propose Revoke
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="6" style={{ textAlign: "center", padding: "36px 16px", color: "var(--text-muted)" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                              <strong style={{ color: "var(--text-primary)", fontSize: "14px" }}>No Identities in Current View</strong>
                              <span style={{ fontSize: "12px", maxWidth: "380px" }}>
                                Enter an Identity ID in the search box above to query Fabric credentials, or register a new identity if authorized.
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* TAB 2: REGISTER IDENTITY                                    */}
          {/* ============================================================ */}
          {activeTab === "register" && canRegister && (
            <div className="identity-register-tab">
              <div className="identity-form-card">
                <div style={{ marginBottom: "20px" }}>
                  <h3 style={{ margin: "0 0 6px", fontSize: "18px", color: "#ffffff" }}>
                    Register New Identity on Blockchain
                  </h3>
                  <p style={{ margin: 0, color: "#748095", fontSize: "13px" }}>
                    Submits an immutable identity registration transaction to Hyperledger Fabric.
                  </p>
                </div>

                {registerError && (
                  <div className="identity-error" style={{ marginBottom: "18px" }}>
                    ✕ {registerError}
                  </div>
                )}

                {registerSuccess && (
                  <div className="identity-success-card" style={{ marginBottom: "20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <span style={{ color: "#10b981", fontSize: "18px" }}>✓</span>
                      <strong style={{ color: "#ffffff", fontSize: "15px" }}>
                        Identity & Platform Account Provisioned Successfully
                      </strong>
                    </div>

                    <p style={{ margin: "0 0 12px", color: "#94a3b8", fontSize: "12px" }}>
                      Identity transaction confirmed on Hyperledger Fabric ledger, Fabric CA certificate provisioned, and application account created.
                    </p>

                    <div className="identity-grid" style={{ marginBottom: "12px" }}>
                      <div className="identity-card">
                        <span>Identity ID</span>
                        <strong>{registerSuccess.identityId}</strong>
                      </div>
                      <div className="identity-card">
                        <span>Name</span>
                        <strong>{registerSuccess.name}</strong>
                      </div>
                      <div className="identity-card">
                        <span>Organization</span>
                        <strong>{registerSuccess.organization}</strong>
                      </div>
                      <div className="identity-card">
                        <span>Role</span>
                        <strong>{registerSuccess.role}</strong>
                      </div>
                      <div className="identity-card">
                        <span>Status</span>
                        <strong style={{ color: "#34d399" }}>● ACTIVE</strong>
                      </div>
                      <div className="identity-card" style={{ gridColumn: "1 / -1" }}>
                        <span>W3C Decentralized Identifier (DID)</span>
                        <strong style={{ fontFamily: "monospace", fontSize: "12px", color: "#38bdf8" }}>
                          {registerSuccess.did || `did:chaincoder:${registerSuccess.organization}:${registerSuccess.identityId}`}
                        </strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="access-btn-primary"
                      onClick={() => setActiveTab("directory")}
                    >
                      View in Directory & Lookup
                    </button>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit}>
                  {/* Identity ID */}
                  <div className="identity-form-group">
                    <label className="identity-form-label">
                      Identity ID <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="identity-form-input"
                      placeholder="e.g. BEL004, CON003, ENG001"
                      value={regId}
                      onChange={(e) => setRegId(e.target.value)}
                      disabled={registering}
                      required
                    />
                    <span className="identity-input-help">
                      Unique alphanumeric identifier without slashes or traversal characters.
                    </span>
                  </div>

                  {/* Full Name */}
                  <div className="identity-form-group">
                    <label className="identity-form-label">
                      Full Name <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="identity-form-input"
                      placeholder="e.g. Priya Sharma, Rajesh Kumar"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      disabled={registering}
                      required
                    />
                    <span className="identity-input-help">
                      Official participant name associated with this certificate.
                    </span>
                  </div>

                  {/* Organization */}
                  <div className="identity-form-group">
                    <label className="identity-form-label">
                      Organization <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    {isBelAdmin ? (
                      <select
                        className="identity-form-select"
                        value={regOrg}
                        onChange={(e) => handleOrgChange(e.target.value)}
                        disabled={registering}
                      >
                        <option value="BEL">BEL (Bharat Electronics Limited)</option>
                        <option value="Contractor">Contractor Organization</option>
                        <option value="Auditor">Auditor Organization</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        className="identity-form-input"
                        value={regOrg}
                        disabled
                        readOnly
                      />
                    )}
                    <span className="identity-input-help">
                      {isBelAdmin
                        ? "BEL Admin can provision identities for BEL, Contractor, or Auditor organizations."
                        : isBelManager
                        ? "BEL Managers can only provision BEL internal staff."
                        : "Contractor Admins can only provision Contractor users."}
                    </span>
                  </div>

                  {/* Role */}
                  <div className="identity-form-group">
                    <label className="identity-form-label">
                      Role <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <select
                      className="identity-form-select"
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value)}
                      disabled={registering}
                    >
                      {regOrg === "BEL" ? (
                        <>
                          <option value="Employee">Employee (Asset consumer / requester)</option>
                          <option value="Manager">Manager (Asset minting & access grantor)</option>
                          {isBelAdmin && <option value="Admin">Admin (Full organizational control)</option>}
                        </>
                      ) : regOrg === "Auditor" ? (
                        <option value="Auditor">Auditor (Independent compliance & access review)</option>
                      ) : (
                        <>
                          <option value="User">User (Standard contractor participant)</option>
                          <option value="Admin">Admin (Contractor organizational administrator)</option>
                        </>
                      )}
                    </select>
                    <span className="identity-input-help">
                      Role defines functional permissions and smart contract endorsement eligibility.
                    </span>
                  </div>

                  {/* Initial Password */}
                  <div className="identity-form-group">
                    <label className="identity-form-label">
                      Initial Password <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="password"
                      className="identity-form-input"
                      placeholder="Enter a secure temporary password (min. 8 characters)"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      disabled={registering}
                      required
                    />
                    <span className="identity-input-help">
                      Used for initial application authentication. Stored securely using bcrypt hash.
                    </span>
                  </div>

                  {/* Confirm Password */}
                  <div className="identity-form-group">
                    <label className="identity-form-label">
                      Confirm Password <span style={{ color: "#ef4444" }}>*</span>
                    </label>
                    <input
                      type="password"
                      className="identity-form-input"
                      placeholder="Re-enter password to confirm"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      disabled={registering}
                      required
                    />
                  </div>

                  <div style={{ marginTop: "24px", display: "flex", gap: "12px" }}>
                    <button
                      type="submit"
                      className="access-btn-primary"
                      disabled={
                        registering ||
                        !regId.trim() ||
                        !regName.trim() ||
                        !regPassword.trim() ||
                        !regConfirmPassword.trim()
                      }
                    >
                      {registering
                        ? "Registering Identity & Account..."
                        : "Register Identity & Create Account"}
                    </button>

                    <button
                      type="button"
                      className="access-tab-btn"
                      onClick={() => setActiveTab("directory")}
                      disabled={registering}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Propose Identity Revocation Modal (Multi-Party Governance) */}
          <ConfirmModal
            isOpen={Boolean(revokeTarget)}
            title="Propose Identity Revocation (Multi-Party Governance)"
            message={
              <div>
                <p style={{ margin: "0 0 12px", color: "#e2e8f0" }}>
                  Submit a formal identity revocation proposal for{" "}
                  <strong style={{ color: "#ffffff" }}>
                    {revokeTarget?.identityId} ({revokeTarget?.name})
                  </strong>
                  .
                </p>
                <div style={{
                  padding: "10px 14px",
                  background: "#1f1315",
                  border: "1px solid #451a1d",
                  borderRadius: "8px",
                  color: "#fca5a5",
                  fontSize: "12px",
                  marginBottom: "14px"
                }}>
                  ⚖️ <strong>Multi-Party Governance Rule:</strong> Direct revocation is disabled. Per SIH security policy, revocation must be proposed by the issuing organization (BEL) and independently co-approved by an Auditor before the identity is deactivated on Hyperledger Fabric.
                </div>
                <div className="identity-form-group" style={{ marginBottom: "6px" }}>
                  <label className="identity-form-label" style={{ fontSize: "12px", marginBottom: "6px" }}>
                    Reason for Revocation <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <textarea
                    className="identity-form-input"
                    style={{
                      minHeight: "75px",
                      resize: "vertical",
                      width: "100%",
                      boxSizing: "border-box",
                      fontFamily: "inherit"
                    }}
                    placeholder="State justification (e.g. Contract termination, security clearance revocation, credential compromise)..."
                    value={revokeReason}
                    onChange={(e) => {
                      setRevokeReason(e.target.value);
                      if (revokeError) setRevokeError("");
                    }}
                    disabled={revoking}
                    required
                  />
                </div>
                {revokeError && (
                  <p style={{ color: "#ef4444", fontSize: "12px", marginTop: "10px", marginBottom: 0 }}>
                    ✕ {revokeError}
                  </p>
                )}
              </div>
            }
            confirmText={revoking ? "Submitting Proposal..." : "Submit Revocation Proposal"}
            cancelText="Cancel"
            confirmVariant="danger"
            loading={revoking}
            onConfirm={handleConfirmRevoke}
            onClose={() => {
              if (!revoking) {
                setRevokeTarget(null);
                setRevokeReason("");
                setRevokeError("");
              }
            }}
          />
        </main>
      </section>
    </div>
  );
}

export default IdentityManagement;
