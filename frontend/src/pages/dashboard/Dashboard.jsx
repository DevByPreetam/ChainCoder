import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import StatCard from "../../components/dashboard/StatCard";
import QuickActions from "../../components/dashboard/QuickActions";
import ActivityTable from "../../components/dashboard/ActivityTable";
import { getAsset } from "../../services/assetService";
import { getAccess } from "../../services/accessService";
import { getPendingAccessRequests } from "../../services/accessRequestService";
import { getNotifications } from "../../services/notificationService";
import { getAuditorTransactions, getRecentActivities } from "../../services/auditorService";
import Icon from "../../components/common/Icon";

import "../../styles/layout.css";
import "../../styles/dashboard.css";

const KNOWN_ASSETS = [
  "AST-FINAL-AUDIT-01",
  "AST-NFT-99",
  "AST-001",
  "AST-002",
  "ASSET001",
  "ASSET002",
  "ASSET003",
];
const KNOWN_IDENTITIES = ["BEL001", "BEL002", "BEL003", "AUD001", "CON001", "CON002"];

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchDashboardMetrics() {
      try {
        setLoading(true);

        // 1. My Assets count (accessible to current user)
        let assetCount = 0;
        for (const astId of KNOWN_ASSETS) {
          try {
            const a = await getAsset(astId);
            if (a?.assetId) {
              assetCount++;
            }
          } catch {
            // Not accessible or not found
          }
        }

        // 2. Active Access permissions count
        let accessCount = 0;
        if (user?.role === "Auditor") {
          for (const ident of KNOWN_IDENTITIES) {
            for (const astId of KNOWN_ASSETS.slice(0, 3)) {
              try {
                const acc = await getAccess(ident, astId);
                if (acc && acc.status === "ACTIVE") {
                  accessCount++;
                }
              } catch {
                // Not found
              }
            }
          }
        } else {
          for (const astId of KNOWN_ASSETS) {
            try {
              const acc = await getAccess(user?.userId, astId);
              if (acc && acc.status === "ACTIVE") {
                accessCount++;
              }
            } catch {
              // Not found
            }
          }
        }

        // 3. Pending approvals count
        let pendingCount = 0;
        try {
          const pendingList = await getPendingAccessRequests();
          if (Array.isArray(pendingList)) {
            pendingCount = pendingList.length;
          }
        } catch {
          // Not accessible
        }

        // 4. Real blockchain activity & transaction events
        let eventList = [];
        try {
          if (user?.role === "Auditor") {
            const txs = await getAuditorTransactions();
            if (Array.isArray(txs)) {
              eventList = txs.map((tx) => ({
                action: tx.action || tx.type || "Transaction",
                resource: tx.resourceId || tx.assetId || tx.identityId || "Platform",
                status: tx.status || (tx.success ? "SUCCESS" : "CONFIRMED"),
                time: tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString() : "Recent",
                txId: tx.txId || tx.transactionId || null,
              }));
            }
          } else {
            const rawAct = await getRecentActivities();
            if (Array.isArray(rawAct)) {
              eventList = rawAct.map((item) => ({
                action: item.title || item.action || "Ledger Event",
                resource: item.resourceId || item.assetId || "Blockchain",
                status: item.status || "CONFIRMED",
                time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : "Recent",
                txId: item.txId || null,
              }));
            }
          }
        } catch {
          // Fallback to notifications
          try {
            const notifs = await getNotifications();
            if (Array.isArray(notifs)) {
              eventList = notifs.slice(0, 5).map((n) => ({
                action: n.title || "Notification",
                resource: n.resourceId || "Account",
                status: "ACTIVE",
                time: n.createdAt ? new Date(n.createdAt).toLocaleTimeString() : "Recent",
                txId: null,
              }));
            }
          } catch {
            // Keep empty
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

          {/* 4-Stat Metric Cards */}
          <div className="stats-grid">
            <StatCard
              title="Accessible Assets"
              value={loading ? "…" : stats.myAssets.toString()}
              description="NFT tokens & defense specs verified"
              iconName="assets"
              trend="ACTIVE"
            />

            <StatCard
              title="Active Permissions"
              value={loading ? "…" : stats.activeAccess.toString()}
              description="Cryptographic access grants"
              iconName="access"
              trend="CONFIRMED"
            />

            <StatCard
              title="Pending Approvals"
              value={loading ? "…" : stats.pendingApprovals.toString()}
              description="Two-tier governance requests"
              iconName="approvals"
              trend={stats.pendingApprovals > 0 ? "ACTION REQUIRED" : "CLEAR"}
            />

            <StatCard
              title="Audited Events"
              value={loading ? "…" : stats.blockchainEvents.toString()}
              description="Ledger transactions in current view"
              iconName="history"
              trend="VERIFIED"
            />
          </div>

          {/* Dynamic Role-Based Quick Actions */}
          <QuickActions />

          {/* Recent Blockchain Activity Table */}
          <ActivityTable activities={activities} />
        </main>
      </section>
    </div>
  );
}

export default Dashboard;