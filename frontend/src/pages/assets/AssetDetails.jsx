import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import AssetStatus from "../../components/assets/AssetStatus";
import AssetHistory from "../../components/assets/AssetHistory";
import {
  getAsset,
  verifyAssetDocument,
  downloadAssetDocument,
} from "../../services/assetService";

import "../../styles/layout.css";
import "../../styles/assets.css";

function AssetDetails() {
  const { assetId } = useParams();

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

  useEffect(() => {
    async function loadAsset() {
      try {
        setLoading(true);
        setError("");
        const data = await getAsset(assetId);
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
  }, [assetId]);

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

  function formatDate(dateString) {
    if (!dateString) return "—";
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  }

  return (
    <div className="app-layout">
      <Sidebar />

      <section className="main-area">
        <Topbar />

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
                  <h2>{asset.assetId}</h2>
                  <p>{asset.name || "Digital Asset"}</p>
                </div>
                <AssetStatus status={asset.status} />
              </div>

              {/* Asset Information */}
              <div className="asset-section">
                <h3 className="asset-section-title">Asset Information</h3>
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
                    <span className="asset-info-label">Owner</span>
                    <span className="asset-info-value">
                      {asset.owner || "—"}
                    </span>
                  </div>
                  <div className="asset-info-item">
                    <span className="asset-info-label">Organization</span>
                    <span className="asset-info-value">
                      {asset.ownerOrganization || "—"}
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
                <h3 className="asset-section-title">Document</h3>
                <div className="asset-info-grid">
                  <div className="asset-info-item asset-info-wide">
                    <span className="asset-info-label">SHA-256 Hash</span>
                    <span
                      className="asset-info-value asset-info-mono"
                      title={asset.documentHash || ""}
                    >
                      {asset.documentHash || "No document hash"}
                    </span>
                  </div>
                  <div className="asset-info-item asset-info-wide">
                    <span className="asset-info-label">IPFS CID</span>
                    <span
                      className="asset-info-value asset-info-mono"
                      title={asset.documentCID || ""}
                    >
                      {asset.documentCID || "No IPFS CID"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Verification Section */}
              <div className="asset-section">
                <h3 className="asset-section-title">Verification</h3>

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
                        ? "✓ Document Verified"
                        : "✗ Verification Failed"}
                    </div>
                    <div className="asset-verify-details">
                      <div className="asset-info-item asset-info-wide">
                        <span className="asset-info-label">
                          Calculated SHA-256
                        </span>
                        <span className="asset-info-value asset-info-mono">
                          {verification.calculatedHash || "—"}
                        </span>
                      </div>
                      <div className="asset-info-item asset-info-wide">
                        <span className="asset-info-label">
                          Blockchain SHA-256
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
                    {verifying ? "Verifying…" : "Verify Document"}
                  </button>
                  <button
                    className="asset-action-button"
                    onClick={handleDownload}
                    disabled={downloading || !asset.documentCID}
                  >
                    {downloading ? "Downloading…" : "Download Document"}
                  </button>
                </div>
              </div>

              {/* Blockchain History */}
              <div className="asset-section">
                <h3 className="asset-section-title">Blockchain History</h3>
                <AssetHistory assetId={assetId} />
              </div>
            </>
          )}
        </main>
      </section>
    </div>
  );
}

export default AssetDetails;
