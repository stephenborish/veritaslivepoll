# Secure Assessment Feature TODO

This document tracks the remaining work required to deliver the Secure Assessment mode across backend, teacher UI, and student experience layers.

## 1. Sheet Schema & setupSheet()
- [ ] Extend Poll metadata sheet with columns for `SessionType`, `TimeLimitMinutes`, `AccessCode`, `AvailableFrom`, `DueBy`.
- [ ] Add/verify IndividualSessionState sheet with per-student columns: `StartTime`, `EndTime`, `QuestionOrderSeed`, `AnswerChoiceShuffle`, `CurrentQuestionIndex`, `IsLocked`, `ViolationCode`, `ExtraTimeMinutes`, `PauseDurationMs`, `LastHeartbeatMs`, `ConnectionHealth`.
- [ ] Ensure `setupSheet()` idempotently creates any missing sheets/columns without deleting existing data.

## 2. Teacher Poll Builder Toggle & Settings
- [ ] Add Live Poll vs Secure Assessment toggle in builder modal UI.
- [ ] Show Secure Assessment settings block (time limit, access code, availability window, proctoring summary) when toggle selected.
- [ ] Bind new inputs to save routine so metadata persists to sheets via existing backend APIs.

## 3. Teacher Dashboard Differentiation
- [ ] Display SessionType badge per poll row ("Secure Assessment" vs "Live Poll").
- [ ] Surface time limit and availability window on Secure Assessment cards.
- [ ] Replace action button with "Launch Exam Room" for Secure Assessments; hook into backend activation flow.

## 4. Student Lobby & Access Code Gate
- [ ] Detect active Secure Assessment and route students to dedicated exam lobby UI.
- [ ] Render lobby details (title, time limit, question count) plus optional access code input.
- [ ] Implement Begin Assessment button that enforces fullscreen, validates access code, and initializes IndividualSessionState row with start time and question order seed before serving first question.

## 5. Student Focus Mode & Proctoring UI
- [ ] Build focused exam player: sticky header (question counter, connection dot, countdown), single-question body, footer submit button.
- [ ] Ensure submit flow posts answer, advances `CurrentQuestionIndex`, and fetches next question per `QuestionOrderSeed` until final submission.
- [ ] Add heartbeat interval updating `LastHeartbeatMs`/connection health plus fullscreen/tab switch enforcement; show locked overlay when `IsLocked` true.

## 6. Teacher Mission Control View
- [ ] Replace standard chart with Mission Control grid when Secure Assessment active.
- [ ] Each student card must show name, connection status, progress (Q X/Y), countdown, and status labels (Not Started / In Progress / Submitted / Locked).
- [ ] Implement Student Manager modal actions: unlock, add time, pause/resume, force submit—wiring to backend RPCs.

## 7. Analytics & Reporting
- [ ] Aggregate per-student results (score, elapsed time, violation count) once assessment completes.
- [ ] Compute per-question metrics: % correct (p-value), discrimination index (point-biserial), average time, and flag thresholds.
- [ ] Build Analytics view/table with question previews, metric badges, and optional charts (time vs score, score distribution).

## 8. Backend APIs for Randomization & Proctoring
- [ ] Expand Code.gs RPCs to manage Poll metadata, session creation, randomized question serving, sequential response recording, and heartbeats.
- [ ] Implement proctoring endpoints for lock/unlock, pause/resume, time adjustments, and force finalize actions updating IndividualSessionState.

## 9. Shared JS Utilities
- [ ] Factor reusable countdown, heartbeat, and fullscreen helpers shared between TeacherView.html and StudentView.html.
- [ ] Update both views to consume the new utilities for consistent timers and connection indicators.
