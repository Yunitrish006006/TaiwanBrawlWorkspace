import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createStreetScrapPreviewRelease,
} from './street-scrap-resource-release.mjs';

const webPort = Number(process.env.STREET_SCRAP_PREVIEW_WEB_PORT ?? 8789);
const resourcePort = Number(process.env.STREET_SCRAP_PREVIEW_RESOURCE_PORT ?? 8790);
const flutterBin = process.env.FLUTTER_BIN ?? 'flutter';
const previewBuildMode = process.env.STREET_SCRAP_PREVIEW_BUILD_MODE ?? 'release';
if (!Number.isSafeInteger(webPort) || webPort < 1 || webPort > 65535 ||
    !Number.isSafeInteger(resourcePort) || resourcePort < 1 || resourcePort > 65535 ||
    webPort === resourcePort) {
  throw new RangeError('Preview web/resource ports must be distinct valid TCP ports.');
}
if (!['debug', 'release'].includes(previewBuildMode)) {
  throw new RangeError('Preview build mode must be debug or release.');
}

const release = await createStreetScrapPreviewRelease();
const frontendRoot = join(fileURLToPath(new URL('..', import.meta.url)), '..', 'taiwan_brawl_front');
const buildDirectory = resolve(
  process.env.STREET_SCRAP_PREVIEW_OUTPUT_DIR ?? join(frontendRoot, 'build', 'web'),
);
const allowedOrigins = new Set([
  `http://127.0.0.1:${webPort}`,
  `http://localhost:${webPort}`,
]);

function setCors(request, response) {
  const origin = request.headers.origin;
  if (typeof origin === 'string' && allowedOrigins.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Range');
  response.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges, Content-Range, Content-Length, ETag',
  );
}

const server = createServer((request, response) => {
  setCors(request, response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  const requestUrl = new URL(request.url ?? '/', `http://127.0.0.1:${resourcePort}`);
  if (requestUrl.pathname === '/api/games/catalog' && request.method === 'GET') {
    const body = Buffer.from(JSON.stringify(release.catalogEnvelope));
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'no-store',
    });
    response.end(body);
    return;
  }
  if (!['GET', 'HEAD'].includes(request.method ?? '')) {
    response.writeHead(405, { Allow: 'GET, HEAD, OPTIONS' }).end();
    return;
  }
  const payload = release.resourcePayloads.get(requestUrl.pathname);
  if (!payload) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Unknown preview resource.');
    return;
  }
  const source = release.resources.find(
    (item) => new URL(item.resource.downloadUrl).pathname === requestUrl.pathname,
  );
  const headers = {
    'Content-Type': source.resource.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    ETag: `"${source.resource.sha256}"`,
  };
  const rangeHeader = request.headers.range;
  if (!rangeHeader) {
    response.writeHead(200, {
      ...headers,
      'Content-Length': String(payload.byteLength),
    });
    response.end(request.method === 'HEAD' ? undefined : payload);
    return;
  }

  const range = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
  const start = range ? Number(range[1]) : NaN;
  const requestedEnd = range && range[2]
    ? Number(range[2])
    : payload.byteLength - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) ||
      start < 0 || start >= payload.byteLength || requestedEnd < start) {
    response.writeHead(416, {
      ...headers,
      'Content-Range': `bytes */${payload.byteLength}`,
    }).end();
    return;
  }
  const end = Math.min(requestedEnd, payload.byteLength - 1);
  const bytes = payload.subarray(start, end + 1);
  response.writeHead(206, {
    ...headers,
    'Content-Length': String(bytes.byteLength),
    'Content-Range': `bytes ${start}-${end}/${payload.byteLength}`,
  });
  response.end(request.method === 'HEAD' ? undefined : bytes);
});

const dartDefines = [
  `API_BASE_URL=http://127.0.0.1:${resourcePort}`,
  'PREVIEW_MODE=true',
  `GAME_CATALOG_TRUST_KEYS=${release.catalogTrustKeys}`,
  `GAME_RESOURCE_PUBLIC_KEYS=${release.resourcePublicKeys}`,
  `STREET_SCRAP_PREVIEW_CATALOG_B64=${release.catalogBase64}`,
].map((value) => `--dart-define=${value}`);

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(resourcePort, '127.0.0.1', resolve);
});

console.log(`Street Scrap local publisher: http://127.0.0.1:${resourcePort}`);
console.log(`Signed catalog: ${release.resources.length} resources, ephemeral keys held in memory only.`);
console.log(`Flutter preview: http://127.0.0.1:${webPort}/#/game-library`);
console.log(`Flutter build mode: ${previewBuildMode}`);
console.log('This preview never reads Keychain or contacts Cloudflare.');

let shuttingDown = false;
let flutter;

function runFlutter(args) {
  return new Promise((resolve, reject) => {
    flutter = spawn(flutterBin, args, { cwd: frontendRoot, stdio: 'inherit' });
    flutter.once('error', reject);
    flutter.once('exit', (code, signal) => {
      if (shuttingDown) return resolve();
      if (code === 0) return resolve();
      reject(new Error(`Flutter exited with ${signal ?? `status ${code}`}.`));
    });
  });
}

function contentType(path) {
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.wasm': 'application/wasm',
  })[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

async function serveReleasePreview() {
  await runFlutter([
    'build', 'web', '--release', '--no-pub', '--output', buildDirectory,
    ...dartDefines,
  ]);
  const { writeOfflineShellManifest } = await import(
    pathToFileURL(join(frontendRoot, 'tool', 'prepare_offline_shell.mjs')).href
  );
  const manifest = await writeOfflineShellManifest(buildDirectory);
  console.log(
    `Prepared offline shell ${manifest.version}: ${manifest.assets.length} files, ${manifest.byteLength} bytes.`,
  );

  const root = resolve(buildDirectory);
  const mimeOverrides = new Map([
    ['.js', 'text/javascript; charset=utf-8'],
    ['.wasm', 'application/wasm'],
  ]);
  const webServer = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', `http://127.0.0.1:${webPort}`).pathname);
    } catch (_) {
      response.writeHead(400).end();
      return;
    }
    let filePath = resolve(root, `.${pathname}`);
    if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
      response.writeHead(404).end();
      return;
    }
    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info?.isFile()) {
      filePath = join(root, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info?.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeOverrides.get(extname(filePath).toLowerCase()) ?? contentType(filePath),
      'Content-Length': String(info.size),
      'Cache-Control': 'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filePath).pipe(response);
  });

  await new Promise((resolve, reject) => {
    webServer.once('error', reject);
    webServer.listen(webPort, '127.0.0.1', resolve);
  });
  process.once('SIGINT', () => webServer.close());
  process.once('SIGTERM', () => webServer.close());
}

function shutdown(signal = 'SIGINT') {
  if (shuttingDown) return;
  shuttingDown = true;
  flutter?.kill(signal);
  server.close();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

try {
  if (previewBuildMode === 'release') {
    await serveReleasePreview();
  } else {
    await runFlutter([
      'run', '--no-pub', '-d', 'web-server', '--web-hostname', '127.0.0.1',
      '--web-port', String(webPort), ...dartDefines,
    ]);
  }
} catch (error) {
  console.error(`Could not start Flutter preview (${flutterBin}): ${error.message}`);
  process.exitCode = 1;
  shutdown();
}
