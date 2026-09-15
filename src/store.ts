import { normalizeStore, type Store } from './types';

const STORAGE_KEY = 'codex-session-shelf:v1';

export const apiUrl = (pathname: string) =>
  new URL(pathname.replace(/^\//, ''), window.location.href).toString();

export const SHARED_STORE_ENDPOINT = apiUrl('api/session-shelf/store');

export function loadStore(): Store {
  try {
    return normalizeStore(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '') as Partial<Store>);
  } catch {
    return normalizeStore(null);
  }
}

export function saveLocalStore(store: Store) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function isEmptyStore(store: Store): boolean {
  return store.categories.length === 0 && Object.keys(store.sessions).length === 0;
}

export function mergeStores(shared: Store, local: Store): Store {
  return {
    revision: shared.revision,
    categories: [...new Map([...shared.categories, ...local.categories].map((c) => [c.id, c])).values()],
    sessions: { ...shared.sessions, ...local.sessions },
  };
}

export function storesMatch(left: Store, right: Store): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export async function fetchSharedStore(): Promise<Store | null> {
  try {
    const response = await fetch(SHARED_STORE_ENDPOINT);
    if (!response.ok) return null;
    return normalizeStore(await response.json() as Partial<Store>);
  } catch {
    return null;
  }
}

export async function putSharedStore(store: Store): Promise<boolean> {
  try {
    const response = await fetch(SHARED_STORE_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(store),
    });
    return response.ok;
  } catch {
    return false;
  }
}
