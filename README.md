# codex-agent

Desktop Electron app with a React UI and a local daemon for running Codex-style workflows, chats, tools, and provider integrations.

## Prerequisites

- Node.js 22 or newer
- npm
- Windows, macOS, or Linux with Electron support

## Install

```bash
npm install
```

## Build

Build the Electron main process:

```bash
npm run desktop:build
```

Build the UI:

```bash
npm run ui:build
```

Run tests:

```bash
npm test
```

## Run

Build everything and launch the desktop app:

```bash
npm run desktop:start
```

## Provider Setup

### Anthropic

1. Open the app onboarding flow or Settings.
2. Select `Anthropic (Claude)`.
3. Paste your Anthropic API key.
4. Save. The app updates the active provider and model refs to the Anthropic defaults.

### Ollama

1. Install and start Ollama locally.
2. Open the app onboarding flow or Settings.
3. Select `Ollama (Local)`.
4. Save. The default base URL is `http://localhost:11434`.

### OpenAI Codex

1. Select `OpenAI Codex`.
2. Start the login flow.
3. Complete the OAuth flow in the browser.

## Architecture

- `desktop/main.ts`: Electron main process, IPC surface, OAuth bridge, daemon bootstrap.
- `desktop/daemon/server.ts`: local HTTP daemon that exposes sessions, runs, tools, storage, and background services.
- `desktop/services/`: provider runtimes, persistence, workflow execution, browser tools, sync, analytics, and connectivity monitoring.
- `ui/src/`: React renderer, Zustand stores, onboarding, settings, chat, dashboards, and feature views.
- `src/types/`: shared types used by the main process, daemon, and renderer.

## Notes

- App data is stored under the local Codex Agent data directory resolved by the desktop services layer.
- Provider auth is stored separately from general app settings.
- The renderer talks to the Electron main process through `desktop/preload.ts`, and the main process proxies most stateful operations to the daemon.
