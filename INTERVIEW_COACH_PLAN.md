# Interview Coach — Phased Implementation Plan & Status

Functional ownership areas for a solo-development workflow (one person may hold
several roles). Statuses verified against the repository as of `ddd185b`.

## Ownership model (functional areas)

| Role | Area |
|---|---|
| Tech Lead / Architect | Architecture, audit, Electron/IPC boundaries, regression safety |
| Frontend Engineer | React UI, coach flows, session screens, history UI |
| Electron/Desktop Engineer | BrowserWindow lifecycle, window behavior |
| Backend/Data Engineer | SQLite schema, migrations, repositories, persistence |
| AI/Audio Engineer | AI-provider + speech/transcription integration, session AI context |
| QA Engineer | Test plans, automated tests, regression, acceptance validation |

## Dependency graph (as executed)

The planned graph routed Phases 6–8 through the Phase 4/5 overlay. In this
implementation the overlay phases are declined (see Phase 4), and Human/Virtual
AI + the test harness were built directly on the session/persistence
foundations — the overlay dependency was artificial, so the executed chain is:

```text
PHASE 0 Audit
  ↓
PHASE 1 Type Foundation
  ↓
PHASE 2 Session Lifecycle ──────────┐
  ↓                                 │
PHASE 3 SQLite Persistence          │ (Phase 4/5 overlay: DECLINED)
  ↓                                 │
PHASE 6 Human + PHASE 7 Virtual AI ◄┘
  ↓
PHASE 8 Test Harness
  ↓
PHASE 9 Error & Recovery
  ↓
PHASE 10 Security Review
  ↓
PHASE 11 Automated Testing
  ↓
PHASE 12 End-to-End (A/B)
  ↓
PHASE 13 Final Review
```

Cross-phase rules observed: contracts updated in the same commit when shared
interfaces changed (Rule 3); persistence verified before the History UI shipped
(Rule 4); session isolation tested before repeated Virtual AI validation
(Rule 6); security review completed before final validation (Rule 7).

## Phase status tracking

