import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

test('backend couples fixture remains identical to the canonical design fixture', () => {
  const canonical = JSON.parse(readFileSync(new URL('../docs/contracts/couple-days-v1.fixtures.json', import.meta.url)));
  const owner = JSON.parse(readFileSync(new URL('../../taiwan_brawl_back/database-tests/fixtures/couple-days-v1.json', import.meta.url)));
  assert.deepEqual(owner, canonical);
  const consumer = JSON.parse(readFileSync(new URL('../../taiwan_brawl_front/test/fixtures/couple-days-v1.json', import.meta.url)));
  assert.deepEqual(consumer, canonical);
});
