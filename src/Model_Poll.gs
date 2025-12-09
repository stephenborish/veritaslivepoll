// =============================================================================
// VERITAS LIVE POLL - MODELS: POLL MODULE
// =============================================================================
// Purpose: Poll CRUD operations, question management, roster management
// Dependencies: Config, Logging, DataAccess, Utils
// =============================================================================

// Defensive namespace initialization (required for Google Apps Script load order)
var Veritas = Veritas || {};
Veritas.Models = Veritas.Models || {};
Veritas.Models.Poll = Veritas.Models.Poll || {};

// =============================================================================
// POLL CRUD OPERATIONS
// =============================================================================

/**
 * Create a new poll
 * @param {string} pollName - Name of the poll
 * @param {string} className - Class name
 * @param {Array} questions - Array of question objects
 * @param {Object} metadata - Poll metadata (sessionType, timeLimitMinutes, etc.)
 * @returns {Array} Updated list of all polls
 */
Veritas.Models.Poll.createNewPoll = function(pollName, className, questions, metadata) {
  return withErrorHandling(function() {
    if (!pollName || !className || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid poll data: name, class, and questions are required');
    }

    if (questions.length > 50) {
      throw new Error('Maximum 50 questions per poll');
    }

    var pollId = "P-" + Utilities.getUuid();
    var timestamp = new Date().toISOString();
    var normalizedMetadata = Veritas.Models.Poll.normalizeSecureMetadata(metadata);

    if (Veritas.Models.Poll.isSecureSessionType(normalizedMetadata.sessionType) && !normalizedMetadata.timeLimitMinutes) {
      throw new Error('Time limit is required for Secure Assessments');
    }

    Veritas.Models.Poll.writePollRows(pollId, pollName, className, questions, timestamp, timestamp, normalizedMetadata);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll created', { pollId: pollId, pollName: pollName, questionCount: questions.length });

    return DataAccess.polls.getAll();
  })();
};

/**
 * Update an existing poll
 * @param {string} pollId - Poll ID
 * @param {string} pollName - Poll name
 * @param {string} className - Class name
 * @param {Array} questions - Array of question objects
 * @param {Object} metadata - Poll metadata
 * @returns {Array} Updated list of all polls
 */
Veritas.Models.Poll.updatePoll = function(pollId, pollName, className, questions, metadata) {
  return withErrorHandling(function() {
    if (!pollId || !pollName || !className || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid poll data: poll ID, name, class, and questions are required');
    }

    if (questions.length > 50) {
      throw new Error('Maximum 50 questions per poll');
    }

    Veritas.Models.Poll.removePollRows(pollId);

    var existingPoll = DataAccess.polls.getById(pollId);
    var createdAt = existingPoll && existingPoll.createdAt ? existingPoll.createdAt : new Date().toISOString();
    var updatedAt = new Date().toISOString();

    var normalizedMetadata = Veritas.Models.Poll.normalizeSecureMetadata(metadata || existingPoll || { sessionType: Veritas.Config.SESSION_TYPES.LIVE });
    if (Veritas.Models.Poll.isSecureSessionType(normalizedMetadata.sessionType) && !normalizedMetadata.timeLimitMinutes) {
      throw new Error('Time limit is required for Secure Assessments');
    }

    Veritas.Models.Poll.writePollRows(pollId, pollName, className, questions, createdAt, updatedAt, normalizedMetadata);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll updated', { pollId: pollId, pollName: pollName, questionCount: questions.length });

    return DataAccess.polls.getAll();
  })();
};

/**
 * Delete a poll and all associated responses
 * @param {string} pollId - Poll ID to delete
 * @returns {Array} Updated list of all polls
 */
Veritas.Models.Poll.deletePoll = function(pollId) {
  return withErrorHandling(function() {
    if (!pollId) {
      throw new Error('Poll ID is required');
    }

    Veritas.Models.Poll.removePollRows(pollId);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var responsesSheet = ss.getSheetByName('Responses');

    // NULL CHECK: Responses sheet might not exist yet
    if (responsesSheet) {
      var values = Veritas.Models.Poll.getDataRangeValues(responsesSheet);
      for (var i = values.length - 1; i >= 0; i--) {
        var rowIndex = i + 2;
        if (values[i][2] === pollId) {
          responsesSheet.deleteRow(rowIndex);
        }
      }
    }

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll deleted', { pollId: pollId });

    return DataAccess.polls.getAll();
  })();
};

/**
 * Copy a poll with all questions
 * @param {string} sourcePollId - Source poll ID
 * @param {string} newPollName - Name for the new poll
 * @param {string} targetClassName - Target class name
 * @returns {Object} Success result with new poll ID
 */
Veritas.Models.Poll.copyPoll = function(sourcePollId, newPollName, targetClassName) {
  return withErrorHandling(function() {
    if (!sourcePollId) {
      throw new Error('Source poll ID is required');
    }

    var sourcePoll = DataAccess.polls.getById(sourcePollId);
    if (!sourcePoll) {
      throw new Error('Source poll not found');
    }

    // Use provided name or append " (Copy)" to original name
    var pollName = newPollName && newPollName.trim() !== ''
      ? newPollName.trim()
      : sourcePoll.pollName + ' (Copy)';

    // Use provided class or same class as source
    var className = targetClassName && targetClassName.trim() !== ''
      ? targetClassName.trim()
      : sourcePoll.className;

    // Deep copy all questions (images will be shared via fileIds)
    var copiedQuestions = sourcePoll.questions.map(function(q) {
      return JSON.parse(JSON.stringify(q));
    });

    // Copy session type and time limit from source poll
    var metadata = Veritas.Models.Poll.normalizeSecureMetadata(sourcePoll || {});

    // Create new poll with copied questions
    var newPollId = "P-" + Utilities.getUuid();
    var timestamp = new Date().toISOString();

    Veritas.Models.Poll.writePollRows(newPollId, pollName, className, copiedQuestions, timestamp, timestamp, metadata);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll copied', {
      sourcePollId: sourcePollId,
      newPollId: newPollId,
      newPollName: pollName,
      className: className,
      questionCount: copiedQuestions.length
    });

    return {
      success: true,
      message: 'Poll copied successfully as "' + pollName + '"',
      newPollId: newPollId,
      polls: DataAccess.polls.getAll()
    };
  })();
};

/**
 * Save a new poll (alternative endpoint)
 * @param {Object} pollData - Poll data object
 * @returns {Array} Updated list of all polls
 */
Veritas.Models.Poll.savePollNew = function(pollData) {
  return withErrorHandling(function() {
    var pollName = pollData.pollName;
    var className = pollData.className;
    var questions = pollData.questions;

    if (!pollName || !className || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid poll data: name, class, and questions are required');
    }

    if (questions.length > 50) {
      throw new Error('Maximum 50 questions per poll');
    }

    var pollId = "P-" + Utilities.getUuid();
    var timestamp = new Date().toISOString();
    var normalizedMetadata = Veritas.Models.Poll.normalizeSecureMetadata(pollData);
    if (Veritas.Models.Poll.isSecureSessionType(normalizedMetadata.sessionType) && !normalizedMetadata.timeLimitMinutes) {
      throw new Error('Time limit is required for Secure Assessments');
    }

    Veritas.Models.Poll.writePollRows(pollId, pollName, className, questions, timestamp, timestamp, normalizedMetadata);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Poll created via new editor', { pollId: pollId, pollName: pollName, questionCount: questions.length, sessionType: normalizedMetadata.sessionType });

    return DataAccess.polls.getAll();
  })();
};

/**
 * Save a poll as draft (D- prefix)
 * @param {Object} pollData - Poll data object
 * @returns {Object} Success result
 */
