import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import {
  getNotificationMeta,
  formatNotificationTime,
  formatNotificationDate,
} from "../../utils/notificationHelpers";

import "../../styles/layout.css";
import "../../styles/notifications.css";

function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
  } = useNotifications();

  const [filter, setFilter] = useState("ALL");
  const [markingReadId, setMarkingReadId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
  }, [fetchNotifications, fetchUnreadCount]);

  const handleRefresh = async () => {
    setActionError(null);
    await Promise.all([fetchNotifications(), fetchUnreadCount()]);
  };

  const handleMarkAsRead = async (notificationId) => {
    setActionError(null);
    setMarkingReadId(notificationId);
    try {
      await markAsRead(notificationId);
    } catch (err) {
      setActionError(err.message || "Failed to mark notification as read");
    } finally {
      setMarkingReadId(null);
    }
  };

  const handleNavigate = (path) => {
    if (path) {
      navigate(path);
    }
  };

  const filteredNotifications =
    filter === "UNREAD"
      ? notifications.filter((notif) => !notif.read)
      : notifications;

  return (
    <div className="app-layout">
      <Sidebar
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      <section className="main-area">
        <Topbar
          title="Notifications"
          subtitle="Review system events, access requests, and security updates"
          onMenuClick={() => setMobileMenuOpen(true)}
        />

        <main className="main-content">
          <div className="notifications-header">
            <div>
              <h2 className="notifications-title">Notification Center</h2>
              <p className="notifications-subtitle">
                Stay informed with real-time audit, access, and asset
                notifications across the platform.
              </p>
            </div>

            <div className="notifications-actions">
              <button
                type="button"
                className="notifications-refresh-btn"
                onClick={handleRefresh}
                disabled={loading}
              >
                <span>↻</span>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {(error || actionError) && (
            <div className="notifications-error">
              <span>⚠️ {error || actionError}</span>
              <button
                type="button"
                className="notifications-error-retry"
                onClick={handleRefresh}
              >
                Retry
              </button>
            </div>
          )}

          <div className="notifications-toolbar">
            <div className="filter-pills">
              <button
                type="button"
                className={`filter-pill ${filter === "ALL" ? "active" : ""}`}
                onClick={() => setFilter("ALL")}
              >
                All
                <span className="filter-pill-badge">
                  ({notifications.length})
                </span>
              </button>

              <button
                type="button"
                className={`filter-pill ${
                  filter === "UNREAD" ? "active" : ""
                }`}
                onClick={() => setFilter("UNREAD")}
              >
                Unread
                <span className="filter-pill-badge">({unreadCount})</span>
              </button>
            </div>

            <div className="notifications-summary">
              Showing {filteredNotifications.length} of {notifications.length}{" "}
              notifications
            </div>
          </div>

          {loading && notifications.length === 0 ? (
            <div className="notifications-loading">
              Loading notifications...
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="notifications-empty">
              <span className="notifications-empty-icon">
                {filter === "UNREAD" ? "✓" : "🔔"}
              </span>
              <h3>
                {filter === "UNREAD"
                  ? "You're all caught up!"
                  : "No notifications yet"}
              </h3>
              <p>
                {filter === "UNREAD"
                  ? "You have no unread notifications right now."
                  : "Notifications for system events and requests will appear here."}
              </p>
            </div>
          ) : (
            <div className="notification-list">
              {filteredNotifications.map((notif) => {
                const meta = getNotificationMeta(notif, user);
                const isItemMarking = markingReadId === notif.id;

                return (
                  <div
                    key={notif.id}
                    className={`notification-card ${
                      !notif.read ? "unread" : "read"
                    }`}
                  >
                    <div
                      className={`notification-card-icon ${meta.badgeClass}`}
                    >
                      {meta.icon}
                    </div>

                    <div className="notification-card-content">
                      <div className="notification-card-top">
                        <span
                          className={`notif-badge ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>

                        {!notif.read ? (
                          <span className="status-unread-pill">UNREAD</span>
                        ) : (
                          <span className="status-read-pill">READ</span>
                        )}
                      </div>

                      <h4 className="notification-card-title">
                        {notif.title}
                      </h4>

                      {notif.message && (
                        <p className="notification-card-msg">
                          {notif.message}
                        </p>
                      )}

                      <div className="notification-card-bottom">
                        <div className="notification-card-meta">
                          <span
                            className="notification-time"
                            title={formatNotificationDate(notif.createdAt)}
                          >
                            🕒 {formatNotificationTime(notif.createdAt)}
                          </span>

                          {(notif.resourceType || notif.resourceId) && (
                            <span className="resource-tag">
                              {notif.resourceType &&
                                `${notif.resourceType}: `}
                              {notif.resourceId || "N/A"}
                            </span>
                          )}
                        </div>

                        <div className="notification-card-actions">
                          {!notif.read && (
                            <button
                              type="button"
                              className="mark-read-btn"
                              onClick={() => handleMarkAsRead(notif.id)}
                              disabled={isItemMarking}
                            >
                              {isItemMarking ? "Marking..." : "✓ Mark as Read"}
                            </button>
                          )}

                          {meta.targetPath && (
                            <button
                              type="button"
                              className="navigate-btn"
                              onClick={() => handleNavigate(meta.targetPath)}
                            >
                              Go to Resource →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

export default Notifications;
