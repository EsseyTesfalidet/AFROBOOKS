'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminHeading } from '@/components/admin/AdminUI';
import CommunityComposer from '@/components/community/CommunityComposer';
import { ContributionMeta, ErrorMessage, getCommunity } from '@/components/community/shared';
import { authenticatedPost } from '@/lib/firebase/request';
import type { CommunityFeed } from '@/types/community';

export default function AdminCommunityPage() {
  const [feed, setFeed] = useState<CommunityFeed | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [compose, setCompose] = useState(false);
  const load = useCallback(() => getCommunity<CommunityFeed>(new URLSearchParams(), true), []);
  useEffect(() => {
    let active = true;
    load().then(result => { if (active) setFeed(result); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [load]);
  async function refresh() {
    setError('');
    try { setFeed(await load()); } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load community.'); }
  }
  async function dismiss(reportId: string) {
    if (busy) return;
    setBusy(true); setError('');
    try { await authenticatedPost('/api/community', { action: 'dismissReport', reportId }); setNotice('Report marked as reviewed.'); setFeed(await load()); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to resolve report.'); }
    finally { setBusy(false); }
  }
  async function more() {
    if (busy || !feed?.nextCursor) return;
    setBusy(true); setError('');
    try {
      const next = await getCommunity<CommunityFeed>(new URLSearchParams({ cursor: feed.nextCursor }), true);
      setFeed({ ...next, posts: [...feed.posts, ...next.posts.filter(post => !feed.posts.some(previous => previous.id === post.id))] });
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load more.'); }
    finally { setBusy(false); }
  }
  return <main className="admin-page">
    <AdminHeading title="Community" description="Choose the weekly question and keep conversations welcoming.">
      <Link className="admin-secondary" href="/community">View community</Link>
      <button type="button" className="admin-primary" onClick={() => setCompose(v => !v)}>{compose ? 'Close question editor' : 'New weekly question'}</button>
    </AdminHeading>
    <div className="community community-stack">
      <ErrorMessage error={error} />{error && <button type="button" className="community-secondary justify-self-start" onClick={() => void refresh()}>Try again</button>}
      {notice && <p role="status" className="community-notice">{notice}</p>}
      {compose && <section className="community-card"><CommunityComposer weekly onPublished={() => { setCompose(false); setNotice('Your weekly question is published and featured.'); void refresh(); }} /></section>}
      {!feed && !error && <p role="status" className="community-muted">Loading community…</p>}
      {feed && <>
        <section className="community-card community-feature"><p className="community-kicker">Featured weekly question</p>
          <h2>{feed.featured?.title ?? 'No question published yet'}</h2>
          {feed.featured ? <Link href={`/admin/community/${feed.featured.id}`} className="community-link">Open conversation</Link> : <p className="community-muted mt-3">Choose “New weekly question” to start the first conversation.</p>}
          <p className="community-muted mt-3">You decide when to publish the next question. Previous questions stay available.</p>
        </section>
        <section className="community-stack" aria-label="Community reports"><h2>Reports to review</h2>
          {!feed.reports?.length && <p className="community-muted">No open reports.</p>}
          {feed.reports?.map(report => <article className="community-card" key={report.id}><p className="community-kicker">{report.replyId ? 'Reported reply' : 'Reported conversation'}</p><p className="community-body">{report.reason}</p>
            <div className="community-actions"><Link className="community-link" href={`/admin/community/${report.postId}${report.replyId ? `?reply=${report.replyId}` : ''}`}>Review content</Link><button type="button" disabled={busy} className="community-secondary" onClick={() => void dismiss(report.id)}>Mark reviewed</button></div>
          </article>)}
          {feed.reports?.length === 50 && <p className="community-muted">Showing the oldest 50 open reports. More will appear as you review these.</p>}
        </section>
        <section className="community-stack"><h2>Recent conversations</h2>
          {!feed.posts.length && <p className="community-muted">Your community conversations will appear here.</p>}
          {feed.posts.map(post => <article className="community-card" key={post.id}>
            <p className="community-kicker">{post.kind === 'weekly' ? 'Weekly question' : 'Memory request'} · {post.status}</p>
            <h2>{post.status === 'removed' ? post.title : <Link href={`/admin/community/${post.id}`}>{post.title}</Link>}</h2><div className="mt-3"><ContributionMeta item={post} /></div>
            <p className="community-muted mt-3">{post.replyCount} replies</p>
          </article>)}
          {feed.nextCursor && <button type="button" className="community-secondary justify-self-start" disabled={busy} onClick={() => void more()}>More conversations</button>}
        </section>
      </>}
    </div>
  </main>;
}
