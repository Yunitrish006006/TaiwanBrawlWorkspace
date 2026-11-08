import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { proxyCouplePreviewApi } from '../intelligence/couple-preview-proxy.mjs';

test('preview preserves browser origin, cookie and JSON on accepted mutations', async t => {
  const { base, received } = await fixture(t);
  const response = await fetch(base + '/api/couples/requests/test/accept', {
    method: 'POST', headers: { Origin: base, Cookie: 'session_id=synthetic-session',
      'X-Expected-Account-ID': '7', 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId: 'synthetic-operation', timeZone: 'Asia/Taipei' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(received[0].host, new URL(base).host);
  assert.equal(received[0].account, '7');
  assert.equal(received[0].body.timeZone, 'Asia/Taipei');
  assert.equal(response.headers.get('set-cookie'), 'checked=yes; HttpOnly');
});

test('preview does not rewrite a foreign Origin to bypass the backend guard', async t => {
  const { base } = await fixture(t);
  const response = await fetch(base + '/api/couples/requests/test/accept', {
    method: 'POST', headers: { Origin: 'https://foreign.example', Cookie: 'session_id=synthetic-session' }, body: '{}',
  });
  assert.equal(response.status, 403);
});

test('preview retains native bearer auth without inventing an Origin', async t => {
  const { base, received } = await fixture(t);
  const response = await fetch(base + '/api/couples/requests/test/accept', {
    method: 'POST', headers: { Authorization: 'Bearer synthetic-session' }, body: '{}',
  });
  assert.equal(response.status, 200);
  assert.equal(received[0].origin, undefined);
});

async function fixture(t) {
  const received = [];
  // An authenticated upstream with the same origin contract as the real Worker.
  const upstream = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const item = { host: req.headers.host, origin: req.headers.origin,
      account: req.headers['x-expected-account-id'], body: JSON.parse(Buffer.concat(chunks).toString()) };
    received.push(item);
    if (req.headers.cookie !== 'session_id=synthetic-session' && req.headers.authorization !== 'Bearer synthetic-session') {
      res.writeHead(401); res.end(); return;
    }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      res.writeHead(403); res.end(); return;
    }
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'checked=yes; HttpOnly' });
    res.end('{"ok":true}');
  });
  await listen(upstream);
  const proxy = createServer((req, res) => proxyCouplePreviewApi(req, res, upstream.address().port));
  await listen(proxy);
  t.after(async () => {
    await Promise.all([proxy, upstream].map(server => new Promise(resolve => server.close(resolve))));
  });
  return { base: `http://127.0.0.1:${proxy.address().port}`, received };
}
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
}
