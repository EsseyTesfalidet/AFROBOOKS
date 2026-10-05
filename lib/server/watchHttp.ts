import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { requireRequestUser } from './auth';
import { isSameOriginMutation } from './requestOrigin';
import { agreementRequiredResponse } from './legalAgreement';
import { WatchError } from './watchErrors';

export const watchJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
export function watchFailure(error: unknown) {
  if (error instanceof WatchError) return watchJson({ error: error.message }, error.status);
  if (error instanceof ZodError) return watchJson({ error: error.issues[0]?.message || 'Check the video details and try again.' }, 400);
  if (error instanceof Error && error.message === 'Unauthorized') return watchJson({ error: 'Please sign in to continue.' }, 401);
  console.error('Watch request failed', error instanceof Error ? error.name : 'UnknownError');
  return watchJson({ error: 'Videos are temporarily unavailable. Please try again.' }, 500);
}
export async function watchActor(request: NextRequest, agreement = false) {
  if (!isSameOriginMutation(request)) throw new WatchError(403, 'Please use AfroBooks to complete this action.');
  const actor = await requireRequestUser(request);
  if (agreement && agreementRequiredResponse(actor)) throw new WatchError(403, 'Please accept the current Terms and Privacy information before continuing.');
  return actor;
}
export async function watchBytes(request: Pick<NextRequest, 'headers' | 'body'>, maximum: number) {
  if (Number(request.headers.get('content-length') || 0) > maximum) throw new WatchError(413, 'This request is too large.');
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader(); const chunks: Buffer[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); throw new WatchError(413, 'This request is too large.'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, length);
  } finally { reader.releaseLock(); }
}
export async function watchBody(request: NextRequest, maximum = 600_000) {
  const text = (await watchBytes(request, maximum)).toString('utf8');
  try { return JSON.parse(text); } catch { throw new WatchError(400, 'Use a valid JSON request.'); }
}
