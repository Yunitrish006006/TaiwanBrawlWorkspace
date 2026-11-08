import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildGameReleaseAssetsBatch,
} from '../../taiwan_brawl_back/scripts/package-game-release.mjs';
import {
  signGameCatalog,
} from '../../taiwan_brawl_back/scripts/sign-game-catalog.mjs';
import {
  signGameResource,
} from '../../taiwan_brawl_back/scripts/sign-game-resource.mjs';

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url));
const frontendRoot = join(workspaceRoot, '..', 'taiwan_brawl_front');
const moduleSourcePath = join(
  frontendRoot,
  'packages/games/street_scrap/lib/src/street_scrap_module.dart',
);

export const streetScrapPreviewResourceKeyId = 'preview-street-scrap-resource';
export const streetScrapPreviewCatalogKeyId = 'preview-street-scrap-catalog';
// Preview keys are generated per process, so a longer cache window improves
// local iteration without changing the production catalog signer's 24h default.
export const streetScrapPreviewCatalogLifetimeHours = 24 * 30;
export const streetScrapProductionApiOrigin =
  'https://taiwan-brawl-api.yunitrish0419.workers.dev';

export const streetScrapResourceSources = [
  {
    idConstant: 'streetScrapContentResourceId',
    file: 'frontend:packages/games/street_scrap/resources/data/street-scrap-content-chapters-0-4-v1.json',
    contentType: 'application/json',
  },
  {
    idConstant: 'streetScrapChapter5ResourceId',
    file: 'frontend:packages/games/street_scrap/resources/data/street-scrap-content-chapter-5-v1.json',
    contentType: 'application/json',
  },
  {
    idConstant: 'streetScrapArtResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/street-scrap-art-v0.1.0.png',
    contentType: 'image/png',
  },
  {
    idConstant: 'streetScrapThreadSpoolArtResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/street-scrap-art-thread-spool-v0.1.0.png',
    contentType: 'image/png',
  },
  {
    idConstant: 'streetScrapMaterialAtlasResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/street-scrap-art-material-atlas-v0.3.0.png',
    contentType: 'image/png',
  },
  {
    idConstant: 'streetScrapToolAtlasResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/street-scrap-art-tool-atlas-v0.1.0.png',
    contentType: 'image/png',
  },
  {
    idConstant: 'streetScrapMaterialPackArtResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/street-scrap-art-material-pack-v0.1.0.png',
    contentType: 'image/png',
  },
  {
    idConstant: 'streetScrapMineralPackArtResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/street-scrap-art-mineral-pack-v0.1.0.png',
    contentType: 'image/png',
  },
  {
    idConstant: 'streetScrapWoodChipBundleArtResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/street-scrap-art-wood-chip-bundle-v0.1.0.png',
    contentType: 'image/png',
  },
  {
    idConstant: 'streetScrapFishingSceneArtResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/dock-fishing-background-v0.1.0.png',
    contentType: 'image/png',
  },
  {
    idConstant: 'streetScrapProtagonistArtResourceId',
    file: 'frontend:packages/games/street_scrap/resources/art/street-scrap-protagonist-v0.1.0.json',
    contentType: 'application/json',
  },
];

function extractBalancedBlock(source, start, open, close) {
  const openingIndex = source.indexOf(open, start);
  if (openingIndex < 0) throw new Error(`Dart ${open} block was not found.`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = openingIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close && --depth === 0) return source.slice(openingIndex + 1, index);
  }
  throw new Error(`Dart ${open} block was not closed.`);
}

function readTopLevelMapBlocks(source) {
  const blocks = [];
  let depth = 0;
  let start = -1;
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        blocks.push(source.slice(start, index + 1));
        start = -1;
      }
    }
  }
  if (depth !== 0) throw new Error('Dart manifest contains an unclosed map.');
  return blocks;
}

function readDartStringListConstant(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const match = new RegExp(`const\\s+${escaped}\\s*=\\s*<String>\\s*\\[([\\s\\S]*?)\\]`).exec(source);
  if (!match) throw new Error(`Dart string-list constant ${name} was not found.`);
  return [...match[1].matchAll(/'([^']*)'/g)].map((item) => item[1]);
}

