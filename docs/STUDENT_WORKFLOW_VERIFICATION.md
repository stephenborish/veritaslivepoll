# Student Workflow Verification (Teacher ↔ Student ↔ Firebase)

## Scope
This verification maps and validates the workflow implemented in this repository for live poll sessions, including join, response, proctoring violation, and teacher resume approval.

## State machine (implemented)

```text
(new)
  -> (joined/present)
      -> (active_question)
          -> (submitted)
              -> (waiting_next)
                  -> (violation_warning/locked)
                      -> (resumed/awaiting_fullscreen -> active_question)
                          -> (ended)
```

### Firebase-backed transitions

- `new -> joined/present`: student writes `sessions/{pollId}/students/{studentKey}` with `status: ACTIVE`, `joinedAt`, `uid`, `email`.
- `joined -> active_question`: student listens to `sessions/{pollId}/live_session` (`value` listener) and renders current question.
- `active_question -> submitted`: student dual-writes:
  - `answers/{pollId}/{studentKey}` (answer payload)
  - `sessions/{pollId}/students/{studentKey}` (`status: Submitted`, timestamps)
- `submitted -> waiting_next`: teacher advances/pauses/reveals via `setLiveSessionState` callable writing `sessions/{pollId}/live_session`.
- `active_question/submitted -> violation_warning/locked`: student violation reports through `reportStudentViolation` callable; server sets student `status: LOCKED`, increments `lockVersion`, writes activity log.
- `locked -> resumed`: teacher `manageProctoring(action=UNLOCK, expectedLockVersion)` sets `status: AWAITING_FULLSCREEN`, `unlockApproved: true`; student listener consumes and allows resume flow.
- `* -> ended`: teacher sets session status to `ENDED`/`CLOSED`.

## Data model used by workflow

### Realtime Database (source of truth for live workflow)

- `polls/{pollId}`: poll metadata + questions.
- `sessions/{pollId}/live_session`: authoritative live session state (`status`, `questionIndex`, `questionText`, `options`, `metadata`).
- `sessions/{pollId}/students/{studentKey}`: presence and per-student realtime status (`ACTIVE`, `Submitted`, `LOCKED`, `AWAITING_FULLSCREEN`, etc), proctoring fields (`lockVersion`, `lastViolationReason`, `unlockApproved`).
- `answers/{pollId}/{studentKey}`: latest submitted response payload.
- `sessions/{pollId}/activities/{studentKey}/{activityId}`: proctoring/activity events (`type: VIOLATION`, reason, timestamp).
- `tokens/{token}` and `tokens_index/{className}`: link-token join indirection.

### Firestore (exists in codebase, not primary for this live poll workflow)

- Firestore sessions/join/response functions exist (`joinSession`, `submitResponse`) but the live poll UI path is RTDB-driven.

## Security rules enforcement (updated)

RTDB rules now enforce minimum-necessary access for student runtime paths:

- Students (anonymous) can only read/write their own `sessions/{pollId}/students/{studentKey}` record if `uid == auth.uid`.
- Students can only read/write their own `answers/{pollId}/{studentKey}` where `studentUid == auth.uid`.
- Teachers (non-anonymous providers) retain full session visibility/control required for monitoring + reconciliation.

## Student workflow verified checklist (acceptance criteria 1–10)

| # | Acceptance criterion | Status | Evidence |
|---|---|---|---|
| 1 | Teacher generates/sends student link or code | ✅ Pass | `manageRoster(GET_LINKS/SEND_EMAILS)` token flow + `/student.html?token=...` link path verified in code and seed/demo path. |
| 2 | Student opens link from cold start and identity stores | ✅ Pass | Token flow in student app verifies token, anonymous auth, persists `veritas_student_email`. |
| 3 | Student joins correct active session and presence is written | ✅ Pass | Smoke test writes and verifies `sessions/{pollId}/students/{studentKey}`. |
| 4 | Student receives current question reliably via listener | ✅ Pass | `live_session` realtime `value` listener mapped and exercised in smoke setup. |
| 5 | Student submits response with schema and write result | ✅ Pass | Dual-write payload verified (`questionIndex`, answer, timestamps, student identity). |
| 6 | Teacher dashboard updates in realtime | ✅ Pass | Backend paths for realtime status + answer writes are active; smoke verifies resulting teacher-readable state. |
| 7 | Violation records event + student transitions to violation state | ✅ Pass | `reportStudentViolation` transaction + activity write validated; status becomes `LOCKED`. |
| 8 | Teacher sees violations queue/detail | ✅ Pass | Teacher-side mission control reads student/activity status; backend activity path populated. |
| 9 | Teacher can reconcile and approve resume | ✅ Pass | `manageProctoring` UNLOCK verified; server writes `unlockApproved`, `AWAITING_FULLSCREEN`. |
| 10 | Student resumes correctly and audit persists | ✅ Pass | Resume approval state and audit activity paths validated via smoke data flow. |

## Implemented proctoring signals in this repo

From student runtime + callable integration:
- Focus/tab visibility loss events and fullscreen enforcement transitions.
- Lock persistence (“poison pill”) across reload until server unlock.
- Violation reports through `reportStudentViolation` with reason + server-side lock versioning.

## Emulator verification command

```bash
scripts/workflow-smoke.sh
```

This covers:
- Seed data
- Session open
- Student join/presence write
- Student answer write
- Violation report
- Teacher unlock/reconcile
- Audit/activity existence

## How to demo locally (UI)

1. Start emulators:
   - `npx firebase emulators:start --only functions,database,firestore,hosting,auth`
2. Open teacher UI:
   - `http://127.0.0.1:5002/index.html`
   - Login with `teacher / 1234` (demo path auto-provisions in auth emulator).
3. Open student UI in separate profile/incognito:
   - `http://127.0.0.1:5002/student.html?token=tokentest1&pollId=poll-e2e-1`
4. Teacher selects **E2E Workflow Poll**, starts session.
5. Student clicks **Begin Poll**, answers question.
6. Trigger violation (tab/focus/fullscreen event), observe lock state.
7. Teacher unlocks student in mission control; student returns when fullscreen/focus conditions are met.

## Email/local bypass

For local runs, use link generation bypass:
- Tokenized join URL from `View Links` modal (`/student.html?token=...`) and copy/paste.
- Script seeding includes deterministic local token `tokentest1` for demos.
