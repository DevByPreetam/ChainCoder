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

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${assetId}-document`;
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
