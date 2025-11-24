// =============================================================================
// VERITAS LIVE POLL - TEACHER API MODULE
// =============================================================================
// Purpose: Teacher-facing server methods with security enforcement
// Dependencies: Config, DataAccess, Models, Routing, TokenManager, CacheManager
// Phase: 2D - API/Routing Layer
// =============================================================================

// Defensive namespace initialization (required for Google Apps Script load order)
var Veritas = Veritas || {};
Veritas.TeacherApi = Veritas.TeacherApi || {};

// =============================================================================
// SECURITY HELPERS
// =============================================================================

/**
 * Assert that the current user is a teacher
 * @throws {Error} If user is not a teacher
 * @returns {string} Teacher email
 */
Veritas.TeacherApi.assertTeacher = function() {
  var userEmail = (Session.getActiveUser().getEmail() || '').trim();
  if (!Veritas.Routing.isTeacherEmail(userEmail)) {
    throw new Error('Unauthorized: Teacher access required');
  }
  return userEmail;
};

/**
 * Wrap a function with teacher authentication
 * @param {Function} fn - Function to wrap
 * @returns {Function} Wrapped function
 */
Veritas.TeacherApi.withTeacherAuth = function(fn) {
  return function() {
    Veritas.TeacherApi.assertTeacher();
    return fn.apply(this, arguments);
  };
};

// =============================================================================
// DASHBOARD & CORE DATA
// =============================================================================

/**
 * Get teacher dashboard data (classes and polls)
 * @returns {Object} Dashboard data {classes, polls}
 */
Veritas.TeacherApi.getTeacherDashboardData = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    var classes = Veritas.Models.Poll.getClasses();

    // Return the full poll payload so the teacher dashboard can render
    // question details, secure assessment metadata, and existing session
    // history. Previously this endpoint trimmed the poll objects down to a
    // small subset of fields, which meant the UI could not display question
    // counts, secure access codes, availability windows, or other metadata –
    // and starting a live poll lacked the poll context it needed. The
    // dashboard relies on the full poll object (including `questions` and
    // `secureSettings`) to show those details and launch sessions reliably.
    var polls = DataAccess.polls.getAll().map(function(poll) {
      return {
        pollId: poll.pollId,
        pollName: poll.pollName,
        className: poll.className,
        questions: poll.questions,
        questionCount: poll.questions.length,
        createdAt: poll.createdAt || '',
        updatedAt: poll.updatedAt || '',
        sessionType: poll.sessionType,
        timeLimitMinutes: poll.timeLimitMinutes,
        accessCode: poll.accessCode || '',
        availableFrom: poll.availableFrom || '',
        dueBy: poll.dueBy || '',
        missionControlState: poll.missionControlState || '',
        secureSettings: poll.secureSettings || {}
      };
    });

    polls.sort(function(a, b) {
      var aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      var bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });

    Logger.log('Dashboard data loaded', {
      classCount: classes.length,
      pollCount: polls.length
    });

    return {
      classes: classes,
      polls: polls
    };
  })();
};

/**
 * Get poll editor HTML template
 * @param {string} className - Class name to pre-populate
 * @returns {string} HTML content for poll editor
 */
Veritas.TeacherApi.getPollEditorHtml = function(className) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    var template = HtmlService.createTemplateFromFile('PollEditor.html');
    template.className = className || '';
    return template.evaluate().getContent();
  })();
};

/**
 * Get student links for a class (with tokens)
 * @param {string} className - Class name
 * @returns {Object} {success: true, links: [{name, email, url, fullUrl, hasActiveLink}]}
 */
Veritas.TeacherApi.getStudentLinksForClass = function(className) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    var cacheKey = Veritas.Config.CLASS_LINKS_CACHE_PREFIX + encodeURIComponent(className);

    return CacheManager.get(cacheKey, function() {
      var roster = DataAccess.roster.getByClass(className) || [];
      var baseUrl = ScriptApp.getService().getUrl();
      var snapshot = TokenManager.getActiveSnapshot();

      var links = roster.map(function(student) {
        var tokenInfo = TokenManager.getTokenFromSnapshot(snapshot, student.email, className);
        if (tokenInfo) {
          var fullUrl = baseUrl + '?token=' + tokenInfo.token;
          return {
            name: student.name,
            email: student.email,
            url: tokenInfo.data.shortUrl || fullUrl,
            fullUrl: fullUrl,
            hasActiveLink: true
          };
        }

        return {
          name: student.name,
          email: student.email,
          url: 'No active link',
          fullUrl: '',
          hasActiveLink: false
        };
      });

      return { success: true, links: links };
    }, CacheManager.CACHE_TIMES.SHORT);
  })();
};

