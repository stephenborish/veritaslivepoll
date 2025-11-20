// =============================================================================
// VERITAS LIVE POLL - MODELS: ANALYTICS MODULE
// =============================================================================
// Purpose: Post-poll analytics, psychometrics, student insights, KPIs
// Dependencies: Config, Logging, DataAccess, Utils, Models.Poll, Models.Session
// Phase: 2C In Progress - Analytics extraction in batches
// =============================================================================

Veritas.Models = Veritas.Models || {};
Veritas.Models.Analytics = {};

// =============================================================================
// ANALYTICS HUB & AGGREGATION FUNCTIONS (Batch 1)
// =============================================================================

/**
 * Get comprehensive analytics data with caching
 * @param {Object} filters - Optional filters {className, dateFrom, dateTo}
 * @returns {Object} Analytics data {kpis, sessions, items, students, topics}
 */
Veritas.Models.Analytics.getAnalyticsData = function(filters) {
  return withErrorHandling(function() {
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
        filteredPolls = filteredPolls.filter(function(p) { return p.className === filters.className; });
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
      var responsesByPoll = Veritas.Models.Analytics.buildResponseMaps(responseValues);

      // Compute aggregates
      var sessionAggregates = Veritas.Models.Analytics.computeSessionAggregates(filteredPolls, responsesByPoll);
      var itemAggregates = Veritas.Models.Analytics.computeItemAggregates(filteredPolls, responsesByPoll);
      var studentAggregates = Veritas.Models.Analytics.computeStudentAggregates(filteredPolls, responsesByPoll);
      var topicAggregates = Veritas.Models.Analytics.computeTopicAggregates(filteredPolls, responsesByPoll);

      // Compute KPIs
      var kpis = Veritas.Models.Analytics.computeKPIs(sessionAggregates, studentAggregates);

      Logger.log('Analytics data computed', {
        sessions: sessionAggregates.length,
        items: itemAggregates.length,
        students: Object.keys(studentAggregates).length
      });

      return {
        kpis: kpis,
        sessions: sessionAggregates,
        items: itemAggregates,
        students: studentAggregates,
        topics: topicAggregates,
        filters: filters
      };
    }, CacheManager.CACHE_TIMES.MEDIUM);
  })();
};

/**
 * Build response maps from raw response data
 * @param {Array} responseValues - Raw response data from sheet
 * @returns {Map} Map of pollId -> {responses, violations, timestamps}
 */
Veritas.Models.Analytics.buildResponseMaps = function(responseValues) {
  var responsesByPoll = new Map();

  responseValues.forEach(function(row) {
    var pollId = row[2];
    var questionIndex = typeof row[3] === 'number' ? row[3] : parseInt(row[3], 10);
    if (isNaN(questionIndex)) return;

    var studentEmail = (row[4] || '').toString().trim();
    var answer = row[5];
    var isCorrectRaw = row[6];
    var timestamp = row[1];

    if (!responsesByPoll.has(pollId)) {
      responsesByPoll.set(pollId, {
        responses: new Map(),
        violations: new Map(),
        timestamps: new Map()
      });
    }

    var pollEntry = responsesByPoll.get(pollId);

    // Track violations
    if (questionIndex === -1 && Veritas.Config.PROCTOR_VIOLATION_VALUES.indexOf(answer) !== -1) {
      pollEntry.violations.set(studentEmail, true);
      return;
    }

    // Track responses
    if (!pollEntry.responses.has(questionIndex)) {
      pollEntry.responses.set(questionIndex, []);
    }

    var isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);

    // Track timestamps for time analysis
    if (!pollEntry.timestamps.has(questionIndex)) {
      pollEntry.timestamps.set(questionIndex, []);
    }
    if (timestamp) {
      pollEntry.timestamps.get(questionIndex).push({
        email: studentEmail,
        timestamp: timestamp
      });
    }

    pollEntry.responses.get(questionIndex).push({
      email: studentEmail,
      answer: answer,
      isCorrect: isCorrect,
      timestamp: timestamp
    });
  });

  return responsesByPoll;
};

/**
 * Compute session-level aggregates
 * @param {Array} polls - Array of poll objects
 * @param {Map} responsesByPoll - Response map from buildResponseMaps
 * @returns {Array} Session aggregate data
 */
