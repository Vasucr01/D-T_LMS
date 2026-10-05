const fs = require('fs');
const path = require('path');
const os = require('os');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
require('dotenv').config();

const RECEIPTS_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'receipts') : path.join(__dirname, '..', 'public', 'receipts');
try {
  if (!fs.existsSync(RECEIPTS_DIR)) {
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[PDF SERVICE] Warning creating RECEIPTS_DIR:', err.message);
}

const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'data') : path.join(__dirname, '..', 'data');
const COUNTER_FILE = path.join(DATA_DIR, 'invoices.json');

const COMPANY = {
  name: 'D & T CAREER PLANNERS LLP',
  address: 'Registered Office: Office 610, Dwarika Pride, 150 Ft Ring Rd Gandhigram, Rajkot Raiya Road,',
  address2: 'Gandhigram Police Station, Rajkot',
  email: process.env.SMTP_USER || 'dtcareerllp18@gmail.com',
  phone: '7874370990',
  pan: 'AAZFD8275H',
  prefix: 'DT',
  declaration: 'Declaration: The particulars stated above are true and correct to the best of our knowledge.'
};

const SIGN_PATH = path.join(__dirname, '..', 'assets', 'signature.png');
let SIGN_BUF = null;
try {
  if (fs.existsSync(SIGN_PATH)) {
    SIGN_BUF = fs.readFileSync(SIGN_PATH);
  }
} catch (e) {
  console.warn('[PDF SERVICE] Signature buffer read skipped:', e.message);
}

function fyCode(d = new Date()) {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return String(start).slice(2) + String(start + 1).slice(2);
}

function loadDb() {
  try { return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf8')); }
  catch { return { counters: {}, byPayment: {} }; }
}

function saveDb(db) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.warn('[PDF SERVICE] Warning saving COUNTER_FILE:', err.message);
  }
}

function getInvoiceNo(paymentId) {
  const db = loadDb();
  if (paymentId && db.byPayment && db.byPayment[paymentId]) {
    return { no: db.byPayment[paymentId].no, existing: true, emailed: !!db.byPayment[paymentId].emailed };
  }
  const k = fyCode();
  let n = (db.counters[k] || 0) + 1;
  if (n === 1 && process.env.VERCEL) {
    n = (Math.floor(Date.now() / 1000) % 9000) + 1000;
  }
  db.counters[k] = n;
  const no = `${COMPANY.prefix}/${k}/${String(n).padStart(2, '0')}`;
  if (paymentId) {
    db.byPayment[paymentId] = { no, emailed: false };
    saveDb(db);
  }
  return { no, existing: false, emailed: false };
}

function markEmailed(paymentId) {
  if (!paymentId) return;
  const db = loadDb();
  if (db.byPayment[paymentId]) {
    db.byPayment[paymentId].emailed = true;
    saveDb(db);
  }
}

const fmtDate = (d) => new Date(d || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

function amountInWords(num) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : ''));
  const three = (n) => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + two(n % 100) : '') : two(n));
  const words = (n) => {
    if (n === 0) return 'Zero';
    const p = [];
    const cr = Math.floor(n / 1e7); n %= 1e7;
    const lk = Math.floor(n / 1e5); n %= 1e5;
    const th = Math.floor(n / 1e3); n %= 1e3;
    if (cr) p.push(three(cr) + ' Crore');
    if (lk) p.push(two(lk) + ' Lakh');
    if (th) p.push(two(th) + ' Thousand');
    if (n) p.push(three(n));
    return p.join(' ');
  };
  const r = Math.floor(num), ps = Math.round((num - r) * 100);
  return 'Rupees ' + words(r) + (ps ? ' and ' + words(ps) + ' Paise' : '') + ' Only';
}

/**
 * Builds official PDF invoice using pdf-lib (100% reliable serverless PDF generator)
 * @param {object} data 
 * @returns {Promise<Buffer>}
 */
