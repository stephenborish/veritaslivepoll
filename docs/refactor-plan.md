# Veritas Live Poll - Refactoring Plan

**Document Version**: 1.0
**Created**: 2025-11-19
**Purpose**: Document the current architecture and plan for modular refactoring

---

## Executive Summary

This document analyzes the current monolithic structure of Veritas Live Poll and outlines a comprehensive refactoring plan to improve:
- **Modularity**: Split 7,972-line Code.gs into focused modules
- **Maintainability**: Separate concerns (config, security, data access, business logic)
- **Testability**: Enable unit testing through cleaner interfaces
- **Scalability**: Prepare for future enhancements with better structure

**Critical Constraint**: Zero breaking changes to functionality, UI/UX, or data formats.

---

## Current Architecture Analysis

### Server-Side Structure (Code.gs - 7,972 lines)

The entire backend is in a single monolithic `Code.gs` file with these sections:

| Section | Lines | Description |
|---------|-------|-------------|
| **Configuration** | 5-42 | Hard-coded constants (emails, keys, session types) |
| **Logging** | 259+ | Enhanced logging with `Logger.log`, `Logger.error`, etc. |
| **Error Handling** | 280+ | `withErrorHandling()` wrapper function |
| **Cache Manager** | 292+ | Script cache abstraction |
| **Rate Limiter** | 333+ | User-based request throttling |
| **Token Manager** | 348+ | HMAC-based anonymous student authentication |
| **Teacher Auth** | 554+ | Email-based teacher verification |
| **URL Utilities** | 669+ | URL building and shortening |
| **Data Access Layer** | 792+ | Sheets/Properties/Drive access with query patterns |
| **State Versioning** | 1139+ | Version tracking for sync reliability |
| **Routing** | 1279+ | `doGet()` entry point, `include()` helper |
| **Public API Functions** | Throughout | ~100+ exposed functions for google.script.run |

**Key Observations:**
1. **Tight Coupling**: Config, security, data access, and business logic are intermingled
2. **No Namespace**: Everything is in global scope (potential naming conflicts)
3. **Hard to Test**: Cannot easily mock dependencies
4. **Duplication**: Similar patterns repeated across functions (e.g., opening sheets, checking teacher status)
5. **Mixed Responsibilities**: Single functions often handle validation, data access, and business logic

### Client-Side Structure

| File | Lines | Description |
|------|-------|-------------|
| **TeacherView.html** | 13,985 | Entire teacher interface (HTML + CSS + JS) |
| **StudentView.html** | 4,381 | Entire student interface (HTML + CSS + JS) |
| **SecureAssessmentShared.html** | 202 | Shared utility functions (countdown, heartbeat, fullscreen) |

**Key Observations:**
1. **Monolithic Templates**: Each view is a single massive file mixing structure, style, and behavior
2. **Code Duplication**: Tailwind config, brand colors, and utilities repeated in both views
3. **Hard to Navigate**: Finding specific components requires scrolling through thousands of lines
4. **No Componentization**: Everything is inline (modals, forms, panels, etc.)

### Entry Points & Routing

**doGet(e)** (Code.gs:1279-1365):
- **Image Proxy**: `?fn=image&id=<driveFileId>` → serves images from Drive
- **Token-based Access**: `?token=<jwt>` → validates and routes to StudentView
- **Google Auth**: Session.getActiveUser() → routes to TeacherView or StudentView
- **Error Handling**: Returns error HTML for invalid/expired tokens

**doPost(e)**: Not currently implemented

**include(filename)**: Helper function to compose HTML from multiple files

### Data Flow & google.script.run Usage

**From TeacherView.html → Server**:
- 47 calls to google.script.run (approximate count)
- Examples:
  - `startPoll(pollId)`
  - `nextQuestion()`
  - `getLivePollData(pollId, questionIndex)`
  - `teacherApproveUnlock(studentEmail, pollId, lockVersion)`

**From StudentView.html → Server**:
- 9 calls to google.script.run
- Examples:
  - `getStudentPollStatus(token, context)`
  - `submitLivePollAnswer(pollId, questionIndex, answer, token, confidenceLevel)`
  - `reportStudentViolation(reason, token)`
  - `studentConfirmFullscreen(lockVersion, token)`

**Pattern**: All calls are direct function name references. Refactoring must maintain exact function names in exposed API.

### Data Access Patterns

**Current Sheets**:
1. **Classes**: Class definitions (ClassName, Description)
2. **Rosters**: Student lists (ClassName, StudentName, StudentEmail)
3. **Polls**: Poll/question data (PollID, PollName, ClassName, QuestionIndex, QuestionDataJSON, CreatedAt, UpdatedAt, Metadata)
4. **Responses**: Answer log + violation markers (ResponseID, Timestamp, PollID, QuestionIndex, StudentEmail, Answer, IsCorrect, Metadata)
5. **LiveStatus**: Active session singleton (ActivePollID, ActiveQuestionIndex, PollStatus)
6. **IndividualTimedSessions**: Secure assessment state (PollID, SessionID, StudentEmail, StartedAt, ...)

