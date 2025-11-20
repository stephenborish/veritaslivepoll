# Live Surface Area - Veritas Live Poll

**Generated:** 2025-11-20
**Purpose:** Complete inventory of all live code entrypoints and active modules

---

## 1. HTTP Entrypoints

### doGet(e)
- **Location:** `_12_Routing.gs:408` (global wrapper)
- **Implementation:** `Veritas.Routing.doGet()` at `_12_Routing.gs:16`
- **Purpose:** Main web app entry point
- **Routes:**
  - Token-based student access (`?token=...`)
  - Google OAuth teacher access
  - Image proxy (`?fn=image&id=...`)
- **Returns:** `HtmlService` output (TeacherView.html or StudentView.html)

### doPost(e)
- **Status:** NOT USED
- **Notes:** This app uses only GET requests and google.script.run for RPC

---

## 2. Server Functions Exposed to google.script.run

All exposed functions are defined in **`_13_ExposedApi.gs`** (58 total functions)

### 2.1 Routing & Templates (2 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `doGet(e)` | _13_ExposedApi.gs:31 | No (HTTP only) | Web app entry point |
| `include(filename)` | _13_ExposedApi.gs:40 | Yes (templates) | HTML template composition |

### 2.2 Teacher API - Dashboard & Core (3 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `getTeacherDashboardData()` | _13_ExposedApi.gs:52 | ✓ Yes | Load teacher dashboard data |
| `getPollEditorHtml(className)` | _13_ExposedApi.gs:61 | No | Get poll editor interface |
| `getStudentLinksForClass(className)` | _13_ExposedApi.gs:70 | No | Generate student access links |

### 2.3 Teacher API - Analytics (7 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `getAnalyticsData(filters)` | _13_ExposedApi.gs:83 | No | Filtered analytics data |
| `getPostPollAnalytics(pollId)` | _13_ExposedApi.gs:92 | ✓ Yes | Post-poll analytics report |
| `getEnhancedPostPollAnalytics(pollId)` | _13_ExposedApi.gs:101 | No | Enhanced analytics with psychometrics |
| `getStudentInsights(studentEmail, className)` | _13_ExposedApi.gs:111 | ✓ Yes | Individual student insights |
| `getStudentHistoricalAnalytics(studentEmail)` | _13_ExposedApi.gs:120 | No | Student historical performance |
| `getDashboardSummary()` | _13_ExposedApi.gs:128 | No | Dashboard summary KPIs |
| `getLivePollData()` | _13_ExposedApi.gs:136 | No | Live poll state and responses |

### 2.4 Teacher API - Poll Management (6 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `createNewPoll(pollName, className, questions, metadata)` | _13_ExposedApi.gs:152 | No | Create new poll |
| `updatePoll(pollId, pollName, className, questions, metadata)` | _13_ExposedApi.gs:165 | ✓ Yes | Update existing poll |
| `deletePoll(pollId)` | _13_ExposedApi.gs:174 | ✓ Yes | Delete poll |
| `copyPoll(pollId, targetClassName)` | _13_ExposedApi.gs:184 | No | Duplicate poll to another class |
| `getPollForEditing(pollId)` | _13_ExposedApi.gs:193 | No | Load poll for editing |
| `getArchivedPolls()` | _13_ExposedApi.gs:201 | ✓ Yes | Get archived polls |

### 2.5 Teacher API - Roster Management (6 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `getRosterManagerData(className)` | _13_ExposedApi.gs:214 | No | Load roster management UI data |
| `saveRoster(className, roster)` | _13_ExposedApi.gs:224 | No | Save class roster |
| `bulkAddStudentsToRoster(className, students)` | _13_ExposedApi.gs:234 | No | Bulk add students |
| `renameClass(oldClassName, newClassName)` | _13_ExposedApi.gs:244 | No | Rename class |
| `deleteClassRecord(className)` | _13_ExposedApi.gs:253 | No | Delete class |
| `createClassRecord(className, description)` | _13_ExposedApi.gs:263 | No | Create new class |

### 2.6 Teacher API - Live Poll Control (9 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `startPoll(pollId)` | _13_ExposedApi.gs:276 | No | Start live poll session |
| `nextQuestion()` | _13_ExposedApi.gs:284 | No | Advance to next question |
| `previousQuestion()` | _13_ExposedApi.gs:292 | No | Go back to previous question |
| `stopPoll()` | _13_ExposedApi.gs:300 | ✓ Yes | Stop live poll (pause) |
| `resumePoll()` | _13_ExposedApi.gs:308 | ✓ Yes | Resume paused poll |
| `closePoll()` | _13_ExposedApi.gs:316 | ✓ Yes | Close poll permanently |
| `revealResultsToStudents()` | _13_ExposedApi.gs:324 | No | Show results to students |
| `hideResultsFromStudents()` | _13_ExposedApi.gs:332 | No | Hide results from students |
| `resetLiveQuestion()` | _13_ExposedApi.gs:340 | ✓ Yes | Reset current question |

