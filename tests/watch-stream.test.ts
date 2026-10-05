import { test } from 'node:test';
import assert from 'node:assert/strict';
import { streamPosterBytes } from '../lib/server/watchStream';

test('automatic covers use signed frame access, bound response sizes and handle provider failures', async () => {
  const originalFetch = globalThis.fetch;
  const account = process.env.CLOUDFLARE_STREAM_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_STREAM_API_TOKEN = 'test-only';
  let mode = 'ok';
  const image = Buffer.from('ffd8ffe000104a4649460001', 'hex');
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.cloudflare.com') {
      assert.equal(JSON.parse(String(init?.body)).downloadable, false);
      return Response.json({ success: true, result: { token: 'signed/token' } });
    }
    assert.equal(url.hostname, 'videodelivery.net');
    assert.equal(url.pathname, '/signed%2Ftoken/thumbnails/thumbnail.jpg');
    assert.equal(url.searchParams.get('time'), '0.5s');
    assert.equal(init?.redirect, 'error');
    if (mode === 'unavailable') return new Response(null, { status: 503 });
    return new Response(mode === 'large' ? new Uint8Array(3_000_001) : image);
  };
  try {
    assert.deepEqual(await streamPosterBytes('b'.repeat(32), 5), image);
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