Veritas.Models.Analytics.computeSessionAggregates = function(polls, responsesByPoll) {
  return polls.map(function(poll) {
    var pollData = responsesByPoll.get(poll.pollId) || { responses: new Map(), violations: new Map() };
    var roster = DataAccess.roster.getByClass(poll.className);
    var totalStudents = roster.length;

    // Calculate overall statistics
    var totalCorrect = 0;
    var totalAnswered = 0;
    var participatingStudents = new Set();
    var totalTime = 0;
    var timeCount = 0;

    poll.questions.forEach(function(question, qIdx) {
      var responses = pollData.responses.get(qIdx) || [];
      responses.forEach(function(r) {
        participatingStudents.add(r.email);
        totalAnswered++;
        if (r.isCorrect) totalCorrect++;
      });

      // Calculate median time (simplified - using average for now)
      var timestamps = pollData.timestamps && pollData.timestamps.get(qIdx) || [];
      if (timestamps.length >= 2) {
        var sorted = timestamps.sort(function(a, b) { return a.timestamp - b.timestamp; });
        var firstTimestamp = sorted[0].timestamp;
        timestamps.forEach(function(t) {
          var timeDiff = (t.timestamp - firstTimestamp) / 1000; // seconds
          if (timeDiff > 0 && timeDiff < 600) { // Ignore outliers > 10 minutes
            totalTime += timeDiff;
            timeCount++;
          }
        });
      }
    });

    var masteryPct = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;
    var participationPct = totalStudents > 0 ? (participatingStudents.size / totalStudents) * 100 : 0;
    var medianTimeSec = timeCount > 0 ? totalTime / timeCount : 0;
    var violationCount = pollData.violations.size;
    var integrityRate = totalStudents > 0 ? (violationCount / totalStudents) * 10 : 0; // per 10 students

    return {
      sessionId: poll.pollId,
      sessionName: poll.pollName,
      className: poll.className,
      date: poll.updatedAt || poll.createdAt,
      questionCount: poll.questions.length,
      participants: participatingStudents.size,
      totalStudents: totalStudents,
      masteryPct: Math.round(masteryPct * 10) / 10,
      participationPct: Math.round(participationPct * 10) / 10,
      medianTimeSec: Math.round(medianTimeSec),
      integrityRate: Math.round(integrityRate * 10) / 10
    };
  });
};

/**
 * Calculate point-biserial correlation for item discrimination
 * @param {Array} itemScores - Array of boolean values (correct/incorrect)
 * @param {Array} totalScores - Array of total scores for each student
 * @returns {number} Point-biserial correlation coefficient
 */
Veritas.Models.Analytics.calculatePointBiserial = function(itemScores, totalScores) {
  if (itemScores.length < 5) return 0; // Need minimum sample size

  var n = itemScores.length;
  var sumCorrect = 0;
  var countCorrect = 0;
  var sumIncorrect = 0;
  var countIncorrect = 0;

  itemScores.forEach(function(correct, idx) {
    if (correct) {
      sumCorrect += totalScores[idx];
      countCorrect++;
    } else {
      sumIncorrect += totalScores[idx];
      countIncorrect++;
    }
  });

  if (countCorrect === 0 || countIncorrect === 0) return 0;

  var meanCorrect = sumCorrect / countCorrect;
  var meanIncorrect = sumIncorrect / countIncorrect;

  // Calculate overall standard deviation
  var overallMean = totalScores.reduce(function(a, b) { return a + b; }, 0) / n;
  var variance = totalScores.reduce(function(sum, score) { return sum + Math.pow(score - overallMean, 2); }, 0) / n;
  var sd = Math.sqrt(variance);

  if (sd === 0) return 0;

  // Point-biserial formula
  var p = countCorrect / n;
  var q = countIncorrect / n;
  var rbis = ((meanCorrect - meanIncorrect) / sd) * Math.sqrt(p * q);

  return Math.round(rbis * 100) / 100;
};

/**
 * Compute item-level aggregates with discrimination analysis
 * @param {Array} polls - Array of poll objects
 * @param {Map} responsesByPoll - Response map from buildResponseMaps
 * @returns {Array} Item aggregate data
 */
