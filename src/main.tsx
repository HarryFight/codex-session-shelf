import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import type { Category, DisplayMode, ManagedSession, NativeSession, SessionFilter, Store, Theme, ViewMode } from './types';
import { emptyFilter, emptyManaged, filterActive, normalizeStore } from './types';
import { apiUrl, fetchSharedStore, isEmptyStore, loadStore, mergeStores, putSharedStore, saveLocalStore, storesMatch } from './store';
import { ActivityStrip } from './components/ActivityStrip';
import { FilterBar } from './components/FilterBar';
import { SessionRow } from './components/SessionRow';
import { DetailPanel } from './components/DetailPanel';
import { BatchBar } from './components/BatchBar';
import { ColumnsIcon, ListIcon, RefreshIcon, SearchIcon } from './components/Icons';

const preferredTheme = (): Theme =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

function App() {
  const [sessions, setSessions] = useState<NativeSession[]>([]);
  const [store, setStore] = useState<Store>(loadStore);
  const [viewMode, setViewMode] = useState<ViewMode>('favorites');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('list');
  const [filter, setFilter] = useState<SessionFilter>(emptyFilter);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(preferredTheme);
  const [sharedReady, setSharedReady] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const storeRef = useRef(store);

  useEffect(() => { storeRef.current = store; saveLocalStore(store); }, [store]);

  useEffect(() => {
    let cancelled = false;
    async function connectSharedStore() {
      const shared = await fetchSharedStore();
      if (cancelled || !shared) { if (!cancelled) setSharedReady(true); return; }
      const next = isEmptyStore(shared) ? mergeStores(shared, storeRef.current) : shared;
      if (!storesMatch(storeRef.current, next)) setStore(next);
      if (!storesMatch(shared, next)) await putSharedStore(next);
      if (!cancelled) setSharedReady(true);
    }
    void connectSharedStore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!sharedReady) return;
    const timer = window.setInterval(async () => {
      const shared = await fetchSharedStore();
      if (shared && !storesMatch(storeRef.current, shared)) setStore(shared);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [sharedReady]);

  useEffect(() => {
    setStore((current) => {
      let changed = false;
      const nextSessions = { ...current.sessions };
      for (const session of sessions) {
        const record = nextSessions[session.id];
        if (record && record.title !== session.title) {
          nextSessions[session.id] = { ...record, title: session.title };
          void patchSession(session.id, { title: session.title });
          changed = true;
        }
      }
      return changed ? { ...current, sessions: nextSessions } : current;
    });
  }, [sessions]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type === 'codex-session-shelf:theme' && (event.data.theme === 'light' || event.data.theme === 'dark')) {
        setTheme(event.data.theme);
      }
      if (event.data?.type === 'codex-session-shelf:sessions' && Array.isArray(event.data.sessions)) {
        const valid = event.data.sessions.filter((item: unknown): item is NativeSession =>
          Boolean(item && typeof item === 'object' && typeof (item as NativeSession).id === 'string' && typeof (item as NativeSession).title === 'string'));
        setSessions(valid);
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'codex-session-shelf:request-sessions' }, '*');
    return () => window.removeEventListener('message', receive);
  }, []);

  const currentById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  const favoriteSessions = useMemo(() => {
    return Object.entries(store.sessions)
      .filter(([, record]) => record.favorite)
      .map(([id, record]): NativeSession => ({
        id,
        title: record.title || currentById.get(id)?.title || `会话 ${id.slice(0, 8)}`,
        nativePinned: currentById.get(id)?.nativePinned,
        updatedAt: record.updatedAt,
      }));
  }, [currentById, store.sessions]);

  const baseList = useMemo(() => {
    if (viewMode === 'favorites') {
      return favoriteSessions.map((s) => currentById.get(s.id) || s);
    }
    return sessions;
  }, [currentById, favoriteSessions, sessions, viewMode]);

  const availableTags = useMemo(() => {
    const tagCounts = new Map<string, number>();
    for (const session of baseList) {
      const tags = store.sessions[session.id]?.tags || [];
      for (const tag of tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    return [...tagCounts.keys()].sort((a, b) => tagCounts.get(b)! - tagCounts.get(a)!);
  }, [baseList, store.sessions]);

  const filterCounts = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const byTag: Record<string, number> = {};
    const byLifecycle: Record<string, number> = {};
    for (const session of baseList) {
      const managed = store.sessions[session.id] || emptyManaged();
      for (const categoryId of managed.categoryIds) byCategory[categoryId] = (byCategory[categoryId] || 0) + 1;
      for (const tag of managed.tags) byTag[tag] = (byTag[tag] || 0) + 1;
      if (managed.lifecycle) byLifecycle[managed.lifecycle] = (byLifecycle[managed.lifecycle] || 0) + 1;
    }
    return { byCategory, byTag, byLifecycle };
  }, [baseList, store.sessions]);

  const visible = useMemo(() => {
    const search = filter.search.trim().toLowerCase();
    return baseList.filter((session) => {
      const managed = store.sessions[session.id] || emptyManaged();
      if (search && !session.title.toLowerCase().includes(search) &&
          !managed.summary.toLowerCase().includes(search) &&
          !managed.tags.some((tag) => tag.toLowerCase().includes(search))) return false;
      if (filter.lifecycle && managed.lifecycle !== filter.lifecycle) return false;
      if (filter.categoryIds.length > 0 && !filter.categoryIds.some((id) => managed.categoryIds.includes(id))) return false;
      if (filter.tags.length > 0 && !filter.tags.some((tag) => managed.tags.includes(tag))) return false;
      return true;
    }).sort((left, right) => {
      const leftPinned = store.sessions[left.id]?.pinned ? 1 : 0;
      const rightPinned = store.sessions[right.id]?.pinned ? 1 : 0;
      if (leftPinned !== rightPinned) return rightPinned - leftPinned;
      return (store.sessions[right.id]?.updatedAt || 0) - (store.sessions[left.id]?.updatedAt || 0);
    });
  }, [baseList, filter, store.sessions]);

  const groupedVisible = useMemo(() => {
    const groups = new Map<string, { category: Category | null; sessions: NativeSession[] }>();
    const ungrouped: NativeSession[] = [];
    for (const session of visible) {
      const managed = store.sessions[session.id] || emptyManaged();
      const category = store.categories.find((c) => managed.categoryIds.includes(c.id));
      if (!category) { ungrouped.push(session); continue; }
      if (!groups.has(category.id)) groups.set(category.id, { category, sessions: [] });
      groups.get(category.id)!.sessions.push(session);
    }
    return { groups: [...groups.values()], ungrouped };
  }, [store.categories, store.sessions, visible]);

  const selected = visible.find((s) => s.id === selectedId) ||
    baseList.find((s) => s.id === selectedId) || null;
  const selectedManaged = selected ? store.sessions[selected.id] || emptyManaged() : null;
  const favoriteCount = favoriteSessions.length;

  function updateSession(id: string, patch: Partial<ManagedSession>) {
    const timestamp = Date.now();
    setStore((current) => ({
      ...current,
      sessions: {
        ...current.sessions,
        [id]: { ...(current.sessions[id] || emptyManaged()), ...patch, updatedAt: timestamp },
      },
    }));
    void patchSession(id, { ...patch, updatedAt: timestamp });
  }

  async function patchSession(id: string, patch: Partial<ManagedSession>) {
    try {
      const response = await fetch(apiUrl(`api/session-shelf/sessions/${encodeURIComponent(id)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await applyServerStore(response);
    } catch { /* local fallback stays active */ }
  }

  async function applyServerStore(response: Response) {
    if (!response.ok) return;
    const remote = normalizeStore(await response.json().catch(() => null) as Partial<Store> | null);
    setStore((current) => remote.revision >= current.revision && !storesMatch(current, remote) ? remote : current);
  }

  function addCategory() {
    const name = window.prompt('分类名称');
    if (!name?.trim()) return;
    const category: Category = { id: crypto.randomUUID(), name: name.trim(), color: '#6366f1' };
    setStore((current) => ({ ...current, categories: [...current.categories, category] }));
    void fetch(apiUrl('api/session-shelf/categories'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(category),
    }).then(applyServerStore).catch(() => undefined);
  }

  function openNative(session: NativeSession) {
    window.parent.postMessage({ type: 'codex-session-shelf:open-session', sessionId: session.id, title: session.title }, '*');
  }

  function toggleFavorite(session: NativeSession, managed: ManagedSession) {
    updateSession(session.id, { title: session.title, favorite: !managed.favorite });
  }

  function togglePin(session: NativeSession, managed: ManagedSession) {
    updateSession(session.id, { title: session.title, pinned: !managed.pinned });
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function batchUpdate(ids: string[], patch: Partial<ManagedSession>) {
    for (const id of ids) updateSession(id, patch);
  }

  function batchAddTag() {
    const input = window.prompt('为选中会话添加标签（逗号分隔）');
    if (!input?.trim()) return;
    const tags = input.split(',').map((t) => t.trim()).filter(Boolean);
    for (const id of checkedIds) {
      const managed = store.sessions[id] || emptyManaged();
      const merged = [...new Set([...managed.tags, ...tags])];
      updateSession(id, { tags: merged });
    }
  }

  function batchAddCategory(categoryId: string) {
    for (const id of checkedIds) {
      const managed = store.sessions[id] || emptyManaged();
      if (!managed.categoryIds.includes(categoryId)) {
        updateSession(id, { categoryIds: [...managed.categoryIds, categoryId] });
      }
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setCheckedIds(new Set());
  }

  function switchView(mode: ViewMode) {
    setViewMode(mode);
    setSelectedId(null);
    if (mode === 'favorites') exitSelectMode();
  }

  const rowProps = (session: NativeSession) => ({
    session,
    managed: store.sessions[session.id] || emptyManaged(),
    categories: store.categories,
    selected: selectedId === session.id,
    selectMode,
    checked: checkedIds.has(session.id),
    isCurrent: false,
    onSelect: (s: NativeSession) => setSelectedId(s.id),
    onOpen: openNative,
    onToggleFavorite: toggleFavorite,
    onTogglePin: togglePin,
    onToggleCheck: toggleChecked,
  });

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="app-header">
        <div className="header-brand">
          <h1>会话书架</h1>
        </div>
        <div className="header-search">
          <SearchIcon size={13} />
          <input
            value={filter.search}
            onChange={(event) => setFilter((current) => ({ ...current, search: event.target.value }))}
            placeholder="搜索标题、摘要、标签…"
          />
          {filter.search && (
            <button className="search-clear" onClick={() => setFilter((current) => ({ ...current, search: '' }))}>×</button>
          )}
        </div>
        <button
          className="icon-button"
          onClick={() => window.parent.postMessage({ type: 'codex-session-shelf:request-sessions' }, '*')}
          title="刷新会话列表"
        >
          <RefreshIcon size={15} />
        </button>
      </header>

      <nav className="view-tabs" aria-label="主视图">
        <div className="segmented">
          <button className={viewMode === 'favorites' ? 'on' : ''} onClick={() => switchView('favorites')}>
            我的收藏
            <b>{favoriteCount}</b>
          </button>
          <button className={viewMode === 'all' ? 'on' : ''} onClick={() => switchView('all')}>
            全部会话
            <b>{sessions.length}</b>
          </button>
        </div>
        <div className="view-tools">
          {viewMode === 'all' && (
            <button
              className={`select-toggle ${selectMode ? 'on' : ''}`}
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            >
              {selectMode ? '退出多选' : '多选'}
            </button>
          )}
          <div className="display-toggle">
            <button className={displayMode === 'list' ? 'on' : ''} onClick={() => setDisplayMode('list')} title="列表视图">
              <ListIcon size={14} />
            </button>
            <button className={displayMode === 'columns' ? 'on' : ''} onClick={() => setDisplayMode('columns')} title="分栏视图">
              <ColumnsIcon size={14} />
            </button>
          </div>
        </div>
      </nav>

      {viewMode === 'favorites' && (
        <ActivityStrip
          sessions={sessions}
          store={store}
          onOpen={openNative}
        />
      )}

      <FilterBar
        categories={store.categories}
        availableTags={availableTags}
        filter={filter}
        onFilterChange={(patch) => setFilter((current) => ({ ...current, ...patch }))}
        onClear={() => setFilter((current) => ({ ...current, categoryIds: [], tags: [], lifecycle: null }))}
        onAddCategory={addCategory}
        counts={filterCounts}
      />

      <main className={`app-main ${selected ? 'has-detail' : ''}`}>
        <div className="session-content" key={viewMode}>
          {visible.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">⌖</span>
              <h3>{viewMode === 'favorites' ? '还没有收藏' : '还没有读到会话'}</h3>
              <p>{viewMode === 'favorites'
                ? '在全部会话里点星标，把重要的会话收藏到这里'
                : '打开左侧原生会话列表后点右上角刷新'}</p>
            </div>
          ) : displayMode === 'list' ? (
            viewMode === 'favorites' && !filterActive({ ...filter, search: '' }) ? (
              <div className="grouped-list">
                {groupedVisible.groups.map(({ category, sessions: groupSessions }) => (
                  <section key={category!.id} className="session-group">
                    <header className="group-header">
                      <i style={{ background: category!.color }} />
                      {category!.name}
                      <b>{groupSessions.length}</b>
                    </header>
                    {groupSessions.map((session) => <SessionRow key={session.id} {...rowProps(session)} />)}
                  </section>
                ))}
                {groupedVisible.ungrouped.length > 0 && (
                  <section className="session-group">
                    <header className="group-header muted">
                      <i />
                      未分类
                      <b>{groupedVisible.ungrouped.length}</b>
                    </header>
                    {groupedVisible.ungrouped.map((session) => <SessionRow key={session.id} {...rowProps(session)} />)}
                  </section>
                )}
              </div>
            ) : (
              <div className="flat-list">
                {visible.map((session) => <SessionRow key={session.id} {...rowProps(session)} />)}
              </div>
            )
          ) : (
            <div className="column-layout">
              {store.categories.map((category) => {
                const columnSessions = visible.filter((s) =>
                  (store.sessions[s.id] || emptyManaged()).categoryIds.includes(category.id));
                if (columnSessions.length === 0) return null;
                return (
                  <section key={category.id} className="category-column">
                    <header>
                      <i style={{ background: category.color }} />
                      {category.name}
                      <b>{columnSessions.length}</b>
                    </header>
                    {columnSessions.map((session) => <SessionRow key={session.id} {...rowProps(session)} />)}
                  </section>
                );
              })}
              {visible.some((s) => (store.sessions[s.id] || emptyManaged()).categoryIds.length === 0) && (
                <section className="category-column muted">
                  <header><i />未分类</header>
                  {visible.filter((s) => (store.sessions[s.id] || emptyManaged()).categoryIds.length === 0)
                    .map((session) => <SessionRow key={session.id} {...rowProps(session)} />)}
                </section>
              )}
            </div>
          )}
        </div>

        <DetailPanel
          session={selected}
          managed={selectedManaged}
          categories={store.categories}
          onUpdate={updateSession}
          onOpen={openNative}
          onClose={() => setSelectedId(null)}
        />
      </main>

      {selectMode && (
        <BatchBar
          count={checkedIds.size}
          categories={store.categories}
          onBatchFavorite={() => batchUpdate([...checkedIds], { favorite: true })}
          onBatchUnfavorite={() => batchUpdate([...checkedIds], { favorite: false })}
          onBatchTag={batchAddTag}
          onBatchCategory={batchAddCategory}
          onBatchClearLifecycle={() => batchUpdate([...checkedIds], { lifecycle: null })}
          onCancel={exitSelectMode}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
