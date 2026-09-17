import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import StatCard from "../../components/dashboard/StatCard";
import QuickActions from "../../components/dashboard/QuickActions";
import ActivityTable from "../../components/dashboard/ActivityTable";
import {
  getAllMintProposals,
  getPendingMintProposals,
} from "../../services/assetService";
import {
  getPendingAccessRequests,
  getMyAccessRequests,
  getAuditorAccessRequests,
} from "../../services/accessRequestService";
import {
  getAuditorAssets,
  getAuditorAccess,
  getAuditorTransactions,
  getRecentActivities,
} from "../../services/auditorService";
import { getRecentAssets } from "../../utils/recentAssets";
import Icon from "../../components/common/Icon";

import "../../styles/layout.css";
import "../../styles/dashboard.css";

function Dashboard() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [stats, setStats] = useState({
    myAssets: 0,
    activeAccess: 0,
    pendingApprovals: 0,
    blockchainEvents: 0,
  });
  const [activities, setActivities] = useState([]);
  const [recentAssetsList, setRecentAssetsList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchDashboardMetrics() {
      try {
        setLoading(true);

        const isAuditor = user?.organization === "Auditor" && user?.role === "Auditor";
        const isBel = user?.organization === "BEL";
        const recent = getRecentAssets();
        if (isMounted) setRecentAssetsList(recent);

        let assetCount = 0;
        let accessCount = 0;
        let pendingCount = 0;
        let eventList = [];

        if (isAuditor) {
          // 1. Auditor Data
          const [assetsRes, accessRes, pendingMintRes, auditReqsRes, txsRes] =
            await Promise.allSettled([
              getAuditorAssets(),
              getAuditorAccess(),
              getPendingMintProposals(),
              getAuditorAccessRequests(),
              getAuditorTransactions(),
            ]);

          if (assetsRes.status === "fulfilled") {
            const list = assetsRes.value?.assets || [];
            assetCount = list.filter((a) => !a.error).length;
          }

          if (accessRes.status === "fulfilled") {
            const list = accessRes.value?.access || [];
            accessCount = list.filter((a) => a.status === "ACTIVE").length;
          }

          let pendingMintCount = 0;
          if (pendingMintRes.status === "fulfilled") {
            const list = pendingMintRes.value || [];
            pendingMintCount = Array.isArray(list) ? list.length : 0;
          }

          let pendingReqCount = 0;
          if (auditReqsRes.status === "fulfilled") {
            const list = auditReqsRes.value?.requests || auditReqsRes.value || [];
            pendingReqCount = Array.isArray(list)
              ? list.filter((r) => r.status === "BEL_APPROVED" || r.status === "PENDING").length
              : 0;
          }
          pendingCount = pendingMintCount + pendingReqCount;

          if (txsRes.status === "fulfilled") {
            const list = txsRes.value?.transactions || txsRes.value || [];
            if (Array.isArray(list)) {
              eventList = list.slice(0, 8).map((tx) => ({
                action: tx.action || tx.type || "Transaction",
                resource: tx.resourceId || tx.assetId || tx.identityId || "Platform",
                status: tx.status || (tx.success ? "SUCCESS" : "CONFIRMED"),
                time: tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString() : "Recent",
                txId: tx.txId || tx.transactionId || null,
              }));
            }
          }
        } else if (isBel) {
          // 2. BEL Admin / Manager / Employee Data
          const [proposalsRes, pendingReqsRes, pendingMintRes, activitiesRes] =
            await Promise.allSettled([
              getAllMintProposals(),
              getPendingAccessRequests(),
              getPendingMintProposals(),
              getRecentActivities(),
            ]);

          if (proposalsRes.status === "fulfilled") {
            const proposals = proposalsRes.value || [];
            if (Array.isArray(proposals)) {
              const approvedIds = new Set(
                proposals
                  .filter((p) => p.status === "APPROVED" && p.assetId)
                  .map((p) => p.assetId)
              );
              assetCount = approvedIds.size || recent.length;
            }
          } else {
            assetCount = recent.length;
          }

          let pendingReqCount = 0;
          if (pendingReqsRes.status === "fulfilled") {
            const list = pendingReqsRes.value || [];
            pendingReqCount = Array.isArray(list) ? list.length : 0;
          }

          let pendingMintCount = 0;
          if (pendingMintRes.status === "fulfilled") {
            const list = pendingMintRes.value || [];
            pendingMintCount = Array.isArray(list) ? list.length : 0;
          }
          pendingCount = pendingReqCount + pendingMintCount;

          if (activitiesRes.status === "fulfilled") {
            const rawAct = activitiesRes.value?.activities || activitiesRes.value || [];
            if (Array.isArray(rawAct)) {
              eventList = rawAct.slice(0, 8).map((item) => ({
                action: item.title || item.action || "Ledger Event",
                resource: item.resourceId || item.assetId || "Blockchain",
                status: item.status || "CONFIRMED",
                time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "Recent",
                txId: item.txId || null,
              }));
            }
          }
        } else {
          // 3. Contractor / Other Organization
          const [myReqsRes, activitiesRes] = await Promise.allSettled([
            getMyAccessRequests(),
            getRecentActivities(),
          ]);

          if (myReqsRes.status === "fulfilled") {
            const reqs = myReqsRes.value?.requests || myReqsRes.value || [];
            if (Array.isArray(reqs)) {
              accessCount = reqs.filter((r) => r.status === "ACTIVE" || r.status === "APPROVED").length;
              pendingCount = reqs.filter((r) => r.status === "PENDING" || r.status === "BEL_APPROVED").length;
              const uniqueAssetIds = new Set(reqs.map((r) => r.assetId));
              assetCount = uniqueAssetIds.size || recent.length;
            }
          } else {
            assetCount = recent.length;
          }

          if (activitiesRes.status === "fulfilled") {
            const rawAct = activitiesRes.value?.activities || activitiesRes.value || [];
            if (Array.isArray(rawAct)) {
              eventList = rawAct.slice(0, 8).map((item) => ({
                action: item.title || item.action || "Ledger Event",
                resource: item.resourceId || item.assetId || "Blockchain",
                status: item.status || "CONFIRMED",
                time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "Recent",
                txId: item.txId || null,
              }));
            }
          }
        }

        if (isMounted) {
          setStats({
            myAssets: assetCount,
            activeAccess: accessCount,
            pendingApprovals: pendingCount,
            blockchainEvents: eventList.length,
          });
          setActivities(eventList);
        }
      } catch (err) {
        console.error("Dashboard metrics error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (user?.userId) {
      fetchDashboardMetrics();
    }

    return () => {
      isMounted = false;
    };
  }, [user?.userId, user?.role, user?.organization]);

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Security Operations Console"
          subtitle={`Welcome back, ${user?.name || "Participant"} · ${user?.organization} ${user?.role}`}
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          {/* Welcome Banner */}
          <div className="dashboard-welcome">
            <div className="welcome-text">
              <h2>Welcome to ChainCoder Defense Platform</h2>
              <p>
                Decentralized identity governance, role-based access control, and cryptographic asset integrity anchored on Hyperledger Fabric.
              </p>
            </div>

            <div className="welcome-network-status">
              <div className="status-card-pill">
                <Icon name="database" size={14} color="#3b82f6" />
                <span>Channel: <strong>sihchannel</strong></span>
              </div>
              <div className="status-card-pill">
                <Icon name="shield" size={14} color="#10b981" />
                <span>Node: <strong>{user?.organization}MSP</strong></span>
              </div>
            </div>
          </div>

          {/* 4-Stat Metric Cards with Distinct Color Signatures */}
          <div className="stats-grid">
            <StatCard
              title="Accessible Assets"
              value={loading ? "…" : stats.myAssets.toString()}
              description="NFT tokens & defense specs verified"
              iconName="assets"
              trend="ACTIVE"
              variant="cyan"
            />

            <StatCard
              title="Active Permissions"
              value={loading ? "…" : stats.activeAccess.toString()}
              description="Cryptographic access grants"
              iconName="access"
              trend="CONFIRMED"
              variant="purple"
            />

            <StatCard
              title="Pending Approvals"
              value={loading ? "…" : stats.pendingApprovals.toString()}
              description="Two-tier governance requests"
              iconName="approvals"
              trend={stats.pendingApprovals > 0 ? "ACTION REQUIRED" : "CLEAR"}
              variant="amber"
            />

            <StatCard
              title="Audited Events"
              value={loading ? "…" : stats.blockchainEvents.toString()}
              description="Ledger transactions in current view"
              iconName="history"
              trend="VERIFIED"
              variant="emerald"
            />
          </div>

          {/* Dynamic Role-Based Quick Actions */}
          <QuickActions />

          {/* Recently Viewed Assets */}
          {recentAssetsList.length > 0 && (
            <div className="dashboard-section" style={{ marginBottom: "24px" }}>
              <div className="section-header">
                <div>
                  <h3>Recently Viewed / Queried Assets</h3>
                  <p>Quick access to ledger defense assets you recently inspected</p>
                </div>
                <Link to="/assets" className="btn btn-outline" style={{ fontSize: "12px", padding: "6px 12px" }}>
                  <span>All Assets</span>
                  <Icon name="arrow-right" size={14} />
                </Link>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "12px" }}>
                {recentAssetsList.slice(0, 4).map((ast) => (
                  <Link
                    key={ast.assetId}
                    to={`/assets/${encodeURIComponent(ast.assetId)}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      padding: "14px",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                    className="recent-asset-quick-card"
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: "700", color: "var(--primary-light)", fontSize: "13px" }}>
                        {ast.assetId}
                      </span>
                      <span className="badge badge-active" style={{ fontSize: "10px" }}>
                        {ast.status || "ACTIVE"}
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {ast.name || ast.assetId}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Owner: {ast.ownerOrganization || ast.owner || "—"}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Recent Blockchain Activity Table */}
          <ActivityTable activities={activities} />
        </main>
      </section>
    </div>
  );
}

export default Dashboard;