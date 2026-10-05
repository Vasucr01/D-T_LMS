const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const os = require('os');

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

// ============================ FIXED COMPANY INFO ============================
const COMPANY = {
  name: 'D & T CAREER PLANNERS LLP',
  address:
    'Registered Office: Office 610, Dwarika Pride, 150 Ft Ring Rd Gandhigram, Rajkot Raiya Road,\nGandhigram Police Station, Rajkot',
  email: process.env.SMTP_USER || 'dtcareerllp18@gmail.com',
  phone: '7874370990',
  pan: 'AAZFD8275H',
  prefix: 'DT',
  declaration: 'Declaration: The particulars stated above are true and correct to the best of our knowledge.'
};
const NAVY = '#1B365D', LIGHT = '#EAF1F8', CREAM = '#FFF4E0', LINE = '#B8CCE0';
const SIGN = path.join(__dirname, '..', 'assets', 'signature.png');

let SIGN_BUF = null;
try {
  if (fs.existsSync(SIGN)) {
    SIGN_BUF = fs.readFileSync(SIGN);
  }
} catch (e) {
  console.warn('[PDF SERVICE] Signature buffer read skipped:', e.message);
}

const { FONT_REGULAR_B64, FONT_BOLD_B64 } = require('./embeddedFonts');

const FONT_R_BUF = Buffer.from(FONT_REGULAR_B64, 'base64');
const FONT_B_BUF = Buffer.from(FONT_BOLD_B64, 'base64');
const RS = 'Rs. ';

// ============================ INVOICE NUMBERING ============================
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

// ============================ HELPERS ============================
const inr = (n) => RS + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

