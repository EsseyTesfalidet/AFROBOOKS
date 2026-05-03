const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  live: { bg: '#0f2e1a', text: '#4ade80' },
  active: { bg: '#0f2e1a', text: '#4ade80' },
  completed: { bg: '#0f2e1a', text: '#4ade80' },
  paid: { bg: '#0f2e1a', text: '#4ade80' },
  draft: { bg: '#1a1a1a', text: '#888' },
  pending: { bg: '#2e1a0f', text: '#f5b800' },
  in_review: { bg: '#1a1a2e', text: '#0ea5e9' },
  processing: { bg: '#1a1a2e', text: '#0ea5e9' },
  flagged: { bg: '#2e1a0f', text: '#f5b800' },
  removed: { bg: '#1f0e0c', text: '#e8442a' },
  banned: { bg: '#1f0e0c', text: '#e8442a' },
  suspended: { bg: '#1f0e0c', text: '#e8442a' },
  failed: { bg: '#1f0e0c', text: '#e8442a' },
  cancelled: { bg: '#1f0e0c', text: '#e8442a' },
  warned: { bg: '#2e1a0f', text: '#f5b800' },
  refunded: { bg: '#2e1a0f', text: '#f5b800' },
  past_due: { bg: '#2e1a0f', text: '#f5b800' },
};

interface StatusPillProps {
  status: string;
  label?: string;
}

export default function StatusPill({ status, label }: StatusPillProps) {
  const style = STATUS_STYLES[status] ?? { bg: '#1a1a1a', text: '#aaa' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: style.bg, color: style.text }}
    >
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
}
