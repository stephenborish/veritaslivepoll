# Secure Assessment Feature TODO

This document tracks the remaining work required to deliver the Secure Assessment mode across backend, teacher UI, and student experience layers.

## 1. Sheet Schema & setupSheet()
- [x] Extend Poll metadata sheet with columns for `SessionType`, `TimeLimitMinutes`, `AccessCode`, `AvailableFrom`, `DueBy` via the expanded Polls header configuration wired into `setupSheet()` and `writePollRows_()`.
- [x] Add/verify IndividualSessionState sheet with per-student columns: `StartTime`, `EndTime`, `QuestionOrderSeed`, `AnswerChoiceShuffle`, `CurrentQuestionIndex`, `IsLocked`, `ViolationCode`, `ExtraTimeMinutes`, `PauseDurationMs`, `LastHeartbeatMs`, `ConnectionHealth` (implemented through `INDIVIDUAL_SESSION_COLUMNS` plus the DataAccess parser/writer helpers).
- [x] Ensure `setupSheet()` idempotently creates any missing sheets/columns without deleting existing data by looping through `headerConfigs` with `ensureSheet_()`/`ensureHeaders_()`.

## 2. Teacher Poll Builder Toggle & Settings
- [x] Add Live Poll vs Secure Assessment toggle in builder modal UI (see builder session toggle buttons + `pollSessionType` state management).
- [x] Show Secure Assessment settings block (time limit, access code, availability window, proctoring summary) when toggle selected with `updateSecureSettingsVisibility()`/`populateSecureSettingsInputs()`.
- [x] Bind new inputs to save routine so metadata persists to sheets via existing backend APIs through `buildSecureAssessmentPayload()` and the save handler integration.

## 3. Teacher Dashboard Differentiation
- [x] Display SessionType badge per poll row ("Secure Assessment" vs "Live Poll") using `getSessionTypeInfo()` inside the poll card renderer.
- [x] Surface time limit and availability window on Secure Assessment cards through `describeSecureTimeLimit()`/`describeSecureAvailability()` helpers.
- [x] Replace action button with "Launch Exam Room" for Secure Assessments; hook into backend activation flow by toggling the CTA label/icon and wiring it to the secure session launcher.

## 4. Student Lobby & Access Code Gate
- [x] Detect active Secure Assessment and route students to dedicated exam lobby UI that waits in `buildSecureAssessmentLobbyState_()` output.
- [x] Render lobby details (title, time limit, question count) plus optional access code input with the secure lobby card scaffolding and rule list population.
- [x] Implement Begin Assessment button that enforces fullscreen, validates access code, and initializes IndividualSessionState row with start time and question order seed before serving first question (`handleSecureBeginClick()` + backend `startIndividualTimedSession`).

## 5. Student Focus Mode & Proctoring UI
- [x] Build focused exam player: sticky header (question counter, connection dot, countdown), single-question body, footer submit button—all implemented in the secure focus markup/styling block.
- [x] Ensure submit flow posts answer, advances `CurrentQuestionIndex`, and fetches next question per `QuestionOrderSeed` until final submission using `submitAnswerIndividualTimed()` and the session poller.
- [x] Add heartbeat interval updating `LastHeartbeatMs`/connection health plus fullscreen/tab switch enforcement; show locked overlay when `IsLocked` true via the secure heartbeat loop, fullscreen guardrails, and overlay controller.

## 6. Teacher Mission Control View
- [x] Replace standard chart with Mission Control grid when Secure Assessment active by conditionally rendering the mission control container.
- [x] Each student card shows name, connection status, progress, countdown, and status labels using `renderMissionControlCards()` and secure-specific formatting.
- [x] Implement Student Manager modal actions: unlock, add time, pause/resume, force submit—wired to backend RPCs such as `adjustSecureAssessmentTime`, `pauseSecureAssessmentStudent`, `resumeSecureAssessmentStudent`, and `forceSubmitSecureAssessmentStudent`.

## 7. Analytics & Reporting
- [x] Aggregate per-student results (score, elapsed time, violation count) once assessment completes with the secure-specific analytics pipeline in `getAnalyticsData()`/`getEnhancedPostPollAnalytics()`.
- [x] Compute per-question metrics: % correct (p-value), discrimination index (point-biserial), average time, and flag thresholds in the analytics helpers backing the reporting sheet.
- [x] Build Analytics view/table with question previews, metric badges, and optional charts (time vs score, score distribution) surfaced inside the teacher Analytics Hub panels.

## 8. Backend APIs for Randomization & Proctoring
- [x] Expand Code.gs RPCs to manage Poll metadata, session creation, randomized question serving, sequential response recording, and heartbeats via `startIndividualTimedSession`, `getIndividualTimedQuestion`, `submitAnswerIndividualTimed`, and related helpers.
- [x] Implement proctoring endpoints for lock/unlock, pause/resume, time adjustments, and force finalize actions updating IndividualSessionState through the dedicated RPCs under the "SecureAssessment" section.

## 9. Shared JS Utilities
- [x] Factor reusable countdown, heartbeat, and fullscreen helpers shared between TeacherView.html and StudentView.html in `SecureAssessmentShared.html`.
- [x] Update both views to consume the new utilities for consistent timers and connection indicators by loading the shared script via `<?!= include('SecureAssessmentShared'); ?>` and calling the exported helpers in each view.
