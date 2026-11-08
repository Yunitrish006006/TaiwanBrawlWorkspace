import { request } from 'node:http';

// Called only after the preview server validates its loopback Host allowlist.
// The socket connects to the internal Worker, but Host/Origin still describe
// the browser-facing URL. Never replace or manufacture Origin to pass a guard.
export function proxyCouplePreviewApi(req, res, workerPort = 8795) {
  const upstream = request({ host: '127.0.0.1', port: workerPort, path: req.url,
    method: req.method, headers: { ...req.headers } }, response => {
    res.writeHead(response.statusCode ?? 502, { ...response.headers, 'cache-control': 'no-store' });
    response.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Preview API unavailable');
  });
  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}