Veritas.Models.Analytics.computeItemAggregates = function(polls, responsesByPoll) {
  var items = [];

  polls.forEach(function(poll) {
    var pollData = responsesByPoll.get(poll.pollId) || { responses: new Map(), timestamps: new Map() };
    var roster = DataAccess.roster.getByClass(poll.className);

    // Calculate total scores for each student for discrimination analysis
    var studentTotalScores = new Map();
    roster.forEach(function(student) { studentTotalScores.set(student.email, 0); });

    poll.questions.forEach(function(question, qIdx) {
      var responses = pollData.responses.get(qIdx) || [];
      responses.forEach(function(r) {
        if (r.isCorrect) {
          studentTotalScores.set(r.email, (studentTotalScores.get(r.email) || 0) + 1);
        }
      });
    });

    poll.questions.forEach(function(question, qIdx) {
      var responses = pollData.responses.get(qIdx) || [];
      var totalStudents = roster.length;

      // Choice distribution
      var choiceCounts = { A: 0, B: 0, C: 0, D: 0 };
      var itemScores = [];
      var totalScoresForItem = [];

      responses.forEach(function(r) {
        if (choiceCounts.hasOwnProperty(r.answer)) {
          choiceCounts[r.answer]++;
        }
        itemScores.push(r.isCorrect);
        totalScoresForItem.push(studentTotalScores.get(r.email) || 0);
      });

      var correctCount = responses.filter(function(r) { return r.isCorrect; }).length;
      var correctPct = responses.length > 0 ? (correctCount / responses.length) * 100 : 0;
      var nonresponsePct = totalStudents > 0 ? ((totalStudents - responses.length) / totalStudents) * 100 : 0;

      // Calculate discrimination (point-biserial)
      var rbis = Veritas.Models.Analytics.calculatePointBiserial(itemScores, totalScoresForItem);

      // Find most chosen distractor
      var correctAnswer = question.correctAnswer || 'A';
      var mostChosenDistractor = null;
      var maxDistractorCount = 0;
      Object.keys(choiceCounts).forEach(function(choice) {
        if (choice !== correctAnswer && choiceCounts[choice] > maxDistractorCount) {
          maxDistractorCount = choiceCounts[choice];
          mostChosenDistractor = choice;
        }
      });

      // Calculate median time
      var timestamps = pollData.timestamps && pollData.timestamps.get(qIdx) || [];
      var medianTimeSec = 0;
      if (timestamps.length >= 2) {
        var sorted = timestamps.sort(function(a, b) { return a.timestamp - b.timestamp; });
        var firstTimestamp = sorted[0].timestamp;
        var times = timestamps.map(function(t) { return (t.timestamp - firstTimestamp) / 1000; })
          .filter(function(t) { return t > 0 && t < 600; });
        if (times.length > 0) {
          times.sort(function(a, b) { return a - b; });
          medianTimeSec = times[Math.floor(times.length / 2)];
        }
      }

      // Auto-flag items
      var flags = [];
      if (rbis < 0.15) flags.push('low-disc');
      if (correctPct > 90) flags.push('too-easy');
      if (correctPct < 30) flags.push('too-hard');
      if (medianTimeSec > 120) flags.push('slow');
      if (nonresponsePct > 20) flags.push('high-nonresponse');

      // Get topic/standard from question data (defaults if not present)
      var topic = question.topicTag || question.topic || 'Untagged';
      var standard = question.standardTag || question.standard || '';

      items.push({
        questionId: poll.pollId + '_Q' + qIdx,
        sessionId: poll.pollId,
        sessionName: poll.pollName,
        qNum: qIdx + 1,
        topic: topic,
        standard: standard,
        correctPct: Math.round(correctPct * 10) / 10,
        rbis: rbis,
        mostChosenDistractor: mostChosenDistractor,
        medianTimeSec: Math.round(medianTimeSec),
        nonresponsePct: Math.round(nonresponsePct * 10) / 10,
        flags: flags,
        choiceCounts: choiceCounts,
        total: responses.length,
        correctIndex: correctAnswer.charCodeAt(0) - 65, // A=0, B=1, C=2, D=3
        stemText: question.questionText || '',
        stemImageURL: question.questionImageURL || null,
        correctAnswer: correctAnswer,
        misconceptionTag: question.misconceptionTag || null
      });
    });
  });

  return items;
};

/**
 * Compute student-level aggregates
 * @param {Array} polls - Array of poll objects
 * @param {Map} responsesByPoll - Response map from buildResponseMaps
 * @returns {Object} Student aggregate data keyed by email
 */
Veritas.Models.Analytics.computeStudentAggregates = function(polls, responsesByPoll) {
  var studentData = {};
  var allClasses = new Set();

  // Track which polls are relevant to each student (based on their class)
  var studentRelevantPolls = new Map(); // email -> count of relevant polls

  polls.forEach(function(poll) {
    allClasses.add(poll.className);
    var roster = DataAccess.roster.getByClass(poll.className);
    roster.forEach(function(student) {
      if (!studentData[student.email]) {
        studentData[student.email] = {
          studentId: student.email,
          name: student.name,
          email: student.email,
          sessions: [],
          totalCorrect: 0,
          totalAnswered: 0,
          participationCount: 0,
          totalTime: 0,
          timeCount: 0,
          integrityCount: 0,
          topicPerformance: {}
        };
      }

      // Count this poll as relevant to this student
      studentRelevantPolls.set(student.email, (studentRelevantPolls.get(student.email) || 0) + 1);
    });
  });

  polls.forEach(function(poll) {
    var pollData = responsesByPoll.get(poll.pollId) || { responses: new Map(), violations: new Map(), timestamps: new Map() };
    var roster = DataAccess.roster.getByClass(poll.className);

    roster.forEach(function(student) {
      if (!studentData[student.email]) return;

      var sessionCorrect = 0;
      var sessionTotal = 0;
      var participated = false;

      poll.questions.forEach(function(question, qIdx) {
        var responses = pollData.responses.get(qIdx) || [];
        var studentResponse = responses.find(function(r) { return r.email === student.email; });

        if (studentResponse) {
          participated = true;
          sessionTotal++;
          if (studentResponse.isCorrect) sessionCorrect++;

          // Track topic performance
          var topic = question.topicTag || question.topic || 'Untagged';
          if (!studentData[student.email].topicPerformance[topic]) {
            studentData[student.email].topicPerformance[topic] = { correct: 0, total: 0 };
          }
          studentData[student.email].topicPerformance[topic].total++;
          if (studentResponse.isCorrect) {
            studentData[student.email].topicPerformance[topic].correct++;
          }
        }
      });

      if (participated) {
        studentData[student.email].participationCount++;
        studentData[student.email].totalCorrect += sessionCorrect;
        studentData[student.email].totalAnswered += sessionTotal;

        var sessionPct = sessionTotal > 0 ? (sessionCorrect / sessionTotal) * 100 : 0;
        studentData[student.email].sessions.push({
          sessionId: poll.pollId,
          sessionName: poll.pollName,
          date: poll.updatedAt || poll.createdAt,
          scorePct: Math.round(sessionPct * 10) / 10,
          correct: sessionCorrect,
          total: sessionTotal
        });
      }

      // Track integrity violations
      if (pollData.violations.has(student.email)) {
        studentData[student.email].integrityCount++;
      }
    });
  });

  // Calculate summary stats for each student
  Object.keys(studentData).forEach(function(email) {
    var student = studentData[email];
    student.successLast10 = student.totalAnswered > 0 ? (student.totalCorrect / student.totalAnswered) * 100 : 0;

    // Fix: Divide by the number of polls relevant to THIS student, not all polls
    var relevantPollCount = studentRelevantPolls.get(email) || 1;
    student.participationPct = relevantPollCount > 0 ? (student.participationCount / relevantPollCount) * 100 : 0;

    student.successLast10 = Math.round(student.successLast10 * 10) / 10;
    student.participationPct = Math.round(student.participationPct * 10) / 10;

    // Sort sessions by date (most recent first)
    student.sessions.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

    // Keep only last 10 sessions
    student.sessions = student.sessions.slice(0, 10);
  });

  return studentData;
};

