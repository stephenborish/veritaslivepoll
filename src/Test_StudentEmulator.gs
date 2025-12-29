// =============================================================================
// VERITAS LIVE POLL - STUDENT EMULATOR
// =============================================================================
// Purpose: Simulate students taking live polls and secure assessments for testing
// Dependencies: Config, DataAccess, Teacher_API, Student_API, TokenManager
// Usage: Run from Apps Script Editor or call programmatically
// =============================================================================

var Veritas = Veritas || {};
Veritas.StudentEmulator = Veritas.StudentEmulator || {};

// =============================================================================
// CONFIGURATION & BEHAVIOR PROFILES
// =============================================================================

/**
 * Default configuration for student emulation
 */
Veritas.StudentEmulator.DEFAULT_CONFIG = {
  // Timing settings
  minAnswerDelayMs: 500,        // Minimum delay before answering
  maxAnswerDelayMs: 5000,       // Maximum delay before answering
  pollIntervalMs: 1000,         // How often students poll for state changes

  // Behavior distribution (percentages, should sum to 100)
  behaviorDistribution: {
    fastResponder: 20,          // Answers quickly, always correct-ish
    normalResponder: 50,        // Average timing, mixed answers
    slowResponder: 15,          // Takes longer, more deliberate
    struggler: 10,              // Often wrong, low confidence
    violator: 5                 // Triggers proctoring violations
  },

  // Answer accuracy distribution
  correctAnswerProbability: 0.65,  // Base probability of correct answer

  // Confidence level distribution
  confidenceDistribution: {
    'guessing': 15,
    'somewhat-sure': 35,
    'very-sure': 35,
    'certain': 15
  },

  // Violation settings
  violationTypes: ['exit-fullscreen', 'tab-switch', 'focus-lost'],
  violationProbability: 0.3,    // Probability violator profile triggers violation

  // Logging
  verbose: true
};

/**
 * Behavior profiles for simulated students
 */
Veritas.StudentEmulator.BEHAVIOR_PROFILES = {
  fastResponder: {
    name: 'Fast Responder',
    answerDelayMultiplier: 0.3,
    correctProbabilityBonus: 0.1,
    confidenceBias: { 'very-sure': 20, 'certain': 20 },
    triggersViolations: false
  },
  normalResponder: {
    name: 'Normal Responder',
    answerDelayMultiplier: 1.0,
    correctProbabilityBonus: 0,
    confidenceBias: {},
    triggersViolations: false
  },
  slowResponder: {
    name: 'Slow Responder',
    answerDelayMultiplier: 2.0,
    correctProbabilityBonus: 0.05,
    confidenceBias: { 'very-sure': 10 },
    triggersViolations: false
  },
  struggler: {
    name: 'Struggler',
    answerDelayMultiplier: 1.5,
    correctProbabilityBonus: -0.25,
    confidenceBias: { 'guessing': 30, 'somewhat-sure': 20 },
    triggersViolations: false
  },
  violator: {
    name: 'Violator',
    answerDelayMultiplier: 1.0,
    correctProbabilityBonus: 0,
    confidenceBias: {},
    triggersViolations: true
  }
};

// =============================================================================
// CORE EMULATOR CLASS
// =============================================================================

/**
 * Create a new StudentEmulator instance
 * @param {Object} config - Configuration overrides
 */
Veritas.StudentEmulator.create = function(config) {
  var emulator = {
    config: Object.assign({}, Veritas.StudentEmulator.DEFAULT_CONFIG, config || {}),
    students: [],
    results: {
      startTime: null,
      endTime: null,
      studentsSimulated: 0,
      totalSubmissions: 0,
      successfulSubmissions: 0,
      failedSubmissions: 0,
      violations: [],
      errors: [],
      timeline: []
    }
  };

  return emulator;
};

/**
 * Generate mock students for a class
 * @param {number} count - Number of students to generate
 * @param {string} classNamePrefix - Prefix for student emails
 * @returns {Array} Array of student objects
 */
Veritas.StudentEmulator.generateStudents = function(count, classNamePrefix) {
  var students = [];
  var prefix = classNamePrefix || 'test';
  var behaviorDist = Veritas.StudentEmulator.DEFAULT_CONFIG.behaviorDistribution;

  for (var i = 0; i < count; i++) {
    var studentNum = i + 1;
    var profile = Veritas.StudentEmulator.assignBehaviorProfile_(i, count, behaviorDist);

    students.push({
      id: 'STUDENT-' + studentNum,
      name: 'Test Student ' + studentNum,
      email: prefix + '.student' + studentNum + '@emulator.test',
      profile: profile,
      profileName: Veritas.StudentEmulator.BEHAVIOR_PROFILES[profile].name,
      token: null,  // Will be generated when enrolled
      submissions: [],
      violations: [],
      state: 'READY'
    });
  }

  return students;
};

/**
 * Assign behavior profile based on distribution
 * @private
 */
Veritas.StudentEmulator.assignBehaviorProfile_ = function(index, total, distribution) {
  var profiles = Object.keys(distribution);
  var cumulative = 0;
  var thresholds = [];

  profiles.forEach(function(profile) {
    cumulative += distribution[profile];
    thresholds.push({ profile: profile, threshold: cumulative });
  });

  // Distribute evenly across the student population
  var position = ((index / total) * 100);

  for (var i = 0; i < thresholds.length; i++) {
    if (position < thresholds[i].threshold) {
      return thresholds[i].profile;
    }
  }

  return 'normalResponder';
};