### 2.7 Teacher API - Secure Assessment Control (15 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `startIndividualTimedSession(pollId)` | _13_ExposedApi.gs:353 | No | Start timed assessment |
| `endIndividualTimedSession(pollId)` | _13_ExposedApi.gs:362 | ✓ Yes | End timed assessment |
| `getIndividualTimedSessionState(pollId)` | _13_ExposedApi.gs:371 | ✓ Yes | Get assessment state |
| `getIndividualTimedSessionTeacherView(pollId)` | _13_ExposedApi.gs:380 | No | Get teacher proctor view |
| `adjustSecureAssessmentTime(pollId, studentEmail, adjustmentMinutes)` | _13_ExposedApi.gs:391 | No | Adjust time for one student |
| `adjustSecureAssessmentTimeBulk(pollId, adjustments)` | _13_ExposedApi.gs:401 | No | Bulk time adjustments |
| `adjustSecureAssessmentTimeForAll(pollId, adjustmentMinutes)` | _13_ExposedApi.gs:411 | No | Adjust time for all students |
| `pauseSecureAssessmentStudent(pollId, studentEmail)` | _13_ExposedApi.gs:421 | No | Pause student's assessment |
| `resumeSecureAssessmentStudent(pollId, studentEmail)` | _13_ExposedApi.gs:431 | No | Resume student's assessment |
| `forceSubmitSecureAssessmentStudent(pollId, studentEmail)` | _13_ExposedApi.gs:441 | No | Force submit for student |
| `teacherApproveUnlock(pollId, studentEmail)` | _13_ExposedApi.gs:451 | ✓ Yes | Approve unlock request |
| `teacherBlockStudent(pollId, studentEmail, reason)` | _13_ExposedApi.gs:462 | ✓ Yes | Block student (proctoring) |
| `teacherUnblockStudent(pollId, studentEmail)` | _13_ExposedApi.gs:472 | ✓ Yes | Unblock student |

### 2.8 Teacher API - Setup & Utilities (2 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `setupSheet()` | _13_ExposedApi.gs:484 | No | Initialize spreadsheet schema |
| `safeUiAlert(message, title)` | _13_ExposedApi.gs:494 | No | Show UI alert (legacy) |

### 2.9 Student API (7 functions)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `getStudentPollStatus(token, context)` | _13_ExposedApi.gs:508 | ✓ Yes | Get current poll state |
| `submitLivePollAnswer(pollId, questionIndex, answerText, token, confidenceLevel)` | _13_ExposedApi.gs:521 | ✓ Yes | Submit live poll answer |
| `beginIndividualTimedAttempt(pollId, token)` | _13_ExposedApi.gs:535 | ✓ Yes | Begin timed assessment attempt |
| `getIndividualTimedQuestion(pollId, token)` | _13_ExposedApi.gs:545 | No | Get next assessment question |
| `submitIndividualTimedAnswer(pollId, questionIndex, answerText, token, confidenceLevel)` | _13_ExposedApi.gs:558 | ✓ Yes (as submitAnswerIndividualTimed) | Submit assessment answer |
| `reportStudentViolation(pollId, token, violationType)` | _13_ExposedApi.gs:569 | ✓ Yes | Report proctoring violation |
| `studentConfirmFullscreen(pollId, token)` | _13_ExposedApi.gs:579 | ✓ Yes | Confirm fullscreen mode |

### 2.10 Utility Functions (Legacy, defined in DataAccess.gs)

| Function | Location | Called From HTML | Purpose |
|----------|----------|------------------|---------|
| `uploadImageToDrive(dataUrl, fileName)` | DataAccess.gs:787 | ✓ Yes | Upload poll question images |

---

## 3. Active .gs Files

| File | Lines | Module | Purpose |
|------|-------|--------|---------|
| `Code.gs` | 121 | Entry point | Architecture documentation |
| `_01_Core.gs` | 32 | Veritas | Namespace initialization |
| `_02_Config.gs` | 103 | Veritas.Config | Configuration constants |
| `_03_Logging.gs` | 102 | Veritas.Logging | Logging utilities |
| `_04_Security.gs` | 151 | Veritas.Security | Authentication/authorization |
| `_05_Utils.gs` | 948 | Veritas.Utils | Utility functions |
| `_07_Models_Poll.gs` | 1,919 | Veritas.Models.Poll | Poll CRUD, roster, images |
| `_08_Models_Session.gs` | 2,598 | Veritas.Models.Session | Sessions, proctoring, secure assessments |
| `_09_Models_Analytics.gs` | 2,340 | Veritas.Models.Analytics | Analytics, psychometrics, insights |
| `_10_TeacherApi.gs` | 1,051 | Veritas.TeacherApi | Teacher API with auth checks |
| `_11_StudentApi.gs` | 568 | Veritas.StudentApi | Student API with token validation |
| `_12_Routing.gs` | 473 | Veritas.Routing | Web app routing, templates, image proxy |
| `_13_ExposedApi.gs` | 605 | Global functions | Exposed function registry |
| `DataAccess.gs` | 805 | Veritas.Data | Spreadsheet data access layer |
| `DevTools.gs` | 244 | Veritas.DevTools | Development tools, smoke tests |

**Total Active Lines:** ~11,060

---

