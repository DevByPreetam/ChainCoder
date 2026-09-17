import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { useNotifications } from "../../context/NotificationContext";
import {
  getNotificationMeta,
  formatNotificationTime,
} from "../../utils/notificationHelpers";
import Icon from "../common/Icon";

import "../../styles/notifications.css";

function Topbar({
  title = "Dashboard",
  subtitle = "Overview of your ChainCoder activity",
  onMenuClick = () => {},
}) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
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

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications();
      fetchUnreadCount();
    }
  };

  // Close notifications or profile on outside click or Escape
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setIsProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
    } else if (
      user?.role === "Auditor" ||
      user?.role === "Admin" ||
      user?.role === "Manager"
    ) {
      navigate("/approvals");
    } else {
      navigate("/notifications");
    }
  };

  const recentNotifications = notifications.slice(0, 5);

  return (
    <header className="topbar">
      {/* Left: Mobile hamburger + Page Titles */}
      <div className="topbar-left">
        <button
          type="button"
          className="topbar-menu-btn"
          onClick={onMenuClick}
          aria-label="Open navigation menu"
        >
          <Icon name="menu" size={20} />
        </button>

        <div className="topbar-titles">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>

      {/* Right: Network Status, Notification Bell, User Avatar */}
      <div className="topbar-right">
        {/* Live Blockchain Network Status Pill */}
        <div className="topbar-blockchain-pill" title="Hyperledger Fabric Channel Status">
          <span className="blockchain-dot" />
          <span>sihchannel · v2.10</span>
        </div>

        <div className="topbar-divider" />

        {/* Notifications Popover */}
        <div className="topbar-notification-wrapper" ref={popoverRef}>
          <button
            type="button"
            className={`notification-btn ${isOpen ? "active" : ""}`}
            onClick={handleToggle}
            title="Notifications"
            aria-label={`Notifications${
              unreadCount > 0 ? `, ${unreadCount} unread` : ""
            }`}
          >
            <Icon name="bell" size={18} />
            {unreadCount > 0 && <span className="notification-dot" />}
          </button>

          {/* Notification Popover Dropdown */}
          {isOpen && (
            <div className="notification-popover" role="dialog" aria-label="Recent notifications">
              <div className="popover-header">
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontWeight: "700", color: "#ffffff", fontSize: "14px" }}>
                    Notifications
                  </span>
                  {unreadCount > 0 && (
                    <span className="popover-badge">
                      {unreadCount} unread
                    </span>
                  )}
                </div>

                <Link
                  to="/notifications"
                  onClick={() => setIsOpen(false)}
                  className="popover-view-all-link"
                >
                  View all →
                </Link>
              </div>

              <div className="popover-list">
                {loading && (
                  <div className="popover-empty">
                    <p>Loading notifications...</p>
                  </div>
                )}

                {!loading && recentNotifications.length === 0 && (
                  <div className="popover-empty">
                    <Icon name="bell" size={28} color="#475569" />
                    <p style={{ marginTop: "8px" }}>No recent notifications</p>
                  </div>
                )}

                {!loading &&
                  recentNotifications.map((notif) => {
                    const meta = getNotificationMeta(notif, user);
                    return (
                      <div
                        key={notif.id}
                        className={`popover-item ${notif.read ? "read" : "unread"}`}
                        onClick={() => handleNotificationClick(notif)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && handleNotificationClick(notif)}
                      >
                        <span className="popover-item-icon">{meta.icon}</span>

                        <div className="popover-item-content">
                          <div className="popover-item-title">{notif.title}</div>
                          <div className="popover-item-body">{notif.message}</div>
                          <div className="popover-item-time">
                            {formatNotificationTime(notif.createdAt)}
                          </div>
                        </div>

                        {!notif.read && <span className="popover-item-unread-dot" />}
                      </div>
                    );
                  })}
              </div>

              <div className="popover-footer">
                <Link
                  to="/notifications"
                  onClick={() => setIsOpen(false)}
                  className="popover-footer-btn"
                >
                  Open Notification Center
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          <Icon name={isDark ? "sun" : "moon"} size={17} />
        </button>

        <div className="topbar-divider" />

        {/* User Profile Popover */}
        <div className="topbar-profile-wrapper" ref={profileRef}>
          <div
            className={`topbar-user ${isProfileOpen ? "active" : ""}`}
            onClick={() => setIsProfileOpen((prev) => !prev)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setIsProfileOpen((prev) => !prev)}
            aria-haspopup="true"
            aria-expanded={isProfileOpen}
            title={`Account: ${user?.name || "Participant"} (${user?.role})`}
          >
            <div className="topbar-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>

            <div className="topbar-user-info">
              <strong>{user?.name || "Participant"}</strong>
              <span className="topbar-user-role">{user?.organization} · {user?.role}</span>
            </div>

            <Icon
              name="chevron-down"
              size={13}
              className={`profile-chevron ${isProfileOpen ? "open" : ""}`}
            />
          </div>

          {/* Profile Popover Card */}
          {isProfileOpen && (
            <div className="profile-popover" role="dialog" aria-label="User profile details">
              <div className="profile-popover-header">
                <div className="profile-popover-avatar">
                  {user?.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
                <div className="profile-popover-meta">
                  <div className="profile-popover-name" title={user?.name}>
                    {user?.name || "Participant"}
                  </div>
                  <span className="profile-popover-role-badge">
                    {user?.role} · {user?.organization}
                  </span>
                </div>
              </div>

              <div className="profile-popover-id" title="Cryptographic Identity ID">
                <span>Identity: </span>
                <strong>{user?.userId || user?.username || "—"}</strong>
              </div>

              {user?.email && (
                <div className="profile-popover-email" title="User Email">
                  {user.email}
                </div>
              )}

              <div className="profile-popover-divider" />

              <button
                type="button"
                className="profile-popover-logout-btn"
                onClick={() => {
                  setIsProfileOpen(false);
                  logout();
                }}
              >
                <Icon name="logout" size={15} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Topbar;