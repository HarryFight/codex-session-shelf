#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'inject/codex-session-shelf.user.js'), 'utf8');
const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 9231);
const launch = process.argv.includes('--launch');
const open = process.argv.includes('--open');
const url = process.env.CODEX_SESSION_SHELF_URL || 'http://127.0.0.1:4173/?host=codex';
let devServer;

async function reachable(target) { try { return (await fetch(target, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; } }
async function ensureWeb() {
  if (await reachable('http://127.0.0.1:4173/')) return;
  devServer = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], { cwd: root, stdio: 'inherit' });
  for (let i = 0; i < 80 && !(await reachable('http://127.0.0.1:4173/')); i++) await delay(250);
  if (!(await reachable('http://127.0.0.1:4173/'))) throw new Error('Session Shelf web server did not start');
}
async function launchCodex() {
  const app = process.env.CODEX_APP_PATH || '/Applications/ChatGPT.app';
  spawn('open', ['-n', '-a', app, '--args', `--remote-debugging-port=${port}`, `--remote-allow-origins=http://127.0.0.1:${port}`], { stdio: 'ignore', detached: true });
}
async function targets() { try { const response = await fetch(`http://127.0.0.1:${port}/json/list`); return response.json(); } catch { return []; } }

class CdpPage {
  constructor(target) { this.target = target; this.nextId = 0; this.pending = new Map(); this.ws = new WebSocket(target.webSocketDebuggerUrl); this.ready = new Promise((resolve, reject) => { this.ws.once('open', resolve); this.ws.once('error', reject); }); this.ws.on('message', (raw) => { const message = JSON.parse(raw.toString()); const pending = this.pending.get(message.id); if (pending) { this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); } }); }
  async send(method, params = {}) { await this.ready; const id = ++this.nextId; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async inject() {
    await this.send('Page.setBypassCSP', { enabled: true });
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__CODEX_SESSION_SHELF_URL__=${JSON.stringify(url)};\n${source}` });
    await this.send('Runtime.evaluate', { expression: `window.__CODEX_SESSION_SHELF_URL__=${JSON.stringify(url)};\n${source}` });
    if (open) await this.send('Runtime.evaluate', { expression: 'window.__codexSessionShelf?.open?.()' });
  }
}

await ensureWeb();
if (launch) await launchCodex();
for (let i = 0; i < 80 && !(await reachable(`http://127.0.0.1:${port}/json/version`)); i++) await delay(250);
if (!(await reachable(`http://127.0.0.1:${port}/json/version`))) throw new Error(`Codex CDP endpoint is unavailable on port ${port}`);
const pages = new Map();
process.on('SIGINT', () => { devServer?.kill('SIGINT'); for (const page of pages.values()) page.ws.close(); process.exit(0); });
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
    } catch { pages.delete(id); }
  }
  await delay(1500);
}