Veritas.Models.Poll.saveDraft = function(pollData) {
  return withErrorHandling(function() {
    var pollName = pollData.pollName;
    var className = pollData.className;
    var questions = pollData.questions;

    if (!pollName || !className || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid poll data: name, class, and questions are required');
    }

    if (questions.length > 50) {
      throw new Error('Maximum 50 questions per poll');
    }

    var pollId = "D-" + Utilities.getUuid(); // "D" for Draft
    var timestamp = new Date().toISOString();

    Veritas.Models.Poll.writePollRows(pollId, pollName, className, questions, timestamp, timestamp, { sessionType: Veritas.Config.SESSION_TYPES.LIVE });

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Draft saved', { pollId: pollId, pollName: pollName, questionCount: questions.length });

    return { success: true };
  })();
};

/**
 * Duplicate a question within a poll
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Index of question to duplicate
 * @returns {Object} Success result
 */
Veritas.Models.Poll.duplicateQuestion = function(pollId, questionIndex) {
  return withErrorHandling(function() {
    if (!pollId) {
      throw new Error('Poll ID is required');
    }

    if (questionIndex === undefined || questionIndex === null) {
      throw new Error('Question index is required');
    }

    var poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    if (questionIndex < 0 || questionIndex >= poll.questions.length) {
      throw new Error('Invalid question index');
    }

    // Deep copy the question to duplicate
    var questionToDuplicate = poll.questions[questionIndex];
    var duplicatedQuestion = JSON.parse(JSON.stringify(questionToDuplicate));

    // Insert the duplicated question right after the original
    var newQuestions = poll.questions.slice();
    newQuestions.splice(questionIndex + 1, 0, duplicatedQuestion);

    if (newQuestions.length > 50) {
      throw new Error('Maximum 50 questions per poll. Cannot duplicate.');
    }

    // Update the poll with the new questions array
    Veritas.Models.Poll.removePollRows(pollId);

    var existingPoll = DataAccess.polls.getById(pollId);
    var createdAt = existingPoll && existingPoll.createdAt ? existingPoll.createdAt : new Date().toISOString();
    var updatedAt = new Date().toISOString();
    var metadata = Veritas.Models.Poll.normalizeSecureMetadata(existingPoll || {});

    Veritas.Models.Poll.writePollRows(pollId, poll.pollName, poll.className, newQuestions, createdAt, updatedAt, metadata);

    CacheManager.invalidate('ALL_POLLS_DATA');

    Logger.log('Question duplicated', {
      pollId: pollId,
      originalIndex: questionIndex,
      newIndex: questionIndex + 1,
      totalQuestions: newQuestions.length
    });

    return {
      success: true,
      message: 'Question duplicated successfully',
      polls: DataAccess.polls.getAll()
    };
  })();
};

// =============================================================================
// POLL RETRIEVAL & MANAGEMENT
// =============================================================================

/**
 * Get poll data for editing
 * @param {string} pollId - Poll ID
 * @returns {Object} Poll data with all fields normalized
 */
Veritas.Models.Poll.getPollForEditing = function(pollId) {
  return withErrorHandling(function() {
    if (!pollId) {
      throw new Error('Poll ID is required');
    }

    var poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }

    var sessionType = Veritas.Models.Poll.normalizeSessionTypeValue(poll.sessionType);
    var timeLimitMinutes = (typeof poll.timeLimitMinutes === 'number')
      ? poll.timeLimitMinutes
      : (poll.secureSettings && typeof poll.secureSettings.timeLimitMinutes === 'number'
        ? poll.secureSettings.timeLimitMinutes
        : null);
    var accessCode = poll.accessCode ? poll.accessCode.toString().trim() : '';
    var availableFrom = poll.availableFrom || (poll.secureSettings && poll.secureSettings.availableFrom) || '';
    var dueBy = poll.dueBy || (poll.secureSettings && poll.secureSettings.dueBy) || '';
    var secureSettings = {};
    if (poll.secureSettings && typeof poll.secureSettings === 'object') {
      try {
        secureSettings = JSON.parse(JSON.stringify(poll.secureSettings));
      } catch (err) {
        Logger.log('Secure settings clone fallback in getPollForEditing', err);
        secureSettings = {};
        for (var key in poll.secureSettings) {
          if (poll.secureSettings.hasOwnProperty(key)) {
            secureSettings[key] = poll.secureSettings[key];
          }
        }
      }
    }

    var questions = poll.questions.map(function(question) {
      return {
        questionText: question.questionText || '',
        questionImageURL: question.questionImageURL || null,
        questionImageFileId: question.questionImageFileId || null,
        options: (question.options || []).map(function(opt) {
          return {
            text: opt.text || '',
            imageURL: opt.imageURL || null,
            imageFileId: opt.imageFileId || null
          };
        }),
        correctAnswer: question.correctAnswer || null,
        timerSeconds: question.timerSeconds || null,
        metacognitionEnabled: !!question.metacognitionEnabled
      };
    });

    return {
      pollId: poll.pollId,
      pollName: poll.pollName,
      className: poll.className,
      createdAt: poll.createdAt || '',
      updatedAt: poll.updatedAt || '',
      sessionType: sessionType,
      timeLimitMinutes: timeLimitMinutes,
      accessCode: accessCode,
      availableFrom: availableFrom,
      dueBy: dueBy,
      missionControlState: poll.missionControlState || '',
      secureSettings: secureSettings,
      questions: questions
    };
  })();
};

/**
 * Get archived polls with response data
 * @returns {Array} Array of archived poll objects with analytics
 */
Veritas.Models.Poll.getArchivedPolls = function() {
  return withErrorHandling(function() {
    var polls = DataAccess.polls.getAll();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var responsesSheet = ss.getSheetByName('Responses');
    var responseValues = responsesSheet ? Veritas.Models.Poll.getDataRangeValues(responsesSheet) : [];

    var responsesByPoll = new Map();

    responseValues.forEach(function(row) {
      var pollId = row[2];
      var questionIndex = typeof row[3] === 'number' ? row[3] : parseInt(row[3], 10);
      if (isNaN(questionIndex)) {
        return;
      }
      var studentEmail = (row[4] || '').toString().trim();
      var answer = row[5];
      var isCorrectRaw = row[6];
      var timestamp = row[1];

      if (!responsesByPoll.has(pollId)) {
        responsesByPoll.set(pollId, {
          responses: new Map(),
          violations: new Map(),
          latestTimestamp: 0
        });
      }

      var pollEntry = responsesByPoll.get(pollId);
      if (timestamp && typeof timestamp === 'number') {
        pollEntry.latestTimestamp = Math.max(pollEntry.latestTimestamp, timestamp);
      }

      if (questionIndex === -1 && Veritas.Config.PROCTOR_VIOLATION_VALUES.indexOf(answer) !== -1) {
        pollEntry.violations.set(studentEmail, true);
        return;
      }

      if (!pollEntry.responses.has(questionIndex)) {
        pollEntry.responses.set(questionIndex, []);
      }

      var isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);

      pollEntry.responses.get(questionIndex).push({
        email: studentEmail,
        answer: answer,
        isCorrect: isCorrect,
        timestamp: timestamp
      });
    });

    var archivedPolls = polls.map(function(poll) {
      var pollResponses = responsesByPoll.get(poll.pollId) || { responses: new Map(), violations: new Map(), latestTimestamp: 0 };
      var roster = DataAccess.roster.getByClass(poll.className);
      var rosterMap = new Map(roster.map(function(student) {
        return [student.email, student.name];
      }));
      var violationsSet = new Set(Array.from(pollResponses.violations.keys()));

      var questions = poll.questions.map(function(question, index) {
        var submissions = pollResponses.responses.get(index) || [];
        var responsesDetailed = submissions.map(function(submission) {
          return {
            email: submission.email,
            name: rosterMap.get(submission.email) || submission.email,
            answer: submission.answer,
            isCorrect: submission.isCorrect,
            violation: violationsSet.has(submission.email),
            timestamp: submission.timestamp || null
          };
        });

        var respondedEmails = new Set(responsesDetailed.map(function(response) {
          return response.email;
        }));
        var nonResponders = roster
          .filter(function(student) {
            return !respondedEmails.has(student.email);
          })
          .map(function(student) {
            return {
              email: student.email,
              name: student.name,
              violation: violationsSet.has(student.email)
            };
          });

        var correctCount = responsesDetailed.filter(function(response) {
          return response.isCorrect;
        }).length;
        var incorrectCount = responsesDetailed.filter(function(response) {
          return !response.isCorrect;
        }).length;
        var violationCount = responsesDetailed.filter(function(response) {
          return response.violation;
        }).length + nonResponders.filter(function(student) {
          return student.violation;
        }).length;

        return {
          index: index,
          questionText: question.questionText,
          questionImageURL: question.questionImageURL || null,
          correctAnswer: question.correctAnswer || null,
          timerSeconds: question.timerSeconds || null,
          responses: responsesDetailed,
          nonResponders: nonResponders,
          summary: {
            totalStudents: roster.length,
            responded: responsesDetailed.length,
            correct: correctCount,
            incorrect: incorrectCount,
            noResponse: nonResponders.length,
            violations: violationCount
          }
        };
      });

      var latestTimestamp = pollResponses.latestTimestamp || 0;
      var lastRunAt = latestTimestamp ? new Date(latestTimestamp).toISOString() : poll.updatedAt || poll.createdAt || '';

      return {
        pollId: poll.pollId,
        pollName: poll.pollName,
        className: poll.className,
        createdAt: poll.createdAt || '',
        updatedAt: poll.updatedAt || '',
        lastRunAt: lastRunAt,
        questions: questions,
        questionCount: poll.questions.length,
        totalResponses: questions.reduce(function(sum, q) {
          return sum + q.responses.length;
        }, 0),
        totalStudents: roster.length,
        violations: Array.from(violationsSet)
      };
    });

    archivedPolls.sort(function(a, b) {
      var aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
      var bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
      return bTime - aTime;
    });

    Logger.log('Archived poll data generated', { count: archivedPolls.length });

    return archivedPolls;
  })();
};