function readMapField(block, field, pattern) {
  const escaped = field.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  const match = new RegExp(`['"]?${escaped}['"]?\\s*:\\s*(${pattern})`).exec(block);
  if (!match) throw new Error(`Street Scrap package manifest is missing ${field}.`);
  return match[1];
}

function readPackageResourceManifest(source) {
  const marker = source.indexOf("'resources':");
  if (marker < 0) throw new Error('Street Scrap package manifest has no resources list.');
  const resourceList = extractBalancedBlock(source, marker, '[', ']');
  const resources = readTopLevelMapBlocks(resourceList).map((block) => {
    const dependenciesStart = block.indexOf("'dependencies':");
    const dependencyList = dependenciesStart < 0 ||
      block.slice(dependenciesStart).startsWith("'dependencies': const")
      ? []
      : readTopLevelMapBlocks(extractBalancedBlock(block, dependenciesStart, '[', ']'));
    return {
      idConstant: readMapField(block, 'resourceId', '[A-Za-z_$][\\w$]*'),
      versionConstant: readMapField(block, 'version', '[A-Za-z_$][\\w$]*'),
      sha256Constant: readMapField(block, 'sha256', '[A-Za-z_$][\\w$]*'),
      schemaConstant: readMapField(block, 'payloadSchemaVersion', '[A-Za-z_$][\\w$]*'),
      kind: readMapField(block, 'kind', "'[^']*'").slice(1, -1),
      affectsGameplay: readMapField(block, 'affectsGameplay', 'true|false') === 'true',
      required: readMapField(block, 'required', 'true|false') === 'true',
      dependencies: dependencyList.map((dependency) => ({
        kind: readMapField(dependency, 'kind', "'[^']*'").slice(1, -1),
        idConstant: readMapField(dependency, 'id', '[A-Za-z_$][\\w$]*'),
        versionRange: readMapField(dependency, 'versionRange', "'[^']*'").slice(1, -1),
        optional: readMapField(dependency, 'optional', 'true|false') === 'true',
      })),
      platformsConstant: readMapField(block, 'platforms', '[A-Za-z_$][\\w$]*'),
      displayNameKey: readMapField(block, 'displayNameKey', "'[^']*'").slice(1, -1),
      descriptionKey: readMapField(block, 'descriptionKey', "'[^']*'").slice(1, -1),
    };
  });
  if (resources.length === 0) throw new Error('Street Scrap package manifest contains no resources.');
  return resources;
}

function readDartStringConstant(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`const\\s+${escaped}\\s*=\\s*'([^']+)'`).exec(source);
  if (!match) throw new Error(`Dart string constant ${name} was not found.`);
  return match[1];
}

function readDartIntConstant(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`const\\s+${escaped}\\s*=\\s*(\\d+)`).exec(source);
  if (!match) throw new Error(`Dart integer constant ${name} was not found.`);
  return Number(match[1]);
}

function generateEd25519Keys() {
  const pair = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }),
    publicKeyBytes: Buffer.from(pair.publicKey.export({ format: 'jwk' }).x, 'base64url'),
  };
}

/**
 * Creates a signed, in-memory preview catalog from the checked-in source
 * payloads. Every invocation creates new development keys; private keys never
 * leave this process and are never written to disk.
 */
