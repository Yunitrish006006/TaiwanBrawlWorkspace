import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Explicitly local only: fake database IDs, fresh temp persistence, synthetic users.
const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const backend = join(root, 'taiwan_brawl_back'), frontend = join(root, 'taiwan_brawl_front');
const config = join(backend, 'wrangler.split.local.jsonc');
const cli = join(backend, 'node_modules/wrangler/bin/wrangler.js');
const artifacts = mkdtempSync(join(tmpdir(), 'couple-days-cd10-'));
const state = join(artifacts, 'state');
const environment = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' };
function run(command, args, cwd, label) {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  writeFileSync(join(artifacts, `${label}.log`), (result.stdout ?? '') + (result.stderr ?? ''));
  if (result.status !== 0) throw new Error(`${label} failed; evidence ${artifacts}: ${(result.stderr || result.stdout || result.error?.message || '').slice(-3000)}`);
  console.log(`${label}: passed`);
  return result;
}
for (const binding of ['DB', 'SOCIAL_DB', 'GAME_DB']) {
  run(process.execPath, [cli, 'd1', 'migrations', 'apply', binding, '--config', config, '--local', '--persist-to', state], backend, `migrate-${binding}`);
}
const mainSeed = join(artifacts, 'main-seed.sql'), socialSeed = join(artifacts, 'social-seed.sql');
writeFileSync(mainSeed, `INSERT INTO users(id,name,email) VALUES(910101,'CD10 One','one@cd10.example.test'),(910102,'CD10 Two','two@cd10.example.test'),(910103,'CD10 Third','third@cd10.example.test');
INSERT INTO sessions(id,user_id,expires_at) VALUES('cd10-one',910101,'2099-01-01'),('cd10-one-relogin',910101,'2099-01-01'),('cd10-two',910102,'2099-01-01'),('cd10-third',910103,'2099-01-01');`);
writeFileSync(socialSeed, 'INSERT INTO friendships(user_one_id,user_two_id) VALUES(910101,910102),(910101,910103);');
for (const [binding, file] of [['DB', mainSeed], ['SOCIAL_DB', socialSeed]]) {
  run(process.execPath, [cli, 'd1', 'execute', binding, '--config', config, '--local', '--persist-to', state, '--file', file], backend, `seed-${binding}`);
}
const port = 8795;
const nonce = randomUUID();
const entry = join(artifacts, 'worker.mjs');
const source = JSON.stringify(join(backend, 'src/index.js'));
// A temporary wrapper identifies this exact test worker before any mutations.
// No health/debug endpoint is added to production source.
writeFileSync(entry, `import worker from ${source}; export * from ${source};
export default { ...worker, fetch(request, env, ctx) {
  if (new URL(request.url).pathname === '/.couple-cd10/${nonce}') return new Response('${nonce}');
  return worker.fetch(request, env, ctx);
}};`);
const worker = spawn(process.execPath, [cli, 'dev', entry, '--config', config, '--local', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--persist-to', state, '--var', 'ENABLE_COUPLES_API:true'], {
  cwd: backend, env: environment, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
worker.stdout.on('data', data => { logs = (logs + data).slice(-64000); });
worker.stderr.on('data', data => { logs = (logs + data).slice(-64000); });
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (worker.exitCode !== null) throw new Error('Local Worker exited before readiness');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/.couple-cd10/${nonce}`, { signal: AbortSignal.timeout(1000) });
      ready = response.status === 200 && await response.text() === nonce;
    } catch { /* Wait for local listener. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Local Worker did not become ready');
  run(process.env.FLUTTER_BIN ?? 'flutter', ['test', '--dart-define', `COUPLES_LOCAL_API=http://127.0.0.1:${port}`, '--dart-define', `COUPLES_LOCAL_NONCE=${nonce}`, 'test/couple_days_local_http_test.dart'], frontend, 'flutter-local-http');
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify({ schemaVersion: 1, status: 'passed', environment: 'isolated-local-worker-d1', syntheticAccounts: true,
    cache: 'real-Hive-temporary-directory', widgetBridge: 'Dart-test-double', simulatedCalendarAdvanceDays: 31,
    checks: ['invite-consent', 'two-account-overview', 'third-party-denied', 'wrong-selected-account-denied', 'date-proposal-consent', 'logout-revokes-old-session', 'relogin', 'persisted-cache-restore', 'offline-31-days', 'cold-offline-readonly-projection', 'widget-adapter-clear', 'end-clears-both'],
    notEvaluated: ['Google OAuth', 'App UI screens', 'native widget channel and physical home widget', 'iOS native build and signing', 'production deployment'] }, null, 2));
  console.log(`Evidence: ${artifacts}`);
} finally {
  // Only terminate the child process group created by this test invocation.
  const closed = new Promise(resolve => worker.once('close', resolve));
  try { process.kill(-worker.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 5000))]);
  writeFileSync(join(artifacts, 'worker.log'), logs);
}