/**
 * Get secure assessment book view with student-by-student breakdown
 * @param {string} pollId - Poll ID
 * @returns {Object} Comprehensive book view data
 */
Veritas.Models.Poll.getSecureAssessmentBookView = function(pollId) {
  return withErrorHandling(function() {
    var poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      return { success: false, error: 'Poll not found' };
    }

    // Only works for secure assessments
    if (poll.sessionType !== 'SECURE_ASSESSMENT') {
      return { success: false, error: 'This feature is only available for secure assessments' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var responsesSheet = ss.getSheetByName('Responses');
    var responseValues = responsesSheet ? Veritas.Models.Poll.getDataRangeValues(responsesSheet) : [];
    var roster = DataAccess.roster.getByClass(poll.className);

    // Filter responses for this poll
    var pollResponses = responseValues.filter(function(row) {
      return row[2] === pollId;
    });

    // Build response data structure
    var responsesByQuestion = buildResponsesByQuestion_(pollResponses);
    var studentTotalScores = calculateStudentTotalScores_(poll, responsesByQuestion);

    // Get psychometric data
    var classOverview = computeClassOverview_(poll, responsesByQuestion, studentTotalScores, roster);
    var itemAnalysis = computeItemAnalysis_(poll, responsesByQuestion, studentTotalScores);

    // Build student-by-student breakdown
    var studentDetails = [];
    var studentsWhoAnswered = new Set();

    responsesByQuestion.forEach(function(responses, qIdx) {
      responses.forEach(function(r) {
        studentsWhoAnswered.add(r.email);
      });
    });

    studentsWhoAnswered.forEach(function(email) {
      var student = roster.find(function(s) {
        return s.email === email;
      }) || { email: email, name: email };
      var totalScore = studentTotalScores.get(email) || 0;
      var maxScore = poll.questions.length;
      var percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      // Build question-by-question response breakdown for this student
      var questionResponses = [];
      poll.questions.forEach(function(question, qIdx) {
        var responses = responsesByQuestion.get(qIdx) || [];
        var studentResponse = responses.find(function(r) {
          return r.email === email;
        });

        questionResponses.push({
          questionIndex: qIdx,
          questionText: question.questionText || '',
          questionImageURL: question.questionImageURL || null,
          correctAnswer: question.correctAnswer,
          studentAnswer: studentResponse ? studentResponse.answer : null,
          isCorrect: studentResponse ? studentResponse.isCorrect : false,
          answered: !!studentResponse,
          confidence: studentResponse ? studentResponse.confidence : null,
          timestamp: studentResponse ? studentResponse.timestamp : null
        });
      });

      // Calculate percentile rank
      var scores = Array.from(studentTotalScores.values()).sort(function(a, b) {
        return b - a;
      });
      var rank = scores.indexOf(totalScore) + 1;
      var percentileRank = scores.length > 0 ? Math.round((1 - (rank / scores.length)) * 100) : 0;

      studentDetails.push({
        email: email,
        name: student.name || student.displayName || email,
        totalScore: totalScore,
        maxScore: maxScore,
        percentage: percentage,
        percentileRank: percentileRank,
        rank: rank,
        questionResponses: questionResponses,
        completedAll: questionResponses.every(function(q) {
          return q.answered;
        })
      });
    });

    // Sort students by total score descending
    studentDetails.sort(function(a, b) {
      return b.totalScore - a.totalScore;
    });

    // Add enhanced item analysis with more context
    var enhancedItemAnalysis = itemAnalysis.map(function(item) {
      var question = poll.questions[item.questionIndex];
      return {
        questionIndex: item.questionIndex,
        questionText: item.questionText,
        correctAnswer: item.correctAnswer,
        difficulty: item.difficulty,
        discrimination: item.discrimination,
        responseCount: item.responseCount,
        correctCount: item.correctCount,
        distractorAnalysis: item.distractorAnalysis,
        flags: item.flags,
        options: question.options || [],
        questionImageURL: question.questionImageURL || null,
        interpretation: {
          difficulty: interpretDifficulty(item.difficulty),
          discrimination: interpretDiscrimination(item.discrimination),
          overall: interpretItemQuality(item.difficulty, item.discrimination)
        }
      };
    });

    return {
      success: true,
      pollId: pollId,
      pollName: poll.pollName,
      className: poll.className,
      sessionType: poll.sessionType,
      timeLimitMinutes: poll.timeLimitMinutes || null,
      questionCount: poll.questions.length,
      classOverview: {
        participantCount: classOverview.participantCount,
        rosterSize: classOverview.rosterSize,
        mean: classOverview.mean,
        median: classOverview.median,
        stdDev: classOverview.stdDev,
        min: classOverview.min,
        max: classOverview.max,
        scoreDistribution: classOverview.scoreDistribution,
        interpretation: {
          participation: interpretParticipation(classOverview.participantCount, classOverview.rosterSize),
          meanScore: interpretMeanScore(classOverview.mean, poll.questions.length),
          stdDev: interpretStdDev(classOverview.stdDev, poll.questions.length)
        }
      },
      itemAnalysis: enhancedItemAnalysis,
      studentDetails: studentDetails
    };
  })();
};

// =============================================================================
// QUESTION NORMALIZATION & VALIDATION
// =============================================================================

/**
 * Normalize question object with cache-busted image URLs
 * @param {Object} questionData - Raw question data
 * @param {string} pollUpdatedAt - Poll updated timestamp for cache busting
 * @returns {Object} Normalized question object
 */
Veritas.Models.Poll.normalizeQuestionObject = function(questionData, pollUpdatedAt) {
  var normalized = {};
  var webAppUrl = Veritas.Models.Poll.getWebAppUrl();

  // Generate version string for cache busting
  // Use poll's updatedAt timestamp, or current time as fallback
  var versionParam = pollUpdatedAt
    ? '&v=' + encodeURIComponent(new Date(pollUpdatedAt).getTime())
    : '&v=' + Date.now();

  // Normalize question text
  normalized.questionText = questionData.questionText || questionData.text || '';

  // NEW APPROACH: Use fileId to generate proxy URL with version for cache busting
  // Check for questionImageFileId first (new canonical field)
  // Fall back to questionImageURL for legacy polls
  var questionImageUrl = null;

  if (questionData.questionImageFileId && typeof questionData.questionImageFileId === 'string') {
    // NEW: Use Google Drive thumbnail API for direct image display
    questionImageUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(questionData.questionImageFileId) + '&sz=w1000';
  } else {
    // LEGACY: Use old URL field (Drive URL)
    var legacyUrl = questionData.questionImageURL || questionData.questionImage || null;
    if (legacyUrl && typeof legacyUrl === 'string') {
      // Ensure it's a URL (starts with http/https), not base64
      if (legacyUrl.indexOf('http://') === 0 || legacyUrl.indexOf('https://') === 0) {
        questionImageUrl = legacyUrl;
      } else if (legacyUrl.indexOf('data:') === 0) {
        // Legacy base64 - ignore it
        Logger.log('Ignoring legacy base64 questionImage');
        questionImageUrl = null;
      }
    }
  }

  normalized.questionImageURL = questionImageUrl;
  normalized.questionImage = questionImageUrl;  // For backward compatibility
  normalized.questionImageFileId = questionData.questionImageFileId || null; // Preserve fileId

  // Normalize options
  var optionsArray = Array.isArray(questionData.options) ? questionData.options : [];
  normalized.options = optionsArray.map(function(opt) {
    if (typeof opt === 'string') {
      return { text: opt, imageURL: null, image: null, imageFileId: null };
    }

    // NEW APPROACH: Use fileId to generate proxy URL with version for cache busting
    var optionImageUrl = null;

    if (opt.imageFileId && typeof opt.imageFileId === 'string') {
      // NEW: Use Google Drive thumbnail API for direct image display
      optionImageUrl = 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(opt.imageFileId) + '&sz=w1000';
    } else {
      // LEGACY: Use old URL field
      var legacyUrl = opt.imageURL || opt.image || null;
      if (legacyUrl && typeof legacyUrl === 'string') {
        // Ensure it's a URL, not base64
        if (legacyUrl.indexOf('http://') === 0 || legacyUrl.indexOf('https://') === 0) {
          optionImageUrl = legacyUrl;
        } else if (legacyUrl.indexOf('data:') === 0) {
          // Legacy base64 - ignore it
          Logger.log('Ignoring legacy base64 option image');
          optionImageUrl = null;
        }
      }
    }

    return {
      text: opt.text || '',
      imageURL: optionImageUrl,
      image: optionImageUrl,  // For backward compatibility
      imageFileId: opt.imageFileId || null  // Preserve fileId
    };
  });

  // Normalize other fields
  normalized.correctAnswer = questionData.correctAnswer || null;

  if (questionData.explanation) {
    normalized.explanation = questionData.explanation;
  }

  if (questionData.timerSeconds) {
    normalized.timerSeconds = questionData.timerSeconds;
  }

  // Metacognition field (default to false for backward compatibility)
  normalized.metacognitionEnabled = questionData.metacognitionEnabled === true ||
    questionData.metacognitionEnabled === 'true' ||
    questionData.metacognitionEnabled === 1;

  return normalized;
};

/**
 * Normalize secure assessment metadata
 * @param {Object} metadata - Raw metadata
 * @returns {Object} Normalized metadata
 */
Veritas.Models.Poll.normalizeSecureMetadata = function(metadata) {
  var incoming = metadata || {};
  var sessionType = Veritas.Models.Poll.normalizeSessionTypeValue(incoming.sessionType);
  var timeLimitRaw = incoming.timeLimitMinutes;
  var timeLimit = Number(timeLimitRaw);
  var validTimeLimit = Veritas.Models.Poll.isSecureSessionType(sessionType) && !isNaN(timeLimit) && timeLimit > 0
    ? Math.round(timeLimit)
    : null;

  var accessCode = incoming.accessCode ? String(incoming.accessCode).trim() : '';
  var availableFrom = incoming.availableFrom || '';
  var dueBy = incoming.dueBy || '';
  var missionControlState = incoming.missionControlState || '';

  // NEW: Support for Live Poll proctoring
  // If liveProctoring is true, Live Polls will enforce fullscreen/tab-switch rules
  var liveProctoring = incoming.liveProctoring === true ||
    (incoming.secureSettings && incoming.secureSettings.liveProctoring === true);

  var secureSettings = {};
  if (incoming.secureSettings && typeof incoming.secureSettings === 'object') {
    try {
      secureSettings = JSON.parse(JSON.stringify(incoming.secureSettings));
    } catch (err) {
      Logger.error('Failed to clone secure settings metadata', err);
      secureSettings = {};
      for (var key in incoming.secureSettings) {
        if (incoming.secureSettings.hasOwnProperty(key)) {
          secureSettings[key] = incoming.secureSettings[key];
        }
      }
    }
  }

  if (validTimeLimit && !secureSettings.timeLimitMinutes) {
    secureSettings.timeLimitMinutes = validTimeLimit;
  }
  if (accessCode && !secureSettings.accessCode) {
    secureSettings.accessCode = accessCode;
  }
  if (availableFrom && !secureSettings.availableFrom) {
    secureSettings.availableFrom = availableFrom;
  }
  if (dueBy && !secureSettings.dueBy) {
    secureSettings.dueBy = dueBy;
  }
  // Persist liveProctoring setting
  if (liveProctoring) {
    secureSettings.liveProctoring = true;
  }
  if (Veritas.Models.Poll.isSecureSessionType(sessionType) && !secureSettings.proctoringRules) {
    secureSettings.proctoringRules = [
      'Fullscreen required',
      'No tab switching',
      'Session monitored by Mission Control'
    ];
  }

  // Calculator enabled flag (default false for backward compatibility)
  var calculatorEnabled = incoming.calculatorEnabled === true ||
    incoming.calculatorEnabled === 'true' ||
    incoming.calculatorEnabled === 1 ||
    (incoming.secureSettings && incoming.secureSettings.calculatorEnabled === true);

  if (calculatorEnabled && !secureSettings.calculatorEnabled) {
    secureSettings.calculatorEnabled = true;
  }

  return {
    sessionType: sessionType,
    timeLimitMinutes: validTimeLimit,
    accessCode: accessCode,
    availableFrom: availableFrom,
    dueBy: dueBy,
    missionControlState: missionControlState,
    secureSettings: secureSettings,
    calculatorEnabled: calculatorEnabled
  };
};

/**
 * Normalize session type value to canonical form
 * @param {string} value - Raw session type value
 * @returns {string} Normalized session type
 */
Veritas.Models.Poll.normalizeSessionTypeValue = function(value) {
  if (!value) return Veritas.Config.SESSION_TYPES.LIVE;
  var normalized = value.toString().toUpperCase();
  if (normalized === 'LIVE' || normalized === Veritas.Config.SESSION_TYPES.LIVE) {
    return Veritas.Config.SESSION_TYPES.LIVE;
  }
  if (normalized === Veritas.Config.SESSION_TYPES.SECURE || normalized === Veritas.Config.SESSION_TYPES.LEGACY_SECURE || normalized === 'SECURE') {
    return Veritas.Config.SESSION_TYPES.SECURE;
  }
  return Veritas.Config.SESSION_TYPES.LIVE;
};

/**
 * Check if session type is secure assessment
 * @param {string} value - Session type value
 * @returns {boolean} True if secure assessment
 */
Veritas.Models.Poll.isSecureSessionType = function(value) {
  return Veritas.Models.Poll.normalizeSessionTypeValue(value) === Veritas.Config.SESSION_TYPES.SECURE;
};

/**
 * Check if value represents secure session phase
 * @param {string} value - Session phase value
 * @returns {boolean} True if secure session phase
 */
Veritas.Models.Poll.isSecureSessionPhase = function(value) {
  if (!value) return false;
  var normalized = value.toString().toUpperCase();
  return normalized === Veritas.Config.SECURE_SESSION_PHASE || normalized === Veritas.Config.SESSION_TYPES.LEGACY_SECURE;
};

// =============================================================================
// CLASS & ROSTER MANAGEMENT
// =============================================================================

/**
 * Create a new class record
 * @param {string} className - Class name
 * @param {string} description - Class description
 * @returns {Object} Updated roster manager data
 */
Veritas.Models.Poll.createClassRecord = function(className, description) {
  return withErrorHandling(function() {
    if (!className || className.trim() === '') {
      throw new Error('Class name is required');
    }

    Veritas.Models.Poll.ensureClassExists(className.trim(), description || '');
    CacheManager.invalidate('CLASSES_LIST');

    Logger.log('Class created', { className: className });

    return Veritas.Models.Poll.getRosterManagerData();
  })();
};

/**
 * Get roster manager data (all classes and rosters)
 * @returns {Object} Object with classes array and rosters object
 */
Veritas.Models.Poll.getRosterManagerData = function() {
  return withErrorHandling(function() {
    var classes = Veritas.Models.Poll.getClasses();
    var rosterData = {};
    classes.forEach(function(className) {
      rosterData[className] = Veritas.Models.Poll.getRoster(className);
    });

    return {
      classes: classes,
      rosters: rosterData
    };
  })();
};

/**
 * Save roster for a class
 * @param {string} className - Class name
 * @param {Array} rosterEntries - Array of {name, email} objects
 * @returns {Object} Updated roster manager data
 */
Veritas.Models.Poll.saveRoster = function(className, rosterEntries) {
  return withErrorHandling(function() {
    if (!className || className.trim() === '') {
      throw new Error('Class name is required');
    }

    if (!Array.isArray(rosterEntries)) {
      throw new Error('Roster entries must be an array');
    }

    var cleanedEntries = rosterEntries
      .map(function(entry) {
        return {
          name: (entry.name || '').toString().trim(),
          email: (entry.email || '').toString().trim()
        };
      })
      .filter(function(entry) {
        return entry.name !== '' && entry.email !== '';
      });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rosterSheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.ROSTERS);
    Veritas.Data.ensureHeaders(rosterSheet, Veritas.Config.SHEET_HEADERS.ROSTERS);

    // OPTIMIZATION: Filter and rewrite instead of row-by-row deletion
    var values = Veritas.Models.Poll.getDataRangeValues(rosterSheet);
    var keepRows = values.filter(function(row) {
      return row[0] !== className;
    });
    var newRows = cleanedEntries.map(function(entry) {
      return [className, entry.name, entry.email];
    });
    var allRows = keepRows.concat(newRows);

    // Clear and rewrite all data
    if (values.length > 0) {
      rosterSheet.getRange(2, 1, values.length, rosterSheet.getLastColumn()).clearContent();
    }
    if (allRows.length > 0) {
      rosterSheet.getRange(2, 1, allRows.length, allRows[0].length).setValues(allRows);
    }

    Veritas.Models.Poll.ensureClassExists(className);

    CacheManager.invalidate(['CLASSES_LIST']);

    Logger.log('Roster saved', { className: className, studentCount: cleanedEntries.length });

    return Veritas.Models.Poll.getRosterManagerData();
  })();
};

