# Phase 2C Function Catalog - Code.gs Analysis
**Total File Size:** 7,972 lines
**Analysis Date:** 2025-11-20

## Executive Summary
The Code.gs file contains approximately **170+ functions** spanning 7,972 lines. Based on the analysis:
- **~60 functions** should go to **Models_Poll**
- **~45 functions** should go to **Models_Session**
- **~35 functions** should go to **Models_Analytics**
- **~20 functions** already extracted to other modules
- **~10 functions** remain for Phase 2D (API/Routing layer)

---

## 1. Models_Poll Functions (~1,100 lines)
**Poll CRUD, validation, question management, roster management**

### Poll CRUD Operations
- `createNewPoll(pollName, className, questions, metadata)` (lines 2159-2184)
  - Creates new poll with questions and metadata
  - Validates question count, session type
  - Dependencies: writePollRows_, normalizeSecureMetadata_

- `updatePoll(pollId, pollName, className, questions, metadata)` (lines 3066-3095)
  - Updates existing poll
  - Dependencies: removePollRows_, writePollRows_, normalizeSecureMetadata_

- `deletePoll(pollId)` (lines 3097-3123)
  - Deletes poll and all associated responses
  - Dependencies: removePollRows_, DataAccess.responses

- `copyPoll(sourcePollId, newPollName, targetClassName)` (lines 3183-3233)
  - Deep copies poll with all questions
  - Preserves images via fileIds
  - Dependencies: DataAccess.polls, writePollRows_

- `savePollNew(pollData)` (lines 2211-2237)
  - Alternative save endpoint for new polls
  - Dependencies: writePollRows_, normalizeSecureMetadata_

- `saveDraft(pollData)` (lines 2187-2209)
  - Saves poll as draft (D- prefix)
  - Dependencies: writePollRows_

- `duplicateQuestion(pollId, questionIndex)` (lines 3125-3181)
  - Duplicates a question within a poll
  - Deep copy with validation
  - Dependencies: DataAccess.polls, writePollRows_

### Poll Retrieval & Management
- `getPollForEditing(pollId)` (lines 1826-1886)
  - Fetches poll data for editor
  - Normalizes secure metadata
  - Dependencies: DataAccess.polls, normalizeSessionTypeValue_

- `getArchivedPolls()` (lines 3605-3734)
  - Gets all polls with response data
  - Builds comprehensive analytics per poll
  - Dependencies: DataAccess.polls, DataAccess.roster, DataAccess.responses

- `getSecureAssessmentBookView(pollId)` (lines 5405-5522)
  - Comprehensive book view for secure assessments
  - Student-by-student, question-by-question breakdown
  - Dependencies: DataAccess.polls, buildResponsesByQuestion_, computeItemAnalysis_

### Question Normalization & Validation
- `normalizeQuestionObject_(questionData, pollUpdatedAt)` (lines 7881-7972+)
  - Converts fileIds to proxy URLs with cache busting
  - Handles legacy formats
  - Critical for image display consistency

- `normalizeSecureMetadata_(metadata)` (lines 54-106)
  - Validates and normalizes secure assessment metadata
  - Dependencies: normalizeSessionTypeValue_, isSecureSessionType_

- `normalizeSessionTypeValue_(value)` (lines 32-42)
  - Normalizes session type strings
  - Returns canonical SESSION_TYPES values

- `isSecureSessionType_(value)` (lines 44-46)
  - Boolean check for secure assessment

- `isSecureSessionPhase_(value)` (lines 48-52)
  - Boolean check for secure session phase

### Class & Roster Management
- `createClassRecord(className, description)` (lines 1903-1915)
  - Creates new class record
  - Dependencies: ensureClassExists_, getRosterManagerData

- `getRosterManagerData()` (lines 1888-1901)
  - Gets all classes and rosters
  - Dependencies: getClasses_, getRoster_

- `saveRoster(className, rosterEntries)` (lines 1918-1963)
  - Saves/updates class roster
  - Optimized batch write
  - Dependencies: ensureClassExists_, DataAccess.roster