/**
 * Compute topic-level aggregates
 * @param {Array} polls - Array of poll objects
 * @param {Map} responsesByPoll - Response map from buildResponseMaps
 * @returns {Array} Topic aggregate data
 */
Veritas.Models.Analytics.computeTopicAggregates = function(polls, responsesByPoll) {
  var topicData = {};

  polls.forEach(function(poll) {
    var pollData = responsesByPoll.get(poll.pollId) || { responses: new Map() };

    poll.questions.forEach(function(question, qIdx) {
      var topic = question.topicTag || question.topic || 'Untagged';
      var responses = pollData.responses.get(qIdx) || [];

      if (!topicData[topic]) {
        topicData[topic] = {
          topic: topic,
          totalCorrect: 0,
          totalAnswered: 0,
          questionCount: 0,
          sessionCounts: new Map()
        };
      }

      topicData[topic].questionCount++;

      responses.forEach(function(r) {
        topicData[topic].totalAnswered++;
        if (r.isCorrect) topicData[topic].totalCorrect++;
      });

      // Track per-session performance
      var correctCount = responses.filter(function(r) { return r.isCorrect; }).length;
      var sessionKey = poll.pollId + '_' + poll.updatedAt;
      topicData[topic].sessionCounts.set(sessionKey, {
        sessionId: poll.pollId,
        sessionName: poll.pollName,
        date: poll.updatedAt || poll.createdAt,
        masteryPct: responses.length > 0 ? (correctCount / responses.length) * 100 : 0,
        n: responses.length
      });
    });
  });

  // Convert to array and calculate mastery percentages
  return Object.keys(topicData).map(function(topic) {
    var data = topicData[topic];
    var masteryPct = data.totalAnswered > 0 ? (data.totalCorrect / data.totalAnswered) * 100 : 0;

    return {
      topic: topic,
      masteryPct: Math.round(masteryPct * 10) / 10,
      questionCount: data.questionCount,
      totalAnswered: data.totalAnswered,
      sessions: Array.from(data.sessionCounts.values())
    };
  });
};

/**
 * Compute KPIs for the overview dashboard
 * @param {Array} sessionAggregates - Session aggregate data
 * @param {Object} studentAggregates - Student aggregate data
 * @returns {Array} KPI data for dashboard
 */
Veritas.Models.Analytics.computeKPIs = function(sessionAggregates, studentAggregates) {
  // Sort sessions by date
  var sortedSessions = sessionAggregates.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

  // Last 5 sessions
  var last5 = sortedSessions.slice(0, 5);
  var prior5 = sortedSessions.slice(5, 10);

  // Mastery (Last 5)
  var masteryLast5 = last5.length > 0
    ? last5.reduce(function(sum, s) { return sum + s.masteryPct; }, 0) / last5.length
    : 0;
  var masteryPrior5 = prior5.length > 0
    ? prior5.reduce(function(sum, s) { return sum + s.masteryPct; }, 0) / prior5.length
    : masteryLast5;
  var masteryDelta = masteryLast5 - masteryPrior5;

  // Participation: Average participation per session instead of mixing aggregates from different populations
  var participationPct = last5.length > 0
    ? last5.reduce(function(sum, s) { return sum + s.participationPct; }, 0) / last5.length
    : 0;

  // Calculate total participating students and average roster size for tooltip
  var avgRosterSize = last5.length > 0
    ? last5.reduce(function(sum, s) { return sum + s.totalStudents; }, 0) / last5.length
    : 0;
  var avgParticipants = last5.length > 0
    ? last5.reduce(function(sum, s) { return sum + s.participants; }, 0) / last5.length
    : 0;

  // Time discipline (simplified - would need more detailed timestamp data)
  var avgTime = last5.length > 0
    ? last5.reduce(function(sum, s) { return sum + s.medianTimeSec; }, 0) / last5.length
    : 0;
  var presetTime = 60; // Assume 60s preset for now
  var timeDelta = avgTime - presetTime;

  // Integrity pulse
  var avgIntegrity = last5.length > 0
    ? last5.reduce(function(sum, s) { return sum + s.integrityRate; }, 0) / last5.length
    : 0;

  return [
    {
      label: 'Mastery (Last 5)',
      value: Math.round(masteryLast5 * 10) / 10 + '%',
      delta: Math.round(masteryDelta * 10) / 10,
      tooltip: 'Average score across last 5 sessions. ' + (masteryDelta >= 0 ? 'Up' : 'Down') + ' ' + Math.abs(Math.round(masteryDelta)) + ' pts vs prior 5.',
      route: '/analytics/overview'
    },
    {
      label: 'Participation',
      value: Math.round(participationPct) + '%',
      tooltip: 'Average participation across last 5 sessions: ' + Math.round(avgParticipants) + ' of ' + Math.round(avgRosterSize) + ' students per session.',
      route: '/analytics/students'
    },
    {
      label: 'Time Discipline',
      value: (timeDelta >= 0 ? '+' : '') + Math.round(timeDelta) + 's',
      tooltip: 'Median time to submit is ' + Math.round(timeDelta) + 's ' + (timeDelta >= 0 ? 'over' : 'under') + ' preset.',
      route: '/analytics/items'
    },
    {
      label: 'Integrity Pulse',
      value: Math.round(avgIntegrity * 10) / 10,
      tooltip: Math.round(avgIntegrity * 10) / 10 + ' lockout/tab-exit events per 10 students. ' + (avgIntegrity < 0.5 ? 'Excellent focus!' : avgIntegrity < 1.0 ? 'Good focus.' : 'Some integrity concerns.'),
      route: '/analytics/overview'
    }
  ];
};

