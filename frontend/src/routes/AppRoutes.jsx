import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import Login from "../pages/auth/Login";
import Dashboard from "../pages/dashboard/Dashboard";
import MyIdentity from "../pages/identity/MyIdentity";
import MyAssets from "../pages/assets/MyAssets";
import AssetDetails from "../pages/assets/AssetDetails";
import AssetTransactionPage from "../pages/assets/AssetTransactionPage";
import MintAsset from "../pages/assets/MintAsset";
import AccessManagement from "../pages/access/AccessManagement";
import AccessRequests from "../pages/access/AccessRequests";
import Approvals from "../pages/approvals/Approvals";
import IdentityManagement from "../pages/identity/IdentityManagement";
import AuditorDashboard from "../pages/auditor/AuditorDashboard";
import AuditHistory from "../pages/audit/AuditHistory";
import Notifications from "../pages/notifications/Notifications";
import PublicVerification from "../pages/verification/PublicVerification";
import PublicIdentityVerification from "../pages/verification/PublicIdentityVerification";
import Settings from "../pages/settings/Settings";
import BlockchainLanding from "../pages/landing/BlockchainLanding";

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
      <Route path="/" element={<BlockchainLanding />} />
      <Route path="/explorer" element={<BlockchainLanding />} />
      <Route path="/simulation" element={<BlockchainLanding />} />
      <Route path="/login" element={<Login />} />
      <Route path="/verify" element={<PublicVerification />} />
      <Route path="/verify-identity" element={<PublicIdentityVerification />} />

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
        path="/identities"
        element={
          <ProtectedRoute>
            <IdentityManagement />
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
        path="/access"
        element={
          <ProtectedRoute>
            <AccessManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/access-requests"
        element={
          <ProtectedRoute>
            <AccessRequests />
          </ProtectedRoute>
        }
      />
      <Route
        path="/access/requests"
        element={
          <ProtectedRoute>
            <AccessRequests />
          </ProtectedRoute>
        }
      />
      <Route
        path="/approvals"
        element={
          <ProtectedRoute>
            <Approvals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditor"
        element={
          <ProtectedRoute>
            <AuditorDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-history"
        element={
          <ProtectedRoute>
            <AuditHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit"
        element={
          <ProtectedRoute>
            <AuditHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <Notifications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/transaction/:txId"
        element={
          <ProtectedRoute>
            <AssetTransactionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assets/:assetId/transaction/:transactionId"
        element={
          <ProtectedRoute>
            <AssetTransactionPage />
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
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
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