# Codex 会话书架

Codex 会话书架是一个独立的本地优先工具，通过 CDP 向 Codex 桌面端注入一个原生风格的侧栏入口。实现边界参考了 [dashi-taskboard](https://github.com/chuspeeism/dashi-taskboard)：由常驻启动器管理本地服务和注入器，向 Codex 渲染进程注册文档启动脚本，克隆原生“插件”入口，并在新入口中加载本项目的本地 UI。

项目不会修改 `ChatGPT.app`、`app.asar`、Codex 的 SQLite/JSONL 文件或原生 React bundle。书架自己的收藏、分类和长期信息保存在 SQLite 中，并通过系统应用数据目录持久化；浏览器 `localStorage` 只用于兼容旧版本和服务暂时不可用时的兜底。打开会话时，再请求 Codex 原生侧栏执行会话跳转。

## 启动

```bash
npm install
npm run codex
```

开发模式会构建前端，启动本地 companion 服务，通过 `open -n` 启动一个独立的 Codex 窗口，并在 CDP 端口 `9231` 上持续注入脚本。开发数据保存在 macOS 的 `~/Library/Application Support/Codex Session Shelf/session-shelf.sqlite`。

### 热更新开发

修改 `src/` 后不想重新构建产物时，使用：

```bash
npm run codex:dev
```

该命令会启动开发 API（`127.0.0.1:4174`）、Vite dev server（`127.0.0.1:4173`）和注入器，并让 Codex 侧栏书架直接加载 Vite 地址。之后编辑 `src/` 的组件或样式，书架面板通过 Vite HMR 实时更新，无需任何构建或重注入。`Ctrl-C` 会一并退出三个进程。数据仍然保存在系统应用数据目录；需要隔离数据时设置 `CODEX_SESSION_SHELF_DATA_DIR`。

如果已有通过 CDP 启动的 Codex 窗口，且 Vite 与开发 API 已在运行，也可以只注入热更新地址：

```bash
npm run inject:dev
```

正式版本将通过 `Codex Session Shelf.app` 启动，不需要终端或 Node 环境。App 会在菜单栏驻留，负责启动/停止 companion、管理受管 Codex 窗口，并提供退出和登录时启动选项。

## 隔离验证

开发和验证默认使用 `npm run codex`。它会启动独立的 Codex 实例和独立 CDP 端口 `9231`，不会向你正在使用的 Codex 窗口发送点击或注入脚本。

`npm run inject` 只适用于已经通过 CDP 启动、且端口为 `9231` 的窗口。除非明确预留某个窗口用于测试，否则不要把注入器指向正在使用的 Codex 窗口。

如果已有一个通过 CDP 启动的窗口，也可以运行：

```bash
npm run inject
```

如果桌面应用不在 `/Applications/ChatGPT.app`，可以设置 `CODEX_APP_PATH`。如果希望书架加载已经构建或单独托管的 UI，可以设置 `CODEX_SESSION_SHELF_URL`。

## 当前能力

- 向 Codex 原生侧栏注入“会话书架”入口，并加载独立面板 iframe
- 日间/夜间主题自动跟随 Codex 当前设置
- 读取原生会话列表，并跳回 Codex 打开指定会话
- 书架置顶、书架“我的收藏”与 Codex 原生“置顶”三者完全独立；原生置顶只作为只读标识显示
- 多个 Codex 窗口通过同一个本地 SQLite 数据库同步收藏和长期信息
- 顶部标签导航，避免与 Codex 原生左侧菜单形成双重侧栏
- 四种可选生命周期：进行中、长期维护、待跟进、已结束
- 自定义分类、标签、摘要和下一步
- 会话书架与任务面板互斥显示

注入器依赖 Codex 当前渲染器提供的 DOM 标记。Codex 更新侧栏结构后，可能需要调整兼容逻辑；相关代码集中在 `inject/codex-session-shelf.user.js`。

## 发布架构

- `src-tauri/`：macOS 菜单栏启动器、单实例和 companion 生命周期管理。
- `server/`：正式本地 HTTP 服务、SQLite schema、迁移和 API。
- `scripts/prepare-tauri-app.mjs`：将构建后的前端、服务端和注入器准备为 App 资源。
- `src-tauri/binaries/`：随 App 打包的 Node runtime，不依赖用户本机安装 Node。

数据目录使用系统应用支持目录，日志使用系统日志目录；服务只监听 `127.0.0.1`，每次运行通过随机 token 隔离页面和 API。

`app:prepare` 会下载固定版本的 Node.js 官方 macOS runtime，校验 SHA256 后缓存在 `.cache/node-runtime/`，并将 Node LICENSE 一起打包，不依赖开发机的 Homebrew 或用户电脑上的 Node。离线构建可通过 `CODEX_SESSION_SHELF_NODE_BINARY` 和 `CODEX_SESSION_SHELF_NODE_LICENSE` 指定已经准备好的独立 runtime；脚本会拒绝含 Homebrew、`@rpath` 等不可移植动态依赖的二进制。

当前默认构建 Apple Silicon 版本。macOS 本地测试可以使用 ad-hoc 签名；公开发布仍需要 Apple Developer ID、hardened runtime、notarization 和 stapling，GitHub Release 中不应发布未经公证的 DMG。

```bash
npm run app:build          # 本地 ad-hoc 签名，用于开发验证
npm run app:build:release  # 使用 Apple Developer ID 的正式发布入口
```
