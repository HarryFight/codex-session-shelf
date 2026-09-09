import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Lifecycle = 'active' | 'long_term' | 'follow_up' | 'closed' | null;
type NativeSession = { id: string; title: string; updatedAt?: number };
type ManagedSession = { favorite: boolean; categoryIds: string[]; lifecycle: Lifecycle; summary: string; nextAction: string; tags: string[] };
type Category = { id: string; name: string; color: string };
type Store = { categories: Category[]; sessions: Record<string, ManagedSession> };

const STORAGE_KEY = 'codex-session-shelf:v1';
const lifecycleLabels: Record<Exclude<Lifecycle, null>, string> = { active: '进行中', long_term: '长期维护', follow_up: '待跟进', closed: '已结束' };
const emptyManaged = (): ManagedSession => ({ favorite: false, categoryIds: [], lifecycle: null, summary: '', nextAction: '', tags: [] });

function loadStore(): Store {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '') as Partial<Store>;
    return { categories: Array.isArray(value.categories) ? value.categories : [], sessions: value.sessions || {} };
  } catch { return { categories: [], sessions: {} }; }
}

function Shelf() {
  const [sessions, setSessions] = useState<NativeSession[]>([]);
  const [store, setStore] = useState<Store>(loadStore);
  const [view, setView] = useState<'all' | 'favorites' | Lifecycle>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }, [store]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.data?.type !== 'codex-session-shelf:sessions' || !Array.isArray(event.data.sessions)) return;
      setSessions(event.data.sessions.filter((item: unknown): item is NativeSession => Boolean(item && typeof item === 'object' && typeof (item as NativeSession).id === 'string' && typeof (item as NativeSession).title === 'string')));
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ type: 'codex-session-shelf:request-sessions' }, '*');
    return () => window.removeEventListener('message', receive);
  }, []);

  const selected = sessions.find((session) => session.id === selectedId) || null;
  const selectedManagement = selected ? store.sessions[selected.id] || emptyManaged() : null;
  const viewLabel = view === 'all' ? '全部会话' : view === 'favorites' ? '收藏' : (view ? lifecycleLabels[view] : '全部会话');
  const visible = useMemo(() => sessions.filter((session) => {
    const record = store.sessions[session.id] || emptyManaged();
    return view === 'all' || (view === 'favorites' ? record.favorite : record.lifecycle === view);
  }), [sessions, store.sessions, view]);

  function updateSession(id: string, patch: Partial<ManagedSession>) {
    setStore((current) => ({ ...current, sessions: { ...current.sessions, [id]: { ...(current.sessions[id] || emptyManaged()), ...patch } } }));
  }
  function addCategory() {
    const name = window.prompt('分类名称');
    if (!name?.trim()) return;
    setStore((current) => ({ ...current, categories: [...current.categories, { id: crypto.randomUUID(), name: name.trim(), color: '#e76f51' }] }));
  }
  function openNative(session: NativeSession) {
    window.parent.postMessage({ type: 'codex-session-shelf:open-session', sessionId: session.id, title: session.title }, '*');
  }

  return <main className="shelf-shell">
    <header className="shelf-header"><div><p className="eyebrow">CODEX SESSION SHELF</p><h1>会话书架</h1></div><button className="sync-button" onClick={() => window.parent.postMessage({ type: 'codex-session-shelf:request-sessions' }, '*')} title="刷新会话">↻</button></header>
    <div className="shelf-layout">
      <nav className="shelf-nav" aria-label="会话视图">
        <button className={view === 'all' ? 'selected' : ''} onClick={() => setView('all')}><span>全部会话</span><b>{sessions.length}</b></button>
        <button className={view === 'favorites' ? 'selected' : ''} onClick={() => setView('favorites')}><span>收藏</span><b>{sessions.filter((s) => store.sessions[s.id]?.favorite).length}</b></button>
        <p className="nav-label">生命周期</p>
        {(Object.keys(lifecycleLabels) as Exclude<Lifecycle, null>[]).map((key) => <button className={view === key ? 'selected' : ''} key={key} onClick={() => setView(key)}><span>{lifecycleLabels[key]}</span><b>{sessions.filter((s) => store.sessions[s.id]?.lifecycle === key).length}</b></button>)}
        <div className="category-heading"><p className="nav-label">分类</p><button onClick={addCategory} title="新建分类">＋</button></div>
        {store.categories.map((category) => <div className="category-item" key={category.id}><i style={{ background: category.color }} />{category.name}</div>)}
      </nav>
      <section className="shelf-list" aria-label="会话列表">
        <div className="list-heading"><span>{viewLabel}</span><small>{visible.length} 条</small></div>
        {visible.length ? visible.map((session) => { const management = store.sessions[session.id] || emptyManaged(); return <article className={`session-row ${selectedId === session.id ? 'current' : ''}`} key={session.id} onClick={() => setSelectedId(session.id)}><button className={`star ${management.favorite ? 'on' : ''}`} onClick={(event) => { event.stopPropagation(); updateSession(session.id, { favorite: !management.favorite }); }} title="收藏">★</button><div><strong>{session.title}</strong><p>{management.nextAction || management.summary || '未添加长期信息'}</p></div><button className="native-open" onClick={(event) => { event.stopPropagation(); openNative(session); }} title="在 Codex 中打开">↗</button></article>; }) : <div className="empty-list">还没有读取到会话。打开左侧原生会话列表后点击刷新。</div>}
      </section>
      <aside className="detail-panel">
        {selected && selectedManagement ? <><div className="detail-title"><p className="eyebrow">LONG-TERM CONTEXT</p><h2>{selected.title}</h2></div><label>生命周期<select value={selectedManagement.lifecycle || ''} onChange={(event) => updateSession(selected.id, { lifecycle: (event.target.value || null) as Lifecycle })}><option value="">未设置</option>{Object.entries(lifecycleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>分类<div className="category-pills">{store.categories.map((category) => <button className={selectedManagement.categoryIds.includes(category.id) ? 'chosen' : ''} key={category.id} onClick={() => updateSession(selected.id, { categoryIds: selectedManagement.categoryIds.includes(category.id) ? selectedManagement.categoryIds.filter((id) => id !== category.id) : [...selectedManagement.categoryIds, category.id] })} type="button"><i style={{ background: category.color }} />{category.name}</button>)}</div></label><label>摘要<textarea onChange={(event) => updateSession(selected.id, { summary: event.target.value })} placeholder="这次会话要长期记住什么？" value={selectedManagement.summary} /></label><label>下一步<input onChange={(event) => updateSession(selected.id, { nextAction: event.target.value })} placeholder="下次打开先做什么" value={selectedManagement.nextAction} /></label><label>标签<input onChange={(event) => updateSession(selected.id, { tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="用逗号分隔" value={selectedManagement.tags.join(', ')} /></label></> : <div className="detail-placeholder"><span>⌁</span><h2>挑选一段会话</h2><p>在这里保存长期背景、下一步和分类。</p></div>}
      </aside>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Shelf />);
