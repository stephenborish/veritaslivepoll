// =============================================================================
// VERITAS LIVE POLL - EXPOSED API MODULE
// =============================================================================
// Purpose: Centralized registry of all functions exposed to google.script.run
// Dependencies: TeacherApi, StudentApi, Routing, Models
// Phase: 2D - API/Routing Layer
// =============================================================================
//
// This file serves as the definitive list of all server-side functions that
// can be called from the frontend via google.script.run.
//
// All functions are thin wrappers that delegate to:
// - Veritas.TeacherApi.* for teacher operations (with auth checks)
// - Veritas.StudentApi.* for student operations (with token validation)
// - Veritas.Routing.* for routing and templates
// - Veritas.Models.* for direct model access (if needed)
//
// Note: Legacy wrappers also exist in the respective module files for
// backward compatibility, but this file provides a centralized reference.
// =============================================================================

// =============================================================================
// ROUTING & TEMPLATES
// =============================================================================

/**
 * Main entry point for web app requests
 * @param {Object} e - Event object from Apps Script
 * @returns {HtmlOutput} Rendered HTML page
 */
function doGet(e) {
  // Handle dev role switching via URL parameters for local testing
  Veritas.Dev.handleRouteSwitch(e);
  return Veritas.Routing.doGet(e);
}

/**
 * Include HTML file content (for template composition)
 * @param {string} filename - File name to include
 * @returns {string} File content
 */
function include(filename) {
  return Veritas.Routing.include(filename);
}

// =============================================================================
// TEACHER API - DASHBOARD & CORE
// =============================================================================

/**
 * Get teacher dashboard data
 * @returns {Object} {classes, polls}
 */
function getTeacherDashboardData() {
  return Veritas.TeacherApi.getTeacherDashboardData();
}

/**
 * Get poll editor HTML
 * @param {string} className - Class name
 * @returns {string} HTML content
 */
function getPollEditorHtml(className) {
  return Veritas.TeacherApi.getPollEditorHtml(className);
}

/**
 * Get student links for a class
 * @param {string} className - Class name
 * @returns {Object} {success, links}
 */
function getStudentLinksForClass(className) {
  return Veritas.TeacherApi.getStudentLinksForClass(className);
}

// =============================================================================
// TEACHER API - ANALYTICS & INSIGHTS
// =============================================================================

/**
 * Get analytics data
 * @param {Object} filters - Filter options
 * @returns {Object} Analytics data
 */
function getAnalyticsData(filters) {
  return Veritas.TeacherApi.getAnalyticsData(filters);
}

/**
 * Get post-poll analytics
 * @param {string} pollId - Poll ID
 * @returns {Object} Psychometric analysis
 */
function getPostPollAnalytics(pollId) {
  return Veritas.TeacherApi.getPostPollAnalytics(pollId);
}

/**
 * Get enhanced post-poll analytics with interpretations
 * @param {string} pollId - Poll ID
 * @returns {Object} Enhanced analytics
 */
function getEnhancedPostPollAnalytics(pollId) {
  return Veritas.TeacherApi.getEnhancedPostPollAnalytics(pollId);
}

/**
 * Get student insights
 * @param {string} studentEmail - Student email
 * @param {string} className - Class name (optional)
 * @returns {Object} Student insights
 */
function getStudentInsights(studentEmail, className) {
  return Veritas.TeacherApi.getStudentInsights(studentEmail, className);
}

/**
 * Get student historical analytics
 * @param {string} studentEmail - Student email
 * @returns {Object} Historical data
 */
function getStudentHistoricalAnalytics(studentEmail) {
  return Veritas.TeacherApi.getStudentHistoricalAnalytics(studentEmail);
}

/**
 * Get dashboard summary
 * @returns {Object} Summary data
 */
function getDashboardSummary() {
  return Veritas.TeacherApi.getDashboardSummary();
}

/**
 * Get live poll data
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @returns {Object} Live poll monitoring data
 */