// =============================================================================
// LIVE POLL SIMULATION
// =============================================================================

/**
 * Simulate students taking a live poll
 * @param {Object} options - Simulation options
 * @returns {Object} Simulation results
 */
Veritas.StudentEmulator.simulateLivePoll = function(options) {
  var opts = options || {};
  var pollId = opts.pollId;
  var className = opts.className || 'Emulator Test Class';
  var studentCount = opts.studentCount || 10;
  var config = opts.config || {};

  if (!pollId) {
    return { success: false, error: 'pollId is required' };
  }

  var emulator = Veritas.StudentEmulator.create(config);
  emulator.results.startTime = new Date().toISOString();
  emulator.results.mode = 'LIVE_POLL';
  emulator.results.pollId = pollId;
  emulator.results.className = className;

  try {
    // 1. Generate and enroll students
    Veritas.StudentEmulator.log_(emulator, 'Generating ' + studentCount + ' students...');
    emulator.students = Veritas.StudentEmulator.generateStudents(studentCount, className.replace(/\s+/g, '').toLowerCase());

    // 2. Ensure class exists and enroll students
    Veritas.StudentEmulator.log_(emulator, 'Enrolling students in class: ' + className);
    Veritas.StudentEmulator.enrollStudents_(emulator, className);

    // 3. Generate tokens for each student
    Veritas.StudentEmulator.log_(emulator, 'Generating authentication tokens...');
    Veritas.StudentEmulator.generateTokens_(emulator, className);

    // 4. Verify poll exists
    var poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found: ' + pollId);
    }
    emulator.results.questionCount = poll.questions.length;

    // 5. Wait for poll to be live (or start it if teacher mode)
    if (opts.autoStart) {
      Veritas.StudentEmulator.log_(emulator, 'Auto-starting poll...');
      Veritas.TeacherApi.startPoll(pollId);
    }

    // 6. Simulate each student's journey
    Veritas.StudentEmulator.log_(emulator, 'Starting student simulations...');

    for (var i = 0; i < emulator.students.length; i++) {
      var student = emulator.students[i];
      Veritas.StudentEmulator.simulateSingleStudentLivePoll_(emulator, student, poll);
      emulator.results.studentsSimulated++;
    }

    // 7. Finalize
    emulator.results.endTime = new Date().toISOString();
    emulator.results.success = true;
    emulator.results.duration = new Date(emulator.results.endTime) - new Date(emulator.results.startTime);

    Veritas.StudentEmulator.log_(emulator, 'Simulation complete!');
    Veritas.StudentEmulator.printSummary_(emulator);

  } catch (err) {
    emulator.results.success = false;
    emulator.results.error = err.message;
    emulator.results.errors.push({
      time: new Date().toISOString(),
      error: err.message,
      stack: err.stack
    });
    Veritas.StudentEmulator.log_(emulator, 'ERROR: ' + err.message);
  }

  return emulator.results;
};

/**
 * Simulate a single student taking a live poll
 * @private
 */
Veritas.StudentEmulator.simulateSingleStudentLivePoll_ = function(emulator, student, poll) {
  var profile = Veritas.StudentEmulator.BEHAVIOR_PROFILES[student.profile];

  Veritas.StudentEmulator.log_(emulator, 'Simulating ' + student.email + ' (' + profile.name + ')');

  // Get current poll status
  var status = Veritas.StudentApi.getStudentPollStatus(student.token, {
    lastStateVersion: 0,
    lastSuccessAt: Date.now(),
    failureCount: 0
  });

  if (status.status !== 'LIVE') {
    Veritas.StudentEmulator.log_(emulator, '  Poll not live, status: ' + status.status);
    student.state = 'WAITING';
    return;
  }

  // Answer each question
  for (var q = 0; q < poll.questions.length; q++) {
    var question = poll.questions[q];

    // Check if this question is active
    if (status.questionIndex !== q) {
      Veritas.StudentEmulator.log_(emulator, '  Waiting for question ' + q + '...');
      continue;
    }

    // Simulate thinking time
    var delay = Veritas.StudentEmulator.calculateDelay_(emulator, profile);
    Utilities.sleep(delay);

    // Maybe trigger violation (for violator profile)
    if (profile.triggersViolations && Math.random() < emulator.config.violationProbability) {
      Veritas.StudentEmulator.triggerViolation_(emulator, student, poll.pollId);
    }

    // Choose answer
    var answerResult = Veritas.StudentEmulator.chooseAnswer_(emulator, student, question, profile);

    // Submit answer
    var submission = Veritas.StudentApi.submitLivePollAnswer(
      poll.pollId,
      q,
      answerResult.answer,
      student.token,
      answerResult.confidence
    );

    emulator.results.totalSubmissions++;

    if (submission.success) {
      emulator.results.successfulSubmissions++;
      student.submissions.push({
        questionIndex: q,
        answer: answerResult.answer,
        confidence: answerResult.confidence,
        isCorrect: answerResult.isCorrect,
        time: new Date().toISOString()
      });
      Veritas.StudentEmulator.log_(emulator, '  Q' + q + ': Submitted "' + answerResult.answer + '" (' + answerResult.confidence + ')');
    } else {
      emulator.results.failedSubmissions++;
      Veritas.StudentEmulator.log_(emulator, '  Q' + q + ': FAILED - ' + submission.error);
    }

    emulator.results.timeline.push({
      time: new Date().toISOString(),
      student: student.email,
      event: 'ANSWER_SUBMITTED',
      questionIndex: q,
      success: submission.success
    });
  }

  student.state = 'COMPLETED';
};

