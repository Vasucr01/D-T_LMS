const https = require('https');
const { URL } = require('url');
require('dotenv').config();

const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID || '1j2NGJGq1eKzHlIWkfexh-Ze3dApu2Xq1VlgDuw_gKHo';

function postToWebhook(urlStr, data, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('Too many redirects'));

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
      // Handle Google Apps Script 302/303 Redirects automatically
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location;
        // Follow redirect using GET/POST as appropriate
        return resolve(fetchRedirectUrl(redirectUrl, maxRedirects - 1));
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

function fetchRedirectUrl(urlStr, maxRedirects) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('Too many redirects'));
    const parsedUrl = new URL(urlStr);
    
    https.get(parsedUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchRedirectUrl(res.headers.location, maxRedirects - 1));
      }
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: responseBody });
      });
    }).on('error', reject);
  });
}

/**
 * Sends registration record data to Google Sheet via Webhook / Apps Script
 * @param {object} regData 
 */
async function appendToGoogleSheet(regData) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL || '';
  
  const payload = {
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
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
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
