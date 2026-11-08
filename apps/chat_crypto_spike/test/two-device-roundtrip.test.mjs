import assert from 'node:assert/strict';
import test from 'node:test';
import { runTwoDeviceRoundtrip } from '../src/two-device-roundtrip.js';

test('two independent crypto devices exchange a room key and decrypt ciphertext', async () => {
  const result = await runTwoDeviceRoundtrip();

  assert.equal(result.algorithm, 'm.megolm.v1.aes-sha2');
  assert.equal(result.plaintextHiddenFromCiphertext, true);
  assert.equal(result.roomKeyDeliveredEncrypted, true);
  assert.equal(result.crossSignedPolicyRejected, true);
  assert.match(result.decryptedBody, /^local-only-message-/);
  assert.ok(result.ciphertextBytes > 0);
});