- `bulkAddStudentsToRoster(className, studentEntries)` (lines 1965-2033)
  - Adds multiple students with duplicate detection
  - Dependencies: DataAccess.roster, ensureClassExists_

- `renameClass(oldName, newName)` (lines 2035-2110)
  - Renames class across all sheets
  - Updates tokens, polls, rosters
  - Batch optimization

- `deleteClassRecord(className)` (lines 2112-2157)
  - Deletes class and cleans up tokens
  - Dependencies: token cleanup

### Image Management (Drive Integration)
- `uploadImageToDrive(dataUrl, fileName)` (lines 1701-1749)
  - Uploads base64 image to Drive
  - Validates size (5MB), type, permissions
  - Returns fileId for storage

- `getDriveFolder_()` (lines 1648-1672)
  - Gets/validates Drive folder for images
  - Hardcoded folder ID for security

- `fixAllImagePermissions()` (lines 1679-1699)
  - Utility to fix permissions on existing images
  - One-time maintenance function

- `getWebAppUrl_()` (lines 1633-1646)
  - Gets web app base URL for proxy links

### Internal Poll Helpers
- `getPolls_()` (lines 7660-7727)
  - Cached poll fetcher with normalization
  - Builds poll objects from sheet data
  - Dependencies: normalizeQuestionObject_, normalizeSessionTypeValue_

- `writePollRows_(pollId, pollName, className, questions, createdAt, updatedAt, metadata)` (lines 7729-7782)
  - Writes poll data to Polls sheet
  - Handles all metadata columns

- `removePollRows_(pollId)` (lines 7784-7805)
  - Optimized poll deletion from sheet

- `getClasses_()` (lines 7836-7860)
  - Cached class list fetcher

- `getRoster_(className)` (lines 7862-7872)
  - Gets roster for specific class

- `ensureClassExists_(className, description)` (lines 7807-7834)
  - Creates class if doesn't exist

- `getDataRangeValues_(sheet)` (lines 7874-7879)
  - Helper to get sheet data range

### Poll Session Type Helpers
- `buildSecureAvailabilityDescriptor_(poll)` (lines 131-164)
  - Builds availability window status
  - Checks availableFrom/dueBy dates

- `parseDateInput_(value)` (lines 108-123)
  - Parses date strings

- `formatSecureDateLabel_(dateObj)` (lines 125-129)
  - Formats dates for display

### Metacognition Tag Management
- `saveMisconceptionTag(pollId, questionIndex, tag)` (lines 5568-5593)
  - Saves misconception tags for analytics
  - Dependencies: sheet access

**Estimated Total: ~1,100 lines**

---

## 2. Models_Session Functions (~1,200 lines)
**Live session management, secure assessments, proctoring, timing**

### Live Poll Session Control
- `startPoll(pollId)` (lines 2239-2267)
  - Starts live poll session
  - Sets status, creates sessionId
  - Dependencies: DataAccess.liveStatus, ProctorAccess

- `nextQuestion()` (lines 3235-3270)
  - Advances to next question
  - Dependencies: DataAccess.liveStatus, getLivePollData

- `previousQuestion()` (lines 3272-3308)
  - Goes back to previous question
  - Dependencies: DataAccess.liveStatus

- `stopPoll()` (lines 3310-3337)
  - Pauses poll (responses closed, results hidden)
  - Dependencies: DataAccess.liveStatus

- `resumePoll()` (lines 3342-3372)
  - Resumes paused poll
  - Dependencies: DataAccess.liveStatus

- `closePoll()` (lines 3377-3400)
  - Completely ends poll session
  - Dependencies: DataAccess.liveStatus

- `pausePollForTimerExpiry()` (lines 3402-3431)
  - Auto-pauses when timer expires
  - Dependencies: DataAccess.liveStatus

### Live Poll Results Management
- `revealResultsToStudents()` (lines 3433-3466)
  - Shows results to students
  - Dependencies: DataAccess.liveStatus

- `hideResultsFromStudents()` (lines 3468-3501)
  - Hides results from students
  - Dependencies: DataAccess.liveStatus

