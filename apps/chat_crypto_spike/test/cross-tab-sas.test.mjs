import assert from 'node:assert/strict';
import test from 'node:test';
import { createCrossTabSasDevice } from '../src/cross-tab-sas.js';

async function waitFor(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for the peer browser session.');
}

test('two isolated crypto instances verify each other over a separate BroadcastChannel session', async () => {
  const sessionId = `test-${crypto.randomUUID()}`;
  let aState;
  let bState;
  const [a, b] = await Promise.all([
    createCrossTabSasDevice({ role: 'A', sessionId, onChange: (state) => { aState = state; } }),
    createCrossTabSasDevice({ role: 'B', sessionId, onChange: (state) => { bState = state; } }),
  ]);
  try {
    await a.start();
    await waitFor(() => bState?.requestReceived);
    await b.accept();
    await waitFor(() => aState?.emoji?.length === 7 && bState?.emoji?.length === 7, 5000).catch((error) => {
      throw new Error(`${error.message} A=${JSON.stringify(aState)} B=${JSON.stringify(bState)}`);
    });
    assert.deepEqual(aState.emoji, bState.emoji);

    await a.confirm();
    await waitFor(() => aState?.confirmed && !aState?.trusted && !bState?.trusted);
    assert.equal(aState.done, false);
    assert.equal(bState.done, false);

    await b.confirm();
    await waitFor(() => aState?.done && bState?.done && aState?.trusted && bState?.trusted).catch((error) => {
      throw new Error(`${error.message} A=${JSON.stringify(aState)} B=${JSON.stringify(bState)}`);
    });
  } finally {
    a.close();
    b.close();
  }
});

test('an incoming device session can cancel the request without establishing trust', async () => {
  const sessionId = `cancel-${crypto.randomUUID()}`;
  let aState;
  let bState;
  const [a, b] = await Promise.all([
    createCrossTabSasDevice({ role: 'A', sessionId, onChange: (state) => { aState = state; } }),
    createCrossTabSasDevice({ role: 'B', sessionId, onChange: (state) => { bState = state; } }),
  ]);
  try {
    await a.start();
    await waitFor(() => bState?.requestReceived);
    await b.cancel();
    await waitFor(() => aState?.cancelled && bState?.cancelled);
    assert.equal(aState.trusted, false);
    assert.equal(bState.trusted, false);
  } finally {
    a.close();
    b.close();
  }
});

test('an expired SAS session cancels the peer request and creates no trust', async () => {
  const sessionId = `timeout-${crypto.randomUUID()}`;
  let aState;
  let bState;
  const [a, b] = await Promise.all([
    createCrossTabSasDevice({ role: 'A', sessionId, sessionTimeoutMs: 1200, onChange: (state) => { aState = state; } }),
    createCrossTabSasDevice({ role: 'B', sessionId, onChange: (state) => { bState = state; } }),
  ]);
  try {
    await a.start();
    await waitFor(() => bState?.requestReceived);
    await b.accept();
    await waitFor(() => aState?.canPresent && bState?.canPresent);
    await waitFor(() => aState?.error?.includes('逾時') && aState?.cancelled && bState?.cancelled, 2500);
    assert.equal(aState.trusted, false);
    assert.equal(bState.trusted, false);
  } finally {
    a.close();
    b.close();
  }
});

test('mismatched SAS is explicitly rejected on both devices without trust', async () => {
  const sessionId = `mismatch-${crypto.randomUUID()}`;
  let aState;
  let bState;
  const [a, b] = await Promise.all([
    createCrossTabSasDevice({ role: 'A', sessionId, onChange: (state) => { aState = state; } }),
    createCrossTabSasDevice({ role: 'B', sessionId, onChange: (state) => { bState = state; } }),
  ]);
  try {
    await a.start();
    await waitFor(() => bState?.requestReceived);
    await b.accept();
    await waitFor(() => aState?.canPresent && bState?.canPresent);
    await a.rejectMismatch();
    await waitFor(() => aState?.cancelled && bState?.cancelled
      && aState?.cancelCode === 'm.mismatched_sas' && bState?.cancelCode === 'm.mismatched_sas');
    assert.equal(aState.trusted, false);
    assert.equal(bState.trusted, false);
  } finally {
    a.close();
    b.close();
  }
});
