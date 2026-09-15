import { Link } from "react-router-dom";
import AssetStatus from "./AssetStatus";

function AssetCard({ asset }) {
  if (!asset) {
    return null;
  }

  const tokenId = asset.tokenId || asset.assetId;
  const ownerDID = asset.ownerDID || (asset.owner && asset.ownerOrganization ? `did:chaincoder:${asset.ownerOrganization}:${asset.owner}` : null);

  return (
    <div className="asset-card">
      <div className="asset-card-header">
        <span className="asset-card-id">{tokenId}</span>
        <AssetStatus status={asset.status} />
      </div>

      <div className="asset-card-name">
        {asset.name || "Tokenized Digital Asset"}
      </div>

      <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "12px", flexWrap: "wrap" }}>
        <span style={{
          fontSize: "11px",
          padding: "2px 8px",
          borderRadius: "4px",
          background: "#1e293b",
          color: "#93c5fd",
          border: "1px solid #334155",
          fontWeight: 600
        }}>
          {asset.tokenStandard || "CHAINCODER-NFT"}
        </span>
        <span style={{ fontSize: "12px", color: "#64748b" }}>•</span>
        <span className="asset-card-type" style={{ margin: 0 }}>
          {asset.assetType || "ASSET"}
        </span>
      </div>

      <div className="asset-card-field">
        <span className="asset-card-label">Owner</span>
        <span className="asset-card-value">{asset.owner || "—"}</span>
      </div>

      {ownerDID && (
        <div className="asset-card-field">
          <span className="asset-card-label">Owner DID</span>
          <span className="asset-card-value" style={{ fontFamily: "monospace", fontSize: "11px", color: "#38bdf8", wordBreak: "break-all" }}>
            {ownerDID}
          </span>
        </div>
      )}

      <div className="asset-card-field">
        <span className="asset-card-label">Document</span>
        <span className="asset-card-value">
          {asset.documentCID
            ? "✓ Verified on IPFS"
            : "No document"}
        </span>
      </div>

      <Link
        to={`/assets/${encodeURIComponent(asset.assetId)}`}
        className="asset-card-button"
      >
        View Details & Token Spec →
      </Link>
    </div>
  );
}

export default AssetCard;