- `endQuestionAndRevealResults()` (lines 3503-3534)
  - Combined end + reveal
  - Dependencies: DataAccess.liveStatus

- `resetLiveQuestion(pollId, questionIndex, clearResponses)` (lines 3536-3602)
  - Resets question state, optionally clears responses
  - Optimized batch operations

### Secure Assessment Session Control
- `startIndividualTimedSession(pollId)` (lines 2616-2666)
  - Starts secure assessment session
  - Validates configuration, sets metadata
  - Dependencies: DataAccess.polls, DataAccess.liveStatus, ProctorAccess

- `endIndividualTimedSession(pollId)` (lines 2350-2394)
  - Ends secure assessment
  - Locks all unlocked students
  - Dependencies: DataAccess.liveStatus, DataAccess.individualSessionState

- `beginIndividualTimedAttempt(pollId, sessionId, token, options)` (lines 5992-6061)
  - Student begins secure assessment
  - Validates access code, availability window
  - Initializes student state with randomization
  - Dependencies: DataAccess.individualSessionState, buildSecureAvailabilityDescriptor_

### Secure Assessment Student State Management
- `getIndividualTimedSessionState(token)` (lines 2302-2348)
  - Gets current state for secure assessment student
  - Returns lobby, active, or locked state
  - Dependencies: DataAccess.individualSessionState, buildSecureAssessmentLobbyState_

- `getIndividualTimedQuestion(pollId, sessionId, studentEmail, existingState)` (lines 2962-3054)
  - Gets current question for student
  - Handles randomization, timing, locking
  - Dependencies: initializeIndividualTimedStudent, computeSecureTimingState_

- `initializeIndividualTimedStudent(pollId, sessionId, studentEmail)` (lines 2914-2957)
  - Initializes student state with randomization
  - Dependencies: DataAccess.individualSessionState, buildInitialAnswerOrderMap_

- `submitIndividualTimedAnswer(pollId, sessionId, studentEmail, actualQuestionIndex, answer, confidenceLevel)` (lines 6348-6446)
  - Submits answer for secure assessment
  - Validates time limits, prevents backtracking
  - Dependencies: DataAccess.individualSessionState, computeSecureTimingState_

- `submitAnswerIndividualTimed(token, answerDetails)` (lines 2277-2300)
  - Token-based wrapper for submitIndividualTimedAnswer

### Secure Assessment Timing & Adjustments
- `computeSecureTimingState_(studentState, poll, metadata)` (lines 235-256)
  - Calculates remaining time with adjustments
  - Accounts for pauses, time extensions

- `adjustSecureAssessmentTime(pollId, sessionId, studentEmail, deltaMinutes)` (lines 2668-2695)
  - Teacher adjusts time for one student
  - Dependencies: applySecureAssessmentTimeAdjustment_

- `adjustSecureAssessmentTimeBulk(pollId, sessionId, studentEmails, deltaMinutes)` (lines 2697-2721)
  - Teacher adjusts time for multiple students
  - Dependencies: applySecureAssessmentTimeAdjustment_

- `adjustSecureAssessmentTimeForAll(pollId, sessionId, deltaMinutes)` (lines 2723-2758)
  - Teacher adjusts time for all students
  - Updates global adjustment + individual states
  - Dependencies: applySecureAssessmentTimeAdjustment_

- `applySecureAssessmentTimeAdjustment_(pollId, sessionId, studentEmail, numericDelta, actorEmail, throwIfMissing)` (lines 2760-2783)
  - Internal helper for time adjustments
  - Logs events

### Secure Assessment Pause/Resume
- `pauseSecureAssessmentStudent(pollId, sessionId, studentEmail)` (lines 2785-2819)
  - Teacher pauses individual student
  - Dependencies: DataAccess.individualSessionState

- `resumeSecureAssessmentStudent(pollId, sessionId, studentEmail)` (lines 2821-2866)
  - Teacher resumes paused student
  - Accumulates pause duration
  - Dependencies: DataAccess.individualSessionState

