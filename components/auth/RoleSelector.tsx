'use client';

import { BookOpen, PenLine } from 'lucide-react';

interface RoleSelectorProps {
  selected: 'buyer' | 'seller';
  onChange: (role: 'buyer' | 'seller') => void;
}

const roles = [
  {
    id: 'buyer' as const,
    icon: BookOpen,
    label: 'Reader',
    description: 'Discover and read ebooks',
  },
  {
    id: 'seller' as const,
    icon: PenLine,
    label: 'Author',
    description: 'Publish and earn from your ebooks',
  },
];

export default function RoleSelector({ selected, onChange }: RoleSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {roles.map(({ id, icon: Icon, label, description }) => {
        const active = selected === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className="surface-panel-muted flex flex-col items-start gap-3 rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5"
            style={{
              borderColor: active ? 'rgba(232,68,42,0.72)' : 'rgba(255,255,255,0.08)',
              background: active
                ? 'radial-gradient(circle at top, rgba(232,68,42,0.16), transparent 55%), linear-gradient(180deg, rgba(42,18,15,0.95) 0%, rgba(24,15,14,0.96) 100%)'
                : undefined,
              boxShadow: active ? '0 18px 34px rgba(232,68,42,0.16)' : undefined,
            }}
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{
                background: active ? 'rgba(232,68,42,0.14)' : 'rgba(255,255,255,0.04)',
                color: active ? '#ff7c68' : '#8b8b94',
              }}
            >
              <Icon size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f5f2eb]">{label}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#7a7a84]">{description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
