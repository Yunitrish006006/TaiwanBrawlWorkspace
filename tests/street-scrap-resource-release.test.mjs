import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createStreetScrapPreviewRelease,
  streetScrapPreviewCatalogLifetimeHours,
  streetScrapProductionApiOrigin,
  streetScrapResourceSources,
} from '../scripts/street-scrap-resource-release.mjs';
import {
  exactGameResourcesApiRouteHandler,
  handleGameResourceMediaRequest,
} from '../../taiwan_brawl_back/src/api/game_resources_api.js';

test('all eleven Street Scrap resources package and serve through one signed catalog', async () => {
  const apiOrigin = 'https://resources.test.invalid';
  const release = await createStreetScrapPreviewRelease({ apiOrigin });
  assert.equal(
    Date.parse(release.catalogEnvelope.expiresAt) - Date.parse(release.catalogEnvelope.issuedAt),
    streetScrapPreviewCatalogLifetimeHours * 60 * 60 * 1000,
  );
  assert.equal(streetScrapPreviewCatalogLifetimeHours, 24 * 30);
  assert.equal(release.resources.length, 11);
  const baseContent = release.resources.find(
    ({ source }) => source.resourceId === 'game.street-scrap.content.chapters-0-4',
  );
  assert.ok(baseContent);
  const baseContentPayload = JSON.parse(baseContent.payload.toString('utf8'));
  assert.equal(baseContentPayload.packVersion, '0.1.33');
  const pulpContainerPairings = baseContentPayload.recipes
    .find(({ id }) => id === 'ss.recipe.mix_pulp')
    .stateEffect.containers
    .filter(({ containerItemId }) => containerItemId === 'container.clean')
    .map(({ requiredContentItemId }) => requiredContentItemId)
    .sort();
  assert.deepEqual(pulpContainerPairings, ['water.filtered', 'water.turbid']);
  assert.ok(streetScrapResourceSources.every((source) =>
    Object.keys(source).sort().join(',') === 'contentType,file,idConstant'));
  const signedResources = release.catalogEnvelope.payload.modules[0].resources;
  assert.ok(signedResources.every(({ platforms }) =>
    JSON.stringify(platforms) === JSON.stringify(['web', 'android', 'ios', 'windows', 'macos', 'linux'])));
  const chapter5 = signedResources.find(
    ({ resourceId }) => resourceId === 'game.street-scrap.content.chapter-5',
  );
  assert.deepEqual(chapter5.dependencies, [{
    kind: 'resource',
    id: 'game.street-scrap.content.chapters-0-4',
    versionRange: '>=0.1.0 <0.2.0',
    optional: false,
  }]);
  assert.equal(release.catalogEnvelope.payload.modules[0].displayName, '街角拾荒');
  assert.equal(release.catalogEnvelope.payload.modules[0].manifestVersion, 1);
  assert.equal(release.kvEntries.length, 23);
  const materialAtlas = release.resources.find(
    ({ resource }) => resource.resourceId === 'game.street-scrap.art.material-atlas',
  );
  assert.ok(materialAtlas);
  assert.equal(materialAtlas.resource.version, '0.3.0');
  assert.equal(materialAtlas.payload.readUInt32BE(16), 768);
  assert.equal(materialAtlas.payload.readUInt32BE(20), 2304);
  assert.ok(materialAtlas.payload.byteLength < 2 * 1024 * 1024);
  assert.equal(
    createHash('sha256').update(materialAtlas.payload).digest('hex'),
    materialAtlas.resource.sha256,
  );
  const materialPack = release.resources.find(
    ({ resource }) => resource.resourceId === 'game.street-scrap.art.material-pack',
  );
  assert.ok(materialPack);
  assert.equal(materialPack.resource.version, '0.1.0');
  assert.equal(materialPack.resource.payloadSchemaVersion, 1);
  assert.deepEqual(
    materialPack.payload.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  assert.equal(materialPack.payload.readUInt32BE(16), 768);
  assert.equal(materialPack.payload.readUInt32BE(20), 768);
  assert.ok(materialPack.payload.byteLength < 2 * 1024 * 1024);
  assert.equal(
    createHash('sha256').update(materialPack.payload).digest('hex'),
    materialPack.resource.sha256,
  );
  assert.ok(release.catalogTrustKeys.length > 0);
  assert.ok(release.resourcePublicKeys.length > 0);

  const kv = new Map(release.kvEntries.map((entry) => [
    entry.key,
    entry.base64 ? Buffer.from(entry.value, 'base64') : entry.value,
  ]));
  const env = {
    STATIC_ASSETS: {
      async get(key, options) {
        const value = kv.get(key);
        if (value == null) return null;
        if (options?.type === 'arrayBuffer') {
          const bytes = Buffer.from(value);
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        }
        return Buffer.isBuffer(value) ? value.toString('utf8') : value;
      },
    },
  };

  const catalogRequest = new Request(`${apiOrigin}/api/games/catalog`);
  const catalogHandler = await exactGameResourcesApiRouteHandler(
    catalogRequest,
    env,
    new URL(catalogRequest.url),
  );
  assert.equal(typeof catalogHandler, 'function');
  const catalogResponse = await catalogHandler();
  assert.equal(catalogResponse.status, 200);
  const servedEnvelope = await catalogResponse.json();
  assert.equal(servedEnvelope.signature, release.catalogEnvelope.signature);
  assert.equal(servedEnvelope.payload.modules[0].resources.length, 11);

  for (const item of release.resources) {
    const request = new Request(item.resource.downloadUrl);
    const response = await handleGameResourceMediaRequest(
      request,
      env,
      new URL(request.url),
    );
    assert.equal(response.status, 200, item.resource.resourceId);
    assert.equal(await response.headers.get('ETag'), `\"${item.resource.sha256}\"`);
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      item.payload,
      `${item.resource.resourceId} download returns the exact signed payload`,
    );
  }
});

test('local Street Scrap preview keeps HTTPS signatures and routes downloads through loopback', async () => {
  const source = await readFile(
    new URL('../scripts/serve-street-scrap-preview.mjs', import.meta.url),
    'utf8',
  );
  assert.match(source, /const release = await createStreetScrapPreviewRelease\(\);/);
  assert.match(source, /`API_BASE_URL=http:\/\/127\.0\.0\.1:\$\{resourcePort\}`/);
  assert.match(source, /'PREVIEW_MODE=true'/);
  assert.match(source, /STREET_SCRAP_PREVIEW_BUILD_MODE \?\? 'release'/);
  assert.match(source, /STREET_SCRAP_PREVIEW_OUTPUT_DIR \?\? join\(frontendRoot, 'build', 'web'\)/);
  assert.match(source, /'build', 'web', '--release', '--no-pub', '--output', buildDirectory/);
  assert.match(source, /writeOfflineShellManifest\(buildDirectory\)/);
  assert.match(source, /Preview build mode must be debug or release/);
  const releaseSource = await readFile(
    new URL('../scripts/street-scrap-resource-release.mjs', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(releaseSource, /street_scrap_game_registration/);

  const release = await createStreetScrapPreviewRelease({ apiOrigin: streetScrapProductionApiOrigin });
  assert.equal(release.resources.length, 11);
  for (const { resource } of release.resources) {
    assert.equal(new URL(resource.downloadUrl).origin, streetScrapProductionApiOrigin);
    assert.equal(new URL(resource.downloadUrl).protocol, 'https:');
  }
});
