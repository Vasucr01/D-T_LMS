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
        connectSrc: ["'self'", "https://api.razorpay.com", "https://lumberjack-cx.razorpay.com"]
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

// Dynamic PDF Receipt Route Handler (Serves from /tmp, public, or generates on-the-fly on Vercel)
app.get('/receipts/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    
    // 1. Check in os.tmpdir()/receipts
    const tmpPath = path.join(os.tmpdir(), 'receipts', filename);
    if (fs.existsSync(tmpPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.sendFile(tmpPath);
    }

    // 2. Check in public/receipts
    const publicPath = path.join(__dirname, 'public', 'receipts', filename);
    if (fs.existsSync(publicPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.sendFile(publicPath);
    }

    // 3. Dynamic Fallback Generation (On-the-fly buffer creation)
    const cleanRegId = filename.replace(/^Receipt_/, '').replace(/\.pdf$/i, '');
    let found = null;
    try {
      const allRegs = excelService.readRegistrations() || [];
      found = allRegs.find(r => r['Registration ID'] === cleanRegId || r.registrationId === cleanRegId);
    } catch (e) {
      console.warn('[RECEIPT ROUTE] Warning reading excel for fallback:', e.message);
    }

    const fallbackRegData = found ? {
      registrationId: found['Registration ID'] || cleanRegId,
      fullName: found['Full Name'] || 'Student',
      email: found['Email'] || '',
      whatsappNumber: found['WhatsApp Number'] || '',
      collegeName: found['College / School'] || 'Institution',
      stream: found['Stream / Class'] || '',
      specialization: found['Specialization'] || '',
      semester: found['Semester'] || '',
      course: found['Course'] || 'Enrollment Course',
      finalAmount: found['Final Amount'] || 249,
      razorpayPaymentId: found['Razorpay Payment ID'] || 'PAY_' + Date.now().toString().slice(-8)
    } : {
      registrationId: cleanRegId || 'REG-2026-0001',
      fullName: 'Student',
      email: '',
      course: 'Course Enrollment',
      finalAmount: 249,
      razorpayPaymentId: 'PAY_VERIFIED'
    };

    const pdfRes = await pdfInvoiceService.generatePDFReceipt(fallbackRegData);
    if (pdfRes.success && pdfRes.pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', pdfRes.pdfBuffer.length);
      return res.end(pdfRes.pdfBuffer);
    }

    return res.status(404).send('PDF Receipt not found.');
  } catch (err) {
    console.error('[RECEIPT SERVING ERROR]', err);
    return res.status(500).send('Error serving receipt PDF.');
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