function getLivePollData(pollId, questionIndex) {
  return Veritas.TeacherApi.getLivePollData(pollId, questionIndex);
}

// =============================================================================
// TEACHER API - POLL MANAGEMENT
// =============================================================================

/**
 * Create new poll
 * @param {string} pollName - Poll name
 * @param {string} className - Class name
 * @param {Array} questions - Questions
 * @param {Object} metadata - Metadata
 * @returns {Object} Created poll
 */
function createNewPoll(pollName, className, questions, metadata) {
  return Veritas.TeacherApi.createNewPoll(pollName, className, questions, metadata);
}

/**
 * Update poll
 * @param {string} pollId - Poll ID
 * @param {string} pollName - Poll name
 * @param {string} className - Class name
 * @param {Array} questions - Questions
 * @param {Object} metadata - Metadata
 * @returns {Object} Updated poll
 */
function updatePoll(pollId, pollName, className, questions, metadata) {
  return Veritas.TeacherApi.updatePoll(pollId, pollName, className, questions, metadata);
}

/**
 * Delete poll
 * @param {string} pollId - Poll ID
 * @returns {Object} Result
 */
function deletePoll(pollId) {
  return Veritas.TeacherApi.deletePoll(pollId);
}

/**
 * Copy poll
 * @param {string} pollId - Poll ID
 * @param {string} newPollName - Name for the new poll
 * @param {string} targetClassName - Target class
 * @returns {Object} Copied poll
 */
function copyPoll(pollId, newPollName, targetClassName) {
  return Veritas.TeacherApi.copyPoll(pollId, newPollName, targetClassName);
}

/**
 * Get poll for editing
 * @param {string} pollId - Poll ID
 * @returns {Object} Poll data
 */
function getPollForEditing(pollId) {
  return Veritas.TeacherApi.getPollForEditing(pollId);
}

/**
 * Get archived polls
 * @returns {Array} Archived polls
 */
function getArchivedPolls() {
  return Veritas.TeacherApi.getArchivedPolls();
}

// =============================================================================
// TEACHER API - ROSTER MANAGEMENT
// =============================================================================

/**
 * Get roster manager data
 * @param {string} className - Class name
 * @returns {Object} Roster data
 */
function getRosterManagerData(className) {
  return Veritas.TeacherApi.getRosterManagerData(className);
}

/**
 * Save roster
 * @param {string} className - Class name
 * @param {Array} roster - Roster array
 * @returns {Object} Result
 */
function saveRoster(className, roster) {
  return Veritas.TeacherApi.saveRoster(className, roster);
}

/**
 * Bulk add students to roster
 * @param {string} className - Class name
 * @param {Array} students - Students array
 * @returns {Object} Result
 */
function bulkAddStudentsToRoster(className, students) {
  return Veritas.TeacherApi.bulkAddStudentsToRoster(className, students);
}

/**
 * Rename class
 * @param {string} oldClassName - Old name
 * @param {string} newClassName - New name
 * @returns {Object} Result
 */
function renameClass(oldClassName, newClassName) {
  return Veritas.TeacherApi.renameClass(oldClassName, newClassName);
}

/**
 * Delete class
 * @param {string} className - Class name
 * @returns {Object} Result
 */
function deleteClassRecord(className) {
  return Veritas.TeacherApi.deleteClassRecord(className);
}

/**
 * Create class
 * @param {string} className - Class name
 * @param {string} description - Description
 * @returns {Object} Result
 */
function createClassRecord(className, description) {
  return Veritas.TeacherApi.createClassRecord(className, description);
}

// =============================================================================
// TEACHER API - LIVE POLL SESSION CONTROL
// =============================================================================

/**
 * Start poll
 * @param {string} pollId - Poll ID
 * @returns {Object} Session state
 */
function startPoll(pollId) {
  return Veritas.TeacherApi.startPoll(pollId);
}

/**
 * Next question
 * @returns {Object} Session state
 */
function nextQuestion() {
  return Veritas.TeacherApi.nextQuestion();
}

