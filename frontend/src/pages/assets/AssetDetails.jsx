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
  transferAsset,
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

  // Transfer state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [newOwnerInput, setNewOwnerInput] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferSuccess, setTransferSuccess] = useState("");
  const [copiedDid, setCopiedDid] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    ((user?.organization === "BEL" && user?.role === "Admin" && asset?.ownerOrganization === "BEL") ||
     (user?.organization === "Contractor" && (user?.role === "Admin" || user?.role === "User") && asset?.ownerOrganization === "Contractor"));

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

              {/* NFT / Token Specification Section */}
              <div className="asset-section" style={{ border: "1px solid #1e3a5f", background: "#0a1120" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                  <h3 className="asset-section-title" style={{ margin: 0, color: "#93c5fd" }}>
                    🪙 NFT / Blockchain Token Specification
                  </h3>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <Link
                      to={`/verify?assetId=${encodeURIComponent(asset.assetId)}`}
                      className="asset-card-button"
                      style={{ marginTop: 0, padding: "6px 12px", fontSize: "12px", background: "#1e293b", borderColor: "#3b82f6" }}
                    >
                      🔍 Verify Token Publicly
                    </Link>
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
                        ? "✓ Document Integrity Verified: IPFS Matches Blockchain"
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
                </div>
              </div>

              {/* Blockchain History / Provenance */}
              <div className="asset-section">
                <h3 className="asset-section-title">Immutable Provenance & Ownership History</h3>
                <AssetHistory assetId={assetId} key={historyKey} />
              </div>
            </>
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
        </main>
      </section>
    </div>
  );
}

export default AssetDetails;
