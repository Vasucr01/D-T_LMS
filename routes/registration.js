const express = require('express');
const router = express.Router();
require('dotenv').config();

const DEFAULT_PRICE = parseInt(process.env.DEFAULT_COURSE_PRICE || '249', 10);

/* ==============================================================================
   1. COURSE CATALOG CONFIGURATION
   ============================================================================== */
const COURSES = [
  {
    id: "all-in-one-bundle",
    name: "Complete All-In-One Career Package (All 5 Courses Bundle)",
    price: DEFAULT_PRICE,
    duration: "Full Package Access",
    description: "Get complete access to Quantitative Aptitude, Microsoft Excel, Verbal Ability, Soft Skills & MySQL Database in one complete bundle!"
  },
  {
    id: "quantitative-aptitude",
    name: "Quantitative Aptitude",
    price: DEFAULT_PRICE,
    duration: "4 Weeks (Interactive Bootcamp)",
    description: "Master problem solving, mathematical shortcuts, numerical ability, and speed calculations."
  },
  {
    id: "microsoft-excel",
    name: "Microsoft Excel",
    price: DEFAULT_PRICE,
    duration: "4 Weeks (Hands-on Training)",
    description: "Master spreadsheets, VLOOKUP/XLOOKUP, formulas, data visualization, and PivotTables."
  },
  {
    id: "verbal-ability",
    name: "Verbal Ability",
    price: DEFAULT_PRICE,
    duration: "4 Weeks (Core Training)",
    description: "Enhance grammar, reading comprehension, vocabulary, critical reasoning, and communication."
  },
  {
    id: "soft-skills",
    name: "Soft Skills",
    price: DEFAULT_PRICE,
    duration: "4 Weeks (Professional Development)",
    description: "Build workplace confidence, interpersonal communication, presentation skills, and interview readiness."
  },
  {
    id: "mysql",
    name: "MySQL Database",
    price: DEFAULT_PRICE,
    duration: "4 Weeks (Pro Course)",
    description: "Master relational databases, SQL queries, joins, indexes, data modeling, and practical database management."
  }
];

/* ==============================================================================
   2. PROMO CODES CONFIGURATION
   ============================================================================== */
const PROMO_CODES = {
  "D&T1805": {
    type: "percentage", // 'percentage' (% off) or 'flat' (rupees off)
    value: 10,          // 10% discount
    active: true,
    description: "10% Instant Discount"
  },
  "FLAT100": {
    type: "flat",
    value: 100,         // ₹100 flat discount
    active: true,
    description: "₹100 Flat Discount"
  },
  "TESTVASU9879319768": {
    type: "percentage",
    value: 100,        // 100% discount (Free Access)
    active: true,
    description: "100% Free Special Access Discount"
  }
};

/* ==============================================================================
   3. DISCOUNT CALCULATOR HELPER
   ============================================================================== */
function calculateDiscount(originalPrice, promoConfig) {
  if (!promoConfig || !promoConfig.active) return 0;
  if (promoConfig.type === 'flat') {
    return Math.min(promoConfig.value, originalPrice);
  } else if (promoConfig.type === 'percentage') {
    return Math.round((originalPrice * promoConfig.value) / 100);
  }
  return 0;
}

/* ==============================================================================
   4. API ROUTES
   ============================================================================== */

// GET /api/courses
router.get('/courses', (req, res) => {
  res.json({ success: true, courses: COURSES });
});

// POST /api/validate-promo
router.post('/validate-promo', (req, res) => {
  try {
    const { promoCode, courseId } = req.body;

    const course = COURSES.find(c => c.id === courseId) || COURSES[0];
    const originalPrice = course ? course.price : DEFAULT_PRICE;

    if (!promoCode || typeof promoCode !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid promo code.'
      });
    }

    const cleanedCode = promoCode.trim().toUpperCase();
    const promo = PROMO_CODES[cleanedCode];

    if (!promo || !promo.active) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired promo code.'
      });
    }

    const discountAmount = calculateDiscount(originalPrice, promo);
    const finalAmount = Math.max(0, originalPrice - discountAmount);

    return res.json({
      success: true,
      message: `Promo code '${cleanedCode}' applied successfully! (${promo.description})`,
      promoCode: cleanedCode,
      originalAmount: originalPrice,
      discountAmount: discountAmount,
      finalAmount: finalAmount
    });
  } catch (err) {
    console.error('[PROMO VALIDATION ERROR]', err);
    return res.status(500).json({
      success: false,
      message: 'Server error while validating promo code.'
    });
  }
});

