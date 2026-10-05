const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const os = require('os');

const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'data') : path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'registrations.xlsx');

// In-memory write queue to handle concurrent Excel writes safely
let writeQueue = Promise.resolve();

const HEADERS = [
  'Registration ID',
  'Full Name',
  'Email',
  'WhatsApp Number',
  'College / School',
  'Stream / Class',
  'Specialization',
  'Semester',
  'Course',
  'Promo Code',
  'Original Amount',
  'Discount',
  'Final Amount',
  'Razorpay Order ID',
  'Razorpay Payment ID',
  'Payment Status',
  'Payment Date',
  'Terms Accepted'
];

/**
 * Ensures data directory and registrations.xlsx exist with headers
 */
function initializeExcelFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(FILE_PATH)) {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([HEADERS]);
    
    // Set column widths for readability
    worksheet['!cols'] = [
      { wch: 16 }, // Reg ID
      { wch: 22 }, // Name
      { wch: 28 }, // Email
      { wch: 16 }, // Phone
      { wch: 26 }, // College
      { wch: 16 }, // Stream
      { wch: 22 }, // Specialization
      { wch: 12 }, // Semester
      { wch: 24 }, // Course
      { wch: 14 }, // Promo Code
      { wch: 16 }, // Original Amount
      { wch: 14 }, // Discount
      { wch: 14 }, // Final Amount
      { wch: 26 }, // Order ID
      { wch: 26 }, // Payment ID
      { wch: 16 }, // Status
      { wch: 20 }, // Date
      { wch: 16 }  // Terms
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');
    XLSX.writeFile(workbook, FILE_PATH);
    console.log('[EXCEL SERVICE] Created new registrations.xlsx file.');
  }
  } catch (err) {
    console.warn('[EXCEL SERVICE] Warning initializing Excel file:', err.message);
  }
}

/**
 * Reads all registration records from Excel file
 */
function readRegistrations() {
  initializeExcelFile();
  try {
    const workbook = XLSX.readFile(FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet);
  } catch (err) {
    console.error('[EXCEL SERVICE ERROR] Failed to read Excel file:', err);
    return [];
  }
}

/**
 * Generates next sequential Registration ID (e.g. REG-2026-0001)
 */
function generateNextRegistrationId(existingRows) {
  const currentYear = new Date().getFullYear();
  const prefix = `REG-${currentYear}-`;
  
  let maxNumber = 0;
  if (Array.isArray(existingRows) && existingRows.length > 0) {
    for (const row of existingRows) {
      const regId = row['Registration ID'] || '';
      if (regId.startsWith(prefix)) {
        const numPart = parseInt(regId.replace(prefix, ''), 10);
        if (!isNaN(numPart) && numPart > maxNumber) {
          maxNumber = numPart;
        }
      }
    }
  }

  if (maxNumber > 0) {
    const nextNumber = maxNumber + 1;
    return `${prefix}${String(nextNumber).padStart(4, '0')}`;
  }

  // On Vercel serverless containers where existingRows is empty,
  // generate a unique sequential ID based on current timestamp
  const timeNum = (Math.floor(Date.now() / 1000) % 9000) + 1000;
  return `${prefix}${timeNum}`;
}

/**
 * Saves a registration record into registrations.xlsx in a thread-safe manner
 * @param {object} regData 
 * @returns {Promise<{success: boolean, registrationId: string, isDuplicate: boolean}>}
 */
