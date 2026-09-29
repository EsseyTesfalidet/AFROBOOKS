'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authenticatedPost } from '@/lib/firebase/request';
import type { CommunityAction } from '@/lib/community';
import type { CommunityReply, CommunityThread as Thread } from '@/types/community';
import { ContextFields, ContributionMeta, ErrorMessage, getCommunity, ShareButton, SignInPrompt } from './shared';

export default function CommunityThread({ postId, admin = false, focusReply }: { postId: string; admin?: boolean; focusReply?: string }) {
  const user = useAuthStore(s => s.userProfile);
  const router = useRouter();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState('');
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [parent, setParent] = useState<CommunityReply | null>(null);
  const [report, setReport] = useState<{ replyId: string | null } | null>(null);
  const [reason, setReason] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);
  const reportForm = useRef<HTMLFormElement>(null);
  const attempt = useRef<string | null>(null);
  const path = `/community/${postId}`;
  useEffect(() => {
    if (report) {
      reportForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      reportForm.current?.querySelector('textarea')?.focus();
    }
  }, [report]);
  const load = useCallback((signal?: AbortSignal) => getCommunity<Thread>(new URLSearchParams({ postId, ...(focusReply ? { replyId: focusReply } : {}) }), admin, signal), [postId, admin, focusReply]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).then(result => { if (!controller.signal.aborted) setThread(result); }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [load]);
  async function refresh() {
    setError('');
    try { setThread(await load()); } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load conversation.'); }
  }
  async function act(action: CommunityAction, success: string) {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try {
      await authenticatedPost('/api/community', action);
      setNotice(success);
      if (action.action === 'remove' && !action.replyId) { router.push('/community?tab=memory'); return true; }
      // A saved contribution stays saved even if the follow-up read fails.
      try { setThread(await load()); } catch { setError('Your change was saved. Refresh to see the latest conversation.'); }
      return true;
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to save. Please try again.'); return false; }
    finally { setBusy(false); }
  }
  async function submitReply(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    attempt.current ??= crypto.randomUUID();
    if (await act({ action: 'reply', attemptId: attempt.current, postId, body, country, language, parentReplyId: parent?.id ?? null }, 'Your reply has been posted.')) {
      setBody(''); setParent(null); attempt.current = null;
    }
  }
  async function more() {
    if (!thread?.nextCursor || busy) return;
    setBusy(true); setError('');
    try {
      const next = await getCommunity<Thread>(new URLSearchParams({ postId, cursor: thread.nextCursor, ...(focusReply ? { replyId: focusReply } : {}) }), admin);
      setThread({ ...next, replies: [...thread.replies, ...next.replies.filter(reply => !thread.replies.some(previous => previous.id === reply.id))] });
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to load more replies.'); }
    finally { setBusy(false); }
  }
  function replyTo(reply: CommunityReply) {
    setParent(reply); textarea.current?.focus(); textarea.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function remove(replyId: string | null) {
    if (window.confirm(replyId ? 'Remove your reply? Its text will be deleted.' : 'Remove your memory request? It and its replies will no longer be publicly available.')) {
      void act({ action: 'remove', postId, replyId }, 'Your contribution has been removed.');
    }
  }
  function replyCard(reply: CommunityReply, pinned = false) {
    const visible = reply.status === 'active' || (admin && reply.status === 'hidden');
    return <article key={`${pinned ? 'pinned-' : ''}${reply.id}`} id={pinned ? undefined : `reply-${reply.id}`} className={`community-card ${pinned ? 'community-feature' : ''}`}>
      {pinned && <p className="community-kicker">The reply that helped find this memory</p>}
      {reply.status !== 'active' && <p className="community-muted">{reply.status === 'removed' ? 'This reply was removed by its author.' : 'This reply is hidden by the moderation team.'}</p>}
      {visible && <>
        <ContributionMeta item={reply} />
        {reply.parentAuthorName && <p className="community-muted mt-3">Replying to {reply.parentAuthorName}</p>}
        <p className="community-body">{reply.body}</p>
        {!pinned && thread?.post.acceptedReplyId === reply.id && <p className="community-badge mt-3">Helped find this memory</p>}
        <div className="community-actions">
          {user && reply.status === 'active' && <button type="button" disabled={busy} className="community-link" onClick={() => replyTo(reply)}>Reply</button>}
          {user && thread?.post.kind === 'memory' && thread.post.authorId === user.uid && reply.authorId !== user.uid && reply.status === 'active' && <button type="button" disabled={busy} className="community-link" onClick={() => void act({ action: 'accept', postId, replyId: thread.post.acceptedReplyId === reply.id ? null : reply.id }, thread.post.acceptedReplyId === reply.id ? 'Memory request reopened.' : 'Marked as found. Thank you for letting the community know.')}>
            {thread.post.acceptedReplyId === reply.id ? 'Reopen request' : 'This helped me find it'}</button>}
          {user && reply.status === 'active' && reply.authorId !== user.uid && <button type="button" className="community-link" onClick={() => { setReport({ replyId: reply.id }); setReason(''); }}>Report reply</button>}
          {user?.uid === reply.authorId && <button type="button" disabled={busy} className="community-link" onClick={() => remove(reply.id)}>Remove my reply</button>}
          {admin && <button type="button" disabled={busy} className="community-link" onClick={() => void act({ action: 'moderate', postId, replyId: reply.id, hidden: reply.status === 'active' }, 'Reply visibility updated.')}>{reply.status === 'active' ? 'Hide reply' : 'Restore reply'}</button>}
        </div>
      </>}
    </article>;
  }
  return <main className={`community ${admin ? '' : 'community-shell'}`}>
    <Link href={admin ? '/admin/community' : thread?.post.kind === 'memory' ? '/community?tab=memory' : '/community'} className="community-link mb-5">← {admin ? 'Manage community' : 'Community'}</Link>
    <div className="community-stack">
      <ErrorMessage error={error} />
      {error && <button type="button" className="community-secondary justify-self-start" onClick={() => void refresh()}>Refresh conversation</button>}
      {notice && <p role="status" className="community-notice">{notice}</p>}
      {!thread && !error && <p role="status" className="community-muted">Loading conversation…</p>}
      {thread && <>
        <article className="community-card community-feature">
          <p className="community-kicker">{thread.post.kind === 'weekly' ? 'One Question, Many Homes' : 'Find a Memory'}</p>
          {thread.post.status !== 'active' && <p className="community-badge mb-3">Hidden from the community</p>}
          {thread.post.acceptedReplyId && <p className="community-badge mb-3">Memory found</p>}
          <h1>{thread.post.title}</h1><div className="mt-5"><ContributionMeta item={thread.post} /></div>
          {thread.post.body && <p className="community-body">{thread.post.body}</p>}
          <div className="community-actions"><ShareButton path={path} title={thread.post.title} />
            {user && thread.post.authorId !== user.uid && <button type="button" className="community-link" onClick={() => { setReport({ replyId: null }); setReason(''); }}>Report conversation</button>}
            {user?.uid === thread.post.authorId && thread.post.kind === 'memory' && <button type="button" disabled={busy} className="community-link" onClick={() => remove(null)}>Remove my request</button>}
            {admin && <button type="button" disabled={busy} className="community-link" onClick={() => void act({ action: 'moderate', postId, replyId: null, hidden: thread.post.status === 'active' }, 'Conversation visibility updated.')}>{thread.post.status === 'active' ? 'Hide conversation' : 'Restore conversation'}</button>}
            {admin && thread.post.kind === 'weekly' && thread.post.status === 'active' && <button type="button" disabled={busy} className="community-link" onClick={() => void act({ action: 'feature', postId }, 'This is now the featured weekly question.')}>Feature this question</button>}
          </div>
        </article>
        {thread.acceptedReply && replyCard(thread.acceptedReply, true)}
        {thread.focusedReply && <section className="community-stack"><h2>Reported reply</h2>{replyCard(thread.focusedReply)}</section>}
        {report && <form ref={reportForm} className="community-card community-stack" onSubmit={async event => {
          event.preventDefault();
          if (await act({ action: 'report', postId, replyId: report.replyId, reason }, 'Report received. The AfroBooks team will review it.')) setReport(null);
        }}>
          <h2>{report.replyId ? 'Report this reply' : 'Report this conversation'}</h2>
          <label>What should we review?<textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={e => setReason(e.target.value)} /></label>
          <div className="community-actions"><button type="submit" disabled={busy} className="community-button">Submit report</button><button type="button" className="community-secondary" disabled={busy} onClick={() => setReport(null)}>Cancel</button></div>
        </form>}
        <section aria-label="Replies" className="community-stack">
          <h2>{thread.post.replyCount} {thread.post.replyCount === 1 ? 'reply' : 'replies'}</h2>
          {!thread.replies.length && <p className="community-muted">Be the first to share a memory or a helpful lead.</p>}
          {thread.replies.filter(reply => reply.id !== thread.acceptedReply?.id && reply.id !== thread.focusedReply?.id).map(reply => replyCard(reply))}
          {thread.nextCursor && <button type="button" disabled={busy} className="community-secondary justify-self-start" onClick={() => void more()}>Load more replies</button>}
        </section>
        {thread.post.status === 'active' && <section className="community-card" aria-labelledby="reply-title">
          <h2 id="reply-title">{thread.post.kind === 'weekly' ? 'Share your experience' : 'Can you help?'}</h2>
          {!user ? <SignInPrompt path={path} /> : <form className="community-stack mt-5" onSubmit={submitReply}>
            {parent && <div className="community-muted">Replying to {parent.authorName} <button type="button" className="community-link ml-3" onClick={() => setParent(null)}>Cancel reply</button></div>}
            <label>Your reply<textarea ref={textarea} value={body} onChange={e => setBody(e.target.value)} minLength={2} maxLength={3000} rows={4} required disabled={busy} placeholder={thread.post.kind === 'weekly' ? 'What was it like in your home?' : 'Share what you recognize and how you know it. It’s okay to be unsure.'} /></label>
            <ContextFields country={country} language={language} setCountry={setCountry} setLanguage={setLanguage} />
            <p className="community-muted">Replies are public. Be kind, respect privacy, and explain where your information comes from.</p>
            <button type="submit" disabled={busy} className="community-button justify-self-start">{busy ? 'Saving…' : 'Post reply'}</button>
          </form>}
        </section>}
      </>}
    </div>
  </main>;
}
