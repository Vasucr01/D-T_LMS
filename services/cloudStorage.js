const cloudinary = require('cloudinary').v2;
require('dotenv').config();

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'pc6wth1s';
  const apiKey = process.env.CLOUDINARY_API_KEY || '141536733247546';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || 'qS0jNxq9JGFJQokcDeGFVi3kfDM';

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
  });
}

// Initial top-level config
configureCloudinary();

/**
 * Uploads a local PDF receipt or Buffer to Cloudinary Free Cloud Storage
 * @param {string|Buffer} localFilePathOrBuffer - Path to local PDF file or Buffer
 * @param {string} filename - Preferred filename for cloud storage
 * @returns {Promise<{success: boolean, url: string, isCloud: boolean}>}
 */
async function uploadPDFToCloud(localFilePathOrBuffer, filename) {
  configureCloudinary();

  const isConfigured = true; // Fallback credentials guaranteed

  const baseFilename = filename || (typeof localFilePathOrBuffer === 'string' ? localFilePathOrBuffer.split(/[\/\\]/).pop() : 'Receipt.pdf');

  if (!isConfigured) {
    console.log('[CLOUD STORAGE] Cloudinary credentials pending in .env. Serving local server receipt URL.');
    return {
      success: true,
      url: `/receipts/${baseFilename}`,
      isCloud: false
    };
  }

  const publicIdWithExt = baseFilename.endsWith('.pdf') ? baseFilename : `${baseFilename}.pdf`;
  const uploadOptions = {
    resource_type: 'raw',
    folder: 'dt_careers_invoices',
    public_id: publicIdWithExt,
    overwrite: true,
    invalidate: true
  };

  try {
    let target = localFilePathOrBuffer;
    if (Buffer.isBuffer(localFilePathOrBuffer)) {
      target = `data:application/pdf;base64,${localFilePathOrBuffer.toString('base64')}`;
    }
    const result = await cloudinary.uploader.upload(target, uploadOptions);

    const downloadUrl = result.secure_url;

    console.log(`[CLOUD STORAGE] Uploaded PDF to Cloudinary CDN: ${downloadUrl}`);
    return {
      success: true,
      url: downloadUrl,
      publicId: result.public_id,
      isCloud: true
    };
  } catch (err) {
    console.error('[CLOUD STORAGE ERROR] Upload failed:', err.message);
    return {
      success: false,
      url: `/api/download-receipt?filename=${encodeURIComponent(baseFilename)}`,
      error: err.message
    };
  }
}

/**
 * Generates a single ZIP download URL containing ALL uploaded PDF receipts from Cloudinary
 * @returns {string} ZIP download URL
 */
function getBulkReceiptsZipUrl() {
  const isConfigured = Boolean(
    process.env.CLOUDINARY_URL || 
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  );

  if (!isConfigured) return null;

  try {
    return cloudinary.utils.download_zip_url({
      resource_type: 'raw',
      prefix: 'dt_careers_invoices/',
      target_public_id: 'All_DT_Career_Receipts'
    });
  } catch (err) {
    console.error('[CLOUD STORAGE ZIP ERROR]', err.message);
    return null;
  }
}

module.exports = {
  uploadPDFToCloud,
  getBulkReceiptsZipUrl
};
