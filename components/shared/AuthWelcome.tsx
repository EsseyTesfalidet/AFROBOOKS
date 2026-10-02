'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BookOpen, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { consumeWelcome, type WelcomeKind } from '@/lib/auth/welcome';

export default function AuthWelcome() {
  const path = usePathname();
  const { userProfile: profile, firebaseUser, loading } = useAuthStore();
  const [welcome, setWelcome] = useState<{ uid: string; kind: WelcomeKind } | null>(null);
  const uid = profile?.uid;
  const eligible = !loading && !!uid && firebaseUser?.uid === uid &&
    profile?.status === 'active' && path !== '/login' && path !== '/signup';

  useEffect(() => {
    if (!eligible || !uid) return;
    const kind = consumeWelcome(uid);
    if (kind) setWelcome({ uid, kind });
  }, [eligible, uid, path]);

  if (!eligible || !profile || welcome?.uid !== uid) return null;
  const name = profile.firstName?.trim();
  const title = welcome.kind === 'signup' ? 'Welcome to AfroBooks' : 'Welcome back';
  const author = profile.activeRole === 'seller';

  return (
    <aside
      aria-label="Welcome message"
      className="fixed right-3 z-[60] flex w-[calc(100%-1.5rem)] max-w-sm items-start gap-3 rounded-2xl border border-[#e5c68e]/30 bg-[#1c1915] p-4 text-[#f5f2eb] shadow-2xl sm:right-6"
      style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <BookOpen aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#e5c68e]" />
      <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 flex-1 break-words">
        <p className="font-display text-lg leading-snug">{title}{name ? `, ${name}` : ''}!</p>
        <p className="mt-1 text-sm leading-relaxed text-[#c4bfb5]">
          {welcome.kind === 'signup'
            ? author ? 'Your author journey starts here. Share your stories with the world.' : 'Your next great read awaits. Discover stories and build your library.'
            : author ? 'Ready to share your next story? Your author dashboard awaits.' : 'Your library and your next great read are waiting for you.'}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss welcome message"
        onClick={() => setWelcome(null)}
        className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#c4bfb5] hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#e5c68e]"
      >
        <X aria-hidden="true" className="h-5 w-5" />
      </button>
    </aside>
  );
}
