// =============================================================================
// VERITAS LIVE POLL - SMOKE TEST MODULE
// =============================================================================
// Purpose: To simulate a class of students taking a poll for testing purposes.
// Dependencies: Config, Data_Access, Teacher_API, Student_API
// =============================================================================

// Defensive namespace initialization
var Veritas = Veritas || {};
Veritas.SmokeTest = Veritas.SmokeTest || {};

/**
 * The main function to run the smoke test. This will be called from the UI.
 * You can customize the pollId and numberOfStudents here.
 */
function runSmokeTest() {
  // IMPORTANT: Replace 'POLL-12345' with a real Poll ID from your "Polls" sheet.
  Veritas.SmokeTest.simulateClass('Biology 101', 'POLL-12345', 10);
}

/**
 * Simulates a class of students taking a poll.
 * @param {string} className - The name of the class to create.
 * @param {string} pollId - The ID of the poll to simulate.
 * @param {number} numberOfStudents - The number of students to simulate.
 */
Veritas.SmokeTest.simulateClass = function(className, pollId, numberOfStudents) {
  try {
    Veritas.Logging.info('Starting smoke test for class: ' + className);

    // 1. Create mock students
    var mockStudents = Veritas.SmokeTest.createMockStudents_(numberOfStudents);

    // 2. Create the class and roster
    Veritas.Data.Classes.ensureExists(className, 'A class for smoke testing');
    Veritas.Data.Rosters.save(className, mockStudents);
    Veritas.Logging.info('Created mock roster for class: ' + className);

    // 3. Start the poll
    Veritas.TeacherApi.startPoll(pollId);
    Veritas.Logging.info('Started poll: ' + pollId);

    // 4. Simulate students answering the poll
    var poll = Veritas.Data.Polls.getById(pollId);
    if (!poll) {
      throw new Error('Poll not found: ' + pollId + '. Please use a valid Poll ID.');
    }

    Veritas.Logging.info('Simulating student answers...');
    for (var i = 0; i < mockStudents.length; i++) {
      try {
        var student = mockStudents[i];
        var token = Veritas.Utils.TokenManager.generateToken(student.email, className);
        var confidenceLevels = ['guessing', 'somewhat-sure', 'very-sure', 'certain'];

        // Simulate each student answering each question
        for (var q = 0; q < poll.questions.length; q++) {
          var question = poll.questions[q];
          var answer = question.answers[Math.floor(Math.random() * question.answers.length)];
          var confidence = confidenceLevels[Math.floor(Math.random() * confidenceLevels.length)];

          Veritas.StudentApi.submitLivePollAnswer(pollId, q, answer, token, confidence);
          Veritas.Logging.info('Simulating answer for ' + student.email + ' on question ' + q + ' with answer ' + answer + ' and confidence ' + confidence);

          // Simulate proctoring violation for the first student after the first question
          if (i === 0 && q === 0) {
            Veritas.Logging.info('--- Simulating proctoring violation for ' + student.email + ' ---');

            // 4a. Student triggers a violation
            Veritas.StudentApi.reportStudentViolation(pollId, token, 'exit-fullscreen');
            Veritas.Logging.info('Violation reported for ' + student.email);

            // 4b. Check student status (should be locked)
            var status = Veritas.StudentApi.getStudentPollStatus(token, {});
            var lockVersion = status.lockVersion || 0;
            Veritas.Logging.info('Student status: ' + status.status + ', Lock version: ' + lockVersion);

            if (status.status === 'LOCKED' || status.status === 'AWAITING_FULLSCREEN') {
              // 4c. Teacher approves unlock
              Veritas.TeacherApi.teacherApproveUnlock(student.email, pollId, lockVersion);
              Veritas.Logging.info('Teacher approved unlock for ' + student.email);

              // 4d. Student confirms fullscreen
              Veritas.StudentApi.studentConfirmFullscreen(lockVersion, token);
              Veritas.Logging.info('Student confirmed fullscreen for ' + student.email);
            } else {
              Veritas.Logging.warn('Student was not locked after violation. Status: ' + status.status);
            }
            Veritas.Logging.info('--- Proctoring simulation finished for ' + student.email + ' ---');
          }

          // Add a small delay to make the simulation more realistic
          Utilities.sleep(500);
        }
      } catch (e) {
        Veritas.Logging.error('Error simulating student ' + i + ': ' + e.toString(), e);
      }
    }

    // 5. Stop the poll
    Veritas.TeacherApi.closePoll(pollId);
    Veritas.Logging.info('Closed poll: ' + pollId);

    Veritas.Logging.info('Smoke test completed successfully!');

  } catch (e) {
    Veritas.Logging.error('Smoke test failed: ' + e.toString(), e);
  }
};

/**
 * Creates an array of mock students.
 * @param {number} numberOfStudents - The number of students to create.
 * @returns {Array<{name: string, email: string}>} An array of mock student objects.
 * @private
 */
Veritas.SmokeTest.createMockStudents_ = function(numberOfStudents) {
  var students = [];
  for (var i = 0; i < numberOfStudents; i++) {
    var studentNumber = i + 1;
    students.push({
      name: 'Student ' + studentNumber,
      email: 'student' + studentNumber + '@veritas.test'
    });
  }
  return students;
};