// =============================================================================
// ANALYTICS & INSIGHTS
// =============================================================================

/**
 * Get comprehensive analytics data for the Analytics Hub
 * @param {Object} filters - Filter options {className, dateFrom, dateTo}
 * @returns {Object} Analytics data with aggregates
 */
Veritas.TeacherApi.getAnalyticsData = function(filters) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    filters = filters || {};
    var cacheKey = 'ANALYTICS_DATA_' + JSON.stringify(filters);

    return CacheManager.get(cacheKey, function() {
      var polls = DataAccess.polls.getAll();
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var responsesSheet = ss.getSheetByName('Responses');
      var responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];

      // Filter polls by class and date range if specified
      var filteredPolls = polls;
      if (filters.className && filters.className !== 'all') {
        filteredPolls = filteredPolls.filter(function(p) {
          return p.className === filters.className;
        });
      }
      if (filters.dateFrom || filters.dateTo) {
        filteredPolls = filteredPolls.filter(function(p) {
          var pollDate = new Date(p.updatedAt || p.createdAt);
          if (filters.dateFrom && pollDate < new Date(filters.dateFrom)) return false;
          if (filters.dateTo && pollDate > new Date(filters.dateTo)) return false;
          return true;
        });
      }

      // Build response maps
      var responsesByPoll = buildResponseMaps_(responseValues);

      // Compute aggregates
      var sessionAggregates = computeSessionAggregates_(filteredPolls, responsesByPoll);
      var itemAggregates = computeItemAggregates_(filteredPolls, responsesByPoll);
      var studentAggregates = computeStudentAggregates_(filteredPolls, responsesByPoll);
      var topicAggregates = computeTopicAggregates_(filteredPolls, responsesByPoll);

      // Compute KPIs
      var kpis = computeKPIs_(sessionAggregates, studentAggregates);

      Logger.log('Analytics data computed', {
        sessions: sessionAggregates.length,
        items: itemAggregates.length,
        students: Object.keys(studentAggregates).length
      });

      return {
        kpis: kpis,
        sessionAggregates: sessionAggregates,
        itemAggregates: itemAggregates,
        studentAggregates: studentAggregates,
        topicAggregates: topicAggregates,
        filters: filters
      };
    }, CacheManager.CACHE_TIMES.SHORT);
  })();
};

/**
 * Get post-poll psychometric analysis
 * @param {string} pollId - Poll ID
 * @returns {Object} Psychometric analysis data
 */
Veritas.TeacherApi.getPostPollAnalytics = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Analytics.getPostPollAnalytics(pollId);
  })();
};

/**
 * Get enhanced post-poll analytics with interpretations
 * @param {string} pollId - Poll ID
 * @returns {Object} Enhanced analytics with interpretations
 */
Veritas.TeacherApi.getEnhancedPostPollAnalytics = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Analytics.getEnhancedPostPollAnalytics(pollId);
  })();
};

/**
 * Get student insights for a specific student
 * @param {string} studentEmail - Student email
 * @param {string} className - Class name (optional filter)
 * @returns {Object} Student insights data
 */
Veritas.TeacherApi.getStudentInsights = function(studentEmail, className) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Analytics.getStudentInsights(studentEmail, className);
  })();
};

/**
 * Get student historical analytics
 * @param {string} studentEmail - Student email
 * @returns {Object} Historical analytics data
 */
Veritas.TeacherApi.getStudentHistoricalAnalytics = function(studentEmail) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Analytics.getStudentHistoricalAnalytics(studentEmail);
  })();
};

/**
 * Get dashboard summary data
 * @returns {Object} Dashboard summary
 */
Veritas.TeacherApi.getDashboardSummary = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Analytics.getDashboardSummary();
  })();
};

/**
 * Get live poll data for monitoring
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @returns {Object} Live poll data
 */
Veritas.TeacherApi.getLivePollData = function(pollId, questionIndex) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Analytics.getLivePollData(pollId, questionIndex);
  })();
};

// =============================================================================
// POLL MANAGEMENT (Security Wrappers)
// =============================================================================

/**
 * Create new poll
 * @param {string} pollName - Poll name
 * @param {string} className - Class name
 * @param {Array} questions - Questions array
 * @param {Object} metadata - Poll metadata
 * @returns {Object} Created poll
 */
