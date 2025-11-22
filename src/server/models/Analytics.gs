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
// ENHANCED ANALYTICS WITH INTERPRETATIONS (Batch 3)
// =============================================================================

/**
 * Get enhanced post-poll analytics with contextual interpretations
 * Builds on existing getPostPollAnalytics with better guidance
 * @param {string} pollId - Poll ID to analyze
 * @returns {Object} Enhanced analytics with interpretations and action items
 */
Veritas.Models.Analytics.getEnhancedPostPollAnalytics = function(pollId) {
  return withErrorHandling(function() {
    // Get base analytics
    var baseAnalytics = Veritas.Models.Analytics.getPostPollAnalytics(pollId);
    if (!baseAnalytics.success) return baseAnalytics;

    // Add contextual interpretations
    var enhanced = JSON.parse(JSON.stringify(baseAnalytics)); // Deep clone

    // Interpret class performance
    var classOverview = enhanced.classOverview;
    classOverview.interpretation = {
      participation: Veritas.Models.Analytics.interpretParticipation(classOverview.participantCount, classOverview.rosterSize),
      meanScore: Veritas.Models.Analytics.interpretMeanScore(classOverview.mean, enhanced.questionCount),
      stdDev: Veritas.Models.Analytics.interpretStdDev(classOverview.stdDev, enhanced.questionCount),
      distribution: Veritas.Models.Analytics.interpretDistribution(classOverview.scoreDistribution)
    };

    // Interpret each item
    enhanced.itemAnalysis.forEach(function(item) {
      item.interpretation = {
        difficulty: Veritas.Models.Analytics.interpretDifficulty(item.difficulty),
        discrimination: Veritas.Models.Analytics.interpretDiscrimination(item.discrimination),
        overall: Veritas.Models.Analytics.interpretItemQuality(item.difficulty, item.discrimination),
        actionable: Veritas.Models.Analytics.getItemActionableInsights(item)
      };
    });

    // Add priority flags for teacher action
    enhanced.teacherActionItems = Veritas.Models.Analytics.generateTeacherActionItems(enhanced);

    return enhanced;
  })();
};

/**
 * Interpret participation rate
 * @param {number} participated - Number of students who participated
 * @param {number} total - Total number of students in roster
 * @returns {Object} Interpretation with level, message, and color
 */
Veritas.Models.Analytics.interpretParticipation = function(participated, total) {
  if (total === 0) return { level: 'unknown', message: 'No roster data available', color: 'gray' };
  var rate = (participated / total) * 100;
  if (rate >= 90) return { level: 'excellent', message: Math.round(rate) + '% participation - Excellent engagement', color: 'green' };
  if (rate >= 75) return { level: 'good', message: Math.round(rate) + '% participation - Good engagement', color: 'green' };
  if (rate >= 50) return { level: 'moderate', message: Math.round(rate) + '% participation - Consider checking in with absent students', color: 'yellow' };
  return { level: 'low', message: Math.round(rate) + '% participation - LOW - Check for technical issues or student barriers', color: 'red' };
};

/**
 * Interpret mean score
 * @param {number} mean - Mean score
 * @param {number} maxScore - Maximum possible score
 * @returns {Object} Interpretation with level, message, and color
 */
Veritas.Models.Analytics.interpretMeanScore = function(mean, maxScore) {
  if (maxScore === 0) return { level: 'unknown', message: 'No questions', color: 'gray' };
  var pct = (mean / maxScore) * 100;
  if (pct >= 85) return { level: 'high', message: Math.round(pct) + '% average - Strong class mastery', color: 'green' };
  if (pct >= 70) return { level: 'good', message: Math.round(pct) + '% average - Good understanding, some review needed', color: 'green' };
  if (pct >= 50) return { level: 'moderate', message: Math.round(pct) + '% average - MODERATE - Significant concepts need reteaching', color: 'yellow' };
  return { level: 'low', message: Math.round(pct) + '% average - LOW - Major instructional intervention needed', color: 'red' };
};

/**
 * Interpret standard deviation
 * @param {number} stdDev - Standard deviation
 * @param {number} maxScore - Maximum possible score
 * @returns {Object} Interpretation with level, message, and color
 */
Veritas.Models.Analytics.interpretStdDev = function(stdDev, maxScore) {
  if (maxScore === 0) return { level: 'unknown', message: '', color: 'gray' };
  var pct = (stdDev / maxScore) * 100;
  if (pct >= 30) return { level: 'high', message: 'High spread - Students have very different mastery levels', color: 'blue' };
  if (pct >= 15) return { level: 'moderate', message: 'Moderate spread - Some differentiation in performance', color: 'blue' };
  return { level: 'low', message: 'Low spread - Class performed similarly (good if scores are high, concerning if low)', color: 'blue' };
};

/**
 * Interpret score distribution pattern
 * @param {Array} scoreDistribution - Array of {score, count, percentage}
 * @returns {Object} Interpretation with pattern and message
 */
Veritas.Models.Analytics.interpretDistribution = function(scoreDistribution) {
  if (!scoreDistribution || scoreDistribution.length === 0) {
    return { pattern: 'unknown', message: '' };
  }

  var maxScore = scoreDistribution.length - 1;

  // Find peak
  var peakScore = 0;
  var peakCount = 0;
  scoreDistribution.forEach(function(item) {
    if (item.count > peakCount) {
      peakCount = item.count;
      peakScore = item.score;
    }
  });

  if (peakScore >= maxScore * 0.8) {
    return { pattern: 'high-peak', message: 'Most students scored very well - poll may have been too easy or material well-taught' };
  } else if (peakScore <= maxScore * 0.3) {
    return { pattern: 'low-peak', message: 'Most students struggled - consider reteaching or reviewing question clarity' };
  } else {
    return { pattern: 'normal', message: 'Scores spread across range - good discriminating assessment' };
  }
};

