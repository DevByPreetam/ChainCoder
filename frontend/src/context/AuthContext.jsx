import { createContext, useContext, useEffect, useState } from "react";
import { loginUser } from "../services/authService";

const AuthContext = createContext(null);

function parseJwt(jwtToken) {
  if (!jwtToken || typeof jwtToken !== "string") return null;
  try {
    const parts = jwtToken.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function isTokenValid(jwtToken) {
  const payload = parseJwt(jwtToken);
  if (!payload || !payload.userId) return false;
  // Check token expiration (payload.exp is in seconds)
  if (payload.exp && payload.exp * 1000 <= Date.now()) {
    return false;
  }
  return true;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = () => {
    localStorage.removeItem("chaincoder_token");
    localStorage.removeItem("chaincoder_user");
    sessionStorage.removeItem("chaincoder_session_active");
    sessionStorage.removeItem("chaincoder_active_user");
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("chaincoder_token");
    const storedUser = localStorage.getItem("chaincoder_user");
    const sessionActive = sessionStorage.getItem("chaincoder_session_active");

    // Require an active browser session AND a non-expired, valid JWT token
    if (sessionActive === "true" && storedToken && storedUser && isTokenValid(storedToken)) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      } catch (error) {
        console.error("Failed to restore session:", error);
        clearSession();
      }
    } else {
      // If user has not logged in during this session, or token is expired -> reset
      clearSession();
    }

    setLoading(false);
  }, []);

  // Listen for global 401 Unauthorized events from any API call
  useEffect(() => {
    const handleUnauthorized = () => {
      clearSession();
    };

    window.addEventListener("chaincoder:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("chaincoder:unauthorized", handleUnauthorized);
    };
  }, []);

  const login = async (userId, password) => {
    const data = await loginUser(userId, password);

    // Save token and user, and mark this browser session as actively authenticated
    sessionStorage.setItem("chaincoder_session_active", "true");
    sessionStorage.setItem("chaincoder_active_user", data.user?.userId || userId);
    localStorage.setItem("chaincoder_token", data.token);
    localStorage.setItem("chaincoder_user", JSON.stringify(data.user));

    setToken(data.token);
    setUser(data.user);

    return data;
  };

  const logout = () => {
    clearSession();
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated: !!token && !!user,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}