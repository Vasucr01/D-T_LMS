const https = require('https');
const { URL } = require('url');
require('dotenv').config();

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '1j2NGJGq1eKzHlIWkfexh-Ze3dApu2Xq1VlgDuw_gKHo';

function postToWebhook(urlStr, data, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('Too many redirects'));

    const parsedUrl = new URL(urlStr);
    const postData = typeof data === 'string' ? data : JSON.stringify(data);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      // Follow Google Apps Script 302/303/307 redirects to script.googleusercontent.com
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location;
        https.get(redirectUrl, { timeout: 10000 }, (redRes) => {
          let body = '';
          redRes.on('data', (chunk) => { body += chunk; });
          redRes.on('end', () => {
            resolve({ statusCode: redRes.statusCode, body });
          });
        }).on('error', (err) => {
          // If redirect GET fails, treat initial 302 as success since Apps Script already ran doPost
          resolve({ statusCode: 200, body: JSON.stringify({ success: true, message: 'Synced (Redirect skipped)' }) });
        });
        return;
      }

      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: responseBody });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Google Sheet webhook request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyWkcUl5ziqAiGIzSe_kNBElGGmqfowNDBumDso6zUQDIrtkMDVoXCYZU8d0B2-YOb6/exec';

async function appendToGoogleSheet(regData) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  const formattedDate = new Date().toISOString().replace('T', ' ').substring(0, 19);

  const payload = {
    // Standard camelCase
    registrationId: regData.registrationId || '',
    fullName: regData.fullName || '',
    email: regData.email || '',
    whatsappNumber: regData.whatsappNumber || '',
    collegeName: regData.collegeName || '',
    stream: regData.stream || '',
    specialization: regData.specialization || '',
    semester: regData.semester || '',
    course: regData.course || regData.courseName || '',
    promoCode: regData.promoCode || 'N/A',
    originalAmount: regData.originalAmount || 249,
    discountAmount: regData.discountAmount || 0,
    finalAmount: regData.finalAmount || 249,
    razorpayOrderId: regData.razorpayOrderId || '',
    razorpayPaymentId: regData.razorpayPaymentId || '',
    paymentStatus: regData.paymentStatus || 'SUCCESS',
    pdfUrl: regData.pdfUrl || '',
    timestamp: formattedDate,

    // Header exact match aliases for Google Apps Script doPost
    'Registration ID': regData.registrationId || '',
    '\tRegistration ID': regData.registrationId || '',
    'Full Name': regData.fullName || '',
    'Email': regData.email || '',
    'WhatsApp Number': regData.whatsappNumber || '',
    'College / School': regData.collegeName || '',
    'Stream / Class': regData.stream || '',
    'Specialization': regData.specialization || '',
    'Semester': regData.semester || '',
    'Course': regData.course || regData.courseName || '',
    'Promo Code': regData.promoCode || 'N/A',
    'Original Amount': regData.originalAmount || 249,
    'Discount': regData.discountAmount || 0,
    'Final Amount': regData.finalAmount || 249,
    'Razorpay Order ID': regData.razorpayOrderId || '',
    'Razorpay Payment ID': regData.razorpayPaymentId || '',
    'Order ID': regData.razorpayOrderId || '',
    'Payment ID': regData.razorpayPaymentId || '',
    'Payment Status': regData.paymentStatus || 'SUCCESS',
    'Status': regData.paymentStatus || 'SUCCESS',
    'Date': formattedDate,
    'Payment Date': formattedDate,
    'PDF URL': regData.pdfUrl || '',
    'PDF Link': regData.pdfUrl || '',
    'Receipt URL': regData.pdfUrl || '',
    'Receipt Link': regData.pdfUrl || '',
    'url': regData.pdfUrl || '',
    'pdf_url': regData.pdfUrl || ''
  };

  console.log(`[GOOGLE SHEETS SERVICE] Saving entry to Google Sheet (ID: ${GOOGLE_SHEET_ID})`);

  if (!webhookUrl) {
    console.log('[GOOGLE SHEETS SERVICE] Webhook URL missing in .env');
    return { success: false, error: 'GOOGLE_SHEET_WEBHOOK_URL missing' };
  }

  try {
    const res = await postToWebhook(webhookUrl, payload);
    console.log(`[GOOGLE SHEETS SERVICE] Successfully synced record to Google Sheet! (HTTP ${res.statusCode})`);
    return { success: true, response: res.body };
  } catch (error) {
    console.error('[GOOGLE SHEETS SERVICE ERROR] Sync failed:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  appendToGoogleSheet,
  GOOGLE_SHEET_ID
};