// =============================================================================
// PSYCHOMETRIC ANALYSIS (Batch 2)
// =============================================================================

/**
 * Get comprehensive post-poll analytics report with psychometric metrics
 * Provides standardized assessment quality analysis
 * @param {string} pollId - Poll ID to analyze
 * @returns {Object} Comprehensive analytics including class overview, item analysis, metacognition, distribution
 */
Veritas.Models.Analytics.getPostPollAnalytics = function(pollId) {
  return withErrorHandling(function() {
    var poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      return { success: false, error: 'Poll not found' };
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var responsesSheet = ss.getSheetByName('Responses');
    var responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];
    var roster = DataAccess.roster.getByClass(poll.className);

    // Filter responses for this poll
    var pollResponses = responseValues.filter(function(row) { return row[2] === pollId; });

    // Build response data structure
    var responsesByQuestion = Veritas.Models.Analytics.buildResponsesByQuestion(pollResponses);
    var studentTotalScores = Veritas.Models.Analytics.calculateStudentTotalScores(poll, responsesByQuestion);

    // Compute comprehensive metrics
    var classOverview = Veritas.Models.Analytics.computeClassOverview(poll, responsesByQuestion, studentTotalScores, roster);
    var itemAnalysis = Veritas.Models.Analytics.computeItemAnalysis(poll, responsesByQuestion, studentTotalScores);
    var metacognitionAnalysis = Veritas.Models.Analytics.computeMetacognitionAnalysis(poll, responsesByQuestion);
    var distributionAnalysis = Veritas.Models.Analytics.computeDistributionAnalysis(studentTotalScores, poll.questions.length);

    return {
      success: true,
      pollId: pollId,
      pollName: poll.pollName,
      className: poll.className,
      questionCount: poll.questions.length,
      classOverview: classOverview,
      itemAnalysis: itemAnalysis,
      metacognition: metacognitionAnalysis,
      distribution: distributionAnalysis
    };
  })();
};

/**
 * Build responses organized by question index
 * @param {Array} pollResponses - Filtered responses for a specific poll
 * @returns {Map} Map of questionIndex -> array of response objects
 */
Veritas.Models.Analytics.buildResponsesByQuestion = function(pollResponses) {
  var byQuestion = new Map();

  pollResponses.forEach(function(row) {
    var questionIndex = typeof row[3] === 'number' ? row[3] : parseInt(row[3], 10);
    if (isNaN(questionIndex) || questionIndex < 0) return;

    var studentEmail = (row[4] || '').toString().trim();
    var answer = row[5];
    var isCorrectRaw = row[6];
    var confidenceLevel = row[7] || null;
    var timestamp = row[1];

    var isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') ||
                     (isCorrectRaw === 'true') || (isCorrectRaw === 1);

    if (!byQuestion.has(questionIndex)) {
      byQuestion.set(questionIndex, []);
    }

    byQuestion.get(questionIndex).push({
      email: studentEmail,
      answer: answer,
      isCorrect: isCorrect,
      confidence: confidenceLevel,
      timestamp: timestamp
    });
  });

  return byQuestion;
};

/**
 * Calculate total scores for each student (for discrimination analysis)
 * @param {Object} poll - Poll object
 * @param {Map} responsesByQuestion - Responses organized by question
 * @returns {Map} Map of studentEmail -> total score
 */
Veritas.Models.Analytics.calculateStudentTotalScores = function(poll, responsesByQuestion) {
  var scores = new Map();

  poll.questions.forEach(function(question, qIdx) {
    var responses = responsesByQuestion.get(qIdx) || [];
    responses.forEach(function(r) {
      if (!scores.has(r.email)) {
        scores.set(r.email, 0);
      }
      if (r.isCorrect) {
        scores.set(r.email, scores.get(r.email) + 1);
      }
    });
  });

  return scores;
};

/**
 * Compute class overview statistics
 * @param {Object} poll - Poll object
 * @param {Map} responsesByQuestion - Responses organized by question
 * @param {Map} studentTotalScores - Total scores per student
 * @param {Array} roster - Class roster
 * @returns {Object} Class statistics (mean, median, std dev, distribution)
 */
