'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, LogOut, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { logOutAndRedirect } from '@/lib/firebase/auth';
import ProfileAccount from './profile/ProfileAccount';
import ProfileCollections from './profile/ProfileCollections';
import ProfileSettings from './profile/ProfileSettings';
import AccountLinks from './profile/AccountLinks';
import { PROFILE_SECTIONS, resolveProfileSection, buttonClass } from './profile/profileSections';

export default function BuyerProfileDrawer() {
  const { isOpen, section, setSection, close } = useBuyerDrawerStore();
  const user = useAuthStore(s => s.userProfile);
  const activeSection = user ? resolveProfileSection(section) : 'account';
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousSection = useRef(activeSection);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const visible = isOpen;

  useEffect(() => {
    if (!visible) return;
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    document.body.style.paddingRight = `${window.innerWidth - document.documentElement.clientWidth}px`;
    document.body.style.overflow = 'hidden';
    const backdrop = panelRef.current?.parentElement;
    const background = Array.from(document.body.children).filter((item): item is HTMLElement => item instanceof HTMLElement && item !== backdrop);
    const inertStates = background.map(item => item.inert);
    background.forEach(item => { item.inert = true; });
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]') ?? [])
        .filter(item => item.getClientRects().length > 0 && item.tabIndex >= 0);
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panelRef.current?.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPadding;
      document.removeEventListener('keydown', onKeyDown);
      background.forEach((item, index) => { item.inert = inertStates[index]; });
      if (opener?.isConnected) opener.focus();
    };
  }, [visible, close]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    if (previousSection.current !== activeSection) {
      const heading = contentRef.current?.querySelector('h2');
      if (heading) { heading.tabIndex = -1; heading.style.outline = 'none'; heading.focus({ preventScroll: true }); }
    }
    previousSection.current = activeSection;
  }, [activeSection]);

  async function signOut() {
    setSignOutError(''); setSigningOut(true);
    try { await logOutAndRedirect('/login'); close(); }
    catch { setSignOutError('Unable to sign out. Please try again.'); }
    finally { setSigningOut(false); }
  }

  if (!visible) return null;
  const title = PROFILE_SECTIONS.find(item => item.id === activeSection)!.label;
  return createPortal(
    <div className="profile-overlay fixed inset-0 z-[100] flex items-end justify-end sm:items-stretch">
      <div aria-hidden="true" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="buyer-profile-title"
        className="profile-panel relative flex h-[94dvh] max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#111110] text-[#f5f2eb] shadow-2xl sm:h-full sm:max-h-full sm:max-w-[520px] sm:rounded-none sm:border-y-0 sm:border-r-0">
        <header className="flex shrink-0 items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-7">
          <div className="flex items-center gap-3">
            {activeSection !== 'account' && <button type="button" aria-label="Back to profile" onClick={() => setSection('account')} className={`${buttonClass} !h-11 !w-11 !p-0 text-[#b9b5ac] hover:bg-white/5`}><ArrowLeft size={19} /></button>}
            <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#c1a56c]">Your reading space</p>
            <h1 id="buyer-profile-title" className="text-[26px] font-semibold tracking-tight">{activeSection === 'account' ? 'My account' : title}</h1>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={close} aria-label="Close profile" className={`${buttonClass} !h-11 !w-11 !p-0 text-[#b9b5ac] hover:bg-white/5`}><X size={20} /></button>
        </header>
        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7" aria-label={`${title} content`}>
          {activeSection === 'account' && <>
            {user ? <ProfileAccount key={user.uid} /> : <section className="space-y-4">
              <h2 className="text-xl font-semibold">Your stories, all in one place</h2>
              <p className="text-sm leading-relaxed text-[#a39f97]">Sign in to open your library, manage purchases and save your reading progress.</p>
              <div className="flex flex-wrap gap-3"><Link href="/login" onClick={close} className={`${buttonClass} bg-[var(--app-action,#e8442a)] text-[var(--app-on-action,#fff)]`}>Sign in</Link><Link href="/signup" onClick={close} className={`${buttonClass} border border-white/15`}>Create account</Link></div>
            </section>}
            <AccountLinks onNavigate={close} />
          </>}
          {user && ['wishlist', 'history', 'reviews'].includes(activeSection) && <ProfileCollections key={`${user.uid}:${activeSection}`} section={activeSection as 'wishlist' | 'history' | 'reviews'} />}
          {user && activeSection === 'settings' && <ProfileSettings key={user.uid} />}
        </div>
        <footer className="shrink-0 border-t border-white/10 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-7">
          {signOutError && <p role="alert" className="mb-2 text-[14px] text-red-300">{signOutError}</p>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] tracking-wide text-[#8d897f]">AfroBooks · Reader account</span>
            {user && <button type="button" onClick={signOut} disabled={signingOut} className={`${buttonClass} text-[#a39f97] hover:bg-white/5`}><LogOut size={16} />{signingOut ? 'Signing out…' : 'Sign out'}</button>}
          </div>
        </footer>
      </div>
    </div>, document.body
  );
}
