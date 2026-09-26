import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ error: 'New subscriptions are currently unavailable.' }, { status: 503 });
}
