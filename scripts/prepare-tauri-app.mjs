#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resourceRoot = path.join(root, 'src-tauri/resources/app');
const binariesDirectory = path.join(root, 'src-tauri/binaries');
const licensesDirectory = path.join(root, 'src-tauri/resources/licenses');
const cacheDirectory = path.join(root, '.cache/node-runtime');
const target = process.env.CODEX_SESSION_SHELF_TARGET || process.env.TAURI_ENV_TARGET_TRIPLE || 'aarch64-apple-darwin';
const nodeVersion = '22.23.2';
const exec = promisify(execFile);
const nodeReleases = {
  'aarch64-apple-darwin': {
    archive: `node-v${nodeVersion}-darwin-arm64.tar.gz`,
    checksum: '61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6',
  },
  'x86_64-apple-darwin': {
    archive: `node-v${nodeVersion}-darwin-x64.tar.gz`,
    checksum: '58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026',
  },
};

async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Unable to download ${url}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function officialRuntime(releaseTarget) {
  const release = nodeReleases[releaseTarget];
  if (!release) throw new Error(`Unsupported Node runtime target: ${releaseTarget}`);
  const versionDirectory = path.join(cacheDirectory, `v${nodeVersion}`, releaseTarget);
  const archivePath = path.join(cacheDirectory, `v${nodeVersion}`, release.archive);
  const nodePath = path.join(versionDirectory, 'bin/node');
  const licensePath = path.join(versionDirectory, 'LICENSE');
  await mkdir(path.dirname(archivePath), { recursive: true });
  let archiveReady = false;
  try {
    archiveReady = await digest(archivePath) === release.checksum;
  } catch {
    archiveReady = false;
  }
  if (!archiveReady) {
    await rm(archivePath, { force: true });
    console.log(`Downloading official Node.js v${nodeVersion} runtime for ${releaseTarget}`);
    await download(`https://nodejs.org/dist/v${nodeVersion}/${release.archive}`, archivePath);
  }
  const actualChecksum = await digest(archivePath);
  if (actualChecksum !== release.checksum) throw new Error(`Node archive checksum mismatch: ${actualChecksum}`);
  await rm(versionDirectory, { recursive: true, force: true });
  await mkdir(versionDirectory, { recursive: true });
  await exec('tar', ['-xzf', archivePath, '--strip-components=1', '-C', versionDirectory]);
  return { nodePath, licensePath };
}

async function runtime() {
  const override = process.env.CODEX_SESSION_SHELF_NODE_BINARY;
  if (!override) return officialRuntime(target);
  const license = process.env.CODEX_SESSION_SHELF_NODE_LICENSE;
  if (!license) throw new Error('CODEX_SESSION_SHELF_NODE_LICENSE is required with CODEX_SESSION_SHELF_NODE_BINARY');
  return { nodePath: path.resolve(override), licensePath: path.resolve(license) };
}

async function validateRuntime(nodePath) {
  const [{ stdout: dependencies }, { stdout: architectures }] = await Promise.all([
    exec('otool', ['-L', nodePath]),
    exec('lipo', ['-archs', nodePath]),
  ]);
  const forbidden = dependencies.split('\n').find((line) => line.includes('/opt/homebrew/') || line.includes('/usr/local/opt/') || line.includes('@rpath/'));
  if (forbidden) throw new Error(`Node runtime has a non-portable dependency: ${forbidden.trim()}`);
  const requiredArchitecture = target.startsWith('aarch64') ? 'arm64' : target.startsWith('x86_64') ? 'x86_64' : null;
  if (requiredArchitecture && !architectures.split(/\s+/).includes(requiredArchitecture)) {
    throw new Error(`Node runtime does not contain the required ${requiredArchitecture} architecture`);
  }
}

const selectedRuntime = await runtime();
await validateRuntime(selectedRuntime.nodePath);

await rm(path.join(root, 'src-tauri/resources'), { recursive: true, force: true });
await mkdir(resourceRoot, { recursive: true });
await mkdir(binariesDirectory, { recursive: true });
await mkdir(licensesDirectory, { recursive: true });
await Promise.all([
  cp(path.join(root, 'dist'), path.join(resourceRoot, 'dist'), { recursive: true }),
  cp(path.join(root, 'server'), path.join(resourceRoot, 'server'), { recursive: true }),
  cp(path.join(root, 'scripts/inject.mjs'), path.join(resourceRoot, 'scripts/inject.mjs'), { recursive: true }),
  cp(path.join(root, 'inject'), path.join(resourceRoot, 'inject'), { recursive: true }),
  cp(path.join(root, 'node_modules/ws'), path.join(resourceRoot, 'node_modules/ws'), { recursive: true }),
  cp(selectedRuntime.licensePath, path.join(licensesDirectory, 'Node-LICENSE')),
]);
const bundledNode = path.join(binariesDirectory, `node-${target}`);
await cp(selectedRuntime.nodePath, bundledNode);
await chmod(bundledNode, 0o755);
console.log(`Prepared Tauri resources and portable Node.js v${nodeVersion} sidecar for ${target}`);