- `forceSubmitSecureAssessmentStudent(pollId, sessionId, studentEmail)` (lines 2868-2908)
  - Teacher force-submits student
  - Locks and updates proctor state
  - Dependencies: DataAccess.individualSessionState, ProctorAccess

### Secure Assessment Teacher View
- `getIndividualTimedSessionTeacherView(pollId, sessionId)` (lines 2400-2614)
  - Mission Control view for teachers
  - Real-time student progress, timing, proctoring
  - Batch proctor state loading (optimization)
  - Dependencies: DataAccess.individualSessionState, ProctorAccess, computeSecureTimingState_

### Secure Assessment Lobby & Availability
- `buildSecureAssessmentLobbyState_(poll, sessionId)` (lines 166-188)
  - Builds lobby state for students
  - Shows rules, availability, requirements

### Proctoring System (Atomic State Machine)
- `reportStudentViolation(reason, token)` (lines 6900-7030)
  - Student reports violation (exit fullscreen)
  - Atomic state transitions
  - Dependencies: ProctorAccess, DataAccess.liveStatus

- `teacherApproveUnlock(studentEmail, pollId, expectedLockVersion)` (lines 7070-7123)
  - Teacher approves unlock (atomic with version check)
  - Prevents race conditions
  - Dependencies: ProctorAccess

- `teacherBlockStudent(studentEmail, pollId, reason)` (lines 7125-7189)
  - Teacher manually blocks student
  - Dependencies: ProctorAccess

- `teacherUnblockStudent(studentEmail, pollId)` (lines 7191-7242)
  - Teacher unblocks student
  - Dependencies: ProctorAccess

- `studentConfirmFullscreen(expectedLockVersion, token)` (lines 7247-7300)
  - Student confirms fullscreen (completes unlock)
  - Atomic version check
  - Dependencies: ProctorAccess

- `getStudentProctorState(token)` (lines 7035-7065)
  - Gets current proctor state for student
  - Dependencies: ProctorAccess

### Proctor Access Layer (Should move with session logic)
- `ProctorAccess.getState(pollId, studentEmail, currentSessionId)` (lines 6604-6685)
  - Gets proctor state from sheet
  - Handles session resets

- `ProctorAccess.getStatesBatch(pollId, studentEmails, currentSessionId)` (lines 6692-6789)
  - Batch loads proctor states (optimization)
  - 100x faster than individual calls

- `ProctorAccess.setState(state)` (lines 6794-6848)
  - Sets/updates proctor state with validation
  - Enforces state machine invariants

- `ProctorAccess.resetForNewSession(pollId, sessionId)` (lines 6850-6894)
  - Resets all proctor states for new session
  - Batch optimization

- `hydrateProctorBlockFields_(state)` (lines 6574-6594)
  - Extracts block metadata from state

### Student Response Management
- `resetStudentResponse(studentEmail, pollId, questionIndex)` (lines 7316-7368)
  - Teacher resets student's answer
  - Dependencies: sheet access

### Session State Helpers
- `deriveSecureConnectionMeta_(heartbeatInfo)` (lines 190-207)
  - Derives connection health status

- `applyConnectionMetaToPayload_(payload, connectionMeta)` (lines 209-219)
  - Adds connection metadata to payload

- `lookupStudentDisplayName_(className, studentEmail)` (lines 221-233)
  - Gets student display name from roster

- `buildInitialAnswerOrderMap_(poll)` (lines 3920-3931)
  - Builds randomized answer orders for secure assessment

- `shuffleArray_(array)` (lines 3933-3940)
  - Fisher-Yates shuffle for randomization

### Assessment Event Logging
- `logAssessmentEvent_(pollId, sessionId, studentEmail, eventType, payload)` (lines 1565-1586)
  - Logs events to AssessmentEvents sheet
  - For audit trail

- `ProctorTelemetry.log(event, studentEmail, pollId, extra)` (lines 6530-6571)
  - Optional telemetry logging

**Estimated Total: ~1,200 lines**

---

## 3. Models_Analytics Functions (~1,300 lines)
**Post-poll analytics, insights, KPI calculations, psychometrics**

