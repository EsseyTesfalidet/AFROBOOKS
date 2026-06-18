'use client';

import { useState } from 'react';
import { Tag, X, CheckCircle } from 'lucide-react';
import { getDocs, collection, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { PromoCode } from '@/types/review';

interface Props {
  bookId: string;
  sellerId: string;
  bookPrice: number;
  onApply: (code: string, discount: number, bookId: string) => void;
  onRemove: () => void;
  appliedCode?: string | null;
}

export default function PromoCodeInput({
  bookId, sellerId, bookPrice, onApply, onRemove, appliedCode,
}: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleApply() {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const q = query(
        collection(db, 'promoCodes'),
        where('code', '==', code.trim().toUpperCase()),
        where('status', '==', 'active'),
        where('sellerId', '==', sellerId)
      );
      const snap = await getDocs(q);
      if (snap.empty) {
        setError('Invalid or expired promo code.');
        return;
      }
      const promoDoc = snap.docs[0].data() as PromoCode;
      const now = Timestamp.now();
      if (promoDoc.expiryDate.toMillis() < now.toMillis()) {
        setError('This promo code has expired.');
        return;
      }
      if (promoDoc.maxUses && promoDoc.currentUses >= promoDoc.maxUses) {
        setError('This promo code has reached its usage limit.');
        return;
      }
      if (promoDoc.applyTo === 'specific' && promoDoc.specificBookId !== bookId) {
        setError('This code does not apply to this book.');
        return;
      }

      let discount = 0;
      if (promoDoc.discountType === 'percentage') {
        discount = Math.round(bookPrice * (promoDoc.discountValue / 100));
      } else if (promoDoc.discountType === 'fixed') {
        discount = Math.min(promoDoc.discountValue, bookPrice);
      } else {
        discount = bookPrice;
      }

      onApply(code.trim().toUpperCase(), discount, bookId);
    } catch {
      setError('Failed to validate code. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (appliedCode) {
    return (
      <div
        className="flex items-center justify-between p-3 rounded-lg border"
        style={{ background: '#0f2e1a', borderColor: '#1a4a2a' }}
      >
        <div className="flex items-center gap-2">
          <CheckCircle size={14} style={{ color: '#4ade80' }} />
          <span className="text-sm font-medium" style={{ color: '#4ade80' }}>
            {appliedCode} applied
          </span>
        </div>
        <button type="button" onClick={onRemove}>
          <X size={14} style={{ color: '#4ade80' }} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-[#aaa] mb-2">Have a promo code?</p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER CODE"
          className="flex-1 px-3 py-2.5 rounded-lg border text-sm font-medium tracking-wider"
          style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
        />
        <button
          type="button"
          onClick={handleApply}
          disabled={loading}
          className="px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: '#f5b800', color: '#000' }}
        >
          Apply
        </button>
      </div>
      {error && <p className="mt-1.5 text-xs text-[#e8442a]">{error}</p>}
    </div>
  );
}
