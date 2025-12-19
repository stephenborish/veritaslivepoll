/**
 * VERITAS LIVE POLL - TESTING & VERIFICATION SCRIPT
 *
 * This script helps diagnose and test:
 * 1. Student lock/unlock functionality
 * 2. Student activity tracking
 * 3. Teacher dashboard display
 *
 * Run from Apps Script Editor > Run > testSystem
 */

function testSystem() {
  Logger.log('=== VERITAS SYSTEM TEST ===\n');

  // Test 1: Check if StudentActivity sheet exists
  Logger.log('TEST 1: StudentActivity Sheet');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var activitySheet = ss.getSheetByName('StudentActivity');
  if (activitySheet) {
    Logger.log('✓ StudentActivity sheet exists');
    Logger.log('  Rows: ' + activitySheet.getLastRow());
  } else {
    Logger.log('✗ StudentActivity sheet NOT FOUND - Creating it...');
    createStudentActivitySheet();
  }

  // Test 2: Check proctor state
  Logger.log('\nTEST 2: Proctor State');
  var proctorSheet = ss.getSheetByName('ProctorState');
  if (proctorSheet) {
    Logger.log('✓ ProctorState sheet exists');
    Logger.log('  Rows: ' + proctorSheet.getLastRow());

    // Show any locked students
    var values = proctorSheet.getDataRange().getValues();
    var lockedStudents = [];
    for (var i = 1; i < values.length; i++) {
      var status = values[i][2]; // Status column
      if (status === 'LOCKED' || status === 'AWAITING_FULLSCREEN') {
        lockedStudents.push({
          email: values[i][1],
          status: status,
          lockVersion: values[i][3],
          lockReason: values[i][4]
        });
      }
    }

    if (lockedStudents.length > 0) {
      Logger.log('  LOCKED STUDENTS FOUND:');
      lockedStudents.forEach(function(s) {
        Logger.log('    - ' + s.email + ' (' + s.status + ') v' + s.lockVersion);
        Logger.log('      Reason: ' + s.lockReason);
      });
    } else {
      Logger.log('  No locked students');
    }
  }

  // Test 3: Test getLivePollData with activity
  Logger.log('\nTEST 3: Live Poll Data API');
  try {
    var liveStatus = DataAccess.liveStatus.get();
    if (liveStatus && liveStatus[0]) {
      var pollId = liveStatus[0];
      var questionIndex = liveStatus[1] || 0;
      Logger.log('  Active Poll: ' + pollId);
      Logger.log('  Question: ' + questionIndex);

      var pollData = Veritas.Models.Analytics.getLivePollData(pollId, questionIndex);
      Logger.log('  Students in data: ' + (pollData.studentStatusList ? pollData.studentStatusList.length : 0));

      if (pollData.studentStatusList) {
        var statusCounts = {};
        pollData.studentStatusList.forEach(function(s) {
          statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
        });
        Logger.log('  Status breakdown:');
        Object.keys(statusCounts).forEach(function(status) {
          Logger.log('    ' + status + ': ' + statusCounts[status]);
        });
      }
    } else {
      Logger.log('  No active poll session');
    }
  } catch (e) {
    Logger.log('  Error: ' + e.message);
  }

  // Test 4: Test activity tracking API
  Logger.log('\nTEST 4: Activity Tracking API');
  try {
    if (typeof Veritas.Models.StudentActivity !== 'undefined') {
      Logger.log('✓ StudentActivity module loaded');

      // Test recording an activity
      var testActivity = {
        pollId: 'TEST-POLL',
        sessionId: 'TEST-SESSION',
        questionIndex: 0,
        studentEmail: 'test@example.com',
        eventType: 'QUESTION_VIEW',
        eventData: { viewedAt: Date.now() },
        clientTimestamp: new Date().toISOString()
      };

      var result = Veritas.Models.StudentActivity.recordActivity(testActivity);
      if (result.success) {
        Logger.log('✓ Successfully recorded test activity: ' + result.activityId);
      }
    } else {
      Logger.log('✗ StudentActivity module NOT loaded');
    }
  } catch (e) {
    Logger.log('  Error: ' + e.message);
  }

  Logger.log('\n=== TEST COMPLETE ===');
}

function createStudentActivitySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.insertSheet('StudentActivity');

  var headers = [
    'ActivityID', 'Timestamp', 'PollID', 'SessionID', 'QuestionIndex', 'StudentEmail',
    'EventType', 'EventData', 'ClientTimestamp', 'ServerProcessedAt'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  Logger.log('✓ Created StudentActivity sheet');
}

/**
 * Get current student activity summary
 */
function getStudentActivitySummary() {
  var liveStatus = DataAccess.liveStatus.get();
  if (!liveStatus || !liveStatus[0]) {
    Logger.log('No active poll');
    return;
  }

  var pollId = liveStatus[0];
  var summary = Veritas.Models.StudentActivity.getActivitySummaryForPoll(pollId);

  Logger.log('=== ACTIVITY SUMMARY FOR ' + pollId + ' ===\n');

  Object.keys(summary).forEach(function(email) {
    var student = summary[email];
    Logger.log(email + ':');
    Logger.log('  Total Events: ' + student.totalEvents);
    Logger.log('  By Type:');
    Object.keys(student.eventsByType).forEach(function(type) {
      Logger.log('    ' + type + ': ' + student.eventsByType[type]);
    });
    Logger.log('  Question Views: ' + student.questionViews.length);
    Logger.log('  Answer Changes: ' + student.answerSelections.filter(function(a) { return a.previousAnswer; }).length);
    Logger.log('  Last Activity: ' + student.lastActivityAt);
    Logger.log('');
  });
}

/**
 * Manually unlock a student
 */
function unlockStudent(studentEmail) {
  var liveStatus = DataAccess.liveStatus.get();
  if (!liveStatus || !liveStatus[0]) {
    Logger.log('No active poll');
    return;
  }

  var pollId = liveStatus[0];

  try {
    var result = Veritas.Models.Session.teacherApproveUnlock(studentEmail, pollId, 0);
    Logger.log('Unlock result for ' + studentEmail + ':');
    Logger.log(JSON.stringify(result, null, 2));
  } catch (e) {
    Logger.log('Error: ' + e.message);
  }
}