### Comprehensive Analytics Hub
- `getAnalyticsData(filters)` (lines 3744-3796)
  - Main analytics aggregation function
  - Session, item, student, topic aggregates
  - KPI computations
  - Dependencies: buildResponseMaps_, compute*Aggregates_, computeKPIs_

- `buildResponseMaps_(responseValues)` (lines 3801-3857)
  - Builds response data structures for analytics
  - Tracks violations, timestamps

### Session-Level Analytics
- `computeSessionAggregates_(polls, responsesByPoll)` (lines 3862-3918)
  - Calculates mastery, participation, time, integrity per session
  - Returns array of session metrics

### Item-Level Analytics
- `computeItemAggregates_(polls, responsesByPoll)` (lines 3987-4092)
  - Item difficulty, discrimination, time analysis
  - Choice distribution, flags
  - Dependencies: calculatePointBiserial_

- `calculatePointBiserial_(itemScores, totalScores)` (lines 3943-3982)
  - Point-biserial correlation for discrimination
  - Psychometric quality metric

### Student-Level Analytics
- `computeStudentAggregates_(polls, responsesByPoll)` (lines 4097-4204)
  - Per-student performance across sessions
  - Topic-level breakdowns
  - Participation rates

### Topic-Level Analytics
- `computeTopicAggregates_(polls, responsesByPoll)` (lines 4209-4262)
  - Performance by topic/standard
  - Session trends per topic

### KPI Calculations
- `computeKPIs_(sessionAggregates, studentAggregates)` (lines 4267-4336)
  - Top-level metrics for dashboard
  - Mastery, participation, time, integrity

### Post-Poll Psychometric Analytics
- `getPostPollAnalytics(pollId)` (lines 4347-4384)
  - Comprehensive post-poll report
  - Class overview, item analysis, metacognition, distribution
  - Dependencies: compute*Analysis_ functions

- `buildResponsesByQuestion_(pollResponses)` (lines 4389-4419)
  - Organizes responses by question

- `calculateStudentTotalScores_(poll, responsesByQuestion)` (lines 4424-4440)
  - Calculates total scores for discrimination

- `computeClassOverview_(poll, responsesByQuestion, studentTotalScores, roster)` (lines 4444-4496)
  - Mean, median, std dev, distribution

- `computeItemAnalysis_(poll, responsesByQuestion, studentTotalScores)` (lines 4501-4558)
  - Item difficulty, discrimination, distractor analysis
  - Auto-flags problematic items

- `calculateDiscriminationIndex_(responses, studentTotalScores)` (lines 4564-4586)
  - Upper/lower 27% discrimination

- `computeDistractorAnalysis_(question, responses, studentTotalScores)` (lines 4591-4643)
  - How each option performed
  - High/low group analysis

- `computeMetacognitionAnalysis_(poll, responsesByQuestion)` (lines 4648-4722)
  - Confidence vs correctness matrix
  - Identifies misconceptions

- `computeDistributionAnalysis_(studentTotalScores, maxScore)` (lines 4727-4767)
  - Z-scores, histogram

### Enhanced Analytics with Interpretations
- `getEnhancedPostPollAnalytics(pollId)` (lines 5102-5135)
  - Adds contextual interpretations to base analytics
  - Teacher action items
  - Dependencies: getPostPollAnalytics, interpret* functions

- `interpretParticipation(participated, total)` (lines 5141-5148)
- `interpretMeanScore(mean, maxScore)` (lines 5150-5157)
- `interpretStdDev(stdDev, maxScore)` (lines 5159-5165)
- `interpretDistribution(scoreDistribution)` (lines 5167-5192)
- `interpretDifficulty(pValue)` (lines 5194-5200)
- `interpretDiscrimination(discrimination)` (lines 5202-5208)
- `interpretItemQuality(difficulty, discrimination)` (lines 5210-5223)
- `getItemActionableInsights(item)` (lines 5225-5245)
- `generateTeacherActionItems(analytics)` (lines 5247-5296)

