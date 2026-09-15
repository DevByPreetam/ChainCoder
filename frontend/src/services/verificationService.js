/**
 * Public Asset Verification Service
 * Communicates with public endpoints on the ChainCoder Express API.
 * This service is unauthenticated - no auth token is attached.
 */

const API_URL = "http://localhost:5000/api";

export async function verifyAsset(assetId) {
  if (!assetId || typeof assetId !== "string") {
    const err = new Error("Asset ID is required");
    err.statusCode = 400;
    err.errorCode = "BAD_REQUEST";
    throw err;
  }

  const trimmedId = assetId.trim();
  if (!trimmedId) {
    const err = new Error("Asset ID cannot be empty");
    err.statusCode = 400;
    err.errorCode = "BAD_REQUEST";
    throw err;
  }

  const response = await fetch(
    `${API_URL}/verify/asset/${encodeURIComponent(trimmedId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage =
      data.message || `Unable to verify asset (HTTP ${response.status})`;
    const error = new Error(errorMessage);
    error.statusCode = response.status;
    error.errorCode = data.errorCode || "VERIFICATION_ERROR";
    throw error;
  }

  return data;
}
