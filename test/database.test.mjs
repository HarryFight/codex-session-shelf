import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SessionShelfDatabase } from '../server/database.mjs';

test('imports the legacy JSON store and persists normalized records', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'session-shelf-'));
  const legacy = path.join(directory, 'store.json');
  writeFileSync(legacy, JSON.stringify({
    categories: [{ id: 'work', name: '工作', color: '#336699' }],
    sessions: {
      thread1: { title: '会话一', favorite: true, categoryIds: ['work'], lifecycle: 'active', summary: '摘要', nextAction: '继续', tags: ['重要'] },
    },
  }));
  const database = new SessionShelfDatabase(path.join(directory, 'shelf.sqlite'), { legacyStorePath: legacy });
  const store = database.readStore();
  assert.equal(store.revision, 1);
  assert.deepEqual(store.categories, [{ id: 'work', name: '工作', color: '#336699' }]);
  assert.deepEqual(store.sessions.thread1, {
    title: '会话一', favorite: true, categoryIds: ['work'], lifecycle: 'active', summary: '摘要', nextAction: '继续', tags: ['重要'],
  });
  database.close();
});

test('updates different sessions independently', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'session-shelf-'));
  const database = new SessionShelfDatabase(path.join(directory, 'shelf.sqlite'));
  database.patchSession('a', { title: 'A', favorite: true });
  database.patchSession('b', { title: 'B', lifecycle: 'follow_up' });
  database.patchSession('a', { summary: '保留 A' });
  const store = database.readStore();
  assert.equal(store.sessions.a.favorite, true);
  assert.equal(store.sessions.a.summary, '保留 A');
  assert.equal(store.sessions.b.lifecycle, 'follow_up');
  assert.equal(store.revision, 3);
  database.close();
});
