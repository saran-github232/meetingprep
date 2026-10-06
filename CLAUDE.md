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
  (`electron/ai/AIProvider.ts`) — Gemini, OpenAI, Anthropic, NVIDIA NIM (OpenAI-compatible
  hosted API at `integrate.api.nvidia.com`), and Local (Ollama, no key, hits
  `127.0.0.1:11434`). `getConfiguredProviders()` in `main.ts` builds a fallback chain
  (active provider first, others after) that `handlers.ts` walks in order — a provider
  having a bad day doesn't stop answers. Adding a sixth provider means: implement
  `AIProvider`, add it to `AIProviderName` in `electron/db/db.ts`, and thread it through
  `ENV_KEY_NAME` in both `main.ts` and `handlers.ts` (yes, duplicated in both today — not a
  mistake to silently fix, just how it's wired) plus the `PROVIDERS` array in
  `src/pages/Settings.tsx` and the endpoint table in `electron/ai/validate.ts`.
- **Error handling** is centralized: providers throw with a numeric `.status` where they have
  one, and `classifyError`/`friendlyErrorMessage` in `electron/ai/retry.ts` turn any failure
  into user-facing guidance (invalid key / model retired 404+410 / rate limit / 5xx /
  timeout / network). Don't bypass it — new failure modes belong in the classifier with a
  test in `tests/errors.test.ts`.
- **Key validation** ("Test connection" button) lives in `electron/ai/validate.ts` — one
  cheap real request per provider. Note NVIDIA's `GET /v1/models` is PUBLIC (does not check
  auth), so NVIDIA validates via a minimal `max_tokens` chat completion instead, walking the
  model chain past retired (410) models.
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
- There is now a test suite (`npm test` → `node --test tests/`, no extra dependencies —
  Node ≥23.6 strips types natively). The trade-off: test-imported modules must be pure,
  import-free, and avoid non-erasable syntax (no parameter properties/enums) — that's why
  NVIDIA's wire helpers live in `electron/ai/nvidiaWire.ts` (plain functions, zero imports)
  instead of inside `NvidiaProvider.ts`. Tests import source with explicit `.ts` extensions
  (`../electron/ai/retry.ts`). `tsc -b` doesn't cover `tests/` (tsconfig includes only
  `src` + `electron`); run `npm test` explicitly. Keep all three green before calling work
  done: `npm test`, `npm run typecheck`, `npm run build`.
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
- `electron/ai/providerKeys.ts` — the single source of truth for API-key storage
  naming (settings row + env var per provider); both `main.ts` and `handlers.ts`
  read it — don't reintroduce per-file `ENV_KEY_NAME` maps. `security/crypto.ts`
  saves in a marked base64 mode (`plain:v1:`) when `safeStorage` is unavailable
  instead of throwing; that throw used to make key saves silently fail.
- `electron/ai/interviewCoach.ts` — Interview Coach pure logic (prompts, parsers,
  speed-graded trimming, session memory, `orderNamesForCoach`, script-range language
  detection for English/Telugu/Hindi/mixed, the Telugu transcription & alignment
  role profile + topic bank, and raw job-posting parsing), import-free like
  `nvidiaWire.ts` so tests import it directly. Coach speed→model chains live in
  the providers themselves (Gemini `coachModels`, `nvidiaCoachModels` in
  nvidiaWire.ts) — don't hardcode model names in feature code or handlers. The
  coach IPC persists answers/feedback only after the stream completes cleanly,
  and the one-time resume/JD analysis is cached in the session's context row;
  nothing should re-send the full resume per question. Response language follows
  the question (detection) unless the session/selector sets an explicit language,
  and the "### " section headers stay English in every language — the parsers
  key off them. The coach is practice-only by design (see the ethical-boundary
  section above): no path may feed answers during a real call, and the studio's
  privacy panel must keep its exact claims (shield excludes from supported
  capture; never "undetectable"; no injection into other apps).

## Known open thread (as of this writing — check if still relevant before acting)

A user reported "answers are not accurate" without specifics (which screen, which
question, what was wrong). Nothing was changed for it — don't guess at a prompt-
engineering fix blind. If picking this up: ask for a concrete example first, the
same way it was asked for originally.
