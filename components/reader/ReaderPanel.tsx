'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export default function ReaderPanel({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  return <dialog ref={ref} className="reader-panel" aria-labelledby="reader-panel-title" onClose={event => { if (!event.currentTarget.open) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) ref.current?.close(); } }}>
    <header className="reader-panel-heading"><h2 id="reader-panel-title">{title}</h2><button type="button" autoFocus className="reader-icon-button" aria-label={`Close ${title.toLowerCase()}`} onClick={() => ref.current?.close()}><X size={20} /></button></header>
    <div className="reader-panel-content">{children}</div>
  </dialog>;
}
