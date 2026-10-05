import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStreamUpload, StreamUploadRejectedError, streamPosterBytes, validStreamUploadUrl } from '../lib/server/watchStream';

test('upload URLs accept both Cloudflare domains without accepting lookalikes or credentials', () => {
  for (const host of ['upload.videodelivery.net', 'upload.cloudflarestream.com', 'region.upload.cloudflarestream.com']) {
    assert.equal(validStreamUploadUrl(`https://${host}/tus/token`), true);
  }
  for (const url of ['https://upload.cloudflarestream.com.evil.test/tus/token', 'http://upload.cloudflarestream.com/tus/token', 'https://user:pass@upload.cloudflarestream.com/tus/token', 'https://upload.cloudflarestream.com:444/tus/token', 'https://evil.test/tus/token', 'not a URL']) assert.equal(validStreamUploadUrl(url), false);
});

test('upload handoff preserves the signed URL and cleans up rejected responses before releasing quota', async () => {
  const originalFetch = globalThis.fetch;
  const account = process.env.CLOUDFLARE_STREAM_ACCOUNT_ID; const token = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = 'a'.repeat(32); process.env.CLOUDFLARE_STREAM_API_TOKEN = 'test-only';
  let host = 'upload.cloudflarestream.com'; let deletion = 0; let deletionFails = false;
  globalThis.fetch = async (_input, init) => {
    if (init?.method === 'DELETE') { deletion++; return new Response(null, { status: deletionFails ? 503 : 200 }); }
    return new Response(null, { status: 201, headers: { 'stream-media-id': 'b'.repeat(32), location: `https://${host}/tus/PRIVATE-TOKEN` } });
  };
  try {
    const asset = await createStreamUpload('creator', 1024, 60);
    assert.equal(asset.uploadUrl, 'https://upload.cloudflarestream.com/tus/PRIVATE-TOKEN'); assert.equal(deletion, 0);
    host = 'unexpected.example.test';
    await assert.rejects(createStreamUpload('creator', 1024, 60), error => error instanceof StreamUploadRejectedError && !error.message.includes('PRIVATE-TOKEN'));
    assert.equal(deletion, 1);
    deletionFails = true;
    await assert.rejects(createStreamUpload('creator', 1024, 60), error => error instanceof Error && !(error instanceof StreamUploadRejectedError));
  } finally {
    globalThis.fetch = originalFetch;
    if (account === undefined) delete process.env.CLOUDFLARE_STREAM_ACCOUNT_ID; else process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = account;
    if (token === undefined) delete process.env.CLOUDFLARE_STREAM_API_TOKEN; else process.env.CLOUDFLARE_STREAM_API_TOKEN = token;
  }
});

test('automatic covers use signed frame access, bound response sizes and handle provider failures', async () => {
  const originalFetch = globalThis.fetch;
  const account = process.env.CLOUDFLARE_STREAM_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_STREAM_API_TOKEN = 'test-only';
  let mode = 'ok';
  let expectedTime = '0.5s';
  const image = Buffer.from('ffd8ffe000104a4649460001', 'hex');
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.cloudflare.com') {
      assert.equal(JSON.parse(String(init?.body)).downloadable, false);
      return Response.json({ success: true, result: { token: 'signed/token' } });
    }
    assert.equal(url.hostname, 'videodelivery.net');
    assert.equal(url.pathname, '/signed%2Ftoken/thumbnails/thumbnail.jpg');
    assert.equal(url.searchParams.get('time'), expectedTime);
    assert.equal(init?.redirect, 'error');
    if (mode === 'unavailable') return new Response(null, { status: 503 });
    return new Response(mode === 'large' ? new Uint8Array(3_000_001) : image);
  };
  try {
    assert.deepEqual(await streamPosterBytes('b'.repeat(32), 5), image);
    expectedTime = '12s';
    assert.deepEqual(await streamPosterBytes('b'.repeat(32), 120), image);
    expectedTime = '30s';
    assert.deepEqual(await streamPosterBytes('b'.repeat(32), 720), image);
    expectedTime = '0.5s';
    mode = 'unavailable';
    await assert.rejects(streamPosterBytes('b'.repeat(32), 5), /not available/);
    mode = 'large';
    await assert.rejects(streamPosterBytes('b'.repeat(32), 5), /too large/);
  } finally {
    globalThis.fetch = originalFetch;
    if (account === undefined) delete process.env.CLOUDFLARE_STREAM_ACCOUNT_ID; else process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = account;
    if (apiToken === undefined) delete process.env.CLOUDFLARE_STREAM_API_TOKEN; else process.env.CLOUDFLARE_STREAM_API_TOKEN = apiToken;
  }
});
