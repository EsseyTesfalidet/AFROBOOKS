import { getAdminDb } from '@/lib/firebase/admin';

export async function getPublicAuthor(id: string) {
  const db = await getAdminDb();
  const [userSnap, sellerSnap] = await Promise.all([
    db.collection('users').doc(id).get(), db.collection('sellers').doc(id).get(),
  ]);
  const user = userSnap.data();
  const seller = sellerSnap.data() ?? {};
  if (!user || !['seller', 'both', 'admin'].includes(user.role) || ['banned', 'suspended'].includes(user.status)) return null;
  return {
    author: { firstName: user.firstName ?? '', lastName: user.lastName ?? '', bio: user.bio ?? '', avatarUrl: user.avatarUrl ?? null },
    seller: {
      penName: seller.penName ?? null, website: seller.website ?? '', socialLinks: seller.socialLinks ?? {},
      isVerified: seller.isVerified === true, totalSales: seller.totalSales ?? 0,
      followersCount: seller.followersCount ?? 0, averageRating: seller.averageRating ?? 0,
    },
  };
}
