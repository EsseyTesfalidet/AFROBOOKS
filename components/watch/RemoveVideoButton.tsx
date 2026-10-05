'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { WatchVideo } from '@/types/video';
import { watchActionRequest, WatchFeedback } from './WatchUI';

export default function RemoveVideoButton({ video, disabled, onRemoved }: { video: WatchVideo; disabled?: boolean; onRemoved: (id: string) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (video.status === 'removed') return null;
  const published = !!video.publishedAt || video.status === 'published';
  return <div className="watch-remove-video"><button type="button" className="watch-button" disabled={disabled || busy} onClick={async () => {
    if (busy || !window.confirm(published ? 'Remove this video from your studio and Screen? New purchases stop and existing buyers keep access. Pending edits will be withdrawn.' : 'Remove this video from your studio and cancel its submission? Any unsaved edits will be discarded.')) return;
    setBusy(true); setError('');
    try {
      await watchActionRequest('creator_remove', { id: video.id });
      onRemoved(video.id);
    } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }}><Trash2 size={16} aria-hidden="true" />{busy ? 'Removing…' : published ? 'Remove from Screen' : 'Remove video'}</button><WatchFeedback error={error} /></div>;
}
