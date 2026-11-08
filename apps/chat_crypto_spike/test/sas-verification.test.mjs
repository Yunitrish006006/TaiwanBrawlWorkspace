import assert from 'node:assert/strict';
import test from 'node:test';
import { createSasVerificationSession } from '../src/sas-verification.js';

test('mutual trust appears only after both devices confirm matching SAS emoji', async () => {
  const session = await createSasVerificationSession();
  try {
    assert.equal(session.aliceEmoji.length, 7);
    assert.deepEqual(session.aliceEmoji, session.bobEmoji);

    const afterAlice = await session.confirmAlice();
    assert.equal(afterAlice.aliceConfirmed, true);
    assert.equal(afterAlice.bobConfirmed, false);
    assert.equal(afterAlice.aliceTrustsBob, false);
    assert.equal(afterAlice.bobTrustsAlice, false);

    const afterBob = await session.confirmBob();
    assert.equal(afterBob.aliceDone, true);
    assert.equal(afterBob.bobDone, true);
    assert.equal(afterBob.aliceTrustsBob, true);
    assert.equal(afterBob.bobTrustsAlice, true);
  } finally {
    session.close();
  }
});

test('cancelling SAS notifies the other device without creating trust', async () => {
  const session = await createSasVerificationSession();
  try {
    const result = await session.cancel();
    assert.equal(result.cancelled, true);
    assert.equal(result.aliceTrustsBob, false);
    assert.equal(result.bobTrustsAlice, false);
  } finally {
    session.close();
  }
});
