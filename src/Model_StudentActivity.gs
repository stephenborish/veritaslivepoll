// =============================================================================
// VERITAS LIVE POLL - STUDENT ACTIVITY TRACKING MODULE
// =============================================================================
// Purpose: Track granular student activity during live polls and secure assessments
// Dependencies: Config, DataAccess, Logging, Utils
// =============================================================================

var Veritas = Veritas || {};
Veritas.Models = Veritas.Models || {};
Veritas.Models.StudentActivity = Veritas.Models.StudentActivity || {};

// =============================================================================
// DATA ACCESS LAYER
// =============================================================================

/**
 * Record a student activity event
 * @param {Object} activityData - Activity event data
 * @returns {Object} Result with activityId
 */
Veritas.Models.StudentActivity.recordActivity = function(activityData) {
  return withErrorHandling(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.STUDENT_ACTIVITY);
    Veritas.Data.ensureHeaders(sheet, Veritas.Config.SHEET_HEADERS.STUDENT_ACTIVITY);

    var activityId = 'ACT-' + Utilities.getUuid();
    var timestamp = new Date().toISOString();
    var serverProcessedAt = Date.now();

    // Validate required fields
    if (!activityData.pollId || !activityData.studentEmail || !activityData.eventType) {
      throw new Error('Missing required activity fields: pollId, studentEmail, eventType');
    }

    // Build event data JSON
    var eventDataJson = JSON.stringify(activityData.eventData || {});

    var row = [
      activityId,
      timestamp,
      activityData.pollId,
      activityData.sessionId || '',
      activityData.questionIndex !== undefined ? activityData.questionIndex : '',
      activityData.studentEmail,
      activityData.eventType,
      eventDataJson,
      activityData.clientTimestamp || timestamp,
      serverProcessedAt
    ];

    sheet.appendRow(row);

    return {
      success: true,
      activityId: activityId,
      timestamp: timestamp
    };
  })();
};

/**
 * Batch record multiple activity events (for performance)
 * @param {Array<Object>} activities - Array of activity events
 * @returns {Object} Result with count
 */
Veritas.Models.StudentActivity.recordActivitiesBatch = function(activities) {
  return withErrorHandling(function() {
    if (!Array.isArray(activities) || activities.length === 0) {
      return { success: true, count: 0 };
    }

    var ss = Veritas.Data.getSpreadsheet();
    var sheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.STUDENT_ACTIVITY);
    Veritas.Data.ensureHeaders(sheet, Veritas.Config.SHEET_HEADERS.STUDENT_ACTIVITY);

    var serverProcessedAt = Date.now();
    var rows = [];

    activities.forEach(function(activityData) {
      if (!activityData.pollId || !activityData.studentEmail || !activityData.eventType) {
        return; // Skip invalid entries
      }

      var activityId = 'ACT-' + Utilities.getUuid();
      var timestamp = new Date().toISOString();
      var eventDataJson = JSON.stringify(activityData.eventData || {});

      rows.push([
        activityId,
        timestamp,
        activityData.pollId,
        activityData.sessionId || '',
        activityData.questionIndex !== undefined ? activityData.questionIndex : '',
        activityData.studentEmail,
        activityData.eventType,
        eventDataJson,
        activityData.clientTimestamp || timestamp,
        serverProcessedAt
      ]);
    });

    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    return {
      success: true,
      count: rows.length
    };
  })();
};

/**
 * Get activity events for a specific poll and student
 * @param {string} pollId - Poll ID
 * @param {string} studentEmail - Student email
 * @param {number} questionIndex - Optional question index filter
 * @returns {Array<Object>} Activity events
 */
Veritas.Models.StudentActivity.getActivitiesForStudent = function(pollId, studentEmail, questionIndex) {
  return withErrorHandling(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.STUDENT_ACTIVITY);

    if (!sheet) {
      return [];
    }

    var values = Veritas.Data.getDataRangeValues(sheet);
    var activities = [];

    values.forEach(function(row) {
      // row[2] = PollID, row[5] = StudentEmail, row[4] = QuestionIndex
      if (row[2] === pollId && row[5] === studentEmail) {
        if (questionIndex === undefined || row[4] === questionIndex || row[4] === '') {
          activities.push({
            activityId: row[0],
            timestamp: row[1],
            pollId: row[2],
            sessionId: row[3],
            questionIndex: row[4],
            studentEmail: row[5],
            eventType: row[6],
            eventData: parseJson(row[7], {}),
            clientTimestamp: row[8],
            serverProcessedAt: row[9]
          });
        }
      }
    });

    return activities;
  })();
};

/**
 * Get activity summary for a poll session
 * @param {string} pollId - Poll ID
 * @param {string} sessionId - Optional session ID
 * @returns {Object} Activity summary by student
 */
