const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  registrationId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  whatsappNumber: {
    type: String,
    required: true,
    trim: true
  },
  collegeName: {
    type: String,
    required: true,
    trim: true
  },
  stream: {
    type: String,
    required: true
  },
  specialization: {
    type: String,
    required: true
  },
  semester: {
    type: String,
    required: true
  },
  course: {
    type: String,
    required: true
  },
  promoCode: {
    type: String,
    default: 'N/A'
  },
  originalAmount: {
    type: Number,
    default: 249
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  finalAmount: {
    type: Number,
    default: 249
  },
  razorpayOrderId: {
    type: String,
    default: ''
  },
  razorpayPaymentId: {
    type: String,
    default: ''
  },
  paymentStatus: {
    type: String,
    default: 'SUCCESS'
  },
  pdfUrl: {
    type: String,
    default: ''
  },
  termsAccepted: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.models.Registration || mongoose.model('Registration', registrationSchema);
