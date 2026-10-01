import { getAdminBucket } from '@/lib/firebase/admin';

export function bookFilePrefixes(sellerId: string, bookId: string) {
  if (!sellerId || !bookId || sellerId.includes('/') || bookId.includes('/')) {
    throw new Error('Invalid book file owner or identifier');
  }
  return [`covers/${sellerId}/${bookId}/`, `manuscripts/${sellerId}/${bookId}/`, `magazines/${sellerId}/${bookId}/`];
}

export async function deleteBookFiles(sellerId: string, bookId: string) {
  const prefixes = bookFilePrefixes(sellerId, bookId);
  const bucket = await getAdminBucket();
  for (const prefix of prefixes) {
    // Only this author's directory for this exact book. Never trust a URL in
    // editable book metadata as a deletion target.
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) await file.delete({ ignoreNotFound: true });
  }
  // Early uploads used covers/{bookId}/{filename}. Only delete direct files
  // in that legacy book directory; deeper paths belong to the newer layout.
  for (const folder of ['covers', 'manuscripts']) {
    const [files] = await bucket.getFiles({ prefix: `${folder}/${bookId}/` });
    for (const file of files) {
      if (file.name.split('/').length === 3) await file.delete({ ignoreNotFound: true });
    }
  }
}
