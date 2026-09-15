import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
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
      thread1: { title: '会话一', pinned: true, favorite: true, categoryIds: ['work'], lifecycle: 'active', summary: '摘要', nextAction: '继续', tags: ['重要'] },
    },
  }));
  const database = new SessionShelfDatabase(path.join(directory, 'shelf.sqlite'), { legacyStorePath: legacy });
  const store = database.readStore();
  assert.equal(store.revision, 1);
  assert.deepEqual(store.categories, [{ id: 'work', name: '工作', color: '#336699' }]);
  const { updatedAt, ...thread } = store.sessions.thread1;
  assert.equal(typeof updatedAt, 'number');
  assert.deepEqual(thread, {
    title: '会话一',
    pinned: true,
    favorite: true,
    categoryIds: ['work'],
    lifecycle: 'active',
    summary: '摘要',
    nextAction: '继续',
    tags: ['重要'],
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

test('keeps shelf pins and favorites independent', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'session-shelf-'));
  const database = new SessionShelfDatabase(path.join(directory, 'shelf.sqlite'));
  database.patchSession('thread-1', { title: '会话', pinned: true });
  database.patchSession('thread-1', { favorite: true });
  database.patchSession('thread-1', { pinned: false });
  let record = database.readStore().sessions['thread-1'];
  assert.equal(record.pinned, false);
  assert.equal(record.favorite, true);

  database.patchSession('thread-1', { favorite: false });
  record = database.readStore().sessions['thread-1'];
  assert.equal(record.pinned, false);
  assert.equal(record.favorite, false);
  database.close();
});

test('adds the shelf pin column to an existing database without changing favorites', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'session-shelf-'));
  const filename = path.join(directory, 'shelf.sqlite');
  const legacy = new DatabaseSync(filename);
  legacy.exec(`
    CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL DEFAULT 0);
    INSERT INTO app_state (id, revision) VALUES (1, 0);
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', favorite INTEGER NOT NULL DEFAULT 0, lifecycle TEXT, summary TEXT NOT NULL DEFAULT '', next_action TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE session_categories (session_id TEXT NOT NULL, category_id TEXT NOT NULL, sort_order INTEGER NOT NULL, PRIMARY KEY (session_id, category_id));
    INSERT INTO sessions (id, title, favorite, summary, next_action, tags, created_at, updated_at)
      VALUES ('thread-1', '已有会话', 1, '', '', '[]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  `);
  legacy.close();

  const database = new SessionShelfDatabase(filename);
  const record = database.readStore().sessions['thread-1'];
  assert.equal(record.pinned, false);
  assert.equal(record.favorite, true);
  assert.equal(record.updatedAt, Date.parse('2026-01-01T00:00:00.000Z'));
  database.close();
});

test('preserves client update timestamps when replacing the shared store', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'session-shelf-'));
  const database = new SessionShelfDatabase(path.join(directory, 'shelf.sqlite'));
  database.replaceStore({
    categories: [],
    sessions: {
      thread1: { favorite: true, updatedAt: Date.parse('2026-02-03T04:05:06.000Z') },
    },
  });
  assert.equal(database.readStore().sessions.thread1.updatedAt, Date.parse('2026-02-03T04:05:06.000Z'));
  database.close();
});
