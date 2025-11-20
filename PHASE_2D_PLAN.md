# Phase 2D: API/Routing Layer - Strategic Plan

**Goal:** Create clean separation between API layer, routing, and business logic

---

## Overview

Currently in Code.gs (~4,352 lines):
1. **Routing logic** - doGet(e), serveImage_, include()
2. **Security checks** - isTeacherEmail_, getTeacherEmailSet_
3. **Teacher API endpoints** - Called from TeacherView.html via google.script.run
4. **Student API endpoints** - Called from StudentView.html via google.script.run
5. **Analytics computations** - Helper functions for analytics
6. **Miscellaneous** - Setup, utilities, legacy code

---

## Phase 2D Structure

### File 1: `_10_TeacherApi.gs` (~300 lines)

**Purpose:** Teacher-facing server methods with security enforcement

**Functions to extract:**
- `getTeacherDashboardData()` - Dashboard data
- `getPollEditorHtml(className)` - Poll editor HTML
- `getStudentLinksForClass(className)` - Student link generation
- Security wrappers for all teacher-only operations
- Any teacher-specific data fetching

**Security Pattern:**
```javascript
Veritas.TeacherApi.someFunction = function(params) {
  return withErrorHandling(function() {
    // 1. Security check
    var userEmail = Session.getActiveUser().getEmail();
    if (!isTeacherEmail_(userEmail)) {
      throw new Error('Unauthorized: Teacher access required');
    }

    // 2. Call Models layer
    return Veritas.Models.Poll.someFunction(params);
  })();
};
```

---

### File 2: `_11_StudentApi.gs` (~200 lines)

**Purpose:** Student-facing methods with identity validation

**Functions to extract:**
- `getStudentPollStatus(token, context)` - Poll status for student
- `submitLivePollAnswer(pollId, questionIndex, answer, token, confidence)` - Submit answers
- Token validation and student identity management
- Student-safe data fetching

**Security Pattern:**
```javascript
Veritas.StudentApi.someFunction = function(token, params) {
  return withErrorHandling(function() {
    // 1. Validate token
    var tokenData = TokenManager.validateToken(token);
    if (!tokenData) {
      throw new Error('Invalid or expired token');
    }

    // 2. Extract student identity
    var studentEmail = tokenData.email;

    // 3. Call Models layer with validated identity
    return Veritas.Models.Session.someFunction(studentEmail, params);
  })();
};
```

---

### File 3: `_12_Routing.gs` (~150 lines)

**Purpose:** Web app routing and template serving

**Functions to extract:**
- `doGet(e)` - Main routing logic
- `serveImage_(e)` - Image proxy
- `include(filename)` - Template helper
- Authentication flow (token vs Google auth)
- Teacher vs student routing

**Structure:**
```javascript
Veritas.Routing = {};

Veritas.Routing.doGet = function(e) {
  // 1. Check for image proxy
  if (e.parameter.fn === 'image') {
    return Veritas.Routing.serveImage(e);
  }

  // 2. Determine user identity (token or Google auth)
  var identity = Veritas.Routing.resolveIdentity(e);

  // 3. Serve appropriate template
  if (identity.isTeacher) {
    return Veritas.Routing.serveTeacherView();
  } else {
    return Veritas.Routing.serveStudentView(identity);
  }
};
```

---

### File 4: `_13_ExposedApi.gs` (~150 lines)

**Purpose:** Thin wrappers that are actually called from google.script.run

**Pattern:**
```javascript
// These are the actual functions called from the frontend
// They delegate to TeacherApi or StudentApi

// Teacher endpoints
function getTeacherDashboardData() {
  return Veritas.TeacherApi.getTeacherDashboardData();
}

function createNewPoll(pollName, className, questions, metadata) {
  return Veritas.TeacherApi.createNewPoll(pollName, className, questions, metadata);
}

// Student endpoints
function getStudentPollStatus(token, context) {
  return Veritas.StudentApi.getStudentPollStatus(token, context);
}

function submitLivePollAnswer(pollId, questionIndex, answer, token, confidence) {
  return Veritas.StudentApi.submitLivePollAnswer(pollId, questionIndex, answer, token, confidence);
}

// Routing
function doGet(e) {
  return Veritas.Routing.doGet(e);
}

function include(filename) {
  return Veritas.Routing.include(filename);
}
```

