'use client';

import { BookOpen, PenSquare } from 'lucide-react';
import type { WorkspaceRole } from '@/lib/utils/workspace';

interface WorkspaceSwitcherProps {
  activeRole: WorkspaceRole;
  onChange: (nextRole: WorkspaceRole) => void | Promise<void>;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  showLabel?: boolean;
}

const SIZE_STYLES = {
  sm: {
    shell: 'p-1',
    button: 'gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px]',
    icon: 13,
    label: 'text-[10px]',
  },
  md: {
    shell: 'p-1.5',
    button: 'gap-2 rounded-2xl px-3 py-2 text-sm',
    icon: 14,
    label: 'text-[11px]',
  },
} as const;

export default function WorkspaceSwitcher({
  activeRole,
  onChange,
  size = 'md',
  fullWidth = false,
  showLabel = false,
}: WorkspaceSwitcherProps) {
  const styles = SIZE_STYLES[size];

  return (
    <div className={`${fullWidth ? 'w-full' : ''} space-y-2`}>
      {showLabel ? (
        <p className={`${styles.label} uppercase tracking-[0.24em] text-[#666]`}>Workspace</p>
      ) : null}
      <div
        className={`surface-panel-muted inline-flex ${fullWidth ? 'w-full' : ''} items-center ${styles.shell}`}
      >
        {[
          { id: 'buyer' as const, label: 'Reader', icon: BookOpen },
          { id: 'seller' as const, label: 'Author Studio', icon: PenSquare },
        ].map(({ id, label, icon: Icon }) => {
          const active = activeRole === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                if (!active) onChange(id);
              }}
              className={`${styles.button} ${fullWidth ? 'flex-1 justify-center' : ''} inline-flex items-center font-medium transition-all`}
              style={{
                background: active ? 'linear-gradient(180deg, #f05b43 0%, #e8442a 100%)' : 'transparent',
                border: `1px solid ${active ? '#e8442a' : 'transparent'}`,
                color: active ? '#fff' : '#a1a1aa',
                boxShadow: active ? '0 12px 24px rgba(232,68,42,0.18)' : 'none',
              }}
            >
              <Icon size={styles.icon} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
