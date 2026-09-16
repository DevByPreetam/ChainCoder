import { useState, useId } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import AssetStatus from "../../components/assets/AssetStatus";
import { mintAsset, uploadAssetDocument } from "../../services/assetService";

import "../../styles/layout.css";
import "../../styles/assets.css";

const ASSET_TYPES = [
  "CERTIFICATE",
  "LICENSE",
  "CONTRACT",
  "DOCUMENT",
  "SECURITY_CLEARANCE",
  "EQUIPMENT_PASS",
  "OTHER",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".txt",
  ".doc",
  ".docx",
];

function MintAsset() {
  const { user } = useAuth();
  const fileInputId = useId();

  // Role guard: BEL Admin and BEL Manager only
  const isAuthorized =
    user?.organization === "BEL" &&
    (user?.role === "Admin" || user?.role === "Manager");

  // Form state
  const [assetId, setAssetId] = useState("");
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("CERTIFICATE");
  const [customAssetType, setCustomAssetType] = useState("");
  const [owner, setOwner] = useState(user?.userId || "BEL001");
  const [documentHash, setDocumentHash] = useState("");
  const [documentCID, setDocumentCID] = useState("");

  // File upload state
  const [file, setFile] = useState(null);
  const [hashingFile, setHashingFile] = useState(false);

  // Submission & feedback state
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [successAsset, setSuccessAsset] = useState(null);
  const [uploadFeedback, setUploadFeedback] = useState(null);

  // Compute SHA-256 hash using native Web Crypto API
  async function calculateSHA256(selectedFile) {
    const buffer = await selectedFile.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function handleFileSelect(e) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Check size limit
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("File exceeds the maximum allowed size of 10 MB.");
      return;
    }

    // Check extension
    const extension = selectedFile.name
      .substring(selectedFile.name.lastIndexOf("."))
      .toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError(
        `Unsupported file type (${extension}). Allowed types: ${ALLOWED_EXTENSIONS.join(
          ", "
        )}`
      );
      return;
    }

    setError("");
    setFile(selectedFile);

    try {
      setHashingFile(true);
      const computedHash = await calculateSHA256(selectedFile);
      setDocumentHash(computedHash);

      // If documentCID is blank, set a helpful placeholder for IPFS upload
      if (!documentCID.trim()) {
        setDocumentCID("pending-ipfs-upload");
      }
    } catch (hashErr) {
      console.error("Hash calculation failed:", hashErr);
      setError("Failed to calculate SHA-256 hash for the selected file.");
    } finally {
      setHashingFile(false);
    }
  }

  function handleRemoveFile() {
    setFile(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccessAsset(null);
    setUploadFeedback(null);

    // Form validations
    const trimmedId = assetId.trim();
    const trimmedName = name.trim();
    const trimmedOwner = owner.trim();
    const selectedType =
      assetType === "OTHER" ? customAssetType.trim() : assetType;
    let trimmedHash = documentHash.trim();
    let trimmedCID = documentCID.trim();

    if (!trimmedId) {
      setError("Asset ID is required.");
      return;
    }

    if (!trimmedName) {
      setError("Asset Name is required.");
      return;
    }

    if (!selectedType) {
      setError("Please specify the Asset Type.");
      return;
    }

    if (!trimmedOwner) {
      setError("Asset Owner is required.");
      return;
    }

    if (!trimmedHash) {
      if (file) {
        setLoadingMessage("Calculating file hash...");
        try {
          trimmedHash = await calculateSHA256(file);
          setDocumentHash(trimmedHash);
        } catch {
          setError("Unable to compute SHA-256 hash for the attached file.");
          return;
        }
      } else {
        setError(
          "Document Hash is required. Enter a SHA-256 hash or attach a document file."
        );
        return;
      }
    }

    if (!trimmedCID) {
      if (file) {
        trimmedCID = "pending-ipfs-upload";
        setDocumentCID(trimmedCID);
      } else {
        setError(
          "Document IPFS CID is required (e.g. Qm... or pending-ipfs-upload)."
        );
        return;
      }
    }

    try {
      setLoading(true);
      setLoadingMessage("Endorsing transaction on Hyperledger Fabric...");

      const payload = {
        assetId: trimmedId,
        name: trimmedName,
        assetType: selectedType,
        owner: trimmedOwner,
        documentHash: trimmedHash,
        documentCID: trimmedCID,
      };

      // 1. Mint asset on Hyperledger Fabric via backend API
      const minted = await mintAsset(payload);
      setSuccessAsset(minted);

      // 2. If a file was attached, upload to IPFS and update on-chain metadata
      if (file) {
        setLoadingMessage(
          "Uploading document to IPFS & recording metadata on blockchain..."
        );
        try {
          const uploadRes = await uploadAssetDocument(trimmedId, file);
          setUploadFeedback(uploadRes);
        } catch (uploadErr) {
          console.error("IPFS Document upload error:", uploadErr);
          setError(
            `Asset ${trimmedId} was minted successfully on the blockchain, but document upload to IPFS failed: ${uploadErr.message}. You can re-upload the document from the Asset Details page.`
          );
        }
      }
    } catch (err) {
      console.error("Mint asset failed:", err);
      setError(err.message || "Failed to mint asset on the blockchain.");
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  }

  function handleReset() {
    setAssetId("");
    setName("");
    setAssetType("CERTIFICATE");
    setCustomAssetType("");
    setOwner(user?.userId || "BEL001");
    setDocumentHash("");
    setDocumentCID("");
    setFile(null);
    setError("");
    setSuccessAsset(null);
    setUploadFeedback(null);
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
          title="Mint Digital Asset Token"
          subtitle="Anchor verified defense specifications to Hyperledger Fabric with IPFS proofs"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          <div className="page-header">
            <div>
              <h2>Mint Digital Asset / Unique Token</h2>
              <p>
                Mint a unique, verifiable digital asset token (NFT) on Hyperledger
                Fabric with immutable ledger provenance and decentralized identity (DID) linkage.
              </p>
            </div>
          </div>

          {!isAuthorized ? (
            <div className="asset-error">
              <strong>Access Denied:</strong> Only BEL Admin and BEL Manager
              have permission to mint new digital assets on the blockchain.
            </div>
          ) : (
            <>
              {error && <div className="asset-error">{error}</div>}

              {loading && (
                <div className="asset-loading-banner">
                  <span>⏳</span>
                  <strong>Processing:</strong> {loadingMessage}
                </div>
              )}

              {/* Success Result Card */}
              {successAsset && (
                <div className="asset-success-container">
                  <div className="asset-success-header">
                    <div className="asset-success-icon">✓</div>
                    <div>
                      <h3 className="asset-success-title">
                        Digital Asset Token Minted Successfully
                      </h3>
                      <p className="asset-success-subtitle">
                        Recorded and committed to Hyperledger Fabric world state
                        by {user?.organization} ({user?.userId}).
                      </p>
                    </div>
                  </div>

                  <div className="asset-info-grid">
                    <div className="asset-info-item">
                      <span className="asset-info-label">NFT / Token ID</span>
                      <span className="asset-info-value" style={{ color: "#38bdf8", fontWeight: 700 }}>
                        {successAsset.tokenId || successAsset.assetId}
                      </span>
                    </div>

                    <div className="asset-info-item">
                      <span className="asset-info-label">Token Standard</span>
                      <span className="asset-info-value">
                        <span style={{
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: "#1e293b",
                          color: "#60a5fa",
                          fontSize: "12px",
                          fontWeight: 600,
                          border: "1px solid #2563eb"
                        }}>
                          {successAsset.tokenStandard || "CHAINCODER-NFT"}
                        </span>
                      </span>
                    </div>

                    <div className="asset-info-item">
                      <span className="asset-info-label">Name</span>
                      <span className="asset-info-value">
                        {successAsset.name}
                      </span>
                    </div>

                    <div className="asset-info-item">
                      <span className="asset-info-label">Asset Type</span>
                      <span className="asset-info-value">
                        {successAsset.assetType}
                      </span>
                    </div>

                    <div className="asset-info-item">
                      <span className="asset-info-label">Owner</span>
                      <span className="asset-info-value">
                        {successAsset.owner}
                      </span>
                    </div>

                    <div className="asset-info-item">
                      <span className="asset-info-label">Owner DID</span>
                      <span className="asset-info-value asset-info-mono" style={{ color: "#38bdf8", fontSize: "12px" }}>
                        {successAsset.ownerDID || (successAsset.owner && (successAsset.ownerOrganization || user?.organization) ? `did:chaincoder:${successAsset.ownerOrganization || user?.organization}:${successAsset.owner}` : "—")}
                      </span>
                    </div>

                    <div className="asset-info-item">
                      <span className="asset-info-label">Issuer Org</span>
                      <span className="asset-info-value">
                        {successAsset.ownerOrganization || user?.organization}
                      </span>
                    </div>

                    <div className="asset-info-item">
                      <span className="asset-info-label">Status</span>
                      <span className="asset-info-value">
                        <AssetStatus
                          status={successAsset.status || "ACTIVE"}
                        />
                      </span>
                    </div>

                    <div className="asset-info-item asset-info-wide">
                      <span className="asset-info-label">SHA-256 Hash</span>
                      <span className="asset-info-value asset-info-mono">
                        {uploadFeedback?.file?.hash ||
                          successAsset.documentHash}
                      </span>
                    </div>

                    <div className="asset-info-item asset-info-wide">
                      <span className="asset-info-label">IPFS CID</span>
                      <span className="asset-info-value asset-info-mono">
                        {uploadFeedback?.file?.cid ||
                          successAsset.documentCID}
                      </span>
                    </div>

                    {uploadFeedback?.file && (
                      <div className="asset-info-item asset-info-wide">
                        <span className="asset-info-label">
                          IPFS Upload Details
                        </span>
                        <span className="asset-info-value">
                          File pinned successfully ·{" "}
                          {(uploadFeedback.file.size / 1024).toFixed(1)} KB ·{" "}
                          {uploadFeedback.file.mimeType}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="asset-actions" style={{ marginTop: "20px" }}>
                    <Link
                      to={`/assets/${encodeURIComponent(
                        successAsset.assetId
                      )}`}
                      className="asset-search-button"
                      style={{ textDecoration: "none", display: "inline-block" }}
                    >
                      View Asset Details →
                    </Link>

                    <button
                      type="button"
                      className="asset-action-button"
                      onClick={handleReset}
                    >
                      Mint Another Asset
                    </button>

                    <Link
                      to="/assets"
                      className="asset-action-button"
                      style={{ textDecoration: "none", display: "inline-block" }}
                    >
                      Back to My Assets
                    </Link>
                  </div>
                </div>
              )}

              {/* Mint Form */}
              {!successAsset && (
                <form onSubmit={handleSubmit} className="asset-form-card">
                  <div className="asset-form-grid">
                    {/* Asset ID */}
                    <div className="asset-form-group">
                      <label className="asset-form-label">
                        Asset ID <span className="asset-form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="asset-form-input"
                        placeholder="e.g. AST-0001 or AST-BEL-101"
                        value={assetId}
                        onChange={(e) => setAssetId(e.target.value)}
                        disabled={loading}
                        required
                      />
                      <span className="asset-form-help">
                        Unique identifier registered on Hyperledger Fabric
                      </span>
                    </div>

                    {/* Asset Name */}
                    <div className="asset-form-group">
                      <label className="asset-form-label">
                        Asset Name <span className="asset-form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="asset-form-input"
                        placeholder="e.g. Bharat Electronics Radio Clearance"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={loading}
                        required
                      />
                      <span className="asset-form-help">
                        Human-readable title for the digital credential or asset
                      </span>
                    </div>

                    {/* Asset Type */}
                    <div className="asset-form-group">
                      <label className="asset-form-label">
                        Asset Type <span className="asset-form-required">*</span>
                      </label>
                      <select
                        className="asset-form-select"
                        value={assetType}
                        onChange={(e) => setAssetType(e.target.value)}
                        disabled={loading}
                      >
                        {ASSET_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                      {assetType === "OTHER" && (
                        <input
                          type="text"
                          className="asset-form-input"
                          style={{ marginTop: "8px" }}
                          placeholder="Specify custom asset type"
                          value={customAssetType}
                          onChange={(e) => setCustomAssetType(e.target.value)}
                          disabled={loading}
                          required
                        />
                      )}
                    </div>

                    {/* Owner */}
                    <div className="asset-form-group">
                      <label className="asset-form-label">
                        Asset Owner <span className="asset-form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="asset-form-input"
                        placeholder="e.g. BEL001, CON001"
                        value={owner}
                        onChange={(e) => setOwner(e.target.value)}
                        disabled={loading}
                        required
                      />
                      <span className="asset-form-help">
                        User ID / Identity ID receiving initial ownership
                      </span>
                    </div>

                    {/* Optional File Upload Box */}
                    <div className="asset-form-group asset-form-group-full">
                      <label className="asset-form-label">
                        Attach Document (Optional IPFS Upload)
                      </label>
                      <div className="asset-file-upload-box">
                        <input
                          id={fileInputId}
                          type="file"
                          className="asset-file-input"
                          accept=".pdf,.png,.jpg,.jpeg,.txt,.doc,.docx"
                          onChange={handleFileSelect}
                          disabled={loading || hashingFile}
                        />
                        <label
                          htmlFor={fileInputId}
                          className="asset-file-label"
                        >
                          {file ? "Replace Document" : "Choose Document File"}
                        </label>

                        {hashingFile && (
                          <span className="asset-form-help">
                            Calculating SHA-256 checksum...
                          </span>
                        )}

                        {file && !hashingFile && (
                          <div className="asset-file-info">
                            <span>
                              📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
                            </span>
                            <button
                              type="button"
                              className="asset-file-remove"
                              onClick={handleRemoveFile}
                            >
                              Remove
                            </button>
                          </div>
                        )}

                        <span className="asset-form-help">
                          Supported formats: PDF, PNG, JPG, TXT, DOCX (Max 10 MB).
                          Selecting a file auto-generates the SHA-256 hash.
                        </span>
                      </div>
                    </div>

                    {/* Document SHA-256 Hash */}
                    <div className="asset-form-group">
                      <label className="asset-form-label">
                        Document SHA-256 Hash{" "}
                        <span className="asset-form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="asset-form-input"
                        placeholder="64-character hex SHA-256 hash"
                        value={documentHash}
                        onChange={(e) => setDocumentHash(e.target.value)}
                        disabled={loading}
                        required
                      />
                      <span className="asset-form-help">
                        Tamper-evident digest stored on the Fabric ledger
                      </span>
                    </div>

                    {/* Document CID */}
                    <div className="asset-form-group">
                      <label className="asset-form-label">
                        Document IPFS CID{" "}
                        <span className="asset-form-required">*</span>
                      </label>
                      <input
                        type="text"
                        className="asset-form-input"
                        placeholder="e.g. QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"
                        value={documentCID}
                        onChange={(e) => setDocumentCID(e.target.value)}
                        disabled={loading}
                        required
                      />
                      <span className="asset-form-help">
                        IPFS Content Identifier where the encrypted file is stored
                      </span>
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="asset-form-actions">
                    <button
                      type="submit"
                      className="asset-form-submit"
                      disabled={loading || hashingFile}
                    >
                      {loading ? "Minting on Blockchain..." : "Mint Asset"}
                    </button>

                    <button
                      type="button"
                      className="asset-form-reset"
                      onClick={handleReset}
                      disabled={loading}
                    >
                      Reset Form
                    </button>

                    <Link
                      to="/assets"
                      className="asset-card-button"
                      style={{ marginTop: 0, padding: "12px 18px" }}
                    >
                      Cancel
                    </Link>
                  </div>
                </form>
              )}
            </>
          )}
        </main>
      </section>
    </div>
  );
}

export default MintAsset;
