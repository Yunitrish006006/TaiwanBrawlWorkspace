import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { proxyCouplePreviewApi } from '../intelligence/couple-preview-proxy.mjs';

// Local orchestration only. Real Google verification, fresh D1, no seed sessions.
// Neither the production configuration nor its remote bindings are read.
const buildIndex = process.argv.indexOf('--web-build');
if (buildIndex < 0 || !process.argv[buildIndex + 1]) {
  throw new Error('Usage: node scripts/serve-couple-days-preview.mjs --web-build <fresh Flutter web build>');
}
const web = resolve(process.argv[buildIndex + 1]);
await stat(join(web, 'index.html'));
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const backend = join(root, 'taiwan_brawl_back');
const cli = join(backend, 'node_modules/wrangler/bin/wrangler.js');
const resumeIndex = process.argv.indexOf('--resume');
if (resumeIndex >= 0 && !process.argv[resumeIndex + 1]) throw new Error('--resume requires the original preview directory');
const artifacts = resumeIndex >= 0 ? resolve(process.argv[resumeIndex + 1]) : await mkdtemp(join(tmpdir(), 'couple-days-preview-'));
const state = join(artifacts, 'state');
const config = join(artifacts, 'wrangler.json');
if (resumeIndex >= 0) {
  const previous = JSON.parse(await readFile(config, 'utf8'));
  if (previous.name !== 'couple-days-local-preview' || previous.d1_databases?.length !== 3
    || !previous.d1_databases.every(db => db.remote === false && /^00000000-0000-4000-8000-00000000000[123]$/.test(db.database_id))) {
    throw new Error('Only an existing isolated preview can be resumed');
  }
  await stat(state);
}
const nonce = randomUUID();
const entry = join(artifacts, 'worker.mjs');
const source = JSON.stringify(join(backend, 'src/index.js'));
await writeFile(entry, `import worker from ${source}; export * from ${source};
export default {...worker, fetch(request, env, ctx) {
  if(new URL(request.url).pathname === '/.couple-preview/${nonce}') return new Response('${nonce}');
  return worker.fetch(request, env, ctx);
}};`);
// Public OAuth audience used by the app; verification still checks Google RS256.
const appConfig = await readFile(join(root, 'taiwan_brawl_front/packages/shared/taiwan_brawl_core/lib/src/app_configuration.dart'), 'utf8');
const clientId = appConfig.match(/googleWebClientId: String\.fromEnvironment\([\s\S]*?defaultValue:\s*'([^']+)'/)?.[1];
if (!clientId?.endsWith('.apps.googleusercontent.com')) throw new Error('Google client ID not found');
await writeFile(config, JSON.stringify({
  name: 'couple-days-local-preview', main: entry, compatibility_date: '2026-03-11',
  compatibility_flags: ['nodejs_compat'],
  vars: { DATABASE_MODE: 'split', ENABLE_COUPLES_API: 'true', GOOGLE_CLIENT_ID: clientId },
  d1_databases: [
    ['DB', 'main', 'migrations'], ['SOCIAL_DB', 'social', 'migrations/social'], ['GAME_DB', 'games', 'migrations/games'],
  ].map(([binding, name, directory], index) => ({
    binding, database_name: `couple-preview-${name}`, remote: false,
    database_id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    migrations_dir: join(backend, directory),
  })),
}, null, 2));
const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
for (const binding of resumeIndex >= 0 ? [] : ['DB', 'SOCIAL_DB', 'GAME_DB']) {
  const result = spawnSync(process.execPath, [cli, 'd1', 'migrations', 'apply', binding,
    '--config', config, '--local', '--persist-to', state], {
    cwd: artifacts, env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
  });
  await writeFile(join(artifacts, `migrate-${binding}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (result.status !== 0) throw new Error(`Local migration failed: ${binding}; see ${artifacts}`);
  console.log(`${binding}: local migrations passed`);
}
const worker = spawn(process.execPath, [cli, 'dev', '--config', config, '--local', '--ip', '127.0.0.1',
  '--port', '8795', '--inspector-port', '0', '--persist-to', state], {
  cwd: artifacts, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '', stopping = false;
worker.stdout.on('data', chunk => { logs = (logs + chunk).slice(-64000); });
worker.stderr.on('data', chunk => { logs = (logs + chunk).slice(-64000); });
let server;
async function stop() {
  if (stopping) return;
  stopping = true;
  server?.close();
  try { process.kill(-worker.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  await writeFile(join(artifacts, 'worker.log'), logs);
}
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (worker.exitCode !== null) throw new Error('Worker exited before readiness');
    try {
      const response = await fetch(`http://127.0.0.1:8795/.couple-preview/${nonce}`, { signal: AbortSignal.timeout(1000) });
      ready = response.ok && await response.text() === nonce;
    } catch { /* No listener yet. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Preview Worker not ready; port 8795 must be free');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
    '.wasm': 'application/wasm', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
  server = createServer(async (req, res) => {
    if (!['localhost:8080', '127.0.0.1:8080'].includes(req.headers.host)) {
      res.writeHead(403); res.end('Loopback preview only'); return;
    }
    if (req.url?.startsWith('/api/')) {
      proxyCouplePreviewApi(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const url = new URL(req.url, 'http://localhost:8080');
      if (url.pathname === '/preview-status.json') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ environment: 'isolated-local-preview', couplesEnabled: true,
          googleVerification: 'real', productionData: false, startedAt })); return;
      }
      const path = resolve(web, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!path.startsWith(web + sep) || !(await stat(path)).isFile()) throw new Error('Invalid path');
      res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      if (req.method === 'HEAD') res.end(); else createReadStream(path).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  const startedAt = new Date().toISOString();
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(8080, '127.0.0.1', resolve);
  });
  worker.once('exit', () => { if (!stopping) { console.error('Preview Worker exited'); void stop(); } });
  console.log(`Preview: http://localhost:8080/\nStatus: http://localhost:8080/preview-status.json\nLocal state: ${artifacts}`);
} catch (error) {
  await stop();
  throw error;
}
