import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import test from 'node:test';
import { createPlanSelectorServer } from '../apps/plan_selector/server.mjs';

const appRoot = new URL('../apps/plan_selector/', import.meta.url);

test('chat plan exposes every open product decision with stable options', async () => {
  const plan = JSON.parse(await readFile(new URL('data/chat.json', appRoot), 'utf8'));
  assert.equal(plan.planId, 'chat');
  assert.ok(plan.confirmed.length >= 4);
  assert.equal(plan.decisions.length, 8);
  const decisionIds = new Set();
  for (const decision of plan.decisions) {
    assert.ok(!decisionIds.has(decision.id), `duplicate decision ${decision.id}`);
    decisionIds.add(decision.id);
    assert.ok(decision.options.length >= 2, decision.id);
    assert.equal(new Set(decision.options.map((option) => option.id)).size, decision.options.length);
  }
  assert.ok(plan.decisions.some((decision) => decision.id === 'message-privacy'));
  assert.ok(plan.decisions.some((decision) => decision.id === 'notifications'));
  const multiDeviceAck = plan.decisions.find((decision) => decision.id === 'multi-device-relay-ack');
  assert.ok(multiDeviceAck.options.some((option) => option.id === 'all-active-devices-ack' && option.current));
  assert.ok(multiDeviceAck.options.some((option) => option.id === 'any-device-ack' && !option.current));
  const historySync = plan.decisions.find((decision) => decision.id === 'history-sync');
  assert.ok(historySync.options.some((option) => option.id === 'trusted-device-live-sync' && option.current));
  assert.ok(plan.decisions.some((decision) => decision.id === 'crypto-engine-spike'));
});

test('local plan selector serves the UI and validates, saves, loads and clears choices', async (t) => {
  const answerDir = await mkdtemp(join(tmpdir(), 'plan-selector-test-'));
  const server = createPlanSelectorServer({ port: 0, answerDir });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(answerDir, { recursive: true, force: true });
  });

  for (const path of ['/', '/style.css', '/app.mjs', '/data/chat.json']) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, path);
  }
  assert.equal((await fetch(`${baseUrl}/../server.mjs`)).status, 404);

  const save = await fetch(`${baseUrl}/api/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 1,
      planId: 'chat',
      selections: {
        'message-privacy': 'e2ee-required',
        signaling: 'hybrid',
        'multi-device-relay-ack': 'all-active-devices-ack',
      },
    }),
  });
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.ok(saved.savedAt);
  assert.deepEqual(saved.selections, {
    'message-privacy': 'e2ee-required',
    signaling: 'hybrid',
    'multi-device-relay-ack': 'all-active-devices-ack',
  });

  const load = await fetch(`${baseUrl}/api/answers?plan=chat`);
  assert.deepEqual((await load.json()).selections, saved.selections);

  const invalid = await fetch(`${baseUrl}/api/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schemaVersion: 1,
      planId: 'chat',
      selections: { signaling: 'unlisted-option' },
    }),
  });
  assert.equal(invalid.status, 400);

  const clear = await fetch(`${baseUrl}/api/answers?plan=chat`, { method: 'DELETE' });
  assert.equal(clear.status, 200);
  assert.deepEqual((await (await fetch(`${baseUrl}/api/answers?plan=chat`)).json()).selections, {});
});