/**
 * Previous question
 * @returns {Object} Session state
 */
function previousQuestion() {
  return Veritas.TeacherApi.previousQuestion();
}

/**
 * Stop poll (pause)
 * @returns {Object} Session state
 */
function stopPoll() {
  return Veritas.TeacherApi.stopPoll();
}

/**
 * Resume poll
 * @returns {Object} Session state
 */
function resumePoll() {
  return Veritas.TeacherApi.resumePoll();
}

/**
 * Close poll
 * @returns {Object} Session state
 */
function closePoll() {
  return Veritas.TeacherApi.closePoll();
}

/**
 * Reveal results to students
 * @returns {Object} Session state
 */
function revealResultsToStudents() {
  return Veritas.TeacherApi.revealResultsToStudents();
}

/**
 * Hide results from students
 * @returns {Object} Session state
 */
function hideResultsFromStudents() {
  return Veritas.TeacherApi.hideResultsFromStudents();
}

/**
 * Reset live question
 * @param {string} pollId - The poll ID
 * @param {number} questionIndex - The question index
 * @param {boolean} clearResponses - Whether to clear existing responses
 * @returns {Object} Session state
 */
function resetLiveQuestion(pollId, questionIndex, clearResponses) {
  return Veritas.TeacherApi.resetLiveQuestion(pollId, questionIndex, clearResponses);
}

// =============================================================================
// TEACHER API - SECURE ASSESSMENT CONTROL
// =============================================================================

/**
 * Start individual timed session
 * @param {string} pollId - Poll ID
 * @returns {Object} Session state
 */
function startIndividualTimedSession(pollId) {
  return Veritas.TeacherApi.startIndividualTimedSession(pollId);
}

/**
 * End individual timed session
 * @param {string} pollId - Poll ID
 * @returns {Object} Result
 */
function endIndividualTimedSession(pollId) {
  return Veritas.TeacherApi.endIndividualTimedSession(pollId);
}

/**
 * Get individual timed session state
 * @param {string} token - Session token
 * @returns {Object} Session state
 */
function getIndividualTimedSessionState(token) {
  return Veritas.StudentApi.getIndividualTimedSessionState(token);
}

/**
 * Get individual timed session teacher view
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @returns {Object} Teacher view data
 */
function getIndividualTimedSessionTeacherView(pollId, sessionId) {
  return Veritas.TeacherApi.getIndividualTimedSessionTeacherView(pollId, sessionId);
}

/**
 * Adjust time for student
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {string} studentEmail - Student email
 * @param {number} adjustmentMinutes - Time adjustment
 * @returns {Object} Result
 */
function adjustSecureAssessmentTime(pollId, sessionId, studentEmail, adjustmentMinutes) {
  return Veritas.TeacherApi.adjustSecureAssessmentTime(pollId, sessionId, studentEmail, adjustmentMinutes);
}

/**
 * Adjust time for multiple students
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {Array} studentEmails - Student emails
 * @param {number} adjustmentMinutes - Minutes to add
 * @returns {Object} Result
 */
function adjustSecureAssessmentTimeBulk(pollId, sessionId, studentEmails, adjustmentMinutes) {
  return Veritas.TeacherApi.adjustSecureAssessmentTimeBulk(pollId, sessionId, studentEmails, adjustmentMinutes);
}

/**
 * Adjust time for all students
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {number} adjustmentMinutes - Time adjustment
 * @returns {Object} Result
 */
function adjustSecureAssessmentTimeForAll(pollId, sessionId, adjustmentMinutes) {
  return Veritas.TeacherApi.adjustSecureAssessmentTimeForAll(pollId, sessionId, adjustmentMinutes);
}