Veritas.Models.StudentActivity.getActivitySummaryForPoll = function(pollId, sessionId) {
  return withErrorHandling(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.STUDENT_ACTIVITY);

    if (!sheet) {
      return {};
    }

    var values = Veritas.Data.getDataRangeValues(sheet);
    var summaryByStudent = {};

    values.forEach(function(row) {
      // row[2] = PollID, row[3] = SessionID, row[5] = StudentEmail
      if (row[2] === pollId && (!sessionId || row[3] === sessionId)) {
        var studentEmail = row[5];
        var eventType = row[6];
        var eventData = parseJson(row[7], {});
        var questionIndex = row[4];

        if (!summaryByStudent[studentEmail]) {
          summaryByStudent[studentEmail] = {
            studentEmail: studentEmail,
            totalEvents: 0,
            eventsByType: {},
            questionViews: [],
            answerSelections: [],
            focusEvents: [],
            lastActivityAt: null
          };
        }

        summaryByStudent[studentEmail].totalEvents++;
        summaryByStudent[studentEmail].eventsByType[eventType] =
          (summaryByStudent[studentEmail].eventsByType[eventType] || 0) + 1;

        if (eventType === 'QUESTION_VIEW') {
          summaryByStudent[studentEmail].questionViews.push({
            questionIndex: questionIndex,
            timestamp: row[1],
            eventData: eventData
          });
        } else if (eventType === 'ANSWER_SELECTED' || eventType === 'ANSWER_CHANGED') {
          summaryByStudent[studentEmail].answerSelections.push({
            questionIndex: questionIndex,
            timestamp: row[1],
            answer: eventData.answer,
            previousAnswer: eventData.previousAnswer
          });
        } else if (eventType === 'FOCUS_LOST' || eventType === 'FOCUS_GAINED') {
          summaryByStudent[studentEmail].focusEvents.push({
            timestamp: row[1],
            eventType: eventType
          });
        }

        summaryByStudent[studentEmail].lastActivityAt = row[1];
      }
    });

    return summaryByStudent;
  })();
};

/**
 * Get real-time activity metrics for teacher dashboard
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @returns {Object} Real-time metrics
 */
Veritas.Models.StudentActivity.getRealTimeMetrics = function(pollId, questionIndex) {
  return withErrorHandling(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var sheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.STUDENT_ACTIVITY);

    if (!sheet) {
      return {
        activeStudents: 0,
        studentsViewing: 0,
        averageTimeOnQuestion: 0,
        answerChanges: 0,
        focusLossEvents: 0
      };
    }

    var values = Veritas.Data.getDataRangeValues(sheet);
    var now = Date.now();
    var fiveMinutesAgo = now - (5 * 60 * 1000);

    var activeStudents = {};
    var questionViewTimes = {};
    var answerChanges = 0;
    var focusLossEvents = 0;

    values.forEach(function(row) {
      if (row[2] === pollId && row[4] === questionIndex) {
        var studentEmail = row[5];
        var eventType = row[6];
        var timestamp = new Date(row[1]).getTime();
        var eventData = parseJson(row[7], {});

        // Count active students (activity in last 5 minutes)
        if (timestamp > fiveMinutesAgo) {
          activeStudents[studentEmail] = true;
        }

        // Track question view times
        if (eventType === 'QUESTION_VIEW') {
          if (!questionViewTimes[studentEmail]) {
            questionViewTimes[studentEmail] = {
              startTime: timestamp,
              endTime: timestamp
            };
          }
          questionViewTimes[studentEmail].endTime = timestamp;
        }

        // Count answer changes
        if (eventType === 'ANSWER_CHANGED') {
          answerChanges++;
        }

        // Count focus loss events
        if (eventType === 'FOCUS_LOST') {
          focusLossEvents++;
        }
      }
    });

    // Calculate average time on question
    var totalTime = 0;
    var studentCount = 0;
    Object.keys(questionViewTimes).forEach(function(studentEmail) {
      var viewData = questionViewTimes[studentEmail];
      totalTime += (viewData.endTime - viewData.startTime);
      studentCount++;
    });

    var averageTimeOnQuestion = studentCount > 0 ? Math.round(totalTime / studentCount / 1000) : 0;

    return {
      activeStudents: Object.keys(activeStudents).length,
      studentsViewing: Object.keys(questionViewTimes).length,
      averageTimeOnQuestion: averageTimeOnQuestion,
      answerChanges: answerChanges,
      focusLossEvents: focusLossEvents,
      detailedViewTimes: questionViewTimes
    };
  })();
};

/**
 * Helper to parse JSON safely
 */
function parseJson(jsonStr, defaultValue) {
  if (!jsonStr) return defaultValue;
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return defaultValue;
  }
}
