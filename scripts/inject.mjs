#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'inject/codex-session-shelf.user.js'), 'utf8');
const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 9231);
const servicePort = Number(process.argv[process.argv.indexOf('--service-port') + 1] || process.env.CODEX_SESSION_SHELF_PORT || 47824);
const launch = process.argv.includes('--launch');
const open = process.argv.includes('--open');
const dataDirectory = process.env.CODEX_SESSION_SHELF_DATA_DIR || (process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library/Application Support/Codex Session Shelf')
  : process.platform === 'win32'
    ? path.join(process.env.APPDATA || os.homedir(), 'Codex Session Shelf')
    : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share'), 'codex-session-shelf'));
let service;
let url = process.env.CODEX_SESSION_SHELF_URL;
let shuttingDown = false;
const parentPid = process.ppid;

async function reachable(target) { try { return (await fetch(target, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; } }
async function existingServiceUrl() {
  try {
    const runtime = JSON.parse(await readFile(path.join(dataDirectory, 'launcher-runtime.json'), 'utf8'));
    if (typeof runtime.url === 'string' && await reachable(new URL('/health', runtime.url))) return runtime.url;
  } catch { /* Start a fresh companion below. */ }
  return null;
}
async function ensureService() {
  if (url) return;
  url = await existingServiceUrl();
  if (url) return;
  const token = randomUUID();
  url = `http://127.0.0.1:${servicePort}/${token}/`;
  service = spawn(process.execPath, [path.join(root, 'server/index.mjs'), '--port', String(servicePort), '--token', token], {
    cwd: root,
    env: { ...process.env, CODEX_SESSION_SHELF_DATA_DIR: dataDirectory },
    stdio: 'inherit',
  });
  for (let i = 0; i < 80 && !(await reachable('http://127.0.0.1:' + servicePort + '/health')); i++) await delay(250);
  if (!(await reachable('http://127.0.0.1:' + servicePort + '/health'))) throw new Error('Session Shelf companion did not start');
}
async function launchCodex() {
  const cdpUrl = `http://127.0.0.1:${port}/json/version`;
  if (await reachable(cdpUrl)) return;
  const app = process.env.CODEX_APP_PATH || '/Applications/ChatGPT.app';
  const profile = path.join(dataDirectory, 'codex-profile');
  const flags = [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`, `--remote-allow-origins=http://127.0.0.1:${port}`];
  spawn('open', ['-n', '-a', app, '--args', ...flags], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 80 && !(await reachable(cdpUrl)); i++) await delay(250);
  if (await reachable(cdpUrl)) return;
  // LaunchServices may coalesce `open -n` into an already-running instance,
  // leaving no CDP listener behind; start the app binary directly instead.
  const binary = path.join(app, 'Contents/MacOS', path.basename(app, '.app'));
  spawn(binary, flags, { stdio: 'ignore', detached: true }).unref();
}
async function targets() { try { const response = await fetch(`http://127.0.0.1:${port}/json/list`); return response.json(); } catch { return []; } }

class CdpPage {
  constructor(target) { this.target = target; this.nextId = 0; this.pending = new Map(); this.bootstrapped = false; this.opened = false; this.ws = new WebSocket(target.webSocketDebuggerUrl); this.ready = new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); }); this.ws.on('message', (raw) => { const message = JSON.parse(raw.toString()); const pending = this.pending.get(message.id); if (pending) { this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); } }); }
  async send(method, params = {}) { await this.ready; const id = ++this.nextId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async inject() {
    await this.send('Page.setBypassCSP', { enabled: true });
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__CODEX_SESSION_SHELF_URL__=${JSON.stringify(url)};\n${source}` });
    if (launch && !this.bootstrapped) {
      this.bootstrapped = true;
      await this.send('Page.reload', { ignoreCache: true });
      return;
    }
    await this.send('Runtime.evaluate', { expression: `window.__CODEX_SESSION_SHELF_URL__=${JSON.stringify(url)};\n${source}` });
  }
  async openShelf(force = false) {
    if (this.opened && !force) return;
    await this.send('Runtime.evaluate', { expression: 'window.__codexSessionShelf?.open?.()' });
    this.opened = true;
  }
}

await ensureService();
if (launch) await launchCodex();
for (let i = 0; i < 80 && !(await reachable(`http://127.0.0.1:${port}/json/version`)); i++) await delay(250);
if (!(await reachable(`http://127.0.0.1:${port}/json/version`))) throw new Error(`Codex CDP endpoint is unavailable on port ${port}`);
const pages = new Map();
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const page of pages.values()) page.ws.close();
  if (service?.exitCode === null) {
    service.kill(signal);
    await Promise.race([once(service, 'exit'), delay(2000)]);
  }
  process.exit(0);
}
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGUSR1', () => { for (const page of pages.values()) page.openShelf(true).catch(() => {}); });
setInterval(() => {
  if (process.ppid !== parentPid) {
    void shutdown('SIGTERM');
    return;
  }
  try {
    process.kill(parentPid, 0);
  } catch {
    void shutdown('SIGTERM');
  }
}, 2000);
console.log(`Codex Session Shelf injector watching CDP port ${port}`);
while (true) {
  for (const target of await targets()) {
    if (target.type !== 'page' || !target.webSocketDebuggerUrl || pages.has(target.id)) continue;
    try { const page = new CdpPage(target); await page.inject(); pages.set(target.id, page); console.log(`Injected ${target.url || target.id}`); } catch (error) { console.error(`Injection failed for ${target.url || target.id}:`, error.message); }
  }
  for (const [id, page] of pages) {
    try {
      const state = await page.send('Runtime.evaluate', { expression: 'Boolean(window.__codexSessionShelf)', returnByValue: true });
      if (!state?.result?.value) await page.inject();
      else if (open) await page.openShelf();
    } catch { pages.delete(id); }
  }
  await delay(1500);
}
