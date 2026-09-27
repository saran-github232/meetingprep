# MeetingPrep AI

A premium desktop studio for interview and meeting preparation — practice questions, code problems, spoken mock interviews, resume tailoring with ATS scoring, and live note-taking — powered by Gemini, OpenAI, Anthropic, NVIDIA NIM, or a fully local model via Ollama (your choice).

Built for learning and practice: it never impersonates you and never secretly answers on your behalf during a live evaluation. It includes a **capture shield** you can switch on to keep the window out of screen shares and recordings while you use it for *your own* notes and prep — see [Ethical boundary](#ethical-boundary) and [Capture shield](#capture-shield) below.

## What it does

### Prepare

- **Dashboard** — time-aware greeting, stat cards (practice sessions, coding sessions, favorites, day streak), a per-category activity chart, quick actions, and a streak banner.
- **Prep Room** — the pre-interview setup flow. Import your resume PDF (text extracted locally, stored encrypted) or paste it, set the target role, tech stack, experience level, and the actual job description (persisted, and auto-prefilled into Mock Interview), then generate a **prep pack**: the questions you're most likely to face for that exact role and posting, each with a suggested answer angle grounded in your resume. The pack is saved locally and exportable (Markdown/PDF), each question links straight into Practice, and a final **before-you-walk-in checklist** shows exactly what's ready (AI provider connected, resume saved, role/JD set, mic dictation available, at least one scored mock completed) plus the current capture-shield state.
- **Setup Guide** — the end-to-end walkthrough inside the app: what the app is built on, the seven setup steps from `npm install` to interview day, and the interview-day checklist.
- **Practice** — paste (or dictate) any question — technical, coding, behavioral, client, project, career, presentation… The app classifies it, then streams a structured answer: Answer / Why / Example / Key Points / Follow-up, at your chosen depth (short → expert-level). `Ctrl+Enter` submits; a mic button lets you ask hands-free.
- **Coding Lab** — describe a coding problem (optionally paste existing code into the Monaco editor) and stream a solution with explanation, complexity, edge cases, alternative approach, and common mistakes.
- **Question Analyzer** — classifies a question and routes it to Practice or Coding Lab.
- **Mock Interview** *(Pro)* — set the role, tech stack, experience level, an optional job description, question categories, depth, and count; the AI generates a role-tailored question sequence and evaluates each of *your* answers (score, strengths, improvements, model answer). Two modes:
  - **Practice** — read each question at your own pace, use the mic when you're ready.
  - **Interview** — the mic starts listening the moment each question appears, so you answer hands-free without clicking anything between questions.
  Plus two voice features in either mode: **Listen** (the question is read aloud) and **Answer by voice** (dictate instead of typing).
  At the end, export a **session report**: every question, your answer, and the feedback as one Markdown or PDF file.
  Results feed into Insights.
  This is still self-practice against the app's own generated questions — see [Ethical boundary](#ethical-boundary) for what it deliberately won't do.

### Your profile

- **Resume Context** — your background, encrypted at rest, used only where directly relevant in answers and tailoring.
- **Resume Tailoring** *(Pro)* — a full job-application workbench:
  - **PDF import** — upload your existing resume; text is extracted locally (nothing uploaded anywhere), then saved as your resume context if you want.
  - Paste a job description → the AI rewrites your resume to match it, using **only what's already there** (never invented experience).
  - **ATS report** — a 0–100 score with a five-dimension breakdown (keyword alignment, relevant experience, skills & tools, measurable impact, formatting), plus matched and missing keyword chips.
  - **Side-by-side comparison** of the original vs tailored resume.
  - **Suggestions** — concrete, ranked advice on the highest-impact changes.
  - **Interview prep** — predicts 8–10 questions you're most likely to face for that exact job description, each with a suggested answer angle grounded in your background.
  - Every run is saved (encrypted) with its ATS score so you can revisit versions per job; exports include the full report.
- **Resources** — a shared, cloud-backed library (Firebase). An **Admin** signs in and publishes documents (PDF/DOC/TXT/etc.) or video links; any signed-in **User** can browse and open them. Requires Firebase setup — see [Resources (Admin/User) setup](#resources-adminuser-setup).
- **Meeting Notes** — manual notes with action items, plus a **Live session** mode: transcribe a meeting as it happens (with a session timer and word count), then run **Summarize with AI** to turn the transcript into a title, recap, and action items, ready to save. Only transcribe conversations you're part of — the UI says so too.

### Library

- **History / Favorites** — browse, search, tag, star, export, and delete past Practice and Coding Lab answers.
- **Review** — spaced-repetition flashcard mode: starred answers resurface on a widening schedule (1 → 3 → 7 → 14 → 30 → 60 days) so favoriting something turns it into ongoing practice, not a dead archive.
- **Insights** *(Pro)* — your weakest categories by average Mock Interview score, plus a full Practice activity breakdown by category.

### Settings & privacy

- **Capture shield** — one toggle (sidebar, Settings, or `Ctrl+Shift+H`) that excludes the app window from screen sharing, recording, and screenshots while it stays fully visible on your own display. Persisted across restarts, with the detected OS capability shown in Settings. See [Capture shield](#capture-shield).
- **AI provider** — Gemini / OpenAI / Anthropic / NVIDIA NIM / Local (Ollama), per-provider encrypted key entry, a **Test connection** button that verifies your key against the provider's real API, automatic model fallback, and plain-language error messages that distinguish a rejected key from a rate limit, a retired model, or no network.
- **Theme** — light / dark / follow-system, with a Liquid Glass design system (translucent blurred surfaces over an ambient gradient wash) in both.
- **Plan** — a local Free/Pro preview toggle with a features matrix (no billing connected yet).
- **Data controls** — wipe history / resume context / everything.

## Capture shield

When switched on, the window is excluded from screen capture at the OS level — it does not appear in Zoom/Teams/Meet screen sharing, OBS, or screenshots, while remaining fully visible on your monitor. Under the hood this is Electron's `setContentProtection` (Windows: `SetWindowDisplayAffinity`; macOS: window sharing disabled).

What each side sees, by platform (Settings → Privacy now shows the mode detected on your machine):

| Where you look | Windows 10 2004+ / Windows 11 · macOS | Older Windows (pre-2004) | Linux (X11) |
|---|---|---|---|
| **Your display** | Fully visible, behaves like a normal window | Visible on the primary monitor | Visible |
| **The share / recording / screenshot** | The window is removed entirely | A black rectangle instead | Captured normally — no exclusion available |

- If the window ever seems to vanish from *your own* screen with the shield on, you're on the legacy Windows fallback (`WDA_MONITOR`): the window is restricted to the primary monitor and captures show a black box instead of being excluded. Updating to Windows 10 2004+ switches it to full exclusion.
- Shortcut: `Ctrl+Shift+H`; state persists in the local database.
- **Cursor tell, fixed:** the OS mouse cursor is drawn by the compositor, not this window, so excluding the window doesn't exclude the cursor — a hand cursor changing over content a viewer can't see is a giveaway. While the shield is on, the whole app forces the plain arrow cursor everywhere (no hover-to-pointer on buttons/links) so nothing about the cursor hints that something is there.

This is a *privacy* feature — for keeping your own notes and prep out of a shared screen. It is not an answer feed: the app never generates anything for you during a live evaluation (see [Ethical boundary](#ethical-boundary)).

## Setup — step by step

Everything you need to paste goes in one file: **`.env`**, in the project root (gitignored — nothing in it ever leaves your machine or gets committed). Quick reference:

| You need | Goes in | Variable name(s) | Required? |
|---|---|---|---|
| One AI provider key | `.env` | `GEMINI_API_KEY` **or** `OPENAI_API_KEY` **or** `ANTHROPIC_API_KEY` **or** `NVIDIA_API_KEY` | Yes — pick one |
| Optional NVIDIA model override | `.env` | `NVIDIA_MODEL` | No — only for NVIDIA, see [NVIDIA NIM provider](#nvidia-nim-provider) |
| Firebase config (for Resources tab) | `.env` | `VITE_FIREBASE_API_KEY` + 5 more `VITE_FIREBASE_*` vars | No — only if you want Resources |

**1. Get the code**

Requires [Git](https://git-scm.com/downloads) and [Node.js 22.5+](https://nodejs.org) installed first.

```
git clone https://github.com/saran-github232/meetingprep.git
cd meetingprep
```

*No Git?* Click **Code → Download ZIP** on the [GitHub page](https://github.com/saran-github232/meetingprep), unzip it, then open a terminal in that folder.

**2. Install dependencies**
```
npm install
```

**3. Get an AI provider key (required — pick exactly one)**

| Provider | Get a key at |
|---|---|
| Gemini (free tier available) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| NVIDIA NIM (free credits for new accounts) | [build.nvidia.com](https://build.nvidia.com) — see [NVIDIA NIM provider](#nvidia-nim-provider) |

Open `.env` in the project root and paste it on the matching line — leave the others blank:
```
GEMINI_API_KEY=paste-your-key-here
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
NVIDIA_API_KEY=
```
Then in the app, go to **Settings → AI Provider** and select the one you filled in (it defaults to Gemini). Press **Test connection** to verify the key is accepted before your first question — it makes a small real request and tells you plainly whether the key works.

*Alternative:* skip editing `.env` by hand — paste the key directly into **Settings → AI Provider** in the running app instead. It writes it into `.env` for you and also stores an encrypted copy in your OS keychain.

*Prefer to run fully offline instead?* Install [Ollama](https://ollama.com), run `ollama pull llama3.1:8b` (or any other model), start Ollama, then pick **Local (Ollama)** in **Settings → AI Provider** — no key needed.

**4. (Optional) Add Firebase config — only if you want the Resources tab**

Everything else in the app works without this; Resources just shows "Firebase isn't configured" until you do it. It needs six more lines in the same `.env` file:
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```
Full console-by-console steps (including the security rules you must paste in) are in [Resources (Admin/User) setup](#resources-adminuser-setup) below.

**5. Run it**
```
npm run dev
```
This starts Vite + Electron together; the app window opens automatically with hot reload. If you edited `.env` while it was already running, restart it — `.env` is only read at startup.

## NVIDIA NIM provider

[NVIDIA Build](https://build.nvidia.com) hosts NVIDIA's model catalog behind an OpenAI-compatible API ("NIM"). This app ships it as a first-class provider, so an `nvapi-…` key works exactly like a Gemini/OpenAI/Anthropic key.

**Getting and configuring a key**

1. Sign in at [build.nvidia.com](https://build.nvidia.com) with an NVIDIA account (free; new accounts get trial credits).
2. On any model page (or the header), click **Get API Key** and generate a key with the **AI Foundation Models and Endpoints** scope enabled. Keys start with `nvapi-`.
3. Either paste the key in **Settings → AI Provider → NVIDIA NIM → Save**, or put it in `.env` as `NVIDIA_API_KEY=nvapi-…` and restart the app. The Settings page saves it encrypted in your OS keychain *and* into the gitignored `.env`; never commit it.
4. Select **NVIDIA NIM** in Settings → AI Provider and press **Test connection**. A green result means the key authenticated against NVIDIA's live API; a red one tells you exactly what failed (bad key, no network, rate limit…).

**Model selection**

The default chain is:

1. `nvidia/nemotron-3-super-120b-a12b` — NVIDIA's first-party MoE model (120B total, ~12B active per token): fast streaming, 128k context, strong instruction following for this app's structured answer formats, and a reasoning toggle disabled via NIM's documented `chat_template_kwargs` so no thinking traces pollute the output.
2. `nvidia/nemotron-3.5-lightning-30b-a3b` — newer, lighter MoE (~3B active); the speed pick if the primary is busy.
3. `z-ai/glm-5.3-flash` — a fast third-party model on the same NVIDIA-hosted API, so the chain stays inside one provider.

This chain was **verified live against `integrate.api.nvidia.com` in September 2026** — NVIDIA retires models regularly (the once-default `meta/llama-3.3-70b-instruct` went end-of-life on 2026-08-26 and returns `410 Gone`), so the defaults here are models confirmed available at writing time, not just catalog listings. If a default is ever retired, the provider automatically falls through to the next.

**Pinning a different model** — set `NVIDIA_MODEL` in `.env` to the exact catalog name (from [build.nvidia.com/models](https://build.nvidia.com/models)) and restart:

```
NVIDIA_API_KEY=nvapi-...
NVIDIA_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

A pinned model is used *alone* (no fallback), so a typo'd name surfaces as a clear error instead of being silently masked. If NVIDIA retires your pinned model you'll get a "model not found / end of life" error — remove the override or pick another name.

**How requests are made** — `POST https://integrate.api.nvidia.com/v1/chat/completions` with `Authorization: Bearer <key>` and an OpenAI-shaped JSON body, streaming via SSE. The key lives only in the Electron main process; the renderer never sees it, and error messages never echo it.

## Plan / subscription

A `Plan` preview lives in Settings, laying the groundwork for a future paid tier. **Plan (Free/Pro) and the Resources Admin/User role are two separate, unrelated axes** — Plan controls which *app features* are unlocked; Admin controls who can *publish shared resources*.

| Free | Pro |
|---|---|
| Practice & Coding Lab, all providers, voice dictation, Prep Room & Setup Guide | PDF export |
| History, Favorites, tags, Review | Mock Interview (AI feedback on *your* answers, JD-tailored) |
| Live meeting transcription & AI summaries | Bulk export (entire history as one file) |
| Markdown export | Insights (weak-category detection) |
| Shared Resources (view, once signed in) | Resume Tailoring (PDF import, ATS report, comparison, suggestions, interview prep) |
| Dashboard streak & category breakdown | Capture shield (free by design — it's a privacy feature, not a perk) |

**No payment provider is connected.** The Settings toggle just flips a local `plan` flag (`free`/`pro`) so gated UI can be built and tested now; wiring up real billing (Stripe, RevenueCat, etc.) is a separate step that needs a provider account and, for a desktop app, a licensing/entitlement server.

## Resources (Admin/User) setup

The Resources page needs a Firebase project (Auth + Firestore + Storage). This is the one feature in the app that talks to a server other than your chosen AI provider — see [Privacy & data](#privacy--data) for what that means.

**1. Create the project**
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → give it a name → finish the wizard (Google Analytics is not needed, skip it).
2. **Build → Authentication** → **Get started** → enable the **Email/Password** sign-in provider.
3. **Build → Firestore Database** → **Create database** → start in **production mode** → pick a region.
4. **Build → Storage** → **Get started** → production mode → same region.
5. **Project settings** (gear icon) → **General** → under "Your apps", click the **Web** icon (`</>`) → register an app (nickname doesn't matter, no hosting needed) → copy the `firebaseConfig` values it shows you.

**2. Configure the app**

Paste the six values from step 5 into `.env` under the `VITE_FIREBASE_*` variables — see [Setup step 4](#setup--step-by-step) above. Restart `npm run dev` after editing `.env` — Vite only reads it at startup.

**3. Deploy security rules**

These are what actually enforce Admin-only writes — the app's own "is this user an admin" check is just a convenience for the UI, not real enforcement. In the Firebase console:

**Firestore → Rules**, replace the contents with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.token.email));
    }
    match /admins/{email} {
      allow get: if isSignedIn() && request.auth.token.email == email;
      allow write: if false; // managed by hand in the console, see step 4
    }
    match /resources/{id} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }
  }
}
```

**Storage → Rules**, replace the contents with:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /resources/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        firestore.exists(/databases/(default)/documents/admins/$(request.auth.token.email));
    }
  }
}
```

Click **Publish** on both.

**4. Make yourself Admin**

In Firestore, manually create a document: collection `admins`, document ID = **your exact sign-in email**, any single field (e.g. `addedAt: <any value>`) — the document just needs to *exist*, its contents don't matter. Anyone without a matching document is a regular User.

**5. Try it**

In the app, open **Resources**, "Create an account" with your admin email, sign in — you should see an **Admin** badge and an **Upload Resource** button. Anyone else who creates an account there is a read-only User.

**Note on file links:** `getDownloadURL()` returns a link with an access token baked in — once generated, that link works for anyone who has it, even if you later delete the Firestore doc's *reference* to it (the file itself is still removed from Storage on delete, so the link breaks then, but rotating rules alone won't revoke an already-issued link). Treat resource links as "shareable," not "private."

## Requirements

- Node.js **22.5+** (the app uses Node's built-in `node:sqlite`; recommend 22 LTS or newer)
- An API key for one AI provider (see [Setup](#setup--step-by-step) above)

## Building a distributable

```
npm run build   # type-check + bundle renderer and main process
npm run dist    # package into an installer via electron-builder (output in release/)
```

Windows produces an NSIS installer; macOS produces a `.dmg` (must be built on a Mac — electron-builder can't cross-compile a signed `.dmg` from Windows). Neither is code-signed, so Windows SmartScreen / macOS Gatekeeper will show an "unrecognized publisher" warning on first launch — expected, not an error; signing needs a paid certificate and isn't set up.

Packaging notes:
- **`asar` is intentionally disabled** so `pdf-parse`/`pdf.js` can load its worker file and native canvas dependency from disk at runtime (needed for resume PDF import).
- **AI provider keys need no build-time setup** — they're read from `.env`/keychain at runtime on whichever machine runs the app.
- **Firebase config is different — it's baked in at build time.** Vite inlines every `VITE_FIREBASE_*` value into the bundle when you run `npm run build`/`npm run dist`, so your project-root `.env` must have the six values filled in *before* packaging, or the packaged app's Resources tab will show "Firebase isn't configured".
- **GitHub Actions** (`.github/workflows/build.yml`, runs on any `v*` tag push): the workflow can't see your local `.env` — add the same six `VITE_FIREBASE_*` values as **repo secrets** (Settings → Secrets and variables → Actions) with the exact same names. Skipping this just means CI-built installers ship with Resources non-functional; everything else works.

## How it's built

- **Electron + Vite + React + TypeScript** desktop shell.
- **Custom mac-style titlebar** — the window is frameless (`frame: false` in `electron/main.ts`) on every platform; `src/App.tsx` draws its own draggable titlebar with traffic-light close/minimize/maximize controls (wired to new `window:*` IPC handlers) and a menu button that pops up the native application menu, since a frameless window hides the OS menu bar on Windows/Linux (macOS keeps its own system menu bar regardless).
- **Design system** — a Liquid Glass–style Tailwind v3 token layer: translucent, backdrop-blurred surfaces (`bg-surface/70` + `backdrop-blur`) with a soft specular top highlight, floating over an ambient multi-color gradient wash (daylight glass in light mode, smoked glass in dark mode), theme-aware floating sidebar, cyan-teal accent glow, Outfit + Geist typography with graceful system fallbacks, custom icon set, component classes for cards/buttons/fields/chips, subtle grain, entrance animations, styled scrollbars and focus rings.
- **SQLite** (Node's built-in `node:sqlite`, no native compile step) for local history, resume context, meeting notes, and settings — stored under your OS's app-data folder.
- **Electron `safeStorage`** (OS keychain / DPAPI / libsecret) encrypts your resume, meeting notes, tailored resumes, and API keys at rest.
- **Gemini, OpenAI, Anthropic, NVIDIA NIM, and Local (Ollama)** — five interchangeable `AIProvider` implementations (`electron/ai/*Provider.ts`) with automatic model and provider fallback, all streaming token-by-token. NVIDIA NIM talks to `integrate.api.nvidia.com` with the same OpenAI-shaped payload the OpenAI provider uses (see [NVIDIA NIM provider](#nvidia-nim-provider)). Local talks to [Ollama](https://ollama.com) on `127.0.0.1:11434` — no API key, nothing leaves the machine, and it's picked last in the fallback chain so a missing/not-running Ollama install fails fast instead of stalling.
- **Test connection & error mapping** — every provider key can be verified against its provider's live API before real use (`electron/ai/validate.ts`, one cheap request), and all AI errors pass through a single classifier (`electron/ai/retry.ts`) that rewrites raw HTTP failures into plain-language guidance: rejected key, retired/unknown model, rate limit, provider outage, timeout, or no network — with the technical detail kept after a separator.
- **Voice** — Web Speech API for dictation and live transcription (auto-restarting recognizer, interim results, tolerant of a few transient "network" errors from Chromium's speech service before surfacing one) and OS speech synthesis for read-aloud, wrapped in `src/lib/speech.ts`.
- **Resume PDF import** — `pdf-parse` (pdf.js) extracts text locally in the main process; kept external to the bundle so pdf.js resolves its worker correctly (also why `asar: false` in packaging).
- **AI text rendering** — inline markdown (bold/italic/code) from model output is rendered through a sanitized pipeline (`src/lib/markdown.ts` + DOMPurify).
- **Monaco editor** (`@monaco-editor/react`, bundled locally — never fetched from a CDN, to respect the app's CSP and privacy promise) for syntax-highlighted code editing in Coding Lab.
- **Export** uses Electron's built-in `dialog.showSaveDialog` and `webContents.printToPDF`.
- All AI calls and database access happen in the Electron **main process**; the UI (renderer) only talks to it through a typed IPC bridge (`electron/preload.ts`) with `contextIsolation` on, `sandbox` on, and `nodeIntegration` off — the renderer never sees your API keys or touches the filesystem directly.
- **Resources** is the one exception to that main-process-only rule: it uses the `firebase` web SDK directly in the renderer (`src/lib/firebase.ts`), because Firebase Auth/Firestore/Storage are designed to run client-side and a Firebase web config isn't a secret the way an AI provider key is. Admin/User roles are enforced by Firestore/Storage security rules (server-side), not by the client.

## Troubleshooting

All AI failures surface as plain-language messages — the raw provider error is kept below a "Technical detail:" separator. The common ones:

| Message / symptom | Likely cause & fix |
|---|---|
| **"No API key found for …"** (Settings) | The selected provider has no key saved. Paste one in Settings → AI Provider → **Save**, or set the matching `*_API_KEY` in `.env` and restart the app (`.env` is read once at startup). |
| **"The API key was rejected by the AI provider"** (401/403) | The key is wrong, revoked, or saved under the wrong provider. Keys only work with their own provider selected — an NVIDIA `nvapi-…` key must be saved while **NVIDIA NIM** is selected; pasting it under Gemini/OpenAI/Anthropic always fails. Regenerate the key if needed, press **Test connection**, and switch provider chips to match. |
| **"The AI provider doesn't recognize the configured model"** (404/410) | A `NVIDIA_MODEL` override has a typo, or the model was retired — NVIDIA retires models regularly and retired ones answer `410 Gone`. Remove the override or pick a live name from [build.nvidia.com/models](https://build.nvidia.com/models). |
| **"Rate-limiting this key"** (429) | Quota exhausted for now; the app already retried automatically. Wait, or switch provider. NVIDIA trial credits also run out — check your balance on build.nvidia.com. |
| **"The AI provider's servers are having a problem"** (5xx) | Provider outage. Retry shortly, or switch provider. |
| **"Couldn't reach the AI provider"** | No internet — or, for Local (Ollama), Ollama isn't running. **Test connection** re-runs the same check on demand. |
| **"…didn't respond in time"** | Slow provider or flaky network. Retry; if it persists, try a different provider or a lighter model. |
| **Test connection fails but the key looks right** | Check for stray spaces/quotes when pasting, confirm the key's scope (NVIDIA keys need **AI Foundation Models and Endpoints** enabled), and confirm your network allows the provider's domain (corporate proxies often block AI endpoints). |
| **App won't start / blank window** | Run `npm run build` and check for errors; verify Node.js 22.5+ (`node --version`). Delete `dist-electron/` and rebuild if the main process is stale. |
| **`npm run dev` opens nothing** | Check the terminal for the Vite URL; if the port is taken Vite picks another — close the stray dev instance and re-run. |
| **`.env` changes don't take effect** | Fully quit the app and start it again — `.env` is only read at startup. |

## Testing

```
npm test          # unit/integration suite (node --test, no extra dependencies)
npm run typecheck # strict TypeScript across electron/ and src/
npm run build     # full production build (type-check + bundle)
```

The suite (`tests/`) covers the pure logic the app depends on: the error classifier (401/403 → rejected key, 404/410 → model retired, 429 → rate limit, timeouts, network failures), retry/fallback semantics (including "never stitch two models mid-stream"), the prompt parsers (meeting summaries, prep packs, question lists), and the NVIDIA wire format (endpoint, `Bearer` auth header, payload shape, nemotron `thinking: false` flag, and the streamed `<think>`-block filter, including chunks split mid-tag).

**End-to-end verification** (what "done" means beyond the unit tests):

1. `npm run build` succeeds and `npx electron .` opens the app.
2. Settings → AI Provider shows all five providers; selecting one shows *that* provider's key status (per-provider, not global).
3. Paste a real key → **Test connection** → green "Key is valid" message.
4. Paste a deliberately invalid key → **Test connection** → a red, specific message (e.g. NVIDIA: "The API key was rejected…"), never a raw HTTP dump and never the key itself.
5. Ask a Practice question → structured answer streams in section by section.

The NVIDIA request path was additionally verified against the **live** `integrate.api.nvidia.com` API: the wire format is accepted (invalid keys get a definitive 403 "Authorization failed", retired models a 410), and the bundled validation code was executed for real against NVIDIA, Gemini, OpenAI, and Anthropic endpoints. A full *successful* generation with NVIDIA requires a valid `nvapi-` key with credits — by design that secret never exists in this repo or CI, so run step 5 yourself with your own key.

## Example output

Illustrative example (not a live API response) of **Settings → AI Provider → NVIDIA NIM → Test connection**:

- Valid key: ✅ `Key is valid — NVIDIA accepted it (validated with nvidia/nemotron-3-super-120b-a12b).`
- Invalid key: ❌ `The API key was rejected by the AI provider. Check that the key is pasted correctly and still active in Settings → AI provider (a key for one provider won't work on another — e.g. an NVIDIA "nvapi-…" key must be saved with the NVIDIA provider selected).`
- No key yet: ❌ `No API key saved for this provider yet. Paste one above (or in .env) first.`

Illustrative example (not a live API response) of a **Practice** answer, showing the fixed section format every provider is prompted to produce:

```
### Answer
Start with kubectl describe pod and the events section — in most restart loops it names the
probe or OOM reason directly. Then check the previous container's logs.

### Why
The events timeline distinguishes liveness-probe kills from OOMKills from node pressure, and
each has a different fix.

### Example
On our UAT cluster, a service looped every ~90s; describe showed Liveness probe failed,
which traced to a /healthz endpoint that needed a DB connection.

### Key Points
- describe pod + events first
- previous-container logs for the crash
- check probe timing vs. startup time

### Follow-up
- How would you tell OOMKill from a probe failure?
- When would you tune initialDelaySeconds?
```

## Privacy & data

- Outside of Resources and speech features, nothing is sent anywhere except to your selected AI provider's API, and only when you submit a question or document. No telemetry, no analytics, no background network calls.
- **Voice dictation & live transcription** use the browser's Web Speech API: Chromium streams microphone audio to Google's speech service for recognition and returns text. Text is processed locally; only what you explicitly send to the AI provider (e.g. "summarize this transcript") leaves the machine beyond that. Read-aloud uses your OS voices and works offline.
- **Capture shield** changes only what other programs can capture — it sends nothing anywhere and is always user-controlled, never automatic.
- Resume context, meeting notes, tailored resumes, and API keys are encrypted at rest; practice history is stored locally but unencrypted (it's not sensitive by design). Resource files live in your Firebase Storage bucket, not on-device.
- **API keys never reach the renderer.** All provider calls (and the Test-connection check) run in the Electron main process behind the typed IPC bridge; the UI sends "please use this key", never receives it back, and error messages are built to never echo the key. `.env` is gitignored, and `.env.example` contains placeholders only.
- Settings includes full data-deletion controls (wipe history / wipe resume / wipe everything) for local data; resources are deleted from the Resources page itself (Admin only).

## Ethical boundary

This tool is for preparation and learning — it is explicitly **not** a hidden live-answer feed. Everything in the app, including the Prep Room, happens *before* the interview: setup, predicted questions, and rehearsal. It won't:

- Listen to an interviewer and automatically generate answers for you during a live interview, exam, or client call.
- Auto-detect live questions and push answers to any overlay, second screen, or hidden window.
- Answer on your behalf while hiding that from the other participant, or try to bypass Teams/Zoom/Meet, OS, or organizational security controls.

The capture shield exists so *you* can keep your own notes and prep private during legitimate screen sharing — the same way any privacy screen works — not to conceal AI-generated answers during an evaluation. Everything voice-driven here is practice-side (spoken mock interviews, dictation) or note-taking (transcripts you're part of, with everyone's knowledge). Mock Interview's **Interview mode** (auto-listening mic, see [What it does](#what-it-does)) is still you rehearsing solo against the app's own generated questions — not a live-call feature, and there is no mode that listens to a real interviewer or an actual conversation you're taking part in.

## Project layout

```
electron/            Main process
  main.ts              App entry, frameless window creation, window:* controls, capture shield, .env loading
  pdf.ts               Resume PDF import (dialog + pdf-parse text extraction)
  env.ts               .env read/write helper
  export.ts            Save-dialog + Markdown/PDF export
  menu.ts              Native application menu (File/Edit/View/Go/Window/Help), popped up via the titlebar menu button
  preload.ts           Typed contextBridge API exposed to the renderer
  ai/                  Provider interface, Gemini/OpenAI/Anthropic/NVIDIA/Ollama implementations,
                       prompts, retry/fallback, key validation (validate.ts), NVIDIA wire helpers (nvidiaWire.ts)
  db/                  SQLite schema + access (settings, history, notes, tailoring results)
  ipc/                 IPC handlers (qa, coding, resume, notes, stealth, AI, export)
  security/            OS-keychain encryption helpers
src/                 Renderer (React UI)
  pages/               One file per nav screen (Dashboard … Settings)
  components/          AnswerSections, HistoryList, MicButton, icons (custom set)
  lib/                 speech.ts (dictation + TTS), useStealth.ts, interview.ts (shared setup keys/levels),
                       markdown.ts (sanitized inline MD), theme, answer parsing, export, plan/feature gating,
                       firebase + auth
public/               favicon
tests/                Unit/integration suite (node --test): error mapping, retry/fallback,
                      prompt parsers, NVIDIA wire format — run with `npm test`
.github/workflows/    build.yml (installer build on v* tag pushes)
```
