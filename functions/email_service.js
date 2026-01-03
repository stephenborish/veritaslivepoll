const nodemailer = require('nodemailer');
const functions = require('firebase-functions');

/**
 * Sends an email using the configured SMTP settings in functions.config().smtp.
 * 
 * @param {Object} payload - The email payload.
 * @param {string} payload.to - Recipient email address.
 * @param {string} payload.subject - Email subject.
 * @param {string} payload.html - Email content in HTML format.
 * @returns {Promise<any>} - A promise that resolves when the email is sent.
 */
async function sendEmail({ to, subject, html }) {
    const smtpConfig = functions.config().smtp;

    if (!smtpConfig || !smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
        throw new Error('SMTP configuration is missing. Please set functions.config().smtp.host, user, and pass.');
    }

    const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port || 465,
        secure: smtpConfig.secure ? smtpConfig.secure === 'true' : (smtpConfig.port == 465),
        auth: {
            user: smtpConfig.user,
            pass: smtpConfig.pass
        }
    });

    const mailOptions = {
        from: 'VERITAS <email@veritas.courses>',
        to: to,
        subject: subject,
        html: html
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Message sent: %s', info.messageId);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}

module.exports = {
    sendEmail
};
