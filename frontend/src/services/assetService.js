const API_URL = "http://localhost:5000/api";

function getToken() {
  return localStorage.getItem("chaincoder_token");
}

function authHeaders() {
  const token = getToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function getAsset(assetId) {
  const response = await fetch(
    `${API_URL}/assets/${encodeURIComponent(assetId)}`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch asset");
  }

  return data.data?.asset || data.asset;
}

export async function getAssetHistory(assetId) {
  const response = await fetch(
    `${API_URL}/assets/${encodeURIComponent(assetId)}/history`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch asset history");
  }

  return data.data?.history || data.history || [];
}

export async function verifyAssetDocument(assetId) {
  const response = await fetch(
    `${API_URL}/assets/${encodeURIComponent(assetId)}/verify`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to verify document");
  }

  return data.data || data;
}

export async function downloadAssetDocument(assetId) {
  const response = await fetch(
    `${API_URL}/assets/${encodeURIComponent(assetId)}/document`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  if (!response.ok) {
    let message = "Unable to download document";
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // response was not JSON (binary), use default message
    }
    throw new Error(message);
  }

  const disposition = response.headers.get("Content-Disposition");
  let filename = `${assetId}-document`;
  if (disposition && disposition.indexOf("filename=") !== -1) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1].trim();
    }
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.URL.revokeObjectURL(url);
}

export async function mintAsset(assetData) {
  const response = await fetch(`${API_URL}/assets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(assetData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to mint asset");
  }

  return data.asset || data.data?.asset || data;
}

export async function uploadAssetDocument(assetId, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("document", file);

  const response = await fetch(
    `${API_URL}/assets/${encodeURIComponent(assetId)}/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to upload document");
  }

  return data.data || data;
}

/** Upload document file directly to IPFS and obtain CID and SHA-256 hash */
export async function uploadDocumentToIpfs(file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("document", file);

  const response = await fetch(`${API_URL}/assets/ipfs/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to upload document to IPFS");
  }

  return data.data || data;
}

export async function transferAsset(assetId, newOwner) {
  const response = await fetch(
    `${API_URL}/assets/${encodeURIComponent(assetId)}/transfer`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ newOwner }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to transfer asset");
  }

  return data.asset || data.data?.asset || data;
}

// ─── Mint Proposal (Auditor Co-Approval) ────────────────────────────────────

/**
 * BEL Admin submits a mint proposal — does NOT write to Fabric immediately.
 * Auditor must co-approve before the asset is minted on-chain.
 */
export async function proposeMintAsset(assetData) {
  const response = await fetch(`${API_URL}/assets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(assetData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to submit mint proposal");
  }

  return data.data?.proposal || data.proposal || data;
}

/** Auditor: fetch all pending mint proposals */
export async function getPendingMintProposals() {
  const response = await fetch(`${API_URL}/assets/proposals/pending`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch pending mint proposals");
  }

  return data.data?.proposals || data.proposals || [];
}

/** BEL Admin: fetch all mint proposals (all statuses) */
export async function getAllMintProposals() {
  const response = await fetch(`${API_URL}/assets/proposals`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch mint proposals");
  }

  return data.data?.proposals || data.proposals || [];
}

/** Auditor: co-approve a pending proposal (triggers Fabric MintAsset) */
export async function approveMintProposal(proposalId) {
  const response = await fetch(
    `${API_URL}/assets/proposals/${encodeURIComponent(proposalId)}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to approve mint proposal");
  }

  return data.data || data;
}

/** Auditor: reject a pending proposal (no Fabric call) */
export async function rejectMintProposal(proposalId, reason) {
  const response = await fetch(
    `${API_URL}/assets/proposals/${encodeURIComponent(proposalId)}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ reason }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to reject mint proposal");
  }

  return data.data || data;
}

// ─── Asset Deletion Proposals (Auditor Co-Approval) ─────────────────────────

/**
 * BEL Admin submits an asset deletion proposal — requires Auditor co-approval.
 */
export async function proposeDeleteAsset(assetId, reason) {
  const response = await fetch(
    `${API_URL}/assets/${encodeURIComponent(assetId)}/propose-delete`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ reason }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to submit deletion proposal");
  }

  return data.data?.proposal || data.proposal || data;
}

/** Fetch all deletion proposals (BEL & Auditor) */
export async function getDeletionProposals() {
  const response = await fetch(`${API_URL}/assets/deletion-proposals`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch deletion proposals");
  }

  return data.data?.proposals || data.proposals || [];
}

/** Auditor: fetch pending deletion proposals */
export async function getPendingDeletionProposals() {
  const response = await fetch(
    `${API_URL}/assets/deletion-proposals/pending`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch pending deletion proposals");
  }

  return data.data?.proposals || data.proposals || [];
}

/** Auditor: co-approve an asset deletion proposal */
export async function approveDeletionProposal(proposalId) {
  const response = await fetch(
    `${API_URL}/assets/deletion-proposals/${encodeURIComponent(proposalId)}/approve`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to approve deletion proposal");
  }

  return data.data || data;
}

/** Auditor: reject an asset deletion proposal */
export async function rejectDeletionProposal(proposalId, reason) {
  const response = await fetch(
    `${API_URL}/assets/deletion-proposals/${encodeURIComponent(proposalId)}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ reason }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to reject deletion proposal");
  }

  return data.data || data;
}