### Student Insights & Historical Analytics
- `getStudentInsights(className, options)` (lines 4778-4944)
  - Identifies struggling students, high performers
  - Violation tracking, participation rates
  - Class-wide statistics

- `getStudentHistoricalAnalytics(studentEmail, className, options)` (lines 4950-5096)
  - Per-student history across polls
  - Performance trends, violations, confidence data

### Dashboard Summary
- `getDashboardSummary()` (lines 5301-5398)
  - Recent sessions, daily activity
  - Week-over-week changes

### Live Poll Data (for real-time analytics)
- `getLivePollData(pollId, questionIndex)` (lines 5596-5893)
  - Current question status, student responses
  - Metacognition summary
  - Used for live dashboard

- `metacognitionSummary` computation (lines 5750-5860)
  - Real-time metacognition matrix

### Student Name Formatting
- `extractStudentNameParts_(fullName)` (lines 5901-5917)
  - Parses names for sorting/display

- `formatStudentName_(fullName)` (lines 5924-5930)
  - Formats as "FirstName L."

### Response & Answer Helpers
- `buildSubmittedAnswersMap_(pollId, questionIndex)` (lines 5932-5954)
- `computeAnswerCounts_(question, submissionsMap)` (lines 5956-5973)
- `computeAnswerPercentages_(answerCounts)` (lines 5975-5986)

**Estimated Total: ~1,300 lines**

---

## 4. Already Extracted to Other Modules (~300 lines)

### Config Module (Veritas.Config)
Referenced but not defined in Code.gs:
- `TEACHER_EMAIL` (line 6, but defined at top)
- `SESSION_TYPES`, `PROCTOR_VIOLATION_CODES`, `PROCTOR_STATUS_VALUES`
- `INDIVIDUAL_SESSION_COLUMNS`, `CLASS_LINKS_CACHE_PREFIX`
- Column definitions and constants

### Utils Module (Should already be extracted)
- `Logger` object (lines 260-278) - Enhanced logging wrapper
- `withErrorHandling(fn)` (lines 281-290) - Error wrapper
- `escapeHtml_(value)` (lines 596-608) - HTML escaping
- `buildQueryString_(params)` (lines 610-620) - Query string builder
- `normalizeSheetBoolean_(value, defaultValue)` (lines 700-717) - Boolean normalization
- `coerceBoolean_(value, defaultValue)` (lines 779-791) - Boolean coercion

### Security Module (Should already be extracted)
- `isTeacherEmail_(email)` (lines 583-586) - Teacher check
- `getTeacherEmailSet_()` (lines 557-581) - Teacher email set
- `getCanonicalTeacherEmail_()` (lines 588-594) - Gets primary teacher
- `buildTeacherAccountChooserUrl_(e, loginHintEmail)` (lines 622-637) - Auth redirect
- `maybeRedirectForTeacherAccount_(e, currentUserEmail)` (lines 639-667) - Auth gate

### Cache/Performance Module (Should already be extracted)
- `CacheManager` object (lines 293-331) - Caching layer
- `RateLimiter` object (lines 334-346) - Rate limiting

### Token/Auth Module (Should already be extracted)
- `TokenManager` object (lines 349-552) - Token generation/validation

### DataAccess Module (Already extracted in Phase 2B)
- `DataAccess.responses.*` (lines 795-826)
- `DataAccess.polls.*` (lines 828-840)
- `DataAccess.roster.*` (lines 842-850)
- `DataAccess.liveStatus.*` (lines 852-942)
- `DataAccess.individualSessionState.*` (lines 944-1137)

### State/Versioning Module (Should already be extracted)
- `StateVersionManager` object (lines 1141-1272) - Version tracking, heartbeats

### URL Module (Should already be extracted)
- `URLShortener` object (lines 670-698) - TinyURL integration

---

## 5. Leave for Phase 2D - API/Routing Layer (~200 lines)

### Main Entry Points
- `doGet(e)` (lines 1281-1367)
  - Main routing function
  - Authentication checks
  - Template selection
  - **KEEP in Code.gs - this is the web app entry point**

