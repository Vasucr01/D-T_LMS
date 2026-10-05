const cloudinary = require('cloudinary').v2;
require('dotenv').config();

// Configure Cloudinary credentials if available
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
  });
} else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

/**
 * Uploads a local PDF receipt to Cloudinary Free Cloud Storage
 * @param {string} localFilePath - Path to local PDF file
 * @param {string} filename - Preferred filename for cloud storage
 * @returns {Promise<{success: boolean, url: string, isCloud: boolean}>}
 */
async function uploadPDFToCloud(localFilePath, filename) {
  const isConfigured = Boolean(
    process.env.CLOUDINARY_URL || 
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  );

  const baseFilename = filename || localFilePath.split(/[\/\\]/).pop();

  if (!isConfigured) {
    console.log('[CLOUD STORAGE] Cloudinary credentials pending in .env. Serving local server receipt URL.');
    return {
      success: true,
      url: `/receipts/${baseFilename}`,
      isCloud: false
    };
  }

  try {
    const result = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'raw',
      folder: 'dt_careers_invoices',
      public_id: baseFilename.endsWith('.pdf') ? baseFilename : `${baseFilename}.pdf`,
      use_filename: true,
      unique_filename: false,
      overwrite: true
    });

    console.log(`[CLOUD STORAGE] Uploaded PDF to Cloudinary CDN: ${result.secure_url}`);
    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      isCloud: true
    };
  } catch (err) {
    console.error('[CLOUD STORAGE ERROR] Upload failed:', err.message);
    return {
      success: false,
      url: `/receipts/${baseFilename}`,
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
