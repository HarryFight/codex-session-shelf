(() => {
  'use strict';

  const ENTRY_ID = 'codex-session-shelf-entry';
  const PAGE_ID = 'codex-session-shelf-page';
  const FRAME_ID = 'codex-session-shelf-frame';
  const SENTINEL = '__codexSessionShelf';
  const nativeLabels = new Set(['新聊天', '新建任务', '拉取请求', '站点', '已安排', '插件', 'plugins', 'projects', '项目']);

  if (window[SENTINEL]?.destroy) window[SENTINEL].destroy();
  // Older versions hid the native layout while the shelf was open. Clear that
  // stale inline state before installing the version that only hides its page.
  const staleNativeLayout = document.querySelector('[data-app-shell-main-content-layout]') || document.querySelector('main [role="main"]');
  if (staleNativeLayout) staleNativeLayout.style.visibility = '';

  let entry;
  let page;
  let frame;
  let nativeLayout;
  let observer;

  const textOf = (node) => (node?.textContent || node?.getAttribute?.('aria-label') || '').replace(/\s+/gu, ' ').trim();
  const isEntry = (node) => node?.id === ENTRY_ID || node?.getAttribute?.('data-codex-session-shelf-owned') === 'true';

  function findPluginReference() {
    const candidates = [...document.querySelectorAll('aside nav button, aside nav a, [data-app-action-sidebar-scroll] button')];
    return candidates.find((candidate) => /^(插件|plugins|外掛程式|プラグイン)$/iu.test(textOf(candidate)) && !isEntry(candidate)) || null;
  }

  function sessionIdFromNode(node) {
    const href = node.closest?.('a')?.getAttribute('href') || node.getAttribute?.('href') || '';
    const explicit = node.getAttribute?.('data-thread-id') || node.getAttribute?.('data-conversation-id') || node.closest?.('[data-thread-id]')?.getAttribute('data-thread-id');
    return explicit || href.match(/(?:thread|conversation|codex)[/:_-]([a-z0-9-]{6,})/iu)?.[1] || href || '';
  }

  function readSessions() {
    const result = [];
    const seen = new Set();
    const nativeRows = [...document.querySelectorAll('[data-app-action-sidebar-thread-id]')];
    for (const row of nativeRows) {
      const id = String(row.getAttribute('data-app-action-sidebar-thread-id') || '').replace(/^(?:local|cloud):/iu, '');
      const title = row.getAttribute('data-app-action-sidebar-thread-title') || row.getAttribute('aria-label') || textOf(row);
      if (id && title && !seen.has(id)) { seen.add(id); result.push({ id, title }); }
    }
    if (result.length) return result.slice(0, 500);
    const nodes = [...document.querySelectorAll('[data-app-action-sidebar-scroll] a, [data-app-action-sidebar-scroll] button, aside nav a, aside nav button')];
    for (const node of nodes) {
      if (isEntry(node)) continue;
      const title = textOf(node);
      const id = sessionIdFromNode(node);
      if (!title || !id || nativeLabels.has(title.toLowerCase()) || seen.has(id)) continue;
      if (node.closest('[data-app-action-sidebar-section]')?.querySelector('[data-app-action-sidebar-section-heading]')?.textContent?.toLowerCase().includes('project')) continue;
      seen.add(id);
      result.push({ id, title });
    }
    return result.slice(0, 500);
  }

  function postSessions() {
    if (frame?.contentWindow) frame.contentWindow.postMessage({ type: 'codex-session-shelf:sessions', sessions: readSessions() }, '*');
  }

  function findNativeSession(sessionId, title) {
    const row = [...document.querySelectorAll('[data-app-action-sidebar-thread-id]')].find((node) => {
      const id = String(node.getAttribute('data-app-action-sidebar-thread-id') || '').replace(/^(?:local|cloud):/iu, '');
      return id === sessionId || (title && (node.getAttribute('data-app-action-sidebar-thread-title') || node.getAttribute('aria-label')) === title);
    });
    if (row) return row;
    return [...document.querySelectorAll('[data-app-action-sidebar-scroll] a, [data-app-action-sidebar-scroll] button, aside nav a, aside nav button')].find((node) => {
      if (isEntry(node)) return false;
      return sessionIdFromNode(node) === sessionId || (title && textOf(node) === title);
    }) || null;
  }

  function openSession(sessionId, title) {
    const nativeSession = findNativeSession(sessionId, title);
    closeShelf();
    nativeSession?.click();
  }

  function closeShelf() {
    if (!page) return;
    page.hidden = true;
    entry?.removeAttribute('aria-current');
  }

  function openShelf() {
    if (!page || !frame) return;
    // Keep injected workspace surfaces mutually exclusive. The taskboard
    // exposes this lifecycle API specifically for its host-side integration.
    window.__codexTaskboardInjection__?.close?.();
    page.hidden = false;
    entry?.setAttribute('aria-current', 'page');
    postSessions();
  }

  function closeForNativeSidebarNavigation(event) {
    if (page?.hidden || !(event.target instanceof Element)) return;
    const control = event.target.closest('[data-app-action-sidebar-thread-id], aside nav button, aside nav a, [data-app-action-sidebar-scroll] button, [data-app-action-sidebar-scroll] a');
    if (!control || isEntry(control)) return;
    closeShelf();
  }

  function install() {
    const reference = findPluginReference();
    if (!reference) return false;
    if (!entry) {
      entry = reference.cloneNode(true);
      entry.id = ENTRY_ID;
      entry.setAttribute('data-codex-session-shelf-owned', 'true');
      entry.setAttribute('aria-label', '会话书架');
      entry.querySelectorAll?.('[id]').forEach((node) => node.removeAttribute('id'));
      entry.querySelectorAll?.('span').forEach((node) => { if (textOf(node).toLowerCase() === textOf(reference).toLowerCase()) node.textContent = '会话书架'; });
      entry.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); page?.hidden ? openShelf() : closeShelf(); });
      reference.after(entry);
    }
    if (!page) {
      nativeLayout = document.querySelector('[data-app-shell-main-content-layout]') || document.querySelector('main [role="main"]');
      const surface = nativeLayout?.parentElement || document.querySelector('main');
      if (!surface) return false;
      surface.style.position = surface.style.position || 'relative';
      page = document.createElement('section');
      page.id = PAGE_ID;
      page.hidden = true;
      page.style.cssText = 'position:absolute;inset:0;z-index:30;background:Canvas;overflow:hidden;';
      frame = document.createElement('iframe');
      frame.id = FRAME_ID;
      frame.title = 'Codex Session Shelf';
      frame.allow = 'clipboard-read; clipboard-write';
      frame.style.cssText = 'display:block;width:100%;height:100%;border:0;';
      const configured = typeof window.__CODEX_SESSION_SHELF_URL__ === 'string' ? window.__CODEX_SESSION_SHELF_URL__ : 'http://127.0.0.1:4173/?host=codex';
      frame.src = configured;
      page.append(frame);
      surface.append(page);
      frame.addEventListener('load', postSessions);
      window.addEventListener('message', (event) => {
        if (event.source !== frame.contentWindow) return;
        if (event.data?.type === 'codex-session-shelf:request-sessions') postSessions();
        if (event.data?.type === 'codex-session-shelf:open-session') openSession(event.data.sessionId, event.data.title);
      });
    }
    return true;
  }

  observer = new MutationObserver(() => { if (install()) postSessions(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', closeForNativeSidebarNavigation, true);
  install();
  window[SENTINEL] = { open: openShelf, close: closeShelf, refresh: postSessions, destroy: () => { observer?.disconnect(); document.removeEventListener('click', closeForNativeSidebarNavigation, true); page?.remove(); entry?.remove(); delete window[SENTINEL]; } };
})();
