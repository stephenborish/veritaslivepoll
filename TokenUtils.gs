/**
 * Generate unique poll links for each student.
 * @param {string[]} studentEmails list of student email addresses.
 *img* @return {Object[]} array of objects with email, link, and token.
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
  links.forEach(item => {
    const subject = "Your Veritas Live Poll Link";

    // Shorten the URL for better user experience
    const shortUrl = URLShortener.shorten(item.link);

    // HTML email template
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body>
        <div style="text-align:center; margin:25px 0; font-family: Arial, Helvetica, sans-serif;">
          <p style="margin-bottom: 20px; color: #333333;">Please submit your response using the button below:</p>
          <a
            href="${shortUrl}"
            target="_blank"
            rel="noopener"
            style="display:inline-block;font-family:Arial, Helvetica, sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;text-align:center;background-color:#007bff;padding:12px 25px;border-radius:5px;border:1px solid #0056b3;mso-padding-alt:0px;mso-border-alt:none"
          >
            Click HERE to Submit Response
          </a>
        </div>

        <p style="font-family:Arial, sans-serif; font-size:13px; color:#555555; text-align:center; margin-top:20px;">
          If the button above doesn't work, copy and paste this link into your browser:
          <br/>
          <a href="${shortUrl}" target="_blank" style="color:#007bff; text-decoration:underline;">
            ${shortUrl}
          </a>
        </p>
      </body>
      </html>
    `;

    // send email to each student individually so we can track them
    MailApp.sendEmail({
      to: item.email,
      subject: subject,
      htmlBody: htmlBody
    });
  });
  return { success: true, count: links.length };
}
