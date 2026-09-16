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

function formatActivityTime(isoString) {
  if (!isoString) return "Recently";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "Recently";

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) {
    return `Today, ${timeStr}`;
  }
  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  const dateStr = date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
  return `${dateStr}, ${timeStr}`;
}

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

        // 4. Blockchain Events & Recent Activity (Real Fabric ledger + live system activity)
        let recentActs = [];
        let eventCount = 0;

        try {
          const acts = await getRecentActivities();
          if (Array.isArray(acts) && acts.length > 0) {
            eventCount = acts.length;
            recentActs = acts.slice(0, 7).map((t) => ({
              action: t.action || "Blockchain Transaction",
              resource: t.resource || "Hyperledger Fabric",
              status: t.status || "SUCCESS",
              time: formatActivityTime(t.timestamp),
              txId: t.txId,
            }));
          }
        } catch (err) {
          console.warn("Could not fetch recent activities from /api/audit/recent:", err);
        }

        // Fallback for auditor transactions if recent activities empty
        if (recentActs.length === 0 && user?.organization === "Auditor" && user?.role === "Auditor") {
          try {
            const txs = await getAuditorTransactions();
            if (Array.isArray(txs)) {
              eventCount = Math.max(eventCount, txs.length);
              recentActs = txs.slice(0, 7).map((t) => ({
                action: t.action ? t.action.replace(/_/g, " ") : "Transaction Executed",
                resource: t.resourceId || t.resourceType || "Hyperledger Fabric",
                status: t.success ? "SUCCESS" : "FAILED",
                time: formatActivityTime(t.timestamp),
                txId: t.transactionId || null,
              }));
            }
          } catch {
            // Fallback to notifications
          }
        }

        // Fallback to notifications if still empty
        if (recentActs.length === 0) {
          try {
            const notifs = await getNotifications();
            if (Array.isArray(notifs)) {
              eventCount = Math.max(eventCount, notifs.length);
              recentActs = notifs.slice(0, 7).map((n) => ({
                action: n.title || n.type?.replace(/_/g, " ") || "Blockchain Update",
                resource: n.resourceId || n.resourceType || n.message || "Ledger",
                status: "SUCCESS",
                time: formatActivityTime(n.createdAt),
                txId: null,
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