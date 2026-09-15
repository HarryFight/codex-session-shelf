export type Lifecycle = 'active' | 'long_term' | 'follow_up' | 'closed' | null;
export type ViewMode = 'favorites' | 'all';
export type DisplayMode = 'list' | 'columns';
export type Theme = 'light' | 'dark';

export interface NativeSession {
  id: string;
  title: string;
  nativePinned?: boolean;
  updatedAt?: number;
}

export interface ManagedSession {
  title?: string;
  pinned: boolean;
  favorite: boolean;
  categoryIds: string[];
  lifecycle: Lifecycle;
  summary: string;
  nextAction: string;
  tags: string[];
  updatedAt?: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Store {
  revision: number;
  categories: Category[];
  sessions: Record<string, ManagedSession>;
}

export interface SessionFilter {
  categoryIds: string[];
  tags: string[];
  lifecycle: Lifecycle;
  search: string;
}

export const emptyFilter = (): SessionFilter => ({
  categoryIds: [],
  tags: [],
  lifecycle: null,
  search: '',
});

export const filterActive = (filter: SessionFilter): boolean =>
  filter.categoryIds.length > 0 ||
  filter.tags.length > 0 ||
  filter.lifecycle !== null ||
  filter.search.trim().length > 0;

export const lifecycleLabels: Record<Exclude<Lifecycle, null>, string> = {
  active: '进行中',
  long_term: '长期维护',
  follow_up: '待跟进',
  closed: '已结束',
};

const lifecycleValues = new Set<Exclude<Lifecycle, null>>(Object.keys(lifecycleLabels) as Exclude<Lifecycle, null>[]);

export const emptyManaged = (): ManagedSession => ({
  pinned: false,
  favorite: false,
  categoryIds: [],
  lifecycle: null,
  summary: '',
  nextAction: '',
  tags: [],
});

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === 'string'))]
    : [];
}

function normalizeCategory(value: unknown): Category | null {
  if (!value || typeof value !== 'object') return null;
  const category = value as Partial<Category>;
  if (typeof category.id !== 'string' || !category.id) return null;
  const name = stringValue(category.name).trim();
  if (!name) return null;
  const color = /^#[0-9a-f]{6}$/i.test(stringValue(category.color)) ? stringValue(category.color) : '#6b7280';
  return { id: category.id, name, color };
}

export function normalizeManagedSession(value: unknown): ManagedSession {
  if (!value || typeof value !== 'object') return emptyManaged();
  const session = value as Partial<ManagedSession>;
  const updatedAt = Number(session.updatedAt);
  return {
    title: typeof session.title === 'string' && session.title ? session.title : undefined,
    pinned: session.pinned === true,
    favorite: session.favorite === true,
    categoryIds: stringList(session.categoryIds),
    lifecycle: lifecycleValues.has(session.lifecycle as Exclude<Lifecycle, null>)
      ? session.lifecycle as Exclude<Lifecycle, null>
      : null,
    summary: stringValue(session.summary),
    nextAction: stringValue(session.nextAction),
    tags: stringList(session.tags).slice(0, 100),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : undefined,
  };
}

export function normalizeStore(value: Partial<Store> | null | undefined): Store {
  const sessions: Record<string, ManagedSession> = {};
  if (value?.sessions && typeof value.sessions === 'object') {
    for (const [id, session] of Object.entries(value.sessions)) {
      if (id) sessions[id] = normalizeManagedSession(session);
    }
  }
  return {
    revision: Number.isInteger(value?.revision) ? Number(value?.revision) : 0,
    categories: Array.isArray(value?.categories)
      ? value.categories.map(normalizeCategory).filter((category): category is Category => category !== null)
      : [],
    sessions,
  };
}
