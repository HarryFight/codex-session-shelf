(() => {
  'use strict';

  const ENTRY_ID = 'codex-session-shelf-entry';
  const PAGE_ID = 'codex-session-shelf-page';
  const FRAME_ID = 'codex-session-shelf-frame';
  const SENTINEL = '__codexSessionShelf';
  const nativeLabels = new Set(['新聊天', '新建任务', '拉取请求', '站点', '已安排', '插件', 'plugins', 'projects', '项目']);

  function createShelfIcon() {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('xmlns', namespace);
    svg.setAttribute('class', 'icon-xs browser:icon-base');
    const addPath = (d, attributes = {}) => {
      const path = document.createElementNS(namespace, 'path');
      path.setAttribute('d', d);
      for (const [name, value] of Object.entries(attributes)) path.setAttribute(name, value);
      svg.append(path);
    };
    addPath('M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388z', { fill: 'currentColor', transform: 'scale(.667)' });
    addPath('M11.35 1.45h1.8v4.65l-.9-.66-.9.66V1.45Z', { fill: 'var(--codex-session-shelf-accent, #e87f5d)' });
    return svg;
  }

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
  let themeObserver;
  let suspendedNativeEntries = [];

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

  function hostTheme() {
    const root = document.documentElement;
    const classes = root.classList;
    if (classes.contains('electron-dark') || classes.contains('dark') || root.dataset.theme === 'dark') return 'dark';
    if (classes.contains('electron-light') || classes.contains('light') || root.dataset.theme === 'light') return 'light';
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function postSessions() {
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ type: 'codex-session-shelf:sessions', sessions: readSessions() }, '*');
    frame.contentWindow.postMessage({ type: 'codex-session-shelf:theme', theme: hostTheme() }, '*');
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
    closeShelf(nativeSession);
    nativeSession?.click();
  }

  function suspendNativeSidebarActivation() {
    const activeEntries = [...new Set([
      ...document.querySelectorAll('aside nav [aria-current="page"]'),
      ...document.querySelectorAll('[data-app-action-sidebar-scroll] [aria-current="page"]'),
    ])].filter((node) => !isEntry(node));
    suspendedNativeEntries = activeEntries.map((node) => ({
      node,
      ariaCurrent: node.getAttribute('aria-current'),
      activeClass: node.classList.contains('bg-primary-ghost-hover'),
    }));
    for (const { node, activeClass } of suspendedNativeEntries) {
      node.removeAttribute('aria-current');
      if (activeClass) node.classList.remove('bg-primary-ghost-hover');
    }
  }

  function restoreNativeSidebarActivation(selectedControl) {
    for (const { node, ariaCurrent, activeClass } of suspendedNativeEntries) {
      if (selectedControl && node !== selectedControl) continue;
      if (ariaCurrent) node.setAttribute('aria-current', ariaCurrent);
      if (activeClass) node.classList.add('bg-primary-ghost-hover');
    }
    suspendedNativeEntries = [];
  }

  function closeShelf(selectedControl) {
    if (!page) return;
    page.hidden = true;
    entry?.removeAttribute('aria-current');
    entry?.classList.remove('bg-primary-ghost-hover');
    restoreNativeSidebarActivation(selectedControl);
  }

  function openShelf() {
    if (!page || !frame) return;
    // Keep injected workspace surfaces mutually exclusive. The taskboard
    // exposes this lifecycle API specifically for its host-side integration.
    window.__codexTaskboardInjection__?.close?.();
    suspendNativeSidebarActivation();
    page.hidden = false;
    entry?.setAttribute('aria-current', 'page');
    entry?.classList.add('bg-primary-ghost-hover');
    postSessions();
  }

  function closeForNativeSidebarNavigation(event) {
    if (page?.hidden || !(event.target instanceof Element)) return;
    const control = event.target.closest('[data-app-action-sidebar-thread-id], aside nav button, aside nav a, [data-app-action-sidebar-scroll] button, [data-app-action-sidebar-scroll] a');
    if (!control || isEntry(control)) return;
    closeShelf(control);
  }

  function install() {
    const reference = findPluginReference();
    if (!reference) return false;
    if (!entry) {
      entry = reference.cloneNode(true);
      entry.id = ENTRY_ID;
      entry.setAttribute('data-codex-session-shelf-owned', 'true');
      entry.setAttribute('aria-label', '会话书架');
      entry.removeAttribute('aria-current');
      entry.removeAttribute('data-state');
      entry.classList.remove('bg-primary-ghost-hover');
      entry.querySelectorAll?.('[id]').forEach((node) => node.removeAttribute('id'));
      const iconSlot = entry.querySelector('.icon-leading-slot') || entry.querySelector('svg')?.parentElement;
      if (iconSlot) iconSlot.replaceChildren(createShelfIcon());
      entry.querySelectorAll?.('span').forEach((node) => { if (textOf(node).toLowerCase() === textOf(reference).toLowerCase()) node.textContent = '会话书架'; });
      entry.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); page?.hidden ? openShelf() : closeShelf(); });
      reference.after(entry);
    }
    if (!page) {
      nativeLayout = document.querySelector('[data-app-shell-main-content-layout]') || document.querySelector('main [role="main"]');
      // The native toolbar is a sibling of the inner content layout. Mount at
      // the outer main surface so the shelf can cover that toolbar as well.
      const surface = nativeLayout?.closest('main') || nativeLayout?.parentElement || document.querySelector('main');
      if (!surface) return false;
      surface.style.position = surface.style.position || 'relative';
      page = document.createElement('section');
      page.id = PAGE_ID;
      page.hidden = true;
      page.style.cssText = 'position:absolute;inset:0;z-index:40;background:Canvas;overflow:hidden;';
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
  themeObserver = new MutationObserver(postSessions);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
  document.addEventListener('click', closeForNativeSidebarNavigation, true);
  install();
  window[SENTINEL] = { open: openShelf, close: closeShelf, refresh: postSessions, destroy: () => { observer?.disconnect(); themeObserver?.disconnect(); document.removeEventListener('click', closeForNativeSidebarNavigation, true); page?.remove(); entry?.remove(); delete window[SENTINEL]; } };
})();
