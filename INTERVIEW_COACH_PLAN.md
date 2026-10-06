# Interview Coach — Phased Implementation Plan & Status

Functional ownership areas for a solo-development workflow (one person may hold
several roles). Statuses are verified against the repository as of `bf2800b`.

## Ownership model (functional areas)

| Role | Area |
|---|---|
| Tech Lead / Architect | Architecture, audit, Electron/IPC boundaries, regression safety |
| Frontend Engineer | React UI, coach flows, session screens, history UI |
| Electron/Desktop Engineer | BrowserWindow lifecycle, window behavior |
| Backend/Data Engineer | SQLite schema, migrations, repositories, persistence |
| AI/Audio Engineer | AI-provider + speech/transcription integration, session AI context |
| QA Engineer | Test plans, automated tests, regression, acceptance validation |

## Phase status tracking

```text
PHASE 0  Repository Audit & Baseline
Owner: Tech Lead / Architect        Status: COMPLETE
Deliverables: architecture map (README "How it's built" + CLAUDE.md), IPC map,
SQL schema map, provider/transcription map, baseline pipeline green, impact
assessment per round. Evidence: session audits; 84/84 tests before each change.

PHASE 1  Interview Type Foundation
Owner: Frontend Engineer            Status: COMPLETE (84e5876)
Deliverables: interview_format domain type (human | virtual_ai), session model
columns + migration, wizard selector cards, studio format badge, types threaded
through preload/IPC. Type locked during an active session.

PHASE 2  Session Lifecycle & Isolation
Owner: AI/Audio Engineer            Status: COMPLETE (84e5876, bf2800b)
Deliverables: lifecycle setup → ready → completed (+ recoverable cancelled),
SQLite AUTOINCREMENT session IDs, timestamp-based session timer + per-question
countdown, per-session reset of question/response/transcript/AI context, cleanup
on end. Isolation guarded by tests (interviewCoachSessions.test.ts).

PHASE 3  SQLite Persistence & History
Owner: Backend/Data Engineer        Status: COMPLETE (84e5876)
Deliverables: interview_coach_* tables + ALTER migrations (boot-verified on
existing DBs), create/complete/cancel/list-stats/get-bundle accessors, history
table UI (date, format, duration, questions asked·answered, status, open/delete).
Duration is derived from timestamps (adapted to existing schema by design).

PHASE 4  Transparent Always-On-Top Overlay
Owner: Electron/Desktop Engineer    Status: DECLINED — PRODUCT BOUNDARY
This phase builds an AI-assistance layer floating above a live interview, visible
to the user and not to the interviewer. Declined per the project's documented
ethical boundary and reaffirmed on every presentation. Not "not started" —
there is a decision, and it is final. No deliverables planned.

PHASE 5  Overlay UX & Multi-Monitor
Owner: Frontend Engineer            Status: DECLINED — PRODUCT BOUNDARY
Same boundary as Phase 4. Excludes only overlay drag/resize/opacity/
multi-monitor work; all other UX polish was delivered in Phases 1–3.

PHASE 6  Human Interview Integration
Owner: AI/Audio Engineer            Status: COMPLETE (84e5876)
Deliverables: human practice format on the existing pipeline, application-
agnostic (no per-meeting-app logic), transcription + AI-provider reuse intact.

PHASE 7  Virtual AI Interview Mode
Owner: AI/Audio Engineer            Status: COMPLETE (84e5876)
Deliverables: virtual_ai session flow, AI question generation, spoken/text
answers via existing dictation, per-question timed responses, completion,
immediate consecutive sessions with fresh context, history integration.

PHASE 8  Local Test Harness
Owner: QA Engineer                  Status: COMPLETE (2abc440)
Deliverables: Test Mode (canned analysis/questions/feedback through the real
parse-persist-stream path), Simulate answer via the microphone code path,
unlimited consecutive sessions, no API key or platform dependency.

PHASE 9  Error Handling & Recovery
Owner: Tech Lead / Architect        Status: COMPLETE (pre-existing + feature work)
Deliverables: provider/DB/mic failures render recoverable in-page errors,
best-effort persistence, safe session termination (complete/cancel/delete),
app-level crash isolation. No new failure modes introduced.

PHASE 10 Security & Architecture Review
Owner: Tech Lead / Architect        Status: COMPLETE
Deliverables: IPC via typed preload bridge only; no new privileged exposure;
encryption flow unchanged (safeStorage + marked fallback); no spoofing/evasion/
bypass mechanisms anywhere in the feature.

PHASE 11 Automated Testing
Owner: QA Engineer                  Status: COMPLETE (84/84 passing)
Deliverables: parser/prompt tests, multilingual tests, session/format/test-mode
tests, duration/elapsed formatters, isolation tests, key-storage rules, wire
format tests. (node --test cannot import Electron-bound DB modules; DB behavior
is boot-verified via migration checks instead. Overlay tests excluded with
Phases 4–5.)

PHASE 12 End-to-End Validation
Owner: QA Engineer                  Status: COMPLETE for Test A/B; Test C excluded
Deliverables: Test A (Human) and Test B (3× consecutive Virtual AI) run fully
via Test Mode with correct history and zero leakage; Test C (window stress) is
overlay-only and excluded with Phase 4. Live-provider E2E (real keys, real mic)
remains a documented manual step for the user.

PHASE 13 Final Code Quality Review
Owner: Tech Lead / Architect        Status: COMPLETE (bf2800b)
Deliverables: clean diffs per round, no dead/debug code, typecheck + build +
tests green, migrations reproducible on existing and fresh databases, no
duplicate AI/transcription pipeline, unrelated features untouched.
```

## Ownership handoff sequence (as executed)

```text
Tech Lead / Architect (audit, boundary decision)      DONE
Frontend Engineer (type selector, session UI, history) DONE
AI/Audio Engineer (lifecycle, virtual AI, isolation)   DONE
Backend/Data Engineer (schema, migrations, stats)      DONE
Frontend polish (test harness UX, cancelled state)     DONE
QA Test Harness (Test Mode)                            DONE
Tech Lead Security Review                              DONE
QA Automated Tests (84/84)                             DONE
QA End-to-End (Test A/B via Test Mode)                 DONE
Tech Lead Final Review                                 DONE
Electron/Desktop Engineer (Phases 4–5)                 DECLINED — boundary
```

## Final acceptance gate

Human/Virtual AI modes, consecutive sessions, session isolation, history
persistence, test harness, error recovery, IPC security, and all regression
protection: **verified** (84/84 tests, clean typecheck/build, boot-verified
migrations, commits `84e5876`, `2abc440`, `bf2800b`).

Overlay items (transparent overlay, always-on-top, focus-loss immunity,
position/opacity stability, multi-monitor overlay): **not implemented** —
documented product boundary, not an open work item. Solo sign-off (all
functional areas): feature complete within scope.