/**
 * Interpret item difficulty (P-value)
 * @param {number} pValue - Difficulty (proportion correct, 0-1)
 * @returns {Object} Interpretation with level, message, and color
 */
Veritas.Models.Analytics.interpretDifficulty = function(pValue) {
  if (pValue >= 0.9) return { level: 'very-easy', message: 'Very Easy (>90% correct) - May not differentiate student understanding', color: 'blue' };
  if (pValue >= 0.75) return { level: 'easy', message: 'Easy (75-90% correct) - Good confidence builder', color: 'green' };
  if (pValue >= 0.5) return { level: 'moderate', message: 'Moderate (50-75% correct) - Ideal difficulty range', color: 'green' };
  if (pValue >= 0.3) return { level: 'hard', message: 'Hard (30-50% correct) - Challenging but fair', color: 'yellow' };
  return { level: 'very-hard', message: 'Very Hard (<30% correct) - Most students missed this - Review question or reteach concept', color: 'red' };
};

/**
 * Interpret item discrimination index
 * @param {number} discrimination - Discrimination index (-1 to 1)
 * @returns {Object} Interpretation with level, message, and color
 */
Veritas.Models.Analytics.interpretDiscrimination = function(discrimination) {
  if (discrimination >= 0.4) return { level: 'excellent', message: 'Excellent (>0.4) - Powerfully separates high/low performers', color: 'green' };
  if (discrimination >= 0.3) return { level: 'good', message: 'Good (0.3-0.4) - Effectively distinguishes understanding', color: 'green' };
  if (discrimination >= 0.15) return { level: 'fair', message: 'Fair (0.15-0.3) - Some discrimination but could be improved', color: 'yellow' };
  if (discrimination >= 0) return { level: 'poor', message: 'Poor (0-0.15) - Barely distinguishes students - Review question quality', color: 'orange' };
  return { level: 'negative', message: 'NEGATIVE (<0) - FLAWED - High performers got it wrong! Check answer key or question wording', color: 'red' };
};

/**
 * Interpret overall item quality based on difficulty and discrimination
 * @param {number} difficulty - Item difficulty (0-1)
 * @param {number} discrimination - Discrimination index (-1 to 1)
 * @returns {Object} Quality assessment with quality level and message
 */
Veritas.Models.Analytics.interpretItemQuality = function(difficulty, discrimination) {
  // Ideal zone: 0.3 < difficulty < 0.8, discrimination > 0.3
  if (difficulty >= 0.3 && difficulty <= 0.8 && discrimination >= 0.3) {
    return { quality: 'excellent', message: '⭐ Excellent Question - Keep for future assessments' };
  } else if (difficulty >= 0.3 && difficulty <= 0.8 && discrimination >= 0.15) {
    return { quality: 'good', message: '✓ Good Question - Minor tweaks could improve' };
  } else if (discrimination < 0) {
    return { quality: 'flawed', message: '⚠ Flawed Question - Immediate review needed' };
  } else if (difficulty < 0.3 || difficulty > 0.9) {
    return { quality: 'needs-adjustment', message: '⚡ Adjust Difficulty - Question too easy or too hard' };
  } else {
    return { quality: 'fair', message: '◐ Fair Question - Consider revision' };
  }
};

/**
 * Get actionable insights for a specific item
 * @param {Object} item - Item analysis object with flags
 * @returns {Array} Array of actionable insight strings
 */
Veritas.Models.Analytics.getItemActionableInsights = function(item) {
  var insights = [];

  if (item.flags.indexOf('negative-discrimination') !== -1) {
    insights.push('URGENT: Check answer key - high performers chose wrong answer');
  }
  if (item.flags.indexOf('problematic-distractor') !== -1) {
    insights.push('Review distractors - one is confusing high performers');
  }
  if (item.flags.indexOf('too-hard') !== -1 && item.discrimination < 0.15) {
    insights.push('Question is both hard AND non-discriminating - likely needs major revision');
  }
  if (item.flags.indexOf('too-easy') !== -1) {
    insights.push('Consider making this question more challenging or use as warm-up');
  }
  if (item.difficulty >= 0.3 && item.difficulty <= 0.8 && item.discrimination >= 0.3) {
    insights.push('Excellent question - save for future use');
  }

  return insights;
};

/**
 * Generate teacher action items based on analytics
 * @param {Object} analytics - Complete analytics object
 * @returns {Array} Array of action item objects with priority, category, message
 */
Veritas.Models.Analytics.generateTeacherActionItems = function(analytics) {
  var actionItems = [];

  // Check participation
  if (analytics.classOverview.participantCount < analytics.classOverview.rosterSize * 0.75) {
    actionItems.push({
      priority: 'high',
      category: 'participation',
      message: 'Only ' + analytics.classOverview.participantCount + '/' + analytics.classOverview.rosterSize + ' students participated - Follow up with absent students',
      count: analytics.classOverview.rosterSize - analytics.classOverview.participantCount
    });
  }

  // Check for flawed questions
  var flawedItems = analytics.itemAnalysis.filter(function(item) {
    return item.flags.indexOf('negative-discrimination') !== -1;
  });
  if (flawedItems.length > 0) {
    actionItems.push({
      priority: 'urgent',
      category: 'question-quality',
      message: flawedItems.length + ' question(s) have negative discrimination - REVIEW ANSWER KEYS IMMEDIATELY',
      items: flawedItems.map(function(item) {
        return { index: item.questionIndex, text: item.questionText };
      })
    });
  }

  // Check for concepts needing reteaching
  var veryHardItems = analytics.itemAnalysis.filter(function(item) {
    return item.difficulty < 0.3 && item.responseCount >= 5;
  });
  if (veryHardItems.length >= analytics.questionCount * 0.3) {
    actionItems.push({
      priority: 'high',
      category: 'instruction',
      message: veryHardItems.length + '/' + analytics.questionCount + ' questions were very hard (<30% correct) - Consider reteaching these concepts',
      items: veryHardItems.map(function(item) {
        return { index: item.questionIndex, text: item.questionText, pct: item.difficultyPct };
      })
    });
  }

  // Check metacognition red flags
  if (analytics.metacognition && analytics.metacognition.enabled) {
    var confidentIncorrectPct = analytics.metacognition.overall ? analytics.metacognition.overall.confidentIncorrect : 0;
    if (confidentIncorrectPct >= 20) {
      actionItems.push({
        priority: 'high',
        category: 'metacognition',
        message: confidentIncorrectPct + '% of responses were confidently incorrect - Students have misconceptions they\'re unaware of',
        data: analytics.metacognition.overall
      });
    }
  }

  return actionItems;
};