## 4. Active HTML Templates

### 4.1 Root Templates

| File | Purpose | Served To |
|------|---------|-----------|
| `TeacherView.html` | Teacher dashboard UI | Teachers (authenticated) |
| `StudentView.html` | Student poll interface | Students (token-based) |

### 4.2 Shared Components

| File | Purpose | Included By |
|------|---------|-------------|
| `templates/shared/_Head.html` | HTML head, meta tags, title | TeacherView, StudentView |
| `templates/shared/_TailwindConfig.html` | Tailwind CSS configuration | TeacherView, StudentView |
| `templates/shared/_Styles.html` | Shared CSS styles | TeacherView, StudentView |
| `SecureAssessmentShared.html` | Shared secure assessment utilities | TeacherView, StudentView |

### 4.3 Teacher Components

| File | Purpose | Included By |
|------|---------|-------------|
| `templates/teacher/_Styles.html` | Teacher-specific CSS | TeacherView.html |
| `templates/teacher/_Body.html` | Teacher dashboard HTML structure | TeacherView.html |
| `templates/teacher/_Scripts.html` | Teacher dashboard JavaScript (3,706 lines) | TeacherView.html |

### 4.4 Student Components

| File | Purpose | Included By |
|------|---------|-------------|
| `templates/student/_Styles.html` | Student-specific CSS | StudentView.html |
| `templates/student/_Body.html` | Student poll HTML structure | StudentView.html |
| `templates/student/_Scripts.html` | Student poll JavaScript (2,275 lines) | StudentView.html |

### 4.5 Template Composition

**TeacherView.html includes:**
```
<?!= include('templates/shared/_Head'); ?>
<?!= include('templates/shared/_TailwindConfig'); ?>
<?!= include('SecureAssessmentShared'); ?>
<?!= include('templates/shared/_Styles'); ?>
<?!= include('templates/teacher/_Styles'); ?>
<?!= include('templates/teacher/_Body'); ?>
<?!= include('templates/teacher/_Scripts'); ?>
```

**StudentView.html includes:**
```
<?!= include('templates/shared/_Head'); ?>
<?!= include('templates/shared/_TailwindConfig'); ?>
<?!= include('SecureAssessmentShared'); ?>
<?!= include('templates/shared/_Styles'); ?>
<?!= include('templates/student/_Styles'); ?>
<?!= include('templates/student/_Body'); ?>
<?!= include('templates/student/_Scripts'); ?>
```

---

## 5. Call Flow Architecture

```
Frontend (google.script.run)
    ↓
_13_ExposedApi.gs (thin wrappers)
    ↓
_10_TeacherApi.gs / _11_StudentApi.gs (security checks)
    ↓
_07_Models_Poll.gs / _08_Models_Session.gs / _09_Models_Analytics.gs (business logic)
    ↓
DataAccess.gs / _05_Utils.gs / _02_Config.gs (data & utilities)
    ↓
SpreadsheetApp / DriveApp / PropertiesService (Google Apps Script APIs)
```

---

## 6. Security Model

### Teacher Access
- **Method:** Google OAuth (Session.getActiveUser())
- **Check:** `Veritas.Security.isTeacher(email)` against authorized list
- **Enforced In:** `_10_TeacherApi.gs` (all methods call `assertTeacher()`)

### Student Access
- **Method:** Token-based (URL parameter `?token=...`)
- **Check:** `TokenManager.validateToken(token)` validates signature and expiration
- **Enforced In:** `_11_StudentApi.gs` (all methods validate token)

### Image Proxy
- **Endpoint:** `?fn=image&id=<fileId>`
- **Security:** Validates file is in `ALLOWED_FOLDER_ID`
- **Implementation:** `Veritas.Routing.serveImage()` at `_12_Routing.gs:110`

---

## 7. Data Storage

### Spreadsheet Schema

**Sheet: POLLS**
- Columns: pollId, pollName, className, questionJSON, createdAt, updatedAt, metadata

**Sheet: RESPONSES**
- Columns: pollId, studentEmail, questionIndex, answerText, timestamp, confidenceLevel, sessionContext

**Sheet: ROSTER**
- Columns: className, studentEmail, studentName, enrolledAt

**Sheet: CLASSES**
- Columns: className, description, createdAt, teacherEmail

**Sheet: ANALYTICS_CACHE**
- Columns: cacheKey, data, timestamp

**Sheet: SESSION_STATE**
- Columns: pollId, sessionState (JSON blob for live poll/secure assessment state)

---

## 8. Triggers

**Status:** No time-based or installable triggers configured

**Notes:**
- All operations are user-initiated via google.script.run
- Session state managed in PropertiesService and spreadsheet
- No background jobs or scheduled tasks

---

## Summary Statistics

- **Total .gs files:** 15 active
- **Total active lines:** ~11,060
- **Exposed functions:** 58
- **HTML templates:** 12 files
- **google.script.run calls from HTML:** ~25 unique functions actively called
- **HTTP entrypoints:** 1 (doGet)
- **Template composition calls:** 14 include() calls across 2 root templates

---

**Document Status:** Complete and verified
**Last Updated:** 2025-11-20
