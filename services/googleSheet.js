const https = require('https');
const { URL } = require('url');
require('dotenv').config();

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '1j2NGJGq1eKzHlIWkfexh-Ze3dApu2Xq1VlgDuw_gKHo';

function postToWebhook(urlStr, data) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlStr);
    const postData = JSON.stringify(data);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      // Google Apps Script executes doPost on the initial POST and responds with 302/303 Found.
      // Treating 200, 301, 302, 303 as complete success.
      if (res.statusCode >= 200 && res.statusCode < 400) {
        return resolve({ statusCode: 200, body: JSON.stringify({ success: true, message: 'Synced to Google Sheet' }) });
      }

      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: responseBody });
      });
    });

    req.on('error', (err) => reject(err));
    req.write(postData);
    req.end();
  });
}

const DEFAULT_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbyWkcUl5ziqAiGIzSe_kNBElGGmqfowNDBumDso6zUQDIrtkMDVoXCYZU8d0B2-YOb6/exec';

async function appendToGoogleSheet(regData) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  
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
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),

    // Header exact match aliases for Google Apps Script doPst
    'Registration ID': regData.registrationId || '',
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
    'Payment Status': regData.paymentStatus || 'SUCCESS',
    'PDF URL': regData.pdfUrl || '',
    'PDF Link': regData.pdfUrl || '',
    'Receipt URL': regData.pdfUrl || '',
    'Receipt Link': regData.pdfUrl || '',
    'url': regData.pdfUrl || '',
    'pdf_url': regData.pdfUrl || '',
    'Payment Date': new Date().toISOString().replace('T', ' ').substring(0, 19)
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
