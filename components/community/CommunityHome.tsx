'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import type { CommunityFeed, CommunityKind, CommunityPost } from '@/types/community';
import { ContributionMeta, ErrorMessage, getCommunity } from './shared';

function PostCard({ post, featured = false }: { post: CommunityPost; featured?: boolean }) {
  return <article className={`community-card ${featured ? 'community-feature' : ''}`}>
    {featured && <p className="community-kicker">One Question, Many Homes · Featured question</p>}
    {post.acceptedReplyId && <p className="community-badge mb-3">Memory found</p>}
    <h2><Link href={`/community/${post.id}`} className="hover:text-[#e9bd73]">{post.title}</Link></h2>
    {post.body && <p className="community-muted mt-3 line-clamp-2 whitespace-pre-wrap">{post.body}</p>}
    <div className="mt-4"><ContributionMeta item={post} /></div>
    <div className="community-actions"><Link className={featured ? 'community-button' : 'community-link'} href={`/community/${post.id}`}>{featured ? 'Share your experience' : 'Join the conversation'}</Link>
      <span className="community-muted">{post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</span></div>
  </article>;
}

export default function CommunityHome({ kind }: { kind: CommunityKind }) {
  const user = useAuthStore(s => s.userProfile);
  const [feed, setFeed] = useState<CommunityFeed | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    getCommunity<CommunityFeed>(new URLSearchParams({ kind }), false, controller.signal).then(setFeed).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [kind, revision]);
  async function more() {
    if (!feed?.nextCursor || loadingMore) return;
    setLoadingMore(true); setError('');
    try {
      const next = await getCommunity<CommunityFeed>(new URLSearchParams({ kind, cursor: feed.nextCursor }));
      setFeed({ ...next, posts: [...feed.posts, ...next.posts.filter(post => !feed.posts.some(previous => previous.id === post.id))] });
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load more.'); }
    finally { setLoadingMore(false); }
  }
  const posts = feed?.posts.filter(post => kind !== 'weekly' || post.id !== feed.featured?.id) ?? [];
  return <main className="community community-shell">
    <p className="community-kicker">The AfroBooks community</p><h1>A little closer to home.</h1>
    <p className="community-muted mt-4">Share an experience, find a forgotten memory, and hear from people across our communities.</p>
    <nav className="community-tabs" aria-label="Community sections">
      <Link href="/community" aria-current={kind === 'weekly' ? 'page' : undefined}>Weekly Question</Link>
      <Link href="/community?tab=memory" aria-current={kind === 'memory' ? 'page' : undefined}>Find a Memory</Link>
    </nav>
    <div className="community-stack">
      {kind === 'memory' && <section className="community-banner"><div><h2>Help each other remember.</h2><p className="community-muted mt-2">A saying, a story, a childhood game. Share the pieces you remember.</p></div><Link href="/community/new" className="community-button">Ask for Help</Link></section>}
      {kind === 'weekly' && <p className="community-muted">One question. Different places, generations, and experiences. Share yours.</p>}
      {user?.role === 'admin' && <Link href="/admin/community" className="community-link">Manage weekly questions and community</Link>}
      <ErrorMessage error={error} />
      {error && <button type="button" className="community-secondary justify-self-start" onClick={() => { setError(''); setRevision(v => v + 1); }}>Try again</button>}
      {!feed && !error && <p role="status" className="community-muted">Loading conversations…</p>}
      {kind === 'weekly' && feed?.featured && <PostCard post={feed.featured} featured />}
      {kind === 'weekly' && feed && !feed.featured && <div className="community-card"><h2>Our first question is on its way.</h2><p className="community-muted mt-3">Come back for a conversation chosen by AfroBooks. You can explore Find a Memory in the meantime.</p><Link href="/community?tab=memory" className="community-link">Explore memory requests</Link></div>}
      {kind === 'weekly' && posts.length > 0 && <h2>More conversations</h2>}
      {posts.map(post => <PostCard key={post.id} post={post} />)}
      {kind === 'memory' && feed && !posts.length && !error && <div className="community-empty"><h2>What have you been trying to remember?</h2><p className="community-muted mt-3">Be the first to ask. Include a few words, where you heard them, or what made the memory special.</p></div>}
      {feed?.nextCursor && <button type="button" className="community-secondary justify-self-start" disabled={loadingMore} onClick={() => void more()}>{loadingMore ? 'Loading…' : 'More conversations'}</button>}
    </div>
  </main>;
}