/**
 * Bulk add students to roster (skips duplicates)
 * @param {string} className - Class name
 * @param {Array} studentEntries - Array of {name, email} objects
 * @returns {Object} Result with added/skipped counts
 */
Veritas.Models.Poll.bulkAddStudentsToRoster = function(className, studentEntries) {
  return withErrorHandling(function() {
    if (!className || className.trim() === '') {
      throw new Error('Class name is required');
    }

    if (!Array.isArray(studentEntries)) {
      throw new Error('Student entries must be an array');
    }

    var cleanedEntries = studentEntries
      .map(function(entry) {
        return {
          name: (entry.name || '').toString().trim(),
          email: (entry.email || '').toString().trim()
        };
      })
      .filter(function(entry) {
        return entry.name !== '' && entry.email !== '';
      });

    if (cleanedEntries.length === 0) {
      throw new Error('No valid student entries to add');
    }

    // Get existing roster to check for duplicates
    var existingRoster = DataAccess.roster.getByClass(className);
    var existingEmails = new Set(existingRoster.map(function(s) {
      return s.email.toLowerCase();
    }));

    // Filter out students that already exist
    var newStudents = cleanedEntries.filter(function(entry) {
      return !existingEmails.has(entry.email.toLowerCase());
    });

    if (newStudents.length === 0) {
      return {
        success: true,
        message: 'All students already exist in the roster',
        addedCount: 0,
        skippedCount: cleanedEntries.length,
        data: Veritas.Models.Poll.getRosterManagerData()
      };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var rosterSheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.ROSTERS);
    Veritas.Data.ensureHeaders(rosterSheet, Veritas.Config.SHEET_HEADERS.ROSTERS);

    // Append new students to the roster
    var rows = newStudents.map(function(entry) {
      return [className, entry.name, entry.email];
    });
    rosterSheet.getRange(rosterSheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

    Veritas.Models.Poll.ensureClassExists(className);

    CacheManager.invalidate(['CLASSES_LIST']);

    Logger.log('Students bulk added to roster', {
      className: className,
      addedCount: newStudents.length,
      skippedCount: cleanedEntries.length - newStudents.length
    });

    return {
      success: true,
      message: 'Added ' + newStudents.length + ' student(s). Skipped ' + (cleanedEntries.length - newStudents.length) + ' duplicate(s).',
      addedCount: newStudents.length,
      skippedCount: cleanedEntries.length - newStudents.length,
      data: Veritas.Models.Poll.getRosterManagerData()
    };
  })();
};

/**
 * Rename a class across all sheets
 * @param {string} oldName - Current class name
 * @param {string} newName - New class name
 * @returns {Object} Updated roster manager data
 */
Veritas.Models.Poll.renameClass = function(oldName, newName) {
  return withErrorHandling(function() {
    if (!oldName || !newName) {
      throw new Error('Both current and new class names are required');
    }

    var normalizedNewName = newName.trim();
    if (normalizedNewName === '') {
      throw new Error('New class name cannot be empty');
    }

    if (oldName === normalizedNewName) {
      return Veritas.Models.Poll.getRosterManagerData();
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // OPTIMIZATION: Batch updates instead of setValue() in loops
    // Update Classes sheet
    var classesSheet = ss.getSheetByName('Classes');
    if (classesSheet && classesSheet.getLastRow() >= 2) {
      var values = classesSheet.getRange(2, 1, classesSheet.getLastRow() - 1, 2).getValues();
      var updatedValues = values.map(function(row) {
        return [row[0] === oldName ? normalizedNewName : row[0], row[1]];
      });
      classesSheet.getRange(2, 1, updatedValues.length, 2).setValues(updatedValues);
    }

    // Update Rosters sheet
    var rosterSheet = ss.getSheetByName('Rosters');
    var rosterValues = Veritas.Models.Poll.getDataRangeValues(rosterSheet);
    if (rosterValues.length > 0) {
      var updatedRosterValues = rosterValues.map(function(row) {
        var updatedRow = row.slice();
        if (updatedRow[0] === oldName) {
          updatedRow[0] = normalizedNewName;
        }
        return updatedRow;
      });
      rosterSheet.getRange(2, 1, updatedRosterValues.length, updatedRosterValues[0].length).setValues(updatedRosterValues);
    }

    // Update Polls sheet
    var pollSheet = ss.getSheetByName('Polls');
    var pollValues = Veritas.Models.Poll.getDataRangeValues(pollSheet);
    if (pollValues.length > 0) {
      var updatedPollValues = pollValues.map(function(row) {
        var updatedRow = row.slice();
        if (updatedRow[2] === oldName) {
          updatedRow[2] = normalizedNewName;
        }
        return updatedRow;
      });
      pollSheet.getRange(2, 1, updatedPollValues.length, updatedPollValues[0].length).setValues(updatedPollValues);
    }

    var props = PropertiesService.getScriptProperties();
    var tokenMapStr = props.getProperty('STUDENT_TOKENS') || '{}';
    var tokenMap = JSON.parse(tokenMapStr);
    var tokensUpdated = false;
    for (var token in tokenMap) {
      if (tokenMap.hasOwnProperty(token)) {
        var data = tokenMap[token];
        if (data.className === oldName) {
          data.className = normalizedNewName;
          tokensUpdated = true;
        }
      }
    }
    if (tokensUpdated) {
      props.setProperty('STUDENT_TOKENS', JSON.stringify(tokenMap));
    }

    CacheManager.invalidate(['CLASSES_LIST', 'ALL_POLLS_DATA']);

    Logger.log('Class renamed', { from: oldName, to: normalizedNewName });

    return Veritas.Models.Poll.getRosterManagerData();
  })();
};

/**
 * Delete a class record and cleanup tokens
 * @param {string} className - Class name to delete
 * @returns {Object} Updated roster manager data
 */
Veritas.Models.Poll.deleteClassRecord = function(className) {
  return withErrorHandling(function() {
    if (!className) {
      throw new Error('Class name is required');
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var classesSheet = ss.getSheetByName('Classes');
    if (classesSheet && classesSheet.getLastRow() >= 2) {
      var values = classesSheet.getRange(2, 1, classesSheet.getLastRow() - 1, 1).getValues();
      for (var i = values.length - 1; i >= 0; i--) {
        if (values[i][0] === className) {
          classesSheet.deleteRow(i + 2);
        }
      }
    }

    var rosterSheet = ss.getSheetByName('Rosters');
    var rosterValues = Veritas.Models.Poll.getDataRangeValues(rosterSheet);
    for (var i = rosterValues.length - 1; i >= 0; i--) {
      if (rosterValues[i][0] === className) {
        rosterSheet.deleteRow(i + 2);
      }
    }

    var props = PropertiesService.getScriptProperties();
    var tokenMapStr = props.getProperty('STUDENT_TOKENS') || '{}';
    var tokenMap = JSON.parse(tokenMapStr);
    var mutated = false;
    for (var token in tokenMap) {
      if (tokenMap.hasOwnProperty(token)) {
        if (tokenMap[token].className === className) {
          delete tokenMap[token];
          mutated = true;
        }
      }
    }
    if (mutated) {
      props.setProperty('STUDENT_TOKENS', JSON.stringify(tokenMap));
    }

    CacheManager.invalidate(['CLASSES_LIST', 'ALL_POLLS_DATA']);

    Logger.log('Class deleted', { className: className });

    return Veritas.Models.Poll.getRosterManagerData();
  })();
};

// =============================================================================
// IMAGE MANAGEMENT (DRIVE INTEGRATION)
// =============================================================================

/**
 * Upload image to Drive and return fileId
 * @param {string} dataUrl - Base64 data URL
 * @param {string} fileName - File name
 * @returns {Object} Result with fileId
 */
Veritas.Models.Poll.uploadImageToDrive = function(dataUrl, fileName) {
  return withErrorHandling(function() {
    // Validate inputs
    if (!dataUrl || typeof dataUrl !== 'string') {
      throw new Error('Invalid image data: dataUrl is missing or invalid');
    }

    if (!fileName || typeof fileName !== 'string') {
      throw new Error('Invalid image data: fileName is missing or invalid');
    }

    // Validate dataUrl format
    if (dataUrl.indexOf(',') === -1) {
      throw new Error('Invalid image data format: missing comma separator');
    }

    if (dataUrl.indexOf(':') === -1 || dataUrl.indexOf(';') === -1) {
      throw new Error('Invalid image data format: missing mime type information');
    }

    var base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1);
    var sizeInBytes = base64Data.length * 0.75;
    var maxSize = 5 * 1024 * 1024;

    if (sizeInBytes > maxSize) {
      throw new Error('File "' + fileName + '" exceeds 5MB limit');
    }

    var folder = Veritas.Models.Poll.getDriveFolder();
    var mimeType = dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';'));

    var allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.indexOf(mimeType) === -1) {
      throw new Error('File type "' + mimeType + '" not supported. Allowed types: ' + allowedTypes.join(', '));
    }

    var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    var file = folder.createFile(blob);
    var fileId = file.getId();

    // CRITICAL: Make the file publicly accessible so thumbnail URLs work
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    Logger.log('Image uploaded successfully', { fileName: fileName, fileId: fileId, size: sizeInBytes });

    // Return fileId instead of URL - URLs will be generated at render time via proxy
    return { success: true, fileId: fileId };
  })();
};

