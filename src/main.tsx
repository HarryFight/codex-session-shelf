import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Lifecycle = 'active' | 'long_term' | 'follow_up' | 'closed' | null;
type NativeSession = { id: string; title: string; nativePinned?: boolean; updatedAt?: number };
type ManagedSession = { title?: string; pinned: boolean; favorite: boolean; categoryIds: string[]; lifecycle: Lifecycle; summary: string; nextAction: string; tags: string[] };
type Category = { id: string; name: string; color: string };
type Store = { revision: number; categories: Category[]; sessions: Record<string, ManagedSession> };
type Theme = 'light' | 'dark';

const STORAGE_KEY = 'codex-session-shelf:v1';
const apiUrl = (pathname: string) => new URL(pathname.replace(/^\//, ''), window.location.href).toString();
const SHARED_STORE_ENDPOINT = apiUrl('api/session-shelf/store');
const lifecycleLabels: Record<Exclude<Lifecycle, null>, string> = { active: '进行中', long_term: '长期维护', follow_up: '待跟进', closed: '已结束' };
const emptyManaged = (): ManagedSession => ({ pinned: false, favorite: false, categoryIds: [], lifecycle: null, summary: '', nextAction: '', tags: [] });
const preferredTheme = (): Theme => window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

function loadStore(): Store {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '') as Partial<Store>;
    return normalizeStore(value);
  } catch { return normalizeStore(null); }
}

function normalizeStore(value: Partial<Store> | null | undefined): Store {
  return { revision: Number.isInteger(value?.revision) ? Number(value?.revision) : 0, categories: Array.isArray(value?.categories) ? value.categories : [], sessions: value?.sessions || {} };
}

function isEmptyStore(store: Store) {
  return store.categories.length === 0 && Object.keys(store.sessions).length === 0;
}

function mergeStores(shared: Store, local: Store): Store {
  return {
    revision: shared.revision,
    categories: [...new Map([...shared.categories, ...local.categories].map((category) => [category.id, category])).values()],
    sessions: { ...shared.sessions, ...local.sessions },
  };
}

