'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { createReview } from '@/lib/firebase/firestore';
import StarRating from '@/components/shared/StarRating';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import type { User } from '@/types/user';

const schema = z.object({
  title: z.string().min(3, 'Add a short title'),
  body: z.string().min(20, 'Tell us a bit more (20+ chars)'),
});

type FormData = z.infer<typeof schema>;

interface Props {
  bookId: string;
  user: User;
  onSuccess: () => void;
}

export default function ReviewForm({ bookId, user, onSuccess }: Props) {
  const [stars, setStars] = useState(5);
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit({ title, body }: FormData) {
    const initials = `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase();
    await createReview({
      bookId,
      reviewerId: user.uid,
      reviewerName: `${user.firstName} ${user.lastName}`,
      reviewerInitials: initials,
      reviewerAvatarUrl: user.avatarUrl,
      isVerifiedPurchase: true,
      stars,
      title,
      body,
      helpfulCount: 0,
      isReported: false,
      reportReason: null,
      sellerReply: null,
      status: 'active',
    });
    setSuccess(true);
    onSuccess();
  }

  if (success) {
    return (
      <div
        className="p-4 rounded-xl border text-center"
        style={{ background: '#0f2e1a', borderColor: '#1a4a2a' }}
      >
        <p className="text-sm font-medium" style={{ color: '#4ade80' }}>
          Thanks for your review!
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="p-5 rounded-xl border space-y-4"
      style={{ background: '#161616', borderColor: '#2a2a2a' }}
    >
      <h3 className="font-display text-display-sm text-white">Write a Review</h3>

      <div>
        <p className="text-sm text-[#aaa] mb-2">Your rating</p>
        <StarRating value={stars} size={20} interactive onChange={setStars} />
      </div>

      <div>
        <label htmlFor="review-title" className="block text-sm text-[#aaa] mb-1.5">
          Title
        </label>
        <input
          id="review-title"
          type="text"
          {...register('title')}
          placeholder="Summarize your thoughts"
          className="w-full px-3.5 py-2.5 rounded-lg border text-sm"
          style={{ background: '#1a1a1a', borderColor: errors.title ? '#e8442a' : '#333', color: '#f5f2eb' }}
        />
        {errors.title && <p className="mt-1 text-xs text-[#e8442a]">{errors.title.message}</p>}
      </div>

      <div>
        <label htmlFor="review-body" className="block text-sm text-[#aaa] mb-1.5">
          Review
        </label>
        <textarea
          id="review-body"
          {...register('body')}
          placeholder="Share your experience with this book..."
          rows={4}
          className="w-full px-3.5 py-2.5 rounded-lg border text-sm resize-none"
          style={{ background: '#1a1a1a', borderColor: errors.body ? '#e8442a' : '#333', color: '#f5f2eb' }}
        />
        {errors.body && <p className="mt-1 text-xs text-[#e8442a]">{errors.body.message}</p>}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
        style={{ background: '#e8442a', color: '#fff' }}
      >
        {isSubmitting && <LoadingSpinner size={14} color="#fff" />}
        Submit Review
      </button>
    </form>
  );
}