// POST /api/student-login - Student Portal Login / Lookup
const excelService = require('../services/excel');
router.post('/student-login', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid Email Address or Registration ID.'
      });
    }

    const queryStr = identifier.trim().toLowerCase();
    let found = null;
    
    // 1. Try MongoDB lookup first
    try {
      const dbService = require('../services/db');
      const foundDoc = await dbService.findRegistrationInMongo(queryStr);
      if (foundDoc) {
        found = {
          'Registration ID': foundDoc.registrationId,
          'Full Name': foundDoc.fullName,
          'Email': foundDoc.email,
          'WhatsApp Number': foundDoc.whatsappNumber,
          'College / School': foundDoc.collegeName,
          'Stream / Class': foundDoc.stream,
          'Course': foundDoc.course,
          'Payment Status': foundDoc.paymentStatus,
          'Payment Date': foundDoc.createdAt ? foundDoc.createdAt.toISOString() : '',
          'PDF URL': foundDoc.pdfUrl
        };
      }
    } catch (dbErr) {
      console.warn('[STUDENT LOGIN] Mongo lookup warning:', dbErr.message);
    }

    // 2. Fallback to Excel & Google Sheet merged records if not found in Mongo
    if (!found) {
      try {
        const allRegistrations = await excelService.readRegistrationsAsync();
        found = allRegistrations.find(r => {
          const regId = String(r['Registration ID'] || r['ID'] || r.registrationId || '').toLowerCase();
          const email = String(r['Email'] || r.email || '').toLowerCase();
          const phone = String(r['WhatsApp Number'] || r.whatsappNumber || r.phone || '').replace(/[\s\-\+]/g, '');
          const cleanQuery = queryStr.replace(/[\s\-\+]/g, '');
          
          return (
            (regId && regId === queryStr) || 
            (email && email === queryStr) || 
            (cleanQuery.length >= 7 && phone.includes(cleanQuery))
          );
        });
      } catch (excelErr) {
        console.warn('[STUDENT LOGIN] Excel/GoogleSheet lookup warning:', excelErr.message);
      }
    }

    if (!found) {
      return res.status(404).json({
        success: false,
        message: 'No enrollment record found for this Email or Registration ID. Please check your details or complete registration first.'
      });
    }

    const rawRegId = String(found['Registration ID'] || found['ID'] || found.registrationId || '').trim();
    const fallbackId = (found['Razorpay Payment ID'] || found['Payment ID']) ? `REG-${String(found['Razorpay Payment ID'] || found['Payment ID']).slice(-4)}` : 'REG-2026-0001';
    const regId = rawRegId ? rawRegId : fallbackId;
    
    const pdfUrl = (found['PDF URL'] && String(found['PDF URL']).startsWith('http')) ? found['PDF URL'] : `/api/download-receipt?regId=${encodeURIComponent(regId)}`;
    const redirectUrl = process.env.SUCCESS_REDIRECT_URL || 'https://www.gyanteerthlearning.online/login/';

    return res.json({
      success: true,
      message: 'Student login successful!',
      student: {
        registrationId: regId,
        fullName: found['Full Name'] || found.fullName || 'Student',
        email: found['Email'] || found.email || '',
        whatsappNumber: found['WhatsApp Number'] || found.whatsappNumber || '',
        collegeName: found['College / School'] || found.collegeName || 'N/A',
        stream: found['Stream / Class'] || found.stream || '',
        course: found['Course'] || found.course || 'Complete All-In-One Career Package',
        paymentStatus: found['Payment Status'] || found.paymentStatus || 'SUCCESS',
        paymentDate: found['Payment Date'] || found.timestamp || '',
        pdfUrl: pdfUrl
      },
      redirectUrl: redirectUrl
    });
  } catch (err) {
    console.error('[STUDENT LOGIN ERROR]', err);
    return res.status(500).json({
      success: false,
      message: 'Server error while performing student login lookup.'
    });
  }
});

module.exports = {
  router,
  COURSES,
  PROMO_CODES,
  calculateDiscount
};