/**
 * Get Drive folder for image storage
 * @returns {Folder} Drive folder object
 */
Veritas.Models.Poll.getDriveFolder = function() {
  var properties = PropertiesService.getScriptProperties();

  // Use hardcoded folder ID - never create, never search by name
  var HARDCODED_FOLDER_ID = '1kLraHu_V-eGyVh_bOm9Vp_AdPylTToCi';

  // Always update/set the property to match hardcoded value
  var storedId = properties.getProperty('DRIVE_FOLDER_ID');
  if (storedId !== HARDCODED_FOLDER_ID) {
    properties.setProperty('DRIVE_FOLDER_ID', HARDCODED_FOLDER_ID);
    Logger.log('Updated DRIVE_FOLDER_ID to hardcoded value', { folderId: HARDCODED_FOLDER_ID });
  }

  try {
    var folder = DriveApp.getFolderById(HARDCODED_FOLDER_ID);

    // Ensure public sharing is always set
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return folder;
  } catch (e) {
    Logger.error('Failed to access hardcoded Drive folder', e);
    throw new Error('Cannot access Drive folder ' + HARDCODED_FOLDER_ID + '. Please verify folder exists and script has access.');
  }
};

/**
 * Fix permissions on all existing images (one-time utility)
 * @returns {Object} Result with count of files fixed
 */