async function buildInvoicePdf(data) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 dimensions
  const height = 841.89;

  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontR = await doc.embedFont(StandardFonts.Helvetica);

  const navy = rgb(27 / 255, 54 / 255, 93 / 255);
  const light = rgb(234 / 255, 241 / 255, 248 / 255);
  const cream = rgb(255 / 255, 244 / 255, 224 / 255);
  const lineCol = rgb(184 / 255, 204 / 255, 224 / 255);
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  const darkGray = rgb(0.4, 0.4, 0.4);

  const L = 28, W = 539, R = L + W;

  // Header Banner
  page.drawRectangle({ x: L, y: height - 30 - 46, width: W, height: 46, color: navy });
  page.drawText(COMPANY.name, { x: L + 110, y: height - 30 - 32, size: 18, font: fontB, color: white });

  // Address
  page.drawText(COMPANY.address, { x: L + 35, y: height - 88, size: 7.5, font: fontR, color: black });
  page.drawText(COMPANY.address2, { x: L + 180, y: height - 98, size: 7.5, font: fontR, color: black });
  page.drawText(`Email id- ${COMPANY.email}      Phone no.- ${COMPANY.phone}`, { x: L + 110, y: height - 112, size: 9, font: fontR, color: black });

  // Title
  page.drawText('OFFICIAL REGISTRATION INVOICE', { x: L + 130, y: height - 135, size: 14, font: fontB, color: navy });

  // Meta fields
  const drawField = (label, val, lx, vx, vw, yTop) => {
    const y = height - yTop;
    page.drawRectangle({ x: vx, y: y - 2, width: vw, height: 16, color: cream });
    page.drawText(label, { x: lx, y: y, size: 9, font: fontB, color: navy });
    page.drawText(String(val || ''), { x: vx + 4, y: y, size: 9, font: fontR, color: black });
  };

  const regIdVal = data.registrationId || data.invoiceNo || 'REG-2026-0001';
  drawField('Reg. ID', regIdVal, L, L + 62, 240, 162);
  drawField('Invoice No.', data.invoiceNo || regIdVal, L, L + 62, 240, 184);
  drawField('Service Period', data.servicePeriod || '2026 - 2027', L, L + 90, 212, 206);

  drawField('Invoice Date', fmtDate(data.invoiceDate), 375, 450, 117, 162);
  drawField('PAN No.', COMPANY.pan, 375, 450, 117, 184);
  drawField('Pay Status', 'CONFIRMED', 375, 450, 117, 206);

  // Student Billing Header
  page.drawRectangle({ x: L, y: height - 230 - 20, width: W, height: 20, color: navy });
  page.drawText('STUDENT & BILLING DETAILS', { x: L + 6, y: height - 230 - 14, size: 10, font: fontB, color: white });

  const c = data.customer || {};
  const studentInfo = [
    ['Student Name:', c.name || 'Student'],
    ['College / Institution:', c.address || 'N/A'],
    ['Stream & Semester:', c.city || 'N/A'],
    ['WhatsApp Mobile:', c.phone || 'N/A']
  ];

  studentInfo.forEach(([k, v], i) => {
    const yTop = 250 + i * 24;
    const y = height - yTop - 24;
    if (i % 2 === 0) page.drawRectangle({ x: L, y: y, width: W, height: 24, color: light });
    page.drawText(`${k} ${v}`, { x: L + 6, y: y + 7, size: 9.5, font: fontR, color: black });
  });

  // Table
  const topY = 356, hh = 30, rh = 26;
  const X = [L, 78, 330, 395, 465, R];
  page.drawRectangle({ x: L, y: height - topY - hh, width: W, height: hh, color: navy });

  const headers = ['Sr. No.', 'Particulars / Course Enrolled', 'Qty.', 'Rate (Rs.)', 'Amount (Rs.)'];
  headers.forEach((h, i) => {
    page.drawText(h, { x: X[i] + 6, y: height - topY - 20, size: 9, font: fontB, color: white });
  });

  let totalAmount = 0;
  for (let r = 0; r < 5; r++) {
    const yTop = topY + hh + r * rh;
    const y = height - yTop - rh;
    page.drawRectangle({ x: L, y: y, width: W, height: rh, color: white, borderColor: lineCol, borderWidth: 0.5 });
    page.drawText(String(r + 1), { x: L + 20, y: y + 8, size: 9, font: fontR, color: black });

    const it = (data.items || [])[r];
    if (it) {
      const lineAmt = (it.qty || 1) * (it.rate || 0);
      totalAmount += lineAmt;
      page.drawText(String(it.particulars || ''), { x: X[1] + 6, y: y + 8, size: 9, font: fontR, color: black });
      page.drawText(Number(it.qty || 1).toFixed(2), { x: X[2] + 15, y: y + 8, size: 9, font: fontR, color: black });
      page.drawText('Rs. ' + Number(it.rate || 0).toFixed(2), { x: X[3] + 6, y: y + 8, size: 9, font: fontR, color: black });
      page.drawText('Rs. ' + Number(lineAmt).toFixed(2), { x: X[4] + 6, y: y + 8, size: 9, font: fontR, color: black });
    }
  }

  const discount = data.discount || 0;
  const finalPayable = Math.max(0, totalAmount - discount);

  // Totals Box
  const totalYTop = topY + hh + 5 * rh + 14;
  const totalY = height - totalYTop - 20;
  page.drawRectangle({ x: L, y: totalY, width: W, height: 20, color: navy });
  page.drawText('TOTAL AMOUNT PAYABLE (Rs.)', { x: L + 200, y: totalY + 5, size: 10, font: fontB, color: white });
  page.drawText('Rs. ' + Number(finalPayable).toFixed(2), { x: 465, y: totalY + 5, size: 10, font: fontB, color: white });

  // Amount In Words
  const wordsYTop = totalYTop + 34;
  const wordsY = height - wordsYTop;
  page.drawText('Amount in Words:', { x: L, y: wordsY, size: 9.5, font: fontB, color: navy });
  page.drawText(amountInWords(finalPayable), { x: L + 95, y: wordsY, size: 9.5, font: fontR, color: black });

  // Signature Block
  const sigYTop = wordsYTop + 28;
  const sigY = height - sigYTop - 18;
  page.drawRectangle({ x: 350, y: sigY, width: R - 350, height: 18, color: navy });
  page.drawText('FOR D & T CAREER PLANNERS LLP', { x: 360, y: sigY + 4, size: 9, font: fontB, color: white });

  if (SIGN_BUF) {
    try {
      const signImg = await doc.embedPng(SIGN_BUF);
      page.drawImage(signImg, { x: 370, y: sigY - 55, width: 140, height: 45 });
    } catch (e) {
      console.warn('[PDF SERVICE] Signature embedding warning:', e.message);
    }
  }

  page.drawText(COMPANY.declaration, { x: L, y: sigY - 65, size: 8, font: fontR, color: darkGray });

  // Footer
  page.drawText('D T Career Planners LLP | Commercial Invoice & Registration Receipt', { x: L + 90, y: 30, size: 8.5, font: fontR, color: black });
  page.drawText('Page 1 of 1', { x: R - 50, y: 30, size: 8.5, font: fontR, color: black });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Main wrapper called by payment router to build, save and return PDF invoice
 * @param {object} regData 
 * @returns {Promise<{success: boolean, filePath: string, filename: string, url: string, invoiceNo: string, pdfBuffer: Buffer}>}
 */
