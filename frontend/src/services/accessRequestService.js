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
 * Contractor creates a new access request
 * Payload: { identityId, assetId, permission, reason }
 * Permission must be 'READ' or 'WRITE'
 */
export async function createAccessRequest(requestData) {
  const response = await fetch(`${API_URL}/access/requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(requestData),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to submit access request");
  }

  return data.request || data.data?.request || data;
}

/**
 * Contractor fetches their submitted requests
 */
export async function getMyAccessRequests() {
  const response = await fetch(`${API_URL}/access/requests/my`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch your access requests");
  }

  return data.requests || data.data?.requests || [];
}

/**
 * BEL Admin/Manager fetches pending access requests
 */
export async function getPendingAccessRequests() {
  const response = await fetch(`${API_URL}/access/requests/pending`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch pending access requests");
  }

  return data.requests || data.data?.requests || [];
}

/**
 * BEL Admin/Manager fetches all access requests, optional filter by status
 */
export async function getAccessRequests(status) {
  const url = status
    ? `${API_URL}/access/requests?status=${encodeURIComponent(status)}`
    : `${API_URL}/access/requests`;

  const response = await fetch(url, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch access requests");
  }

  return data.requests || data.data?.requests || [];
}

/**
 * Fetches details of a single access request
 */
export async function getAccessRequest(requestId) {
  const response = await fetch(
    `${API_URL}/access/requests/${encodeURIComponent(requestId)}`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch access request details");
  }

  return data.request || data.data?.request || data;
}

/**
 * BEL Admin/Manager approves request (PENDING -> BEL_APPROVED)
 */
export async function approveAccessRequest(requestId) {
  const response = await fetch(
    `${API_URL}/access/requests/${encodeURIComponent(requestId)}/approve`,
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
    throw new Error(data.message || "Unable to approve access request");
  }

  return data.request || data.data?.request || data;
}

/**
 * BEL Admin/Manager rejects request (PENDING -> REJECTED)
 */
export async function rejectAccessRequest(requestId, reason) {
  const response = await fetch(
    `${API_URL}/access/requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify({ reason: reason || "" }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to reject access request");
  }

  return data.request || data.data?.request || data;
}

/**
 * Auditor co-approves request and triggers Fabric grantAccess (BEL_APPROVED -> ACTIVE)
 */
export async function auditorApproveAccessRequest(requestId) {
  const response = await fetch(
    `${API_URL}/access/requests/${encodeURIComponent(
      requestId
    )}/auditor-approve`,
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
    throw new Error(data.message || "Unable to perform auditor approval");
  }

  return data.request || data.data?.request || data;
}

/**
 * Auditor fetches all access requests via Auditor route
 */
export async function getAuditorAccessRequests() {
  const response = await fetch(`${API_URL}/auditor/access-requests`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch auditor access requests");
  }

  return data.requests || data.data?.requests || [];
}
