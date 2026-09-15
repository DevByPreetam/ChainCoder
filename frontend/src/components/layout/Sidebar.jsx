import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function Sidebar() {
  const { user, logout } = useAuth();

  const menuItems = [
    {
      label: "Dashboard",
      path: "/dashboard",
      icon: "⌂",
      roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
    },
    {
      label: "My Identity",
      path: "/identity",
      icon: "◉",
      roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
    },
    {
      label: "My Assets",
      path: "/assets",
      icon: "◆",
      roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
    },
    {
      label: "Identity Management",
      path: "/identities",
      icon: "◎",
      roles: ["Admin", "Manager"],
      organizations: ["BEL", "Contractor"],
    },
    {
      label: "Mint Asset",
      path: "/assets/mint",
      icon: "+",
      roles: ["Admin", "Manager"],
      organizations: ["BEL"],
    },
    {
      label: "Access Management",
      path: "/access",
      icon: "⇄",
      roles: ["Admin", "Manager"],
      organizations: ["BEL"],
    },
    {
      label: "Access Requests",
      path: "/access/requests",
      icon: "↗",
      roles: ["Admin", "User"],
      organizations: ["Contractor"],
    },
    {
      label: "Approvals",
      path: "/approvals",
      icon: "✓",
      roles: ["Admin", "Manager", "Auditor"],
    },
    {
      label: "Auditor Dashboard",
      path: "/auditor",
      icon: "🛡",
      roles: ["Auditor"],
      organizations: ["Auditor"],
    },
    {
      label: "Audit History",
      path: "/audit-history",
      icon: "▤",
      roles: ["Auditor"],
      organizations: ["Auditor"],
    },
    {
      label: "Notifications",
      path: "/notifications",
      icon: "●",
      roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
    },
    {
      label: "Settings",
      path: "/settings",
      icon: "⚙",
      roles: ["Admin", "Manager", "Employee", "Auditor", "User"],
    },
  ];

  const visibleItems = menuItems.filter((item) => {
    const roleAllowed = item.roles.includes(user?.role);
    const organizationAllowed =
      !item.organizations ||
      item.organizations.includes(user?.organization);

    return roleAllowed && organizationAllowed;
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">C</div>

        <div>
          <h2>ChainCoder</h2>
          <span>Secure Platform</span>
        </div>
      </div>

      <div className="sidebar-section-title">
        MAIN MENU
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {user?.name?.charAt(0) || "U"}
          </div>

          <div className="sidebar-user-info">
            <strong>{user?.name}</strong>
            <span>
              {user?.organization} · {user?.role}
            </span>
          </div>
        </div>

        <button
          className="sidebar-logout"
          onClick={logout}
        >
          <span>↪</span>
          Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;