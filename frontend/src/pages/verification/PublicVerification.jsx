import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { verifyAsset } from "../../services/verificationService";
import AssetStatus from "../../components/assets/AssetStatus";

import "../../styles/public-verification.css";

function PublicVerification() {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [assetIdInput, setAssetIdInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const initialSearchHandled = useRef(false);

  const executeVerification = async (targetId) => {
    const trimmed = (targetId || "").trim();

    if (!trimmed) {
      setValidationError("Asset ID is required.");
      return;
    }

    if (
      trimmed.includes("..") ||
      trimmed.includes("/") ||
      trimmed.includes("\\") ||
      trimmed.includes("\0")
    ) {
      setValidationError("Asset ID contains invalid path characters.");
      return;
    }

    setValidationError(null);
    setLoading(true);
    setError(null);
    setResult(null);
    setHasSearched(true);

    try {
      const data = await verifyAsset(trimmed);
      setResult(data);
    } catch (err) {
      setError({
        message: err.message,
        statusCode: err.statusCode || (err.message?.includes("not found") ? 404 : 500),
        errorCode: err.errorCode || "VERIFICATION_ERROR",
      });
    } finally {
      setLoading(false);
    }
  };

  // Support shareable URL query param /verify?assetId=AST-001 on mount
  useEffect(() => {
    const queryAssetId = searchParams.get("assetId");
    if (queryAssetId && !initialSearchHandled.current) {
      initialSearchHandled.current = true;
      setAssetIdInput(queryAssetId);
      executeVerification(queryAssetId);
    }
  }, [searchParams]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = assetIdInput.trim();
    if (trimmed) {
      setSearchParams({ assetId: trimmed });
    } else {
      setSearchParams({});
    }
    executeVerification(trimmed);
  };

  const handleReset = () => {
    setAssetIdInput("");
    setResult(null);
    setError(null);
    setValidationError(null);
    setHasSearched(false);
    setSearchParams({});
  };

  const handleCopy = (key, text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const formatDate = (isoString) => {
    if (!isoString) return "N/A";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return String(isoString);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(isoString);
    }
  };

  const isVerified =
    result?.verified && result?.verificationStatus === "VERIFIED";

  return (
    <div className="public-verification-page">
      {/* Header Navigation */}
      <header className="pv-nav">
        <Link to="/" className="pv-brand">
          <div className="pv-logo">C</div>
          <div className="pv-brand-text">
            <h1>ChainCoder</h1>
            <span>Public Verification Portal</span>
          </div>
        </Link>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link to="/verify-identity" className="pv-nav-link" style={{ background: "transparent" }}>
            DID Identity Verification
          </Link>
          {isAuthenticated ? (
            <Link to="/dashboard" className="pv-nav-link">
              Go to Dashboard →
            </Link>
          ) : (
            <Link to="/login" className="pv-nav-link">
              Sign In →
            </Link>
          )}
        </div>
      </header>

      {/* Main Content Container */}
      <main className="pv-container">
        <div className="pv-hero">
          <h2>Public Asset Verification</h2>
          <p>
            Cryptographically verify the existence, ownership organization, and
            document hash integrity of a ChainCoder digital asset on Hyperledger
            Fabric.
          </p>
        </div>

        {/* Search / Input Card */}
        <div className="pv-card">
          <form className="pv-form" onSubmit={handleSubmit} noValidate>
            <div className="pv-input-group">
              <label htmlFor="asset-id-input" className="pv-input-label">
                Digital Asset ID
              </label>

              <input
                id="asset-id-input"
                type="text"
                className="pv-input"
                placeholder="Enter Asset ID (e.g. AST-001)"
                value={assetIdInput}
                onChange={(e) => {
                  setAssetIdInput(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                disabled={loading}
                autoComplete="off"
                aria-required="true"
                aria-invalid={!!validationError}
                aria-describedby={
                  validationError ? "pv-validation-error" : undefined
                }
              />

              {validationError && (
                <div id="pv-validation-error" className="pv-error-hint">
                  ⚠️ {validationError}
                </div>
              )}
            </div>

            <button
              type="submit"
              className="pv-btn-primary"
              disabled={loading || !assetIdInput.trim()}
            >
              {loading ? "Verifying asset..." : "Verify Asset"}
            </button>
          </form>
        </div>

        {/* Live Result Area */}
        <div aria-live="polite">
          {loading && (
            <div className="pv-card pv-loading-box">
              <div className="pv-spinner" />
              <p>Verifying asset record on blockchain...</p>
            </div>
          )}

          {/* Initial Idle Explainer */}
          {!loading && !hasSearched && (
            <div className="pv-features">
              <div className="pv-feature-box">
                <div className="pv-feature-icon">🛡️</div>
                <h4>Immutable Ledger</h4>
                <p>
                  Every digital asset is securely registered on an immutable
                  Hyperledger Fabric enterprise channel.
                </p>
              </div>

              <div className="pv-feature-box">
                <div className="pv-feature-icon">🔒</div>
                <h4>Cryptographic Integrity</h4>
                <p>
                  Documents are anchored with SHA-256 cryptographic hashes
                  verified against decentralized IPFS content.
                </p>
              </div>

              <div className="pv-feature-box">
                <div className="pv-feature-icon">🔍</div>
                <h4>Public Transparency</h4>
                <p>
                  Anyone can confirm validity without exposing confidential
                  KYC or internal access control permissions.
                </p>
              </div>
            </div>
          )}

          {/* Error States */}
          {!loading && error && (
            <div className="pv-card">
              <div
                className={`pv-result-banner ${
                  error.statusCode === 404 ? "error" : "error"
                }`}
              >
                <div className="pv-status-icon">
                  {error.statusCode === 404 ? "🔍" : "⚠️"}
                </div>

                <div className="pv-status-text">
                  <h3>
                    {error.statusCode === 404
                      ? "Asset Not Found"
                      : error.statusCode === 400
                      ? "Invalid Asset ID"
                      : "Verification Service Unavailable"}
                  </h3>

                  <p>
                    {error.statusCode === 404
                      ? "Asset could not be verified. No public blockchain record was found for this Asset ID."
                      : error.statusCode === 400
                      ? error.message ||
                        "The provided Asset ID format is invalid. Please check the ID and try again."
                      : "Verification service is temporarily unavailable. Please verify your connection or try again later."}
                  </p>
                </div>
              </div>

              <div className="pv-actions-bar">
                <button
                  type="button"
                  className="pv-btn-secondary"
                  onClick={handleReset}
                >
                  Verify Another Asset
                </button>
              </div>
            </div>
          )}

          {/* Success / Result States */}
          {!loading && result?.asset && (
            <div className="pv-card">
              {/* Top Banner */}
              <div
                className={`pv-result-banner ${
                  isVerified ? "verified" : "unverified"
                }`}
              >
                <div className="pv-status-icon">
                  {isVerified ? "✓" : "⚠️"}
                </div>

                <div className="pv-status-text">
                  <h3>
                    {isVerified
                      ? "✓ ASSET VERIFIED"
                      : "⚠️ ASSET RECORD UNVERIFIED"}
                  </h3>

                  <p>
                    {isVerified
                      ? "This asset is registered on the blockchain and its document hash matches the storage record."
                      : "The asset record exists on the ledger, but document integrity verification could not be confirmed."}
                  </p>
                </div>
              </div>

              {/* Asset Details Grid */}
              <div className="pv-section">
                <h4 className="pv-section-title">Token & Asset Metadata</h4>

                <div className="pv-grid">
                  <div className="pv-cell">
                    <div className="pv-cell-label">NFT / Token ID</div>
                    <div className="pv-cell-value highlight">
                      {result.asset.tokenId || result.asset.assetId}
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Token Standard</div>
                    <div className="pv-cell-value">
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        background: "#1e293b",
                        color: "#60a5fa",
                        fontSize: "12px",
                        fontWeight: 600,
                        border: "1px solid #2563eb"
                      }}>
                        {result.asset.tokenStandard || "CHAINCODER-NFT"}
                      </span>
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Asset Name</div>
                    <div className="pv-cell-value">
                      {result.asset.name || "N/A"}
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Asset Type</div>
                    <div className="pv-cell-value">
                      {result.asset.assetType || "N/A"}
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Lifecycle Status</div>
                    <div className="pv-cell-value">
                      <AssetStatus status={result.asset.status} />
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Owner Organization</div>
                    <div className="pv-cell-value">
                      {result.asset.ownerOrganization || "N/A"}
                    </div>
                  </div>

                  {result.asset.ownerDID && (
                    <div className="pv-cell" style={{ gridColumn: "span 2" }}>
                      <div className="pv-cell-label">Owner Decentralized Identifier (DID)</div>
                      <div className="pv-cell-value highlight" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ wordBreak: "break-all", fontSize: "12px" }}>
                          {result.asset.ownerDID}
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="pv-btn-secondary"
                            style={{ padding: "2px 8px", fontSize: "11px" }}
                            onClick={() => handleCopy("ownerDID", result.asset.ownerDID)}
                          >
                            {copiedKey === "ownerDID" ? "✓ Copied" : "Copy"}
                          </button>
                          <Link
                            to={`/verify-identity?did=${encodeURIComponent(result.asset.ownerDID)}`}
                            className="pv-btn-secondary"
                            style={{ padding: "2px 8px", fontSize: "11px", textDecoration: "none" }}
                          >
                            Verify Identity →
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="pv-cell">
                    <div className="pv-cell-label">Created At</div>
                    <div className="pv-cell-value">
                      {formatDate(result.asset.createdAt)}
                    </div>
                  </div>

                  {result.asset.updatedAt && (
                    <div className="pv-cell">
                      <div className="pv-cell-label">Last Updated</div>
                      <div className="pv-cell-value">
                        {formatDate(result.asset.updatedAt)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Cryptographic & Storage Integrity */}
              <div className="pv-section">
                <h4 className="pv-section-title">
                  Document Integrity & Storage Proof
                </h4>

                <div className="pv-crypto-box">
                  <div className="pv-crypto-header">
                    <span className="pv-crypto-label">Document Hash (SHA-256)</span>
                    {result.asset.documentHash && (
                      <button
                        type="button"
                        className="pv-btn-secondary"
                        onClick={() =>
                          handleCopy(
                            "documentHash",
                            result.asset.documentHash
                          )
                        }
                      >
                        {copiedKey === "documentHash" ? "✓ Copied" : "Copy Hash"}
                      </button>
                    )}
                  </div>
                  <div className="pv-crypto-value">
                    {result.asset.documentHash || "No document hash registered"}
                  </div>
                </div>

                {result.asset.cid && (
                  <div className="pv-crypto-box">
                    <div className="pv-crypto-header">
                      <span className="pv-crypto-label">
                        IPFS Content Identifier (CID)
                      </span>
                      <button
                        type="button"
                        className="pv-btn-secondary"
                        onClick={() =>
                          handleCopy("cid", result.asset.cid)
                        }
                      >
                        {copiedKey === "cid" ? "✓ Copied" : "Copy CID"}
                      </button>
                    </div>
                    <div className="pv-crypto-value">
                      {result.asset.cid}
                    </div>
                  </div>
                )}

                {result.calculatedHash && (
                  <div className="pv-crypto-box">
                    <div className="pv-crypto-header">
                      <span className="pv-crypto-label">
                        IPFS Calculated Hash
                      </span>
                    </div>
                    <div className="pv-crypto-value">
                      {result.calculatedHash}
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "14px" }}>
                  <span
                    className={`pv-integrity-badge ${
                      isVerified ? "verified" : "unverified"
                    }`}
                  >
                    {isVerified
                      ? "✓ Hash Integrity Verified: Matches IPFS Content"
                      : "✕ Hash Integrity: Unverified or Mismatched"}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pv-actions-bar">
                <button
                  type="button"
                  className="pv-btn-secondary"
                  onClick={handleReset}
                >
                  Verify Another Asset
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="pv-footer">
        <p>
          ChainCoder Secure Platform ·{" "}
          <strong>Hyperledger Fabric & IPFS Verified</strong>
        </p>
        <p>Public cryptographic verification portal.</p>
      </footer>
    </div>
  );
}

export default PublicVerification;
