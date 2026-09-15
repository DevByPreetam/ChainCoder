import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../styles/login.css";

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

  return (
    <div className="login-page">
      <div className="login-container">

        <div className="login-brand">
          <div className="brand-logo">C</div>

          <h1>ChainCoder</h1>

          <p>
            Blockchain-Based Secure Platform
            <br />
            for Identity & Digital Assets
          </p>
        </div>

        <div className="login-card">
          <h2>Welcome Back</h2>

          <p className="login-subtitle">
            Sign in to your ChainCoder account
          </p>

          <form onSubmit={handleLogin}>

            <div className="form-group">
              <label>User ID</label>

              <input
                type="text"
                placeholder="Enter your user ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>

              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="login-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? "Signing In..." : "Sign In"}
            </button>

          </form>

          <div className="login-footer">
            <span>Secure access powered by</span>
            <strong> Hyperledger Fabric</strong>
          </div>

          <div style={{ marginTop: "18px", textAlign: "center" }}>
            <Link
              to="/verify"
              style={{
                color: "#60a5fa",
                fontSize: "13px",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>🔍</span> Verify a digital asset publicly →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Login;