Veritas.TeacherApi.createNewPoll = function(pollName, className, questions, metadata) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.createNewPoll(pollName, className, questions, metadata);
  })();
};

/**
 * Update existing poll
 * @param {string} pollId - Poll ID
 * @param {string} pollName - Poll name
 * @param {string} className - Class name
 * @param {Array} questions - Questions array
 * @param {Object} metadata - Poll metadata
 * @returns {Object} Updated poll
 */
Veritas.TeacherApi.updatePoll = function(pollId, pollName, className, questions, metadata) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.updatePoll(pollId, pollName, className, questions, metadata);
  })();
};

/**
 * Delete poll
 * @param {string} pollId - Poll ID
 * @returns {Object} Success result
 */
Veritas.TeacherApi.deletePoll = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.deletePoll(pollId);
  })();
};

/**
 * Copy poll to another class
 * @param {string} pollId - Poll ID to copy
 * @param {string} newPollName - Name for the new poll
 * @param {string} targetClassName - Target class name
 * @returns {Object} Copied poll
 */
Veritas.TeacherApi.copyPoll = function(pollId, newPollName, targetClassName) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.copyPoll(pollId, newPollName, targetClassName);
  })();
};

/**
 * Get poll for editing
 * @param {string} pollId - Poll ID
 * @returns {Object} Poll data
 */
Veritas.TeacherApi.getPollForEditing = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.getPollForEditing(pollId);
  })();
};

/**
 * Get archived polls
 * @returns {Array} Archived polls
 */
Veritas.TeacherApi.getArchivedPolls = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.getArchivedPolls();
  })();
};

// =============================================================================
// ROSTER MANAGEMENT (Security Wrappers)
// =============================================================================

/**
 * Get roster manager data
 * @param {string} className - Class name
 * @returns {Object} Roster manager data
 */
Veritas.TeacherApi.getRosterManagerData = function(className) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.getRosterManagerData(className);
  })();
};

/**
 * Save roster for a class
 * @param {string} className - Class name
 * @param {Array} roster - Roster array [{name, email}]
 * @returns {Object} Success result
 */
Veritas.TeacherApi.saveRoster = function(className, roster) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.saveRoster(className, roster);
  })();
};

/**
 * Bulk add students to roster
 * @param {string} className - Class name
 * @param {Array} students - Students array [{name, email}]
 * @returns {Object} Result with counts
 */
Veritas.TeacherApi.bulkAddStudentsToRoster = function(className, students) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.bulkAddStudentsToRoster(className, students);
  })();
};

/**
 * Rename a class
 * @param {string} oldClassName - Old class name
 * @param {string} newClassName - New class name
 * @returns {Object} Success result
 */
Veritas.TeacherApi.renameClass = function(oldClassName, newClassName) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.renameClass(oldClassName, newClassName);
  })();
};

/**
 * Delete a class
 * @param {string} className - Class name
 * @returns {Object} Success result
 */
Veritas.TeacherApi.deleteClassRecord = function(className) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.deleteClassRecord(className);
  })();
};

/**
 * Create a new class
 * @param {string} className - Class name
 * @param {string} description - Class description
 * @returns {Object} Success result
 */
Veritas.TeacherApi.createClassRecord = function(className, description) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Poll.createClassRecord(className, description);
  })();
};

// =============================================================================
// SESSION MANAGEMENT (Security Wrappers)
// =============================================================================

/**
 * Start a live poll session
 * @param {string} pollId - Poll ID
 * @returns {Object} Session state
 */
Veritas.TeacherApi.startPoll = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.startPoll(pollId);
  })();
};

/**
 * Advance to next question
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.nextQuestion = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.nextQuestion();
  })();
};

/**
 * Go to previous question
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.previousQuestion = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.previousQuestion();
  })();
};

/**
 * Stop poll (pause)
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.stopPoll = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.stopPoll();
  })();
};

/**
 * Resume poll
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.resumePoll = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.resumePoll();
  })();
};

/**
 * Close poll completely
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.closePoll = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.closePoll();
  })();
};

/**
 * Reveal results to students
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.revealResultsToStudents = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.revealResultsToStudents();
  })();
};

/**
 * Hide results from students
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.hideResultsFromStudents = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.hideResultsFromStudents();
  })();
};

/**
 * Reset current live question
 * @param {string} pollId - The poll ID
 * @param {number} questionIndex - The question index
 * @param {boolean} clearResponses - Whether to clear existing responses
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.resetLiveQuestion = function(pollId, questionIndex, clearResponses) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.resetLiveQuestion(pollId, questionIndex, clearResponses);
  })();
};

/**
 * End current question and reveal results
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.endQuestionAndRevealResults = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();
    return Veritas.Models.Session.endQuestionAndRevealResults();
  })();
};

/**
 * Pause poll for timer expiry
 * @returns {Object} Updated session state
 */