**Script Properties** (key-value store):
- `SESSION_METADATA`: Active poll session state (JSON)
- `STATE_VERSION_HISTORY`: Version tracking (JSON)
- `CONNECTION_HEARTBEATS`: Client health monitoring (JSON)
- `TEACHER_EMAILS`: Additional authorized teachers (CSV)
- `STUDENT_TOKENS`: Token → student email mapping (JSON)
- Various proctoring state keys

**Drive**:
- Images stored in folder (ID: configured via `getDriveFolder_()`)
- Served via proxy endpoint for ACL control

### Security Model

**Teacher Identification**:
- Primary: `TEACHER_EMAIL` constant (sborish@malvernprep.org)
- Secondary: `ADDITIONAL_TEACHER_PROP_KEY` Script Property (CSV of emails)
- Method: `Session.getActiveUser().getEmail()` compared against whitelist

**Student Authentication**:
- Token-based (HMAC-signed JWT-like structure)
- Format: base64(email:className:timestamp:hmac)
- Expiry: 30 days (TOKEN_EXPIRY_DAYS)
- Delivery: Personalized email links via MailApp

**Proctoring**:
- Client-side violation detection (fullscreen exit, tab switch, blur)
- Server-side lock enforcement (VIOLATION_LOCKED markers in Responses sheet)
- Version-based unlock approval (prevents race conditions)

### Current Separation of Teacher vs Student Logic

**Mixed Throughout Code**:
- Most functions don't enforce role-based access at the function level
- Teacher-only functions rely on client not calling them (not secure)
- Student functions sometimes check token, sometimes rely on implicit context
- No clear `assertTeacher()` or `getCurrentStudent()` pattern consistently applied

**Examples of Mixed Logic**:
- `startPoll()` - teacher-only, but no explicit check
- `submitLivePollAnswer()` - student-facing, requires token parameter
- `getLivePollData()` - teacher-only, no guard
- `getStudentPollStatus()` - student-facing, validates token

---

## Pain Points & Opportunities

### Current Problems

1. **Hard to Find Code**: Searching for "where is poll creation logic?" requires scanning entire 7,972-line file
2. **Risky Changes**: Modifying data access in one place might break unrelated features
3. **No Reusability**: Repeated patterns like "open sheet, get data range, filter rows" appear 50+ times
4. **Testing Impossible**: Cannot unit test business logic without triggering actual Sheet operations
5. **Onboarding Difficulty**: New developers must understand entire system before making changes
6. **Performance**: Repeated SpreadsheetApp.openById() calls in tight loops
7. **Security Gaps**: No centralized role enforcement (easy to forget checks)

### Refactoring Opportunities

1. **Extract Configuration**: Move all constants to dedicated Config module
2. **Centralize Security**: Single source of truth for teacher/student identity
3. **Abstract Data Layer**: Hide Sheet/Properties/Drive details behind query interface
4. **Modularize Business Logic**: Separate poll management from session management from analytics
5. **Split HTML**: Break massive templates into focused partials (navbar, modals, panels)
6. **Namespace Everything**: Wrap in `Veritas.*` to avoid global pollution
7. **Add Smoke Tests**: Simple validation that core flows still work after refactor

---

## Target Modular Structure

### Server-Side Modules

```
Veritas/
├── Core.gs                    # Namespace declaration, version constant
├── Config.gs                  # All configuration constants
├── Security.gs                # Teacher/student identity & role enforcement
├── Logging.gs                 # Centralized logging helpers
├── DataAccess.gs              # Sheets/Properties/Drive abstraction
├── Models_Poll.gs             # Poll CRUD and business logic
├── Models_Session.gs          # Live sessions & proctoring
├── Models_Analytics.gs        # Post-poll analytics (if extracting from Code.gs)
├── TeacherApi.gs              # Teacher-facing server methods
├── StudentApi.gs              # Student-facing server methods
├── ExposedApi.gs              # Public function wrappers (preserve names)
├── Routing.gs                 # doGet, doPost, include
├── Utils.gs                   # Shared utilities (URL building, etc.)
└── DevTools.gs                # Smoke tests and dev utilities
```

### Client-Side Structure

**Teacher Templates**:
```
Teacher/
├── Teacher.html               # Main shell (includes all partials)
├── TeacherNavbar.html         # Top navigation bar
├── TeacherDashboard.html      # Main dashboard panel
├── TeacherLiveControl.html    # Live poll controls
├── TeacherStudentGrid.html    # Student response grid
├── TeacherModals.html         # All modal dialogs
├── TeacherStyles.html         # Teacher-specific CSS
└── TeacherApp.html            # All JavaScript logic
```

