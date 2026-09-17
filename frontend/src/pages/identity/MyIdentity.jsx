import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import { getIdentity } from "../../services/identityService";

import "../../styles/layout.css";
import "../../styles/identity.css";

function MyIdentity() {
  const { user } = useAuth();

  const [identity, setIdentity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    async function loadIdentity() {
      try {
        setLoading(true);
        setError("");

        const data = await getIdentity(user.userId);
        setIdentity(data);
      } catch (err) {
        setError(err.message || "Unable to load identity");
      } finally {
        setLoading(false);
      }
    }

    if (user?.userId) {
      loadIdentity();
    }
  }, [user]);

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="My Blockchain Identity"
          subtitle="Inspect your cryptographic credentials and W3C DID"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">

          <div className="page-header">
            <div>
              <h2>My Identity</h2>
              <p>
                View your registered blockchain identity.
              </p>
            </div>
          </div>

          {loading && (
            <div className="identity-message">
              Loading identity...
            </div>
          )}

          {error && (
            <div className="identity-error">
              {error}
            </div>
          )}

          {!loading && !error && identity && (
            <>
              <div className="identity-status-card">

                <div>
                  <span className="identity-label">
                    Identity Status
                  </span>

                  <h3>
                    {identity.status || "ACTIVE"}
                  </h3>
                </div>

                <div className="identity-status-badge">
                  ● ACTIVE
                </div>

              </div>

              <div className="identity-grid">

                <div className="identity-card">
                  <span>Identity ID</span>
                  <strong>{identity.identityId}</strong>
                </div>

                <div className="identity-card">
                  <span>Name</span>
                  <strong>{identity.name}</strong>
                </div>

                <div className="identity-card">
                  <span>Organization</span>
                  <strong>{identity.organization}</strong>
                </div>

                <div className="identity-card">
                  <span>Role</span>
                  <strong>{identity.role}</strong>
                </div>

                <div className="identity-card">
                  <span>MSP</span>
                  <strong>{identity.mspId || "BELMSP"}</strong>
                </div>

                <div className="identity-card">
                  <span>Created At</span>
                  <strong>
                    {identity.createdAt
                      ? new Date(identity.createdAt).toLocaleString()
                      : "—"}
                  </strong>
                </div>

              </div>

              {/* DECENTRALIZED IDENTIFIER (DID) SECTION */}
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "12px",
                  padding: "22px",
                  marginBottom: "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    flexWrap: "wrap",
                    gap: "12px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        color: "var(--primary)",
                        textTransform: "uppercase",
                        marginBottom: "6px",
                      }}
                    >
                      Decentralized Identifier (DID)
                    </span>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "18px",
                        fontFamily: "monospace",
                        color: "var(--text-primary)",
                        wordBreak: "break-all",
                      }}
                    >
                      {identity.did || `did:chaincoder:${identity.organization}:${identity.identityId}`}
                    </h3>
                  </div>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        const val = identity.did || `did:chaincoder:${identity.organization}:${identity.identityId}`;
                        navigator.clipboard?.writeText(val);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-default)",
                        color: copied ? "var(--success)" : "var(--text-secondary)",
                        borderRadius: "6px",
                        padding: "6px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {copied ? "✓ Copied" : "📋 Copy DID"}
                    </button>

                    <Link
                      to={`/verify-identity?did=${encodeURIComponent(identity.did || `did:chaincoder:${identity.organization}:${identity.identityId}`)}`}
                      style={{
                        background: "rgba(37, 99, 235, 0.15)",
                        border: "1px solid var(--primary)",
                        color: "var(--primary)",
                        borderRadius: "6px",
                        padding: "6px 14px",
                        fontSize: "12px",
                        fontWeight: 600,
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      🔍 Verify DID
                    </Link>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "12px",
                    background: "var(--bg-surface)",
                    padding: "14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-subtle)",
                    marginBottom: "12px",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Organization</span>
                    <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>{identity.organization}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Role</span>
                    <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>{identity.role}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Ledger Status</span>
                    <strong style={{ fontSize: "13px", color: "var(--success)" }}>{identity.status || "ACTIVE"}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block" }}>Cryptographic Reference</span>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                      {identity.cryptographicReference || `fabric-ca::${identity.organization}MSP::${identity.identityId}`}
                    </span>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: "12px", color: "var(--text-muted)", lineHeight: "1.5" }}>
                  Decentralized Identifier used to represent this identity on the ChainCoder platform. It links your Fabric CA cryptographic membership to a verifiable on-chain identity record.
                </p>
              </div>

              <div className="identity-verification">

                <div>
                  <span className="identity-label">
                    Blockchain Verification
                  </span>

                  <h3>Identity Verified</h3>

                  <p>
                    This identity record was retrieved through the
                    ChainCoder backend from the blockchain network.
                  </p>
                </div>

                <div className="verified-badge">
                  ✓ VERIFIED
                </div>

              </div>
            </>
          )}

        </main>

      </section>

    </div>
  );
}

export default MyIdentity;