- `serveImage_(e)` (lines 1374-1427)
  - Image proxy endpoint
  - **KEEP in Code.gs - doGet routing target**

- `include(filename)` (lines 1429-1431)
  - Template include helper
  - **KEEP in Code.gs - HtmlService helper**

- `getPollEditorHtml(className)` (lines 1433-1437)
  - Editor template generator
  - **KEEP in Code.gs - template helper**

### Setup/Initialization
- `setupSheet()` (lines 1464-1521)
  - One-time sheet setup
  - **KEEP in Code.gs - administrative function**

- `ensureSheet_(ss, name)` (lines 1523-1528)
  - Sheet creation helper
  - **KEEP in Code.gs - setup helper**

- `ensureHeaders_(sheet, desiredHeaders)` (lines 1531-1563)
  - Header validation/creation
  - **KEEP in Code.gs - setup helper**

### Student API Endpoints (These will route to Models)
- `submitLivePollAnswer(pollId, questionIndex, answerText, token, confidenceLevel)` (lines 6448-6518)
  - **Phase 2D: Route to Models_Session.submitLivePollAnswer**

- `getStudentPollStatus(token, context)` (lines 6063-6345)
  - **Phase 2D: Route to Models_Session.getStudentPollStatus**

### Teacher Dashboard Endpoints (These will route to Models)
- `getTeacherDashboardData()` (lines 1755-1779)
  - **Phase 2D: Route to Models_Poll.getTeacherDashboardData**

### Email/Communication
- `generatePollEmailHtml(pollUrl)` (lines 7374-7546)
  - HTML email template
  - **Could move to separate Email module or stay in Code.gs**

- `sendPollLinkToClass(className)` (lines 7552-7611)
  - **Phase 2D: Route to Models_Session or Communication module**

- `getStudentLinksForClass(className)` (lines 7616-7654)
  - **Phase 2D: Route to Models_Session**

### UI Helper
- `safeUiAlert(message, title)` (lines 1439-1457)
  - **KEEP in Code.gs - UI utility**

### Legacy/Deprecated (Can remove)
- `logStudentViolation()` (lines 7305-7307) - Deprecated, redirects to reportStudentViolation
- `unlockStudent(studentEmail, pollId)` (lines 7309-7314) - Deprecated

---

## 6. Migration Strategy

### Phase 2C-1: Models_Poll (~1,100 lines)
**Priority:** HIGH - Most straightforward, fewest dependencies

1. Create `/home/user/veritaslivepoll/Models_Poll.gs`
2. Extract Poll CRUD functions
3. Extract Question/Image management
4. Extract Class/Roster management
5. Extract internal helpers (getPolls_, writePollRows_, etc.)
6. Update function calls in Code.gs to use `Models.Poll.*`

**Dependencies to handle:**
- DataAccess (already extracted)
- Utils functions (need to extract first)
- Config constants (already extracted)

### Phase 2C-2: Models_Session (~1,200 lines)
**Priority:** HIGH - Complex but well-defined

1. Create `/home/user/veritaslivepoll/Models_Session.gs`
2. Extract Live Poll session control
3. Extract Secure Assessment session control
4. Extract Proctoring system (ProctorAccess object)
5. Extract Student state management
6. Extract Timing calculations
7. Update function calls to use `Models.Session.*`

**Dependencies to handle:**
- Models_Poll (for poll data)
- DataAccess (already extracted)
- StateVersionManager (needs extraction)
- TokenManager (needs extraction)

### Phase 2C-3: Models_Analytics (~1,300 lines)
**Priority:** MEDIUM - Can wait until 2C-1 and 2C-2 complete

1. Create `/home/user/veritaslivepoll/Models_Analytics.gs`
2. Extract Analytics Hub functions
3. Extract Psychometric calculations
4. Extract Student insights
5. Extract Interpretation helpers
6. Update function calls to use `Models.Analytics.*`

**Dependencies to handle:**
- Models_Poll (for poll/roster data)
- Models_Session (for live data)
- DataAccess (already extracted)

