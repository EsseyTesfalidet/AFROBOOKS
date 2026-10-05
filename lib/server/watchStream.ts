import { WatchError } from './watchErrors';
import type { WatchAsset } from '@/types/video';

export class StreamUploadRejectedError extends WatchError {}

export function validStreamUploadUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.hash
      && /^(?:[a-z0-9-]+\.)*upload\.(?:videodelivery\.net|cloudflarestream\.com)$/i.test(url.hostname)
      && url.pathname !== '/';
  } catch { return false; }
}

export function streamConfigured() {
  return /^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_STREAM_ACCOUNT_ID ?? '') && !!process.env.CLOUDFLARE_STREAM_API_TOKEN;
}
function endpoint(path: string) {
  if (!streamConfigured()) throw new WatchError(503, 'Video hosting is being prepared. Please try again once it is available.');
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_STREAM_ACCOUNT_ID}/stream${path}`;
}
async function streamFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(endpoint(path), {
    ...init, cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}`, ...init.headers },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => null) as { errors?: { code?: number }[] } | null;
    const codes = details?.errors?.map(error => error.code).filter(code => Number.isInteger(code)).slice(0, 3).join(',');
    const message = response.status === 401 || response.status === 403
      ? 'Cloudflare denied video hosting access. The administrator must check the Stream API token and account permissions.'
      : response.status === 429 ? 'Cloudflare is busy. Wait a moment, then retry the upload.'
      : `Cloudflare could not accept the video request (HTTP ${response.status}${codes ? `, code ${codes}` : ''}). Check Stream storage and account settings.`;
    // Only an explicit client rejection proves no upload was allocated. Keep
    // reservations after timeouts and server errors to prevent duplicate assets.
    const rejectedUpload = path === '?direct_user=true' && [400, 401, 403, 404, 413, 415, 422, 429].includes(response.status);
    throw rejectedUpload ? new StreamUploadRejectedError(502, message) : new WatchError(502, message);
  }
  return response;
}
async function streamJson<T>(path: string, body?: unknown) {
  const response = await streamFetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json() as { success: boolean; result: T };
  if (!data.success || !data.result) throw new WatchError(502, 'The video service returned an incomplete response.');
  return data.result;
}
export async function createStreamUpload(creatorId: string, size: number, maximumSeconds: number): Promise<WatchAsset> {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const encode = (value: string) => Buffer.from(value).toString('base64');
  const response = await streamFetch('?direct_user=true', {
    method: 'POST', headers: {
      'Tus-Resumable': '1.0.0', 'Upload-Length': String(size), 'Upload-Creator': creatorId,
      'Upload-Metadata': `maxDurationSeconds ${encode(String(maximumSeconds))},requiresignedurls,expiry ${encode(new Date(expiresAt).toISOString())}`,
    },
  });
  const uid = response.headers.get('stream-media-id') ?? '';
  const uploadUrl = response.headers.get('location') ?? '';
  if (!/^[a-f0-9]{32}$/i.test(uid) || !validStreamUploadUrl(uploadUrl)) {
    // The returned URL is a bearer credential: never log it or include it in an error.
    let host = 'missing';
    try { host = new URL(uploadUrl).hostname.replace(/[^a-z0-9.-]/gi, '').slice(0, 100); } catch { /* Invalid URL. */ }
    const message = `Cloudflare returned an unsupported upload response (host: ${host}; video ID: ${/^[a-f0-9]{32}$/i.test(uid) ? 'valid' : 'missing or invalid'}).`;
    if (/^[a-f0-9]{32}$/i.test(uid)) {
      // This allocation was just created by this request and its URL has never
      // reached the browser. Release quota only after provider deletion succeeds.
      await streamFetch(`/${uid}`, { method: 'DELETE' });
      throw new StreamUploadRejectedError(502, message);
    }
    throw new WatchError(502, message);
  }
  return { uid, uploadUrl, expiresAt, size, maximumSeconds, ready: false, duration: 0, captions: [] };
}

export async function inspectStreamUpload(uid: string) {
  if (!/^[a-f0-9]{32}$/i.test(uid)) throw new WatchError(400, 'Invalid upload ID.');
  return streamJson<{ creator?: string; created?: string; readyToStream?: boolean; duration?: number; maxDurationSeconds?: number; status?: { state?: string } }>(`/${uid}`);
}

