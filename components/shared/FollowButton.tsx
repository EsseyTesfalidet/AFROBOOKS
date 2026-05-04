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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userProfile || userProfile.uid === sellerId) { setReady(true); return; }
    isFollowingAuthor(userProfile.uid, sellerId).then((v) => {
      setFollowing(v);
      setReady(true);
    });
  }, [userProfile?.uid, sellerId]);

  if (!userProfile || userProfile.uid === sellerId || !ready) return null;

  async function toggle() {
    if (!userProfile) return;
    if (following) {
      setFollowing(false);
      setCount((c) => Math.max(0, c - 1));
      await unfollowAuthor(userProfile.uid, sellerId);
    } else {
      setFollowing(true);
      setCount((c) => c + 1);
      await followAuthor(userProfile.uid, sellerId);
    }
  }

  const isMd = size === 'md';

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-1.5 rounded-lg font-medium border transition-all"
      style={{
        padding: isMd ? '8px 16px' : '5px 10px',
        fontSize: isMd ? 13 : 11,
        background: following ? '#1a1a1a' : '#e8442a',
        borderColor: following ? '#333' : '#e8442a',
        color: following ? '#888' : '#fff',
      }}
    >
      {following ? <UserCheck size={isMd ? 15 : 12} /> : <UserPlus size={isMd ? 15 : 12} />}
      {following ? 'Following' : 'Follow'}
      {count > 0 && (
        <span style={{ color: following ? '#555' : 'rgba(255,255,255,0.65)', marginLeft: 2 }}>
          {count >= 1000 ? `${(count / 1000).toFixed(1)}k` : count}
        </span>
      )}
    </button>
  );
}
