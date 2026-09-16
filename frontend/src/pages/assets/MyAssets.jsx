import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import AssetCard from "../../components/assets/AssetCard";
import { getAsset } from "../../services/assetService";

import "../../styles/layout.css";
import "../../styles/assets.css";

function MyAssets() {

  const [searchId, setSearchId] = useState("");
  const [assets, setAssets] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  // Auto-load available ledger assets on initial render
  useEffect(() => {
    let isMounted = true;
    async function loadInitialAssets() {
      const candidates = ["ASSET001", "ASSET002", "ASSET003"];
      const loaded = [];
      for (const id of candidates) {
        try {
          const a = await getAsset(id);
          if (a && a.assetId) {
            loaded.push(a);
          }
        } catch {
          // Skip if unauthorized or not found for this user
        }
      }
      if (isMounted && loaded.length > 0) {
        setAssets(loaded);
      }
    }
    loadInitialAssets();
    return () => { isMounted = false; };
  }, []);

  async function handleSearch(e) {
    e.preventDefault();

    const trimmed = searchId.trim();
    if (!trimmed) return;

    // Prevent duplicate cards
    const alreadyLoaded = assets.find(
      (a) => a.assetId === trimmed
    );
    if (alreadyLoaded) {
      setError("This asset is already displayed below.");
      return;
    }

    try {
      setSearching(true);
      setError("");
      setHasSearched(true);

      const asset = await getAsset(trimmed);
      setAssets((prev) => [asset, ...prev]);
      setSearchId("");
    } catch (err) {
      setError(err.message || "Asset not found");
    } finally {
      setSearching(false);
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
          title="Digital Assets Repository"
          subtitle="Inspect verified defense documents and tokenized blockchain assets"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h2>Digital Asset Registry</h2>
              <p>
                Cryptographic assets minted and anchored on Hyperledger Fabric with IPFS proofs.
              </p>
            </div>

            <Link
              to="/assets/mint"
              className="btn btn-primary"
              style={{ padding: "8px 16px", fontSize: "13px" }}
            >
              + Mint New Asset
            </Link>
          </div>

          <form className="asset-search-bar" onSubmit={handleSearch}>
            <input
              type="text"
              className="asset-search-input"
              placeholder="Enter Asset ID (e.g. ASSET001, ASSET002)"
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
              disabled={searching}
            />
            <button
              type="submit"
              className="asset-search-button"
              disabled={searching || !searchId.trim()}
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </form>

          <div style={{ margin: "10px 0 20px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>Quick Search Blockchain Assets:</span>
            {["ASSET001", "ASSET002", "ASSET003"].map((id) => (
              <button
                key={id}
                type="button"
                onClick={async () => {
                  setSearchId(id);
                  const alreadyLoaded = assets.find((a) => a.assetId === id);
                  if (alreadyLoaded) return;
                  try {
                    setSearching(true);
                    setError("");
                    setHasSearched(true);
                    const asset = await getAsset(id);
                    setAssets((prev) => [asset, ...prev]);
                    setSearchId("");
                  } catch (err) {
                    setError(err.message || "Asset not found");
                  } finally {
                    setSearching(false);
                  }
                }}
                style={{
                  background: "rgba(30, 41, 59, 0.7)",
                  border: "1px solid #334155",
                  color: "#94a3b8",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontFamily: "monospace"
                }}
              >
                {id}
              </button>
            ))}
          </div>

          {error && (
            <div className="asset-error">
              {error}
            </div>
          )}

          {assets.length > 0 && (
            <div className="asset-grid">
              {assets.map((asset) => (
                <AssetCard key={asset.assetId} asset={asset} />
              ))}
            </div>
          )}

          {assets.length === 0 && hasSearched && !searching && !error && (
            <div className="asset-empty">
              No assets found. Try searching with a valid Asset ID.
            </div>
          )}

          {assets.length === 0 && !hasSearched && (
            <div className="asset-empty">
              Enter an Asset ID above to search for your digital assets.
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

export default MyAssets;