Veritas.TeacherApi.pausePollForTimerExpiry = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();
    return Veritas.Models.Session.pausePollForTimerExpiry();
  })();
};

/**
 * Reset student response
 * @param {string} studentEmail - Student email
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @returns {Object} Result
 */
Veritas.TeacherApi.resetStudentResponse = function(studentEmail, pollId, questionIndex) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();
    return Veritas.Models.Session.resetStudentResponse(studentEmail, pollId, questionIndex);
  })();
};

// =============================================================================
// SECURE ASSESSMENT MANAGEMENT (Security Wrappers)
// =============================================================================

/**
 * Start individual timed session
 * @param {string} pollId - Poll ID
 * @returns {Object} Session state
 */
Veritas.TeacherApi.startIndividualTimedSession = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.startIndividualTimedSession(pollId);
  })();
};

/**
 * End individual timed session
 * @param {string} pollId - Poll ID
 * @returns {Object} Result
 */
Veritas.TeacherApi.endIndividualTimedSession = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.endIndividualTimedSession(pollId);
  })();
};

/**
 * Get individual timed session state
 * @param {string} pollId - Poll ID
 * @returns {Object} Session state
 */
Veritas.TeacherApi.getIndividualTimedSessionState = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.getIndividualTimedSessionState(pollId);
  })();
};

/**
 * Get teacher view for individual timed session
 * @param {string} pollId - Poll ID
 * @returns {Object} Teacher view data with proctoring info
 */
Veritas.TeacherApi.getIndividualTimedSessionTeacherView = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.getIndividualTimedSessionTeacherView(pollId);
  })();
};

/**
 * Adjust time for a student
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @param {number} adjustmentMinutes - Time adjustment in minutes
 * @returns {Object} Result
 */
Veritas.TeacherApi.adjustSecureAssessmentTime = function(pollId, studentEmail, adjustmentMinutes) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.adjustSecureAssessmentTime(pollId, studentEmail, adjustmentMinutes);
  })();
};

/**
 * Adjust time for multiple students
 * @param {string} pollId - Poll ID
 * @param {Array} adjustments - Array of {studentEmail, adjustmentMinutes}
 * @returns {Object} Result with counts
 */
Veritas.TeacherApi.adjustSecureAssessmentTimeBulk = function(pollId, adjustments) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.adjustSecureAssessmentTimeBulk(pollId, adjustments);
  })();
};

/**
 * Adjust time for all students
 * @param {string} pollId - Poll ID
 * @param {number} adjustmentMinutes - Time adjustment in minutes
 * @returns {Object} Result with count
 */
Veritas.TeacherApi.adjustSecureAssessmentTimeForAll = function(pollId, adjustmentMinutes) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.adjustSecureAssessmentTimeForAll(pollId, adjustmentMinutes);
  })();
};

/**
 * Pause student's secure assessment
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
Veritas.TeacherApi.pauseSecureAssessmentStudent = function(pollId, studentEmail) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.pauseSecureAssessmentStudent(pollId, studentEmail);
  })();
};

/**
 * Resume student's secure assessment
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
Veritas.TeacherApi.resumeSecureAssessmentStudent = function(pollId, studentEmail) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.resumeSecureAssessmentStudent(pollId, studentEmail);
  })();
};

/**
 * Force submit student's secure assessment
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
Veritas.TeacherApi.forceSubmitSecureAssessmentStudent = function(pollId, studentEmail) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.forceSubmitSecureAssessmentStudent(pollId, studentEmail);
  })();
};

/**
 * Approve unlock request from student
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
Veritas.TeacherApi.teacherApproveUnlock = function(pollId, studentEmail) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.teacherApproveUnlock(pollId, studentEmail);
  })();
};

/**
 * Block student from assessment
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @param {string} reason - Reason for blocking
 * @returns {Object} Result
 */
Veritas.TeacherApi.teacherBlockStudent = function(pollId, studentEmail, reason) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.teacherBlockStudent(pollId, studentEmail, reason);
  })();
};

