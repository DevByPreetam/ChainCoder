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

export async function grantAccess(accessData) {
  const response = await fetch(`${API_URL}/access`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(accessData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to grant access");
  }

  return data.access || data.data?.access || data;
}

export async function getAccess(identityId, assetId) {
  const response = await fetch(
    `${API_URL}/access/${encodeURIComponent(identityId)}/${encodeURIComponent(
      assetId
    )}`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch access record");
  }

  return data.access || data.data?.access || data;
}

export async function checkAccess(identityId, assetId) {
  return getAccess(identityId, assetId);
}

export async function revokeAccess(identityId, assetId) {
  const response = await fetch(
    `${API_URL}/access/${encodeURIComponent(identityId)}/${encodeURIComponent(
      assetId
    )}/revoke`,
    {
      method: "PATCH",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to revoke access");
  }

  return data.access || data.data?.access || data;
}

export async function getAccessHistory() {
  const response = await fetch(`${API_URL}/access/history`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch access history");
  }

  return data.history || data.data?.history || [];
}
