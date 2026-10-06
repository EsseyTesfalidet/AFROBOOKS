'use client';

import { accountFetch } from '@/lib/network';

import Link from 'next/link';
import { useState } from 'react';
import { authenticatedGet } from '@/lib/firebase/request';
import type { CommunityPost, CommunityReply } from '@/types/community';

export async function getCommunity<T>(params: URLSearchParams, admin = false, signal?: AbortSignal): Promise<T> {
  if (admin) { params.set('view', 'admin'); return authenticatedGet<T>(`/api/community?${params}`); }
  const response = await accountFetch(`/api/community?${params}`, { cache: 'no-store', signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load community.');
  return data;
}

export function ErrorMessage({ error }: { error: string }) {
  return error ? <p role="alert" className="community-error">{error}</p> : null;
}

export function ContextFields({ country, language, setCountry, setLanguage }: {
  country: string; language: string; setCountry: (value: string) => void; setLanguage: (value: string) => void;
}) {
  return <div className="community-context">
    <label>Country or region (optional)<input value={country} maxLength={80} onChange={e => setCountry(e.target.value)} autoComplete="off" placeholder="Where is your memory from?" /></label>
    <label>Language (optional)<input value={language} maxLength={80} onChange={e => setLanguage(e.target.value)} autoComplete="off" placeholder="For example, Tigrinya" /></label>
  </div>;
}

export function ContributionMeta({ item }: { item: CommunityPost | CommunityReply }) {
  return <div className="community-meta"><span>{item.authorName}</span>
    {item.country && <span>{item.country}</span>}{item.language && <span>{item.language}</span>}
    <time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
  </div>;
}

export function SignInPrompt({ path }: { path: string }) {
  return <p className="community-muted"><Link className="community-link" href={`/login?redirect=${encodeURIComponent(path)}`}>Sign in to join the conversation</Link>. Everyone is welcome to read.</p>;
}

export function ShareButton({ path, title }: { path: string; title: string }) {
  const [notice, setNotice] = useState('');
  const [fallback, setFallback] = useState('');
  async function share() {
    const url = new URL(path, window.location.origin).href;
    setNotice('');
    try {
      if (navigator.share) await navigator.share({ title, url });
      else { await navigator.clipboard.writeText(url); setNotice('Link copied.'); }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setFallback(url);
    }
  }
  return <><button type="button" className="community-link" onClick={() => void share()}>Share conversation</button>
    {notice && <span role="status" className="community-muted">{notice}</span>}
    {fallback && <label className="w-full">Copy this link<input readOnly value={fallback} onFocus={e => e.target.select()} /></label>}</>;
}
