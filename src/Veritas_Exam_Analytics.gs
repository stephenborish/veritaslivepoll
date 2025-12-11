// =============================================================================
// VERITAS LIVE POLL - EXAM ANALYTICS SERVICE
// =============================================================================
// Purpose: Compute and Store Exam Analytics
// Dependencies: Data_Access, Config, Utils
// =============================================================================

var Veritas = Veritas || {};
Veritas.ExamAnalyticsService = Veritas.ExamAnalyticsService || {};

/**
 * Compute analytics for a specific exam
 * Reads ExamResponses, aggregates per question, writes to ExamAnalytics sheet.
 * @param {string} examId
 */
Veritas.ExamAnalyticsService.computeAnalyticsForExam = function(examId) {
  return Veritas.Utils.withLock(function() {
    var ss = Veritas.Data.getSpreadsheet();
    var responseSheet = ss.getSheetByName(Veritas.Config.SHEET_NAMES.EXAM_RESPONSES);
    var analyticsSheet = Veritas.Data.ensureSheet(ss, Veritas.Config.SHEET_NAMES.EXAM_ANALYTICS);
    Veritas.Data.ensureHeaders(analyticsSheet, Veritas.Config.SHEET_HEADERS.EXAM_ANALYTICS);

    if (!responseSheet) {
      Veritas.Logging.warn('Responses sheet not found for analytics', { examId: examId });
      return;
    }

    var respData = responseSheet.getDataRange().getValues();
    var respHeaders = Veritas.Config.SHEET_HEADERS.EXAM_RESPONSES;
    var colMap = {};
    respHeaders.forEach(function(h, i) { colMap[h] = i; });

    // 1. Aggregate Data
    var stats = {}; // { questionId: { total: 0, correct: 0, points: 0, elapsed: 0, elapsedCount: 0 } }

    for (var i = 1; i < respData.length; i++) {
      var row = respData[i];
      if (row[colMap['ExamId']] !== examId) continue;

      var qId = row[colMap['QuestionId']];
      if (!stats[qId]) {
        stats[qId] = { total: 0, correct: 0, points: 0, elapsed: 0, elapsedCount: 0 };
      }

      stats[qId].total++;

      var isCorrect = row[colMap['IsCorrect']];
      if (isCorrect === true || isCorrect === 'TRUE') {
        stats[qId].correct++;
      }

      var pts = Number(row[colMap['PointsEarned']]) || 0;
      stats[qId].points += pts;

      var sec = Number(row[colMap['ElapsedSeconds']]);
      if (!isNaN(sec) && sec > 0) {
        stats[qId].elapsed += sec;
        stats[qId].elapsedCount++;
      }
    }

    // 2. Prepare Rows for Analytics Sheet
    var analyticsHeaders = Veritas.Config.SHEET_HEADERS.EXAM_ANALYTICS;
    var aColMap = {};
    analyticsHeaders.forEach(function(h, i) { aColMap[h] = i; });

    var timestamp = new Date().toISOString();
    var rowsToWrite = [];

    // Clear existing analytics for this exam? Or update?
    // Strategy: Delete existing rows for this exam, then append new ones.
    var currentAnalyticsData = analyticsSheet.getDataRange().getValues();
    var rowsToKeep = [currentAnalyticsData[0]]; // Header

    // Filter out old rows for this exam
    for (var i = 1; i < currentAnalyticsData.length; i++) {
      if (currentAnalyticsData[i][aColMap['ExamId']] !== examId) {
        rowsToKeep.push(currentAnalyticsData[i]);
      }
    }

    // Build new rows
    Object.keys(stats).forEach(function(qId) {
      var s = stats[qId];
      var percentCorrect = s.total > 0 ? (s.correct / s.total) * 100 : 0;
      var avgPoints = s.total > 0 ? (s.points / s.total) : 0;
      var avgElapsed = s.elapsedCount > 0 ? (s.elapsed / s.elapsedCount) : 0;

      var row = new Array(analyticsHeaders.length);
      row[aColMap['ExamId']] = examId;
      row[aColMap['QuestionId']] = qId;
      row[aColMap['NumResponses']] = s.total;
      row[aColMap['NumCorrect']] = s.correct;
      row[aColMap['PercentCorrect']] = percentCorrect.toFixed(2);
      row[aColMap['AveragePointsEarned']] = avgPoints.toFixed(2);
      row[aColMap['AverageElapsedSeconds']] = avgElapsed.toFixed(1);
      row[aColMap['PointBiserial']] = ''; // Placeholder for advanced math
      row[aColMap['LastComputed']] = timestamp;

      rowsToWrite.push(row);
    });

    // 3. Write Back
    // If we filtered locally, we need to overwrite the sheet.
    // Optimization: If sheet is huge, this is slow. But for v1 it's safe.
    if (rowsToWrite.length > 0) {
       // Append to rowsToKeep
       var finalData = rowsToKeep.concat(rowsToWrite);
       analyticsSheet.clearContents();
       analyticsSheet.getRange(1, 1, finalData.length, analyticsHeaders.length).setValues(finalData);
    } else {
       // No stats? Just clean up.
       if (rowsToKeep.length < currentAnalyticsData.length) {
          analyticsSheet.clearContents();
          if (rowsToKeep.length > 0) {
             analyticsSheet.getRange(1, 1, rowsToKeep.length, analyticsHeaders.length).setValues(rowsToKeep);
          }
       }
    }

    Veritas.Logging.info('Analytics computed', { examId: examId, questionCount: Object.keys(stats).length });
    return { success: true, count: Object.keys(stats).length };
  });
};
