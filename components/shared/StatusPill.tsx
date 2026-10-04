const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  live: { bg: 'var(--app-success-surface, #0f2e1a)', text: 'var(--app-success, #4ade80)' },
  active: { bg: 'var(--app-success-surface, #0f2e1a)', text: 'var(--app-success, #4ade80)' },
  completed: { bg: 'var(--app-success-surface, #0f2e1a)', text: 'var(--app-success, #4ade80)' },
  paid: { bg: 'var(--app-success-surface, #0f2e1a)', text: 'var(--app-success, #4ade80)' },
  draft: { bg: 'var(--app-field, #1a1a1a)', text: 'var(--app-muted, #888)' },
  pending: { bg: 'var(--app-warning-surface, #2e1a0f)', text: 'var(--app-warning, #f5b800)' },
  needs_review: { bg: 'var(--app-warning-surface, #2e1a0f)', text: 'var(--app-warning, #f5b800)' },
  in_review: { bg: 'var(--app-info-surface, #1a1a2e)', text: 'var(--app-info, #0ea5e9)' },
  processing: { bg: 'var(--app-info-surface, #1a1a2e)', text: 'var(--app-info, #0ea5e9)' },
  flagged: { bg: 'var(--app-warning-surface, #2e1a0f)', text: 'var(--app-warning, #f5b800)' },
  removed: { bg: 'var(--app-danger-surface, #1f0e0c)', text: 'var(--app-danger, #e8442a)' },
  banned: { bg: 'var(--app-danger-surface, #1f0e0c)', text: 'var(--app-danger, #e8442a)' },
  suspended: { bg: 'var(--app-danger-surface, #1f0e0c)', text: 'var(--app-danger, #e8442a)' },
  failed: { bg: 'var(--app-danger-surface, #1f0e0c)', text: 'var(--app-danger, #e8442a)' },
  cancelled: { bg: 'var(--app-danger-surface, #1f0e0c)', text: 'var(--app-danger, #e8442a)' },
  warned: { bg: 'var(--app-warning-surface, #2e1a0f)', text: 'var(--app-warning, #f5b800)' },
  refunded: { bg: 'var(--app-warning-surface, #2e1a0f)', text: 'var(--app-warning, #f5b800)' },
  past_due: { bg: 'var(--app-warning-surface, #2e1a0f)', text: 'var(--app-warning, #f5b800)' },
};

interface StatusPillProps {
  status: string;
  label?: string;
}

export default function StatusPill({ status, label }: StatusPillProps) {
  const style = STATUS_STYLES[status] ?? { bg: 'var(--app-field, #1a1a1a)', text: 'var(--app-muted, #aaa)' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: style.bg, color: style.text }}
    >
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
}
