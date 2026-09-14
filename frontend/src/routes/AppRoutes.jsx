import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import Login from "../pages/auth/Login";
import Dashboard from "../pages/dashboard/Dashboard";
import MyIdentity from "../pages/identity/MyIdentity";
import MyAssets from "../pages/assets/MyAssets";
import AssetDetails from "../pages/assets/AssetDetails";
import MintAsset from "../pages/assets/MintAsset";

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/identity"
        element={
            <ProtectedRoute>
                <MyIdentity />
            </ProtectedRoute>
        }
        />
      <Route
        path="/assets"
        element={
          <ProtectedRoute>
            <MyAssets />
          </ProtectedRoute>
        }
      />
      {/* /assets/mint must come before /assets/:assetId to prevent "mint" being treated as an assetId */}
      <Route
        path="/assets/mint"
        element={
          <ProtectedRoute>
            <MintAsset />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId"
        element={
          <ProtectedRoute>
            <AssetDetails />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={<Navigate to="/dashboard" replace />}
      />
    </Routes>
  );
}

export default AppRoutes;