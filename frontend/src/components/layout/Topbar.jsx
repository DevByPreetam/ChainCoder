import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import {
  getNotificationMeta,
  formatNotificationTime,
} from "../../utils/notificationHelpers";

import "../../styles/notifications.css";

function Topbar({
  title = "Dashboard",
  subtitle = "Overview of your ChainCoder activity",
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications();
      fetchUnreadCount();
    }
  };

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleNotificationClick = async (notif) => {
    if (!notif.read) {
      try {
        await markAsRead(notif.id);
      } catch (err) {
        console.error("Error marking notification as read:", err);
      }
    }

    setIsOpen(false);

    const meta = getNotificationMeta(notif, user);
    if (meta.targetPath) {
      navigate(meta.targetPath);
    }
  };

  const recentNotifications = notifications.slice(0, 5);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-notification-wrapper" ref={popoverRef}>
          <button
            className={`topbar-icon notification-btn ${isOpen ? "active" : ""}`}
            onClick={handleToggle}
            title="Notifications"
            aria-label={`Notifications${
              unreadCount > 0 ? `, ${unreadCount} unread` : ""
            }`}
            aria-expanded={isOpen}
            type="button"
          >
            🔔
            {unreadCount > 0 && (
              <span className="topbar-notification-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {isOpen && (
            <div className="notification-popover" role="dialog" aria-label="Notifications panel">
              <div className="popover-header">
                <span className="popover-header-title">Notifications</span>
                {unreadCount > 0 && (
                  <span className="popover-header-badge">
                    {unreadCount} unread
                  </span>
                )}
              </div>

              <div className="popover-list">
                {loading && notifications.length === 0 ? (
                  <div className="popover-loading">Loading notifications...</div>
                ) : recentNotifications.length === 0 ? (
                  <div className="popover-empty">No notifications</div>
                ) : (
                  recentNotifications.map((notif) => {
                    const meta = getNotificationMeta(notif, user);
                    const timeAgo = formatNotificationTime(notif.createdAt);

                    return (
                      <div
                        key={notif.id}
                        className={`popover-item ${!notif.read ? "unread" : ""}`}
                        onClick={() => handleNotificationClick(notif)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleNotificationClick(notif);
                          }
                        }}
                      >
                        <div className={`popover-item-icon ${meta.badgeClass}`}>
                          {meta.icon}
                        </div>
                        <div className="popover-item-body">
                          <div className="popover-item-title">
                            {notif.title}
                          </div>
                          {notif.message && (
                            <div className="popover-item-msg">
                              {notif.message}
                            </div>
                          )}
                          <div className="popover-item-meta">
                            <span>{timeAgo}</span>
                            {!notif.read && (
                              <span
                                className="popover-item-unread-dot"
                                title="Unread"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="popover-footer">
                <Link
                  to="/notifications"
                  className="popover-view-all"
                  onClick={() => setIsOpen(false)}
                >
                  View all notifications →
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="topbar-divider"></div>

        <div className="topbar-user">
          <div className="topbar-avatar">{user?.name?.charAt(0) || "U"}</div>

          <div className="topbar-user-info">
            <strong>{user?.name}</strong>
            <span>
              {user?.organization} · {user?.role}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;