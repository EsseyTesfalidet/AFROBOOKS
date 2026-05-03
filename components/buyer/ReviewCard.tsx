'use client';

import { useState } from 'react';
import { ThumbsUp, Flag, ChevronDown, ChevronUp } from 'lucide-react';
import { doc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import StarRating from '@/components/shared/StarRating';
import type { Review } from '@/types/review';

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

interface Props {
  review: Review;
  isSeller?: boolean;
  currentUserId?: string;
}

export default function ReviewCard({ review, isSeller, currentUserId }: Props) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);
  const date = review.createdAt?.toDate?.() ?? new Date();

  async function postReply() {
    if (!replyText.trim()) return;
    setPosting(true);
    await updateDoc(doc(db, 'reviews', review.id), {
      sellerReply: { text: replyText.trim(), repliedAt: serverTimestamp() },
      updatedAt: serverTimestamp(),
    });
    setReplyOpen(false);
    setPosting(false);
  }

  async function markHelpful() {
    await updateDoc(doc(db, 'reviews', review.id), { helpfulCount: increment(1) });
  }

  return (
    <div
      className="rounded-xl border p-5"
      style={{ background: '#161616', borderColor: '#2a2a2a' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-display text-sm"
            style={{ background: '#e8442a', color: '#fff' }}
          >
            {review.reviewerInitials}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#f5f2eb]">{review.reviewerName}</span>
              {review.isVerifiedPurchase && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: '#0f2e1a', color: '#4ade80' }}
                >
                  Verified Purchase
                </span>
              )}
            </div>
            <p className="text-xs text-[#555]">{timeAgo(date)}</p>
          </div>
        </div>
        <StarRating value={review.stars} size={13} />
      </div>

      {/* Content */}
      {review.title && (
        <p className="text-md font-medium text-[#f5f2eb] mb-1">{review.title}</p>
      )}
      <p className="text-sm text-[#bbb] leading-relaxed">{review.body}</p>

      {/* Actions */}
      <div className="flex items-center gap-4 mt-4">
        <button
          type="button"
          onClick={markHelpful}
          className="flex items-center gap-1.5 text-xs text-[#555] hover:text-[#aaa] transition-colors"
        >
          <ThumbsUp size={12} />
          Helpful ({review.helpfulCount})
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-[#555] hover:text-[#aaa] transition-colors"
        >
          <Flag size={12} />
          Report
        </button>
        {isSeller && !review.sellerReply && (
          <button
            type="button"
            onClick={() => setReplyOpen(!replyOpen)}
            className="flex items-center gap-1.5 text-xs ml-auto transition-colors"
            style={{ color: '#f5b800' }}
          >
            {replyOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Reply to review
          </button>
        )}
      </div>

      {/* Reply form */}
      {replyOpen && (
        <div className="mt-4 space-y-2">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write your reply..."
            rows={3}
            className="w-full px-3 py-2.5 rounded-lg border text-sm resize-none"
            style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
          />
          <button
            type="button"
            onClick={postReply}
            disabled={posting}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: '#f5b800', color: '#000' }}
          >
            Post Reply
          </button>
        </div>
      )}

      {/* Seller reply */}
      {review.sellerReply && (
        <div
          className="mt-4 p-3 rounded-lg"
          style={{ borderLeft: '3px solid #f5b800', background: '#1a1500' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs px-1.5 py-0.5 rounded font-medium"
              style={{ background: '#f5b800', color: '#000' }}
            >
              Author
            </span>
          </div>
          <p className="text-sm text-[#ccc]">{review.sellerReply.text}</p>
        </div>
      )}
    </div>
  );
}
