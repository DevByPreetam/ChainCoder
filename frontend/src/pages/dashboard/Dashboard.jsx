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
import { getAuditorTransactions } from "../../services/auditorService";

import "../../styles/layout.css";
import "../../styles/dashboard.css";

const KNOWN_ASSETS = ["ASSET001", "ASSET002", "ASSET003", "AST-002"];
const KNOWN_IDENTITIES = ["BEL001", "BEL002", "BEL003", "AUD001", "CON001", "CON002"];

function Dashboard() {
  const { user } = useAuth();

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
          // Auditor inspects all active relationships across known identities
          for (const id of KNOWN_IDENTITIES) {
            for (const astId of KNOWN_ASSETS) {
              try {
                const acc = await getAccess(id, astId);
                if (acc?.hasAccess) accessCount++;
              } catch {
                // Ignore
              }
            }
          }
        } else {
          // Check active grants for current user
          for (const astId of KNOWN_ASSETS) {
            try {
              const acc = await getAccess(user?.userId, astId);
              if (acc?.hasAccess) accessCount++;
            } catch {
              // Ignore
            }
          }
        }

        // 3. Pending Approvals
        let pendingCount = 0;
        try {
          const pending = await getPendingAccessRequests();
          if (Array.isArray(pending)) {
            pendingCount = pending.filter((r) => r.status === "PENDING").length;
          }
        } catch {
          // If role cannot view pending requests, leave 0
        }

        // 4. Blockchain Events & Recent Activity
        let recentActs = [];
        let eventCount = 0;

        if (user?.organization === "Auditor" && user?.role === "Auditor") {
          try {
            const txs = await getAuditorTransactions();
            if (Array.isArray(txs)) {
              eventCount = txs.length;
              recentActs = txs.slice(0, 5).map((t) => ({
                action: t.action ? t.action.replace(/_/g, " ") : "Transaction Executed",
                resource: t.resourceId || t.resourceType || "Hyperledger Fabric",
                status: t.success ? "SUCCESS" : "FAILED",
                time: t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently",
              }));
            }
          } catch {
            // Fallback to notifications
          }
        }

        // Fallback for non-auditors or if empty: use real-time notification stream
        if (recentActs.length === 0) {
          try {
            const notifs = await getNotifications();
            if (Array.isArray(notifs)) {
              eventCount = Math.max(eventCount, notifs.length);
              recentActs = notifs.slice(0, 5).map((n) => ({
                action: n.title || n.type?.replace(/_/g, " ") || "Blockchain Update",
                resource: n.resourceId || n.resourceType || n.message || "Ledger",
                status: "SUCCESS",
                time: n.createdAt ? new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently",
              }));
            }
          } catch {
            // Ignore
          }
        }

        if (isMounted) {
          setStats({
            myAssets: assetCount,
            activeAccess: accessCount,
            pendingApprovals: pendingCount,
            blockchainEvents: Math.max(eventCount, assetCount + accessCount),
          });
          setActivities(recentActs);
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

      <Sidebar />

      <section className="main-area">

        <Topbar />

        <main className="main-content">

          <div className="dashboard-welcome">
            <h2>Welcome to ChainCoder</h2>

            <p>
              Monitor identities, digital assets, access permissions,
              and blockchain activity.
            </p>
          </div>

          <div className="stats-grid">

            <StatCard
              title="My Assets"
              value={loading ? "…" : stats.myAssets.toString()}
              description="Digital assets under your access"
              icon="◆"
            />

            <StatCard
              title="Active Access"
              value={loading ? "…" : stats.activeAccess.toString()}
              description="Currently active permissions"
              icon="⇄"
            />

            <StatCard
              title="Pending Approvals"
              value={loading ? "…" : stats.pendingApprovals.toString()}
              description="Requests waiting for action"
              icon="✓"
            />

            <StatCard
              title="Blockchain Events"
              value={loading ? "…" : stats.blockchainEvents.toString()}
              description="Recent recorded transactions"
              icon="▤"
            />

          </div>

          <QuickActions />

          <ActivityTable activities={activities} />

        </main>

      </section>

    </div>
  );
}

export default Dashboard;