/**
 * Pause student assessment
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
function pauseSecureAssessmentStudent(pollId, sessionId, studentEmail) {
  return Veritas.TeacherApi.pauseSecureAssessmentStudent(pollId, sessionId, studentEmail);
}

/**
 * Resume student assessment
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
function resumeSecureAssessmentStudent(pollId, sessionId, studentEmail) {
  return Veritas.TeacherApi.resumeSecureAssessmentStudent(pollId, sessionId, studentEmail);
}

/**
 * Force submit student assessment
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
function forceSubmitSecureAssessmentStudent(pollId, sessionId, studentEmail) {
  return Veritas.TeacherApi.forceSubmitSecureAssessmentStudent(pollId, sessionId, studentEmail);
}

/**
 * Approve unlock request
 * @param {string} studentEmail - Student email
 * @param {string} pollId - Poll ID
 * @param {number} expectedLockVersion - Lock version for optimistic check
 * @returns {Object} Result
 */
function teacherApproveUnlock(studentEmail, pollId, expectedLockVersion) {
  return Veritas.TeacherApi.teacherApproveUnlock(studentEmail, pollId, expectedLockVersion);
}

/**
 * Block student
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @param {string} reason - Reason
 * @returns {Object} Result
 */
function teacherBlockStudent(pollId, studentEmail, reason) {
  return Veritas.TeacherApi.teacherBlockStudent(pollId, studentEmail, reason);
}

/**
 * Unblock student
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
function teacherUnblockStudent(pollId, studentEmail) {
  return Veritas.TeacherApi.teacherUnblockStudent(pollId, studentEmail);
}

// =============================================================================
// TEACHER API - SETUP & UTILITIES
// =============================================================================

/**
 * Setup sheet (one-time initialization)
 * @returns {Object} Result
 */
function setupSheet() {
  return Veritas.TeacherApi.setupSheet();
}

/**
 * Safe UI alert
 * @param {string} message - Message
 * @param {string} title - Title
 * @returns {boolean} Success
 */
function safeUiAlert(message, title) {
  return Veritas.TeacherApi.safeUiAlert(message, title);
}

// =============================================================================
// STUDENT API - LIVE POLL OPERATIONS
// =============================================================================

/**
 * Get student poll status
 * @param {string} token - Session token
 * @param {Object} context - Client context
 * @returns {Object} Poll status
 */
function getStudentPollStatus(token, context) {
  return Veritas.StudentApi.getStudentPollStatus(token, context);
}

/**
 * Submit live poll answer
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @param {string} answerText - Answer
 * @param {string} token - Session token
 * @param {string} confidenceLevel - Confidence level
 * @returns {Object} Result
 */
function submitLivePollAnswer(pollId, questionIndex, answerText, token, confidenceLevel) {
  return Veritas.StudentApi.submitLivePollAnswer(pollId, questionIndex, answerText, token, confidenceLevel);
}

// =============================================================================
// STUDENT API - SECURE ASSESSMENT OPERATIONS
// =============================================================================

/**
 * Begin individual timed attempt
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {string} token - Session token
 * @param {Object} options - Options (e.g., access code)
 * @returns {Object} Initial state
 */
function beginIndividualTimedAttempt(pollId, sessionId, token, options) {
  return Veritas.StudentApi.beginIndividualTimedAttempt(pollId, sessionId, token, options);
}

/**
 * Get individual timed question
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {string} token - Session token
 * @returns {Object} Question data
 */
function getIndividualTimedQuestion(pollId, sessionId, token) {
  return Veritas.StudentApi.getIndividualTimedQuestion(pollId, sessionId, token);
}

/**
 * Submit individual timed answer
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Session ID
 * @param {number} questionIndex - Question index
 * @param {string} answerText - Answer
 * @param {string} token - Session token
 * @param {string} confidenceLevel - Confidence level
 * @returns {Object} Result
 */
function submitIndividualTimedAnswer(pollId, sessionId, questionIndex, answerText, token, confidenceLevel) {
  return Veritas.StudentApi.submitIndividualTimedAnswer(pollId, sessionId, questionIndex, answerText, token, confidenceLevel);
}

/**
 * Report student violation
 * @param {string} pollId - Poll ID
 * @param {string} token - Session token
 * @param {string} violationType - Violation type
 * @returns {Object} Result
 */