// =============================================================================
// STUDENT INSIGHTS & DASHBOARD (Batch 4)
// =============================================================================

/**
 * Get student insights for a class with performance flags
 * @param {string} className - Class name to analyze
 * @param {Object} options - Optional filters {dateFrom, dateTo}
 * @returns {Object} Student insights with flags and class statistics
 */
Veritas.Models.Analytics.getStudentInsights = function(className, options) {
  return withErrorHandling(function() {
    options = options || {};
    var dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
    var dateTo = options.dateTo ? new Date(options.dateTo) : null;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var responsesSheet = ss.getSheetByName('Responses');
    var proctorSheet = ss.getSheetByName('ProctorState');
    var responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];
    var proctorValues = proctorSheet ? getDataRangeValues_(proctorSheet) : [];

    var roster = DataAccess.roster.getByClass(className);
    var polls = DataAccess.polls.getByClass(className);

    // Filter polls by date if specified
    var filteredPolls = polls.filter(function(poll) {
      var pollDate = poll.createdAt ? new Date(poll.createdAt) : null;
      if (dateFrom && pollDate && pollDate < dateFrom) return false;
      if (dateTo && pollDate && pollDate > dateTo) return false;
      return true;
    });

    var pollIds = new Set(filteredPolls.map(function(p) { return p.pollId; }));

    // Build student profiles
    var studentProfiles = new Map();

    roster.forEach(function(student) {
      studentProfiles.set(student.email, {
        email: student.email,
        name: student.name,
        totalQuestions: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        accuracy: 0,
        participationRate: 0,
        violations: [],
        pollsParticipated: new Set(),
        averageZScore: 0,
        trend: 'stable', // 'improving', 'declining', 'stable'
        flags: [] // 'struggling', 'non-responder', 'rule-violator', 'high-performer', 'consistent'
      });
    });

    // Analyze responses
    responseValues.forEach(function(row) {
      var pollId = row[2];
      if (!pollIds.has(pollId)) return;

      var timestamp = row[1];
      if (dateFrom && timestamp && new Date(timestamp) < dateFrom) return;
      if (dateTo && timestamp && new Date(timestamp) > dateTo) return;

      var studentEmail = (row[4] || '').toString().trim();
      var answer = row[5];
      var isCorrectRaw = row[6];
      var isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);

      if (studentProfiles.has(studentEmail)) {
        var profile = studentProfiles.get(studentEmail);
        profile.questionsAnswered++;
        if (isCorrect) {
          profile.correctAnswers++;
        } else {
          profile.incorrectAnswers++;
        }
        profile.pollsParticipated.add(pollId);
      }
    });

    // Calculate total questions for each student
    filteredPolls.forEach(function(poll) {
      roster.forEach(function(student) {
        if (studentProfiles.has(student.email)) {
          var profile = studentProfiles.get(student.email);
          profile.totalQuestions += poll.questionCount || poll.questions.length;
        }
      });
    });

    // Analyze violations
    proctorValues.forEach(function(row) {
      if (row[0] && row[0] !== 'PollID') { // Skip header
        var pollId = row[0];
        if (!pollIds.has(pollId)) return;

        var studentEmail = (row[1] || '').toString().trim();
        var status = row[2];
        var lockReason = row[4] || '';
        var lockedAt = row[5] || '';

        if (status === 'LOCKED' && studentProfiles.has(studentEmail)) {
          var profile = studentProfiles.get(studentEmail);
          profile.violations.push({
            pollId: pollId,
            reason: lockReason,
            timestamp: lockedAt
          });
        }
      }
    });

    // Calculate metrics and assign flags
    var studentInsights = [];
    studentProfiles.forEach(function(profile, email) {
      // Calculate accuracy
      var totalAnswered = profile.correctAnswers + profile.incorrectAnswers;
      profile.accuracy = totalAnswered > 0 ? (profile.correctAnswers / totalAnswered) * 100 : 0;

      // Calculate participation rate
      profile.participationRate = profile.totalQuestions > 0
        ? (profile.questionsAnswered / profile.totalQuestions) * 100
        : 0;

      // Assign flags
      if (profile.accuracy < 50 && totalAnswered >= 5) {
        profile.flags.push('struggling');
      }
      if (profile.accuracy >= 85 && totalAnswered >= 5) {
        profile.flags.push('high-performer');
      }
      if (profile.participationRate < 50 && profile.totalQuestions >= 5) {
        profile.flags.push('non-responder');
      }
      if (profile.violations.length >= 2) {
        profile.flags.push('rule-violator');
      }
      if (profile.accuracy >= 75 && profile.participationRate >= 90) {
        profile.flags.push('consistent');
      }

      // Convert Set to array for JSON serialization
      profile.pollsParticipated = Array.from(profile.pollsParticipated);

      studentInsights.push(profile);
    });

    // Sort by flags (struggling and rule violators first)
    studentInsights.sort(function(a, b) {
      var aPriority = a.flags.indexOf('struggling') !== -1 || a.flags.indexOf('rule-violator') !== -1 ? 0 : 1;
      var bPriority = b.flags.indexOf('struggling') !== -1 || b.flags.indexOf('rule-violator') !== -1 ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.accuracy - a.accuracy;
    });

    // Calculate class-wide statistics
    var classStats = {
      totalStudents: studentInsights.length,
      strugglingCount: studentInsights.filter(function(s) { return s.flags.indexOf('struggling') !== -1; }).length,
      nonResponderCount: studentInsights.filter(function(s) { return s.flags.indexOf('non-responder') !== -1; }).length,
      ruleViolatorCount: studentInsights.filter(function(s) { return s.flags.indexOf('rule-violator') !== -1; }).length,
      highPerformerCount: studentInsights.filter(function(s) { return s.flags.indexOf('high-performer') !== -1; }).length,
      averageAccuracy: studentInsights.reduce(function(sum, s) { return sum + s.accuracy; }, 0) / studentInsights.length || 0,
      averageParticipation: studentInsights.reduce(function(sum, s) { return sum + s.participationRate; }, 0) / studentInsights.length || 0
    };

    return {
      success: true,
      className: className,
      dateRange: { from: dateFrom, to: dateTo },
      classStats: classStats,
      students: studentInsights,
      pollsAnalyzed: filteredPolls.length
    };
  })();
};

