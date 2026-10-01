'use client';

import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteNotification } from '@/lib/firebase/firestore';

export default function DeleteNotificationButton({ id, title, onError }: {
  id: string;
  title: string;
  onError: (message: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  return <button
    type="button"
    aria-label={`Delete notification: ${title}`}
    title="Delete notification"
    disabled={deleting}
    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#999] transition-colors hover:bg-white/5 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-50"
    onClick={async event => {
      event.stopPropagation();
      if (deleting) return;
      setDeleting(true);
      onError('');
      try { await deleteNotification(id); }
      catch { onError('Could not delete the notification. Please try again.'); }
      finally { setDeleting(false); }
    }}
  >
    {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
  </button>;
}
