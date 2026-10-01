import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'node:stream';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { requireRequestUser } from '@/lib/server/auth';
import { authorizedMagazineFile, verifyMagazinePdf } from '@/lib/server/magazinePdf';
import { agreementRequiredResponse } from '@/lib/server/legalAgreement';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  // POST avoids older installed service workers' generic GET API caches.
  // Paid file bytes must never be reused across signed-in readers.
  if (req.nextUrl.searchParams.get('view') === 'read') return readPdf(req, { params });
  try {
    const user = await requireRequestUser(req);
    const agreementError = agreementRequiredResponse(user);
    if (agreementError) return agreementError;
    if (!['seller', 'both', 'admin'].includes(user.role)) return NextResponse.json({ error: 'Author account required' }, { status: 403 });
    const { bookId } = await params;
    const body = await req.json();
    if (!bookId || bookId.includes('/') || typeof body.path !== 'string' || body.path.length > 400) return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
    return NextResponse.json(await verifyMagazinePdf(await getAdminDb(), await getAdminBucket(), bookId, user.uid, body.path));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'Unauthorized' ? 'Unauthorized' : 'Unable to verify this magazine PDF. Check the file and save your draft again.' }, { status: error instanceof Error && error.message === 'Unauthorized' ? 401 : 400 });
  }
}

async function readPdf(req: NextRequest, { params }: { params: Promise<{ bookId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { bookId } = await params;
    if (!bookId || bookId.includes('/')) throw new Error('Invalid publication');
    const record = await authorizedMagazineFile(await getAdminDb(), bookId, user);
    const file = (await getAdminBucket()).file(record.path, { generation: record.generation });
    const [metadata] = await file.getMetadata();
    if (String(metadata.generation) !== record.generation || Number(metadata.size) !== record.size) throw new Error('File changed');
    // Stream through the authenticated route; no public Storage download URL.
    return new Response(Readable.toWeb(file.createReadStream()) as ReadableStream<Uint8Array>, {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline; filename="magazine.pdf"', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return NextResponse.json({ error: 'Magazine access unavailable' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
