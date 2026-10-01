import { NextResponse } from 'next/server';

// Retired: sensitive operations belong to trusted server workflows.
export async function POST() {
  return NextResponse.json({ error: 'This email endpoint is no longer available' }, { status: 410 });
}