Veritas.Models.Poll.fixAllImagePermissions = function() {
  return withErrorHandling(function() {
    var folder = Veritas.Models.Poll.getDriveFolder();
    var files = folder.getFiles();
    var count = 0;

    while (files.hasNext()) {
      var file = files.next();
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        count++;
        Logger.log('Fixed permissions for: ' + file.getName());
      } catch (e) {
        Logger.error('Failed to fix permissions for: ' + file.getName(), e);
      }
    }

    Logger.log('Fixed permissions for ' + count + ' files');
    return { success: true, filesFixed: count };
  })();
};

/**
 * Get web app base URL for proxy links
 * @returns {string} Web app URL
 */
Veritas.Models.Poll.getWebAppUrl = function() {
  // Get the deployed web app URL from Script Properties (set during deployment)
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('WEB_APP_URL');

  // If not set, try to construct it (fallback)
  if (!url) {
    var scriptId = ScriptApp.getScriptId();
    url = 'https://script.google.com/macros/s/' + scriptId + '/exec';
    Logger.log('WEB_APP_URL not set in properties, using constructed URL', { url: url });
  }

  return url;
};

// =============================================================================
// INTERNAL POLL HELPERS (DELEGATES TO DataAccess OR DIRECT SHEET ACCESS)
// =============================================================================

/**
 * Get all polls (cached)
 * NOTE: Delegates to internal getPolls_() which is defined in Code.gs
 * @returns {Array} Array of poll objects
 */
Veritas.Models.Poll.getPolls = function() {
  // This delegates to the existing getPolls_() function in Code.gs
  // which handles caching and normalization
  return getPolls_();
};