/**
 * Unblock student from assessment
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @returns {Object} Result
 */
Veritas.TeacherApi.teacherUnblockStudent = function(pollId, studentEmail) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    // Delegate to Models layer
    return Veritas.Models.Session.teacherUnblockStudent(pollId, studentEmail);
  })();
};

// =============================================================================
// SETUP & UTILITIES
// =============================================================================

/**
 * Upload image to Drive
 * @param {string} dataUrl - Base64 data URL
 * @param {string} fileName - File name
 * @returns {Object} Result with fileId
 */
Veritas.TeacherApi.uploadImageToDrive = function(dataUrl, fileName) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();
    return Veritas.Models.Poll.uploadImageToDrive(dataUrl, fileName);
  })();
};

/**
 * Get secure assessment book view
 * @param {string} pollId - Poll ID
 * @returns {Object} Book view data
 */
Veritas.TeacherApi.getSecureAssessmentBookView = function(pollId) {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();
    return Veritas.Models.Poll.getSecureAssessmentBookView(pollId);
  })();
};

/**
 * Clear all caches (diagnostic function for troubleshooting)
 * @returns {Object} Success result
 */
Veritas.TeacherApi.clearAllCaches = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();
    CacheManager.invalidate(['ALL_POLLS_DATA', 'CLASSES_LIST', 'LIVE_POLL_STATUS']);
    return { success: true, message: 'All caches cleared. Please refresh the page.' };
  })();
};

/**
 * UI alert helper for spreadsheet operations
 * @param {string} message - Alert message
 * @param {string} title - Alert title (optional)
 * @returns {boolean} True if alert succeeded
 */
Veritas.TeacherApi.safeUiAlert = function(message, title) {
  try {
    var ui = SpreadsheetApp.getUi();
    if (!ui || typeof ui.alert !== 'function') {
      Logger.log('Spreadsheet UI unavailable for alert', {
        message: message,
        title: title || null
      });
      return false;
    }

    if (title) {
      ui.alert(title, message, ui.ButtonSet.OK);
    } else {
      ui.alert(message);
    }
    return true;
  } catch (err) {
    Logger.log('Spreadsheet UI alert failed', {
      message: message,
      title: title || null,
      error: err.toString()
    });
    return false;
  }
};

/**
 * One-time sheet setup
 * Creates all required sheets and headers
 */
Veritas.TeacherApi.setupSheet = function() {
  return withErrorHandling(function() {
    Veritas.TeacherApi.assertTeacher();

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      if (!Veritas.TeacherApi.safeUiAlert(
        'This script must be bound to a Google Sheet.',
        'Veritas Live Poll'
      )) {
        Logger.log('Setup aborted: active spreadsheet not available');
      }
      return;
    }

    var headerConfigs = [
      { name: 'Classes', headers: ['ClassName', 'Description'] },
      { name: 'Rosters', headers: ['ClassName', 'StudentName', 'StudentEmail'] },
      {
        name: 'Polls',
        headers: [
          'PollID', 'PollName', 'ClassName', 'QuestionIndex', 'QuestionDataJSON',
          'CreatedAt', 'UpdatedAt', 'SessionType', 'TimeLimitMinutes', 'AccessCode',
          'AvailableFrom', 'DueBy', 'MissionControlState', 'SecureSettingsJSON'
        ]
      },
      { name: 'LiveStatus', headers: ['ActivePollID', 'ActiveQuestionIndex', 'PollStatus'] },
      {
        name: 'Responses',
        headers: [
          'ResponseID', 'Timestamp', 'PollID', 'QuestionIndex', 'StudentEmail',
          'Answer', 'IsCorrect', 'ConfidenceLevel'
        ]
      },
      {
        name: 'IndividualSessionState',
        headers: [
          'PollID', 'SessionID', 'StudentEmail', 'StudentDisplayName', 'StartTime',
          'EndTime', 'QuestionOrder', 'QuestionOrderSeed', 'CurrentQuestionIndex',
          'IsLocked', 'ViolationCode', 'AnswerOrders', 'AnswerChoiceMap',
          'TimeAdjustmentMinutes', 'PauseDurationMs', 'LastHeartbeatMs',
          'ConnectionHealth', 'ProctorStatus', 'AdditionalMetadataJSON'
        ]
      },
      {
        name: 'AssessmentEvents',
        headers: ['EventID', 'Timestamp', 'PollID', 'SessionID', 'StudentEmail', 'EventType', 'EventPayloadJSON']
      },
      {
        name: 'AssessmentAnalytics',
        headers: ['PollID', 'ComputedAt', 'MetricType', 'MetricName', 'MetricValue', 'DetailsJSON']
      }
    ];

    headerConfigs.forEach(function(config) {
      var sheet = Veritas.TeacherApi.ensureSheet(ss, config.name);
      Veritas.TeacherApi.ensureHeaders(sheet, config.headers);
    });

    DataAccess.liveStatus.set('', -1, 'CLOSED', {
      sessionPhase: 'PRE_LIVE',
      startedAt: null,
      endedAt: null,
      reason: 'SETUP'
    });

    if (!Veritas.TeacherApi.safeUiAlert(
      'Sheet setup complete! All tabs configured with headers.',
      'Veritas Live Poll'
    )) {
      Logger.log('Sheet setup complete! All tabs configured with headers.');
    }

    return { success: true };
  })();
};

