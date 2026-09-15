import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createSessionShelfServer } from '../server/app.mjs';
import { SessionShelfDatabase } from '../server/database.mjs';

test('serves authenticated store APIs and rejects paths outside the instance token', async (context) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'session-shelf-api-'));
  const database = new SessionShelfDatabase(path.join(directory, 'shelf.sqlite'));
  const server = createSessionShelfServer({ database, distDirectory: directory, token: 'test-token' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  context.after(() => database.close());
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  const hidden = await fetch(`${origin}/api/session-shelf/store`);
  assert.equal(hidden.status, 404);

  const updated = await fetch(`${origin}/test-token/api/session-shelf/sessions/thread-1`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '正式存储', favorite: true }),
  });
  assert.equal(updated.status, 200);
  const updatedStore = await updated.json();
  assert.equal(updatedStore.sessions['thread-1'].favorite, true);
  assert.equal(typeof updatedStore.sessions['thread-1'].updatedAt, 'number');

  const loaded = await fetch(`${origin}/test-token/api/session-shelf/store`);
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).sessions['thread-1'].title, '正式存储');
});
