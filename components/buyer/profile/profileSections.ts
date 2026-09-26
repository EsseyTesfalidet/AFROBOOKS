import { Bookmark, Receipt, Settings, Star, UserRound } from 'lucide-react';

export const PROFILE_SECTIONS = [
  { id: 'account', label: 'Profile', icon: UserRound },
  { id: 'wishlist', label: 'Saved', icon: Bookmark },
  { id: 'history', label: 'Purchases', icon: Receipt },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const;
export type ProfileSection = typeof PROFILE_SECTIONS[number]['id'];

export function resolveProfileSection(section: string): ProfileSection {
  if (['preferences', 'security', 'privacy', 'notifications'].includes(section)) return 'settings';
  return PROFILE_SECTIONS.some(item => item.id === section) ? section as ProfileSection : 'account';
}

export const panelClass = 'rounded-2xl border border-white/10 bg-white/[0.025] p-5';
export const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5b800] disabled:cursor-not-allowed disabled:opacity-50';
export const inputClass = 'w-full rounded-xl border border-white/15 bg-[#191919] px-3.5 py-3 text-[16px] text-white outline-none focus:border-[#f5b800] disabled:opacity-60';
