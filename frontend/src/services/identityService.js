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

export async function getIdentity(identityId) {
  const response = await fetch(
    `${API_URL}/identities/${encodeURIComponent(identityId)}`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch identity");
  }

  return data.identity;
}

export async function createIdentity({ identityId, name, organization, role, password }) {
  const response = await fetch(`${API_URL}/identities`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ identityId, name, organization, role, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to register identity");
  }

  return data.identity || data;
}

export async function revokeIdentity(identityId) {
  const response = await fetch(
    `${API_URL}/identities/${encodeURIComponent(identityId)}/revoke`,
    {
      method: "PATCH",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to revoke identity");
  }

  return data.identity || data;
}

export async function proposeRevokeIdentity(identityId, reason) {
  const response = await fetch(
    `${API_URL}/identities/${encodeURIComponent(identityId)}/revoke-propose`,
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
    throw new Error(data.message || "Unable to propose identity revocation");
  }

  return data.proposal || data;
}

export async function getRevocationProposals(status) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await fetch(
    `${API_URL}/identities/revocations/proposals${query}`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch revocation proposals");
  }

  return data.proposals || [];
}

export async function approveIdentityRevocation(identityId, proposalId) {
  const response = await fetch(
    `${API_URL}/identities/${encodeURIComponent(identityId)}/revoke-approve`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ proposalId }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to approve revocation proposal");
  }

  return data;
}

export async function rejectIdentityRevocation(identityId, proposalId, rejectionReason) {
  const response = await fetch(
    `${API_URL}/identities/${encodeURIComponent(identityId)}/revoke-reject`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ proposalId, rejectionReason }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to reject revocation proposal");
  }

  return data.proposal || data;
}