import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRequestUser(request);
    if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { id } = await params;
    const db = await getAdminDb();
    const record = (await db.collection('verificationRequests').doc(id).get()).data();
    if (!record) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const bucket = getStorage().bucket();
    let path = record.filePath;
    if (!path && record.fileUrl) {
      const url = new URL(record.fileUrl);
      const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(url.pathname);
      if (url.hostname === 'firebasestorage.googleapis.com' && match && decodeURIComponent(match[1]) === bucket.name) path = decodeURIComponent(match[2]);
    }
    if (typeof path !== 'string' || !path.startsWith(`verification/${record.sellerId}/`) || path.includes('..')) return NextResponse.json({ error: 'File unavailable' }, { status: 404 });
    const file = bucket.file(path);
    const [metadata] = await file.getMetadata();
    const mime = metadata.contentType ?? '';
    if (Number(metadata.size) > 10 * 1024 * 1024 || !(mime.startsWith('image/') || mime === 'application/pdf')) return NextResponse.json({ error: 'Unsupported document' }, { status: 400 });
    const [data] = await file.download();
    return new NextResponse(new Uint8Array(data), { headers: {
      'Content-Type': mime, 'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
    } });
  } catch {
    return NextResponse.json({ error: 'Unable to open this verification document.' }, { status: 403 });
  }
}