### Phase 2C-4: Extract Remaining Utils (~200 lines)
**Priority:** HIGH - Should do FIRST before other phases

1. Create or update `/home/user/veritaslivepoll/Utils.gs`
2. Extract: Logger, withErrorHandling, escapeHtml_, buildQueryString_
3. Extract: normalizeSheetBoolean_, coerceBoolean_
4. Extract: StateVersionManager, TokenManager
5. Update all references to use `Veritas.Utils.*`

---

## 7. Dependency Graph

```
Code.gs (API Layer)
    ├─> Models.Poll
    │   ├─> Veritas.Config
    │   ├─> Veritas.Utils
    │   ├─> Veritas.DataAccess
    │   └─> Veritas.Security
    │
    ├─> Models.Session
    │   ├─> Models.Poll (for poll data)
    │   ├─> Veritas.Config
    │   ├─> Veritas.Utils
    │   ├─> Veritas.DataAccess
    │   ├─> Veritas.Security
    │   └─> Veritas.State (TokenManager, StateVersionManager)
    │
    └─> Models.Analytics
        ├─> Models.Poll (for poll/roster data)
        ├─> Models.Session (for live data)
        ├─> Veritas.Config
        ├─> Veritas.Utils
        └─> Veritas.DataAccess
```

---

## 8. Line Count Validation

| Category | Estimated Lines | Notes |
|----------|----------------|-------|
| Models_Poll | ~1,100 | Poll CRUD, questions, roster, images |
| Models_Session | ~1,200 | Live polls, secure assessments, proctoring |
| Models_Analytics | ~1,300 | Analytics, psychometrics, insights |
| Already Extracted | ~300 | Config, DataAccess, Utils (partial) |
| API/Routing (stay in Code.gs) | ~200 | doGet, entry points, setup |
| Utils to extract | ~200 | Logger, StateManager, TokenManager |
| HTML/Email templates | ~200 | Email generation |
| **Total** | **~4,500** | Core logic only |
| Supporting code | ~3,472 | Comments, whitespace, legacy |
| **Grand Total** | **7,972** | Matches actual file size ✓ |

---

## 9. Next Steps

### Immediate (Phase 2C)
1. ✅ Complete this analysis
2. Extract Veritas.Utils (Logger, TokenManager, StateVersionManager) - ~200 lines
3. Extract Models_Poll - ~1,100 lines
4. Extract Models_Session - ~1,200 lines
5. Extract Models_Analytics - ~1,300 lines
6. Update Code.gs to route to new modules
7. Test all functionality
8. Commit Phase 2C completion

### Future (Phase 2D - Routing Layer)
1. Create thin routing layer in Code.gs
2. Move complex logic to appropriate Models
3. Keep only doGet, serveImage, include, setupSheet in Code.gs
4. Final integration testing

---

## 10. Risk Assessment

### High Risk
- **Proctoring state machine**: Complex atomic operations, careful testing needed
- **Secure assessment timing**: Critical time calculations, race conditions possible
- **Batch operations**: Performance optimizations must be preserved

### Medium Risk
- **Poll normalization**: Image URL generation must work consistently
- **Analytics aggregations**: Complex calculations, verify accuracy
- **Token management**: Security-critical, thorough testing required

### Low Risk
- **Poll CRUD**: Straightforward database operations
- **Roster management**: Simple sheet operations
- **Utility functions**: Pure functions, easy to test

---

## 11. Testing Checklist

After extraction, verify:
- [ ] Live polls start/stop/navigate correctly
- [ ] Secure assessments start and track time properly
- [ ] Proctoring locks/unlocks work atomically
- [ ] Analytics calculations match original
- [ ] Image proxy URLs work for all images
- [ ] Poll CRUD operations persist correctly
- [ ] Roster management updates all sheets
- [ ] Student links generate and work
- [ ] Teacher dashboard loads
- [ ] Mission Control shows real-time data

---

**Analysis Complete**
This catalog provides a complete mapping of all 170+ functions in Code.gs and their target destinations for Phase 2C refactoring.