export async function deleteUnfinishedStreamUpload(uid: string) {
  if (!/^[a-f0-9]{32}$/i.test(uid)) throw new WatchError(400, 'Invalid upload ID.');
  // Only the verified, recorded recovery workflow can tolerate an already
  // deleted allocation after a lost response. Never expose this to creators.
  const response = await fetch(endpoint(`/${uid}`), {
    method: 'DELETE', cache: 'no-store', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_STREAM_API_TOKEN}` },
  });
  if (!response.ok && response.status !== 404) throw new WatchError(502, 'Cloudflare could not release this unused upload. The reservation has been kept; retry recovery.');
}
export async function streamAssetStatus(uid: string) {
  const data = await streamJson<{ readyToStream: boolean; requireSignedURLs: boolean; duration: number; status: { state: string; pctComplete?: string } }>(`/${uid}`);
  if (!data.requireSignedURLs) throw new WatchError(409, 'This video must use private playback before it can be published.');
  if (data.status?.state === 'error') throw new WatchError(409, 'Video processing failed. Contact support to replace this upload.');
  const percent = Number(data.status?.pctComplete);
  return { ready: data.readyToStream === true, duration: Math.max(0, data.duration || 0), state: data.status?.state || 'unknown', percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : null };
}

export async function streamHostingStatus() {
  const [videos, storage] = await Promise.all([
    streamJson<{ uid: string; creator?: string; created?: string; readyToStream?: boolean; uploadExpiry?: string; maxDurationSeconds?: number; status?: { state?: string } }[]>('?limit=20'),
    streamJson<{ totalStorageMinutes?: number; totalStorageMinutesLimit?: number; videoCount?: number }>('/storage-usage'),
  ]);
  return { connected: true, checkedAt: Date.now(), storage: { usedMinutes: storage.totalStorageMinutes ?? null, limitMinutes: storage.totalStorageMinutesLimit ?? null, videoCount: storage.videoCount ?? null }, recentUploads: videos.map(video => ({ uid: video.uid, creator: video.creator || '', created: video.created || '', ready: video.readyToStream === true, state: video.status?.state || 'unknown', uploadExpiry: video.uploadExpiry || '', maximumSeconds: video.maxDurationSeconds || 0 })) };
}
export async function testStreamUploadAccess() {
  // Test provisioning only: no video bytes are uploaded or published. Remove
  // the test allocation immediately so it does not consume hosting capacity.
  const asset = await createStreamUpload('afrobooks-hosting-check', 1, 60);
  try {
    const response = await fetch(asset.uploadUrl, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok || response.headers.get('upload-offset') !== '0') throw new WatchError(502, 'Cloudflare created the upload but its resumable endpoint is not responding.');
  } finally { await streamFetch(`/${asset.uid}`, { method: 'DELETE' }); }
  return { ok: true };
}
export async function streamPlaybackToken(uid: string, duration: number) {
  // Short-lived bearer access. Signing protects access; it is not DRM.
  const expiresAt = Math.floor(Date.now() / 1000) + Math.min(4 * 3600, Math.max(3600, Math.ceil(duration) + 900));
  const result = await streamJson<{ token: string }>(`/${uid}/token`, { exp: expiresAt, downloadable: false });
  if (!result.token) throw new WatchError(502, 'Playback is temporarily unavailable.');
  return { token: result.token, expiresAt };
}
export async function streamPosterBytes(uid: string, duration: number) {
  const { token } = await streamPlaybackToken(uid, duration);
  // Look past the opening fade while keeping short clips within their length.
  const time = Math.min(30, Math.max(0, duration / 10));
  const response = await fetch(`https://videodelivery.net/${encodeURIComponent(token)}/thumbnails/thumbnail.jpg?time=${time}s&width=854&height=480&fit=fill`, { cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok || !response.body) throw new WatchError(502, 'The automatic cover is not available yet.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 3_000_000) throw new WatchError(502, 'The automatic cover is too large.'); chunks.push(value); }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function uploadStreamCaptions(uid: string, language: string, text: string) {
  const body = new FormData();
  body.set('file', new Blob([text], { type: 'text/vtt; charset=utf-8' }), `${language}.vtt`);
  const response = await streamFetch(`/${uid}/captions/${language}`, { method: 'PUT', body });
  const data = await response.json();
  if (!data.success) throw new WatchError(502, 'Subtitles were not accepted. Check the language code and WebVTT file.');
}
