# MeetingPrep AI

A premium desktop studio for interview and meeting preparation — practice questions, code problems, spoken mock interviews, resume tailoring with ATS scoring, and live note-taking — powered by Gemini, OpenAI, Anthropic, or a fully local model via Ollama (your choice).

Built for learning and practice: it never impersonates you and never secretly answers on your behalf during a live evaluation. It includes a **capture shield** you can switch on to keep the window out of screen shares and recordings while you use it for *your own* notes and prep — see [Ethical boundary](#ethical-boundary) and [Capture shield](#capture-shield) below.

## What it does

### Prepare

- **Dashboard** — time-aware greeting, stat cards (practice sessions, coding sessions, favorites, day streak), a per-category activity chart, quick actions, and a streak banner.
- **Prep Room** — the pre-interview setup flow. Import your resume PDF (text extracted locally, stored encrypted) or paste it, set the target role, tech stack, experience level, and the actual job description (persisted, and auto-prefilled into Mock Interview), then generate a **prep pack**: the questions you're most likely to face for that exact role and posting, each with a suggested answer angle grounded in your resume. The pack is saved locally and exportable (Markdown/PDF), each question links straight into Practice, and a final **before-you-walk-in checklist** shows exactly what's ready (AI provider connected, resume saved, role/JD set, mic dictation available, at least one scored mock completed) plus the current capture-shield state.
- **Setup Guide** — the end-to-end walkthrough inside the app: what the app is built on, the seven setup steps from `npm install` to interview day, and the interview-day checklist.
- **Practice** — paste (or dictate) any question — technical, coding, behavioral, client, project, career, presentation… The app classifies it, then streams a structured answer: Answer / Why / Example / Key Points / Follow-up, at your chosen depth (short → expert-level). `Ctrl+Enter` submits; a mic button lets you ask hands-free.
- **Coding Lab** — describe a coding problem (optionally paste existing code into the Monaco editor) and stream a solution with explanation, complexity, edge cases, alternative approach, and common mistakes.
- **Question Analyzer** — classifies a question and routes it to Practice or Coding Lab.
- **Mock Interview** *(Pro)* — set the role, tech stack, experience level, an optional job description, question categories, depth, and count; the AI generates a role-tailored question sequence and evaluates each of *your* answers (score, strengths, improvements, model answer). Two voice features make it realistic:
  - **Listen** — the question is read aloud so you practice with spoken questions.
  - **Answer by voice** — dictate your answer with the mic instead of typing it.
  At the end, export a **session report**: every question, your answer, and the feedback as one Markdown or PDF file.
  Results feed into Insights.

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
- **AI provider** — Gemini / OpenAI / Anthropic / Local (Ollama), per-provider encrypted key entry, automatic model fallback.
- **Theme** — light / dark / follow-system, with a refined warm-paper (light) and deep-ink (dark) design system.
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

This is a *privacy* feature — for keeping your own notes and prep out of a shared screen. It is not an answer feed: the app never generates anything for you during a live evaluation (see [Ethical boundary](#ethical-boundary)).

## Setup — step by step

Everything you need to paste goes in one file: **`.env`**, in the project root (gitignored — nothing in it ever leaves your machine or gets committed). Quick reference:

| You need | Goes in | Variable name(s) | Required? |
|---|---|---|---|
| One AI provider key | `.env` | `GEMINI_API_KEY` **or** `OPENAI_API_KEY` **or** `ANTHROPIC_API_KEY` | Yes — pick one |
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

Open `.env` in the project root and paste it on the matching line — leave the other two blank:
```
GEMINI_API_KEY=paste-your-key-here
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```
Then in the app, go to **Settings → AI Provider** and select the one you filled in (it defaults to Gemini).

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
- **Design system** — custom Tailwind v3 token layer (warm-paper light / deep-ink dark themes, teal accent), always-dark sidebar, Outfit + Geist typography with graceful system fallbacks, custom icon set, component classes for cards/buttons/fields/chips, subtle grain + ambient gradients, entrance animations, styled scrollbars and focus rings.
- **SQLite** (Node's built-in `node:sqlite`, no native compile step) for local history, resume context, meeting notes, and settings — stored under your OS's app-data folder.
- **Electron `safeStorage`** (OS keychain / DPAPI / libsecret) encrypts your resume, meeting notes, tailored resumes, and API keys at rest.
- **Gemini, OpenAI, Anthropic, and Local (Ollama)** — four interchangeable `AIProvider` implementations (`electron/ai/*Provider.ts`) with automatic model and provider fallback, all streaming token-by-token. Local talks to [Ollama](https://ollama.com) on `127.0.0.1:11434` — no API key, nothing leaves the machine, and it's picked last in the fallback chain so a missing/not-running Ollama install fails fast instead of stalling.
- **Voice** — Web Speech API for dictation and live transcription (auto-restarting recognizer, interim results) and OS speech synthesis for read-aloud, wrapped in `src/lib/speech.ts`.
- **Resume PDF import** — `pdf-parse` (pdf.js) extracts text locally in the main process; kept external to the bundle so pdf.js resolves its worker correctly (also why `asar: false` in packaging).
- **AI text rendering** — inline markdown (bold/italic/code) from model output is rendered through a sanitized pipeline (`src/lib/markdown.ts` + DOMPurify).
- **Monaco editor** (`@monaco-editor/react`, bundled locally — never fetched from a CDN, to respect the app's CSP and privacy promise) for syntax-highlighted code editing in Coding Lab.
- **Export** uses Electron's built-in `dialog.showSaveDialog` and `webContents.printToPDF`.
- All AI calls and database access happen in the Electron **main process**; the UI (renderer) only talks to it through a typed IPC bridge (`electron/preload.ts`) with `contextIsolation` on, `sandbox` on, and `nodeIntegration` off — the renderer never sees your API keys or touches the filesystem directly.
- **Resources** is the one exception to that main-process-only rule: it uses the `firebase` web SDK directly in the renderer (`src/lib/firebase.ts`), because Firebase Auth/Firestore/Storage are designed to run client-side and a Firebase web config isn't a secret the way an AI provider key is. Admin/User roles are enforced by Firestore/Storage security rules (server-side), not by the client.

## Privacy & data

- Outside of Resources and speech features, nothing is sent anywhere except to your selected AI provider's API, and only when you submit a question or document. No telemetry, no analytics, no background network calls.
- **Voice dictation & live transcription** use the browser's Web Speech API: Chromium streams microphone audio to Google's speech service for recognition and returns text. Text is processed locally; only what you explicitly send to the AI provider (e.g. "summarize this transcript") leaves the machine beyond that. Read-aloud uses your OS voices and works offline.
- **Capture shield** changes only what other programs can capture — it sends nothing anywhere and is always user-controlled, never automatic.
- Resume context, meeting notes, tailored resumes, and API keys are encrypted at rest; practice history is stored locally but unencrypted (it's not sensitive by design). Resource files live in your Firebase Storage bucket, not on-device.
- Settings includes full data-deletion controls (wipe history / wipe resume / wipe everything) for local data; resources are deleted from the Resources page itself (Admin only).

## Ethical boundary

This tool is for preparation and learning — it is explicitly **not** a hidden live-answer feed. Everything in the app, including the Prep Room, happens *before* the interview: setup, predicted questions, and rehearsal. It won't:

- Listen to an interviewer and automatically generate answers for you during a live interview, exam, or client call.
- Auto-detect live questions and push answers to any overlay, second screen, or hidden window.
- Answer on your behalf while hiding that from the other participant, or try to bypass Teams/Zoom/Meet, OS, or organizational security controls.

The capture shield exists so *you* can keep your own notes and prep private during legitimate screen sharing — the same way any privacy screen works — not to conceal AI-generated answers during an evaluation. Everything voice-driven here is practice-side (spoken mock interviews, dictation) or note-taking (transcripts you're part of, with everyone's knowledge).

## Project layout

```
electron/            Main process
  main.ts              App entry, window creation, capture shield, .env loading
  pdf.ts               Resume PDF import (dialog + pdf-parse text extraction)
  env.ts               .env read/write helper
  export.ts            Save-dialog + Markdown/PDF export
  menu.ts              Native application menu (File/Edit/View/Go/Window/Help)
  preload.ts           Typed contextBridge API exposed to the renderer
  ai/                  Provider interface, Gemini/OpenAI/Anthropic implementations, prompts, retry/fallback
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
.github/workflows/    build.yml (installer build on v* tag pushes)
```
