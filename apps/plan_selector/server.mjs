import http from 'node:http';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appRoot, '../..');
const staticFiles = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/style.css', 'style.css'],
  ['/app.mjs', 'app.mjs'],
]);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 32768) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit) throw Object.assign(new Error('Request is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validateAnswers(plan, payload) {
  if (!payload || payload.schemaVersion !== 1 || payload.planId !== plan.planId ||
      !payload.selections || typeof payload.selections !== 'object' ||
      Array.isArray(payload.selections)) {
    return 'Invalid answer document.';
  }
  const allowed = new Map(plan.decisions.map((decision) => [
    decision.id,
    new Set(decision.options.map((option) => option.id)),
  ]));
  for (const [decisionId, optionId] of Object.entries(payload.selections)) {
    if (!allowed.has(decisionId) || typeof optionId !== 'string' ||
        !allowed.get(decisionId).has(optionId)) {
      return `Unknown decision or option: ${decisionId}.`;
    }
  }
  return null;
}

export function createPlanSelectorServer({
  host = '127.0.0.1',
  port = Number(process.env.PLAN_SELECTOR_PORT ?? 9092),
  answerDir = resolve(workspaceRoot, '.local/plan-selector'),
} = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${host}:${port}`);
    if (url.pathname === '/api/answers') {
      const planId = url.searchParams.get('plan') ?? 'chat';
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(planId)) {
        return json(res, 400, { error: 'Invalid plan ID.' });
      }
      let plan;
      try {
        plan = await readJson(join(appRoot, `data/${planId}.json`));
      } catch {
        return json(res, 404, { error: 'Unknown plan.' });
      }
      const answerPath = join(answerDir, `${planId}.json`);
      if (req.method === 'GET') {
        try {
          return json(res, 200, await readJson(answerPath));
        } catch (error) {
          if (error.code === 'ENOENT') return json(res, 200, { planId, selections: {} });
          return json(res, 500, { error: 'Unable to load saved choices.' });
        }
      }
      if (req.method === 'DELETE') {
        await rm(answerPath, { force: true });
        return json(res, 200, { planId, cleared: true });
      }
      if (req.method === 'POST') {
        let payload;
        try {
          payload = await readBody(req);
        } catch (error) {
          return json(res, error.status ?? 400, { error: error.status ? error.message : 'Invalid JSON.' });
        }
        const validationError = validateAnswers(plan, payload);
        if (validationError) return json(res, 400, { error: validationError });
        const document = {
          schemaVersion: 1,
          planId,
          selections: payload.selections,
          savedAt: new Date().toISOString(),
        };
        await mkdir(answerDir, { recursive: true });
        const tempPath = join(answerDir, `${planId}.json.tmp`);
        await writeFile(tempPath, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
        await rename(tempPath, answerPath);
        return json(res, 200, document);
      }
      res.setHeader('Allow', 'GET, POST, DELETE');
      return json(res, 405, { error: 'Method not allowed.' });
    }

    const dataMatch = url.pathname.match(/^\/data\/([a-z0-9][a-z0-9-]{0,63})\.json$/);
    const relative = staticFiles.get(url.pathname) ?? (dataMatch ? `data/${dataMatch[1]}.json` : null);
    if (!relative || req.method !== 'GET') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    try {
      const body = await readFile(join(appRoot, relative));
      res.writeHead(200, {
        'Content-Type': contentTypes[extname(relative)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Unable to load plan selector.');
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createPlanSelectorServer();
  server.listen(Number(process.env.PLAN_SELECTOR_PORT ?? 9092), '127.0.0.1', () => {
    const address = server.address();
    console.log(`Plan Selector: http://127.0.0.1:${address.port}/?plan=chat`);
  });
}
