const nodemailer = require('nodemailer');
require('dotenv').config();

// Configure Transporter if SMTP credentials exist in .env
function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = (process.env.SMTP_USER || '').trim();
  const pass = (process.env.SMTP_PASS || '').trim();

  if (!user || !pass) {
    return null;
  }

  // Use Nodemailer built-in Gmail service for maximum reliability
  if (host.includes('gmail') || user.endsWith('@gmail.com')) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: user,
        pass: pass
      }
    });
  }

  return nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: {
      user: user,
      pass: pass
    }
  });
}

/**
 * Sends a rich HTML enrollment confirmation email to the student with payment details & PDF receipt link
 * @param {object} regData 
 * @returns {Promise<{success: boolean, messageId?: string, isMock?: boolean, error?: string}>}
 */
async function sendEnrollmentConfirmationEmail(regData) {
  const transporter = getTransporter();
  const recipientEmail = (regData.email || '').trim();

  if (!recipientEmail) {
    console.error('[EMAIL SERVICE ERROR] Missing recipient email address.');
    return { success: false, error: 'Recipient email address missing' };
  }

  const fromEmail = process.env.EMAIL_FROM || `"D & T CAREER PLANNERS LLP" <${process.env.SMTP_USER || 'no-reply@dtcareers.in'}>`;
  const pdfDownloadUrl = regData.pdfUrl || '#';
  const loginUrl = process.env.SUCCESS_REDIRECT_URL || 'https://www.gyanteerthlearning.online/login/';

  // HTML Email Body Template
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Enrollment Confirmation - D&T Career Planners LLP</title>
      <style>
        body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f4f7fa; margin: 0; padding: 0; color: #1e293b; }
        .email-container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #0056A4 0%, #003366 100%); color: #ffffff; padding: 30px 25px; text-align: center; }
        .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
        .header p { margin: 6px 0 0 0; font-size: 13px; opacity: 0.9; text-transform: uppercase; letter-spacing: 1px; }
        .badge-success { display: inline-block; background-color: #10b981; color: #ffffff; padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 15px; }
        .content { padding: 30px 25px; }
        .greeting { font-size: 16px; margin-bottom: 15px; font-weight: 600; color: #0f172a; }
        .info-card { background: #f8fafc; border-left: 4px solid #0056A4; padding: 15px 18px; border-radius: 6px; margin-bottom: 25px; }
        .info-card table { width: 100%; border-collapse: collapse; }
        .info-card td { padding: 6px 0; font-size: 14px; vertical-align: top; }
        .label { color: #64748b; font-weight: 600; width: 40%; }
        .value { color: #0f172a; font-weight: 500; }
        .courses-list { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 18px; margin-bottom: 25px; }
        .courses-list h3 { margin: 0 0 10px 0; color: #1e40af; font-size: 15px; }
        .courses-list ul { margin: 0; padding-left: 20px; }
        .courses-list li { margin-bottom: 5px; font-size: 13.5px; color: #1e3a8a; }
        .action-buttons { text-align: center; margin: 30px 0 20px 0; }
        .btn { display: inline-block; padding: 12px 24px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px; margin: 5px; }
        .btn-primary { background-color: #0056A4; color: #ffffff !important; box-shadow: 0 3px 6px rgba(0,86,164,0.3); }
        .btn-success { background-color: #10b981; color: #ffffff !important; box-shadow: 0 3px 6px rgba(16,185,129,0.3); }
        .footer { background: #0f172a; color: #94a3b8; padding: 20px; text-align: center; font-size: 12px; }
        .footer a { color: #38bdf8; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="email-container">
        <!-- Header -->
        <div class="header">
          <h1>D & T CAREER PLANNERS LLP</h1>
          <p>Training • Development • Placements</p>
          <div class="badge-success">✓ PAYMENT VERIFIED & CONFIRMED</div>
        </div>

        <!-- Body Content -->
        <div class="content">
          <div class="greeting">Dear ${regData.fullName || 'Student'},</div>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            Congratulations! Your payment of <strong>INR ${regData.finalAmount || 249}</strong> has been successfully processed, and your seat for the professional certification package is now confirmed.
          </p>

          <!-- Transaction & Registration Summary -->
          <div class="info-card">
            <table>
              <tr>
                <td class="label">Registration ID:</td>
                <td class="value"><strong>${regData.registrationId || 'REG-2026-0001'}</strong></td>
              </tr>
              <tr>
                <td class="label">Student Name:</td>
                <td class="value">${regData.fullName || ''}</td>
              </tr>
              <tr>
                <td class="label">College / School:</td>
                <td class="value">${regData.collegeName || ''}</td>
              </tr>
              <tr>
                <td class="label">Stream & Semester:</td>
                <td class="value">${regData.stream || ''} (${regData.semester || ''})</td>
              </tr>
              <tr>
                <td class="label">Payment ID:</td>
                <td class="value">${regData.razorpayPaymentId || 'N/A'}</td>
              </tr>
              <tr>
                <td class="label">Amount Paid:</td>
                <td class="value"><strong>INR ${regData.finalAmount || 249}</strong></td>
              </tr>
            </table>
          </div>

          <!-- Included Package Courses -->
          <div class="courses-list">
            <h3>🎓 Complete All-In-One Package Included Courses:</h3>
            <ul>
              <li>Quantitative Aptitude Masterclass</li>
              <li>Microsoft Excel (Basic to Advanced)</li>
              <li>Verbal Ability & Grammar Excellence</li>
              <li>Soft Skills & Placement Interview Prep</li>
              <li>MySQL Database & SQL Querying</li>
            </ul>
          </div>

          <!-- CTA Buttons -->
          <div class="action-buttons">
            <a href="${pdfDownloadUrl}" target="_blank" class="btn btn-primary">📄 Download Official PDF Receipt</a>
          </div>

          <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin-top: 25px;">
            Please keep this email and your Registration ID (<strong>${regData.registrationId || ''}</strong>) safe for future reference. If you have any questions, feel free to reply to this email.
          </p>
        </div>

        <!-- Footer -->
        <div class="footer">
          <p>© 2026 D & T CAREER PLANNERS LLP. All Rights Reserved.</p>
          <p>Vadodara, Gujarat, India • Support: <a href="mailto:support@gyanteerthlearning.online">support@gyanteerthlearning.online</a></p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Log preview if SMTP is not configured in .env
  if (!transporter) {
    console.log(`[EMAIL SERVICE MOCK] SMTP credentials pending in .env. Simulated sending email to ${recipientEmail}`);
    console.log(`[EMAIL SERVICE MOCK] Subject: Enrollment Confirmation & PDF Receipt - ${regData.registrationId}`);
    return {
      success: true,
      isMock: true,
      message: 'SMTP credentials missing in .env. Email simulated cleanly.'
    };
  }

  try {
    const plainTextContent = 
      `Dear ${regData.fullName || 'Student'},\n\n` +
      `Thank you for enrolling with D & T CAREER PLANNERS LLP.\n\n` +
      `Your payment of INR ${regData.finalAmount || 249} has been successfully verified and your enrollment is confirmed.\n\n` +
      `REGISTRATION DETAILS:\n` +
      `- Registration ID: ${regData.registrationId || ''}\n` +
      `- Student Name: ${regData.fullName || ''}\n` +
      `- College: ${regData.collegeName || ''}\n` +
      `- Stream & Sem: ${regData.stream || ''} (${regData.semester || ''})\n` +
      `- Payment ID: ${regData.razorpayPaymentId || 'N/A'}\n` +
      `- Amount Paid: INR ${regData.finalAmount || 249}\n\n` +
      `INCLUDED COURSES:\n` +
      `1. Quantitative Aptitude Masterclass\n` +
      `2. Microsoft Excel (Basic to Advanced)\n` +
      `3. Verbal Ability & Grammar Excellence\n` +
      `4. Soft Skills & Placement Interview Prep\n` +
      `5. MySQL Database & SQL Querying\n\n` +
      `Download PDF Receipt: ${pdfDownloadUrl}\n\n` +
      `Regards,\nD & T CAREER PLANNERS LLP\n` +
      `Support: dtcareerllp18@gmail.com | Phone: 7874370990`;

    const mailOptions = {
      from: fromEmail,
      to: recipientEmail,
      replyTo: (process.env.SMTP_USER || 'dtcareerllp18@gmail.com').trim(),
      subject: `Enrollment Confirmation & Official PDF Receipt - ${regData.registrationId || 'D&T Careers'}`,
      text: plainTextContent,
      html: htmlContent,
      attachments: []
    };

    if (regData.pdfBuffer) {
      mailOptions.attachments.push({
        filename: `Invoice-${(regData.registrationId || 'DT').replace(/\//g, '-')}.pdf`,
        content: regData.pdfBuffer,
        contentType: 'application/pdf'
      });
    } else if (regData.filePath && fs.existsSync(regData.filePath)) {
      mailOptions.attachments.push({
        filename: `Invoice-${(regData.registrationId || 'DT').replace(/\//g, '-')}.pdf`,
        path: regData.filePath,
        contentType: 'application/pdf'
      });
    }

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Successfully sent confirmation email to ${recipientEmail}. Message ID: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
      isMock: false
    };
  } catch (err) {
    console.error('[EMAIL SERVICE ERROR] Failed to send email:', err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

module.exports = {
  sendEnrollmentConfirmationEmail
};
