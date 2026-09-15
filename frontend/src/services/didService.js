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

/**
 * Fetch DID and public attributes for an authenticated identity
 * GET /api/identities/:identityId/did
 */
export async function getIdentityDID(identityId) {
  if (!identityId) {
    throw new Error("identityId is required");
  }

  const response = await fetch(
    `${API_URL}/identities/${encodeURIComponent(identityId)}/did`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch identity DID");
  }

  return data;
}

/**
 * Public DID Resolution
 * GET /api/did/:did
 */
export async function resolveDID(did) {
  if (!did) {
    throw new Error("DID is required");
  }

  const response = await fetch(
    `${API_URL}/did/${encodeURIComponent(did)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `DID resolution failed with status ${response.status}`);
    error.statusCode = response.status;
    error.errorCode = data.errorCode || "RESOLUTION_ERROR";
    throw error;
  }

  return data.didDocument || data;
}

/**
 * Public DID Verification
 * GET /api/did/:did/verify
 */
export async function verifyDID(did) {
  if (!did) {
    throw new Error("DID is required");
  }

  const response = await fetch(
    `${API_URL}/did/${encodeURIComponent(did)}/verify`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || `DID verification failed with status ${response.status}`);
    error.statusCode = response.status;
    error.errorCode = data.errorCode || "VERIFICATION_ERROR";
    throw error;
  }

  return data.verification || data;
}