// =============================================================================
// SECURE ASSESSMENT SIMULATION
// =============================================================================

/**
 * Simulate students taking a secure assessment
 * @param {Object} options - Simulation options
 * @returns {Object} Simulation results
 */
Veritas.StudentEmulator.simulateSecureAssessment = function(options) {
  var opts = options || {};
  var pollId = opts.pollId;
  var sessionId = opts.sessionId;
  var className = opts.className || 'Emulator Test Class';
  var studentCount = opts.studentCount || 10;
  var config = opts.config || {};
  var accessCode = opts.accessCode || '';

  if (!pollId) {
    return { success: false, error: 'pollId is required' };
  }

  var emulator = Veritas.StudentEmulator.create(config);
  emulator.results.startTime = new Date().toISOString();
  emulator.results.mode = 'SECURE_ASSESSMENT';
  emulator.results.pollId = pollId;
  emulator.results.sessionId = sessionId;
  emulator.results.className = className;

  try {
    // 1. Generate and enroll students
    Veritas.StudentEmulator.log_(emulator, 'Generating ' + studentCount + ' students...');
    emulator.students = Veritas.StudentEmulator.generateStudents(studentCount, className.replace(/\s+/g, '').toLowerCase());

    // 2. Ensure class exists and enroll students
    Veritas.StudentEmulator.log_(emulator, 'Enrolling students in class: ' + className);
    Veritas.StudentEmulator.enrollStudents_(emulator, className);

    // 3. Generate tokens for each student
    Veritas.StudentEmulator.log_(emulator, 'Generating authentication tokens...');
    Veritas.StudentEmulator.generateTokens_(emulator, className);

    // 4. Verify poll exists
    var poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found: ' + pollId);
    }
    emulator.results.questionCount = poll.questions.length;
    emulator.results.timeLimitMinutes = poll.timeLimitMinutes;

    // 5. Auto-start secure session if requested
    if (opts.autoStart) {
      Veritas.StudentEmulator.log_(emulator, 'Auto-starting secure session...');
      var sessionResult = Veritas.TeacherApi.startIndividualTimedSession(pollId);
      sessionId = sessionResult.sessionId;
      emulator.results.sessionId = sessionId;
    }

    // 6. Simulate each student's secure assessment journey
    Veritas.StudentEmulator.log_(emulator, 'Starting secure assessment simulations...');

    for (var i = 0; i < emulator.students.length; i++) {
      var student = emulator.students[i];
      Veritas.StudentEmulator.simulateSingleStudentSecureAssessment_(emulator, student, poll, sessionId, accessCode);
      emulator.results.studentsSimulated++;

      // Stagger student starts slightly
      if (i < emulator.students.length - 1) {
        Utilities.sleep(Math.floor(Math.random() * 2000) + 500);
      }
    }

    // 7. Finalize
    emulator.results.endTime = new Date().toISOString();
    emulator.results.success = true;
    emulator.results.duration = new Date(emulator.results.endTime) - new Date(emulator.results.startTime);

    Veritas.StudentEmulator.log_(emulator, 'Simulation complete!');
    Veritas.StudentEmulator.printSummary_(emulator);

  } catch (err) {
    emulator.results.success = false;
    emulator.results.error = err.message;
    emulator.results.errors.push({
      time: new Date().toISOString(),
      error: err.message,
      stack: err.stack
    });
    Veritas.StudentEmulator.log_(emulator, 'ERROR: ' + err.message);
  }

  return emulator.results;
};

/**
 * Simulate a single student taking a secure assessment
 * @private
 */