Veritas.Models.Analytics.computeClassOverview = function(poll, responsesByQuestion, studentTotalScores, roster) {
  var scores = Array.from(studentTotalScores.values());

  if (scores.length === 0) {
    return {
      responseCount: 0,
      participantCount: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      scoreDistribution: []
    };
  }

  // Calculate basic statistics
  var mean = scores.reduce(function(a, b) { return a + b; }, 0) / scores.length;
  var sortedScores = scores.slice().sort(function(a, b) { return a - b; });
  var median = sortedScores[Math.floor(sortedScores.length / 2)];

  // Standard deviation
  var variance = scores.reduce(function(sum, score) { return sum + Math.pow(score - mean, 2); }, 0) / scores.length;
  var stdDev = Math.sqrt(variance);

  // Score distribution (histogram data)
  var maxScore = poll.questions.length;
  var distribution = Array(maxScore + 1).fill(0);
  scores.forEach(function(score) {
    if (score >= 0 && score <= maxScore) {
      distribution[score]++;
    }
  });

  var scoreDistribution = distribution.map(function(count, score) {
    return {
      score: score,
      count: count,
      percentage: (count / scores.length) * 100
    };
  });

  return {
    responseCount: scores.reduce(function(sum, _) { return sum + poll.questions.length; }, 0),
    participantCount: scores.length,
    rosterSize: roster.length,
    mean: Math.round(mean * 100) / 100,
    median: median,
    stdDev: Math.round(stdDev * 100) / 100,
    min: Math.min.apply(null, scores),
    max: Math.max.apply(null, scores),
    scoreDistribution: scoreDistribution
  };
};

/**
 * Compute item-level psychometric analysis with distractor analysis
 * @param {Object} poll - Poll object
 * @param {Map} responsesByQuestion - Responses organized by question
 * @param {Map} studentTotalScores - Total scores per student
 * @returns {Array} Item analysis for each question
 */
Veritas.Models.Analytics.computeItemAnalysis = function(poll, responsesByQuestion, studentTotalScores) {
  var items = [];

  poll.questions.forEach(function(question, qIdx) {
    var responses = responsesByQuestion.get(qIdx) || [];

    if (responses.length === 0) {
      items.push({
        questionIndex: qIdx,
        questionText: question.questionText || '',
        difficulty: 0,
        discrimination: 0,
        distractorAnalysis: [],
        flags: ['no-data'],
        responseCount: 0
      });
      return;
    }

    // Item Difficulty (P-Value)
    var correctCount = responses.filter(function(r) { return r.isCorrect; }).length;
    var difficulty = correctCount / responses.length;

    // Item Discrimination (using upper/lower 27% groups)
    var discrimination = Veritas.Models.Analytics.calculateDiscriminationIndex(responses, studentTotalScores);

    // Distractor Analysis
    var distractorAnalysis = Veritas.Models.Analytics.computeDistractorAnalysis(question, responses, studentTotalScores);

    // Auto-flag problematic items
    var flags = [];
    if (discrimination < 0.15) flags.push('low-discrimination');
    if (discrimination < 0) flags.push('negative-discrimination');
    if (difficulty > 0.9) flags.push('too-easy');
    if (difficulty < 0.3) flags.push('too-hard');

    // Check for problematic distractors (high performers choosing them)
    var problematicDistractor = distractorAnalysis.find(function(d) {
      return !d.isCorrect && d.highGroupPct > d.lowGroupPct + 10;
    });
    if (problematicDistractor) flags.push('problematic-distractor');

    items.push({
      questionIndex: qIdx,
      questionText: question.questionText || '',
      questionImageURL: question.questionImageURL || null,
      difficulty: Math.round(difficulty * 100) / 100,
      difficultyPct: Math.round(difficulty * 100),
      discrimination: Math.round(discrimination * 100) / 100,
      distractorAnalysis: distractorAnalysis,
      flags: flags,
      responseCount: responses.length,
      correctAnswer: question.correctAnswer
    });
  });

  return items;
};

/**
 * Calculate discrimination index using upper/lower 27% groups
 * Simplified discrimination index method
 * @param {Array} responses - Responses for a question
 * @param {Map} studentTotalScores - Total scores per student
 * @returns {number} Discrimination index (-1 to 1)
 */
Veritas.Models.Analytics.calculateDiscriminationIndex = function(responses, studentTotalScores) {
  if (responses.length < 10) return 0; // Need minimum sample size

  // Get total scores for students who answered this question
  var scoredResponses = responses
    .map(function(r) {
      return {
        email: r.email,
        isCorrect: r.isCorrect,
        totalScore: studentTotalScores.get(r.email) || 0
      };
    })
    .sort(function(a, b) { return b.totalScore - a.totalScore; });

  // Calculate 27% group sizes
  var groupSize = Math.max(1, Math.floor(scoredResponses.length * 0.27));
  var highGroup = scoredResponses.slice(0, groupSize);
  var lowGroup = scoredResponses.slice(-groupSize);

  // Calculate percentage correct in each group
  var highCorrect = highGroup.filter(function(r) { return r.isCorrect; }).length / highGroup.length;
  var lowCorrect = lowGroup.filter(function(r) { return r.isCorrect; }).length / lowGroup.length;

  return highCorrect - lowCorrect;
};

