/**
 * Generate unique poll links for each student.
 * @param {string[]} studentEmails list of student email addresses.
 * @return {Object[]} array of objects with email, link, and token.
 */
function generateStudentPollLinks(studentEmails) {
  if (!studentEmails || !studentEmails.length) {
    throw new Error('No student emails provided');
  }
  const baseUrl = ScriptApp.getService().getUrl();
  const props = PropertiesService.getScriptProperties();
  const tokenMapStr = props.getProperty('STUDENT_TOKENS') || '{}';
  const tokenMap = JSON.parse(tokenMapStr);
  const results = [];

  studentEmails.forEach(email => {
    const token = Utilities.getUuid();
    const link = `${baseUrl}?token=${token}`;
    tokenMap[token] = email;
    results.push({ email: email, link: link, token: token });
  });

  props.setProperty('STUDENT_TOKENS', JSON.stringify(tokenMap));
  return results;
}

/**
 * Generate links and send them to students via email.
 * @param {string[]} studentEmails list of student email addresses.
 * @return {Object} summary of emails sent.
 */
function sendStudentPollLinks(studentEmails) {
  const links = generateStudentPollLinks(studentEmails);

  // Get current date formatted like "November 6, 2025"
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM d, yyyy");

  links.forEach(item => {
    const subject = `Your VERITAS Live Poll Link – ${today}`;

    // Shorten the URL for better user experience
    const shortUrl = URLShortener.shorten(item.link);

    // HTML email template
    const htmlBody = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>VERITAS Poll Link</title>
      </head>
      <body style="margin:0; padding:0; background-color:#f7f8fa; font-family:Arial, Helvetica, sans-serif;">
        <div style="max-width:640px; margin:48px auto; background-color:#ffffff; padding:40px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08); text-align:center; border-top:5px solid #c5a05a;">
          <p style="font-size:16px; color:#1c1c1c; margin-bottom:28px; line-height:1.6; font-weight:400;">
            Hi there — your <strong style="color:#12385d;">VERITAS</strong> link is ready.<br>
            Use the button below to begin participating.<br>
            Once you begin, stay in fullscreen and don't navigate to any other browser tabs or apps.
          </p>

          <a href="${shortUrl}" target="_blank" rel="noopener"
            style="display:inline-block; font-size:16px; font-weight:600; color:#ffffff; background-color:#12385d; text-decoration:none; padding:14px 36px; border-radius:8px; border:1px solid #0f2f4d; letter-spacing:0.3px;">
            Begin Your VERITAS Session
          </a>

          <p style="font-size:13px; color:#555555; margin-top:36px; line-height:1.7;">
            If the button doesn’t work, copy and paste this link into your browser:<br>
            <a href="${shortUrl}" target="_blank" style="color:#12385d; text-decoration:underline; word-break:break-word;">
              ${shortUrl}
            </a>
          </p>

          <hr style="border:none; border-top:1px solid #e6e6e6; margin:36px 0;">

          <p style="font-size:12px; color:#888888; line-height:1.6; margin:0;">
            This link is unique to you.<br>
            Do not share it — it connects directly to your personal session in <span style="color:#12385d; font-weight:600;">VERITAS</span>.
          </p>
        </div>
      </body>
      </html>
    `;

    // Send email
    MailApp.sendEmail({
      to: item.email,
      subject: subject,
      htmlBody: htmlBody
    });
  });

  return { success: true, count: links.length };
}
