import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Icon from "../../components/common/Icon";
import "../../styles/login.css";

const DEMO_ACCOUNTS = [
  { id: "BEL001", pass: "BelAdmin@123", label: "BEL Admin", org: "BEL (Admin)" },
  { id: "BEL002", pass: "BelManager@123", label: "BEL Manager", org: "BEL (Manager)" },
  { id: "AUD001", pass: "Auditor@123", label: "Auditor Lead", org: "Auditor Org" },
  { id: "CON001", pass: "ContractorAdmin@123", label: "Contractor Admin", org: "Contractor Org" },
];

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      await login(userId, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Invalid user ID or password");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (acc) => {
    setUserId(acc.id);
    setPassword(acc.pass);
    setError("");
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Left: Brand Presentation */}
        <div className="login-brand">
          <div className="brand-badge-pill">
            <Icon name="shield" size={14} color="#60a5fa" />
            <span>SIH 2026 DEFENSE INNOVATION</span>
          </div>

          <div className="login-logo-wrap">
            <Icon name="shield" size={28} color="#ffffff" />
          </div>

          <h1>ChainCoder</h1>

          <p>
            Enterprise defense platform for decentralized identity lifecycle management, multi-party access control governance, and tamper-evident digital asset provenance.
          </p>

          <div className="login-feature-list">
            <div className="login-feature-item">
              <Icon name="check" size={16} />
              <span>Hyperledger Fabric v2.10 Multi-Organization Consensus</span>
            </div>
            <div className="login-feature-item">
              <Icon name="check" size={16} />
              <span>Fabric CA Certificate Lifecycle & W3C DIDs</span>
            </div>
            <div className="login-feature-item">
              <Icon name="check" size={16} />
              <span>IPFS Document Pinning & SHA-256 Cryptographic Anchoring</span>
            </div>
          </div>
        </div>

        {/* Right: Login Card */}
        <div className="login-card">
          <div className="login-card-header">
            <h2>Participant Sign In</h2>
            <p className="login-subtitle">
              Authenticate using your organizational credentials
            </p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="login-form-group">
              <label className="form-label">User ID / Identity ID</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. BEL001, AUD001, CON001"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                autoComplete="username"
                required
                disabled={loading}
              />
            </div>

            <div className="login-form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter your security password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="login-error">
                <Icon name="alert" size={16} />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary login-submit-btn"
              disabled={loading || !userId.trim() || !password.trim()}
            >
              {loading ? "Authenticating via Fabric..." : "Authenticate Session"}
            </button>
          </form>

          {/* Quick Demo Credential Filler */}
          <div className="demo-accounts-section">
            <div className="demo-accounts-title">
              <span>Demo Quick-Fill Credentials</span>
              <span style={{ fontSize: "9px", color: "var(--primary-light)" }}>1-Click</span>
            </div>

            <div className="demo-pills-grid">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  className="demo-account-btn"
                  onClick={() => handleQuickFill(acc)}
                  disabled={loading}
                  title={`Fill ${acc.id}`}
                >
                  <strong>{acc.label}</strong>
                  <span>{acc.id} · {acc.org}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Public Verification Links */}
          <div className="login-footer-links">
            <Link to="/verify" className="login-public-link">
              <Icon name="search" size={14} />
              <span>Public Digital Asset Verification (No Login Required) →</span>
            </Link>

            <Link to="/verify-identity" className="login-public-link" style={{ color: "var(--info)" }}>
              <Icon name="identity" size={14} />
              <span>Public W3C DID Resolver & Verification →</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;