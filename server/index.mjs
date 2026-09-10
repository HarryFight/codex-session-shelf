#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { createSessionShelfServer } from './app.mjs';
import { SessionShelfDatabase } from './database.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

function defaultDataDirectory() {
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library/Application Support/Codex Session Shelf');
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'Codex Session Shelf');
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'codex-session-shelf');
}

const port = Number(argument('--port') || process.env.CODEX_SESSION_SHELF_PORT || 4173);
const token = argument('--token') || process.env.CODEX_SESSION_SHELF_TOKEN || randomUUID();
const dataDirectory = path.resolve(process.env.CODEX_SESSION_SHELF_DATA_DIR || defaultDataDirectory());
const databasePath = path.join(dataDirectory, 'session-shelf.sqlite');
const runtimePath = path.join(dataDirectory, 'launcher-runtime.json');
const legacyStorePath = process.env.CODEX_SESSION_SHELF_LEGACY_STORE || path.join(root, '.codex-session-shelf/store.json');
const database = new SessionShelfDatabase(databasePath, { legacyStorePath });
const server = createSessionShelfServer({ database, distDirectory: path.join(root, 'dist'), token });

await mkdir(dataDirectory, { recursive: true });
server.listen(port, '127.0.0.1', async () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://127.0.0.1:${actualPort}/${encodeURIComponent(token)}/`;
  await writeFile(runtimePath, JSON.stringify({ version: 1, pid: process.pid, url }), { mode: 0o600 });
  console.log(`Codex Session Shelf listening on ${url}`);
});

function stop() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