/**
 * Get detailed historical analytics for a specific student
 * Includes performance trends, violation history, and per-poll breakdown
 * @param {string} studentEmail - Student email to analyze
 * @param {string} className - Class name
 * @param {Object} options - Optional filters {dateFrom, dateTo}
 * @returns {Object} Historical analytics with trends and confidence data
 */
Veritas.Models.Analytics.getStudentHistoricalAnalytics = function(studentEmail, className, options) {
  return withErrorHandling(function() {
    options = options || {};
    var dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
    var dateTo = options.dateTo ? new Date(options.dateTo) : null;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var responsesSheet = ss.getSheetByName('Responses');
    var proctorSheet = ss.getSheetByName('ProctorState');
    var responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];
    var proctorValues = proctorSheet ? getDataRangeValues_(proctorSheet) : [];

    var polls = DataAccess.polls.getByClass(className);

    // Filter polls by date
    var filteredPolls = polls.filter(function(poll) {
      var pollDate = poll.createdAt ? new Date(poll.createdAt) : null;
      if (dateFrom && pollDate && pollDate < dateFrom) return false;
      if (dateTo && pollDate && pollDate > dateTo) return false;
      return true;
    }).sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });

    // Build per-poll performance
    var pollPerformance = [];
    var overallStats = {
      totalPolls: filteredPolls.length,
      pollsParticipated: 0,
      totalQuestions: 0,
      questionsAnswered: 0,
      correctAnswers: 0,
      accuracy: 0,
      violations: [],
      confidenceData: {
        confidentCorrect: 0,
        confidentIncorrect: 0,
        uncertainCorrect: 0,
        uncertainIncorrect: 0
      }
    };

    filteredPolls.forEach(function(poll) {
      var pollResponses = responseValues.filter(function(row) {
        return row[2] === poll.pollId && (row[4] || '').toString().trim() === studentEmail;
      });

      var correctCount = pollResponses.filter(function(r) {
        var isCorrectRaw = r[6];
        return (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);
      }).length;

      var totalQuestions = poll.questionCount || poll.questions.length;
      var answered = pollResponses.length;
      var accuracy = answered > 0 ? (correctCount / answered) * 100 : 0;

      // Check for violations in this poll
      var pollViolations = proctorValues.filter(function(row) {
        return row[0] === poll.pollId &&
               (row[1] || '').toString().trim() === studentEmail &&
               row[2] === 'LOCKED';
      });

      // Analyze confidence data
      var confidenceData = {
        confidentCorrect: 0,
        confidentIncorrect: 0,
        uncertainCorrect: 0,
        uncertainIncorrect: 0
      };

      pollResponses.forEach(function(r) {
        var confidence = r[7];
        var isCorrectRaw = r[6];
        var isCorrect = (isCorrectRaw === true) || (isCorrectRaw === 'TRUE') || (isCorrectRaw === 'true') || (isCorrectRaw === 1);
        var isConfident = (confidence === 'very-sure' || confidence === 'certain');

        if (confidence) {
          if (isConfident && isCorrect) {
            confidenceData.confidentCorrect++;
            overallStats.confidenceData.confidentCorrect++;
          } else if (isConfident && !isCorrect) {
            confidenceData.confidentIncorrect++;
            overallStats.confidenceData.confidentIncorrect++;
          } else if (!isConfident && isCorrect) {
            confidenceData.uncertainCorrect++;
            overallStats.confidenceData.uncertainCorrect++;
          } else {
            confidenceData.uncertainIncorrect++;
            overallStats.confidenceData.uncertainIncorrect++;
          }
        }
      });

      pollPerformance.push({
        pollId: poll.pollId,
        pollName: poll.pollName,
        date: poll.createdAt,
        totalQuestions: totalQuestions,
        questionsAnswered: answered,
        correctAnswers: correctCount,
        accuracy: Math.round(accuracy * 10) / 10,
        participated: answered > 0,
        violations: pollViolations.length,
        confidenceData: confidenceData
      });

      // Update overall stats
      overallStats.totalQuestions += totalQuestions;
      overallStats.questionsAnswered += answered;
      overallStats.correctAnswers += correctCount;
      if (answered > 0) overallStats.pollsParticipated++;
      pollViolations.forEach(function(v) {
        overallStats.violations.push({
          pollId: poll.pollId,
          pollName: poll.pollName,
          reason: v[4] || '',
          timestamp: v[5] || ''
        });
      });
    });

    overallStats.accuracy = overallStats.questionsAnswered > 0
      ? Math.round((overallStats.correctAnswers / overallStats.questionsAnswered) * 100 * 10) / 10
      : 0;

    // Calculate trend (last 5 polls vs previous 5 polls)
    var trend = 'stable';
    if (pollPerformance.length >= 10) {
      var recent5 = pollPerformance.slice(-5);
      var previous5 = pollPerformance.slice(-10, -5);
      var recentAvg = recent5.reduce(function(sum, p) { return sum + p.accuracy; }, 0) / 5;
      var previousAvg = previous5.reduce(function(sum, p) { return sum + p.accuracy; }, 0) / 5;

      if (recentAvg > previousAvg + 10) trend = 'improving';
      else if (recentAvg < previousAvg - 10) trend = 'declining';
    }

    return {
      success: true,
      studentEmail: studentEmail,
      className: className,
      dateRange: { from: dateFrom, to: dateTo },
      overallStats: overallStats,
      pollPerformance: pollPerformance,
      trend: trend
    };
  })();
};

