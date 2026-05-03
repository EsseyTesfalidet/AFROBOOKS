import { NextRequest, NextResponse } from 'next/server';

// Delegates to the setAdminRole Firebase Cloud Function so firebase-admin
// doesn't need to be bundled into the hosting deployment.
const FUNCTION_URL = `https://us-central1-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/setAdminRole`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
