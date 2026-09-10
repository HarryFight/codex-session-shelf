import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const lifecycleValues = new Set(['active', 'long_term', 'follow_up', 'closed']);

function now() {
  return new Date().toISOString();
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeCategory(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id) {
    throw new Error('invalid_category');
  }
  const name = text(value.name).trim();
  if (!name || name.length > 80) throw new Error('invalid_category_name');
  const color = text(value.color, '#6b7280');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('invalid_category_color');
  return { id: value.id, name, color };
}

function normalizeSession(value = {}) {
  return {
    title: text(value.title),
    favorite: value.favorite === true,
    lifecycle: lifecycleValues.has(value.lifecycle) ? value.lifecycle : null,
    summary: text(value.summary),
    nextAction: text(value.nextAction),
    tags: Array.isArray(value.tags) ? value.tags.filter((item) => typeof item === 'string').slice(0, 100) : [],
    categoryIds: Array.isArray(value.categoryIds) ? [...new Set(value.categoryIds.filter((item) => typeof item === 'string'))] : [],
  };
}

export class SessionShelfDatabase {
  constructor(filename, { legacyStorePath } = {}) {
    mkdirSync(path.dirname(filename), { recursive: true });
    this.database = new DatabaseSync(filename);
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.#migrate();
    this.#importLegacyStore(legacyStorePath);
  }

  #migrate() {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
      );

      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
        lifecycle TEXT CHECK (lifecycle IS NULL OR lifecycle IN ('active', 'long_term', 'follow_up', 'closed')),
        summary TEXT NOT NULL DEFAULT '',
        next_action TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_categories (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL,
        PRIMARY KEY (session_id, category_id)
      );

      CREATE INDEX IF NOT EXISTS sessions_favorite_updated
        ON sessions(favorite, updated_at DESC);
      CREATE INDEX IF NOT EXISTS sessions_lifecycle_updated
        ON sessions(lifecycle, updated_at DESC);
      CREATE INDEX IF NOT EXISTS session_categories_category
        ON session_categories(category_id, sort_order, session_id);

      INSERT OR IGNORE INTO app_state (id, revision) VALUES (1, 0);
      INSERT OR IGNORE INTO schema_migrations (version, applied_at)
        VALUES (1, datetime('now'));
    `);
  }

  #isEmpty() {
    return this.database.prepare(`
      SELECT NOT EXISTS(SELECT 1 FROM categories) AND NOT EXISTS(SELECT 1 FROM sessions) AS empty
    `).get().empty === 1;
  }

  #importLegacyStore(filename) {
    if (!filename || !this.#isEmpty()) return;
    let legacy;
    try {
      legacy = JSON.parse(readFileSync(filename, 'utf8'));
    } catch {
      return;
    }
    this.replaceStore(legacy);
  }

  #revision() {
    return Number(this.database.prepare('SELECT revision FROM app_state WHERE id = 1').get().revision);
  }

  #bumpRevision() {
    this.database.exec('UPDATE app_state SET revision = revision + 1 WHERE id = 1');
  }

  readStore() {
    const categories = this.database.prepare(`
      SELECT id, name, color FROM categories ORDER BY sort_order, created_at, id
    `).all().map((row) => ({ id: row.id, name: row.name, color: row.color }));
    const categoryRows = this.database.prepare(`
      SELECT session_id, category_id FROM session_categories ORDER BY session_id, sort_order, category_id
    `).all();
    const categoryIdsBySession = new Map();
    for (const row of categoryRows) {
      const ids = categoryIdsBySession.get(row.session_id) || [];
      ids.push(row.category_id);
      categoryIdsBySession.set(row.session_id, ids);
    }
    const sessions = {};
    for (const row of this.database.prepare(`
      SELECT id, title, favorite, lifecycle, summary, next_action, tags FROM sessions ORDER BY updated_at, id
    `).all()) {
      sessions[row.id] = {
        title: row.title || undefined,
        favorite: row.favorite === 1,
        categoryIds: categoryIdsBySession.get(row.id) || [],
        lifecycle: row.lifecycle,
        summary: row.summary,
        nextAction: row.next_action,
        tags: JSON.parse(row.tags),
      };
    }
    return { revision: this.#revision(), categories, sessions };
  }

  replaceStore(value) {
    const categories = Array.isArray(value?.categories) ? value.categories.map(normalizeCategory) : [];
    const sessions = value?.sessions && typeof value.sessions === 'object' ? value.sessions : {};
    const categoryIds = new Set(categories.map((category) => category.id));
    const timestamp = now();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.database.exec('DELETE FROM session_categories; DELETE FROM sessions; DELETE FROM categories;');
      const insertCategory = this.database.prepare(`
        INSERT INTO categories (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      `);
      categories.forEach((category, index) => insertCategory.run(category.id, category.name, category.color, index, timestamp, timestamp));
      for (const [id, session] of Object.entries(sessions)) {
        const normalized = normalizeSession(session);
        normalized.categoryIds = normalized.categoryIds.filter((categoryId) => categoryIds.has(categoryId));
        this.#upsertSession(id, normalized, timestamp);
      }
      this.#bumpRevision();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.readStore();
  }

  upsertCategory(value) {
    const category = normalizeCategory(value);
    const timestamp = now();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const order = Number(this.database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM categories').get().value);
      this.database.prepare(`
        INSERT INTO categories (id, name, color, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, updated_at = excluded.updated_at
      `).run(category.id, category.name, category.color, order, timestamp, timestamp);
      this.#bumpRevision();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.readStore();
  }

  patchSession(id, patch) {
    if (typeof id !== 'string' || !id || id.length > 512) throw new Error('invalid_session_id');
    const current = this.readStore().sessions[id] || {};
    const session = normalizeSession({ ...current, ...patch });
    const timestamp = now();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      this.#upsertSession(id, session, timestamp);
      this.#bumpRevision();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
    return this.readStore();
  }

  #upsertSession(id, session, timestamp) {
    this.database.prepare(`
      INSERT INTO sessions (id, title, favorite, lifecycle, summary, next_action, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        favorite = excluded.favorite,
        lifecycle = excluded.lifecycle,
        summary = excluded.summary,
        next_action = excluded.next_action,
        tags = excluded.tags,
        updated_at = excluded.updated_at
    `).run(
      id,
      session.title,
      session.favorite ? 1 : 0,
      session.lifecycle,
      session.summary,
      session.nextAction,
      JSON.stringify(session.tags),
      timestamp,
      timestamp,
    );
    this.database.prepare('DELETE FROM session_categories WHERE session_id = ?').run(id);
    const insertCategory = this.database.prepare(`
      INSERT OR IGNORE INTO session_categories (session_id, category_id, sort_order) VALUES (?, ?, ?)
    `);
    session.categoryIds.forEach((categoryId, index) => insertCategory.run(id, categoryId, index));
  }

  close() {
    this.database.close();
  }
}