/**
 * Get dashboard summary data (recent sessions and activity)
 * @returns {Object} Dashboard summary with recent sessions and activity trends
 */
Veritas.Models.Analytics.getDashboardSummary = function() {
  return withErrorHandling(function() {
    var cacheKey = 'DASHBOARD_SUMMARY';

    return CacheManager.get(cacheKey, function() {
      try {
        var analyticsData = Veritas.Models.Analytics.getAnalyticsData({});
        var sessions = analyticsData.sessions || [];

        // Get recent 5 sessions
        var recentSessions = sessions
          .sort(function(a, b) { return new Date(b.date) - new Date(a.date); })
          .slice(0, 5)
          .map(function(session) {
            return {
              sessionId: session.sessionId || '',
              sessionName: session.sessionName || 'Untitled',
              className: session.className || '',
              date: session.date || new Date().toISOString(),
              masteryPct: session.masteryPct || 0,
              participationPct: session.participationPct || 0,
              flags: (session.integrityRate > 1.5 && session.totalStudents) ? Math.round(session.integrityRate * session.totalStudents / 10) : 0
            };
          });

        // Calculate daily activity for the last 7 days
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var responsesSheet = ss.getSheetByName('Responses');
        var responseValues = responsesSheet ? getDataRangeValues_(responsesSheet) : [];

        var now = new Date();
        var sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));

        var dailyActivity = {};
        var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        // Initialize last 7 days
        for (var i = 6; i >= 0; i--) {
          var date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
          var dateKey = date.toISOString().split('T')[0];
          var dayName = i === 0 ? 'Today' : dayNames[date.getDay()];
          dailyActivity[dateKey] = {
            date: dateKey,
            dayName: dayName,
            count: 0
          };
        }

        // Count responses by day
        responseValues.forEach(function(row) {
          var timestamp = row[1]; // Timestamp column
          if (timestamp && timestamp >= sevenDaysAgo) {
            var dateKey = new Date(timestamp).toISOString().split('T')[0];
            if (dailyActivity[dateKey]) {
              dailyActivity[dateKey].count++;
            }
          }
        });

        var activityArray = Object.keys(dailyActivity).map(function(key) { return dailyActivity[key]; });
        var totalThisWeek = activityArray.reduce(function(sum, day) { return sum + day.count; }, 0);

        // Calculate previous week for comparison
        var fourteenDaysAgo = new Date(now.getTime() - (14 * 24 * 60 * 60 * 1000));
        var totalLastWeek = 0;
        responseValues.forEach(function(row) {
          var timestamp = row[1];
          if (timestamp && timestamp >= fourteenDaysAgo && timestamp < sevenDaysAgo) {
            totalLastWeek++;
          }
        });

        var weekOverWeekChange = totalLastWeek > 0
          ? Math.round(((totalThisWeek - totalLastWeek) / totalLastWeek) * 100)
          : 0;

        Logger.log('Dashboard summary computed', {
          recentSessions: recentSessions.length,
          totalActivityThisWeek: totalThisWeek
        });

        return {
          recentSessions: recentSessions,
          dailyActivity: activityArray,
          weekOverWeekChange: weekOverWeekChange,
          totalActivityThisWeek: totalThisWeek
        };
      } catch (error) {
        Logger.error('Error in getDashboardSummary', error);
        // Return empty but valid structure
        return {
          recentSessions: [],
          dailyActivity: [],
          weekOverWeekChange: 0,
          totalActivityThisWeek: 0
        };
      }
    }, CacheManager.CACHE_TIMES.SHORT);
  })();
};

/**
 * Get live poll data for dashboard (real-time question status)
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @returns {Object} Live poll data with student statuses and results
 */
