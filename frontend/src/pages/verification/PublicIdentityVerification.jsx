import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { verifyDID, resolveDID } from "../../services/didService";

import "../../styles/public-verification.css";

function PublicIdentityVerification() {
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [didInput, setDidInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [didDocument, setDidDocument] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [docError, setDocError] = useState(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);

  const initialSearchHandled = useRef(false);

  const executeVerification = async (targetDid) => {
    const trimmed = (targetDid || "").trim();

    if (!trimmed) {
      setValidationError("DID is required.");
      return;
    }

    if (!trimmed.startsWith("did:chaincoder:")) {
      setValidationError("Invalid DID format. Must start with 'did:chaincoder:' (e.g. did:chaincoder:BEL:BEL001)");
      return;
    }

    if (
      trimmed.includes("..") ||
      trimmed.includes("\\") ||
      trimmed.includes("\0")
    ) {
      setValidationError("DID contains invalid path characters.");
      return;
    }

    setValidationError(null);
    setLoading(true);
    setError(null);
    setVerificationResult(null);
    setDidDocument(null);
    setHasSearched(true);

    try {
      const data = await verifyDID(trimmed);
      setVerificationResult(data?.verification || data);
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

  const handleFetchDocument = async (didToResolve) => {
    try {
      setLoadingDoc(true);
      setDocError(null);
      const doc = await resolveDID(didToResolve);
      setDidDocument(doc?.didDocument || doc);
      setShowDocModal(true);
    } catch (err) {
      setDocError(err.message || "Unable to resolve DID document");
      setShowDocModal(true);
    } finally {
      setLoadingDoc(false);
    }
  };

  // Support shareable URL query param /verify-identity?did=... on mount
  useEffect(() => {
    const queryDid = searchParams.get("did");
    if (queryDid && !initialSearchHandled.current) {
      initialSearchHandled.current = true;
      const decoded = decodeURIComponent(queryDid).trim();
      setDidInput(decoded);
      executeVerification(decoded);
    }
  }, [searchParams]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = didInput.trim();
    if (trimmed) {
      setSearchParams({ did: trimmed });
    } else {
      setSearchParams({});
    }
    executeVerification(trimmed);
  };

  const handleReset = () => {
    setDidInput("");
    setVerificationResult(null);
    setDidDocument(null);
    setError(null);
    setValidationError(null);
    setHasSearched(false);
    setSearchParams({});
  };

  const handleCopy = (key, text) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleChipClick = (sampleDid) => {
    setDidInput(sampleDid);
    setSearchParams({ did: sampleDid });
    executeVerification(sampleDid);
  };

  const formatDate = (isoString) => {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  const SAMPLE_DIDS = [
    "did:chaincoder:BEL:BEL001",
    "did:chaincoder:Auditor:AUD001",
    "did:chaincoder:Contractor:CON001",
    "did:chaincoder:BEL:BEL002",
  ];

  return (
    <div className="public-verification-page">
      {/* Header Navigation */}
      <header className="pv-nav">
        <Link to="/" className="pv-brand">
          <div className="pv-logo">C</div>
          <div className="pv-brand-text">
            <h1>ChainCoder</h1>
            <span>Public Identity Verification</span>
          </div>
        </Link>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Link to="/verify" className="pv-nav-link" style={{ background: "transparent" }}>
            Asset Verification
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
          <h2>Public DID Identity Verification</h2>
          <p>
            Verify any registered ChainCoder Decentralized Identifier (DID) on the
            Hyperledger Fabric ledger across the BEL, Auditor, and Contractor organizations.
          </p>
        </div>

        {/* Search / Input Card */}
        <div className="pv-card">
          <form className="pv-form" onSubmit={handleSubmit} noValidate>
            <div className="pv-input-group">
              <label htmlFor="did-input" className="pv-input-label">
                Decentralized Identifier (DID)
              </label>

              <input
                id="did-input"
                type="text"
                className="pv-input"
                placeholder="Enter DID (e.g. did:chaincoder:BEL:BEL001)"
                value={didInput}
                onChange={(e) => {
                  setDidInput(e.target.value);
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
              disabled={loading || !didInput.trim()}
            >
              {loading ? "Verifying DID..." : "Verify DID"}
            </button>
          </form>

          {/* Sample quick-select chips */}
          <div style={{ marginTop: "16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Demo DIDs:</span>
            {SAMPLE_DIDS.map((sd) => (
              <button
                key={sd}
                type="button"
                onClick={() => handleChipClick(sd)}
                disabled={loading}
                style={{
                  background: "#0f172a",
                  border: "1px solid #1e293b",
                  color: "#94a3b8",
                  borderRadius: "14px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#38bdf8";
                  e.currentTarget.style.color = "#38bdf8";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#1e293b";
                  e.currentTarget.style.color = "#94a3b8";
                }}
              >
                {sd}
              </button>
            ))}
          </div>
        </div>

        {/* Live Result Area */}
        <div aria-live="polite">
          {loading && (
            <div className="pv-card pv-loading-box">
              <div className="pv-spinner" />
              <p>Verifying identity record on Hyperledger Fabric ledger...</p>
            </div>
          )}

          {/* Initial Idle Explainer */}
          {!loading && !hasSearched && (
            <div className="pv-features">
              <div className="pv-feature-box">
                <div className="pv-feature-icon">🆔</div>
                <h4>Decentralized Identity</h4>
                <p>
                  Every participant holds a ChainCoder DID resolvable into a DID Document representation on Hyperledger Fabric.
                </p>
              </div>

              <div className="pv-feature-box">
                <div className="pv-feature-icon">🏛️</div>
                <h4>Multi-Org Governance</h4>
                <p>
                  Identities are anchored to designated organizations (BEL, Auditor, Contractor) with strict cryptographic MSP credentials.
                </p>
              </div>

              <div className="pv-feature-box">
                <div className="pv-feature-icon">🔍</div>
                <h4>Public Transparency</h4>
                <p>
                  Anyone can confirm validity, role, and CA cryptographic references without exposing private keys or confidential data.
                </p>
              </div>
            </div>
          )}

          {/* Error States */}
          {!loading && error && (
            <div className="pv-card">
              <div className="pv-result-banner error">
                <div className="pv-status-icon">
                  {error.statusCode === 404 ? "🔍" : "⚠️"}
                </div>

                <div className="pv-status-text">
                  <h3>
                    {error.statusCode === 404
                      ? "DID Not Found"
                      : error.statusCode === 400
                      ? "Invalid DID Request"
                      : "Identity Verification Error"}
                  </h3>

                  <p>
                    {error.statusCode === 404
                      ? "The requested DID is not registered on the Hyperledger Fabric ledger or no matching identity index was found."
                      : error.message || "Unable to complete DID verification on the blockchain."}
                  </p>
                </div>
              </div>

              <div className="pv-actions-bar">
                <button
                  type="button"
                  className="pv-btn-secondary"
                  onClick={handleReset}
                >
                  Verify Another DID
                </button>
              </div>
            </div>
          )}

          {/* Success / Result States */}
          {!loading && verificationResult && (
            <div className="pv-card">
              {/* Top Banner */}
              <div
                className={`pv-result-banner ${
                  verificationResult.verified ? "verified" : "unverified"
                }`}
              >
                <div className="pv-status-icon">
                  {verificationResult.verified ? "✓" : "⚠️"}
                </div>

                <div className="pv-status-text">
                  <h3>
                    {verificationResult.verified
                      ? "✓ DID VERIFIED & ACTIVE"
                      : "⚠️ DID RECORD UNVERIFIED"}
                  </h3>

                  <p>
                    {verificationResult.verified
                      ? "This Decentralized Identifier is confirmed active and verified on the Hyperledger Fabric ledger."
                      : verificationResult.reason ||
                        "This identity record exists on the ledger, but its active status or credentials could not be confirmed."}
                  </p>
                </div>
              </div>

              {/* Identity Details Grid */}
              <div className="pv-section">
                <h4 className="pv-section-title">Identity Ledger Metadata</h4>

                <div className="pv-grid">
                  <div className="pv-cell" style={{ gridColumn: "span 2" }}>
                    <div className="pv-cell-label">Decentralized Identifier (DID)</div>
                    <div className="pv-cell-value highlight" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ wordBreak: "break-all" }}>{verificationResult.did}</span>
                      <button
                        type="button"
                        className="pv-btn-secondary"
                        style={{ padding: "3px 8px", fontSize: "11px", marginLeft: "8px" }}
                        onClick={() => handleCopy("did", verificationResult.did)}
                      >
                        {copiedKey === "did" ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Identity ID</div>
                    <div className="pv-cell-value">
                      {verificationResult.identityId || "N/A"}
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Organization</div>
                    <div className="pv-cell-value">
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "600",
                        background: "#1e293b",
                        color: "#38bdf8",
                        border: "1px solid #0284c7"
                      }}>
                        {verificationResult.organization || "N/A"}
                      </span>
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Role</div>
                    <div className="pv-cell-value">
                      {verificationResult.role || "N/A"}
                    </div>
                  </div>

                  <div className="pv-cell">
                    <div className="pv-cell-label">Status</div>
                    <div className="pv-cell-value">
                      <span style={{
                        color: verificationResult.status === "ACTIVE" ? "#4ade80" : "#f87171",
                        fontWeight: "600"
                      }}>
                        {verificationResult.status || "UNKNOWN"}
                      </span>
                    </div>
                  </div>

                  {verificationResult.verifiedAt && (
                    <div className="pv-cell" style={{ gridColumn: "span 2" }}>
                      <div className="pv-cell-label">Ledger Verification Time</div>
                      <div className="pv-cell-value">
                        {formatDate(verificationResult.verifiedAt)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Cryptographic Reference */}
              <div className="pv-section">
                <h4 className="pv-section-title">
                  Fabric CA Identity Anchor
                </h4>

                <div className="pv-crypto-box">
                  <div className="pv-crypto-header">
                    <span className="pv-crypto-label">Cryptographic Reference (MSP ID)</span>
                    {verificationResult.cryptographicReference && (
                      <button
                        type="button"
                        className="pv-btn-secondary"
                        onClick={() =>
                          handleCopy(
                            "cryptographicReference",
                            verificationResult.cryptographicReference
                          )
                        }
                      >
                        {copiedKey === "cryptographicReference" ? "✓ Copied" : "Copy Reference"}
                      </button>
                    )}
                  </div>
                  <div className="pv-crypto-value">
                    {verificationResult.cryptographicReference || "No cryptographic reference registered"}
                  </div>
                </div>

                <div style={{ marginTop: "14px" }}>
                  <span
                    className={`pv-integrity-badge ${
                      verificationResult.verified ? "verified" : "unverified"
                    }`}
                  >
                    {verificationResult.verified
                      ? "✓ CA MSP Reference Verified on Fabric Channel"
                      : "✕ Identity Record Unverified or Non-Active"}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pv-actions-bar" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <button
                  type="button"
                  className="pv-btn-primary"
                  onClick={() => handleFetchDocument(verificationResult.did)}
                  disabled={loadingDoc}
                >
                  {loadingDoc ? "Resolving Document..." : "📄 View Resolved DID Document"}
                </button>

                <button
                  type="button"
                  className="pv-btn-secondary"
                  onClick={handleReset}
                >
                  Verify Another DID
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* DID Document Modal */}
      {showDocModal && (
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
          onClick={() => setShowDocModal(false)}
        >
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "680px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "var(--shadow-lg)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text-primary)", fontWeight: 600 }}>
                ChainCoder DID Document
              </h3>
              <button
                type="button"
                onClick={() => setShowDocModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
              {docError && (
                <div className="pv-error-hint" style={{ marginBottom: "12px" }}>
                  ⚠️ {docError}
                </div>
              )}
              {didDocument && (
                <pre
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px",
                    padding: "16px",
                    color: "var(--primary)",
                    fontFamily: "monospace",
                    fontSize: "12px",
                    lineHeight: "1.5",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {JSON.stringify(didDocument, null, 2)}
                </pre>
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                padding: "12px 20px",
                borderTop: "1px solid var(--border-subtle)",
              }}
            >
              {didDocument && (
                <button
                  type="button"
                  className="pv-btn-secondary"
                  onClick={() => handleCopy("didDoc", JSON.stringify(didDocument, null, 2))}
                >
                  {copiedKey === "didDoc" ? "✓ Copied JSON" : "Copy JSON"}
                </button>
              )}
              <button
                type="button"
                className="pv-btn-secondary"
                onClick={() => setShowDocModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="pv-footer">
        <p>
          ChainCoder Secure Platform ·{" "}
          <strong>Hyperledger Fabric DID Registry</strong>
        </p>
        <p>Public decentralized identifier verification portal.</p>
      </footer>
    </div>
  );
}

export default PublicIdentityVerification;
