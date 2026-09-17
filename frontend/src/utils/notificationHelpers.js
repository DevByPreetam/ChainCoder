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

    case "MINT_PROPOSAL_PENDING":
      return {
        icon: "⏳",
        label: "Mint Proposal",
        badgeClass: "badge-warning",
        targetPath:
          role === "Auditor" || role === "Admin" || role === "Manager"
            ? "/approvals?tab=mint_proposals"
            : "/assets",
      };

    case "MINT_APPROVED":
      return {
        icon: "✓",
        label: "Mint Approved",
        badgeClass: "badge-success",
        targetPath: resourceId ? `/assets/${resourceId}` : "/assets",
      };

    case "MINT_REJECTED":
      return {
        icon: "✕",
        label: "Mint Rejected",
        badgeClass: "badge-danger",
        targetPath:
          role === "Auditor" || role === "Admin" || role === "Manager"
            ? "/approvals?tab=mint_proposals"
            : "/assets",
      };

    case "ASSET_DELETION_PENDING":
      return {
        icon: "🗑️",
        label: "Deletion Proposal",
        badgeClass: "badge-warning",
        targetPath:
          role === "Auditor" || role === "Admin" || role === "Manager"
            ? "/approvals?tab=deletion_proposals"
            : "/assets",
      };

    case "ASSET_DELETED":
      return {
        icon: "🗑️",
        label: "Asset Deleted",
        badgeClass: "badge-danger",
        targetPath: "/assets",
      };

    case "ASSET_DELETION_REJECTED":
      return {
        icon: "✕",
        label: "Deletion Rejected",
        badgeClass: "badge-default",
        targetPath:
          role === "Auditor" || role === "Admin" || role === "Manager"
            ? "/approvals?tab=deletion_proposals"
            : "/assets",
      };

    case "REVOCATION_PROPOSAL_CREATED":
      return {
        icon: "⚠️",
        label: "Revocation Proposed",
        badgeClass: "badge-warning",
        targetPath:
          role === "Auditor" || role === "Admin" || role === "Manager"
            ? "/approvals?tab=revocation_proposals"
            : "/identities",
      };

    case "IDENTITY_REGISTERED":
      return {
        icon: "🆔",
        label: "Identity Registered",
        badgeClass: "badge-success",
        targetPath: "/identities",
      };

    default: {
      // Fallback based on resourceType or content keyword matching
      let targetPath = null;
      const lowerTitle = (notification.title || "").toLowerCase();
      const lowerMsg = (notification.message || "").toLowerCase();
      const isApprover =
        role === "Auditor" || role === "Admin" || role === "Manager";

      if (
        resourceType === "mint_proposal" ||
        resourceType === "mintProposal" ||
        lowerTitle.includes("mint proposal") ||
        lowerMsg.includes("mint proposal")
      ) {
        targetPath = isApprover ? "/approvals?tab=mint_proposals" : "/assets";
      } else if (
        resourceType === "asset_deletion" ||
        resourceType === "assetDeletion" ||
        lowerTitle.includes("deletion") ||
        lowerMsg.includes("deletion")
      ) {
        targetPath = isApprover ? "/approvals?tab=deletion_proposals" : "/assets";
      } else if (
        resourceType === "accessRequest" ||
        lowerTitle.includes("access request") ||
        lowerMsg.includes("access request")
      ) {
        targetPath = isApprover ? "/approvals" : "/access/requests";
      } else if (resourceType === "asset" && resourceId) {
        targetPath = `/assets/${resourceId}`;
      } else if (resourceType === "asset") {
        targetPath = "/assets";
      } else if (resourceType === "access") {
        targetPath = organization === "Contractor" ? "/assets" : "/access";
      } else if (resourceType === "identity") {
        targetPath = isApprover ? "/identities" : "/identity";
      } else if (
        lowerTitle.includes("co-approval") ||
        lowerMsg.includes("co-approval") ||
        lowerTitle.includes("co-approve") ||
        lowerMsg.includes("co-approve") ||
        lowerTitle.includes("approval") ||
        lowerMsg.includes("approval required")
      ) {
        targetPath = isApprover ? "/approvals" : "/dashboard";
      } else if (
        isApprover &&
        (lowerTitle.includes("queue") || lowerMsg.includes("queue"))
      ) {
        targetPath = "/approvals";
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