/**
 * Compute distractor analysis - showing how each option performed
 * @param {Object} question - Question object
 * @param {Array} responses - Responses for this question
 * @param {Map} studentTotalScores - Total scores per student
 * @returns {Array} Analysis for each answer option
 */
Veritas.Models.Analytics.computeDistractorAnalysis = function(question, responses, studentTotalScores) {
  var analysis = [];
  var options = question.options || [];
  var correctAnswer = question.correctAnswer;

  // Get scored responses
  var scoredResponses = responses.map(function(r) {
    return {
      answer: r.answer,
      totalScore: studentTotalScores.get(r.email) || 0
    };
  });

  // Sort by total score
  scoredResponses.sort(function(a, b) { return b.totalScore - a.totalScore; });

  // Calculate 27% group sizes
  var groupSize = Math.max(1, Math.floor(scoredResponses.length * 0.27));
  var highGroup = scoredResponses.slice(0, groupSize);
  var lowGroup = scoredResponses.slice(-groupSize);

  // Analyze each option
  options.forEach(function(option, idx) {
    var optionText = typeof option === 'string' ? option : option.text;
    var isCorrect = optionText === correctAnswer;

    // Count selections
    var totalSelections = responses.filter(function(r) { return r.answer === optionText; }).length;
    var highGroupSelections = highGroup.filter(function(r) { return r.answer === optionText; }).length;
    var lowGroupSelections = lowGroup.filter(function(r) { return r.answer === optionText; }).length;

    var totalPct = (totalSelections / responses.length) * 100;
    var highGroupPct = (highGroupSelections / highGroup.length) * 100;
    var lowGroupPct = (lowGroupSelections / lowGroup.length) * 100;

    // Distractor discrimination (should be negative for distractors)
    var discrimination = highGroupPct - lowGroupPct;

    analysis.push({
      option: optionText,
      optionLetter: String.fromCharCode(65 + idx), // A, B, C, D
      isCorrect: isCorrect,
      totalSelections: totalSelections,
      totalPct: Math.round(totalPct * 10) / 10,
      highGroupPct: Math.round(highGroupPct * 10) / 10,
      lowGroupPct: Math.round(lowGroupPct * 10) / 10,
      discrimination: Math.round(discrimination * 10) / 10,
      quality: isCorrect
        ? (discrimination > 0.3 ? 'excellent' : discrimination > 0.15 ? 'good' : 'poor')
        : (discrimination < -0.15 ? 'good' : discrimination > 0.15 ? 'problematic' : 'weak')
    });
  });

  return analysis;
};

/**
 * Compute metacognition analysis (confidence vs correctness matrix)
 * @param {Object} poll - Poll object
 * @param {Map} responsesByQuestion - Responses organized by question
 * @returns {Object} Metacognition analysis with overall and per-question matrices
 */
Veritas.Models.Analytics.computeMetacognitionAnalysis = function(poll, responsesByQuestion) {
  var matrix = {
    confidentCorrect: 0,      // Conscious Competence (Mastery)
    confidentIncorrect: 0,    // Confidently Wrong (RED ALERT)
    uncertainCorrect: 0,      // Imposter Syndrome (Lucky guess)
    uncertainIncorrect: 0     // Conscious Incompetence (Good - they know they don't know)
  };

  var totalWithConfidence = 0;
  var byQuestion = [];

  poll.questions.forEach(function(question, qIdx) {
    if (!question.metacognitionEnabled) {
      byQuestion.push(null);
      return;
    }

    var responses = responsesByQuestion.get(qIdx) || [];
    var questionMatrix = {
      confidentCorrect: 0,
      confidentIncorrect: 0,
      uncertainCorrect: 0,
      uncertainIncorrect: 0,
      total: 0
    };

    responses.forEach(function(r) {
      if (!r.confidence) return;

      totalWithConfidence++;
      questionMatrix.total++;

      var isConfident = (r.confidence === 'very-sure' || r.confidence === 'certain');
      var isCorrect = r.isCorrect;

      if (isConfident && isCorrect) {
        matrix.confidentCorrect++;
        questionMatrix.confidentCorrect++;
      } else if (isConfident && !isCorrect) {
        matrix.confidentIncorrect++;
        questionMatrix.confidentIncorrect++;
      } else if (!isConfident && isCorrect) {
        matrix.uncertainCorrect++;
        questionMatrix.uncertainCorrect++;
      } else {
        matrix.uncertainIncorrect++;
        questionMatrix.uncertainIncorrect++;
      }
    });

    byQuestion.push({
      questionIndex: qIdx,
      questionText: question.questionText || '',
      matrix: questionMatrix,
      confidentlyIncorrectPct: questionMatrix.total > 0
        ? Math.round((questionMatrix.confidentIncorrect / questionMatrix.total) * 100)
        : 0
    });
  });

  var totalPct = totalWithConfidence > 0 ? {
    confidentCorrect: Math.round((matrix.confidentCorrect / totalWithConfidence) * 100),
    confidentIncorrect: Math.round((matrix.confidentIncorrect / totalWithConfidence) * 100),
    uncertainCorrect: Math.round((matrix.uncertainCorrect / totalWithConfidence) * 100),
    uncertainIncorrect: Math.round((matrix.uncertainIncorrect / totalWithConfidence) * 100)
  } : null;

  return {
    enabled: poll.questions.some(function(q) { return q.metacognitionEnabled; }),
    overall: totalPct,
    overallCounts: matrix,
    byQuestion: byQuestion.filter(function(q) { return q !== null; }),
    totalResponses: totalWithConfidence
  };
};

