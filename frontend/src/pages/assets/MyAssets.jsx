import { useState } from "react";
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

  return (
    <div className="app-layout">
      <Sidebar />

      <section className="main-area">
        <Topbar />

        <main className="main-content">
          <div className="page-header">
            <div>
              <h2>My Assets</h2>
              <p>
                Manage your digital assets and blockchain ownership.
              </p>
            </div>
          </div>

          <form className="asset-search-bar" onSubmit={handleSearch}>
            <input
              type="text"
              className="asset-search-input"
              placeholder="Enter Asset ID (e.g. AST-0001)"
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