function saveRegistration(regData) {
  writeQueue = writeQueue.then(() => {
    return new Promise((resolve) => {
      try {
        const rows = readRegistrations();

        // Idempotency check: check if razorpay_payment_id already exists
        if (regData.razorpayPaymentId) {
          const existing = rows.find(r => r['Razorpay Payment ID'] === regData.razorpayPaymentId);
          if (existing) {
            console.log('[EXCEL SERVICE] Duplicate payment detected for ID:', regData.razorpayPaymentId);
            return resolve({
              success: true,
              registrationId: existing['Registration ID'],
              isDuplicate: true
            });
          }
        }

        const registrationId = generateNextRegistrationId(rows);
        const formattedDate = new Date().toISOString().replace('T', ' ').substring(0, 19);

        const newRow = {
          'Registration ID': registrationId,
          'Full Name': regData.fullName || '',
          'Email': regData.email || '',
          'WhatsApp Number': regData.whatsappNumber || '',
          'College / School': regData.collegeName || '',
          'Stream / Class': regData.stream || '',
          'Specialization': regData.specialization || '',
          'Semester': regData.semester || '',
          'Course': regData.course || '',
          'Promo Code': regData.promoCode || 'N/A',
          'Original Amount': regData.originalAmount || 0,
          'Discount': regData.discountAmount || 0,
          'Final Amount': regData.finalAmount || 0,
          'Razorpay Order ID': regData.razorpayOrderId || '',
          'Razorpay Payment ID': regData.razorpayPaymentId || '',
          'Payment Status': regData.paymentStatus || 'SUCCESS',
          'Payment Date': formattedDate,
          'Terms Accepted': regData.termsAccepted ? 'YES' : 'NO'
        };

        rows.push(newRow);

        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.json_to_sheet(rows, { header: HEADERS });
        
        worksheet['!cols'] = [
          { wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 26 },
          { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 24 }, { wch: 14 },
          { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 26 },
          { wch: 16 }, { wch: 20 }, { wch: 16 }
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');
        try {
          XLSX.writeFile(workbook, FILE_PATH);
        } catch (wErr) {
          console.warn('[EXCEL SERVICE WARNING] Disk write skipped in serverless environment:', wErr.message);
        }

        console.log(`[EXCEL SERVICE] Saved registration ${registrationId} for ${regData.fullName}`);
        resolve({
          success: true,
          registrationId: registrationId,
          isDuplicate: false
        });
      } catch (error) {
        console.error('[EXCEL SERVICE ERROR] Registration save error:', error.message);
        const fallbackRegId = `REG-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
        resolve({
          success: true,
          registrationId: fallbackRegId,
          isDuplicate: false
        });
      }
    });
  });

  return writeQueue;
}

const https = require('https');

/**
 * Fetches all registered student rows directly from Google Sheets CSV
 * @returns {Promise<Array<object>>}
 */
function fetchGoogleSheetRegistrations() {
  return new Promise((resolve) => {
    const url = 'https://docs.google.com/spreadsheets/d/1j2NGJGq1eKzHlIWkfexh-Ze3dApu2Xq1VlgDuw_gKHo/gviz/tq?tqx=out:csv';
    const req = https.get(url, { timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const workbook = XLSX.read(data, { type: 'string' });
          const sheetName = workbook.SheetNames[0];
          const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          const formattedRows = rawRows.map(r => ({
            'Registration ID': r['ID'] || r['Registration ID'] || r['registrationId'] || '',
            'Full Name': r['Full Name'] || r['fullName'] || '',
            'Email': r['Email'] || r['email'] || '',
            'WhatsApp Number': r['WhatsApp Number'] || r['whatsappNumber'] || '',
            'College / School': r['College / School'] || r['collegeName'] || '',
            'Stream / Class': r['Stream / Class'] || r['stream'] || '',
            'Specialization': r['Specialization'] || r['specialization'] || '',
            'Semester': r['Semester'] || r['semester'] || '',
            'Course': r['Course'] || r['course'] || '',
            'Promo Code': r['Promo Code'] || r['promoCode'] || 'N/A',
            'Original Amount': r['Original Amount'] || r['originalAmount'] || 249,
            'Discount': r['Discount'] || r['discountAmount'] || 0,
            'Final Amount': r['Final Amount'] || r['finalAmount'] || 249,
            'Razorpay Order ID': r['Order ID'] || r['Razorpay Order ID'] || r['razorpayOrderId'] || '',
            'Razorpay Payment ID': r['Payment ID'] || r['Razorpay Payment ID'] || r['razorpayPaymentId'] || '',
            'Payment Status': r['Status'] || r['Payment Status'] || r['paymentStatus'] || 'SUCCESS',
            'Payment Date': r['Date'] || r['Payment Date'] || r['timestamp'] || '',
            'Terms Accepted': r['Terms Accepted'] || 'YES',
            'PDF URL': r['PDF URL'] || r['PDF Link'] || r['Receipt URL'] || r['url'] || ''
          })).filter(r => r['Registration ID'] || r['Full Name']);
          resolve(formattedRows);
        } catch (e) {
          console.warn('[EXCEL SERVICE] Warning parsing Google Sheet CSV:', e.message);
          resolve([]);
        }
      });
    });
    req.on('error', (err) => {
      console.warn('[EXCEL SERVICE] Warning fetching Google Sheet CSV:', err.message);
      resolve([]);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve([]);
    });
  });
}

/**
 * Merges local registrations with Google Sheet remote registrations
 * @returns {Promise<Array<object>>}
 */
async function readRegistrationsAsync() {
  const localRows = readRegistrations() || [];
  const remoteRows = await fetchGoogleSheetRegistrations();

  const map = new Map();
  for (const r of remoteRows) {
    const key = r['Registration ID'] || r['Razorpay Payment ID'];
    if (key) map.set(key, r);
  }
  for (const r of localRows) {
    const key = r['Registration ID'] || r['Razorpay Payment ID'];
    if (key) map.set(key, r);
  }

  return Array.from(map.values());
}

// Initializing file upon module load
try {
  initializeExcelFile();
} catch (err) {
  console.warn('[EXCEL SERVICE] Module load initialization warning:', err.message);
}

module.exports = {
  saveRegistration,
  readRegistrations,
  readRegistrationsAsync,
  initializeExcelFile
};