**Student Templates**:
```
Student/
├── Student.html               # Main shell
├── StudentHeader.html         # Header/branding
├── StudentPanel.html          # Main response UI
├── StudentProctorUI.html      # Proctoring overlay
├── StudentStyles.html         # Student-specific CSS
└── StudentApp.html            # All JavaScript logic
```

**Shared**:
```
Shared/
├── SecureAssessmentShared.html  # Already exists (countdown, heartbeat, fullscreen)
└── SharedStyles.html            # Common brand colors, Tailwind config
```

---

## Refactoring Strategy

### Phase 1: Prepare Foundation (No Breaking Changes)

1. **Create docs/ directory** ✓
2. **Create all new .gs files** with empty Veritas namespace
3. **Create all new HTML template files** (initially empty)
4. **Verify project still loads** (empty files should be harmless)

### Phase 2: Extract Configuration & Utilities

1. **Move constants to Config.gs**:
   - `TEACHER_EMAIL`, `TOKEN_EXPIRY_DAYS`, `SESSION_TYPES`, etc.
   - Replace all references in Code.gs with `Veritas.Config.*`
2. **Move logging to Logging.gs**:
   - Extract `Logger.log`, `Logger.error` custom implementations
   - Update all callers to use `Veritas.Logging.*`
3. **Move utilities to Utils.gs**:
   - URL building, date parsing, HTML escaping, etc.

**Validation**: Ensure Code.gs still runs by calling a test function

### Phase 3: Extract Security Layer

1. **Create Security.gs** with:
   - `isTeacher(email)` → `Veritas.Security.isTeacher(email)`
   - `assertTeacher()` → throws if not teacher
   - `getCurrentStudent(token)` → returns {email, className} or throws
   - `getCanonicalTeacherEmail()` → for logging
2. **Update all teacher API functions** to call `assertTeacher()` at the top
3. **Update all student API functions** to use `getCurrentStudent(token)`

**Validation**: Test teacher and student login flows

### Phase 4: Extract Data Access Layer

1. **Create DataAccess.gs** with namespaced modules:
   - `Veritas.Data.Classes.*`
   - `Veritas.Data.Rosters.*`
   - `Veritas.Data.Polls.*`
   - `Veritas.Data.Responses.*`
   - `Veritas.Data.LiveStatus.*`
   - `Veritas.Data.Properties.*`
2. **Migrate all SpreadsheetApp calls** to use Data.* methods
3. **Add LockService where needed** for concurrent write safety

**Validation**: Test poll creation, student submission, and retrieval

### Phase 5: Extract Business Logic Models

1. **Create Models_Poll.gs**:
   - `Veritas.Models.Poll.create(payload)`
   - `Veritas.Models.Poll.update(pollId, payload)`
   - `Veritas.Models.Poll.delete(pollId)`
   - etc.
2. **Create Models_Session.gs**:
   - `Veritas.Models.Session.start(pollId)`
   - `Veritas.Models.Session.nextQuestion()`
   - `Veritas.Models.Session.submitAnswer(student, answer)`
   - Proctoring logic

**Validation**: Run full teacher + student workflow

### Phase 6: Create API Layers

1. **Create TeacherApi.gs**:
   - All teacher-facing methods
   - Each starts with `Veritas.Security.assertTeacher()`
2. **Create StudentApi.gs**:
   - All student-facing methods
   - Each derives identity from `Veritas.Security.getCurrentStudent(token)`
3. **Create ExposedApi.gs**:
   - Thin wrappers preserving original function names:
     ```javascript
     function startPoll(pollId) {
       return Veritas.TeacherApi.startPoll(pollId);
     }
     ```

**Validation**: Ensure all google.script.run calls still work

### Phase 7: Split HTML Templates

1. **Extract Teacher partials**:
   - Create Teacher.html shell with `<?!= include('TeacherNavbar'); ?>` etc.
   - Move sections of TeacherView.html into partials
   - Verify same DOM structure (IDs, classes preserved)
2. **Extract Student partials**:
   - Same process for StudentView.html
3. **Extract shared styles**:
   - Move Tailwind config to SharedStyles.html
   - Include in both Teacher.html and Student.html

**Validation**: Visual regression testing (manually compare screenshots)

### Phase 8: Add Smoke Tests

1. **Create DevTools.gs** with:
   - `test_PollCreation()` - creates poll, verifies in sheet
   - `test_StudentSubmission()` - submits answer, checks response
   - `test_ProctorLock()` - locks student, verifies state
2. **Document test procedure** in docs/refactor-summary.md

**Validation**: Run all tests and document results

