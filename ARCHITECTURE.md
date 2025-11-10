# Veritas Live Poll - Technical Architecture

**Document Version**: 1.0
**Last Updated**: 2025-11-10
**Target Audience**: Developers, Technical Staff, System Administrators

---

## Table of Contents

- [System Overview](#system-overview)
- [Technology Stack](#technology-stack)
- [Core Components](#core-components)
- [Data Model](#data-model)
- [State Management](#state-management)
- [Authentication & Security](#authentication--security)
- [Proctoring System](#proctoring-system)
- [Caching Strategy](#caching-strategy)
- [Error Handling](#error-handling)
- [Performance Considerations](#performance-considerations)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Layer                            │
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────────┐ │
│  │ TeacherView.html │         │ StudentView.html        │ │
│  │ • Poll creation  │         │ • Entry screen          │ │
│  │ • Live dashboard │         │ • Question display      │ │
│  │ • Student grid   │         │ • Answer submission     │ │
│  │ • Chart viz      │         │ • Proctoring UI         │ │
│  └────────┬─────────┘         └────────┬────────────────┘ │
└───────────┼──────────────────────────────┼──────────────────┘
            │                              │
            │    google.script.run (RPC)   │
            └──────────────┬───────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────┐
│                    Server Layer (Code.gs)                    │
│                          │                                    │
│  ┌───────────────────────▼──────────────────────────────┐   │
│  │                Router (doGet)                        │   │
│  │  • Email-based teacher auth                          │   │
│  │  • Token-based student auth                          │   │
│  │  • View routing                                      │   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │                                    │
│  ┌───────────────────────▼──────────────────────────────┐   │
│  │             Business Logic Layer                     │   │
│  │                                                       │   │
│  │  ┌─────────────┐  ┌────────────┐  ┌──────────────┐ │   │
│  │  │TokenManager │  │ProctorAccess│  │StateVersion  │ │   │
│  │  │  (Auth)     │  │ (Security)  │  │  Manager     │ │   │
│  │  └─────────────┘  └────────────┘  └──────────────┘ │   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────────┐│   │
│  │  │         DataAccess (Query Layer)                ││   │
│  │  │  • rosters: getByClass()                        ││   │
│  │  │  • polls: getByPollId()                         ││   │
│  │  │  • responses: hasAnswered(), isLocked()         ││   │
│  │  │  • liveStatus: getActive()                      ││   │
│  │  └─────────────────────────────────────────────────┘│   │
│  │                                                       │   │
│  │  ┌─────────────────────────────────────────────────┐│   │
│  │  │         RPC Functions (exposed to client)       ││   │
│  │  │  Teacher: startPoll, nextQuestion, closePoll    ││   │
│  │  │  Student: getStudentPollStatus, submitAnswer    ││   │
│  │  │  Proctor: logViolation, teacherApproveUnlock   ││   │
│  │  └─────────────────────────────────────────────────┘│   │
│  └───────────────────────┬──────────────────────────────┘   │
│                          │                                    │
│  ┌───────────────────────▼──────────────────────────────┐   │
│  │         Infrastructure Layer                         │   │
│  │  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │   │
│  │  │CacheManager│  │RateLimiter│  │Logger            │ │   │
│  │  └──────────┘  └───────────┘  └──────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────┼─────────────────────────────────────┐
│                   Data Layer                                 │
│                        │                                      │
│  ┌─────────────────────▼──────────────────────────────────┐ │
│  │          Google Sheets (Database)                      │ │
│  │  • Classes: Class definitions                          │ │
│  │  • Rosters: Student lists                              │ │
│  │  • Polls: Question data (1 row per question)           │ │
│  │  • LiveStatus: Active session state (1 row singleton)  │ │
│  │  • Responses: Answer log + violation markers           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          Google Drive (Blob Storage)                   │ │
│  │  • Question images                                     │ │
│  │  • Answer choice images                                │ │
│  │  • Public URLs generated on upload                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │    Script Properties (Key-Value Store)                 │ │
│  │  • SESSION_METADATA: Active poll session state (JSON)  │ │
│  │  • STATE_VERSION_HISTORY: Version tracking (JSON)      │ │
│  │  • CONNECTION_HEARTBEATS: Client health (JSON)         │ │
│  │  • ADDITIONAL_TEACHERS: Multi-teacher config (CSV)     │ │
│  └────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend
- **Runtime**: Google Apps Script (V8 Engine)
  - JavaScript ES6+ support
  - No npm packages (built-in Google services only)
  - Serverless execution model
  - 6-minute execution timeout per function
- **Database**: Google Sheets API
  - Relational data model (normalized)
  - ~5 million cells per spreadsheet limit
  - Batch operations for performance
- **Storage**: Google Drive API
  - Image hosting with public URLs
  - Folder-based organization
  - Direct file upload support
- **Email**: Gmail API (via MailApp)
  - 100 emails/day (free), 1500/day (Workspace)

### Frontend
- **UI Framework**: None (vanilla JavaScript for simplicity)
- **CSS**: Tailwind CSS 3.x (CDN)
  - JIT compilation via CDN
  - Custom color palette (Navy: #003366, Gold: #D4AF37)
- **Charts**: Google Charts API
  - ColumnChart for response visualization
  - Real-time data updates
- **Icons**: Material Symbols (Google Fonts)
- **Fonts**:
  - Noto Serif (questions)
  - Inter (UI elements)

### Development Tools
- **Editor**: Google Apps Script Web IDE (or clasp for local dev)
- **Version Control**: Git (external, not native to Apps Script)
- **Deployment**: Web app deployment via Apps Script console
- **Logging**: Stackdriver Logging (via Apps Script console)

---

## Core Components

### 1. Router (doGet)
**File**: Code.gs (lines ~400-500)
**Purpose**: Entry point for all HTTP requests

```javascript
function doGet(e) {
  const userEmail = Session.getActiveUser().getEmail();
  const token = e.parameter.token;

  // Teacher route
  if (isTeacher(userEmail)) {
    return HtmlService.createTemplateFromFile('TeacherView')
      .evaluate()
      .setTitle('Veritas Live Poll - Teacher Dashboard');
  }

  // Student route
  if (token && TokenManager.validateToken(token)) {
    return HtmlService.createTemplateFromFile('StudentView')
      .evaluate()
      .setTitle('Veritas Live Poll');
  }

  // Access denied
  return HtmlService.createHtmlOutput('<h1>Access Denied</h1>');
}
```

**Key Decisions**:
- Email-based teacher auth (simple, no extra setup)
- Token-based student auth (anonymous, secure)
- Separate HTML files for teacher/student (clean separation)

---

### 2. TokenManager
**File**: Code.gs (lines ~600-700)
**Purpose**: Generate and validate student access tokens

**Token Format**: `base64(email:pollId:timestamp:hmac)`

```javascript
class TokenManager {
  static generateToken(studentEmail, pollId) {
    const timestamp = Date.now();
    const data = `${studentEmail}:${pollId}:${timestamp}`;
    const hmac = computeHmac(data, SECRET_KEY);
    return Utilities.base64Encode(`${data}:${hmac}`);
  }

  static validateToken(token) {
    const decoded = Utilities.base64Decode(token);
    const [email, pollId, timestamp, hmac] = decoded.split(':');

    // Check expiry
    if (Date.now() - timestamp > TOKEN_EXPIRY_MS) return false;

    // Verify HMAC
    const expectedHmac = computeHmac(`${email}:${pollId}:${timestamp}`, SECRET_KEY);
    return hmac === expectedHmac;
  }
}
```

**Security Properties**:
- Tamper-proof (HMAC signature)
- Time-limited (30-day expiry)
- Self-contained (no server storage)
- Anonymous (no Google account required)

---

### 3. DataAccess Layer
**File**: Code.gs (lines ~800-1500)
**Purpose**: Abstract Google Sheets as relational database

**Design Pattern**: Query builder with fluent API

```javascript
const DataAccess = {
  responses: {
    getByPoll: (pollId) => { /* ... */ },
    getByPollAndQuestion: (pollId, qIdx) => { /* ... */ },
    hasAnswered: (studentEmail, pollId, qIdx) => { /* ... */ },
    isLocked: (studentEmail) => { /* ... */ },
    logViolation: (studentEmail, version) => { /* ... */ }
  },
  polls: {
    getByPollId: (pollId) => { /* ... */ },
    getQuestions: (pollId) => { /* ... */ },
    create: (pollData) => { /* ... */ }
  },
  rosters: {
    getByClass: (className) => { /* ... */ },
    getAll: () => { /* ... */ }
  },
  liveStatus: {
    getActive: () => { /* ... */ },
    setActive: (pollId, qIdx, status) => { /* ... */ },
    clear: () => { /* ... */ }
  }
};
```

**Performance Optimizations**:
- Batch reads via `getDataRange()`
- In-memory caching (CacheManager)
- Minimal writes (only when state changes)
- Index-free design (full table scans acceptable for classroom sizes)

---

### 4. StateVersionManager
**File**: Code.gs (lines ~1600-1800)
**Purpose**: Track state versions for sync reliability

**Concept**: Every state change increments version number

```javascript
class StateVersionManager {
  static incrementVersion() {
    const history = this.getHistory();
    const newVersion = (history.currentVersion || 0) + 1;
    history.currentVersion = newVersion;
    history.versions[newVersion] = {
      timestamp: new Date().toISOString(),
      pollId: getActivePollId(),
      questionIndex: getActiveQuestionIndex()
    };
    this.saveHistory(history);
    return newVersion;
  }

  static clientNeedsResync(clientVersion) {
    return clientVersion < this.getCurrentVersion();
  }
}
```

**Use Cases**:
- Detect stale client state
- Trigger full resync on version mismatch
- Audit trail for debugging

---

### 5. ProctorAccess
**File**: Code.gs (lines ~2000-2300)
**Purpose**: Manage proctoring violations and locks

**State Machine**:
```
NORMAL → (violation) → LOCKED → (teacher approve) → AWAITING_FULLSCREEN → (student confirms) → NORMAL
                         ↓ (new violation)
                      LOCKED (v2)
```

**Key Functions**:
```javascript
function logStudentViolation(studentEmail) {
  const currentState = ProctorAccess.getState(studentEmail);
  const newVersion = (currentState.lockVersion || 0) + 1;

  // Write VIOLATION_LOCKED marker to Responses sheet
  const sheet = ss.getSheetByName('Responses');
  sheet.appendRow([
    Utilities.getUuid(),
    new Date().toISOString(),
    'SYSTEM',
    0,
    studentEmail,
    'VIOLATION_LOCKED',
    false,
    JSON.stringify({ version: newVersion })
  ]);

  Logger.log(`PROCTOR_EVENT: ${studentEmail} locked at v${newVersion}`);
}

function teacherApproveUnlock(studentEmail, version) {
  const currentState = ProctorAccess.getState(studentEmail);

  // Version mismatch → reject
  if (currentState.lockVersion !== version) {
    return { ok: false, reason: 'version_mismatch' };
  }

  // Delete VIOLATION_LOCKED marker
  const sheet = ss.getSheetByName('Responses');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === studentEmail && data[i][5] === 'VIOLATION_LOCKED') {
      sheet.deleteRow(i + 1);
      break;
    }
  }

  // Set AWAITING_FULLSCREEN state (tracked in properties)
  PropertiesService.getScriptProperties().setProperty(
    `PROCTOR_${studentEmail}`,
    JSON.stringify({ status: 'AWAITING_FULLSCREEN', version })
  );

  return { ok: true };
}
```

**Version Tracking Rationale**:
- Prevents race conditions (student violates while approval in flight)
- Ensures teacher sees current state
- Audit trail for disputes

---

## Data Model

### Entity-Relationship Diagram

```
┌─────────────┐
│  Classes    │
│─────────────│
│ ClassName   │──┐
│ Description │  │
└─────────────┘  │
                 │ 1:N
                 │
           ┌─────▼──────┐
           │  Rosters   │
           │────────────│
           │ ClassName  │
           │ StudentName│
           │StudentEmail│◄──┐
           └────────────┘   │
                            │
                            │ 1:N
┌─────────────┐             │
│   Polls     │             │
│─────────────│             │
│ PollID      │──┐          │
│ PollName    │  │          │
│ ClassName   │  │          │
│ QuestionIdx │  │          │
│QuestionJSON │  │          │
│ CreatedAt   │  │          │
└─────────────┘  │          │
                 │ 1:N      │
                 │          │
           ┌─────▼──────────▼┐
           │   Responses     │
           │─────────────────│
           │ ResponseID      │
           │ Timestamp       │
           │ PollID          │
           │ QuestionIndex   │
           │ StudentEmail    │
           │ Answer          │
           │ IsCorrect       │
           │ Metadata (JSON) │
           └─────────────────┘

┌──────────────┐
│ LiveStatus   │   (1 row singleton)
│──────────────│
│ ActivePollID │
│ ActiveQIdx   │
│ PollStatus   │
└──────────────┘
```

### Sheet Schemas

#### Classes Sheet
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ClassName | String | Primary Key | Unique class identifier |
| Description | String | Optional | Class description |

#### Rosters Sheet
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ClassName | String | Foreign Key → Classes | Class this student belongs to |
| StudentName | String | Required | Student full name |
| StudentEmail | String | Required, Unique | Student email (used as ID) |

#### Polls Sheet
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| PollID | UUID | Part of composite key | Poll identifier |
| PollName | String | Required | Human-readable poll name |
| ClassName | String | Foreign Key → Classes | Target class |
| QuestionIndex | Integer | Part of composite key | 0-indexed question number |
| QuestionDataJSON | JSON String | Required | Question text, images, answers |
| CreatedAt | ISO 8601 | Auto-generated | Creation timestamp |
| UpdatedAt | ISO 8601 | Auto-generated | Last modification timestamp |

**QuestionDataJSON Structure**:
```json
{
  "questionText": "What is photosynthesis?",
  "questionImageUrl": "https://drive.google.com/...",
  "answers": [
    { "text": "Process A", "imageUrl": "", "isCorrect": false },
    { "text": "Process B", "imageUrl": "", "isCorrect": true },
    { "text": "Process C", "imageUrl": "", "isCorrect": false }
  ]
}
```

#### Responses Sheet
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ResponseID | UUID | Primary Key | Unique response identifier |
| Timestamp | ISO 8601 | Auto-generated | Submission time |
| PollID | UUID | Foreign Key → Polls | Poll this response belongs to |
| QuestionIndex | Integer | Required | Which question (0-indexed) |
| StudentEmail | String | Foreign Key → Rosters | Who answered |
| Answer | String | Required | "A", "B", "C", etc., or "VIOLATION_LOCKED" |
| IsCorrect | Boolean | Computed | True if answer matches poll's correct answer |
| Metadata | JSON String | Optional | Extra data (e.g., lock version) |

**Special Response Types**:
- `Answer = "VIOLATION_LOCKED"`: Proctoring lock marker
- `Metadata = {"version": 2}`: Lock version for version-based approvals

#### LiveStatus Sheet (Singleton)
| Column | Type | Description |
|--------|------|-------------|
| ActivePollID | UUID | Currently active poll (empty if none) |
| ActiveQuestionIndex | Integer | Current question (0-indexed) |
| PollStatus | Enum | "OPEN", "PAUSED", or "CLOSED" |

**Additional State** (stored in Script Properties):
- `SESSION_METADATA`: `{ sessionPhase, startedAt, endedAt, timerRemaining, ... }`
- Rationale: Sheets have 1-second write latency; properties are faster

---

## State Management

### Session Lifecycle

```
PRE_LIVE → (teacher starts poll) → LIVE → (teacher pauses) → PAUSED
                                      ↓
                                  (teacher ends poll)
                                      ↓
                                   ENDED
```

### State Storage Strategy

**Sheets (Persistent, Slower)**:
- Poll data (rarely changes)
- Roster data (rarely changes)
- Responses (append-only log)
- LiveStatus (active poll/question)

**Script Properties (Fast, Volatile)**:
- Session metadata (phase, timestamps)
- State versions
- Connection heartbeats
- Proctor states (temporary)

**Client State (Polling-Based)**:
- Students poll every 2.5s for updates
- Teachers poll every 2.5s for responses
- State version sent with every poll
- Full resync if version mismatch

### Synchronization Model

**Teacher → Students** (Command Pattern):
1. Teacher performs action (e.g., nextQuestion)
2. Server updates LiveStatus sheet + increments state version
3. Students' next poll detects version change
4. Students fetch new question data

**Student → Teacher** (Event Pattern):
1. Student submits answer
2. Server writes to Responses sheet
3. Teacher's next poll includes new response
4. Teacher UI updates chart and grid

**Conflict Resolution**: Last-write-wins (no concurrent edits expected)

---

## Authentication & Security

### Teacher Authentication
**Method**: Email-based verification via `Session.getActiveUser().getEmail()`

**Flow**:
```javascript
function isTeacher(email) {
  if (email === TEACHER_EMAIL) return true;

  const additional = PropertiesService.getScriptProperties()
    .getProperty('ADDITIONAL_TEACHERS') || '';
  return additional.split(',').includes(email);
}
```

**Advantages**:
- No extra setup (uses Google OAuth automatically)
- Multi-account support via Script Properties
- Logged via Apps Script execution logs

**Limitations**:
- Requires Google account
- Manual email configuration

### Student Authentication
**Method**: Token-based (HMAC-signed)

**Security Analysis**:
| Attack | Mitigation |
|--------|-----------|
| Token theft | 30-day expiry, no reuse across polls |
| Token forgery | HMAC signature verification |
| Replay attacks | Token tied to specific pollId |
| Brute force | 128-bit token space (infeasible) |

**Token Lifecycle**:
1. Generated: `generateStudentToken(email, pollId)`
2. Delivered: Via email (MailApp)
3. Validated: Every `doGet()` request
4. Expired: After 30 days (configurable)

### Rate Limiting
**Implementation**: UserLock (per-user request tracking)

```javascript
class RateLimiter {
  static checkLimit(userId) {
    const lock = LockService.getUserLock();
    lock.waitLock(10000);

    const count = parseInt(CacheService.getUserCache().get(`rate_${userId}`) || '0');
    if (count > MAX_REQUESTS_PER_MINUTE) {
      lock.releaseLock();
      throw new Error('Rate limit exceeded');
    }

    CacheService.getUserCache().put(`rate_${userId}`, count + 1, 60);
    lock.releaseLock();
  }
}
```

---

## Proctoring System

### Violation Detection (Client-Side)

**Event Listeners**:
```javascript
// StudentView.html
document.addEventListener('fullscreenchange', handleViolation);
document.addEventListener('visibilitychange', handleViolation);
window.addEventListener('blur', handleViolation);
window.addEventListener('focus', checkRecovery);

function handleViolation() {
  if (!document.fullscreenElement || document.hidden) {
    // Exit detected
    if (!violationLogged) {
      violationLogged = true;
      google.script.run.logStudentViolation();
    }
  }
}
```

**Multi-Layer Detection**:
1. **fullscreenchange**: Detects ESC key or programmatic exit
2. **visibilitychange**: Detects tab switch
3. **blur**: Detects window minimize or Alt+Tab

**False Positive Mitigation**:
- 500ms debounce (ignore rapid focus/blur)
- Flag to prevent duplicate violation logs
- Teacher can manually unlock (appeals process)

### Lock State Persistence

**Storage**: Responses sheet (special marker rows)

**Recovery Scenarios**:
| Scenario | Expected Behavior |
|----------|-------------------|
| Student refreshes page | Lock persists (marker still exists) |
| Student closes tab, reopens | Lock persists |
| Teacher approves, then student refreshes | Approval persists (removed marker) |
| Network disconnect | Lock persists (server-side) |

### Version-Based Approvals

**Problem**: Student violates again while teacher approval is in flight

**Solution**: Version numbers

**Flow**:
```
1. Student violates → Lock v1
2. Teacher clicks Approve (v1)
3. Student violates again → Lock v2 (invalidates v1)
4. Server receives Approve(v1) → REJECTED (version mismatch)
5. Teacher sees Lock v2, clicks Approve (v2)
6. Server receives Approve(v2) → ACCEPTED
```

**Implementation**:
```javascript
function teacherApproveUnlock(studentEmail, version) {
  const currentState = ProctorAccess.getState(studentEmail);

  if (currentState.lockVersion !== version) {
    return {
      ok: false,
      reason: 'version_mismatch',
      message: 'Student has a newer violation. Please approve again.',
      currentVersion: currentState.lockVersion
    };
  }

  // Proceed with unlock...
}
```

---

## Caching Strategy

### Cache Tiers

| Data Type | Cache Duration | Invalidation Trigger |
|-----------|---------------|----------------------|
| Poll questions | 1 hour | Poll edit |
| Roster lists | 1 hour | Roster update |
| Active poll state | 1 second | State change (start/pause/next/end) |
| Student responses | No cache | Real-time display required |
| Proctoring state | No cache | Security-critical |

### CacheManager Implementation

```javascript
const CacheManager = {
  get: (key, fetchFn, duration = 60) => {
    const cache = CacheService.getScriptCache();
    let value = cache.get(key);

    if (!value) {
      value = fetchFn();
      cache.put(key, JSON.stringify(value), duration);
    } else {
      value = JSON.parse(value);
    }

    return value;
  },

  invalidate: (key) => {
    CacheService.getScriptCache().remove(key);
  },

  invalidatePattern: (pattern) => {
    // Not supported by Apps Script, must track keys manually
    // Implementation: Maintain key registry
  }
};
```

### Cache Invalidation Strategy

**Write-Through**: Update database, then invalidate cache

```javascript
function startPoll(pollId) {
  // 1. Write to database
  DataAccess.liveStatus.setActive(pollId, 0, 'OPEN');

  // 2. Invalidate affected caches
  CacheManager.invalidate('liveStatus');
  CacheManager.invalidate(`poll_${pollId}`);

  // 3. Increment state version
  StateVersionManager.incrementVersion();
}
```

---

## Error Handling

### Error Handling Wrapper

```javascript
function withErrorHandling(fn) {
  return function(...args) {
    try {
      return fn.apply(this, args);
    } catch (err) {
      Logger.log(`ERROR in ${fn.name}: ${err.message}`);
      Logger.log(`Stack: ${err.stack}`);

      // Return user-friendly error
      return {
        success: false,
        error: err.message,
        code: err.code || 'UNKNOWN_ERROR'
      };
    }
  };
}

// Usage
const safeStartPoll = withErrorHandling(startPoll);
```

### Client-Side Error Handling

```javascript
google.script.run
  .withSuccessHandler(onSuccess)
  .withFailureHandler((err) => {
    console.error('RPC failed:', err);
    showError('An error occurred. Please refresh and try again.');

    // Exponential backoff retry
    setTimeout(() => retryOperation(), backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30000);
  })
  .someServerFunction();
```

---

## Performance Considerations

### Bottlenecks

1. **Google Sheets Read/Write Latency**: ~200-500ms per operation
   - Mitigation: Batch operations, aggressive caching

2. **Apps Script Execution Timeout**: 6 minutes max
   - Mitigation: Paginate long operations, use triggers for async work

3. **Polling Overhead**: 30 students × 2.5s = potential thundering herd
   - Mitigation: Jittered polling intervals, adaptive backoff

### Optimization Techniques

**Batch Reads**:
```javascript
// Bad: N queries
for (const student of students) {
  const answer = getStudentAnswer(student.email);
}

// Good: 1 query
const allAnswers = getAllAnswers();
const answerMap = new Map(allAnswers.map(a => [a.email, a.answer]));
for (const student of students) {
  const answer = answerMap.get(student.email);
}
```

**Debounced Writes**:
```javascript
let writeQueue = [];
function queueWrite(data) {
  writeQueue.push(data);
  if (!writeTimer) {
    writeTimer = setTimeout(flushWrites, 1000);
  }
}
```

**Adaptive Polling**:
```javascript
let pollInterval = 2500; // Base 2.5s
let failureCount = 0;

function poll() {
  google.script.run
    .withSuccessHandler(() => {
      failureCount = 0;
      pollInterval = 2500; // Reset to base
      setTimeout(poll, pollInterval);
    })
    .withFailureHandler(() => {
      failureCount++;
      pollInterval = Math.min(pollInterval * 1.5, 15000); // Max 15s
      setTimeout(poll, pollInterval);
    })
    .getStudentPollStatus();
}
```

---

## Deployment Considerations

### Production Checklist

- [ ] `TEACHER_EMAIL` configured
- [ ] Web app deployed with "Execute as: Me"
- [ ] OAuth scopes authorized
- [ ] `setupSheet()` run once
- [ ] Test poll created and validated
- [ ] Email delivery tested
- [ ] Proctoring flow tested (PROCTOR_QA_CHECKLIST.md)
- [ ] Browser compatibility verified
- [ ] Logging level set to INFO (not DEBUG)

### Monitoring

**Key Metrics**:
- Execution time per RPC function (Apps Script logs)
- Cache hit rate (log cache misses)
- Rate limit violations (log blocked requests)
- Proctoring violations per session (Responses sheet analysis)

**Alerting**:
- Manual monitoring via Apps Script → Executions tab
- Set up email alerts for repeated errors (custom trigger function)

---

**For questions or clarification, open an issue or contact sborish@malvernprep.org**
