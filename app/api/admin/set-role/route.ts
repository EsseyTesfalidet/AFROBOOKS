import { NextResponse } from 'next/server';

// Retired: sensitive operations belong to trusted server workflows.
export async function POST() {
  return NextResponse.json({ error: 'Role setup is not available through the website' }, { status: 410 });
}