Veritas.Models.Analytics.getLivePollData = function(pollId, questionIndex) {
  return withErrorHandling(function() {
    var poll = DataAccess.polls.getById(pollId);
    if (!poll) throw new Error("Poll not found");

    var question = poll.questions[questionIndex];
    if (!question) throw new Error("Question not found");

    // DEBUG: Log before normalization
    Logger.log('=== BEFORE NORMALIZATION ===');
    Logger.log('questionImageFileId: ' + question.questionImageFileId);
    Logger.log('options count: ' + (question.options ? question.options.length : 0));
    if (question.options && question.options.length > 0) {
      question.options.forEach(function(opt, idx) {
        Logger.log('  Option ' + idx + ': imageFileId=' + opt.imageFileId);
      });
    }

    question = normalizeQuestionObject_(question, poll.updatedAt);

    // DEBUG: Log after normalization
    Logger.log('=== AFTER NORMALIZATION ===');
    Logger.log('questionImageURL: ' + question.questionImageURL);
    Logger.log('options count: ' + (question.options ? question.options.length : 0));
    if (question.options && question.options.length > 0) {
      question.options.forEach(function(opt, idx) {
        Logger.log('  Option ' + idx + ': imageURL=' + opt.imageURL);
      });
    }

    poll.questions[questionIndex] = question;

    var liveStatus = DataAccess.liveStatus.get();
    var pollStatus = Array.isArray(liveStatus) ? (liveStatus[2] || 'OPEN') : 'OPEN';
    var statusQuestionIndex = Array.isArray(liveStatus) ? liveStatus[1] : -1;
    var metadata = (liveStatus && liveStatus.metadata) ? liveStatus.metadata : {};
    var currentSessionId = metadata && metadata.sessionId ? metadata.sessionId : null;
    var endedAt = metadata && Object.prototype.hasOwnProperty.call(metadata, 'endedAt') ? metadata.endedAt : null;
    var ended = (metadata && metadata.sessionPhase === 'ENDED') || (!!endedAt && endedAt !== null && endedAt !== '');
    var derivedStatus = metadata && metadata.sessionPhase ? metadata.sessionPhase : null;

    if (!derivedStatus) {
      if (ended) {
        derivedStatus = 'ENDED';
      } else if (pollStatus === 'PAUSED') {
        derivedStatus = 'PAUSED';
      } else if (pollStatus === 'OPEN') {
        derivedStatus = statusQuestionIndex >= 0 ? 'LIVE' : 'PRE_LIVE';
      } else if (pollStatus === 'CLOSED') {
        derivedStatus = statusQuestionIndex >= 0 ? 'ENDED' : 'PRE_LIVE';
      } else {
        derivedStatus = 'PRE_LIVE';
      }
    }

    if (derivedStatus === 'LIVE' && statusQuestionIndex < 0 && !ended) {
      derivedStatus = 'PRE_LIVE';
    }

    if (ended) {
      derivedStatus = 'ENDED';
    }

    var roster = DataAccess.roster.getByClass(poll.className);
    var pollResponses = DataAccess.responses.getByPoll(pollId);

    var submittedAnswers = new Map();
    pollResponses
      .filter(function(r) { return r[3] === questionIndex; })
      .forEach(function(r) {
        var email = r[4];
        var rawCorrect = r[6];
        var isCorrect = (rawCorrect === true) || (rawCorrect === 'TRUE') || (rawCorrect === 'true') || (rawCorrect === 1);
        submittedAnswers.set(email, {
          timestamp: r[1],
          answer: r[5],
          isCorrect: isCorrect,
          confidence: r[7] || null
        });
      });

    var lockedStudents = new Set();
    pollResponses
      .filter(function(r) { return r[3] === -1 && Veritas.Config.PROCTOR_VIOLATION_VALUES.indexOf(r[5]) !== -1; })
      .forEach(function(r) { lockedStudents.add(r[4]); });

    // OPTIMIZATION: Batch load all proctor states in a single operation
    var studentEmails = roster.map(function(s) { return s.email; });
    var proctorStates = ProctorAccess.getStatesBatch(pollId, studentEmails, currentSessionId);

    var studentStatusList = roster.map(function(student) {
      var email = student.email;

      // Get proctor state from batch-loaded map
      var proctorState = proctorStates.get(email);

      // Get submission if exists
      var submission = submittedAnswers.has(email) ? submittedAnswers.get(email) : null;

      var nameParts = Veritas.Models.Analytics.extractStudentNameParts(student.name);
      var fullName = nameParts.trimmed || student.name || '';
      var displayName = nameParts.displayName || fullName;
      var shortName = Veritas.Models.Analytics.formatStudentName(student.name);

      var baseStudent = {
        name: fullName || displayName,
        displayName: displayName,
        shortName: shortName,
        firstName: nameParts.firstName || displayName,
        lastName: nameParts.lastName || '',
        email: email,
        lockVersion: proctorState.lockVersion,
        lockReason: proctorState.lockReason,
        lockedAt: proctorState.lockedAt,
        blockedBy: proctorState.blockedBy || '',
        blockedAt: proctorState.blockedAt || '',
        blockedNote: proctorState.blockedNote || '',
        answer: submission ? submission.answer : '---',
        isCorrect: submission ? submission.isCorrect : null,
        timestamp: submission ? submission.timestamp : 0,
        sessionViolations: proctorState.sessionViolations || 0,
        sessionExits: proctorState.sessionExits || 0,
        confidence: submission ? (submission.confidence || null) : null
      };

      if (proctorState.status === 'BLOCKED') {
        baseStudent.status = 'BLOCKED';
        baseStudent.statusNote = proctorState.blockedNote || 'teacher-block';
        return baseStudent;
      }

      if (proctorState.status === 'LOCKED' || proctorState.status === 'AWAITING_FULLSCREEN') {
        baseStudent.status = proctorState.status === 'AWAITING_FULLSCREEN' ? 'AWAITING_FULLSCREEN' : 'LOCKED';
        return baseStudent;
      }

      if (submission) {
        baseStudent.status = 'Submitted';
        baseStudent.statusNote = submission.isCorrect === true ? 'correct' : (submission.isCorrect === false ? 'incorrect' : 'submitted');
        return baseStudent;
      }

      baseStudent.status = 'Waiting...';
      baseStudent.statusNote = 'waiting';
      baseStudent.timestamp = 9999999999999;
      return baseStudent;
    });

    // Compute metacognition summary
    var metacognitionSummary = (function() {
      Logger.log('=== COMPUTING METACOGNITION SUMMARY ===');
      Logger.log('question.metacognitionEnabled: ' + question.metacognitionEnabled);

      var summary = {
        enabled: !!question.metacognitionEnabled,
        totalResponses: 0,
        responseRate: 0,
        matrixCounts: {
          confidentCorrect: 0,
          confidentIncorrect: 0,
          uncertainCorrect: 0,
          uncertainIncorrect: 0
        },
        matrixPercentages: null,
        levels: {},
        flaggedStudents: []
      };

      Logger.log('summary.enabled: ' + summary.enabled);

      if (!summary.enabled) {
        Logger.log('Metacognition not enabled - returning empty summary');
        return summary;
      }

      Logger.log('Metacognition enabled - computing statistics');

      var levelKeys = ['guessing', 'somewhat-sure', 'very-sure', 'certain'];
      var levelStats = {};
      levelKeys.forEach(function(key) {
        levelStats[key] = { total: 0, correct: 0, incorrect: 0 };
      });

      var totalConfidenceResponses = 0;

      submittedAnswers.forEach(function(submission) {
        var confidence = submission.confidence;
        if (!confidence) return;

        if (!Object.prototype.hasOwnProperty.call(levelStats, confidence)) {
          levelStats[confidence] = { total: 0, correct: 0, incorrect: 0 };
        }

        levelStats[confidence].total++;
        if (submission.isCorrect) {
          levelStats[confidence].correct++;
        } else {
          levelStats[confidence].incorrect++;
        }

        totalConfidenceResponses++;

        var isConfident = (confidence === 'very-sure' || confidence === 'certain');

        if (isConfident && submission.isCorrect) {
          summary.matrixCounts.confidentCorrect++;
        } else if (isConfident && !submission.isCorrect) {
          summary.matrixCounts.confidentIncorrect++;
        } else if (!isConfident && submission.isCorrect) {
          summary.matrixCounts.uncertainCorrect++;
        } else {
          summary.matrixCounts.uncertainIncorrect++;
        }
      });

      summary.totalResponses = totalConfidenceResponses;
      summary.responseRate = roster.length > 0
        ? Math.round((totalConfidenceResponses / roster.length) * 100)
        : 0;

      if (totalConfidenceResponses > 0) {
        summary.matrixPercentages = {
          confidentCorrect: Math.round((summary.matrixCounts.confidentCorrect / totalConfidenceResponses) * 100),
          confidentIncorrect: Math.round((summary.matrixCounts.confidentIncorrect / totalConfidenceResponses) * 100),
          uncertainCorrect: Math.round((summary.matrixCounts.uncertainCorrect / totalConfidenceResponses) * 100),
          uncertainIncorrect: Math.round((summary.matrixCounts.uncertainIncorrect / totalConfidenceResponses) * 100)
        };
      }

      summary.levels = {};
      Object.keys(levelStats).forEach(function(level) {
        var stats = levelStats[level];
        var total = stats.total;
        summary.levels[level] = {
          total: total,
          correct: stats.correct,
          incorrect: stats.incorrect,
          totalPct: totalConfidenceResponses > 0 ? Math.round((total / totalConfidenceResponses) * 100) : 0,
          correctPct: total > 0 ? Math.round((stats.correct / total) * 100) : 0,
          incorrectPct: total > 0 ? Math.round((stats.incorrect / total) * 100) : 0
        };
      });

      summary.flaggedStudents = studentStatusList
        .filter(function(student) {
          if (!student || !student.confidence) return false;
          var isConfident = (student.confidence === 'very-sure' || student.confidence === 'certain');
          return isConfident && student.isCorrect === false;
        })
        .map(function(student) {
          return {
            name: student.displayName || student.name || '',
            email: student.email,
            answer: student.answer || '',
            confidence: student.confidence
          };
        });

      return summary;
    })();

    var answerCounts = {};
    question.options.forEach(function(opt) {
      if (opt.text) answerCounts[opt.text] = 0;
    });

    submittedAnswers.forEach(function(submission) {
      if (answerCounts.hasOwnProperty(submission.answer)) {
        answerCounts[submission.answer]++;
      }
    });

    return {
      status: derivedStatus,
      pollId: pollId,
      pollName: poll.pollName,
      questionText: question.questionText || '',
      questionImageURL: question.questionImageURL || null,
      options: question.options || [],
      questionIndex: questionIndex,
      totalQuestions: poll.questions.length,
      correctAnswer: question.correctAnswer || null,
      results: answerCounts,
      studentStatusList: studentStatusList,
      totalStudents: roster.length,
      totalResponses: submittedAnswers.size,
      timerSeconds: question.timerSeconds || null,
      metadata: metadata,
      authoritativeStatus: derivedStatus,
      metacognition: metacognitionSummary
    };
  })();
};

