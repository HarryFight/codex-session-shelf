#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteUrl = 'http://127.0.0.1:4173/';
const apiHealthUrl = 'http://127.0.0.1:4174/health';
const children = new Map();
let shuttingDown = false;
const parentPid = process.ppid;

async function reachable(target) {
  try {
    return (await fetch(target, { signal: AbortSignal.timeout(800) })).ok;
  } catch {
    return false;
  }
}

async function waitUntilReady(target, label) {
  for (let i = 0; i < 120 && !(await reachable(target)); i++) await delay(250);
  if (!(await reachable(target))) throw new Error(`${label} did not become ready at ${target}`);
}

function spawnChild(name, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.set(name, child);
  child.on('exit', (code) => {
    children.delete(name);
    if (!shuttingDown) {
      console.error(`[codex:dev] ${name} exited unexpectedly (code ${code ?? 'signal'}); shutting down.`);
      void shutdown('SIGTERM', 1);
    }
  });
  return child;
}

async function shutdown(signal = 'SIGTERM', exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const name of ['injector', 'vite', 'api']) {
    const child = children.get(name);
    if (!child || child.exitCode !== null) continue;
    child.kill(signal);
  }
  await Promise.race([
    Promise.all([...children.values()].map((child) => new Promise((resolve) => child.once('exit', resolve)))),
    delay(2000),
  ]);
  for (const child of children.values()) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => { void shutdown('SIGTERM'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
setInterval(() => {
  try {
    process.kill(parentPid, 0);
  } catch {
    void shutdown('SIGTERM');
  }
}, 2000);

try {
  spawnChild('api', process.execPath, [path.join(root, 'server/index.mjs'), '--port', '4174', '--token', 'dev']);
  await waitUntilReady(apiHealthUrl, 'dev api');
  spawnChild('vite', process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4173']);
  await waitUntilReady(viteUrl, 'vite dev server');
  spawnChild('injector', process.execPath, [path.join(root, 'scripts/inject.mjs'), '--launch', '--watch', '--open', '--port', '9231'], {
    CODEX_SESSION_SHELF_URL: `${viteUrl}?host=codex`,
  });
  console.log('[codex:dev] hot-reload shelf is up; edit src/ and the Codex sidebar updates live.');
} catch (error) {
  console.error(`[codex:dev] ${error.message}`);
  await shutdown('SIGTERM', 1);
}
