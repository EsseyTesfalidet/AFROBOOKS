'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authenticatedPost } from '@/lib/firebase/request';
import { STARTER_QUESTION } from '@/lib/community';
import { ContextFields, ErrorMessage, SignInPrompt } from './shared';

export default function CommunityComposer({ weekly = false, onPublished }: { weekly?: boolean; onPublished?: () => void }) {
  const { userProfile, loading } = useAuthStore();
  const router = useRouter();
  const [title, setTitle] = useState(weekly ? STARTER_QUESTION : '');
  const [body, setBody] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const attempt = useRef<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    attempt.current ??= crypto.randomUUID();
    try {
      const result = await authenticatedPost<{ id: string }>('/api/community', { action: 'create', attemptId: attempt.current, kind: weekly ? 'weekly' : 'memory', title, body, country, language });
      attempt.current = null;
      if (onPublished) { setTitle(''); setBody(''); onPublished(); }
      else router.push(`/community/${result.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to publish. Your text is still here.'); }
    finally { setBusy(false); }
  }
  if (loading) return <p role="status" className="community-muted">Checking your account…</p>;
  if (!userProfile) return <SignInPrompt path="/community/new" />;
  if (weekly && userProfile.role !== 'admin') return null;
  return <form className="community-stack" onSubmit={submit}>
    <label>{weekly ? 'Weekly question' : 'What are you trying to remember?'}<input value={title} onChange={e => setTitle(e.target.value)} minLength={10} maxLength={180} required placeholder={weekly ? 'Ask something everyone can take part in' : 'A story my grandmother told about a clever bird…'} disabled={busy} /></label>
    <label>{weekly ? 'A little context (optional)' : 'Tell us what you remember'}<textarea value={body} onChange={e => setBody(e.target.value)} minLength={weekly ? undefined : 20} maxLength={3000} required={!weekly} rows={5} disabled={busy} placeholder={weekly ? 'Invite people to share their own experience.' : 'Any words, characters, places, or dates could help someone recognize it.'} /></label>
    {!weekly && <ContextFields country={country} language={language} setCountry={setCountry} setLanguage={setLanguage} />}
    <p className="community-muted">Your contribution and display name will be public. Share only what you are comfortable making public, and respect other people’s privacy.</p>
    {weekly && <p className="community-muted">Publishing makes this the featured question. Earlier questions remain available for replies.</p>}
    <ErrorMessage error={error} />
    <button disabled={busy} type="submit" className="community-button justify-self-start">{busy ? 'Publishing…' : weekly ? 'Publish weekly question' : 'Post memory request'}</button>
  </form>;
}