/**
 * Extract normalized name parts for sorting and display
 * @param {string} fullName - Student's full name
 * @returns {Object} Name parts {raw, trimmed, firstName, lastName, displayName}
 */
Veritas.Models.Analytics.extractStudentNameParts = function(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return { raw: '', trimmed: '', firstName: '', lastName: '', displayName: '' };
  }

  var trimmed = fullName.trim();
  if (!trimmed) {
    return { raw: fullName, trimmed: '', firstName: '', lastName: '', displayName: '' };
  }

  var parts = trimmed.split(/\s+/).filter(Boolean);
  var firstName = parts.length > 0 ? parts[0] : '';
  var lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  var displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || trimmed;

  return { raw: fullName, trimmed: trimmed, firstName: firstName, lastName: lastName, displayName: displayName };
};

/**
 * Format student name as "FirstName L." (first name + last initial)
 * @param {string} fullName - Student's full name
 * @returns {string} Formatted name
 */
Veritas.Models.Analytics.formatStudentName = function(fullName) {
  var parts = Veritas.Models.Analytics.extractStudentNameParts(fullName);
  if (!parts.trimmed) return '';
  if (!parts.lastName) return parts.displayName || parts.trimmed;
  var lastInitial = parts.lastName.charAt(0).toUpperCase();
  return parts.firstName + ' ' + lastInitial + '.';
};

