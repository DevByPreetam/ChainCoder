const RECENT_ASSETS_KEY = "chaincoder_recent_assets";
const MAX_RECENT_ASSETS = 10;

/**
 * Retrieve list of recent assets from localStorage
 * @returns {Array} Array of asset objects
 */
export function getRecentAssets() {
  try {
    const raw = localStorage.getItem(RECENT_ASSETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Failed to parse recent assets from storage:", err);
    return [];
  }
}

/**
 * Add or update an asset in recent assets
 * @param {Object} asset
 */
export function addRecentAsset(asset) {
  if (!asset || !asset.assetId) return;

  try {
    const existing = getRecentAssets();

    // Create a safe, minimal snapshot
    const entry = {
      assetId: asset.assetId,
      name: asset.name || asset.assetId,
      assetType: asset.assetType || "GENERAL",
      status: asset.status || "ACTIVE",
      owner: asset.owner || "—",
      ownerOrganization: asset.ownerOrganization || null,
      documentCID: asset.documentCID || asset.cid || null,
      viewedAt: new Date().toISOString(),
    };

    // Remove if already in list to avoid duplicates
    const filtered = existing.filter((item) => item.assetId !== asset.assetId);

    // Prepend to list and cap at MAX_RECENT_ASSETS
    const updated = [entry, ...filtered].slice(0, MAX_RECENT_ASSETS);

    localStorage.setItem(RECENT_ASSETS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("Failed to save recent asset:", err);
    return [];
  }
}

/**
 * Remove a specific asset from recent assets
 * @param {string} assetId
 */
export function removeRecentAsset(assetId) {
  try {
    const existing = getRecentAssets();
    const updated = existing.filter((item) => item.assetId !== assetId);
    localStorage.setItem(RECENT_ASSETS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("Failed to remove recent asset:", err);
    return [];
  }
}

/**
 * Clear all recent assets
 */
export function clearRecentAssets() {
  try {
    localStorage.removeItem(RECENT_ASSETS_KEY);
  } catch (err) {
    console.warn("Failed to clear recent assets:", err);
  }
}
