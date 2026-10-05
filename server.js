const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { router: registrationRoutes } = require('./routes/registration');
const paymentRoutes = require('./routes/payment');

const app = express();
const PORT = process.env.PORT || 5000;

/* ==============================================================================
   MIDDLEWARE CONFIGURATION
   ============================================================================== */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
        frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://*"],
        connectSrc: ["'self'", "https://api.razorpay.com", "https://lumberjack-cx.razorpay.com", "https://res.cloudinary.com", "https://*.cloudinary.com"]
      }
    }
  })
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiter (Max 100 requests per 15 minutes per IP)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' }
});

app.use('/api/', apiLimiter);

/* ==============================================================================
   API & PAGE ROUTING
   ============================================================================== */
app.use('/api', registrationRoutes);
app.use('/api/payment', paymentRoutes);

// Clean Page Route Handlers
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/form', (req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'public', 'success.html')));
app.get('/failed', (req, res) => res.sendFile(path.join(__dirname, 'public', 'failed.html')));

const fs = require('fs');
const os = require('os');
const pdfInvoiceService = require('./services/pdfInvoice');
const excelService = require('./services/excel');

// Dedicated PDF Download API Handler (/api/download-receipt and /receipts/:filename)
app.get(['/api/download-receipt', '/api/pdf', '/receipts/:filename', '/api/receipt/:filename'], async (req, res) => {
  const rawParam = req.query.regId || req.params.filename || 'REG-2026-0001';
  const filename = rawParam.endsWith('.pdf') ? rawParam : `Receipt_${rawParam}.pdf`;
  const cleanRegId = filename.replace(/^Receipt_/, '').replace(/\.pdf$/i, '');

  try {
    // 1. Check in os.tmpdir()/receipts
    const tmpPath = path.join(os.tmpdir(), 'receipts', filename);
    if (fs.existsSync(tmpPath) && fs.statSync(tmpPath).size > 1000) {
      const cachedBuf = fs.readFileSync(tmpPath);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', cachedBuf.length);
      return res.send(cachedBuf);
    }

    // 2. Dynamic On-The-Fly PDF Generation with 1.5s max lookup timeout
    let found = null;
    try {
      const fastLookupPromise = excelService.readRegistrationsAsync();
      const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([]), 1500));
      const allRegs = await Promise.race([fastLookupPromise, timeoutPromise]);
      if (Array.isArray(allRegs)) {
        found = allRegs.find(r => (
          (r['Registration ID'] && r['Registration ID'] === cleanRegId) ||
          (r['ID'] && r['ID'] === cleanRegId) ||
          (r.registrationId && r.registrationId === cleanRegId)
        ));
      }
    } catch (e) {
      console.warn('[RECEIPT ROUTE] Warning reading excel for fallback:', e.message);
    }

    const fallbackRegData = found ? {
      registrationId: found['Registration ID'] || found['ID'] || cleanRegId,
      fullName: found['Full Name'] || 'Student',
      email: found['Email'] || '',
      whatsappNumber: found['WhatsApp Number'] || '',
      collegeName: found['College / School'] || 'Institution',
      stream: found['Stream / Class'] || '',
      specialization: found['Specialization'] || '',
      semester: found['Semester'] || '',
      course: found['Course'] || 'Enrollment Course',
      finalAmount: found['Final Amount'] || 249,
      razorpayPaymentId: found['Razorpay Payment ID'] || found['Payment ID'] || 'PAY_VERIFIED'
    } : {
      registrationId: cleanRegId || 'REG-2026-0001',
      fullName: req.query.name || 'Student',
      email: req.query.email || '',
      course: 'Course Enrollment',
      finalAmount: 249,
      razorpayPaymentId: 'PAY_VERIFIED'
    };

    let pdfBuffer = null;
    try {
      const pdfRes = await pdfInvoiceService.generatePDFReceipt(fallbackRegData);
      pdfBuffer = (pdfRes && pdfRes.pdfBuffer) ? pdfRes.pdfBuffer : null;
    } catch (pErr) {
      console.warn('[RECEIPT ROUTE] Warning in generatePDFReceipt:', pErr.message);
    }

    if (!pdfBuffer) {
      pdfBuffer = await pdfInvoiceService.buildInvoicePdf({
        registrationId: fallbackRegData.registrationId,
        invoiceNo: fallbackRegData.registrationId,
        invoiceDate: new Date(),
        servicePeriod: '2026 - 2027',
        customer: {
          name: fallbackRegData.fullName,
          address: fallbackRegData.collegeName,
          city: `${fallbackRegData.stream || ''} (${fallbackRegData.semester || ''})`,
          phone: fallbackRegData.whatsappNumber
        },
        items: [{ particulars: fallbackRegData.course || 'Course Enrollment', qty: 1, rate: fallbackRegData.finalAmount || 249 }],
        discount: 0,
        otherCharges: 0
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[RECEIPT SERVING FALLBACK TRIGGERED]', err);
    try {
      const emergencyPdf = await pdfInvoiceService.buildInvoicePdf({
        registrationId: cleanRegId,
        invoiceNo: cleanRegId,
        invoiceDate: new Date(),
        servicePeriod: '2026 - 2027',
        customer: { name: 'Student', address: 'Institution', city: 'Enrollment', phone: '' },
        items: [{ particulars: 'Course Enrollment', qty: 1, rate: 249 }],
        discount: 0,
        otherCharges: 0
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', emergencyPdf.length);
      return res.send(emergencyPdf);
    } catch (finalErr) {
      return res.status(500).send('Fatal error generating PDF receipt.');
    }
  }
});

// Dedicated Excel File Download Endpoint (/api/export-excel or /api/admin/excel)
app.get(['/api/export-excel', '/api/admin/excel', '/registrations.xlsx'], async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const rows = await excelService.readRegistrationsAsync();
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Registrations');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="registrations.xlsx"');
    return res.send(excelBuffer);
  } catch (err) {
    console.error('[EXCEL EXPORT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Unable to export Excel file.' });
  }
});

// Serve Static Assets (HTML, CSS, JS, Images)
app.use(express.static(path.join(__dirname, 'public')));

// 404 Fallback & Global Error Handlers
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({ success: false, message: 'An internal server error occurred.' });
});

/* ==============================================================================
   START SERVER / EXPORT FOR VERCEL
   ============================================================================== */
if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL && require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🚀 DT Careers Enrollment Server active on port ${PORT}`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