/**
 * Build submitted answers map for a poll question
 * @param {string} pollId - Poll ID
 * @param {number} questionIndex - Question index
 * @returns {Map} Map of student email -> submission data
 */
Veritas.Models.Analytics.buildSubmittedAnswersMap = function(pollId, questionIndex) {
  var responses = DataAccess.responses.getByPollAndQuestion(pollId, questionIndex) || [];
  var submissions = new Map();

  responses.forEach(function(row) {
    var email = (row[4] || '').toString().trim();
    if (!email) return;

    var answer = row[5];
    var rawCorrect = row[6];
    var isCorrect = (rawCorrect === true) || (rawCorrect === 'TRUE') || (rawCorrect === 'true') || (rawCorrect === 1);
    var timestamp = typeof row[1] === 'number' ? row[1] : null;

    submissions.set(email, {
      answer: answer,
      isCorrect: isCorrect,
      timestamp: timestamp
    });
  });

  return submissions;
};

/**
 * Compute answer counts from submissions
 * @param {Object} question - Question object with options
 * @param {Map} submissionsMap - Submissions map
 * @returns {Object} Counts by answer option
 */
Veritas.Models.Analytics.computeAnswerCounts = function(question, submissionsMap) {
  var counts = {};
  var options = (question && Array.isArray(question.options)) ? question.options : [];

  options.forEach(function(opt) {
    if (opt && Object.prototype.hasOwnProperty.call(opt, 'text') && opt.text) {
      counts[opt.text] = 0;
    }
  });

  submissionsMap.forEach(function(submission) {
    var key = submission.answer;
    if (key && Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key]++;
    }
  });

  return counts;
};

/**
 * Compute answer percentages from counts
 * @param {Object} answerCounts - Answer counts by option
 * @returns {Object} Percentages and total responses
 */
Veritas.Models.Analytics.computeAnswerPercentages = function(answerCounts) {
  var percentages = {};
  var values = Object.keys(answerCounts || {}).map(function(k) { return answerCounts[k]; });
  var total = values.reduce(function(sum, value) { return sum + (typeof value === 'number' ? value : 0); }, 0);

  Object.keys(answerCounts || {}).forEach(function(key) {
    var count = typeof answerCounts[key] === 'number' ? answerCounts[key] : 0;
    percentages[key] = total > 0 ? Math.round((count / total) * 100) : 0;
  });

  return { percentages: percentages, totalResponses: total };
};

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

// Enhanced Analytics with Interpretations wrappers
function getEnhancedPostPollAnalytics(pollId) {
  return Veritas.Models.Analytics.getEnhancedPostPollAnalytics(pollId);
}

function interpretParticipation(participated, total) {
  return Veritas.Models.Analytics.interpretParticipation(participated, total);
}

function interpretMeanScore(mean, maxScore) {
  return Veritas.Models.Analytics.interpretMeanScore(mean, maxScore);
}

function interpretStdDev(stdDev, maxScore) {
  return Veritas.Models.Analytics.interpretStdDev(stdDev, maxScore);
}

function interpretDistribution(scoreDistribution) {
  return Veritas.Models.Analytics.interpretDistribution(scoreDistribution);
}

function interpretDifficulty(pValue) {
  return Veritas.Models.Analytics.interpretDifficulty(pValue);
}

function interpretDiscrimination(discrimination) {
  return Veritas.Models.Analytics.interpretDiscrimination(discrimination);
}

function interpretItemQuality(difficulty, discrimination) {
  return Veritas.Models.Analytics.interpretItemQuality(difficulty, discrimination);
}

function getItemActionableInsights(item) {
  return Veritas.Models.Analytics.getItemActionableInsights(item);
}

function generateTeacherActionItems(analytics) {
  return Veritas.Models.Analytics.generateTeacherActionItems(analytics);
}

// Student Insights & Dashboard wrappers (Batch 4)
function getStudentInsights(className, options) {
  return Veritas.Models.Analytics.getStudentInsights(className, options);
}

function getStudentHistoricalAnalytics(studentEmail, className, options) {
  return Veritas.Models.Analytics.getStudentHistoricalAnalytics(studentEmail, className, options);
}

function getDashboardSummary() {
  return Veritas.Models.Analytics.getDashboardSummary();
}

function getLivePollData(pollId, questionIndex) {
  return Veritas.Models.Analytics.getLivePollData(pollId, questionIndex);
}

function extractStudentNameParts_(fullName) {
  return Veritas.Models.Analytics.extractStudentNameParts(fullName);
}

function formatStudentName_(fullName) {
  return Veritas.Models.Analytics.formatStudentName(fullName);
}

function buildSubmittedAnswersMap_(pollId, questionIndex) {
  return Veritas.Models.Analytics.buildSubmittedAnswersMap(pollId, questionIndex);
}

function computeAnswerCounts_(question, submissionsMap) {
  return Veritas.Models.Analytics.computeAnswerCounts(question, submissionsMap);
}

function computeAnswerPercentages_(answerCounts) {
  return Veritas.Models.Analytics.computeAnswerPercentages(answerCounts);
}