// ============================ PDF BUILDER ============================
function buildInvoicePdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    let REG = 'Helvetica', BLD = 'Helvetica-Bold';
    try {
      doc.registerFont('R', FONT_R_BUF);
      doc.registerFont('B', FONT_B_BUF);
      REG = 'R';
      BLD = 'B';
    } catch (fontErr) {
      console.warn('[PDF SERVICE] Using standard Helvetica font fallback:', fontErr.message);
      REG = 'Helvetica';
      BLD = 'Helvetica-Bold';
    }

    const L = 28, W = 539, R = L + W;
    const txt = (s, x, y, o = {}) => doc.text(String(s ?? ''), x, y, { lineBreak: false, ...o });

    // ---- Header ----
    doc.rect(L, 30, W, 46).fill(NAVY);
    doc.fillColor('#fff').font(BLD).fontSize(22);
    txt(COMPANY.name, L, 43, { width: W, align: 'center' });
    doc.fillColor('#000').font(REG).fontSize(7.5)
      .text(COMPANY.address, L, 82, { width: W, align: 'center', lineGap: 3 });
    doc.fontSize(9.5);
    txt(`Email id- ${COMPANY.email}      Phone no.- ${COMPANY.phone}`, L, 108, { width: W, align: 'center' });
    doc.fillColor(NAVY).font(BLD).fontSize(15);
    txt('OFFICIAL REGISTRATION INVOICE', L, 130, { width: W, align: 'center' });

    // ---- Meta fields ----
    const field = (label, value, lx, vx, vw, y) => {
      doc.rect(vx, y - 2, vw, 16).fill(CREAM);
      doc.fillColor(NAVY).font(BLD).fontSize(9.5); txt(label, lx, y);
      doc.fillColor('#000').font(REG).fontSize(9.5); txt(value, vx + 4, y);
    };
    const regIdVal = data.registrationId || data.invoiceNo || 'REG-2026-0001';
    field('Reg. ID', regIdVal, L, L + 62, 240, 162);
    field('Invoice No.', data.invoiceNo, L, L + 62, 240, 184);
    field('Service Period', data.servicePeriod, L, L + 90, 212, 206);

    field('Invoice Date', fmtDate(data.invoiceDate), 375, 450, 117, 162);
    field('PAN No.', COMPANY.pan, 375, 450, 117, 184);
    field('Pay Status', 'CONFIRMED', 375, 450, 117, 206);

    // ---- Bill to ----
    doc.rect(L, 230, W, 20).fill(NAVY);
    doc.fillColor('#fff').font(BLD).fontSize(10); txt('STUDENT & BILLING DETAILS', L + 6, 235);
    const c = data.customer || {};
    [['Student Name:', c.name || 'N/A'], ['College / Institution:', c.address || 'N/A'], ['Stream & Semester:', c.city || 'N/A'], ['WhatsApp Mobile:', c.phone || 'N/A']]
      .forEach(([k, v], i) => {
        const y = 250 + i * 24;
        if (i % 2 === 0) doc.rect(L, y, W, 24).fill(LIGHT);
        doc.fillColor('#000').font(REG).fontSize(9.5);
        txt(`${k} ${v || ''}`, L + 6, y + 6, { width: W - 12 });
      });

    // ---- Items table ----
    const top = 356, hh = 30, rh = 26;
    const X = [L, 78, 330, 395, 465, R];
    doc.rect(L, top, W, hh).fill(NAVY);
    doc.fillColor('#fff').font(BLD).fontSize(9.5);
    ['Sr. No.', 'Particulars / Course Enrolled', 'Qty.', `Rate (${RS.trim()})`, `Amount (${RS.trim()})`]
      .forEach((h, i) => txt(h, X[i], top + 10, { width: X[i + 1] - X[i], align: 'center' }));
    for (let r = 0; r < 5; r++) {
      const y = top + hh + r * rh;
      doc.lineWidth(0.5).strokeColor(LINE).rect(L, y, W, rh).stroke();
      X.slice(1, -1).forEach((x) => doc.moveTo(x, y).lineTo(x, y + rh).stroke());
      doc.fillColor('#000').font(REG).fontSize(9.5);
      txt(r + 1, L, y + 7, { width: 50, align: 'center' });
      const it = data.items[r];
      if (it) {
        txt(it.particulars, X[1] + 4, y + 7, { width: X[2] - X[1] - 8 });
        txt(Number(it.qty).toFixed(2), X[2], y + 7, { width: X[3] - X[2], align: 'center' });
        txt(inr(it.rate), X[3] + 4, y + 7);
        txt(inr(it.qty * it.rate), X[4] + 4, y + 7);
      }
    }

    // ---- Totals ----
    const subtotal = data.items.reduce((s, i) => s + (i.qty * i.rate), 0);
    const discount = data.discount || 0, other = data.otherCharges || 0;
    const total = Math.max(0, subtotal - discount + other);
    let y = top + hh + 5 * rh + 14;
    [['Subtotal', subtotal], [`Discount (${RS.trim()})`, discount], [`Other Charges (${RS.trim()})`, other]]
      .forEach(([k, v], i) => {
        doc.rect(L, y, W, 16).fill(i % 2 === 0 ? LIGHT : '#fff');
        doc.fillColor(NAVY).font(BLD).fontSize(9.5);
        txt(k, L, y + 3, { width: 465 - L - 6, align: 'right' });
        txt(inr(v), 469, y + 3);
        y += 16;
      });
    doc.rect(L, y, W, 20).fill(NAVY);
    doc.fillColor('#fff').font(BLD).fontSize(10);
    txt(`TOTAL AMOUNT PAYABLE (${RS.trim()})`, L, y + 5, { width: 465 - L - 6, align: 'right' });
    txt(inr(total), 469, y + 5);

    // ---- Amount in words ----
    y += 34;
    doc.fillColor(NAVY).font(BLD).fontSize(9.5); txt('Amount in Words:', L, y);
    doc.fillColor('#000').font(REG).fontSize(9.5); txt(amountInWords(total), L + 95, y, { width: W - 95 });

    // ---- Signature block ----
    y += 28;
    doc.rect(350, y, R - 350, 18).fill(NAVY);
    doc.fillColor('#fff').font(BLD).fontSize(9);
    txt('FOR D & T CAREER PLANNERS LLP', 350, y + 4, { width: R - 350 - 6, align: 'right' });
    if (SIGN_BUF) {
      try {
        doc.image(SIGN_BUF, 360, y + 22, { fit: [200, 65] });
      } catch (e) {
        console.warn('[PDF SERVICE] Signature image skipped:', e.message);
      }
    }
    doc.fillColor('#777').font(REG).fontSize(8);
    txt(COMPANY.declaration, L, y + 92);

    // ---- Footer ----
    doc.fillColor('#000').fontSize(8.5);
    txt('D T Career Planners LLP | Commercial Invoice & Registration Receipt', L, 795, { width: W, align: 'center' });
    txt('Page 1 of 1', L, 795, { width: W, align: 'right' });

    doc.end();
  });
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
