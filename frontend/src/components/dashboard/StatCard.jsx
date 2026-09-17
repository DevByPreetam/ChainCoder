import Icon from "../common/Icon";

function StatCard({ title, value, description, iconName = "dashboard", trend = null, variant = "default" }) {
  return (
    <div className={`stat-card variant-${variant}`}>
      <div className="stat-card-top">
        <span className="stat-card-title">{title}</span>
        <div className="stat-card-icon-wrap">
          <Icon name={iconName} size={18} />
        </div>
      </div>

      <div className="stat-card-value">
        {value}
      </div>

      <div className="stat-card-footer">
        <span className="stat-card-description">{description}</span>
        {trend && (
          <span className="stat-card-trend">{trend}</span>
        )}
      </div>
    </div>
  );
}

export default StatCard;