/**
 * Write poll rows to sheet
 * @param {string} pollId - Poll ID
 * @param {string} pollName - Poll name
 * @param {string} className - Class name
 * @param {Array} questions - Questions array
 * @param {string} createdAt - Created timestamp
 * @param {string} updatedAt - Updated timestamp
 * @param {Object} metadata - Poll metadata
 */
Veritas.Models.Poll.writePollRows = function(pollId, pollName, className, questions, createdAt, updatedAt, metadata) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pollSheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.POLLS);
  Veritas.Data.ensureHeaders(pollSheet, Veritas.Config.SHEET_HEADERS.POLLS);

  var normalizedMetadata = Veritas.Models.Poll.normalizeSecureMetadata(metadata);
  var finalSessionType = normalizedMetadata.sessionType;
  var finalTimeLimitMinutes = normalizedMetadata.timeLimitMinutes;
  var accessCode = normalizedMetadata.accessCode || '';
  var availableFrom = normalizedMetadata.availableFrom || '';
  var dueBy = normalizedMetadata.dueBy || '';
  var missionControlState = normalizedMetadata.missionControlState || '';
  var secureSettingsJson = JSON.stringify(normalizedMetadata.secureSettings || {});

  // DEBUG: Log what we're about to save
  Logger.log('=== SAVING POLL DATA ===');
  Logger.log('Poll ID: ' + pollId);
  Logger.log('Session Type: ' + finalSessionType);
  Logger.log('Time Limit (minutes): ' + finalTimeLimitMinutes);
  questions.forEach(function(q, idx) {
    Logger.log('Question ' + idx + ': questionImageFileId=' + q.questionImageFileId + ', metacognitionEnabled=' + q.metacognitionEnabled + ', options count=' + (q.options ? q.options.length : 0));
    if (q.options && q.options.length > 0) {
      q.options.forEach(function(opt, optIdx) {
        Logger.log('  Option ' + optIdx + ': text="' + opt.text + '", imageFileId=' + opt.imageFileId);
      });
    }
  });

  var payload = questions.map(function(q, index) {
    return [
      pollId,
      pollName,
      className,
      index,
      JSON.stringify(q),
      createdAt,
      updatedAt,
      finalSessionType,
      finalTimeLimitMinutes,
      accessCode,
      availableFrom,
      dueBy,
      missionControlState,
      secureSettingsJson
    ];
  });

  if (payload.length === 0) {
    return;
  }

  var startRow = pollSheet.getLastRow() + 1;
  pollSheet.getRange(startRow, 1, payload.length, payload[0].length).setValues(payload);
};

/**
 * Remove poll rows from sheet
 * @param {string} pollId - Poll ID to remove
 */
Veritas.Models.Poll.removePollRows = function(pollId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pollSheet = ss.getSheetByName('Polls');
  if (!pollSheet) {
    return;
  }

  // OPTIMIZATION: Filter and rewrite instead of row-by-row deletion
  var values = Veritas.Models.Poll.getDataRangeValues(pollSheet);
  var keepRows = values.filter(function(row) {
    return row[0] !== pollId;
  });

  if (keepRows.length < values.length) {
    // Clear all data rows (keep header)
    if (values.length > 0) {
      pollSheet.getRange(2, 1, values.length, pollSheet.getLastColumn()).clearContent();
    }
    // Rewrite filtered data
    if (keepRows.length > 0) {
      pollSheet.getRange(2, 1, keepRows.length, keepRows[0].length).setValues(keepRows);
    }
  }
};

/**
 * Get all classes (cached)
 * @returns {Array} Array of class names
 */
Veritas.Models.Poll.getClasses = function() {
  return CacheManager.get('CLASSES_LIST', function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var classesSheet = ss.getSheetByName("Classes");
    if (classesSheet && classesSheet.getLastRow() >= 2) {
      var values = classesSheet.getRange(2, 1, classesSheet.getLastRow() - 1, 1).getValues();
      return values
        .map(function(row) {
          return row[0];
        })
        .filter(function(name) {
          return name && name.toString().trim() !== '';
        })
        .map(function(name) {
          return name.toString().trim();
        })
        .filter(function(value, index, arr) {
          return arr.indexOf(value) === index;
        })
        .sort();
    }

    var rosterSheet = ss.getSheetByName("Rosters");
    var values = Veritas.Models.Poll.getDataRangeValues(rosterSheet);
    var classNames = new Set(
      values
        .map(function(row) {
          return row[0];
        })
        .filter(function(name) {
          return name && name.toString().trim() !== '';
        })
    );
    return Array.from(classNames).sort();
  }, CacheManager.CACHE_TIMES.LONG);
};

/**
 * Get roster for a class
 * @param {string} className - Class name
 * @returns {Array} Array of {name, email} objects
 */
Veritas.Models.Poll.getRoster = function(className) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var rosterSheet = ss.getSheetByName("Rosters");
  var values = Veritas.Models.Poll.getDataRangeValues(rosterSheet);

  return values
    .filter(function(row) {
      return row[0] === className;
    })
    .map(function(row) {
      return { name: (row[1] || '').toString().trim(), email: (row[2] || '').toString().trim() };
    })
    .filter(function(entry) {
      return entry.name !== '' && entry.email !== '';
    })
    .sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
};

/**
 * Ensure class exists in Classes sheet
 * @param {string} className - Class name
 * @param {string} description - Class description
 */
Veritas.Models.Poll.ensureClassExists = function(className, description) {
  if (!className) {
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var classesSheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.CLASSES);
  Veritas.Data.ensureHeaders(classesSheet, Veritas.Config.SHEET_HEADERS.CLASSES);

  var trimmedName = className.toString().trim();
  if (trimmedName === '') {
    return;
  }

  var lastRow = classesSheet.getLastRow();
  if (lastRow >= 2) {
    var existingNames = classesSheet.getRange(2, 1, lastRow - 1, 1).getValues()
      .map(function(row) {
        return row[0];
      })
      .filter(function(name) {
        return name;
      });
    if (existingNames.indexOf(trimmedName) !== -1) {
      return;
    }
  }

  classesSheet.appendRow([trimmedName, description || '']);
};

/**
 * Get data range values from a sheet
 * @param {Sheet} sheet - Sheet object
 * @returns {Array} 2D array of values
 */
Veritas.Models.Poll.getDataRangeValues = function(sheet) {
  // CRITICAL NULL CHECK: getSheetByName can return null if sheet doesn't exist
  if (!sheet) {
    Logger.log('getDataRangeValues called with null/undefined sheet');
    return [];
  }

  if (sheet.getLastRow() < 2) {
    return [];
  }
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
};

// =============================================================================
// POLL SESSION TYPE HELPERS
// =============================================================================

/**
 * Build secure assessment availability descriptor
 * @param {Object} poll - Poll object
 * @returns {Object} Availability descriptor with status and messages
 */
Veritas.Models.Poll.buildSecureAvailabilityDescriptor = function(poll) {
  var now = new Date();
  var availableFromDate = Veritas.Utils.parseDateInput(poll.availableFrom);
  var dueByDate = Veritas.Utils.parseDateInput(poll.dueBy);
  var windowStatus = 'OPEN';

  if (availableFromDate && now < availableFromDate) {
    windowStatus = 'NOT_YET_OPEN';
  } else if (dueByDate && now > dueByDate) {
    windowStatus = 'PAST_DUE';
  }

  var segments = [];
  if (availableFromDate) {
    segments.push('Opens ' + Veritas.Utils.formatSecureDateLabel(availableFromDate));
  }
  if (dueByDate) {
    segments.push('Due by ' + Veritas.Utils.formatSecureDateLabel(dueByDate));
  }

  var message = segments.length > 0 ? segments.join(' • ') : 'Available now';

  return {
    availableFrom: availableFromDate ? availableFromDate.toISOString() : '',
    dueBy: dueByDate ? dueByDate.toISOString() : '',
    windowStatus: windowStatus,
    message: message,
    blockingMessage: windowStatus === 'NOT_YET_OPEN'
      ? 'This assessment is not open yet.'
      : windowStatus === 'PAST_DUE'
        ? 'This assessment window has closed.'
        : ''
  };
};