export async function createStreetScrapPreviewRelease({
  apiOrigin = streetScrapProductionApiOrigin,
  now = new Date(),
} = {}) {
  const moduleSource = await readFile(moduleSourcePath, 'utf8');
  const resourceKeys = generateEd25519Keys();
  const catalogKeys = generateEd25519Keys();
  const moduleId = readDartStringConstant(moduleSource, 'streetScrapModuleId');
  const packageResources = readPackageResourceManifest(moduleSource);
  if (packageResources.length !== streetScrapResourceSources.length) {
    throw new Error(`Expected ${streetScrapResourceSources.length} package resources, found ${packageResources.length}.`);
  }

  const resources = [];
  const catalogResources = [];
  for (const source of streetScrapResourceSources) {
    const metadata = packageResources.find(({ idConstant }) => idConstant === source.idConstant);
    if (!metadata) throw new Error(`Package manifest has no resource for ${source.idConstant}.`);
    const resourceId = readDartStringConstant(moduleSource, metadata.idConstant);
    const version = readDartStringConstant(moduleSource, metadata.versionConstant);
    const declaredSha256 = readDartStringConstant(moduleSource, metadata.sha256Constant);
    const payloadSchemaVersion = readDartIntConstant(moduleSource, metadata.schemaConstant);
    const platforms = readDartStringListConstant(moduleSource, metadata.platformsConstant);
    const payloadPath = source.file.startsWith('frontend:')
      ? join(frontendRoot, source.file.slice('frontend:'.length))
      : join(workspaceRoot, source.file);
    const payload = await readFile(payloadPath);
    const sha256 = createHash('sha256').update(payload).digest('hex');
    if (sha256 !== declaredSha256) {
      throw new Error(`${resourceId} payload SHA-256 does not match the package manifest.`);
    }

    const resource = signGameResource({
      moduleId,
      resourceId,
      version,
      payload,
      privateKeyPem: resourceKeys.privateKeyPem,
      signingKeyId: streetScrapPreviewResourceKeyId,
      contentType: source.contentType,
      baseUrl: apiOrigin,
      payloadSchemaVersion,
    });
    const dependencies = metadata.dependencies.map((dependency) => ({
      kind: dependency.kind,
      id: readDartStringConstant(moduleSource, dependency.idConstant),
      versionRange: dependency.versionRange,
      optional: dependency.optional,
    }));
    resources.push({ source: { ...metadata, resourceId, version }, payload, resource });
    catalogResources.push({
      resourceId,
      version,
      kind: metadata.kind,
      sha256,
      affectsGameplay: metadata.affectsGameplay,
      payloadSchemaVersion,
      downloadUrl: resource.downloadUrl,
      byteLength: resource.byteLength,
      signature: resource.signature,
      signingKeyId: resource.signingKeyId,
      required: metadata.required,
      dependencies,
      activationGroup: null,
      platforms,
      displayNameKey: metadata.displayNameKey,
      descriptionKey: metadata.descriptionKey,
    });
  }

  const publisher = readDartStringConstant(moduleSource, 'streetScrapPublisher');
  const catalogEnvelope = signGameCatalog({
    payload: {
      catalogVersion: 1,
      modules: [
        {
          moduleId,
          manifestVersion: readDartIntConstant(moduleSource, 'streetScrapManifestVersion'),
          kind: 'game',
          publisher,
          displayName: readDartStringConstant(moduleSource, 'streetScrapDisplayName'),
          description: readDartStringConstant(moduleSource, 'streetScrapDescription'),
          packageVersion: readDartStringConstant(moduleSource, 'streetScrapPackageVersion'),
          minimumShellVersion: readDartStringConstant(moduleSource, 'streetScrapMinimumShellVersion'),
          hostApiRange: readDartStringConstant(moduleSource, 'streetScrapHostApiRange'),
          dependencies: [],
          dataSchemaVersion: readDartIntConstant(moduleSource, 'streetScrapSaveSchemaVersion'),
          platforms: readDartStringListConstant(moduleSource, 'streetScrapSupportedPlatforms'),
          resources: catalogResources,
        },
      ],
    },
    publisher,
    signingKeyId: streetScrapPreviewCatalogKeyId,
    privateKeyPem: catalogKeys.privateKeyPem,
    now,
    expiresInHours: streetScrapPreviewCatalogLifetimeHours,
  });
  const kvEntries = buildGameReleaseAssetsBatch({
    resources: resources.map(({ payload, resource }) => ({ payload, resource })),
    catalogEnvelope,
    resourcePublicKeyPem: resourceKeys.publicKeyPem,
    catalogPublicKeyPem: catalogKeys.publicKeyPem,
  });
  const resourcePayloads = new Map(
    resources.map(({ resource, payload }) => [new URL(resource.downloadUrl).pathname, payload]),
  );
  const catalogTrustKeys = JSON.stringify({
    [streetScrapPreviewCatalogKeyId]: {
      publisher,
      publicKey: catalogKeys.publicKeyBytes.toString('base64url'),
    },
  });
  const resourcePublicKeys = JSON.stringify({
    [streetScrapPreviewResourceKeyId]: resourceKeys.publicKeyBytes.toString('base64url'),
  });

  return {
    moduleId,
    catalogEnvelope,
    catalogTrustKeys,
    resourcePublicKeys,
    catalogBase64: Buffer.from(JSON.stringify(catalogEnvelope)).toString('base64'),
    resources,
    resourcePayloads,
    kvEntries,
  };
}
