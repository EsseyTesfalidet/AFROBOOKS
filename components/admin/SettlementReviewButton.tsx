'use client';

import { useState } from 'react';
import { authenticatedPost } from '@/lib/firebase/request';

export default function SettlementReviewButton({ sellerId, onResult }: { sellerId: string; onResult?: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return <div className="space-y-2">
    <button type="button" className="admin-secondary min-h-11" disabled={busy} onClick={async () => {
      if (busy) return;
      setBusy(true); setMessage(''); onResult?.('');
      try {
        const result = await authenticatedPost<{ settled: boolean; message: string }>('/api/admin/settle-payments', { sellerId });
        setMessage(result.message); onResult?.(result.message);
      } catch (error) {
        const text = error instanceof Error ? error.message : 'Could not verify settlement. Try again.';
        setMessage(text); onResult?.(text);
      } finally { setBusy(false); }
    }}>{busy ? 'Checking Stripe…' : 'Check Stripe & settle'}</button>
    {!onResult && message && <p role="status" className="text-sm text-[#c5c9c2]">{message}</p>}
  </div>;
}