### Phase 9: Final Validation & Documentation

1. **Create docs/refactor-summary.md** with:
   - File structure mapping (old → new)
   - Function name mapping (especially for exposed API)
   - Breaking changes (should be none)
   - Testing checklist
2. **Run full integration test**:
   - Teacher creates poll
   - Teacher starts poll
   - Student receives link (test token generation)
   - Student submits answers
   - Teacher views results
   - Proctoring flow (lock → unlock)
3. **Commit with detailed message**

---

## Function Mapping (Preliminary)

### Public API Functions (google.script.run)

These must remain callable with exact names. ExposedApi.gs will wrap internal implementations.

**Teacher Functions** (47 total, sample):
```
Original Name                        → New Internal Implementation
─────────────────────────────────────────────────────────────────────
getTeacherDashboardData()            → Veritas.TeacherApi.getDashboardData()
createNewPoll()                      → Veritas.TeacherApi.createPoll()
startPoll(pollId)                    → Veritas.TeacherApi.startPoll(pollId)
nextQuestion()                       → Veritas.TeacherApi.nextQuestion()
getLivePollData(pollId, qIdx)       → Veritas.TeacherApi.getLivePollData(pollId, qIdx)
teacherApproveUnlock(email, ...)     → Veritas.TeacherApi.approveUnlock(email, ...)
```

**Student Functions** (9 total):
```
Original Name                        → New Internal Implementation
─────────────────────────────────────────────────────────────────────
getStudentPollStatus(token, ctx)     → Veritas.StudentApi.getPollStatus(token, ctx)
submitLivePollAnswer(...)            → Veritas.StudentApi.submitAnswer(...)
reportStudentViolation(reason, tok)  → Veritas.StudentApi.reportViolation(reason, tok)
studentConfirmFullscreen(ver, tok)   → Veritas.StudentApi.confirmFullscreen(ver, tok)
```

**Shared/Utility Functions**:
```
doGet(e)                             → Veritas.Routing.doGet(e)
include(filename)                    → Veritas.Routing.include(filename)
```

---

## Risk Mitigation

### Potential Breaking Changes

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Renamed function breaks google.script.run call | High | ExposedApi.gs preserves all names |
| Changed DOM ID/class breaks JS selectors | Medium | Preserve all IDs/classes during split |
| Changed data format breaks existing polls | Low | No schema changes planned |
| Performance regression from added layers | Low | Use same underlying code, just organized |
| Security hole from refactored auth | Medium | Comprehensive testing of auth flows |

### Testing Checklist

Before deploying refactored code:

- [ ] Teacher can log in
- [ ] Teacher can create poll
- [ ] Teacher can start poll
- [ ] Teacher can navigate questions
- [ ] Teacher can close poll
- [ ] Student link generation works
- [ ] Student can access via token
- [ ] Student can submit answer
- [ ] Student sees results (if enabled)
- [ ] Proctoring lockout works
- [ ] Teacher can unlock student
- [ ] Student can re-enter fullscreen
- [ ] Analytics page loads
- [ ] Roster management works
- [ ] Image upload works
- [ ] Email sending works

---

## Implementation Timeline

**Estimated Effort**: 1-2 work sessions (with AI assistance)

**Phase Breakdown**:
1. Foundation: 15 min
2. Config & Utils: 30 min
3. Security: 30 min
4. Data Access: 1 hour
5. Business Logic: 1 hour
6. API Layers: 30 min
7. HTML Split: 1 hour
8. Smoke Tests: 30 min
9. Validation: 1 hour

**Total**: ~6-7 hours (can be done incrementally)

---

## Success Criteria

### Functional Requirements
- ✅ All existing features work identically
- ✅ Same UI/UX (pixel-perfect)
- ✅ Same data formats in Sheets
- ✅ Same API surface (google.script.run calls)

### Non-Functional Requirements
- ✅ Code organized into <500 line modules
- ✅ Clear separation of concerns
- ✅ Centralized config and security
- ✅ Reusable data access layer
- ✅ Testable business logic
- ✅ Maintainable HTML templates

### Documentation
- ✅ This refactor plan (docs/refactor-plan.md)
- ✅ Refactor summary with mapping (docs/refactor-summary.md)
- ✅ Updated ARCHITECTURE.md (if needed)
- ✅ Comments explaining non-obvious refactoring decisions

---

## Next Steps

1. ✅ **Create this document** (docs/refactor-plan.md)
2. ⏳ **Begin Phase 1**: Create all new .gs and .html files (empty stubs)
3. ⏳ **Proceed sequentially** through phases 2-9
4. ⏳ **Test thoroughly** at each phase
5. ⏳ **Document** in refactor-summary.md
6. ⏳ **Commit and push** to branch

---

**Ready to proceed with implementation!**
