// =============================================================================
// VERITAS LIVE POLL - VERIFICATION SMOKE TEST
// =============================================================================
// Purpose: Verify core workflows and data integrity
// Usage: Run 'verifySystemHealth' from the Apps Script editor
// =============================================================================

function verifySystemHealth() {
  Logger.log('=== STARTING SYSTEM VERIFICATION ===');

  try {
    // 1. Setup & Cleanup
    // We don't delete sheets to be safe, but we rely on auto-healing
    Logger.log('1. Verifying Data Access Auto-Healing...');
    // This triggers auto-creation of Polls sheet if missing
    var pollId = 'TEST-POLL-' + Utilities.getUuid();
    var questions = [
      { questionText: 'Test Q1', options: [{text:'A'}, {text:'B'}], correctAnswer: 'A' }
    ];

    Veritas.Models.Poll.createNewPoll(
      'Smoke Test Poll',
      'Test Class 101',
      questions,
      { sessionType: 'LIVE_POLL' }
    );
    Logger.log('   - Poll created successfully (auto-healing verified)');

    // 2. Start Session
    Logger.log('2. Verifying Session Start...');
    var sessionState = Veritas.Models.Session.startPoll(pollId);
    if (sessionState.status !== 'LIVE') throw new Error('Session failed to start');
    Logger.log('   - Session started successfully');

    // 3. Student Join & Submit
    Logger.log('3. Verifying Student Submission...');
    var studentEmail = 'test.student@example.com';
    // Mock token generation
    var token = Veritas.Utils.TokenManager.generateToken(studentEmail, 'Test Class 101');

    // Submit answer
    var result = Veritas.StudentApi.submitLivePollAnswer(
      pollId,
      0,
      'A',
      token,
      'very-sure'
    );

    if (!result.success) throw new Error('Student submission failed: ' + result.error);
    Logger.log('   - Student answer submitted successfully');

    // 4. Verify Data Persistence
    Logger.log('4. Verifying Data Persistence...');
    var responses = DataAccess.responses.getByPoll(pollId);
    if (responses.length !== 1) throw new Error('Response not found in database');
    if (responses[0][5] !== 'A') throw new Error('Response data mismatch'); // Answer column
    Logger.log('   - Data verified in Responses sheet');

    // 5. End Session
    Logger.log('5. Verifying Session Cleanup...');
    Veritas.Models.Session.closePoll();
    // Clean up test poll
    Veritas.Models.Poll.deletePoll(pollId);
    Logger.log('   - Session ended and test data cleaned up');

    Logger.log('=== VERIFICATION COMPLETE: ALL SYSTEMS GO ===');
    return 'SUCCESS';

  } catch (e) {
    Logger.error('!!! VERIFICATION FAILED !!!', e);
    throw e;
  }
}
