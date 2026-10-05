const express = require('express');
const router = express.Router();
const razorpayService = require('../services/razorpay');
const excelService = require('../services/excel');
const googleSheetService = require('../services/googleSheet');
const pdfInvoiceService = require('../services/pdfInvoice');
const cloudStorageService = require('../services/cloudStorage');
const emailService = require('../services/email');
const { COURSES, PROMO_CODES, calculateDiscount } = require('./registration');
require('dotenv').config();

// Input Validation Helper Functions
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return typeof email === 'string' && emailRegex.test(email.trim());
}

function isValidIndianPhone(phone) {
  if (typeof phone !== 'string') return false;
  const cleanPhone = phone.replace(/[\s\-\+]/g, '');
  // Handles 10 digit Indian numbers or numbers prefixed with 91
  const phoneRegex = /^(?:91)?[6-9]\d{9}$/;
  return phoneRegex.test(cleanPhone);
}

// POST /api/payment/create-order
router.post('/create-order', async (req, res) => {
  try {
    const {
      fullName,
      email,
      whatsappNumber,
      collegeName,
      stream,
      specialization,
      semester,
      courseId,
      promoCode,
      termsAccepted
    } = req.body;

    // Server-Side Input Validation
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Please enter a valid full name.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    if (!isValidIndianPhone(whatsappNumber)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit Indian WhatsApp mobile number.' });
    }

    if (!collegeName || typeof collegeName !== 'string' || collegeName.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Please enter your college or school name.' });
    }

    if (!stream || !specialization || !semester) {
      return res.status(400).json({ success: false, message: 'Please select your stream, specialization, and semester.' });
    }

    if (!termsAccepted) {
      return res.status(400).json({ success: false, message: 'You must accept the Terms & Conditions and Privacy Policy to proceed.' });
    }

    // Determine course & price on the backend
    const selectedCourse = COURSES.find(c => c.id === courseId) || COURSES[0];
    const originalPrice = selectedCourse.price;
    
    // Server-side promo calculation
    let discountAmount = 0;
    let appliedPromo = 'N/A';
    if (promoCode && typeof promoCode === 'string' && promoCode.trim().length > 0) {
      const cleanedCode = promoCode.trim().toUpperCase();
      const promoConfig = PROMO_CODES[cleanedCode];
      if (promoConfig && promoConfig.active) {
        discountAmount = calculateDiscount(originalPrice, promoConfig);
        appliedPromo = cleanedCode;
      }
    }

    const finalAmount = Math.max(1, originalPrice - discountAmount);
    const receiptId = 'rec_' + Date.now().toString().slice(-8);

    // Create Razorpay Order
    const order = await razorpayService.createOrder(finalAmount, receiptId, {
      fullName: fullName.trim(),
      email: email.trim(),
      course: selectedCourse.name
    });

    return res.json({
      success: true,
      keyId: razorpayService.getKeyId(),
      orderId: order.id,
      amount: order.amount, // in paise
      currency: order.currency,
      originalAmount: originalPrice,
      discountAmount: discountAmount,
      finalAmount: finalAmount,
      promoCode: appliedPromo,
      courseName: selectedCourse.name,
      isMock: order.isMock || false
    });

  } catch (error) {
    console.error('[CREATE ORDER ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create payment order. Please try again.'
    });
  }
});

// POST /api/payment/verify
router.post('/verify', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      registrationData
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required Razorpay payment verification details.'
      });
    }

    // 1. HMAC Signature Verification
    const isValidSignature = razorpayService.verifySignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    );

    if (!isValidSignature) {
      console.warn('[PAYMENT VERIFICATION FAILED] Invalid signature for order:', razorpay_order_id);
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed. Invalid security signature.'
      });
    }

    // 2. Prepare payload for Excel persistence
    const regPayload = {
      fullName: registrationData.fullName,
      email: registrationData.email,
      whatsappNumber: registrationData.whatsappNumber,
      collegeName: registrationData.collegeName,
      stream: registrationData.stream,
      specialization: registrationData.specialization,
      semester: registrationData.semester,
      course: registrationData.courseName,
      promoCode: registrationData.promoCode || 'N/A',
      originalAmount: registrationData.originalAmount,
      discountAmount: registrationData.discountAmount,
      finalAmount: registrationData.finalAmount,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentStatus: 'SUCCESS',
      termsAccepted: registrationData.termsAccepted
    };

    // 3. Save to Excel spreadsheet & Google Sheet
    const saveResult = await excelService.saveRegistration(regPayload);

    if (!saveResult.success) {
      console.error('[EXCEL SAVE FAILED]', saveResult.error);
      return res.status(500).json({
        success: false,
        message: 'Payment verified, but error saving registration record. Please contact support.'
      });
    }

    // 4. Generate official PDF Receipt Bill
    const fullPayload = { ...regPayload, registrationId: saveResult.registrationId };
    const pdfResult = await pdfInvoiceService.generatePDFReceipt(fullPayload);

    // 5. Upload PDF to Cloud storage (Cloudinary free tier) if configured, else fall back to local URL
    let finalPdfUrl = pdfResult.url || `/receipts/${pdfResult.filename}`;
    if (pdfResult.success) {
      const source = pdfResult.pdfBuffer || pdfResult.filePath;
      const cloudResult = await cloudStorageService.uploadPDFToCloud(source, pdfResult.filename);
      if (cloudResult && cloudResult.url) {
        finalPdfUrl = cloudResult.url;
      }
    }

    // 6. Asynchronously push to Google Sheet (includes Cloud / Local PDF Download Link)
    googleSheetService.appendToGoogleSheet({
      ...fullPayload,
      pdfUrl: finalPdfUrl
    }).catch(err => console.error('[GOOGLE SHEET SYNC ERROR]', err));

    // 7. Send rich HTML confirmation email to student
    try {
      const emailRes = await emailService.sendEnrollmentConfirmationEmail({
        ...fullPayload,
        pdfUrl: finalPdfUrl,
        pdfBuffer: pdfResult.pdfBuffer,
        filePath: pdfResult.filePath
      });
      console.log('[PAYMENT ROUTE] Email notification status:', emailRes);
    } catch (emailErr) {
      console.error('[PAYMENT ROUTE EMAIL ERROR]', emailErr.message);
    }

    // 8. Return success with Registration ID, PDF URL & target redirect URL
    return res.json({
      success: true,
      message: 'Payment verified and registration recorded successfully.',
      registrationId: saveResult.registrationId,
      pdfUrl: finalPdfUrl,
      redirectUrl: process.env.SUCCESS_REDIRECT_URL || 'https://www.gyanteerthlearning.online/login/'
    });

  } catch (error) {
    console.error('[PAYMENT VERIFY ERROR]', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during payment verification.'
    });
  }
});

module.exports = router;