/**
 * Compute distribution analysis with Z-scores
 * @param {Map} studentTotalScores - Total scores per student
 * @param {number} maxScore - Maximum possible score
 * @returns {Object} Histogram and z-scores for each student
 */
Veritas.Models.Analytics.computeDistributionAnalysis = function(studentTotalScores, maxScore) {
  var scores = Array.from(studentTotalScores.entries());

  if (scores.length === 0) {
    return {
      histogram: [],
      zScores: []
    };
  }

  var values = scores.map(function(entry) { return entry[1]; });
  var mean = values.reduce(function(a, b) { return a + b; }, 0) / values.length;
  var variance = values.reduce(function(sum, score) { return sum + Math.pow(score - mean, 2); }, 0) / values.length;
  var stdDev = Math.sqrt(variance);

  // Calculate Z-scores for each student
  var zScores = scores.map(function(entry) {
    return {
      email: entry[0],
      score: entry[1],
      zScore: stdDev > 0 ? Math.round(((entry[1] - mean) / stdDev) * 100) / 100 : 0
    };
  });

  // Create histogram
  var distribution = Array(maxScore + 1).fill(0);
  values.forEach(function(score) {
    if (score >= 0 && score <= maxScore) {
      distribution[score]++;
    }
  });

  var histogram = distribution.map(function(count, score) {
    return {
      score: score,
      count: count,
      percentage: (count / values.length) * 100
    };
  });

  return {
    histogram: histogram,
    zScores: zScores
  };
};

// =============================================================================
// ENHANCED ANALYTICS WITH INTERPRETATIONS (Batch 3 - TODO)
// =============================================================================
// Functions: getEnhancedPostPollAnalytics, interpret* functions (12 total),
// generateTeacherActionItems
//
// TODO: Extract in next batch
// =============================================================================

// =============================================================================
// STUDENT INSIGHTS & DASHBOARD (Batch 4 - TODO)
// =============================================================================
// Functions: getStudentInsights, getStudentHistoricalAnalytics,
// getLivePollData, getDashboardSummary, helper functions
//
// TODO: Extract in next batch
// =============================================================================

// =============================================================================
// LEGACY COMPATIBILITY WRAPPERS
// =============================================================================

function getAnalyticsData(filters) {
  return Veritas.Models.Analytics.getAnalyticsData(filters);
}

function buildResponseMaps_(responseValues) {
  return Veritas.Models.Analytics.buildResponseMaps(responseValues);
}

function computeSessionAggregates_(polls, responsesByPoll) {
  return Veritas.Models.Analytics.computeSessionAggregates(polls, responsesByPoll);
}

function calculatePointBiserial_(itemScores, totalScores) {
  return Veritas.Models.Analytics.calculatePointBiserial(itemScores, totalScores);
}

function computeItemAggregates_(polls, responsesByPoll) {
  return Veritas.Models.Analytics.computeItemAggregates(polls, responsesByPoll);
}

function computeStudentAggregates_(polls, responsesByPoll) {
  return Veritas.Models.Analytics.computeStudentAggregates(polls, responsesByPoll);
}

function computeTopicAggregates_(polls, responsesByPoll) {
  return Veritas.Models.Analytics.computeTopicAggregates(polls, responsesByPoll);
}

function computeKPIs_(sessionAggregates, studentAggregates) {
  return Veritas.Models.Analytics.computeKPIs(sessionAggregates, studentAggregates);
}

// Psychometric Analysis wrappers
function getPostPollAnalytics(pollId) {
  return Veritas.Models.Analytics.getPostPollAnalytics(pollId);
}

function buildResponsesByQuestion_(pollResponses) {
  return Veritas.Models.Analytics.buildResponsesByQuestion(pollResponses);
}

function calculateStudentTotalScores_(poll, responsesByQuestion) {
  return Veritas.Models.Analytics.calculateStudentTotalScores(poll, responsesByQuestion);
}

function computeClassOverview_(poll, responsesByQuestion, studentTotalScores, roster) {
  return Veritas.Models.Analytics.computeClassOverview(poll, responsesByQuestion, studentTotalScores, roster);
}

function computeItemAnalysis_(poll, responsesByQuestion, studentTotalScores) {
  return Veritas.Models.Analytics.computeItemAnalysis(poll, responsesByQuestion, studentTotalScores);
}

function calculateDiscriminationIndex_(responses, studentTotalScores) {
  return Veritas.Models.Analytics.calculateDiscriminationIndex(responses, studentTotalScores);
}

function computeDistractorAnalysis_(question, responses, studentTotalScores) {
  return Veritas.Models.Analytics.computeDistractorAnalysis(question, responses, studentTotalScores);
}

function computeMetacognitionAnalysis_(poll, responsesByQuestion) {
  return Veritas.Models.Analytics.computeMetacognitionAnalysis(poll, responsesByQuestion);
}

function computeDistributionAnalysis_(studentTotalScores, maxScore) {
  return Veritas.Models.Analytics.computeDistributionAnalysis(studentTotalScores, maxScore);
}
