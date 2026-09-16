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

export async function getAuditorIdentities() {
  const response = await fetch(`${API_URL}/auditor/identities`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch auditor identities");
  }

  return data;
}

export async function getAuditorIdentity(identityId) {
  const response = await fetch(
    `${API_URL}/auditor/identities/${encodeURIComponent(identityId)}`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch auditor identity");
  }

  return data.identity;
}

export async function getAuditorAssets() {
  const response = await fetch(`${API_URL}/auditor/assets`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch auditor assets");
  }

  return data;
}

export async function getAuditorAssetHistory(assetId) {
  const response = await fetch(
    `${API_URL}/auditor/assets/${encodeURIComponent(assetId)}/history`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch asset audit history");
  }

  return data.history || [];
}

export async function getAuditorAccess() {
  const response = await fetch(`${API_URL}/auditor/access`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch access records");
  }

  return data;
}

export async function getAuditorAccessRequests() {
  const response = await fetch(`${API_URL}/auditor/access-requests`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch access requests");
  }

  return data;
}

export async function getAuditorTransactions() {
  const response = await fetch(`${API_URL}/auditor/transactions`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch audit transactions");
  }

  return data.transactions || [];
}

export async function exportAuditorData() {
  const response = await fetch(`${API_URL}/auditor/export`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!response.ok) {
    const errJson = await response.json().catch(() => null);
    throw new Error(errJson?.message || "Unable to export audit log");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chaincoder-audit.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
  return true;
}

export async function verifyAssetPublic(assetId) {
  const response = await fetch(
    `${API_URL}/verify/asset/${encodeURIComponent(assetId)}`,
    {
      method: "GET",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to verify asset");
  }

  return data;
}

export async function getRecentActivities() {
  const response = await fetch(`${API_URL}/audit/recent`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch recent activities");
  }

  return data.activities || data.data?.activities || [];
}

