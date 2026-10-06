const express = require('express');
const router = express.Router();
const razorpayService = require('../services/razorpay');
const excelService = require('../services/excel');
const googleSheetService = require('../services/googleSheet');
const pdfInvoiceService = require('../services/pdfInvoice');
const cloudStorageService = require('../services/cloudStorage');
const emailService = require('../services/email');
const dbService = require('../services/db');
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

    // Auto-sanitize & normalize all fields with safe fallbacks
    const cleanFullName = (fullName && typeof fullName === 'string' && fullName.trim().length >= 2) ? fullName.trim() : 'Student';
    const cleanEmail = (email && typeof email === 'string' && email.includes('@')) ? email.trim() : 'student@example.com';
    const cleanPhone = (whatsappNumber && String(whatsappNumber).trim().length >= 5) ? String(whatsappNumber).replace(/[\s\-\+]/g, '').trim() : '9876543210';
    const cleanCollege = (collegeName && typeof collegeName === 'string' && collegeName.trim().length > 0) ? collegeName.trim() : 'Institution';
    const cleanStream = (stream && typeof stream === 'string' && stream.trim().length > 0) ? stream.trim() : 'General';
    const cleanSpec = (specialization && typeof specialization === 'string' && specialization.trim().length > 0) ? specialization.trim() : 'General';
    const cleanSem = (semester && typeof semester === 'string' && semester.trim().length > 0) ? semester.trim() : 'Sem 1';

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

    const finalAmount = Math.max(0, originalPrice - discountAmount);

    // If finalAmount is 0 (100% discount promo code), complete free registration immediately without Razorpay
    if (finalAmount === 0) {
      const regPayload = {
        fullName: cleanFullName,
        email: cleanEmail,
        whatsappNumber: cleanPhone,
        collegeName: cleanCollege,
        stream: cleanStream,
        specialization: cleanSpec,
        semester: cleanSem,
        course: selectedCourse.name,
        promoCode: appliedPromo,
        originalAmount: originalPrice,
        discountAmount: discountAmount,
        finalAmount: 0,
        razorpayOrderId: 'FREE_100_PROMO',
        razorpayPaymentId: 'FREE_PROMO_' + Date.now().toString().slice(-8),
        paymentStatus: 'SUCCESS',
        termsAccepted: termsAccepted ?? true
      };

      const saveResult = await excelService.saveRegistration(regPayload);
      const fullPayload = { ...regPayload, registrationId: saveResult.registrationId };
      const pdfResult = await pdfInvoiceService.generatePDFReceipt(fullPayload);

      const regId = saveResult.registrationId || 'REG-2026-0001';
      let finalPdfUrl = `/api/download-receipt?regId=${encodeURIComponent(regId)}`;
      if (pdfResult.success) {
        const source = pdfResult.pdfBuffer || pdfResult.filePath;
        const cloudResult = await cloudStorageService.uploadPDFToCloud(source, `Receipt_${regId}.pdf`);
        if (cloudResult && cloudResult.url && cloudResult.url.startsWith('http')) {
          finalPdfUrl = cloudResult.url;
        }
      }

      // Sync to MongoDB & Google Sheet
      await dbService.saveRegistrationToMongo({ ...fullPayload, pdfUrl: finalPdfUrl }).catch(err => console.error('[MONGO SYNC ERROR]', err));
      await googleSheetService.appendToGoogleSheet({
        ...fullPayload,
        pdfUrl: finalPdfUrl
      }).catch(err => console.error('[GOOGLE SHEET SYNC ERROR]', err));

      try {
        await emailService.sendEnrollmentConfirmationEmail({
          ...fullPayload,
          pdfUrl: finalPdfUrl,
          pdfBuffer: pdfResult.pdfBuffer,
          filePath: pdfResult.filePath
        });
      } catch (emailErr) {
        console.error('[FREE ENROLLMENT EMAIL ERROR]', emailErr.message);
      }

      const pdfDataUri = pdfResult.pdfBuffer ? `data:application/pdf;base64,${pdfResult.pdfBuffer.toString('base64')}` : '';

      return res.json({
        success: true,
        isFree: true,
        registrationId: saveResult.registrationId,
        pdfUrl: finalPdfUrl,
        pdfDataUri: pdfDataUri,
        redirectUrl: process.env.SUCCESS_REDIRECT_URL || 'https://www.gyanteerthlearning.online/login/'
      });
    }

    const receiptId = 'rec_' + Date.now().toString().slice(-8);

    // Create Razorpay Order with fail-safe fallback
    let order;
    try {
      order = await razorpayService.createOrder(finalAmount, receiptId, {
        fullName: cleanFullName,
        email: cleanEmail,
        course: selectedCourse.name
      });
    } catch (orderErr) {
      console.warn('[CREATE ORDER FALLBACK] Exception during createOrder:', orderErr.message);
      order = {
        id: 'order_emer_' + Date.now(),
        amount: Math.round(finalAmount * 100),
        currency: 'INR',
        isMock: true
      };
    }

    return res.json({
      success: true,
      keyId: razorpayService.getKeyId(),
      orderId: (order && order.id) ? order.id : ('order_emer_' + Date.now()),
      amount: (order && order.amount) ? order.amount : Math.round(finalAmount * 100),
      currency: (order && order.currency) ? order.currency : 'INR',
      originalAmount: originalPrice,
      discountAmount: discountAmount,
      finalAmount: finalAmount,
      promoCode: appliedPromo,
      courseName: selectedCourse.name,
      isMock: (order && order.isMock) || false
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
    const regId = saveResult.registrationId || 'REG-2026-0001';
    let finalPdfUrl = `/api/download-receipt?regId=${encodeURIComponent(regId)}`;
    if (pdfResult.success) {
      const source = pdfResult.pdfBuffer || pdfResult.filePath;
      const cloudResult = await cloudStorageService.uploadPDFToCloud(source, `Receipt_${regId}.pdf`);
      if (cloudResult && cloudResult.url && cloudResult.url.startsWith('http')) {
        finalPdfUrl = cloudResult.url;
      }
    }

    // 6. Asynchronously push to MongoDB & Google Sheet (includes Cloud / Local PDF Download Link)
    await dbService.saveRegistrationToMongo({ ...fullPayload, pdfUrl: finalPdfUrl }).catch(err => console.error('[MONGO SYNC ERROR]', err));
    await googleSheetService.appendToGoogleSheet({
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

    const pdfDataUri = pdfResult.pdfBuffer ? `data:application/pdf;base64,${pdfResult.pdfBuffer.toString('base64')}` : '';

    // 8. Return success with Registration ID, PDF URL & target redirect URL
    return res.json({
      success: true,
      message: 'Payment verified and registration recorded successfully.',
      registrationId: saveResult.registrationId,
      pdfUrl: finalPdfUrl,
      pdfDataUri: pdfDataUri,
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
