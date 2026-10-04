'use client';

import { useEffect } from 'react';
import { purchaseHapticOnce } from '@/lib/app/haptics';

export default function PurchaseFeedback({ receiptKey }: { receiptKey: string }) {
  useEffect(() => { purchaseHapticOnce(receiptKey); }, [receiptKey]);
  return null;
}