function storesMatch(left: Store, right: Store) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function Shelf() {
  const [sessions, setSessions] = useState<NativeSession[]>([]);
  const [store, setStore] = useState<Store>(loadStore);
  const [view, setView] = useState<'all' | 'favorites' | Lifecycle>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(preferredTheme);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [sharedReady, setSharedReady] = useState(false);
  const storeRef = useRef(store);

  useEffect(() => { storeRef.current = store; window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }, [store]);
  useEffect(() => {
    let cancelled = false;
    async function connectSharedStore() {
      try {
        const response = await fetch(SHARED_STORE_ENDPOINT);
        const shared = normalizeStore(await response.json() as Partial<Store>);
        const next = isEmptyStore(shared) ? mergeStores(shared, storeRef.current) : shared;
        if (!cancelled && !storesMatch(storeRef.current, next)) setStore(next);
        if (!storesMatch(shared, next)) await fetch(SHARED_STORE_ENDPOINT, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      } catch {
        // Keep the per-window local copy when the local service is unavailable.
      } finally {
        if (!cancelled) setSharedReady(true);
      }
    }
    void connectSharedStore();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!sharedReady) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(SHARED_STORE_ENDPOINT);
        const shared = normalizeStore(await response.json() as Partial<Store>);
        if (!storesMatch(storeRef.current, shared)) setStore(shared);
      } catch { /* Local fallback remains active. */ }
    }, 1_500);
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
        setSessions(event.data.sessions.filter((item: unknown): item is NativeSession => Boolean(item && typeof item === 'object' && typeof (item as NativeSession).id === 'string' && typeof (item as NativeSession).title === 'string')));
      }
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'codex-session-shelf:request-sessions' }, '*');
    return () => window.removeEventListener('message', receive);
  }, []);

  const currentById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const managedFavorites = useMemo(() => Object.entries(store.sessions)
    .filter(([, record]) => record.favorite)
    .map(([id, record]): NativeSession => ({ id, title: record.title || currentById.get(id)?.title || `会话 ${id.slice(0, 8)}` })), [currentById, store.sessions]);
  const visible = useMemo(() => {
    const list = view === 'favorites'
      ? managedFavorites.map((session) => currentById.get(session.id) || session)
      : sessions.filter((session) => {
      const record = store.sessions[session.id] || emptyManaged();
      const matchesView = view === 'all' || record.lifecycle === view;
      const matchesCategory = !activeCategoryId || record.categoryIds.includes(activeCategoryId);
      return matchesView && matchesCategory;
    });
    return [...list].sort((left, right) => Number(store.sessions[right.id]?.pinned) - Number(store.sessions[left.id]?.pinned));
  }, [activeCategoryId, currentById, managedFavorites, sessions, store.sessions, view]);
  const selected = visible.find((session) => session.id === selectedId) || null;
  const selectedManagement = selected ? store.sessions[selected.id] || emptyManaged() : null;
  const favoriteCount = managedFavorites.length;
  const viewLabel = activeCategoryId ? store.categories.find((category) => category.id === activeCategoryId)?.name || '分类' : view === 'all' ? '全部会话' : view === 'favorites' ? '我的收藏' : (view ? lifecycleLabels[view] : '全部会话');

  function updateSession(id: string, patch: Partial<ManagedSession>) {
    setStore((current) => ({ ...current, sessions: { ...current.sessions, [id]: { ...(current.sessions[id] || emptyManaged()), ...patch } } }));
    void patchSession(id, patch);
  }
  async function applyServerStore(response: Response) {
    if (!response.ok) return;
    const remote = normalizeStore(await response.json() as Partial<Store>);
    setStore((current) => remote.revision >= current.revision ? remote : current);
  }
  async function patchSession(id: string, patch: Partial<ManagedSession>) {
    try {
      const response = await fetch(apiUrl(`api/session-shelf/sessions/${encodeURIComponent(id)}`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      await applyServerStore(response);
    } catch { /* Keep the local fallback until the service is available again. */ }
  }
  function addCategory() {
    const name = window.prompt('分类名称');
    if (!name?.trim()) return;
    const category = { id: crypto.randomUUID(), name: name.trim(), color: '#e76f51' };
    setStore((current) => ({ ...current, categories: [...current.categories, category] }));
    void fetch(apiUrl('api/session-shelf/categories'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(category),
    }).then(applyServerStore).catch(() => undefined);
  }
  function openNative(session: NativeSession) {
    window.parent.postMessage({ type: 'codex-session-shelf:open-session', sessionId: session.id, title: session.title }, '*');
  }

  return <main className="shelf-shell" data-theme={theme}>
    <header className="shelf-header"><div><p className="eyebrow">CODEX SESSION SHELF</p><h1>会话书架</h1></div><button className="sync-button" onClick={() => window.parent.postMessage({ type: 'codex-session-shelf:request-sessions' }, '*')} title="刷新会话">↻</button></header>
    <nav className="shelf-nav" aria-label="会话视图">
      <div className="nav-group">
        <button className={!activeCategoryId && view === 'all' ? 'selected' : ''} onClick={() => { setActiveCategoryId(null); setView('all'); }}><span>全部</span><b>{sessions.length}</b></button>
        <button className={!activeCategoryId && view === 'favorites' ? 'selected' : ''} onClick={() => { setActiveCategoryId(null); setView('favorites'); }}><span>我的收藏</span><b>{favoriteCount}</b></button>
      </div>
      <div className="nav-group lifecycle-group">
        {(Object.keys(lifecycleLabels) as Exclude<Lifecycle, null>[]).map((key) => <button className={!activeCategoryId && view === key ? 'selected' : ''} key={key} onClick={() => { setActiveCategoryId(null); setView(key); }}><span>{lifecycleLabels[key]}</span><b>{sessions.filter((s) => store.sessions[s.id]?.lifecycle === key).length}</b></button>)}
      </div>
      <div className="category-group"><span className="nav-label">分类</span><button className="category-add" onClick={addCategory} title="新建分类">＋</button>{store.categories.map((category) => <button className={`category-item ${activeCategoryId === category.id ? 'selected' : ''}`} key={category.id} onClick={() => { setActiveCategoryId(category.id); setView('all'); }}><i style={{ background: category.color }} />{category.name}<b>{sessions.filter((s) => store.sessions[s.id]?.categoryIds.includes(category.id)).length}</b></button>)}</div>
    </nav>
    <div className="shelf-layout">
      <section className="shelf-list" aria-label="会话列表">
        <div className="list-heading"><span>{viewLabel}</span><small>{visible.length} 条</small></div>
        {visible.length ? visible.map((session) => { const management = store.sessions[session.id] || emptyManaged(); return <article className={`session-row ${selectedId === session.id ? 'current' : ''}`} key={session.id} onClick={() => setSelectedId(session.id)}><button aria-label={management.pinned ? '取消置顶书架会话' : '置顶书架会话'} className={`pin ${management.pinned ? 'on' : ''}`} onClick={(event) => { event.stopPropagation(); updateSession(session.id, { title: session.title, pinned: !management.pinned }); }} title={management.pinned ? '取消置顶书架会话' : '置顶书架会话'}>⌖</button><button aria-label={management.favorite ? '移出我的收藏' : '加入我的收藏'} className={`star ${management.favorite ? 'on' : ''}`} onClick={(event) => { event.stopPropagation(); updateSession(session.id, { title: session.title, favorite: !management.favorite }); }} title={management.favorite ? '移出我的收藏' : '加入我的收藏'}>★</button><div><strong>{session.title}{session.nativePinned ? <span className="native-pinned" title="Codex 原生置顶">原生置顶</span> : null}</strong><p>{management.nextAction || management.summary || '未添加长期信息'}</p></div><button className="native-open" onClick={(event) => { event.stopPropagation(); openNative(session); }} title="在 Codex 中打开">↗</button></article>; }) : <div className="empty-list">还没有读取到会话。打开左侧原生会话列表后点击刷新。</div>}
      </section>
      <aside className="detail-panel">
        {selected && selectedManagement ? <><div className="detail-title"><p className="eyebrow">LONG-TERM CONTEXT</p><h2>{selected.title}</h2></div><label>生命周期<select value={selectedManagement.lifecycle || ''} onChange={(event) => updateSession(selected.id, { lifecycle: (event.target.value || null) as Lifecycle })}><option value="">未设置</option>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>分类<div className="category-pills">{store.categories.map((category) => <button className={selectedManagement.categoryIds.includes(category.id) ? 'chosen' : ''} key={category.id} onClick={() => updateSession(selected.id, { categoryIds: selectedManagement.categoryIds.includes(category.id) ? selectedManagement.categoryIds.filter((id) => id !== category.id) : [...selectedManagement.categoryIds, category.id] })} type="button"><i style={{ background: category.color }} />{category.name}</button>)}</div></label><label>摘要<textarea onChange={(event) => updateSession(selected.id, { summary: event.target.value })} placeholder="这次会话要长期记住什么？" value={selectedManagement.summary} /></label><label>下一步<input onChange={(event) => updateSession(selected.id, { nextAction: event.target.value })} placeholder="下次打开先做什么" value={selectedManagement.nextAction} /></label><label>标签<input onChange={(event) => updateSession(selected.id, { tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="用逗号分隔" value={selectedManagement.tags.join(', ')} /></label></> : <div className="detail-placeholder"><span>⌁</span><h2>挑选一段会话</h2><p>在这里保存长期背景、下一步和分类。</p></div>}
      </aside>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Shelf />);
