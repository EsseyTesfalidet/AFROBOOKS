'use client';
import { useState } from 'react';
import { authenticatedGet } from '@/lib/firebase/request';
import { watchActionRequest } from './WatchUI';

export default function WatchHostingCheck() {
  const [busy, setBusy] = useState(false); const [result, setResult] = useState(''); const [error, setError] = useState('');
  return <div><button type="button" className="watch-button" disabled={busy} onClick={async () => {
    setBusy(true); setResult(''); setError('');
    try {
      const data = await authenticatedGet<{ storage: { usedMinutes: number | null; limitMinutes: number | null } }>('/api/watch?view=hosting');
      const { usedMinutes, limitMinutes } = data.storage;
      if (limitMinutes !== null && usedMinutes !== null && limitMinutes <= usedMinutes) setError('Connected, but Cloudflare has no available video storage. Add Stream storage in your Cloudflare account before retrying the upload.');
      else setResult(`Connected to Cloudflare Stream.${usedMinutes !== null && limitMinutes !== null ? ` Storage: ${Math.ceil(usedMinutes)} of ${limitMinutes} minutes used.` : ''} Uploads also require Stream write permission.`);
    }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }}>{busy ? 'Checking hosting…' : 'Check video hosting'}</button><button type="button" className="watch-button ml-2" disabled={busy} onClick={async () => {
    setBusy(true); setResult(''); setError('');
    try { await watchActionRequest('admin_test_upload', {}); setResult('Upload access verified. The temporary test slot was removed; no video was uploaded.'); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }}>Test upload access</button>{result && <p role="status" className="watch-notice">{result}</p>}{error && <p role="alert" className="watch-notice">{error}</p>}</div>;
}