// =============================================================================
// METACOGNITION TAG MANAGEMENT
// =============================================================================

/**
 * Save misconception tag for a question
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @param {string} tag - Misconception tag
 * @returns {Object} Success result
 */
Veritas.Models.Poll.saveMisconceptionTag = function(pollId, questionIndex, tag) {
  return withErrorHandling(function() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pollSheet = ss.getSheetByName("Polls");
    var values = Veritas.Models.Poll.getDataRangeValues(pollSheet);

    // Find the row for this poll and question
    for (var i = 0; i < values.length; i++) {
      if (values[i][0] === pollId && values[i][3] === questionIndex) {
        var questionData = JSON.parse(values[i][4] || "{}");
        questionData.misconceptionTag = tag;

        // Update the cell
        pollSheet.getRange(i + 2, 5).setValue(JSON.stringify(questionData)); // +2 because of header and 0-index

        // Invalidate caches
        CacheManager.invalidate(['ALL_POLLS_DATA', 'ANALYTICS_DATA_' + JSON.stringify({})]);

        Logger.log('Misconception tag saved', { pollId: pollId, questionIndex: questionIndex, tag: tag });
        return { success: true };
      }
    }

    throw new Error('Question not found');
  })();
};

// =============================================================================
// LEGACY COMPATIBILITY WRAPPERS
// =============================================================================

/**
 * Legacy wrapper for createNewPoll
 */
function createNewPoll(pollName, className, questions, metadata) {
  return Veritas.Models.Poll.createNewPoll(pollName, className, questions, metadata);
}

/**
 * Legacy wrapper for updatePoll
 */
function updatePoll(pollId, pollName, className, questions, metadata) {
  return Veritas.Models.Poll.updatePoll(pollId, pollName, className, questions, metadata);
}

/**
 * Legacy wrapper for deletePoll
 */
function deletePoll(pollId) {
  return Veritas.Models.Poll.deletePoll(pollId);
}

/**
 * Legacy wrapper for copyPoll
 */
function copyPoll(sourcePollId, newPollName, targetClassName) {
  return Veritas.Models.Poll.copyPoll(sourcePollId, newPollName, targetClassName);
}

/**
 * Legacy wrapper for savePollNew
 */
function savePollNew(pollData) {
  return Veritas.Models.Poll.savePollNew(pollData);
}

/**
 * Legacy wrapper for saveDraft
 */
function saveDraft(pollData) {
  return Veritas.Models.Poll.saveDraft(pollData);
}

/**
 * Legacy wrapper for duplicateQuestion
 */
function duplicateQuestion(pollId, questionIndex) {
  return Veritas.Models.Poll.duplicateQuestion(pollId, questionIndex);
}

/**
 * Legacy wrapper for getPollForEditing
 */
function getPollForEditing(pollId) {
  return Veritas.Models.Poll.getPollForEditing(pollId);
}

/**
 * Legacy wrapper for getArchivedPolls
 */
function getArchivedPolls() {
  return Veritas.Models.Poll.getArchivedPolls();
}

/**
 * Legacy wrapper for getSecureAssessmentBookView
 */
function getSecureAssessmentBookView(pollId) {
  return Veritas.Models.Poll.getSecureAssessmentBookView(pollId);
}

/**
 * Legacy wrapper for normalizeQuestionObject_
 */
function normalizeQuestionObject_(questionData, pollUpdatedAt) {
  return Veritas.Models.Poll.normalizeQuestionObject(questionData, pollUpdatedAt);
}

/**
 * Legacy wrapper for normalizeSecureMetadata_
 */
function normalizeSecureMetadata_(metadata) {
  return Veritas.Models.Poll.normalizeSecureMetadata(metadata);
}

/**
 * Legacy wrapper for normalizeSessionTypeValue_
 */
function normalizeSessionTypeValue_(value) {
  return Veritas.Models.Poll.normalizeSessionTypeValue(value);
}

/**
 * Legacy wrapper for isSecureSessionType_
 */
function isSecureSessionType_(value) {
  return Veritas.Models.Poll.isSecureSessionType(value);
}

/**
 * Legacy wrapper for isSecureSessionPhase_
 */
function isSecureSessionPhase_(value) {
  return Veritas.Models.Poll.isSecureSessionPhase(value);
}

/**
 * Legacy wrapper for createClassRecord
 */
function createClassRecord(className, description) {
  return Veritas.Models.Poll.createClassRecord(className, description);
}

/**
 * Legacy wrapper for getRosterManagerData
 */
function getRosterManagerData() {
  return Veritas.Models.Poll.getRosterManagerData();
}

/**
 * Legacy wrapper for saveRoster
 */
function saveRoster(className, rosterEntries) {
  return Veritas.Models.Poll.saveRoster(className, rosterEntries);
}

/**
 * Legacy wrapper for bulkAddStudentsToRoster
 */
function bulkAddStudentsToRoster(className, studentEntries) {
  return Veritas.Models.Poll.bulkAddStudentsToRoster(className, studentEntries);
}

/**
 * Legacy wrapper for renameClass
 */
function renameClass(oldName, newName) {
  return Veritas.Models.Poll.renameClass(oldName, newName);
}

/**
 * Legacy wrapper for deleteClassRecord
 */
function deleteClassRecord(className) {
  return Veritas.Models.Poll.deleteClassRecord(className);
}

/**
 * Legacy wrapper for uploadImageToDrive
 */
function uploadImageToDrive(dataUrl, fileName) {
  return Veritas.Models.Poll.uploadImageToDrive(dataUrl, fileName);
}

/**
 * Legacy wrapper for getDriveFolder_
 */
function getDriveFolder_() {
  return Veritas.Models.Poll.getDriveFolder();
}

/**
 * Legacy wrapper for fixAllImagePermissions
 */
function fixAllImagePermissions() {
  return Veritas.Models.Poll.fixAllImagePermissions();
}

/**
 * Legacy wrapper for getWebAppUrl_
 */
function getWebAppUrl_() {
  return Veritas.Models.Poll.getWebAppUrl();
}

/**
 * Legacy wrapper for writePollRows_
 */
function writePollRows_(pollId, pollName, className, questions, createdAt, updatedAt, metadata) {
  return Veritas.Models.Poll.writePollRows(pollId, pollName, className, questions, createdAt, updatedAt, metadata);
}

/**
 * Legacy wrapper for removePollRows_
 */
function removePollRows_(pollId) {
  return Veritas.Models.Poll.removePollRows(pollId);
}

/**
 * Legacy wrapper for getClasses_
 */
function getClasses_() {
  return Veritas.Models.Poll.getClasses();
}

/**
 * Legacy wrapper for getRoster_
 */
function getRoster_(className) {
  return Veritas.Models.Poll.getRoster(className);
}

/**
 * Legacy wrapper for ensureClassExists_
 */
function ensureClassExists_(className, description) {
  return Veritas.Models.Poll.ensureClassExists(className, description);
}

/**
 * Legacy wrapper for getDataRangeValues_
 */
function getDataRangeValues_(sheet) {
  return Veritas.Models.Poll.getDataRangeValues(sheet);
}

/**
 * Legacy wrapper for buildSecureAvailabilityDescriptor_
 */
function buildSecureAvailabilityDescriptor_(poll) {
  return Veritas.Models.Poll.buildSecureAvailabilityDescriptor(poll);
}

/**
 * Legacy wrapper for saveMisconceptionTag
 */
function saveMisconceptionTag(pollId, questionIndex, tag) {
  return Veritas.Models.Poll.saveMisconceptionTag(pollId, questionIndex, tag);
}
