/**
 * Notification helper utilities for ChainCoder.
 * Centralizes type-to-metadata mappings, role-aware routing targets,
 * and date/time formatting.
 */

export function getNotificationMeta(notification, user = null) {
  if (!notification) {
    return {
      icon: "●",
      label: "Notification",
      badgeClass: "badge-default",
      targetPath: null,
    };
  }

  const type = notification.type || "";
  const resourceType = notification.resourceType || "";
  const resourceId = notification.resourceId || "";
  const role = user?.role || "";
  const organization = user?.organization || "";

  switch (type) {
    case "ASSET_CREATED":
      return {
        icon: "◆",
        label: "Asset Created",
        badgeClass: "badge-asset",
        targetPath: resourceId ? `/assets/${resourceId}` : "/assets",
      };

    case "ASSET_TRANSFERRED":
      return {
        icon: "⇄",
        label: "Asset Transferred",
        badgeClass: "badge-asset",
        targetPath: resourceId ? `/assets/${resourceId}` : "/assets",
      };

    case "ACCESS_REQUEST_CREATED":
      return {
        icon: "↗",
        label: "Access Request",
        badgeClass: "badge-request",
        targetPath:
          role === "Admin" || role === "Manager" || role === "Auditor"
            ? "/approvals"
            : "/access/requests",
      };

    case "ACCESS_REQUEST_APPROVED":
      return {
        icon: "✓",
        label: "Request Approved",
        badgeClass: "badge-success",
        targetPath:
          role === "Auditor"
            ? "/approvals"
            : organization === "Contractor"
            ? "/access/requests"
            : "/approvals",
      };

    case "ACCESS_REQUEST_REJECTED":
      return {
        icon: "✕",
        label: "Request Rejected",
        badgeClass: "badge-danger",
        targetPath:
          organization === "Contractor" ? "/access/requests" : "/approvals",
      };

    case "ACCESS_GRANTED":
      return {
        icon: "⇄",
        label: "Access Granted",
        badgeClass: "badge-success",
        targetPath: organization === "Contractor" ? "/assets" : "/access",
      };

    case "ACCESS_REVOKED":
      return {
        icon: "⊘",
        label: "Access Revoked",
        badgeClass: "badge-warning",
        targetPath: organization === "Contractor" ? "/assets" : "/access",
      };

    case "IDENTITY_REVOKED":
      return {
        icon: "◎",
        label: "Identity Revoked",
        badgeClass: "badge-danger",
        targetPath: "/identity",
      };

    default: {
      // Fallback based on resourceType if known
      let targetPath = null;
      if (resourceType === "asset" && resourceId) {
        targetPath = `/assets/${resourceId}`;
      } else if (resourceType === "asset") {
        targetPath = "/assets";
      } else if (resourceType === "accessRequest") {
        targetPath =
          role === "Admin" || role === "Manager" || role === "Auditor"
            ? "/approvals"
            : "/access/requests";
      } else if (resourceType === "access") {
        targetPath = organization === "Contractor" ? "/assets" : "/access";
      } else if (resourceType === "identity") {
        targetPath = "/identity";
      }

      return {
        icon: "●",
        label: type ? type.replace(/_/g, " ") : "Notification",
        badgeClass: "badge-default",
        targetPath,
      };
    }
  }
}

export function formatNotificationTime(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 45) return "Just now";
    if (diffSec < 3600) {
      const minutes = Math.floor(diffSec / 60);
      return `${minutes}m ago`;
    }
    if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return `${hours}h ago`;
    }
    const days = Math.floor(diffSec / 86400);
    if (days < 7) {
      return `${days}d ago`;
    }
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
  } catch {
    return String(dateString);
  }
}

export function formatNotificationDate(dateString) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return String(dateString);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(dateString);
  }
}
