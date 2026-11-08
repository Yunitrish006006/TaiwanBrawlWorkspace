import { runTwoDeviceRoundtrip } from './two-device-roundtrip.js';

globalThis.chatCryptoSpikeRoundtrip = async () => {
  const result = await runTwoDeviceRoundtrip();
  return JSON.stringify({
    algorithm: result.algorithm,
    ciphertextBytes: result.ciphertextBytes,
    plaintextHiddenFromCiphertext: result.plaintextHiddenFromCiphertext,
    roomKeyDeliveredEncrypted: result.roomKeyDeliveredEncrypted,
    decryptedMessageMatches: result.decryptedBody.startsWith('local-only-message-'),
  });
};
