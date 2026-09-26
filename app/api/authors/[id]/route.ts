import { NextResponse } from 'next/server';
import { getPublicAuthor } from '@/lib/server/publicAuthor';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const author = await getPublicAuthor(id);
  return NextResponse.json(author ?? { error: 'Author not found' }, { status: author ? 200 : 404 });
}
