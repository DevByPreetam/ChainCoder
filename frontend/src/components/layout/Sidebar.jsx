import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useSidebar } from "../../context/SidebarContext";
import { useNotifications } from "../../context/NotificationContext";
import Icon from "../common/Icon";

function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const { isCollapsed, toggleSidebar } = useSidebar();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  // Navigation Items with functional role permissions matching backend
  const menuItems = [
    {
      section: "CORE PLATFORM",
      items: [
        {
          label: "Dashboard",
          path: "/dashboard",
          icon: "dashboard",
          roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
        },
        {
          label: "My Identity",
          path: "/identity",
          icon: "identity",
          roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
        },
        {
          label: "My Assets",
          path: "/assets",
          icon: "assets",
          roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
        },
      ],
    },
    {
      section: "ASSET & ACCESS OPERATIONS",
      items: [
        {
          label: "Mint Asset",
          path: "/assets/mint",
          icon: "mint",
          roles: ["Admin", "Manager"],
          organizations: ["BEL"],
        },
        {
          label: "Access Management",
          path: "/access",
          icon: "access",
          roles: ["Admin", "Manager"],
          organizations: ["BEL"],
        },
        {
          label: "Access Requests",
          path: "/access/requests",
          icon: "requests",
          roles: ["Admin", "User", "Employee"],
          organizations: ["Contractor", "BEL"],
        },
        {
          label: "Approvals Queue",
          path: "/approvals",
          icon: "approvals",
          roles: ["Admin", "Manager", "Auditor"],
        },
      ],
    },
    {
      section: "SECURITY & GOVERNANCE",
      items: [
        {
          label: "Identity Management",
          path: "/identities",
          icon: "identities",
          roles: ["Admin", "Manager"],
          organizations: ["BEL", "Contractor"],
        },
        {
          label: "Auditor Console",
          path: "/auditor",
          icon: "auditor",
          roles: ["Auditor"],
          organizations: ["Auditor"],
        },
        {
          label: "Audit Ledger History",
          path: "/audit-history",
          icon: "audit-history",
          roles: ["Auditor"],
          organizations: ["Auditor"],
        },
        {
          label: "Notifications",
          path: "/notifications",
          icon: "notifications",
          roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
          badge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : null,
        },
        {
          label: "Platform Settings",
          path: "/settings",
          icon: "settings",
          roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
        },
      ],
    },
  ];

  const handleLinkClick = () => {
    onClose();
  };

  const handleLogout = () => {
    onClose();
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div
        className={`sidebar-backdrop ${isOpen ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Main Sidebar */}
      <aside className={`sidebar ${isOpen ? "open" : ""} ${isCollapsed ? "collapsed" : ""}`}>
        {/* Brand Header */}
        <div className="sidebar-brand">
          <NavLink to="/dashboard" className="brand-main" onClick={handleLinkClick} title="ChainCoder SIH 2026">
            <div className="sidebar-logo">
              <Icon name="shield" size={20} color="#ffffff" />
            </div>
            {!isCollapsed && (
              <div className="sidebar-brand-text">
                <h2>ChainCoder</h2>
                <span className="sidebar-brand-badge">SIH 2026 DEFENSE</span>
              </div>
            )}
          </NavLink>

          {/* Desktop Collapse / Expand Toggle */}
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={toggleSidebar}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icon name={isCollapsed ? "chevron-right" : "chevron-left"} size={16} />
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Navigation Sections */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {menuItems.map((group) => {
            const filtered = group.items.filter((item) => {
              const roleAllowed = item.roles.includes(user?.role);
              const orgAllowed =
                !item.organizations ||
                item.organizations.includes(user?.organization);
              return roleAllowed && orgAllowed;
            });

            if (filtered.length === 0) return null;

            return (
              <div key={group.section}>
                <div className="sidebar-section-title">{group.section}</div>
                <nav className="sidebar-nav">
                  {filtered.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `sidebar-link ${isActive ? "active" : ""}`
                      }
                      onClick={handleLinkClick}
                      title={item.label}
                    >
                      <span className="sidebar-link-icon">
                        <Icon name={item.icon} size={17} />
                      </span>
                      {!isCollapsed && <span>{item.label}</span>}
                      {item.badge && (
                        <span className="sidebar-badge">{item.badge}</span>
                      )}
                    </NavLink>
                  ))}
                </nav>
              </div>
            );
          })}
        </div>

        {/* User Profile & Logout Area */}
        <div className="sidebar-bottom">
          <div
            className="sidebar-user"
            title={`${user?.name || "Participant"} (${user?.organization} · ${user?.role})`}
          >
            <div className="sidebar-avatar">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>

            {!isCollapsed && (
              <div className="sidebar-user-info">
                <strong title={user?.name}>{user?.name || "Participant"}</strong>
                <div className="sidebar-user-role-badge">
                  <span />
                  {user?.organization} · {user?.role}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
            title="Sign Out"
            aria-label="Sign Out"
          >
            <Icon name="logout" size={15} />
            {!isCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;