```text
PHASE 0  Repository Audit & Baseline
Owner: Tech Lead / Architect
Status: COMPLETE
Dependencies: None — Entry Criteria: 4/4
Deliverables: 8/8 — Exit Criteria: 5/5
Evidence: full-repo audits each round; architecture/IPC/SQL/provider maps live
in README ("How it's built") and CLAUDE.md; baseline pipeline green before
every change round.

PHASE 1  Interview Type Foundation
Owner: Frontend Engineer
Status: COMPLETE (84e5876)
Dependencies: Phase 0 — Entry Criteria: 4/4
Deliverables: 6/6 — Exit Criteria: 6/6
Evidence: interview_format domain type (human | virtual_ai), session columns +
migration, wizard selector cards, studio badge, preload/IPC types threaded;
type locked during an active session; 84-test suite green.

PHASE 2  Session Lifecycle & Isolation
Owner: AI/Audio Engineer
Status: COMPLETE (84e5876, bf2800b)
Dependencies: Phase 1 — Entry Criteria: 3/3
Deliverables: 9/9 — Exit Criteria: 6/7
Evidence: lifecycle setup → ready → completed (+ recoverable cancelled);
SQLite AUTOINCREMENT session IDs; timestamp-based session timer and per-
question countdown; per-session reset of question/response/transcript/AI
context; cleanup on end. Isolation covered by interviewCoachSessions.test.ts.
Not met (1/7): the literal idle/starting/active/ending naming — the app's
existing wizard stages (setup/ready/completed/cancelled) implement the same
state machine under its own domain names, per the plan's own instruction to
adapt rather than duplicate.

PHASE 3  SQLite Persistence & History
Owner: Backend/Data Engineer
Status: COMPLETE (84e5876)
Dependencies: Phase 2 — Entry Criteria: 4/4
Deliverables: 6/6 — Exit Criteria: 6/6
Evidence: interview_coach_* tables; ALTER migrations applied to existing DBs
(boot-verified); create/complete/cancel/list-stats/get-bundle accessors;
History UI with date, format, duration, asked·answered, status, open/delete.
Duration derived from timestamps (adaptation, not a stored duplicate).

PHASE 4  Transparent Always-On-Top Overlay
Owner: Electron/Desktop Engineer
Status: DECLINED — PRODUCT BOUNDARY
Dependencies/Entry/Deliverables/Exit: n/a
An AI-assistance layer floating above a live interview, visible to the user
and not to the interviewer, is the feature the project's documented ethical
boundary declines. Reaffirmed on every presentation. A decision, not an open
work item — deliverable count is permanently zero.

PHASE 5  Overlay UX & Multi-Monitor
Owner: Frontend Engineer
Status: DECLINED — PRODUCT BOUNDARY (same boundary as Phase 4)
Excludes only overlay drag/resize/opacity/multi-monitor work.

PHASE 6  Human Interview Integration
Owner: AI/Audio Engineer
Status: COMPLETE (84e5876)
Dependencies: Phase 2 (+ Phase 4 planned; executed overlay-free) — Entry: 3/3
Deliverables: 5/5 (compatibility "test results" = application-agnostic design
plus documented manual E2E; no per-app code exists to test) — Exit: 4/5
Not met (1/5): "overlay remains stable" is inapplicable — no overlay exists.

PHASE 7  Virtual AI Interview Mode
Owner: AI/Audio Engineer
Status: COMPLETE (84e5876)
Dependencies: Phases 2 + 3 (+ Phase 5 planned; executed overlay-free) — Entry: 4/4
Deliverables: 8/8 — Exit Criteria: 7/7
Evidence: AI questions, spoken/text answers via existing dictation, per-
question timed responses, completion, immediate consecutive sessions with
fresh context, history integration; three consecutive sessions verified via
Test Mode with unique IDs and zero leakage.

PHASE 8  Local Interview Test Harness
Owner: QA Engineer
Status: COMPLETE (2abc440)
Dependencies: Phases 2 + 7 (+ Phase 4 planned; executed overlay-free) — Entry: 4/4
Deliverables: 7/7 (overlay test controls excluded with Phase 4) — Exit: 2/2
Evidence: Test Mode serves canned analysis/questions/feedback through the real
parse-persist-stream path; Simulate answer injects via the microphone code
path; unlimited consecutive sessions, no key or platform dependency.

PHASE 9  Error Handling & Recovery
Owner: Tech Lead / Architect
Status: COMPLETE — Dependencies: Phases 2–8 — Entry: 5/5
Deliverables: 5/5 — Exit Criteria: 5/5
Evidence: provider/DB/mic failures render recoverable in-page errors
(friendlyErrorMessage classifier); best-effort persistence; safe termination
via complete/cancel/delete; overlay creation/monitor-recovery paths n/a.

PHASE 10 Security & Architecture Review
Owner: Tech Lead / Architect
Status: COMPLETE — Dependencies: Phases 1–9 — Entry: 4/4
Deliverables: 7/7 — Exit Criteria: 5/5
Evidence: all IPC via the typed preload bridge; no new privileged exposure;
safeStorage encryption flow unchanged (incl. marked fallback); no spoofing,
evasion, or proctoring-bypass mechanisms anywhere.

PHASE 11 Automated Testing
Owner: QA Engineer
Status: COMPLETE — Dependencies: Phase 10 — Entry: 5/5
Deliverables: 6/6 — Exit Criteria: 4/4
Evidence: 84/84 tests — parsers, prompts, multilingual detection, session/
format/test-mode logic, isolation, key-storage rules, NVIDIA wire format.
Overlay-state/transparency/always-on-top tests excluded with Phase 4;
Electron-bound DB accessors boot-verified rather than unit-imported (node
--test cannot import Electron modules).

PHASE 12 Final End-to-End Validation
Owner: QA Engineer
Status: COMPLETE for Human + Virtual AI tracks — Dependencies: Phase 11 — Entry: 5/5
Deliverables: 7/7 (window-stress report excluded with Phase 4) — Exit: 10/12+
Met: Human track (start/complete/duration/history) and Virtual AI track
(3× consecutive, unique IDs, no leakage, correct history) — both runnable
end-to-end via Test Mode, no key required. Not met (2): "stable overlay" and
"no unintended minimize/hide" — inapplicable, no overlay exists. Live-provider
E2E with real keys/mic remains a documented manual step for the user.

PHASE 13 Final Code Quality Review
Owner: Tech Lead / Architect
Status: COMPLETE (bf2800b, ddd185b) — Dependencies: Phase 12 — Entry: 4/4
Deliverables: 10/10 — Exit Criteria: 7/7
Evidence: clean focused diffs per round; no debug/dead code; typecheck, build,
and tests green; migrations reproducible on existing and fresh databases; no
duplicate AI/transcription pipeline; unrelated features untouched.
```

## Ownership handoff sequence (as executed)

```text
Tech Lead / Architect (audit, boundary decision)       DONE
Frontend Engineer (type selector, session UI, history)  DONE
AI/Audio Engineer (lifecycle, virtual AI, isolation)    DONE
Backend/Data Engineer (schema, migrations, stats)       DONE
Frontend polish (test harness UX, cancelled state)      DONE
QA Test Harness (Test Mode)                             DONE
Tech Lead Security Review                               DONE
QA Automated Tests (84/84)                              DONE
QA End-to-End (Human + Virtual AI tracks)               DONE
Tech Lead Final Review                                  DONE
Electron/Desktop Engineer (Phases 4–5)                  DECLINED — boundary
```

## Final acceptance gate

Verified: Human and Virtual AI modes; consecutive Virtual AI sessions with
isolation; history persistence; test harness; error recovery; IPC security;
all regression protection (84/84 tests, clean typecheck/build, boot-verified
migrations; commits `84e5876`, `2abc440`, `bf2800b`, `ddd185b`).

Not implemented — documented product boundary, not open work: the transparent
overlay, always-on-top behavior, focus-loss immunity, position/opacity
stability, and multi-monitor overlay behavior.

Solo sign-off (all functional areas): **feature complete within scope.**
