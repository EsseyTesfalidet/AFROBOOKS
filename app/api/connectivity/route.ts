export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ connected: true }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
