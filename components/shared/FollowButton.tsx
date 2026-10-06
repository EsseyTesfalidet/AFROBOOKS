'use client';

import { useEffect, useState } from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { followAuthor, unfollowAuthor, isFollowingAuthor } from '@/lib/firebase/firestore';

interface Props {
  sellerId: string;
  initialFollowerCount?: number;
  size?: 'sm' | 'md';
}

export default function FollowButton({ sellerId, initialFollowerCount = 0, size = 'sm' }: Props) {
  const userProfile = useAuthStore((s) => s.userProfile);
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(initialFollowerCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userProfile || userProfile.uid === sellerId) { setReady(true); return; }
    isFollowingAuthor(userProfile.uid, sellerId).then((v) => {
      setFollowing(v);
      setReady(true);
    }).catch(() => setReady(true));
  }, [userProfile?.uid, sellerId]);

  if (!userProfile || userProfile.uid === sellerId || !ready) return null;

  async function toggle() {
    if (!userProfile || busy) return;
    setBusy(true);
    setError('');
    try {
      if (following) await unfollowAuthor(userProfile.uid, sellerId);
      else await followAuthor(userProfile.uid, sellerId);
      setFollowing(!following);
      setCount((count) => Math.max(0, count + (following ? -1 : 1)));
    } catch { setError('Could not update follow. Try again.'); }
    finally { setBusy(false); }
  }

  const isMd = size === 'md';

  return (
    <>
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-lg font-medium border transition-all"
      style={{
        padding: isMd ? '8px 16px' : '5px 10px',
        fontSize: isMd ? 13 : 11,
        background: following ? 'var(--app-field, #1a1a1a)' : 'var(--app-action, #e8442a)',
        borderColor: following ? 'var(--app-line, #333)' : 'var(--app-action, #e8442a)',
        color: following ? 'var(--app-muted, #888)' : 'var(--app-on-action, #fff)',
      }}
    >
      {following ? <UserCheck size={isMd ? 15 : 12} /> : <UserPlus size={isMd ? 15 : 12} />}
      {following ? 'Following' : 'Follow'}
      {count > 0 && (
        <span style={{ color: following ? 'var(--app-muted, #555)' : 'var(--app-on-action, rgba(255,255,255,0.65))', marginLeft: 2 }}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
        </span>
      )}
    </button>
    {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
    </>
  );
}
