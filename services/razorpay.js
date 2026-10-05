const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();

const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_id';
const keySecret = process.env.RAZORPAY_KEY_SECRET || 'placeholder_secret_key_12345';

// Check if test keys are placeholders
const isMockMode = keyId.includes('placeholder') || keySecret.includes('placeholder');

let razorpayInstance = null;
if (!isMockMode) {
  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
}

/**
 * Creates a Razorpay order or returns a mock order for testing
 * @param {number} amountInINR - Payable amount in Indian Rupees
 * @param {string} receipt - Receipt identifier / registration preview ID
 * @param {object} notes - Optional metadata notes
 */
async function createOrder(amountInINR, receipt, notes = {}) {
  const amountInPaise = Math.round(amountInINR * 100);

  if (isMockMode || !razorpayInstance) {
    console.log('[RAZORPAY MOCK MODE] Creating simulated order for amount:', amountInINR);
    const mockOrderId = 'order_mock_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    return {
      id: mockOrderId,
      entity: 'order',
      amount: amountInPaise,
      amount_paid: 0,
      amount_due: amountInPaise,
      currency: 'INR',
      receipt: receipt,
      status: 'created',
      attempts: 0,
      notes: notes,
      created_at: Math.floor(Date.now() / 1000),
      isMock: true,
      keyId: keyId
    };
  }

  const options = {
    amount: amountInPaise,
    currency: 'INR',
    receipt: receipt,
    notes: notes
  };

  const order = await razorpayInstance.orders.create(options);
  return {
    ...order,
    isMock: false,
    keyId: keyId
  };
}

/**
 * Verifies the Razorpay payment signature
 * @param {string} orderId 
 * @param {string} paymentId 
 * @param {string} signature 
 */
function verifySignature(orderId, paymentId, signature) {
  if (isMockMode) {
    console.log('[RAZORPAY MOCK MODE] Bypassing HMAC verification for mock order:', orderId);
    return true; // Always valid in mock/demo mode
  }

  if (!orderId || !paymentId || !signature) {
    return false;
  }

  const generatedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  return generatedSignature === signature;
}

module.exports = {
  createOrder,
  verifySignature,
  getKeyId: () => keyId,
  isMockMode: () => isMockMode
};
