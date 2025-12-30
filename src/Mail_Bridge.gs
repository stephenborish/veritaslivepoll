/**
 * Minimal GAS mail bridge for the decoupled Veritas application.
 * This file stays in GAS even after full migration to handle Google-authenticated services.
 */

var Veritas = Veritas || {};
Veritas.MailBridge = Veritas.MailBridge || {};

/**
 * Send emails to a list of students with their unique links.
 * @param {Object} payload - Email payload from Client/Firebase
 */
function sendEmailBridge(payload) {
  try {
    var subject = payload.subject;
    var links = payload.links;
    var baseUrl = payload.baseUrl;
    var pollName = payload.pollName;
    var senderEmail = Session.getActiveUser().getEmail();

    var sentCount = 0;
    var failedCount = 0;
    var failures = [];

    links.forEach(function(student) {
      try {
        var studentEmail = student.email;
        var studentName = student.name;
        var token = student.token;
        var fullUrl = baseUrl + '?token=' + token;

        var bodyHtml = '<div style="font-family: Arial, sans-serif; padding: 20px;">' +
          '<h2>Hello ' + studentName + ',</h2>' +
          '<p>Your teacher is inviting you to join <strong>' + pollName + '</strong>.</p>' +
          '<div style="margin: 30px 0;">' +
          '<a href="' + fullUrl + '" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">Join Session</a>' +
          '</div>' +
          '<p>If the button doesn\'t work, copy and paste this link into your browser:</p>' +
          '<p>' + fullUrl + '</p>' +
          '</div>';

        MailApp.sendEmail({
          to: studentEmail,
          subject: subject,
          htmlBody: bodyHtml
        });
        sentCount++;
      } catch (e) {
        failedCount++;
        failures.push({ name: student.name, error: e.toString() });
      }
    });

    return {
      success: true,
      sentCount: sentCount,
      failedCount: failedCount,
      failures: failures
    };
  } catch (err) {
    return {
      success: false,
      error: err.toString()
    };
  }
}

/**
 * Trigger OAuth prompt for MailApp
 */
function authorizeEmail() {
  // Just calling a MailApp method is enough to trigger the prompt
  return MailApp.getRemainingDailyQuota();
}