async function generatePDFReceipt(regData) {
  const paymentId = regData.razorpayPaymentId || regData.registrationId || `PAY-${Date.now()}`;
  const { no } = getInvoiceNo(paymentId);

  const customer = {
    name: regData.fullName || 'Student',
    address: regData.collegeName || 'N/A',
    city: `${regData.stream || ''} (${regData.semester || ''})`,
    phone: regData.whatsappNumber || 'N/A'
  };

  const courseName = regData.course || regData.courseName || 'Complete All-In-One Career Package';
  const price = Number(regData.originalAmount || 249);
  const discount = Number(regData.discountAmount || 0);

  const now = new Date();
  const startDate = fmtDate(now);
  const endDate = fmtDate(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));
  const servicePeriod = `${startDate} - ${endDate}`;

  const pdfBuffer = await buildInvoicePdf({
    registrationId: regData.registrationId || 'REG-2026-0001',
    invoiceNo: no,
    invoiceDate: now,
    servicePeriod: servicePeriod,
    customer: customer,
    items: [{ particulars: courseName, qty: 1, rate: price }],
    discount: discount,
    otherCharges: 0
  });

  const filename = `Receipt_${(regData.registrationId || 'REG').replace(/[^a-zA-Z0-9\-]/g, '')}.pdf`;
  const filePath = path.join(RECEIPTS_DIR, filename);
  try {
    fs.writeFileSync(filePath, pdfBuffer);
    console.log(`[PDF SERVICE] Built Official PDF Invoice (${no}) at: ${filePath}`);
  } catch (writeErr) {
    console.warn(`[PDF SERVICE] Unable to write file to disk (${writeErr.message}), returning pdfBuffer directly.`);
  }

  return {
    success: true,
    filename: filename,
    filePath: filePath,
    url: `/receipts/${filename}`,
    invoiceNo: no,
    pdfBuffer: pdfBuffer
  };
}

module.exports = {
  generatePDFReceipt,
  buildInvoicePdf,
  getInvoiceNo,
  markEmailed,
  amountInWords
};