/**
 * Ensure sheet exists
 * @param {Spreadsheet} ss - Spreadsheet
 * @param {string} name - Sheet name
 * @returns {Sheet} Sheet object
 */
Veritas.TeacherApi.ensureSheet = function(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
};

/**
 * Ensure headers exist in sheet
 * @param {Sheet} sheet - Sheet object
 * @param {Array} desiredHeaders - Desired headers
 */
Veritas.TeacherApi.ensureHeaders = function(sheet, desiredHeaders) {
  var lastCol = sheet.getLastColumn();
  var existingHeaders = [];
  if (lastCol > 0) {
    existingHeaders = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(value) { return (value || '').toString().trim(); });
  }

  var filteredExisting = existingHeaders.filter(function(value) {
    return value.length > 0;
  });

  if (filteredExisting.length === 0) {
    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
  } else {
    var missingHeaders = desiredHeaders.filter(function(header) {
      return filteredExisting.indexOf(header) === -1;
    });
    if (missingHeaders.length > 0) {
      var startCol = filteredExisting.length + 1;
      sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
      filteredExisting.push.apply(filteredExisting, missingHeaders);
    }
  }
};

// =============================================================================
// LEGACY COMPATIBILITY WRAPPERS
// =============================================================================

/**
 * Legacy wrapper for getTeacherDashboardData
 */
function getTeacherDashboardData() {
  return Veritas.TeacherApi.getTeacherDashboardData();
}

/**
 * Legacy wrapper for getPollEditorHtml
 */
function getPollEditorHtml(className) {
  return Veritas.TeacherApi.getPollEditorHtml(className);
}

/**
 * Legacy wrapper for getStudentLinksForClass
 */
function getStudentLinksForClass(className) {
  return Veritas.TeacherApi.getStudentLinksForClass(className);
}

/**
 * Legacy wrapper for getAnalyticsData
 */
function getAnalyticsData(filters) {
  return Veritas.TeacherApi.getAnalyticsData(filters);
}

/**
 * Legacy wrapper for getPostPollAnalytics
 */
function getPostPollAnalytics(pollId) {
  return Veritas.TeacherApi.getPostPollAnalytics(pollId);
}

/**
 * Legacy wrapper for getEnhancedPostPollAnalytics
 */
function getEnhancedPostPollAnalytics(pollId) {
  return Veritas.TeacherApi.getEnhancedPostPollAnalytics(pollId);
}

/**
 * Legacy wrapper for getStudentInsights
 */
function getStudentInsights(studentEmail, className) {
  return Veritas.TeacherApi.getStudentInsights(studentEmail, className);
}

/**
 * Legacy wrapper for getStudentHistoricalAnalytics
 */
function getStudentHistoricalAnalytics(studentEmail) {
  return Veritas.TeacherApi.getStudentHistoricalAnalytics(studentEmail);
}

/**
 * Legacy wrapper for getDashboardSummary
 */
function getDashboardSummary() {
  return Veritas.TeacherApi.getDashboardSummary();
}

/**
 * Legacy wrapper for getLivePollData
 */
function getLivePollData(pollId, questionIndex) {
  return Veritas.TeacherApi.getLivePollData(pollId, questionIndex);
}

/**
 * Legacy wrapper for safeUiAlert
 */
function safeUiAlert(message, title) {
  return Veritas.TeacherApi.safeUiAlert(message, title);
}

/**
 * Legacy wrapper for setupSheet
 */
function setupSheet() {
  return Veritas.TeacherApi.setupSheet();
}
