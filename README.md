# Codex Session Shelf

Codex Session Shelf is an independent local-first companion that adds a native-looking tab to the Codex desktop sidebar. It follows the same integration boundary used by projects such as [dashi-taskboard](https://github.com/chuspeeism/dashi-taskboard): a CDP-launched Codex renderer receives a document-start script, the script clones the native Plugins row, and the new tab hosts this project's local UI.

It does not edit `ChatGPT.app`, `app.asar`, Codex's SQLite/JSONL files, or the native React bundle. The shelf stores its own metadata in browser `localStorage` and asks the native sidebar to open a selected conversation.

## Run

```bash
npm install
npm run codex
```

`npm run codex` starts the local Vite UI on `http://127.0.0.1:4173`, launches an independent ChatGPT/Codex window with CDP on port `9231`, and keeps injecting into new renderer pages. Keep the terminal running while using the embedded tab.

For an already CDP-enabled window:

```bash
npm run inject
```

Set `CODEX_APP_PATH` if the desktop app is installed somewhere other than `/Applications/ChatGPT.app`. Set `CODEX_SESSION_SHELF_URL` to point the embedded tab at a built or separately hosted UI.

## Current scope

- Native sidebar tab injection, with an independent panel iframe
- Readable native session list and jump-back-to-native-session action
- Independent favorite state
- Four optional lifecycle states: active, long-term, follow-up, closed
- User-defined categories, tags, summary, and next action

The injector relies on the Codex renderer's current DOM markers and therefore needs a small compatibility pass when Codex changes its sidebar structure. This is intentionally isolated in `inject/codex-session-shelf.user.js`.
