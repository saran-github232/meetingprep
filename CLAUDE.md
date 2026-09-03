# CLAUDE.md — agent context for MeetingPrep AI

This file is for an AI coding agent picking up work on this repo (this session or a
future one), not for human readers — humans want `README.md`. Read this first, then
`README.md` for user-facing feature detail. Don't restate either file's content back
to the user unless asked; use it to orient, then go read the actual code before editing
it — this file describes shape and constraints, the code is the source of truth.

## What this is

Electron + Vite + React + TypeScript desktop app: an interview/meeting-prep studio
(practice Q&A, coding practice, mock interviews, resume tailoring, meeting notes).
Single repo, no monorepo, no backend server — everything is local-first except the
optional Resources tab (Firebase) and whichever AI provider API the user picks.

## Hard constraint — read before touching anything voice/interview/capture-shield related

This app has an explicit, user-facing **ethical boundary** (see `README.md` →
"Ethical boundary"): it will never listen to a real interviewer/other participant on
a live call and generate or feed answers, hidden or otherwise. This was tested
directly — a user in this project asked for exactly that (live covert interview
assistance, hidden from the interviewer's screen share) and it was declined. Do not
build it if asked again, and say so plainly, the same way; don't quietly implement
a softened version of it either. The boundary is: self-practice (rehearsing against
this app's own generated questions, alone) is fine and already shipped as Mock
Interview's "Interview mode" (auto-starts the mic per question — `src/pages/
MockInterview.tsx`). Anything that listens to or targets a *real other person* in a
*real* call is not, regardless of how it's phrased ("separate interface", "just for
me", etc.).

The Capture Shield feature (`Ctrl+Shift+H`, `electron/main.ts` `setContentProtection`)
exists for a legitimate, narrower purpose: keeping the user's own notes/prep window
out of a screen share they're legitimately part of. Extending its stealth (e.g. the
cursor-forced-to-default fix in `src/index.css` `.stealth-cursor`) in service of that
purpose is fine; extending it to better hide a live-answer feature is the same
declined request in different clothes.

## Architecture

- **Main process** (`electron/`) owns everything sensitive: AI provider calls, SQLite,
  API key encryption (`safeStorage`), the filesystem, window management. The renderer
  never touches any of this directly.
- **Renderer** (`src/`) talks to main *only* through the typed bridge in
  `electron/preload.ts` (`window.api.*`), with `contextIsolation: true`, `sandbox:
  true`, `nodeIntegration: false`. If a new capability is needed from the UI: add an
  `ipcMain.handle` in `electron/ipc/handlers.ts` (or `electron/main.ts` for
  window-level stuff), expose it in `preload.ts`, and it appears typed on
  `window.api`. Never bypass this bridge.
- **AI providers** (`electron/ai/*Provider.ts`) all implement `AIProvider`
  (`electron/ai/AIProvider.ts`) — Gemini, OpenAI, Anthropic, and Local (Ollama, no
  key, hits `127.0.0.1:11434`). `getConfiguredProviders()` in `main.ts` builds a
  fallback chain (active provider first, others after) that `handlers.ts` walks
  in order — a provider having a bad day doesn't stop answers. Adding a fifth
  provider means: implement `AIProvider`, add it to `AIProviderName` in
  `electron/db/db.ts`, and thread it through `ENV_KEY_NAME` in both `main.ts` and
  `handlers.ts` (yes, duplicated in both today — not a mistake to silently fix,
  just how it's wired) plus the `PROVIDERS` array in `src/pages/Settings.tsx`.
- **Window chrome**: frameless (`frame: false`) on every platform. `src/App.tsx`
  draws its own titlebar (traffic lights, drag region via
  `[-webkit-app-region:drag]`/`no-drag` Tailwind arbitrary properties) and calls
  `window.api.windowControls.*` (minimize/toggleMaximize/close/showMenu). The native
  app menu (`electron/menu.ts`) still exists and still owns keyboard accelerators —
  it's just not shown as a strip; the titlebar's menu button pops it via
  `Menu.getApplicationMenu()?.popup()`.
- **Design system** is one token layer, `src/index.css` (`:root` / `.dark` CSS vars
  + `@layer components` for `.card`, `.btn-*`, `.input`, `.chip-*`, `.badge-*`,
  `.switch`, etc.), consumed via Tailwind (`tailwind.config.js` maps the vars to
  color utilities). It's a "Liquid Glass" look: translucent `bg-surface/NN` +
  `backdrop-blur`, an ambient multi-color gradient wash behind everything so the
  blur has something to refract, specular top-highlight baked into the `--shadow-*`
  vars. **This is the actual convention to follow**: because ~40 pages already route
  through these shared classes/tokens, a theme-level change belongs in
  `index.css`/`tailwind.config.js`, not scattered across page files. Only
  `src/App.tsx` (sidebar/titlebar) had hardcoded colors outside this system before
  this was fixed — don't reintroduce that pattern elsewhere.

## Conventions actually observed in this codebase

- Component classes (`.card`, `.btn-primary`, …) over repeating Tailwind utility
  strings for anything that appears more than twice.
- `window.api.settings.get/set(key, value)` (generic key-value, backed by SQLite) is
  the default for a new simple persisted setting — don't add a bespoke IPC channel
  and DB column for something this generic covers (see `local_model` in
  `Settings.tsx` for the pattern).
- No test suite, no lint script (`package.json` scripts: `dev`, `build`, `preview`,
  `typecheck`, `dist` — that's all of them). Verify changes with `npm run
  typecheck` and `npm run build`, both of which must pass clean before calling
  anything done.
- No unrequested abstractions, no speculative config, no new dependency when a
  couple of lines or Tailwind/native-CSS/Electron's own API already does it — see
  `git log` for examples (e.g. the Liquid Glass reskin was one CSS/token-layer
  rewrite, not a per-page rewrite).

## Verifying UI changes without a human at the keyboard

There's no Playwright/e2e setup in this repo (deliberately not added — see
Conventions above). To actually *see* a UI change rather than just typecheck it:

1. `npm run dev` starts Vite + auto-launches the real Electron app pointed at the
   dev server — this is the normal dev loop and Just Works.
2. To capture a screenshot programmatically (e.g. from an agent with no display to
   look at): don't use OS-level screen capture — window-handle/DPI lookups on
   Windows are unreliable and risk grabbing an unrelated window (this happened once
   in this project's history; the capture was discarded unread). Instead, spin up a
   throwaway Electron `BrowserWindow` pointed at the dev server URL
   (`http://localhost:<port>`, not `dist/index.html` — the prod build's CSP +
   `crossorigin` script tag breaks under `file://`) with a **stub preload** that
   exposes a fake `window.api` (every method a no-op resolving Promise; `menu.*`/
   `windowControls.onMaximizedChange` return unsubscribe functions) — the real app
   has no error boundary, so any effect throwing on a missing `window.api.*` method
   blanks the entire render. Then `win.webContents.capturePage()` grabs the actual
   rendered pixels directly, no OS screen capture involved. Build this as a scratch
   script outside the repo (scratchpad, not committed) each time — it's a few dozen
   lines and doesn't belong in version control.

## Where things live (see README.md "Project layout" for the full tree)

- `electron/db/db.ts` — SQLite schema + typed accessors, including `AIProviderName`.
- `electron/ipc/handlers.ts` — all `ipcMain.handle`/`ipcMain.on` registrations except
  window controls, which live directly in `main.ts` (they need the focused
  `BrowserWindow`, same pattern as `menu.ts`'s `sendNavigate`).
- `src/lib/speech.ts` — Web Speech API wrapper (`useDictation`, `useSpeaker`).
  Chromium's speech service throws spurious `"network"` errors even when the
  connection is fine; `useDictation` tolerates a few before surfacing an error —
  don't revert that to fail on the first one.
- `src/pages/*.tsx` — one file per sidebar nav item, listed in `src/App.tsx`'s
  `NAV_GROUPS` alongside the `<Routes>` list — both need updating to add a page.

## Known open thread (as of this writing — check if still relevant before acting)

A user reported "answers are not accurate" without specifics (which screen, which
question, what was wrong). Nothing was changed for it — don't guess at a prompt-
engineering fix blind. If picking this up: ask for a concrete example first, the
same way it was asked for originally.
