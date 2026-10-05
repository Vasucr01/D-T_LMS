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

module.exports = {
  router,
  COURSES,
  PROMO_CODES,
  calculateDiscount
};
