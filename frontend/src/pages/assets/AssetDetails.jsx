import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import AssetStatus from "../../components/assets/AssetStatus";
import AssetHistory from "../../components/assets/AssetHistory";
import {
  getAsset,
  verifyAssetDocument,
  downloadAssetDocument,
  uploadAssetDocument,
  transferAsset,
  proposeDeleteAsset,
} from "../../services/assetService";
import { getIdentity } from "../../services/identityService";

import "../../styles/layout.css";
import "../../styles/assets.css";

function AssetDetails() {
  const { assetId } = useParams();
  const { user } = useAuth();

  const [asset, setAsset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Verification state
  const [verification, setVerification] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  // Document upload / update state
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [docFile, setDocFile] = useState(null);
  const [docHash, setDocHash] = useState("");
  const [calculatingDocHash, setCalculatingDocHash] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadDocError, setUploadDocError] = useState("");
  const [uploadDocSuccess, setUploadDocSuccess] = useState("");

  // Transfer state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [newOwnerInput, setNewOwnerInput] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");
  const [copiedDid, setCopiedDid] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Deletion proposal state (requires Auditor co-approval)
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState("");

  // Key to force reload history after transfer
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    async function loadAsset() {
      try {
        setLoading(true);
        setError("");
        const data = await getAsset(assetId);

        // Enrich with real owner organization if missing
        if (data && !data.ownerOrganization && data.owner) {
          try {
            const ownerIdent = await getIdentity(data.owner);
            if (ownerIdent?.organization) {
              data.ownerOrganization = ownerIdent.organization;
              if (ownerIdent.did) data.ownerDID = ownerIdent.did;
            }
          } catch {
            if (data.owner.startsWith("BEL")) data.ownerOrganization = "BEL";
            else if (data.owner.startsWith("CON")) data.ownerOrganization = "Contractor";
            else if (data.owner.startsWith("AUD")) data.ownerOrganization = "Auditor";
          }
        }

        if (data && !data.ownerDID && data.owner && data.ownerOrganization) {
          data.ownerDID = `did:chaincoder:${data.ownerOrganization}:${data.owner}`;
        }

        setAsset(data);
      } catch (err) {
        setError(err.message || "Unable to load asset");
      } finally {
        setLoading(false);
      }
    }

    if (assetId) {
      loadAsset();
    }
  }, [assetId, historyKey]);

  async function handleVerify() {
    try {
      setVerifying(true);
      setVerifyError("");
      setVerification(null);
      const result = await verifyAssetDocument(assetId);
      setVerification(result);
    } catch (err) {
      setVerifyError(err.message || "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  async function handleDownload() {
    try {
      setDownloading(true);
      setDownloadError("");
      await downloadAssetDocument(assetId);
    } catch (err) {
      setDownloadError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDocFileSelect(e) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    if (selectedFile.size > 10 * 1024 * 1024) {
      setUploadDocError("File exceeds the maximum allowed size of 10 MB.");
      return;
    }
    setUploadDocError("");
    setDocFile(selectedFile);
    try {
      setCalculatingDocHash(true);
      const buffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      setDocHash(hashHex);
    } catch {
      setUploadDocError("Unable to compute SHA-256 hash for selected file.");
    } finally {
      setCalculatingDocHash(false);
    }
  }

  async function handleUploadDocSubmit(e) {
    e.preventDefault();
    if (!docFile) {
      setUploadDocError("Please select a document file.");
      return;
    }
    try {
      setUploadingDoc(true);
      setUploadDocError("");
      setUploadDocSuccess("");
      await uploadAssetDocument(assetId, docFile);
      setUploadDocSuccess("Document successfully uploaded, pinned to IPFS, and recorded on Fabric ledger!");
      setHistoryKey((prev) => prev + 1);
      setTimeout(() => {
        setShowUploadDocModal(false);
        setUploadDocSuccess("");
        setDocFile(null);
        setDocHash("");
      }, 1500);
    } catch (err) {
      console.error("Document upload failed:", err);
      setUploadDocError(err.message || "Failed to upload document");
    } finally {
      setUploadingDoc(false);
    }
  }

  async function handleTransferSubmit(e) {
    e.preventDefault();
    const target = newOwnerInput.trim();
    if (!target) {
      setTransferError("New owner identity ID is required.");
      return;
    }

    try {
      setTransferring(true);
      setTransferError("");
      setTransferSuccess("");

      const updated = await transferAsset(assetId, target);
      setAsset(updated);
      setTransferSuccess(`Ownership successfully transferred to ${target}!`);
      setShowTransferModal(false);
      setNewOwnerInput("");
      setHistoryKey((prev) => prev + 1);
    } catch (err) {
      setTransferError(err.message || "Transfer failed");
    } finally {
      setTransferring(false);
    }
  }

  async function handleDeleteSubmit(e) {
    e.preventDefault();
    const reason = deleteReason.trim();
    if (!reason) {
      setDeleteError("A reason for asset deletion is mandatory.");
      return;
    }

    try {
      setDeleting(true);
      setDeleteError("");
      setDeleteSuccess("");

      const res = await proposeDeleteAsset(assetId, reason);
      setShowDeleteModal(false);
      setDeleteReason("");
      setDeleteSuccess(
        `Asset deletion proposal submitted for Auditor co-approval (Proposal ID: ${res.proposalId || 'Pending'})! Asset will be decommissioned once co-approved.`
      );

      // Refresh asset details
      try {
        const updated = await getAsset(assetId);
        setAsset(updated);
      } catch {
        // Fallback local update
        setAsset(prev => prev ? ({ ...prev, hasPendingDeletion: true, pendingDeletionProposal: res }) : prev);
      }
    } catch (err) {
      setDeleteError(err.message || "Failed to submit deletion proposal");
    } finally {
      setDeleting(false);
    }
  }

  const handleCopyDid = (did) => {
    if (!did) return;
    navigator.clipboard?.writeText(did);
    setCopiedDid(true);
    setTimeout(() => setCopiedDid(false), 2000);
  };

  function formatDate(dateString) {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  }

  // Authorization check for transfer
  const canTransfer =
    asset?.status === "ACTIVE" &&
    !asset?.hasPendingDeletion &&
    ((user?.organization === "BEL" && user?.role === "Admin" && asset?.ownerOrganization === "BEL") ||
     (user?.organization === "Contractor" && (user?.role === "Admin" || user?.role === "User") && asset?.ownerOrganization === "Contractor"));

  // Authorization check for proposing deletion (BEL Admin or Manager)
  const canProposeDelete =
    (user?.organization === "BEL" && (user?.role === "Admin" || user?.role === "Manager")) &&
    asset?.status !== "DELETED" &&
    !asset?.hasPendingDeletion;

  // Authorization check for uploading / updating document (BEL Admin/Manager or Asset Owner)
  const canUploadDocument =
    asset?.status === "ACTIVE" &&
    !asset?.hasPendingDeletion &&
    ((user?.organization === "BEL" && (user?.role === "Admin" || user?.role === "Manager")) ||
     (user?.organization === asset?.ownerOrganization && user?.userId === asset?.owner));

  const tokenId = asset?.tokenId || asset?.assetId;
  const tokenStandard = asset?.tokenStandard || "CHAINCODER-NFT";
  const ownerDID = asset?.ownerDID || (asset?.owner && asset?.ownerOrganization ? `did:chaincoder:${asset.ownerOrganization}:${asset.owner}` : null);

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Digital Asset Specifications"
          subtitle={`Inspect token metadata and IPFS document provenance for ${tokenId || "Asset"}`}
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          <div className="asset-details-back">
            <Link to="/assets" className="asset-back-link">
              ← Back to My Assets
            </Link>
          </div>

          {loading && (
            <div className="asset-message">Loading asset details…</div>
          )}

          {error && <div className="asset-error">{error}</div>}

          {!loading && !error && asset && (
            <>
              {/* Asset Header */}
              <div className="asset-details-header">
                <div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                    <h2 style={{ margin: 0 }}>{tokenId}</h2>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: "#1e293b",
                      color: "#60a5fa",
                      fontSize: "12px",
                      fontWeight: 600,
                      border: "1px solid #2563eb"
                    }}>
                      {tokenStandard}
                    </span>
                  </div>
                  <p>{asset.name || "Tokenized Digital Asset"}</p>
                </div>
                <AssetStatus status={asset.status} />
              </div>

              {transferSuccess && (
                <div className="asset-success-container" style={{ marginBottom: "18px", padding: "14px" }}>
                  <strong>✓ Success:</strong> {transferSuccess}
                </div>
              )}

              {deleteSuccess && (
                <div className="asset-success-container" style={{ marginBottom: "18px", padding: "14px" }}>
                  <strong>✓ Deletion Proposal:</strong> {deleteSuccess}
                </div>
              )}

              {/* Status Banner: Pending Auditor Co-Approval */}
              {asset?.hasPendingDeletion && (
                <div style={{
                  background: "rgba(146, 64, 14, 0.25)",
                  border: "1px solid #d97706",
                  borderRadius: "8px",
                  padding: "14px 18px",
                  marginBottom: "18px",
                  color: "#fde68a"
                }}>
                  <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>⏳</span> Deletion Proposal Awaiting Auditor Co-Approval
                  </div>
                  <div style={{ fontSize: "13px", color: "#fef3c7" }}>
                    A decommissioning proposal for this asset was submitted by{" "}
                    <strong>{asset.pendingDeletionProposal?.proposedByName || asset.pendingDeletionProposal?.proposedBy || "BEL Admin"}</strong>.
                    {asset.pendingDeletionProposal?.reason && (
                      <span> Reason: <em>"{asset.pendingDeletionProposal.reason}"</em>.</span>
                    )}{" "}
                    Per defense consortium rules, the asset remains active until co-signed or rejected by the Independent Auditor.
                  </div>
                </div>
              )}

              {/* Status Banner: Asset Decommissioned/Deleted */}
              {asset?.status === "DELETED" && (
                <div style={{
                  background: "rgba(127, 29, 29, 0.25)",
                  border: "1px solid #ef4444",
                  borderRadius: "8px",
                  padding: "14px 18px",
                  marginBottom: "18px",
                  color: "#fca5a5"
                }}>
                  <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>✕</span> Asset Officially Decommissioned & Deleted
                  </div>
                  <div style={{ fontSize: "13px", color: "#fecaca" }}>
                    This asset was co-approved for deletion by the Independent Auditor.
                    All token transactions, document revisions, and contractor access permissions have been locked.
                  </div>
                </div>
              )}

              {/* NFT / Token Specification Section */}
              <div className="asset-section" style={{ border: "1px solid #1e3a5f", background: "#0a1120" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <h3 className="asset-section-title" style={{ margin: 0, color: "#93c5fd" }}>
                    🪙 NFT / Blockchain Token Specification
                  </h3>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <Link
                      to={`/verify?assetId=${encodeURIComponent(asset.assetId)}`}
                      className="asset-card-button"
                      style={{ marginTop: 0, padding: "6px 12px", fontSize: "12px", background: "#1e293b", borderColor: "#3b82f6" }}
                    >
                      🔍 Verify Token Publicly
                    </Link>
                    {asset?.status !== "DELETED" && !asset?.hasPendingDeletion && (user?.role === "Employee" || user?.organization === "Contractor" || user?.userId !== asset.owner) && (
                      <Link
                        to={`/access/requests?assetId=${encodeURIComponent(asset.assetId)}`}
                        className="asset-action-button"
                        style={{ marginTop: 0, padding: "6px 12px", fontSize: "12px", background: "#7c3aed", borderColor: "#8b5cf6", color: "#ffffff", textDecoration: "none" }}
                      >
                        📩 Request Access
                      </Link>
                    )}
                    {canTransfer && (
                      <button
                        type="button"
                        className="asset-action-button"
                        style={{ background: "#2563eb", borderColor: "#3b82f6", color: "#ffffff" }}
                        onClick={() => {
                          setTransferError("");
                          setShowTransferModal(true);
                        }}
                      >
                        🔄 Transfer Ownership
                      </button>
                    )}
                    {canProposeDelete && (
                      <button
                        type="button"
                        className="asset-action-button"
                        style={{ background: "#7f1d1d", borderColor: "#ef4444", color: "#fca5a5" }}
                        onClick={() => {
                          setDeleteError("");
                          setShowDeleteModal(true);
                        }}
                      >
                        🗑️ Delete Asset
                      </button>
                    )}
                    {asset?.hasPendingDeletion && (
                      <span style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        background: "#382405",
                        color: "#fbbf24",
                        border: "1px solid #92400e",
                        fontSize: "11px",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        ⏳ Deletion Pending Auditor
                      </span>
                    )}
                  </div>
                </div>

                <div className="asset-info-grid">
                  <div className="asset-info-item">
                    <span className="asset-info-label">Token ID</span>
                    <span className="asset-info-value" style={{ color: "#38bdf8", fontWeight: 700 }}>
                      {tokenId}
                    </span>
                  </div>

                  <div className="asset-info-item">
                    <span className="asset-info-label">Token Standard</span>
                    <span className="asset-info-value">
                      {tokenStandard}
                    </span>
                  </div>

                  <div className="asset-info-item">
                    <span className="asset-info-label">Current Owner</span>
                    <span className="asset-info-value">{asset.owner || "—"}</span>
                  </div>

                  <div className="asset-info-item">
                    <span className="asset-info-label">Owner Organization</span>
                    <span className="asset-info-value">{asset.ownerOrganization || "—"}</span>
                  </div>

                  {ownerDID && (
                    <div className="asset-info-item asset-info-wide">
                      <span className="asset-info-label">Owner Decentralized Identifier (DID)</span>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                        <span className="asset-info-value asset-info-mono" style={{ color: "#38bdf8" }}>
                          {ownerDID}
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="asset-action-button"
                            style={{ padding: "3px 8px", fontSize: "11px" }}
                            onClick={() => handleCopyDid(ownerDID)}
                          >
                            {copiedDid ? "✓ Copied" : "Copy DID"}
                          </button>
                          <Link
                            to={`/verify-identity?did=${encodeURIComponent(ownerDID)}`}
                            className="asset-action-button"
                            style={{ padding: "3px 8px", fontSize: "11px", textDecoration: "none" }}
                          >
                            Verify DID →
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Asset Information */}
              <div className="asset-section">
                <h3 className="asset-section-title">Asset Metadata</h3>
                <div className="asset-info-grid">
                  <div className="asset-info-item">
                    <span className="asset-info-label">Asset ID</span>
                    <span className="asset-info-value">{asset.assetId}</span>
                  </div>
                  <div className="asset-info-item">
                    <span className="asset-info-label">Name</span>
                    <span className="asset-info-value">
                      {asset.name || "—"}
                    </span>
                  </div>
                  <div className="asset-info-item">
                    <span className="asset-info-label">Type</span>
                    <span className="asset-info-value">
                      {asset.assetType || "—"}
                    </span>
                  </div>
                  <div className="asset-info-item">
                    <span className="asset-info-label">Status</span>
                    <span className="asset-info-value">
                      {asset.status || "—"}
                    </span>
                  </div>
                  <div className="asset-info-item">
                    <span className="asset-info-label">Created At</span>
                    <span className="asset-info-value">
                      {formatDate(asset.createdAt)}
                    </span>
                  </div>
                  <div className="asset-info-item">
                    <span className="asset-info-label">Updated At</span>
                    <span className="asset-info-value">
                      {formatDate(asset.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Document Section */}
              <div className="asset-section">
                <h3 className="asset-section-title">Cryptographic Document Provenance</h3>
                <div className="asset-info-grid">
                  <div className="asset-info-item asset-info-wide">
                    <span className="asset-info-label">SHA-256 Checksum</span>
                    <span
                      className="asset-info-value asset-info-mono"
                      title={asset.documentHash || ""}
                    >
                      {asset.documentHash || "No document hash registered"}
                    </span>
                  </div>
                  <div className="asset-info-item asset-info-wide">
                    <span className="asset-info-label">IPFS Content Identifier (CID)</span>
                    <span
                      className="asset-info-value asset-info-mono"
                      title={asset.documentCID || ""}
                    >
                      {asset.documentCID || "No IPFS CID registered"}
                    </span>
                  </div>
                </div>

                {asset.documentCID === "pending-ipfs-upload" && (
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    background: "rgba(245, 158, 11, 0.15)",
                    border: "1px solid #f59e0b",
                    color: "#fde68a",
                    fontSize: "12px",
                    marginTop: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "8px"
                  }}>
                    <span>⚠️ Document IPFS upload is pending for this asset.</span>
                    {canUploadDocument && (
                      <button
                        type="button"
                        className="asset-action-button"
                        style={{ padding: "4px 10px", fontSize: "11px", background: "#059669", color: "#fff", borderColor: "#10b981" }}
                        onClick={() => {
                          setUploadDocError("");
                          setUploadDocSuccess("");
                          setDocFile(null);
                          setDocHash("");
                          setShowUploadDocModal(true);
                        }}
                      >
                        Upload Document Now ➔
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Verification Section */}
              <div className="asset-section">
                <h3 className="asset-section-title">Cryptographic Integrity Verification</h3>

                {verification && (
                  <div
                    className={`asset-verify-result ${
                      verification.verified
                        ? "asset-verify-success"
                        : "asset-verify-fail"
                    }`}
                  >
                    <div className="asset-verify-status">
                      {verification.verified
                        ? "✓ Document Integrity Verified: IPFS Content Matches Blockchain Hash"
                        : "✗ Verification Failed: Hash Mismatch or Content Altered"}
                    </div>
                    <div className="asset-verify-details">
                      <div className="asset-info-item asset-info-wide">
                        <span className="asset-info-label">
                          Calculated IPFS Hash (SHA-256)
                        </span>
                        <span className="asset-info-value asset-info-mono">
                          {verification.calculatedHash || "—"}
                        </span>
                      </div>
                      <div className="asset-info-item asset-info-wide">
                        <span className="asset-info-label">
                          Fabric Ledger Registered Hash
                        </span>
                        <span className="asset-info-value asset-info-mono">
                          {verification.blockchainHash || "—"}
                        </span>
                      </div>
                      <div className="asset-info-item asset-info-wide">
                        <span className="asset-info-label">
                          IPFS Content Identifier (CID)
                        </span>
                        <span className="asset-info-value asset-info-mono" style={{ color: "#38bdf8" }}>
                          {verification.cid || asset.documentCID || "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {verifyError && (
                  <div className="asset-error">{verifyError}</div>
                )}

                {downloadError && (
                  <div className="asset-error">{downloadError}</div>
                )}

                <div className="asset-actions">
                  <button
                    className="asset-action-button"
                    onClick={handleVerify}
                    disabled={
                      verifying || !asset.documentCID || !asset.documentHash
                    }
                  >
                    {verifying ? "Verifying On Chain…" : "Verify Document Integrity"}
                  </button>
                  <button
                    className="asset-action-button"
                    onClick={handleDownload}
                    disabled={downloading || !asset.documentCID}
                  >
                    {downloading ? "Downloading from IPFS…" : "Download Document"}
                  </button>
                  {canUploadDocument && (
                    <button
                      type="button"
                      className="asset-action-button"
                      style={{ background: "#065f46", borderColor: "#059669", color: "#6ee7b7" }}
                      onClick={() => {
                        setUploadDocError("");
                        setUploadDocSuccess("");
                        setDocFile(null);
                        setDocHash("");
                        setShowUploadDocModal(true);
                      }}
                    >
                      📄 {asset.documentCID && !asset.documentCID.includes("pending") ? "Replace Document" : "Upload Document"}
                    </button>
                  )}
                </div>
              </div>

              {/* Blockchain History / Provenance */}
              <div className="asset-section">
                <h3 className="asset-section-title">Immutable Provenance & Ownership History</h3>
                <AssetHistory assetId={assetId} key={historyKey} />
              </div>
            </>
          )}

          {/* Upload / Replace Document Modal */}
          {showUploadDocModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "20px",
              }}
              onClick={() => setShowUploadDocModal(false)}
            >
              <div
                style={{
                  background: "#0f172a",
                  border: "1px solid #059669",
                  borderRadius: "12px",
                  width: "100%",
                  maxWidth: "520px",
                  padding: "24px",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "24px" }}>📄</span>
                  <h3 style={{ margin: 0, color: "#6ee7b7", fontSize: "18px" }}>
                    {asset?.documentCID && !asset.documentCID.includes("pending") ? "Replace Asset Document" : "Attach Asset Document"}
                  </h3>
                </div>

                <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "13px", lineHeight: "1.5" }}>
                  Upload a certified document for asset <strong>{tokenId}</strong> ("{asset?.name}").
                  The file will be pinned to the IPFS daemon and its SHA-256 cryptographic checksum will be recorded on the Hyperledger Fabric ledger via smart contract <code>updateAssetDocument</code>.
                </p>

                {uploadDocError && (
                  <div className="asset-error" style={{ marginBottom: "14px" }}>
                    ⚠️ {uploadDocError}
                  </div>
                )}

                {uploadDocSuccess && (
                  <div style={{
                    padding: "12px",
                    borderRadius: "6px",
                    background: "rgba(16, 185, 129, 0.15)",
                    border: "1px solid #10b981",
                    color: "#34d399",
                    fontSize: "13px",
                    marginBottom: "14px",
                    fontWeight: 600
                  }}>
                    ✓ {uploadDocSuccess}
                  </div>
                )}

                <form onSubmit={handleUploadDocSubmit}>
                  <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 600 }}>
                      Select Document File *
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx"
                      onChange={handleDocFileSelect}
                      disabled={uploadingDoc}
                      required
                      style={{
                        width: "100%",
                        padding: "8px",
                        borderRadius: "6px",
                        background: "#020617",
                        border: "1px solid #334155",
                        color: "#cbd5e1",
                        fontSize: "13px"
                      }}
                    />
                    <span style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "block" }}>
                      Allowed formats: PDF, DOCX, DOC, TXT, PNG, JPG (Max 10 MB).
                    </span>
                  </div>

                  {calculatingDocHash && (
                    <div style={{ fontSize: "12px", color: "#38bdf8", marginBottom: "14px" }}>
                      ⚙️ Computing SHA-256 hash...
                    </div>
                  )}

                  {docHash && (
                    <div style={{ marginBottom: "16px", background: "#020617", padding: "10px", borderRadius: "6px", border: "1px solid #1e293b" }}>
                      <span style={{ fontSize: "11px", color: "#94a3b8", display: "block", marginBottom: "2px" }}>
                        Computed SHA-256 Hash
                      </span>
                      <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#34d399", wordBreak: "break-all" }}>
                        {docHash}
                      </span>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={() => setShowUploadDocModal(false)}
                      disabled={uploadingDoc}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="asset-form-submit"
                      style={{ margin: 0, padding: "10px 18px", fontSize: "13px", background: "#059669", borderColor: "#10b981" }}
                      disabled={uploadingDoc || !docFile || calculatingDocHash}
                    >
                      {uploadingDoc ? "Uploading to IPFS & Fabric…" : "Upload to IPFS & Fabric"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Transfer Ownership Modal */}
          {showTransferModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "20px",
              }}
              onClick={() => setShowTransferModal(false)}
            >
              <div
                style={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: "12px",
                  width: "100%",
                  maxWidth: "500px",
                  padding: "24px",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ margin: "0 0 8px", color: "#f8fafc", fontSize: "18px" }}>
                  Transfer NFT Ownership
                </h3>
                <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "13px" }}>
                  Transfer unique token <strong>{tokenId}</strong> to another registered identity.
                  This action executes smart contract method <code>TransferAsset</code> on Hyperledger Fabric.
                </p>

                {transferError && (
                  <div className="asset-error" style={{ marginBottom: "14px" }}>
                    ⚠️ {transferError}
                  </div>
                )}

                <form onSubmit={handleTransferSubmit}>
                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 600 }}>
                      Current Owner
                    </label>
                    <div style={{ background: "#020617", padding: "10px", borderRadius: "6px", border: "1px solid #1e293b", fontSize: "13px", color: "#94a3b8", fontFamily: "monospace" }}>
                      {asset?.owner} ({ownerDID || "DID N/A"})
                    </div>
                  </div>

                  <div style={{ marginBottom: "18px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 600 }}>
                      New Owner Identity ID *
                    </label>
                    <input
                      type="text"
                      className="asset-search-input"
                      style={{ width: "100%", boxSizing: "border-box" }}
                      placeholder="e.g. CON001, CON002, BEL002"
                      value={newOwnerInput}
                      onChange={(e) => setNewOwnerInput(e.target.value)}
                      disabled={transferring}
                      required
                    />
                    <span style={{ fontSize: "11px", color: "#64748b", marginTop: "4px", display: "block" }}>
                      Must be an active identity registered on Hyperledger Fabric.
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={() => setShowTransferModal(false)}
                      disabled={transferring}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="asset-form-submit"
                      style={{ margin: 0, padding: "10px 18px", fontSize: "13px" }}
                      disabled={transferring || !newOwnerInput.trim()}
                    >
                      {transferring ? "Committing Transfer…" : "Confirm Transfer"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete Proposal Modal (Multi-Party Governance) */}
          {showDeleteModal && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "20px",
              }}
              onClick={() => setShowDeleteModal(false)}
            >
              <div
                style={{
                  background: "#0f172a",
                  border: "1px solid #7f1d1d",
                  borderRadius: "12px",
                  width: "100%",
                  maxWidth: "520px",
                  padding: "24px",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.8)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <span style={{ fontSize: "24px" }}>🗑️</span>
                  <h3 style={{ margin: 0, color: "#f87171", fontSize: "18px" }}>
                    Propose Asset Decommissioning / Deletion
                  </h3>
                </div>

                <p style={{ margin: "0 0 14px", color: "#cbd5e1", fontSize: "13px", lineHeight: "1.5" }}>
                  You are proposing to decommission defense asset <strong>{tokenId}</strong> ("{asset?.name}").
                </p>

                <div style={{
                  background: "#1e1b2e",
                  border: "1px solid #4338ca",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: "#c7d2fe"
                }}>
                  🛡️ <strong>Consortium Governance Rule:</strong> BEL Administrators cannot unilaterally delete assets from the ledger.
                  Submitting this form creates a proposal that must be <strong>Co-Approved by an Independent Auditor</strong> before the asset is decommissioned.
                </div>

                {deleteError && (
                  <div className="asset-error" style={{ marginBottom: "14px" }}>
                    ⚠️ {deleteError}
                  </div>
                )}

                <form onSubmit={handleDeleteSubmit}>
                  <div style={{ marginBottom: "18px" }}>
                    <label style={{ display: "block", fontSize: "12px", color: "#cbd5e1", marginBottom: "6px", fontWeight: 600 }}>
                      Mandatory Deletion Reason *
                    </label>
                    <textarea
                      className="asset-search-input"
                      style={{ width: "100%", height: "80px", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }}
                      placeholder="e.g. Asset decommissioned, classified document lifecycle expired, or superseded by next revision..."
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      disabled={deleting}
                      required
                    />
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={() => setShowDeleteModal(false)}
                      disabled={deleting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="asset-form-submit"
                      style={{ margin: 0, padding: "10px 18px", fontSize: "13px", background: "#dc2626", borderColor: "#ef4444" }}
                      disabled={deleting || !deleteReason.trim()}
                    >
                      {deleting ? "Submitting to Auditor…" : "Submit for Auditor Co-Approval"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

export default AssetDetails;
