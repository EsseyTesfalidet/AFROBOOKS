import { NextResponse } from 'next/server';
import { paymentConfiguration } from '@/lib/stripe/config';

export async function GET() {
  return NextResponse.json({ available: paymentConfiguration(process.env).checkoutReady }, { headers: { 'Cache-Control': 'no-store' } });
}