---

### Final `Code.gs` (~50 lines)

**Purpose:** Minimal entry point, namespace initialization

**Contents:**
```javascript
// =============================================================================
// VERITAS LIVE POLL - ENTRY POINT
// =============================================================================
// This file serves as the minimal entry point for the Veritas Live Poll system.
// All business logic has been extracted to modular files.
// =============================================================================

// Initialize Veritas namespace
var Veritas = Veritas || {};
Veritas.Env = {
  VERSION: '2.0.0',
  PHASE: 'Phase 2D Complete - Modular Architecture'
};

// The actual implementations are in:
// - _10_TeacherApi.gs - Teacher-facing server methods
// - _11_StudentApi.gs - Student-facing methods
// - _12_Routing.gs - Web app routing and templates
// - _13_ExposedApi.gs - google.script.run wrappers

// All other modules:
// - _00_Config.gs - Configuration
// - _02_DataAccess.gs - Data layer
// - _05_Utils.gs - Utilities
// - _07_Models_Poll.gs - Poll business logic
// - _08_Models_Session.gs - Session business logic
// - _09_Models_Analytics.gs - Analytics business logic

// Legacy functions and setup code remain below for compatibility
// ...
```

---

## Execution Strategy

1. **Step 1: Create Routing.gs** (FIRST)
   - Extract doGet, serveImage_, include
   - Extract security helpers (isTeacherEmail_, etc.)
   - Most straightforward, no dependencies on other new files
   - ~30 minutes

2. **Step 2: Create TeacherApi.gs** (SECOND)
   - Extract teacher-facing functions
   - Add security checks
   - Depends on Routing for security helpers
   - ~45 minutes

3. **Step 3: Create StudentApi.gs** (THIRD)
   - Extract student-facing functions
   - Add token validation
   - Similar to TeacherApi
   - ~30 minutes

4. **Step 4: Create ExposedApi.gs** (FOURTH)
   - Create thin wrappers for all exposed functions
   - Map frontend calls to TeacherApi/StudentApi
   - Quick, just delegation
   - ~20 minutes

5. **Step 5: Clean up Code.gs** (FINAL)
   - Remove extracted functions
   - Add minimal entry point structure
   - Documentation
   - ~15 minutes

**Total Estimated Time:** ~2.5 hours

---

## Functions Inventory

### Teacher API Functions (to extract)
- getTeacherDashboardData
- getPollEditorHtml
- getStudentLinksForClass
- (All Models.Poll functions exposed to teachers)
- (All Models.Session functions exposed to teachers)
- (All Models.Analytics functions exposed to teachers)

### Student API Functions (to extract)
- getStudentPollStatus
- submitLivePollAnswer
- (Token-based wrappers for Models.Session functions)

### Routing Functions (to extract)
- doGet
- serveImage_
- include
- isTeacherEmail_
- getTeacherEmailSet_
- maybeRedirectForTeacherAccount_
- buildTeacherAccountChooserUrl_
- getCanonicalTeacherEmail_

---

## Success Criteria

- [ ] All teacher operations go through TeacherApi with security checks
- [ ] All student operations go through StudentApi with token validation
- [ ] All routing logic in Routing.gs
- [ ] All google.script.run calls mapped in ExposedApi.gs
- [ ] Code.gs reduced to minimal entry point (~50 lines)
- [ ] Zero breaking changes
- [ ] All existing frontend code works unchanged

---

**Ready to begin Step 1: Create Routing.gs**