Veritas.StudentEmulator.simulateSingleStudentSecureAssessment_ = function(emulator, student, poll, sessionId, accessCode) {
  var profile = Veritas.StudentEmulator.BEHAVIOR_PROFILES[student.profile];

  Veritas.StudentEmulator.log_(emulator, 'Simulating secure assessment for ' + student.email + ' (' + profile.name + ')');

  try {
    // 1. Begin the attempt (enter lobby/start timer)
    var beginResult = Veritas.StudentApi.beginIndividualTimedAttempt(
      poll.pollId,
      sessionId,
      student.token,
      { accessCode: accessCode }
    );

    if (!beginResult.success && beginResult.error) {
      Veritas.StudentEmulator.log_(emulator, '  Failed to begin attempt: ' + beginResult.error);
      return;
    }

    emulator.results.timeline.push({
      time: new Date().toISOString(),
      student: student.email,
      event: 'ASSESSMENT_STARTED'
    });

    // 2. Answer each question in sequence
    for (var q = 0; q < poll.questions.length; q++) {
      var question = poll.questions[q];

      // Simulate thinking time (longer for secure assessments)
      var delay = Veritas.StudentEmulator.calculateDelay_(emulator, profile) * 1.5;
      Utilities.sleep(Math.min(delay, 10000)); // Cap at 10 seconds for testing

      // Maybe trigger violation
      if (profile.triggersViolations && Math.random() < emulator.config.violationProbability) {
        Veritas.StudentEmulator.triggerViolation_(emulator, student, poll.pollId);

        // Simulate waiting for teacher unlock
        Utilities.sleep(2000);

        // Check if still locked
        var state = Veritas.StudentApi.getIndividualTimedSessionState(student.token);
        if (state.isLocked) {
          Veritas.StudentEmulator.log_(emulator, '  Still locked, waiting...');
          // In real scenario, would wait for teacher unlock
        }
      }

      // Choose answer
      var answerResult = Veritas.StudentEmulator.chooseAnswer_(emulator, student, question, profile);

      // Submit answer
      var submission = Veritas.StudentApi.submitIndividualTimedAnswer(
        poll.pollId,
        sessionId,
        q,
        answerResult.answer,
        student.token,
        answerResult.confidence,
        'CLIENT-' + Utilities.getUuid()
      );

      emulator.results.totalSubmissions++;

      if (submission.success) {
        emulator.results.successfulSubmissions++;
        student.submissions.push({
          questionIndex: q,
          answer: answerResult.answer,
          confidence: answerResult.confidence,
          isCorrect: answerResult.isCorrect,
          time: new Date().toISOString()
        });
        Veritas.StudentEmulator.log_(emulator, '  Q' + q + ': Submitted "' + answerResult.answer + '"');
      } else {
        emulator.results.failedSubmissions++;
        Veritas.StudentEmulator.log_(emulator, '  Q' + q + ': FAILED - ' + (submission.error || 'Unknown error'));
      }
    }

    student.state = 'COMPLETED';
    emulator.results.timeline.push({
      time: new Date().toISOString(),
      student: student.email,
      event: 'ASSESSMENT_COMPLETED',
      questionsAnswered: student.submissions.length
    });

  } catch (err) {
    Veritas.StudentEmulator.log_(emulator, '  ERROR: ' + err.message);
    student.state = 'ERROR';
    emulator.results.errors.push({
      student: student.email,
      error: err.message
    });
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Enroll students in a class
 * @private
 */
Veritas.StudentEmulator.enrollStudents_ = function(emulator, className) {
  // Ensure class exists
  Veritas.Data.Classes.ensureExists(className, 'Emulator test class');

  // Build roster data
  var rosterData = emulator.students.map(function(student) {
    return {
      name: student.name,
      email: student.email
    };
  });

  // Save roster
  Veritas.Data.Rosters.save(className, rosterData);
};

/**
 * Generate authentication tokens for students
 * @private
 */
Veritas.StudentEmulator.generateTokens_ = function(emulator, className) {
  emulator.students.forEach(function(student) {
    student.token = Veritas.Utils.TokenManager.generateToken(student.email, className);
  });
};

/**
 * Calculate answer delay based on profile
 * @private
 */
Veritas.StudentEmulator.calculateDelay_ = function(emulator, profile) {
  var config = emulator.config;
  var baseDelay = config.minAnswerDelayMs +
    (Math.random() * (config.maxAnswerDelayMs - config.minAnswerDelayMs));

  return Math.floor(baseDelay * profile.answerDelayMultiplier);
};

/**
 * Choose an answer for a question
 * @private
 */
Veritas.StudentEmulator.chooseAnswer_ = function(emulator, student, question, profile) {
  var config = emulator.config;

  // Determine if answer is correct
  var correctProb = config.correctAnswerProbability + profile.correctProbabilityBonus;
  var shouldBeCorrect = Math.random() < correctProb;

  var answer;
  var isCorrect = false;

  // Get options - handle both array of strings and array of objects with text property
  var options = question.options || question.answers || [];

  // Normalize options to array of answer strings
  var answerTexts = options.map(function(opt) {
    if (typeof opt === 'string') return opt;
    if (opt && typeof opt === 'object') return opt.text || opt.label || '';
    return '';
  }).filter(function(text) { return text.length > 0; });

  if (shouldBeCorrect && question.correctAnswer) {
    answer = question.correctAnswer;
    isCorrect = true;
  } else if (answerTexts.length > 0) {
    // Pick a random answer
    var randomIndex = Math.floor(Math.random() * answerTexts.length);
    answer = answerTexts[randomIndex];
    isCorrect = (answer === question.correctAnswer);
  } else {
    // Fallback if no options found
    answer = question.correctAnswer || 'A';
    isCorrect = (answer === question.correctAnswer);
  }

  // Choose confidence level
  var confidence = Veritas.StudentEmulator.chooseConfidence_(config, profile);

  return {
    answer: answer,
    confidence: confidence,
    isCorrect: isCorrect
  };
};

/**
 * Choose a confidence level based on distribution
 * @private
 */
Veritas.StudentEmulator.chooseConfidence_ = function(config, profile) {
  // Merge base distribution with profile bias
  var distribution = Object.assign({}, config.confidenceDistribution, profile.confidenceBias);

  var levels = Object.keys(distribution);
  var total = 0;
  levels.forEach(function(level) { total += distribution[level]; });

  var random = Math.random() * total;
  var cumulative = 0;

  for (var i = 0; i < levels.length; i++) {
    cumulative += distribution[levels[i]];
    if (random < cumulative) {
      return levels[i];
    }
  }

  return 'somewhat-sure';
};

/**
 * Trigger a proctoring violation
 * @private
 */
Veritas.StudentEmulator.triggerViolation_ = function(emulator, student, pollId) {
  var violationType = emulator.config.violationTypes[
    Math.floor(Math.random() * emulator.config.violationTypes.length)
  ];

  Veritas.StudentEmulator.log_(emulator, '  Triggering violation: ' + violationType);

  var result = Veritas.StudentApi.reportStudentViolation(pollId, student.token, violationType);

  student.violations.push({
    type: violationType,
    time: new Date().toISOString(),
    result: result
  });

  emulator.results.violations.push({
    student: student.email,
    type: violationType,
    time: new Date().toISOString()
  });

  emulator.results.timeline.push({
    time: new Date().toISOString(),
    student: student.email,
    event: 'VIOLATION',
    violationType: violationType
  });
};

/**
 * Log a message
 * @private
 */
Veritas.StudentEmulator.log_ = function(emulator, message) {
  if (emulator.config.verbose) {
    Logger.log('[StudentEmulator] ' + message);
  }
};

/**
 * Print summary of results
 * @private
 */
Veritas.StudentEmulator.printSummary_ = function(emulator) {
  var r = emulator.results;

  Logger.log('');
  Logger.log('=== STUDENT EMULATOR RESULTS ===');
  Logger.log('Mode: ' + r.mode);
  Logger.log('Poll ID: ' + r.pollId);
  Logger.log('Class: ' + r.className);
  Logger.log('Duration: ' + (r.duration / 1000) + ' seconds');
  Logger.log('');
  Logger.log('Students Simulated: ' + r.studentsSimulated);
  Logger.log('Total Submissions: ' + r.totalSubmissions);
  Logger.log('Successful: ' + r.successfulSubmissions);
  Logger.log('Failed: ' + r.failedSubmissions);
  Logger.log('Violations: ' + r.violations.length);
  Logger.log('Errors: ' + r.errors.length);
  Logger.log('');

  // Profile breakdown
  var profileCounts = {};
  emulator.students.forEach(function(student) {
    profileCounts[student.profileName] = (profileCounts[student.profileName] || 0) + 1;
  });

  Logger.log('Profile Distribution:');
  Object.keys(profileCounts).forEach(function(profile) {
    Logger.log('  ' + profile + ': ' + profileCounts[profile]);
  });

  Logger.log('================================');
};

// =============================================================================
// CONVENIENCE ENTRY POINTS (Run from Apps Script Editor)
// =============================================================================

/**
 * Run a quick live poll simulation
 * Call this from the Apps Script Editor to test
 */
function runLivePollEmulation() {
  // CONFIGURE THESE VALUES:
  var pollId = 'POLL-XXXXX';  // Replace with actual poll ID
  var className = 'Emulator Test';
  var studentCount = 5;

  var results = Veritas.StudentEmulator.simulateLivePoll({
    pollId: pollId,
    className: className,
    studentCount: studentCount,
    autoStart: true,  // Set to true if you want to auto-start the poll
    config: {
      verbose: true,
      minAnswerDelayMs: 200,
      maxAnswerDelayMs: 1000
    }
  });

  Logger.log('Results: ' + JSON.stringify(results, null, 2));
  return results;
}

/**
 * Run a quick secure assessment simulation
 * Call this from the Apps Script Editor to test
 */
function runSecureAssessmentEmulation() {
  // CONFIGURE THESE VALUES:
  var pollId = 'POLL-XXXXX';  // Replace with actual poll ID
  var className = 'Emulator Test';
  var studentCount = 5;
  var accessCode = '';  // Add if your assessment requires an access code

  var results = Veritas.StudentEmulator.simulateSecureAssessment({
    pollId: pollId,
    className: className,
    studentCount: studentCount,
    accessCode: accessCode,
    autoStart: true,  // Set to true if you want to auto-start the session
    config: {
      verbose: true,
      minAnswerDelayMs: 500,
      maxAnswerDelayMs: 2000,
      violationProbability: 0.5  // Higher for testing violations
    }
  });

  Logger.log('Results: ' + JSON.stringify(results, null, 2));
  return results;
}

/**
 * Run a stress test with many students
 */
function runStressTest() {
  // CONFIGURE THESE VALUES:
  var pollId = 'POLL-XXXXX';  // Replace with actual poll ID
  var className = 'Stress Test Class';
  var studentCount = 30;  // Adjust based on your needs

  var results = Veritas.StudentEmulator.simulateLivePoll({
    pollId: pollId,
    className: className,
    studentCount: studentCount,
    autoStart: false,  // Assumes poll is already started
    config: {
      verbose: false,  // Reduce logging for stress test
      minAnswerDelayMs: 100,
      maxAnswerDelayMs: 500
    }
  });

  Logger.log('Stress Test Results: ' + JSON.stringify(results, null, 2));
  return results;
}

/**
 * Clean up emulator test data
 */
function cleanupEmulatorData() {
  Logger.log('Cleaning up emulator test data...');

  // This would delete test students and their responses
  // Implementation depends on your cleanup preferences

  Logger.log('Note: Manual cleanup may be needed for:');
  Logger.log('  - Test class rosters');
  Logger.log('  - Test student responses');
  Logger.log('  - Test proctoring logs');
}

// =============================================================================
// CONCURRENT SIMULATION (Interleaved Actions)
// =============================================================================

/**
 * Simulate students concurrently (interleaved) during a live poll
 * This better simulates real-world behavior where students answer at different times
 * @param {Object} options - Simulation options
 * @returns {Object} Simulation results
 */
Veritas.StudentEmulator.simulateConcurrentLivePoll = function(options) {
  var opts = options || {};
  var pollId = opts.pollId;
  var className = opts.className || 'Concurrent Test Class';
  var studentCount = opts.studentCount || 10;
  var config = opts.config || {};

  if (!pollId) {
    return { success: false, error: 'pollId is required' };
  }

  var emulator = Veritas.StudentEmulator.create(config);
  emulator.results.startTime = new Date().toISOString();
  emulator.results.mode = 'CONCURRENT_LIVE_POLL';
  emulator.results.pollId = pollId;
  emulator.results.className = className;

  try {
    // 1. Setup students
    Veritas.StudentEmulator.log_(emulator, 'Setting up ' + studentCount + ' concurrent students...');
    emulator.students = Veritas.StudentEmulator.generateStudents(studentCount, className.replace(/\s+/g, '').toLowerCase());
    Veritas.StudentEmulator.enrollStudents_(emulator, className);
    Veritas.StudentEmulator.generateTokens_(emulator, className);

    // 2. Verify poll exists
    var poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found: ' + pollId);
    }
    emulator.results.questionCount = poll.questions.length;

    // 3. Auto-start if requested
    if (opts.autoStart) {
      Veritas.StudentEmulator.log_(emulator, 'Auto-starting poll...');
      Veritas.TeacherApi.startPoll(pollId);
    }

    // 4. Create action queue with randomized timing
    var actionQueue = Veritas.StudentEmulator.buildConcurrentActionQueue_(emulator, poll);

    // 5. Execute action queue
    Veritas.StudentEmulator.log_(emulator, 'Executing ' + actionQueue.length + ' interleaved actions...');
    Veritas.StudentEmulator.executeConcurrentQueue_(emulator, actionQueue, poll);

    // 6. Finalize
    emulator.results.endTime = new Date().toISOString();
    emulator.results.success = true;
    emulator.results.duration = new Date(emulator.results.endTime) - new Date(emulator.results.startTime);
    emulator.results.studentsSimulated = emulator.students.length;

    Veritas.StudentEmulator.log_(emulator, 'Concurrent simulation complete!');
    Veritas.StudentEmulator.printSummary_(emulator);

  } catch (err) {
    emulator.results.success = false;
    emulator.results.error = err.message;
    emulator.results.errors.push({
      time: new Date().toISOString(),
      error: err.message,
      stack: err.stack
    });
  }

  return emulator.results;
};

/**
 * Build a queue of actions with randomized timing
 * @private
 */
Veritas.StudentEmulator.buildConcurrentActionQueue_ = function(emulator, poll) {
  var queue = [];
  var config = emulator.config;

  emulator.students.forEach(function(student) {
    var profile = Veritas.StudentEmulator.BEHAVIOR_PROFILES[student.profile];

    // Each student polls for status then answers
    for (var q = 0; q < poll.questions.length; q++) {
      var delay = Veritas.StudentEmulator.calculateDelay_(emulator, profile);

      // Add poll status check
      queue.push({
        student: student,
        type: 'POLL_STATUS',
        questionIndex: q,
        scheduledTime: delay + (q * 1000) + (Math.random() * 2000)
      });

      // Add answer submission
      queue.push({
        student: student,
        type: 'SUBMIT_ANSWER',
        questionIndex: q,
        question: poll.questions[q],
        scheduledTime: delay + (q * 1000) + 500 + (Math.random() * 2000)
      });

      // Maybe add violation for violator profiles
      if (profile.triggersViolations && Math.random() < config.violationProbability) {
        queue.push({
          student: student,
          type: 'VIOLATION',
          questionIndex: q,
          scheduledTime: delay + (q * 1000) + 250 + (Math.random() * 1000)
        });
      }
    }
  });

  // Sort by scheduled time to interleave actions
  queue.sort(function(a, b) {
    return a.scheduledTime - b.scheduledTime;
  });

  return queue;
};

/**
 * Execute the concurrent action queue
 * @private
 */
Veritas.StudentEmulator.executeConcurrentQueue_ = function(emulator, queue, poll) {
  var lastTime = 0;
  var answeredMap = {}; // Track who answered what

  queue.forEach(function(action, index) {
    var student = action.student;
    var profile = Veritas.StudentEmulator.BEHAVIOR_PROFILES[student.profile];

    // Simulate time passing (compressed)
    var timeDelta = action.scheduledTime - lastTime;
    if (timeDelta > 0) {
      Utilities.sleep(Math.min(timeDelta / 10, 200)); // Compress time for testing
    }
    lastTime = action.scheduledTime;

    var key = student.email + ':' + action.questionIndex;

    switch (action.type) {
      case 'POLL_STATUS':
        try {
          var status = Veritas.StudentApi.getStudentPollStatus(student.token, {
            lastStateVersion: 0,
            lastSuccessAt: Date.now(),
            failureCount: 0
          });
          Veritas.StudentEmulator.log_(emulator, '[' + student.email + '] Poll status: ' + status.status);
        } catch (e) {
          Veritas.StudentEmulator.log_(emulator, '[' + student.email + '] Status error: ' + e.message);
        }
        break;

      case 'SUBMIT_ANSWER':
        // Check if already answered
        if (answeredMap[key]) {
          Veritas.StudentEmulator.log_(emulator, '[' + student.email + '] Already answered Q' + action.questionIndex);
          break;
        }

        var answerResult = Veritas.StudentEmulator.chooseAnswer_(emulator, student, action.question, profile);
        var submission = Veritas.StudentApi.submitLivePollAnswer(
          poll.pollId,
          action.questionIndex,
          answerResult.answer,
          student.token,
          answerResult.confidence
        );

        emulator.results.totalSubmissions++;

        if (submission.success) {
          emulator.results.successfulSubmissions++;
          answeredMap[key] = true;
          student.submissions.push({
            questionIndex: action.questionIndex,
            answer: answerResult.answer,
            confidence: answerResult.confidence,
            isCorrect: answerResult.isCorrect,
            time: new Date().toISOString()
          });
          Veritas.StudentEmulator.log_(emulator, '[' + student.email + '] Q' + action.questionIndex + ': "' + answerResult.answer + '"');
        } else {
          emulator.results.failedSubmissions++;
          Veritas.StudentEmulator.log_(emulator, '[' + student.email + '] Q' + action.questionIndex + ': FAILED - ' + submission.error);
        }

        emulator.results.timeline.push({
          time: new Date().toISOString(),
          student: student.email,
          event: 'ANSWER_SUBMITTED',
          questionIndex: action.questionIndex,
          success: submission.success
        });
        break;

      case 'VIOLATION':
        Veritas.StudentEmulator.triggerViolation_(emulator, student, poll.pollId);
        break;
    }
  });
};

/**
 * Run concurrent live poll emulation
 */
function runConcurrentLivePollEmulation() {
  // CONFIGURE THESE VALUES:
  var pollId = 'POLL-XXXXX';  // Replace with actual poll ID
  var className = 'Concurrent Test';
  var studentCount = 10;

  var results = Veritas.StudentEmulator.simulateConcurrentLivePoll({
    pollId: pollId,
    className: className,
    studentCount: studentCount,
    autoStart: true,
    config: {
      verbose: true,
      minAnswerDelayMs: 100,
      maxAnswerDelayMs: 2000,
      violationProbability: 0.2
    }
  });

  Logger.log('Concurrent Results: ' + JSON.stringify(results, null, 2));
  return results;
}

// =============================================================================
// TEACHER CONTROL SIMULATION (Drive a full session)
// =============================================================================

/**
 * Simulate a complete poll session including teacher controls
 * This runs through the entire lifecycle: start, advance questions, students answer, close
 * @param {Object} options - Simulation options
 * @returns {Object} Full session simulation results
 */
Veritas.StudentEmulator.simulateFullSession = function(options) {
  var opts = options || {};
  var pollId = opts.pollId;
  var className = opts.className || 'Full Session Test';
  var studentCount = opts.studentCount || 10;
  var questionPauseSec = opts.questionPauseSec || 5;
  var config = opts.config || {};

  if (!pollId) {
    return { success: false, error: 'pollId is required' };
  }

  var emulator = Veritas.StudentEmulator.create(config);
  emulator.results.startTime = new Date().toISOString();
  emulator.results.mode = 'FULL_SESSION';
  emulator.results.pollId = pollId;
  emulator.results.className = className;

  try {
    // 1. Setup
    Veritas.StudentEmulator.log_(emulator, '=== FULL SESSION SIMULATION ===');
    emulator.students = Veritas.StudentEmulator.generateStudents(studentCount, className.replace(/\s+/g, '').toLowerCase());
    Veritas.StudentEmulator.enrollStudents_(emulator, className);
    Veritas.StudentEmulator.generateTokens_(emulator, className);

    var poll = DataAccess.polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found: ' + pollId);
    }
    emulator.results.questionCount = poll.questions.length;

    // 2. TEACHER: Start the poll
    Veritas.StudentEmulator.log_(emulator, '[TEACHER] Starting poll...');
    var startResult = Veritas.TeacherApi.startPoll(pollId);
    Veritas.StudentEmulator.log_(emulator, '[TEACHER] Poll started, status: ' + startResult.status);

    emulator.results.timeline.push({
      time: new Date().toISOString(),
      event: 'POLL_STARTED',
      actor: 'TEACHER'
    });

    // 3. Iterate through each question
    for (var q = 0; q < poll.questions.length; q++) {
      Veritas.StudentEmulator.log_(emulator, '');
      Veritas.StudentEmulator.log_(emulator, '--- Question ' + (q + 1) + ' of ' + poll.questions.length + ' ---');

      // If not first question, advance to next
      if (q > 0) {
        Veritas.StudentEmulator.log_(emulator, '[TEACHER] Advancing to question ' + (q + 1));
        Veritas.TeacherApi.nextQuestion();
      }

      emulator.results.timeline.push({
        time: new Date().toISOString(),
        event: 'QUESTION_STARTED',
        questionIndex: q,
        actor: 'TEACHER'
      });

      // Give students time to answer (simulate concurrent answering)
      var questionStart = Date.now();
      var deadline = questionStart + (questionPauseSec * 1000);

      // Randomize student order for this question
      var shuffledStudents = emulator.students.slice();
      Veritas.StudentEmulator.shuffle_(shuffledStudents);

      shuffledStudents.forEach(function(student) {
        if (Date.now() >= deadline) return; // Time's up

        var profile = Veritas.StudentEmulator.BEHAVIOR_PROFILES[student.profile];

        // Simulate some thinking time
        var delay = Math.floor(Math.random() * (questionPauseSec * 500));
        Utilities.sleep(Math.min(delay, deadline - Date.now()));

        if (Date.now() >= deadline) return;

        // Maybe trigger violation
        if (profile.triggersViolations && Math.random() < emulator.config.violationProbability) {
          Veritas.StudentEmulator.triggerViolation_(emulator, student, pollId);
        }

        // Submit answer
        var question = poll.questions[q];
        var answerResult = Veritas.StudentEmulator.chooseAnswer_(emulator, student, question, profile);
        var submission = Veritas.StudentApi.submitLivePollAnswer(
          pollId, q, answerResult.answer, student.token, answerResult.confidence
        );

        emulator.results.totalSubmissions++;
        if (submission.success) {
          emulator.results.successfulSubmissions++;
          student.submissions.push({
            questionIndex: q,
            answer: answerResult.answer,
            isCorrect: answerResult.isCorrect
          });
          Veritas.StudentEmulator.log_(emulator, '  [' + student.profileName + '] ' + student.email + ' answered');
        } else {
          emulator.results.failedSubmissions++;
        }
      });

      // Wait for question time to expire
      var remaining = deadline - Date.now();
      if (remaining > 0) {
        Veritas.StudentEmulator.log_(emulator, '[TEACHER] Waiting ' + Math.ceil(remaining/1000) + 's for remaining students...');
        Utilities.sleep(remaining);
      }

      // TEACHER: Reveal results
      Veritas.StudentEmulator.log_(emulator, '[TEACHER] Revealing results...');
      Veritas.TeacherApi.revealResultsToStudents();

      emulator.results.timeline.push({
        time: new Date().toISOString(),
        event: 'RESULTS_REVEALED',
        questionIndex: q,
        actor: 'TEACHER'
      });

      // Brief pause before next question
      Utilities.sleep(1000);

      // TEACHER: Hide results before moving on
      if (q < poll.questions.length - 1) {
        Veritas.TeacherApi.hideResultsFromStudents();
      }
    }

    // 4. TEACHER: Close the poll
    Veritas.StudentEmulator.log_(emulator, '');
    Veritas.StudentEmulator.log_(emulator, '[TEACHER] Closing poll...');
    Veritas.TeacherApi.closePoll();

    emulator.results.timeline.push({
      time: new Date().toISOString(),
      event: 'POLL_CLOSED',
      actor: 'TEACHER'
    });

    // 5. Finalize
    emulator.results.endTime = new Date().toISOString();
    emulator.results.success = true;
    emulator.results.duration = new Date(emulator.results.endTime) - new Date(emulator.results.startTime);
    emulator.results.studentsSimulated = emulator.students.length;

    Veritas.StudentEmulator.log_(emulator, '');
    Veritas.StudentEmulator.log_(emulator, '=== SESSION COMPLETE ===');
    Veritas.StudentEmulator.printSummary_(emulator);

  } catch (err) {
    emulator.results.success = false;
    emulator.results.error = err.message;
    emulator.results.errors.push({
      time: new Date().toISOString(),
      error: err.message,
      stack: err.stack
    });
  }

  return emulator.results;
};

/**
 * Fisher-Yates shuffle
 * @private
 */
Veritas.StudentEmulator.shuffle_ = function(array) {
  for (var i = array.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
};

/**
 * Run a full session simulation
 */
function runFullSessionEmulation() {
  // CONFIGURE THESE VALUES:
  var pollId = 'POLL-XXXXX';  // Replace with actual poll ID
  var className = 'Full Session Test';
  var studentCount = 8;
  var secondsPerQuestion = 10;  // How long to wait on each question

  var results = Veritas.StudentEmulator.simulateFullSession({
    pollId: pollId,
    className: className,
    studentCount: studentCount,
    questionPauseSec: secondsPerQuestion,
    config: {
      verbose: true,
      correctAnswerProbability: 0.7,
      violationProbability: 0.15
    }
  });

  Logger.log('Full Session Results: ' + JSON.stringify(results, null, 2));
  return results;
}
