# Firestore Data Model - Veritas Live Poll

## Collections

### `teachers`
Root collection for teacher profiles.
- **Document ID**: `teacherId` (Auth UID)
- **Fields**:
    - `email`: `string`
    - `createdAt`: `timestamp`

### `exams`
Root collection for exam templates.
- **Document ID**: `examId` (Auto-generated)
- **Fields**:
    - `teacherId`: `string` (Owner UID)
    - `title`: `string`
    - `questions`: `array`
        - `id`: `string`
        - `text`: `string`
        - `options`: `array`
        - `correctAnswer`: `number/string`
    - `settings`: `map`
        - `timer`: `number`
        - `shuffle`: `boolean`

### `sessions`
Root collection for live exam instances.
- **Document ID**: `sessionId` (Auto-generated)
- **Fields**:
    - `examId`: `string` (Reference to `exams`)
    - `teacherId`: `string` (Reference to `teachers`)
    - `accessCode`: `string` (6-digit unique code)
    - `status`: `string` (`'WAITING'`, `'LIVE'`, `'CLOSED'`, `'OPEN'`, `'REVIEW'`)
    - `currentQuestionIndex`: `number` (For Live Poll sync)
    - `createdAt`: `timestamp`

### `sessions/{sessionId}/students`
Sub-collection for student participation in a session.
- **Document ID**: `studentId` (Auth UID, often anonymous)
- **Fields**:
    - `name`: `string`
    - `status`: `string` (`'ACTIVE'`, `'LOCKED'`, `'FINISHED'`)
    - `answers`: `map`
        - `{questionId}`: `mixed` (Student's selected answer)
    - `unlockCount`: `number` (Audit log)
    - `joinedAt`: `timestamp`

### `polls`
Root collection for poll templates and settings.
- **Document ID**: `pollId` (Auto-generated or provided)
- **Fields**:
    - `teacherId`: `string` (Owner UID)
    - `sessionType`: `string` (`'LIVE_POLL'`, `'SECURE_ASSESSMENT'`)
    - `settings`: `map`
        - `timeLimitMinutes`: `number`
        - `accessCode`: `string`
        - `calculatorEnabled`: `boolean`
        - `proctorMode`: `string` (`'soft'`, `'hard'`)
    - `metacognitionEnabled`: `boolean`
    - `createdAt`: `timestamp`
    - `updatedAt`: `timestamp`

### `polls/{pollId}/questions`
Sub-collection for questions within a poll.
- **Document ID**: `questionId` (Auto-generated or provided)
- **Fields**:
    - `stemHtml`: `string`
    - `options`: `array` of `objects`
        - `text`: `string`
        - `imageUrl`: `string`
    - `correctAnswer`: `mixed`
    - `points`: `number`
    - `order`: `number`

### `classes`
Root collection for class rosters.
- **Document ID**: `classId` (Auto-generated)
- **Fields**:
    - `teacherId`: `string` (Owner UID)
    - `className`: `string`
    - `studentCount`: `number`
    - `updatedAt`: `timestamp`

### `classes/{classId}/students`
Sub-collection for student profiles within a class.
- **Document ID**: `studentEmail` (Sanitized email)
- **Fields**:
    - `email`: `string`
    - `firstName`: `string`
    - `lastName`: `string`
    - `lastActive`: `timestamp`
    - `updatedAt`: `timestamp`

---

## Firebase Realtime Database (RTDB)

### `sessions/{pollId}/live_session`
Real-time session state for live polling.
- **Fields**:
    - `status`: `string` (`'PRE_LIVE'`, `'OPEN'`, `'PAUSED'`, `'RESULTS_REVEALED'`, `'ENDED'`)
    - `currentQuestionIndex`: `number`
    - `questionText`: `string`
    - `options`: `array`
    - `resultsVisibility`: `string` (`'HIDDEN'`, `'REVEALED'`)
    - `calculatorEnabled`: `boolean`
    - `liveProctoring`: `boolean`

### `sessions/{pollId}/students/{studentKey}`
Student presence and proctoring state.
- **Fields**:
    - `status`: `string` (`'ACTIVE'`, `'LOCKED'`, `'DISCONNECTED'`, `'AWAITING_FULLSCREEN'`)
    - `name`: `string`
    - `email`: `string`
    - `joinedAt`: `timestamp`
    - `lockVersion`: `number` (for optimistic concurrency)
    - `lastViolationReason`: `string`
    - `lastViolationAt`: `timestamp`

### `answers/{pollId}/{studentKey}`
Secure answer storage for grading.
- **Fields**:
    - `answers`: `map` of `questionIndex` → `{answer, timestamp, confidence}`

---

## Client-Side Storage (sessionStorage)

### Authentication & Identity
| Key | Description |
|-----|-------------|
| `veritas_student_email` | Student's email for session identification |
| `veritas_active_poll_id` | Current active poll ID for violation reporting |

### Proctoring State (Poison Pill Pattern)
| Key | Description |
|-----|-------------|
| `veritas_lock_active` | `'true'` if student is locked (survives refresh) |
| `lock_reason` | Reason code for the lock (e.g., `'exit-fullscreen'`) |
| `is_locally_locked` | Supplementary lock flag |
| `lock_timestamp` | When lock was applied |

### Cross-Out Feature
| Key Format | Description |
|------------|-------------|
| `vlp_crossout_{pollId}_{questionIndex}` | JSON array of crossed-out option indices |

### State Rehydration Cache
| Key | Description |
|-----|-------------|
| `vlp_poll_state_cache` | Cached poll state with timestamp (5-minute TTL) |

---

## Status Constants

### Session Status Values
- `PRE_LIVE` - Waiting for teacher to start
- `OPEN` / `LIVE` - Active question accepting answers
- `PAUSED` - Teacher paused session ("Eyes on Teacher")
- `RESULTS_REVEALED` - Showing correct answers
- `ENDED` / `CLOSED` - Session complete

### Student Status Values
- `ACTIVE` - Student connected and participating
- `LOCKED` - Student violated proctoring rules
- `AWAITING_FULLSCREEN` - Teacher unlocked, waiting for student to re-enter fullscreen
- `DISCONNECTED` - Student lost connection
