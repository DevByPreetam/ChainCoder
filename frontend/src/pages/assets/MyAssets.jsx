import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import AssetCard from "../../components/assets/AssetCard";
import Icon from "../../components/common/Icon";
import { getAsset, getAllMintProposals } from "../../services/assetService";
import { getAuditorAssets } from "../../services/auditorService";
import { getMyAccessRequests } from "../../services/accessRequestService";
import {
  getRecentAssets,
  addRecentAsset,
  clearRecentAssets,
} from "../../utils/recentAssets";

import "../../styles/layout.css";
import "../../styles/assets.css";

function MyAssets() {
  const { user } = useAuth();

  const [searchId, setSearchId] = useState("");
  const [assets, setAssets] = useState([]);
  const [recentAssetsList, setRecentAssetsList] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load available assets and recent assets on initial render
  useEffect(() => {
    let isMounted = true;

    async function loadAssets() {
      try {
        setInitialLoading(true);
        setError("");

        // 1. Always load client-side recent assets
        const recents = getRecentAssets();
        if (isMounted) setRecentAssetsList(recents);

        const loadedMap = new Map();

        // 2. Role-specific discovery
        if (user?.role === "Auditor" && user?.organization === "Auditor") {
          try {
            const res = await getAuditorAssets();
            const list = res?.assets || [];
            list.forEach((ast) => {
              if (ast && ast.assetId && !ast.error) {
                loadedMap.set(ast.assetId, ast);
              }
            });
          } catch (err) {
            console.warn("Could not load auditor assets:", err.message);
          }
        } else if (user?.organization === "BEL" && (user?.role === "Admin" || user?.role === "Manager")) {
          try {
            const proposals = await getAllMintProposals();
            if (Array.isArray(proposals)) {
              const approved = proposals.filter((p) => p.status === "APPROVED" && p.assetId);
              // Fetch up to 8 recent approved assets from blockchain
              for (const p of approved.slice(0, 8)) {
                try {
                  const a = await getAsset(p.assetId);
                  if (a && a.assetId) {
                    loadedMap.set(a.assetId, a);
                  }
                } catch {
                  // Fallback: use proposal metadata
                  loadedMap.set(p.assetId, {
                    assetId: p.assetId,
                    name: p.name || p.assetId,
                    assetType: p.assetType || "DEFENSE_DOCUMENT",
                    status: "ACTIVE",
                    owner: p.owner || "BEL Admin",
                    ownerOrganization: "BEL",
                    documentCID: p.documentCID,
                    documentHash: p.documentHash,
                    createdAt: p.createdAt,
                  });
                }
              }
            }
          } catch (err) {
            console.warn("Could not load BEL mint proposals:", err.message);
          }
        } else {
          // Contractor / Employee: check user's access requests
          try {
            const reqs = await getMyAccessRequests();
            const list = reqs?.requests || reqs || [];
            if (Array.isArray(list)) {
              for (const r of list.slice(0, 5)) {
                if (r.assetId && !loadedMap.has(r.assetId)) {
                  try {
                    const a = await getAsset(r.assetId);
                    if (a && a.assetId) loadedMap.set(a.assetId, a);
                  } catch {
                    // Skip if not accessible
                  }
                }
              }
            }
          } catch (err) {
            console.warn("Could not load user access requests:", err.message);
          }
        }

        // If no assets were discovered via roles, load recent assets into view
        if (loadedMap.size === 0 && recents.length > 0) {
          recents.forEach((item) => {
            loadedMap.set(item.assetId, item);
          });
        }

        if (isMounted) {
          setAssets(Array.from(loadedMap.values()));
        }
      } catch (err) {
        if (isMounted) setError(err.message || "Unable to load initial assets");
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    }

    if (user?.userId) {
      loadAssets();
    }

    return () => {
      isMounted = false;
    };
  }, [user?.userId, user?.role, user?.organization]);

  async function handleSearch(e) {
    if (e) e.preventDefault();

    const trimmed = searchId.trim();
    if (!trimmed) return;

    // Check if already displayed
    const alreadyLoaded = assets.find(
      (a) => a.assetId?.toLowerCase() === trimmed.toLowerCase()
    );
    if (alreadyLoaded) {
      setError("This asset is already displayed in the registry below.");
      return;
    }

    try {
      setSearching(true);
      setError("");
      setHasSearched(true);

      const asset = await getAsset(trimmed);

      // Save to client-side Recent Assets repository
      const updatedRecents = addRecentAsset(asset);
      if (updatedRecents) setRecentAssetsList(updatedRecents);

      setAssets((prev) => [asset, ...prev.filter((a) => a.assetId !== asset.assetId)]);
      setSearchId("");
    } catch (err) {
      setError(err.message || `Asset "${trimmed}" was not found on the ledger.`);
    } finally {
      setSearching(false);
    }
  }

  const handleRecentClick = async (asset) => {
    const alreadyLoaded = assets.find((a) => a.assetId === asset.assetId);
    if (alreadyLoaded) return;

    try {
      setSearching(true);
      setError("");
      const fullAsset = await getAsset(asset.assetId);
      addRecentAsset(fullAsset);
      setAssets((prev) => [fullAsset, ...prev]);
    } catch {
      // If full fetch fails, display snapshot card
      setAssets((prev) => [asset, ...prev]);
    } finally {
      setSearching(false);
    }
  };

  const handleClearRecents = () => {
    clearRecentAssets();
    setRecentAssetsList([]);
  };

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

            {user?.organization === "BEL" && (user?.role === "Admin" || user?.role === "Manager") && (
              <Link
                to="/assets/mint"
                className="btn btn-primary"
                style={{ padding: "8px 16px", fontSize: "13px" }}
              >
                + Mint New Asset
              </Link>
            )}
          </div>

          {/* Search Form */}
          <form className="asset-search-bar" onSubmit={handleSearch}>
            <input
              type="text"
              className="asset-search-input"
              placeholder="Search by Asset ID (e.g. AST-022, AST-023, AST-SBE-717629)"
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

          {/* Recent Assets Section */}
          {recentAssetsList.length > 0 && (
            <div style={{ margin: "14px 0 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon name="history" size={14} color="var(--primary-light)" />
                  Recent Assets:
                </span>
                <button
                  type="button"
                  onClick={handleClearRecents}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: "11px",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Clear History
                </button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                {recentAssetsList.map((item) => (
                  <button
                    key={item.assetId}
                    type="button"
                    onClick={() => handleRecentClick(item)}
                    title={`View ${item.assetId} (${item.name || "Asset"})`}
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                      borderRadius: "var(--radius-sm)",
                      padding: "5px 12px",
                      fontSize: "12px",
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all var(--transition-fast)",
                    }}
                    className="recent-asset-chip"
                  >
                    <span>{item.assetId}</span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      ({item.ownerOrganization || item.status || "ledger"})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="asset-error" style={{ marginBottom: "20px" }}>
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Loading Indicator */}
          {initialLoading && (
            <div className="asset-empty" style={{ padding: "40px" }}>
              <Icon name="database" size={32} color="var(--primary-light)" />
              <p style={{ marginTop: "12px", fontWeight: "600" }}>Querying Hyperledger Fabric...</p>
              <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading verified cryptographic defense assets from ledger.</p>
            </div>
          )}

          {/* Asset Grid */}
          {!initialLoading && assets.length > 0 && (
            <div className="asset-grid">
              {assets.map((asset) => (
                <AssetCard key={asset.assetId} asset={asset} />
              ))}
            </div>
          )}

          {/* Empty States */}
          {!initialLoading && assets.length === 0 && (
            <div className="asset-empty">
              <Icon name="assets" size={36} color="var(--text-muted)" />
              <h3 style={{ margin: "12px 0 6px", color: "var(--text-primary)" }}>
                {hasSearched ? "No Assets Found" : "No Assets in Current View"}
              </h3>
              <p style={{ color: "var(--text-muted)", maxWidth: "420px", margin: "0 auto" }}>
                {hasSearched
                  ? "No ledger asset matches the requested identifier. Please check the Asset ID and try again."
                  : "Enter an Asset ID in the search bar above to look up an asset on the blockchain, or mint a new asset if authorized."}
              </p>
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

export default MyAssets;
