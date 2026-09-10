import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 2_000_000) throw new Error('request_too_large');
  }
  return body ? JSON.parse(body) : {};
}

function serveStatic(response, distDirectory, pathname) {
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  let filename = path.resolve(distDirectory, relative);
  if (!filename.startsWith(`${path.resolve(distDirectory)}${path.sep}`) || !existsSync(filename) || !statSync(filename).isFile()) {
    filename = path.join(distDirectory, 'index.html');
  }
  if (!existsSync(filename)) {
    sendJson(response, 503, { error: 'frontend_not_built' });
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(filename)) || 'application/octet-stream',
    'Cache-Control': path.basename(filename) === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(filename).pipe(response);
}

export function createSessionShelfServer({ database, distDirectory, token }) {
  const prefix = `/${encodeURIComponent(token)}`;
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok', product: 'codex-session-shelf' });
        return;
      }
      if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }
      const pathname = url.pathname.slice(prefix.length) || '/';
      if (pathname === '/api/session-shelf/store') {
        if (request.method === 'GET') sendJson(response, 200, database.readStore());
        else if (request.method === 'PUT') sendJson(response, 200, database.replaceStore(await readJson(request)));
        else sendJson(response, 405, { error: 'method_not_allowed' });
        return;
      }
      if (pathname === '/api/session-shelf/categories' && request.method === 'POST') {
        sendJson(response, 200, database.upsertCategory(await readJson(request)));
        return;
      }
      const sessionMatch = pathname.match(/^\/api\/session-shelf\/sessions\/([^/]+)$/);
      if (sessionMatch && request.method === 'PATCH') {
        sendJson(response, 200, database.patchSession(decodeURIComponent(sessionMatch[1]), await readJson(request)));
        return;
      }
      if (pathname.startsWith('/api/')) {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }
      serveStatic(response, distDirectory, pathname);
    } catch (error) {
      const status = error instanceof SyntaxError ? 400 : 422;
      sendJson(response, status, { error: error?.message || 'request_failed' });
    }
  });
}
