'use client';

import { useLayoutEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, X, Search } from 'lucide-react';

export function AdminHeading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="admin-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
export function AdminError({ error, retry }: { error: string; retry?: () => void }) {
  return error ? (
    <div role="alert" className="admin-error">
      <p>{error}</p>
      {retry && (
        <button type="button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  ) : null;
}
export function AdminSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="admin-search">
      <Search size={17} aria-hidden="true" />
      <input
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
export function AdminPagination({
  page,
  total,
  size = 15,
  onChange,
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="admin-pagination">
      <p>
        {total
          ? `${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total}`
          : '0 results'}
      </p>
      <div>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
export function AdminDrawer({
  title,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node?.showModal();
    return () => {
      node?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="admin-drawer"
      aria-labelledby="admin-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (!busy && (event.clientX < bounds.left || event.clientX > bounds.right)) onClose();
        }
      }}
    >
      <div className="admin-drawer-header">
        <h2 id="admin-detail-title">{title}</h2>
        <button type="button" aria-label="Close details" onClick={onClose} disabled={busy}>
          <X size={20} />
        </button>
      </div>
      <div className="admin-drawer-content">{children}</div>
    </dialog>
  );
}
export function AdminBadge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'good' | 'warning';
}) {
  return <span className={`admin-badge admin-badge-${tone}`}>{children}</span>;
}
