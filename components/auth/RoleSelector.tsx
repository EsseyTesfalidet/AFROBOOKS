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
    label: 'Buyer',
    description: 'Browse and read ebooks',
  },
  {
    id: 'seller' as const,
    icon: PenLine,
    label: 'Seller',
    description: 'Publish and sell your ebooks',
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
            className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-left"
            style={{
              border: active ? '1.5px solid #e8442a' : '1.5px solid #2a2a2a',
              background: active ? '#1f0e0c' : '#161616',
            }}
          >
            <Icon size={22} style={{ color: active ? '#e8442a' : '#888' }} />
            <div>
              <p className="text-sm font-medium text-[#f5f2eb]">{label}</p>
              <p className="text-xs text-[#666] mt-0.5">{description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
