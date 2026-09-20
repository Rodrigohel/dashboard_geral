import Icon from './Icon.jsx';

export default function EmptyState({ icon = 'search', title, description, action }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={34} strokeWidth={1.4} />
      <div>
        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
        {description && <div style={{ fontSize: 13.5 }}>{description}</div>}
      </div>
      {action}
    </div>
  );
}
