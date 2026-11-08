import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

test('crypto spike pins the browser candidate and keeps it out of production', () => {
  assert.equal(
    packageJson.dependencies['@matrix-org/matrix-sdk-crypto-wasm'],
    '18.9.0',
  );
  assert.equal(packageJson.dependencies['@signalapp/libsignal-client'], undefined);
});

test('production frontend has no dependency edge to the isolated spike', async () => {
  const frontendManifest =
    await readFile(
      new URL('../../../../taiwan_brawl_front/pubspec.yaml', import.meta.url),
      'utf8',
    );
  assert.doesNotMatch(
    frontendManifest,
    /chat_crypto_spike|matrix-sdk-crypto-wasm|libsignal-client/,
  );
});
