'use client';

import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase/config';
import { accountFetch } from '@/lib/network';

export default function PrivateVerificationDocument({ id }: { id: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function open() {
    const user = auth.currentUser;
    if (!user || busy) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError('');
    try {
      const response = await accountFetch(`/api/admin/verifications/${encodeURIComponent(id)}/file`, {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store', signal: controller.signal,
      });
      if (!response.ok) throw new Error('Unable to open this verification document.');
      const blob = await response.blob();
      if (!controller.signal.aborted && auth.currentUser?.uid === user.uid) setUrl(URL.createObjectURL(blob));
    } catch { if (!controller.signal.aborted) setError('Unable to open this verification document. Please try again.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }

  return <div>
    <button type="button" className="admin-secondary" disabled={busy} onClick={() => void open()}>{busy ? 'Opening document…' : 'Open identity document'}</button>
    {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
    {url && <div className="mt-4 space-y-3">
      <iframe src={url} title="Private identity document" sandbox="" className="h-[60dvh] w-full rounded-lg border border-current/20 bg-white" />
      <a href={url} download={`verification-${id}`} className="admin-secondary">Download document</a>
      <p className="text-sm">If your browser cannot preview this document, download it to review.</p>
    </div>}
  </div>;
}
