# Veritas Live Poll - System Agents

**Document Version**: 2.0
**Last Updated**: 2025-12-25
**Purpose**: Documentation of system components (agents) and their interactions

**Note**: This document describes the 25 backend (.gs) and 18 frontend (.html) files. For architecture overview, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Table of Contents

- [Overview](#overview)
- [Core Agents](#core-agents)
- [API Agents](#api-agents)
- [Model Agents](#model-agents)
- [Specialized Agents](#specialized-agents)
- [Agent Communication Patterns](#agent-communication-patterns)
- [Agent Dependencies](#agent-dependencies)

---

## Overview

The Veritas Live Poll system is composed of multiple specialized agents (components) that work together to provide a secure, real-time polling and examination platform. This document describes each agent, its responsibilities, and how it interacts with other agents.

### Agent Architecture Principles

1. **Separation of Concerns**: Each agent has a clearly defined responsibility
2. **Minimal Coupling**: Agents communicate through well-defined interfaces
3. **Layered Design**: Core → Data → Model → API → View hierarchy
4. **Security-First**: Authentication and authorization at every layer

---

## Core Agents

### 1. Main Routing Agent (`Main_Routing.gs`)

**Primary Responsibility**: Request routing and authentication

**Key Functions**:
- `doGet(e)` - HTTP request entry point
- Route to Teacher View (email-based auth)
- Route to Student View (token-based auth)
- Route to Exam Student View
- Access control enforcement

**Dependencies**:
- Core_Config (configuration constants)
- Core_Utils (token validation)
- All view HTML files

**Communication Pattern**:
- Receives HTTP requests from Google Apps Script runtime
- Delegates to appropriate view based on authentication

---

### 2. Configuration Agent (`Core_Config.gs`)

**Primary Responsibility**: Centralized configuration management

**Key Functions**:
- Teacher email configuration
- Token expiry settings
- Sheet names and structure
- System-wide constants
- Feature flags

**Dependencies**: None (foundational)

**Communication Pattern**:
- Read-only access by all other agents
- No runtime state modification

---

### 3. Utilities Agent (`Core_Utils.gs`)

**Primary Responsibility**: Shared utility functions

**Key Functions**:
- Token generation and validation (HMAC-based)
- String manipulation
- Date/time utilities
- UUID generation
- Email validation

**Dependencies**:
- Core_Config

**Communication Pattern**:
- Stateless helper functions
- Called by all other agents as needed

---

### 4. Logging Agent (`Core_Logging.gs`)

**Primary Responsibility**: Centralized logging and monitoring

**Key Functions**:
- Structured logging (DEBUG, INFO, WARN, ERROR)
- Performance timing
- Security event logging
- Error tracking
- Audit trail

**Dependencies**:
- Core_Config (log level settings)

**Communication Pattern**:
- Called by all agents for logging
- Writes to Apps Script Logger
- No return values (fire-and-forget)

---

## API Agents

### 5. Teacher API Agent (`Teacher_API.gs`)

**Primary Responsibility**: Teacher-facing RPC functions

**Exposed Functions** (called via `google.script.run`):
- `createClass(className, description)`
- `createPoll(pollData)`
- `startPoll(pollId, className)`
- `nextQuestion()`
- `pausePoll()`
- `resumePoll()`
- `endPoll()`
- `getLivePollData()`
- `sendStudentLinks(pollId, className)`
- `teacherApproveUnlock(studentEmail, version)`

**Dependencies**:
- Data_Access (database operations)
- Model_Session (session state)
- Model_Poll (poll logic)
- Shared_Logic (common business rules)

**Communication Pattern**:
- Synchronous RPC calls from Teacher View
- Returns JSON responses
- Modifies database state
- Emits events via state version changes

---

### 6. Student API Agent (`Student_API.gs`)

**Primary Responsibility**: Student-facing RPC functions

**Exposed Functions**:
- `getStudentPollStatus(token)` - Poll for current state
- `submitAnswer(token, questionIndex, answer)` - Submit response
- `confirmFullscreenEntry(token)` - Proctoring confirmation
- `logStudentViolation(token)` - Report proctoring violation

**Dependencies**:
- Data_Access
- Model_Session
- Veritas_Exam_Proctoring
- Core_Utils (token validation)

**Communication Pattern**:
- Polled every 2.5 seconds by Student View
- Stateless (token-based authentication)
- Returns minimal JSON (performance optimization)

---

### 7. Exam API Agent (`API_Exposed_Exams.gs`)

**Primary Responsibility**: Exam-specific RPC functions

**Exposed Functions**:
- `claimExam(examId, studentEmail)` - Student exam registration
- `getExamStatus(examId)` - Check exam availability
- `submitExamAnswer(examId, questionIndex, answer)`
- `finalizeExam(examId)` - Complete exam submission
- `getExamResults(examId)` - Retrieve graded results

**Dependencies**:
- Veritas_Exams
- Veritas_Exam_Proctoring
- Veritas_Exam_Analytics
- Data_Access

**Communication Pattern**:
- Similar to Student API but with exam-specific logic
- Stricter security (one-time claim tokens)
- Persistent state across exam session

---

## Model Agents

### 8. Session Model Agent (`Model_Session.gs`)

**Primary Responsibility**: Live session state management

**Key Functions**:
- `initializeSession(pollId)` - Start new session
- `updateSessionState(updates)` - Modify current state
- `getCurrentSession()` - Retrieve active session
- `incrementStateVersion()` - Track changes
- `endSession()` - Clean up session data

**State Stored**:
- Active poll ID
- Current question index
- Poll status (OPEN, PAUSED, CLOSED)
- Timer state
- Session metadata (start time, participants)

**Storage Location**:
- Script Properties (fast access)
- LiveStatus Sheet (persistent backup)

**Dependencies**:
- Data_Access (database sync)

**Communication Pattern**:
- Modified by Teacher API
- Read by Student API
- Version-based synchronization

---

### 9. Poll Model Agent (`Model_Poll.gs`)

**Primary Responsibility**: Poll data structure and validation

**Key Functions**:
- `createPoll(pollData)` - Validate and store poll
- `getPollQuestions(pollId)` - Retrieve question set
- `validatePollStructure(pollData)` - Schema validation
- `duplicatePoll(pollId)` - Clone existing poll

**Data Structure**:
```javascript
{
  pollId: "uuid",
  pollName: "string",
  className: "string",
  questions: [
    {
      questionText: "string",
      questionImageUrl: "string?",
      answers: [
        { text: "string", imageUrl: "string?", isCorrect: boolean }
      ]
    }
  ]
}
```

**Dependencies**:
- Data_Access (storage)
- Core_Utils (UUID generation)

---

### 10. Student Activity Model Agent (`Model_StudentActivity.gs`)

**Primary Responsibility**: Track student actions and participation

**Key Functions**:
- `recordAnswer(studentEmail, pollId, questionIndex, answer)`
- `hasAnswered(studentEmail, pollId, questionIndex)` - Check submission
- `getStudentResponses(studentEmail, pollId)` - Full history
- `calculateStudentScore(studentEmail, pollId)` - Grading

**Dependencies**:
- Data_Access (Responses sheet)
- Model_Poll (correct answer lookup)

**Communication Pattern**:
- Write-heavy during live sessions
- Read by Teacher API for dashboard
- Batch operations for performance

---

### 11. Analytics Model Agent (`Model_Analytics.gs`)

**Primary Responsibility**: Post-session data analysis

**Key Functions**:
- `calculateQuestionDifficulty(pollId, questionIndex)` - % correct
- `calculatePointBiserialCorrelation(pollId, questionIndex)` - Discrimination index
- `identifyMisconceptions(pollId, questionIndex)` - Wrong answer patterns
- `generateSessionReport(pollId)` - Comprehensive summary

**Statistical Methods**:
- Descriptive statistics (mean, median, mode)
- Item analysis (difficulty, discrimination)
- Response distribution analysis

**Dependencies**:
- Data_Access (Responses sheet)
- Model_Poll (question data)

---

## Specialized Agents

### 12. Data Access Agent (`Data_Access.gs`)

**Primary Responsibility**: Database abstraction layer

**Key Functions**:
- `getSheet(sheetName)` - Sheet accessor
- `rosters.getByClass(className)` - Query students
- `polls.getByPollId(pollId)` - Query poll data
- `responses.getByPoll(pollId)` - Query answers
- `liveStatus.getActive()` - Get current session
- Batch operations for performance

**Sheet Mapping**:
- Classes → Class definitions
- Rosters → Student lists
- Polls → Poll questions
- Responses → Answer log + violations
- LiveStatus → Active session (singleton)

**Dependencies**:
- SpreadsheetApp (Google Apps Script API)
- Core_Config (sheet names)

**Communication Pattern**:
- Synchronous read/write operations
- Caching layer (implicit via Google Sheets)
- Transaction-like batch writes

---

### 13. Exam Proctoring Agent (`Veritas_Exam_Proctoring.gs`)

**Primary Responsibility**: Security monitoring and violation handling

**Key Functions**:
- `detectViolation(studentEmail)` - Process violation event
- `lockStudent(studentEmail, reason)` - Enforce lockout
- `approveUnlock(studentEmail, version)` - Teacher authorization
- `getProctorState(studentEmail)` - Current lock status
- `logViolationEvent(studentEmail, eventType)` - Audit trail

**Violation Types**:
- Fullscreen exit
- Tab switch
- Window blur/focus loss
- Browser console opened (detected client-side)

**Lock State Machine**:
```
NORMAL → VIOLATION → LOCKED → AWAITING_APPROVAL → AWAITING_FULLSCREEN → NORMAL
                        ↓ (new violation)
                      LOCKED (v2)
```

**Dependencies**:
- Data_Access (Responses sheet for lock markers)
- Core_Logging (security events)
- Model_StudentActivity (violation history)

**Communication Pattern**:
- Triggered by Student API (client-side events)
- Modified by Teacher API (approvals)
- Version-based concurrency control

---

### 14. Exam Management Agent (`Veritas_Exams.gs`)

**Primary Responsibility**: Exam lifecycle and business logic

**Key Functions**:
- `createExam(examData)` - Define exam structure
- `scheduleExam(examId, startTime, duration)` - Set availability window
- `claimExam(examId, studentEmail)` - One-time registration
- `validateExamAccess(examId, studentEmail)` - Authorization check
- `gradeExam(examId, studentEmail)` - Calculate score
- `publishResults(examId)` - Make grades visible

**Exam State Lifecycle**:
```
DRAFT → SCHEDULED → ACTIVE → COMPLETED → GRADED → PUBLISHED
```

**Dependencies**:
- Data_Access (exam storage)
- Veritas_Exam_Proctoring (security)
- Veritas_Exam_Analytics (grading)

---

### 15. Exam Analytics Agent (`Veritas_Exam_Analytics.gs`)

**Primary Responsibility**: Exam-specific analytics and reporting

**Key Functions**:
- `gradeExam(examId, studentEmail)` - Auto-grading
- `calculateClassAverage(examId)` - Aggregate statistics
- `exportExamResults(examId)` - CSV/JSON export
- `generateItemAnalysis(examId)` - Question statistics

**Metrics Calculated**:
- Individual scores (% correct)
- Class average/median
- Standard deviation
- Question difficulty (p-value)
- Discrimination index (point-biserial r)

**Dependencies**:
- Data_Access
- Model_Poll (question structure)
- Veritas_Exams (exam metadata)

---

### 16. Development Tools Agent (`DevTools.gs`)

**Primary Responsibility**: Testing and debugging utilities

**Key Functions**:
- `setupSheet()` - Initialize database schema
- `resetDatabase()` - Clear all data
- `populateTestData()` - Sample polls/students
- `debugSession()` - Dump current state
- `simulateStudent(studentEmail)` - Automated testing

**Usage**: Development and QA only (not exposed to production)

**Dependencies**: All agents (for testing)

---

### 17. Test System Agent (`Test_System.gs`)

**Primary Responsibility**: Automated test runner

**Key Functions**:
- `runAllTests()` - Execute test suite
- `testTokenGeneration()` - Validate token logic
- `testProctoring()` - Simulate violations
- `testPollWorkflow()` - End-to-end scenarios

**Test Coverage**:
- Unit tests (utility functions)
- Integration tests (API workflows)
- Security tests (token validation, proctoring)

**Dependencies**: All agents (under test)

---

## Agent Communication Patterns

### 1. Request-Response (RPC)

**Pattern**: Client calls server function, waits for response

**Example**:
```javascript
// Client (TeacherView.html)
google.script.run
  .withSuccessHandler(displayData)
  .getLivePollData();

// Server (Teacher_API.gs)
function getLivePollData() {
  const session = Model_Session.getCurrentSession();
  const responses = Data_Access.responses.getByPoll(session.pollId);
  return { session, responses };
}
```

**Agents Using This Pattern**:
- Teacher API ↔ Teacher View
- Student API ↔ Student View
- Exam API ↔ Exam Views

---

### 2. Polling (Client-Initiated Sync)

**Pattern**: Client periodically requests state updates

**Example**:
```javascript
// Client polls every 2.5 seconds
setInterval(() => {
  google.script.run
    .withSuccessHandler(updateUI)
    .getStudentPollStatus(token);
}, 2500);
```

**Agents Using This Pattern**:
- Student API (state synchronization)
- Teacher API (dashboard updates)

---

### 3. Event Sourcing (State Versioning)

**Pattern**: State changes increment version number, clients detect staleness

**Example**:
```javascript
// Server increments version on state change
function nextQuestion() {
  Model_Session.updateSessionState({ questionIndex: currentIndex + 1 });
  Model_Session.incrementStateVersion(); // v1 → v2
}

// Client detects version mismatch
if (serverVersion > clientVersion) {
  resyncState();
}
```

**Agents Using This Pattern**:
- Model_Session (version tracking)
- Student API (staleness detection)
- Teacher API (sync validation)

---

### 4. Marker-Based State (Special Database Rows)

**Pattern**: Use special database rows to represent state flags

**Example**:
```javascript
// Proctoring agent writes VIOLATION_LOCKED marker
Data_Access.responses.appendRow({
  studentEmail: "student@example.com",
  answer: "VIOLATION_LOCKED",
  metadata: { version: 2 }
});

// Later, check lock status
const locked = Data_Access.responses.getByStudent(email)
  .some(r => r.answer === "VIOLATION_LOCKED");
```

**Agents Using This Pattern**:
- Veritas_Exam_Proctoring (lock markers)
- Model_StudentActivity (special response types)

---

## Agent Dependencies

### Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                   Foundation Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Core_Config   │  │Core_Utils    │  │Core_Logging  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────┬─────────────┬─────────────┬─────────────────┘
               │             │             │
┌──────────────▼─────────────▼─────────────▼─────────────────┐
│                     Data Layer                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Data_Access                             │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────┬─────────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────────┐
│                     Model Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Model_Session │  │Model_Poll    │  │Model_Student │     │
│  │              │  │              │  │Activity      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Model_Analytics                         │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────┬─────────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────────┐
│                Specialized Agents                           │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │Veritas_Exams     │  │Veritas_Exam_     │               │
│  │                  │  │Proctoring        │               │
│  └──────────────────┘  └──────────────────┘               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Veritas_Exam_Analytics                     │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────┬─────────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────────┐
│                      API Layer                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │Teacher_API   │  │Student_API   │  │API_Exposed_  │     │
│  │              │  │              │  │Exams         │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   API_Exposed                        │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────┬─────────────────────────────────────────────┘
               │
┌──────────────▼─────────────────────────────────────────────┐
│                   Routing Layer                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                Main_Routing                          │  │
│  │                (doGet entry point)                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTP Requests
                           │
                     ┌─────▼──────┐
                     │   Client   │
                     │   Views    │
                     └────────────┘
```

### Dependency Rules

1. **No Circular Dependencies**: Agents only depend on lower layers
2. **Minimal Coupling**: APIs use model interfaces, not direct database access
3. **Dependency Injection**: Configuration passed down from Core_Config
4. **Testability**: Each agent can be tested independently

---

## Adding New Agents

### Guidelines for Creating New Agents

1. **Define Clear Responsibility**: Single purpose (cohesion)
2. **Choose Appropriate Layer**: Core/Data/Model/API/Routing
3. **Document Dependencies**: List required agents
4. **Expose Minimal Interface**: Hide implementation details
5. **Add Tests**: Use Test_System to validate behavior
6. **Update This Document**: Document the new agent

### Example: Adding a Notification Agent

**File**: `Notifications_Agent.gs`

**Purpose**: Send email/SMS notifications for events

**Responsibilities**:
- Email delivery (poll starts, results available)
- SMS integration (optional, via Twilio)
- Notification preferences (per-student settings)
- Rate limiting (avoid spam)

**Dependencies**:
- Core_Config (SMTP settings)
- Data_Access (student emails)
- Core_Logging (delivery tracking)

**API Functions**:
- `sendPollStartNotification(pollId, className)`
- `sendResultsAvailableNotification(pollId, studentEmail)`
- `setNotificationPreferences(studentEmail, preferences)`

**Integration Points**:
- Called by Teacher_API when poll starts
- Called by Veritas_Exam_Analytics when results published

---

## Security Considerations by Agent

### High-Security Agents (Authentication/Authorization Critical)

1. **Main_Routing**: Entry point, must validate all requests
2. **Core_Utils**: Token generation must be cryptographically secure
3. **Veritas_Exam_Proctoring**: Security violations must be tamper-proof

### Medium-Security Agents (Data Integrity Critical)

1. **Data_Access**: Must prevent SQL-injection-like attacks (sheet formula injection)
2. **Model_Session**: State version must be monotonically increasing
3. **Model_StudentActivity**: Response logging must be append-only

### Low-Security Agents (No Direct User Input)

1. **Model_Analytics**: Read-only operations
2. **Core_Logging**: Write-only to logs
3. **DevTools**: Development environment only

---

## Performance Optimization by Agent

### High-Performance Agents (Frequent Calls)

1. **Student_API.getStudentPollStatus()**:
   - Called every 2.5s per student
   - Must use caching (Script Properties)
   - Return minimal JSON

2. **Teacher_API.getLivePollData()**:
   - Called every 2.5s by teacher
   - Batch read all responses
   - Cache roster data

### Medium-Performance Agents

1. **Data_Access**:
   - Batch operations where possible
   - Avoid N+1 queries
   - Use `getDataRange()` instead of row-by-row reads

### Low-Performance Agents (Infrequent Calls)

1. **Model_Analytics**:
   - Run post-session (not real-time)
   - Can use complex calculations
   - No caching required

---

## Troubleshooting by Agent

### Common Issues and Responsible Agents

| Issue | Likely Agent | Debug Steps |
|-------|-------------|-------------|
| Students can't access poll | Main_Routing, Core_Utils | Check token validation logs |
| Teacher can't log in | Main_Routing, Core_Config | Verify TEACHER_EMAIL setting |
| Responses not saving | Data_Access, Model_StudentActivity | Check Responses sheet permissions |
| Proctoring not locking | Veritas_Exam_Proctoring, Student_API | Review violation event logs |
| Chart not updating | Teacher_API, Data_Access | Verify getLivePollData() return value |
| State desync | Model_Session | Compare client/server state versions |

---

## Future Agent Enhancements

### Planned Additions

1. **Analytics Export Agent**: CSV/JSON export for external analysis
2. **Question Bank Agent**: Reusable question library
3. **Gradebook Integration Agent**: Sync results to LMS
4. **Real-Time Collaboration Agent**: Multiple teachers monitoring same poll
5. **Mobile Agent**: Dedicated mobile student interface

### Deprecation Candidates

1. **DevTools** (manual testing) → Migrate to **Test_System** (automated)
2. **Shared_Logic** (miscellaneous helpers) → Refactor into specialized agents

---

## Conclusion

The Veritas Live Poll system uses a layered agent architecture to maintain clean separation of concerns, testability, and security. Each agent has a well-defined responsibility and communicates through established patterns (RPC, polling, event sourcing, marker-based state).

**Key Takeaways**:
- 17 specialized agents across 5 layers
- Foundation → Data → Model → API → Routing hierarchy
- Security and performance optimized per-agent
- Extensible design for future enhancements

**For questions or clarification, contact sborish@malvernprep.org**