function reportStudentViolation(pollId, token, violationType) {
  return Veritas.StudentApi.reportStudentViolation(pollId, token, violationType);
}

/**
 * Student confirm fullscreen
 * @param {number} expectedLockVersion - Expected lock version to validate unlock
 * @param {string} token - Session token
 * @returns {Object} Result
 */
function studentConfirmFullscreen(expectedLockVersion, token) {
  return Veritas.StudentApi.studentConfirmFullscreen(expectedLockVersion, token);
}

/**
 * Get student proctor state (violations, fullscreen status)
 * @param {string} token - Session token
 * @returns {Object} Proctor state
 */
function getStudentProctorState(token) {
  return Veritas.StudentApi.getStudentProctorState(token);
}

// =============================================================================
// ADDITIONAL UTILITY FUNCTIONS
// =============================================================================

/**
 * Upload image to Drive for poll questions
 * @param {string} dataUrl - Base64 encoded image data
 * @param {string} fileName - File name
 * @returns {Object} {success: true, fileId, proxyUrl} or {success: false, error}
 */
function uploadImageToDrive(dataUrl, fileName) {
  return Veritas.TeacherApi.uploadImageToDrive(dataUrl, fileName);
}

/**
 * Get secure assessment book view for a poll
 * @param {string} pollId - Poll ID
 * @returns {Object} Book view data
 */
function getSecureAssessmentBookView(pollId) {
  return Veritas.TeacherApi.getSecureAssessmentBookView(pollId);
}

/**
 * Pause poll when timer expires (automatic)
 * @returns {Object} Result
 */
function pausePollForTimerExpiry() {
  return Veritas.TeacherApi.pausePollForTimerExpiry();
}

/**
 * Reset a specific student's response to a question
 * @param {string} studentEmail - Student email
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @returns {Object} Result
 */
function resetStudentResponse(studentEmail, pollId, questionIndex) {
  return Veritas.TeacherApi.resetStudentResponse(studentEmail, pollId, questionIndex);
}

/**
 * End current question and reveal results to students
 * @returns {Object} Result
 */
function endQuestionAndRevealResults() {
  return Veritas.TeacherApi.endQuestionAndRevealResults();
}

/**
 * Send poll link to entire class via email (DEPRECATED - not implemented)
 * @param {string} className - Class name
 * @returns {Object} Error response
 */
function sendPollLinkToClass(className) {
  return {
    success: false,
    error: 'Email distribution feature not implemented. Please use the "View Links" button to access individual student links.'
  };
}

// =============================================================================
// UTILITIES & DIAGNOSTICS
// =============================================================================

/**
 * Clear all caches (diagnostic function for troubleshooting)
 * @returns {Object} Success result
 */
function clearAllCaches() {
  return Veritas.TeacherApi.clearAllCaches();
}

// =============================================================================
// SUMMARY
// =============================================================================
//
// Total Exposed Functions: 80
//
// Routing: 2 functions
// - doGet, include
//
// Teacher API: 59 functions
// - Dashboard & Core: 3 (getTeacherDashboardData, getPollEditorHtml, getStudentLinksForClass)
// - Analytics: 7 (getAnalyticsData, getPostPollAnalytics, etc.)
// - Poll Management: 6 (createNewPoll, updatePoll, deletePoll, etc.)
// - Roster Management: 6 (getRosterManagerData, saveRoster, etc.)
// - Live Poll Control: 9 (startPoll, nextQuestion, stopPoll, etc.)
// - Secure Assessment: 15 (startIndividualTimedSession, adjustTime, etc.)
// - Setup & Utilities: 3 (setupSheet, safeUiAlert, clearAllCaches)
//
// Student API: 7 functions
// - Live Poll: 2 (getStudentPollStatus, submitLivePollAnswer)
// - Secure Assessment: 5 (beginIndividualTimedAttempt, getQuestion, submit, etc.)
//
// =============================================================================
