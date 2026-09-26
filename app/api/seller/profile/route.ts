import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { DEFAULT_SELLER_VERIFICATION_STATUS, hasCompletedSellerVerification } from '@/lib/sellerVerification';

const schema = z.object({
  becomeSeller: z.boolean().optional(),
  penName: z.string().max(120).nullable().optional(),
  website: z.string().max(500).optional(),
  socialLinks: z.object({ twitter: z.string().max(500), instagram: z.string().max(500), linkedin: z.string().max(500), goodreads: z.string().max(500) }).optional(),
}).strict();

export async function POST(req: NextRequest) {
  try {
    const user = await requireRequestUser(req);
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid profile fields' }, { status: 400 });
    const { becomeSeller, ...profile } = parsed.data;
    if (user.role === 'buyer' && !becomeSeller) return NextResponse.json({ error: 'Author account required' }, { status: 403 });
    const db = await getAdminDb();
    const authUser = await (await getAdminAuth()).getUser(user.uid);
    const ref = db.collection('sellers').doc(user.uid);
    await db.runTransaction(async (tx) => {
      const [sellerSnap, userSnap, settingsSnap, books] = await Promise.all([
        tx.get(ref), tx.get(db.collection('users').doc(user.uid)),
        tx.get(db.collection('platformSettings').doc('global')),
        tx.get(db.collection('books').where('sellerId', '==', user.uid)),
      ]);
      if (becomeSeller && settingsSnap.data()?.newSellerSignupsOpen === false) throw new Error('Author signups are currently closed');
      const existing = sellerSnap.data() ?? {};
      const verificationStatus = {
        ...DEFAULT_SELLER_VERIFICATION_STATUS,
        ...existing.verificationStatus,
        emailVerified: authUser.emailVerified,
        bioAdded: (userSnap.data()?.bio ?? '').trim().length >= 50,
        firstBookPublished: books.docs.some((book) => book.data().status === 'live'),
        tenSalesReached: (existing.totalSales ?? 0) >= 10,
      };
      tx.set(ref, {
        ...(!sellerSnap.exists ? {
          uid: user.uid, penName: null, website: '',
          socialLinks: { twitter: '', instagram: '', linkedin: '', goodreads: '' },
          stripeAccountId: null, stripeAccountStatus: 'not_connected',
          taxFormType: null, taxFormStatus: 'not_submitted', pendingBalance: 0,
          totalEarnings: 0, payoutSchedule: 'monthly', nextPayoutDate: new Date(),
          followersCount: 0, totalSales: 0, averageRating: 0, createdAt: new Date(),
        } : {}),
        ...profile, verificationStatus,
        isVerified: hasCompletedSellerVerification(verificationStatus), updatedAt: new Date(),
      }, { merge: true });
      if (becomeSeller && userSnap.data()?.role === 'buyer') {
        tx.update(userSnap.ref, { role: 'both', updatedAt: new Date() });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === 'Unauthorized';
    return NextResponse.json({ error: unauthorized ? 'Unauthorized' : 'Unable to save author profile' }, { status: unauthorized ? 401 : 400 });
  }
}
