import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('build emits token-relative asset URLs for the embedded shelf', async () => {
  await build({ configFile: path.join(root, 'vite.config.ts'), logLevel: 'silent' });
  const index = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  assert.match(index, /(?:src|href)="\.\/assets\//);
  assert.doesNotMatch(index, /(?:src|href)="\/assets\//);
});
