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
    const body = `Here is your unique link to access the live poll:\n\n${item.link}\n\nPlease click this link and wait for the poll to begin.`;
    // send email to each student individually so we can track them
    MailApp.sendEmail(item.email, subject, body);
  });
  return { success: true, count: links.length };
}
