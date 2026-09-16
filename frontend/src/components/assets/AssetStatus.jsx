function AssetStatus({ status }) {
  const value = status || "UNKNOWN";

  let className = "asset-status-badge";

  if (value === "ACTIVE") {
    className += " asset-status-active";
  } else if (value === "DELETED" || value === "DECOMMISSIONED") {
    className += " asset-status-deleted";
  } else if (value === "PENDING_DELETION") {
    className += " asset-status-pending-delete";
  } else if (value === "REVOKED") {
    className += " asset-status-revoked";
  } else if (value === "TRANSFERRED") {
    className += " asset-status-transferred";
  }

  let icon = "●";
  if (value === "DELETED" || value === "DECOMMISSIONED") icon = "✕";
  if (value === "PENDING_DELETION") icon = "⏳";

  return (
    <span className={className}>
      {icon} {value.replace(/_/g, " ")}
    </span>
  );
}

export default AssetStatus;
