const crypto = require('crypto');

// Polyfill webcrypto and subtle for Node.js 16/18 compatibility with Mongoose / MongoDB driver
if (crypto.webcrypto) {
  try {
    Object.defineProperty(globalThis, 'crypto', {
      value: crypto.webcrypto,
      writable: true,
      configurable: true
    });
  } catch (e) {
    if (!globalThis.crypto) globalThis.crypto = crypto.webcrypto;
  }
}

const mongoose = require('mongoose');
require('dotenv').config();

let isConnected = false;

/**
 * Connects to MongoDB Atlas / Local MongoDB
 */
async function connectDB() {
  const mongoURI = process.env.MONGODB_URI;

  if (!mongoURI) {
    console.warn('[MONGODB] MONGODB_URI is not defined in .env. Operating in dual Excel/Google Sheet fallback mode.');
    return false;
  }

  if (isConnected && mongoose.connection.readyState === 1) {
    return true;
  }

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`[MONGODB CONNECTED] Host: ${conn.connection.host} | DB: ${conn.connection.name}`);
    return true;
  } catch (err) {
    console.error('[MONGODB ERROR] Connection failed:', err.message);
    isConnected = false;
    return false;
  }
}

function getIsConnected() {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Saves or updates registration in MongoDB
 */
async function saveRegistrationToMongo(regData) {
  if (!getIsConnected()) return null;
  try {
    const Registration = require('../models/Registration');
    const existing = await Registration.findOne({
      $or: [
        { registrationId: regData.registrationId },
        { razorpayPaymentId: regData.razorpayPaymentId && regData.razorpayPaymentId !== 'N/A' ? regData.razorpayPaymentId : null }
      ].filter(cond => Object.values(cond)[0])
    });

    if (existing) {
      Object.assign(existing, regData);
      await existing.save();
      console.log('[MONGODB] Registration updated:', existing.registrationId);
      return existing;
    } else {
      const newReg = new Registration(regData);
      await newReg.save();
      console.log('[MONGODB] New registration saved:', newReg.registrationId);
      return newReg;
    }
  } catch (err) {
    console.error('[MONGODB SAVE ERROR]', err.message);
    return null;
  }
}

/**
 * Finds student registration in MongoDB by RegID, Email, or WhatsApp Phone
 */
async function findRegistrationInMongo(identifierStr) {
  if (!getIsConnected()) return null;
  try {
    const Registration = require('../models/Registration');
    const query = identifierStr.trim().toLowerCase();
    const cleanPhone = query.replace(/[\s\-\+]/g, '');

    const found = await Registration.findOne({
      $or: [
        { registrationId: new RegExp(`^${query}$`, 'i') },
        { email: new RegExp(`^${query}$`, 'i') },
        { whatsappNumber: cleanPhone }
      ]
    });
    return found;
  } catch (err) {
    console.error('[MONGODB FIND ERROR]', err.message);
    return null;
  }
}

module.exports = {
  connectDB,
  getIsConnected,
  saveRegistrationToMongo,
  findRegistrationInMongo
};

