const cloudinary = require('cloudinary').v2;
require('dotenv').config();

function configureCloudinary() {
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

  const isConfigured = Boolean(
    process.env.CLOUDINARY_URL || 
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  );

  const baseFilename = filename || (typeof localFilePathOrBuffer === 'string' ? localFilePathOrBuffer.split(/[\/\\]/).pop() : 'Receipt.pdf');

  if (!isConfigured) {
    console.log('[CLOUD STORAGE] Cloudinary credentials pending in .env. Serving local server receipt URL.');
    return {
      success: true,
      url: `/receipts/${baseFilename}`,
      isCloud: false
    };
  }

  const uploadOptions = {
    resource_type: 'raw',
    folder: 'dt_careers_invoices',
    public_id: baseFilename.endsWith('.pdf') ? baseFilename : `${baseFilename}.pdf`,
    use_filename: true,
    unique_filename: false,
    overwrite: true,
    access_mode: 'public'
  };

  try {
    let result;
    if (Buffer.isBuffer(localFilePathOrBuffer)) {
      result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, res) => {
            if (error) return reject(error);
            resolve(res);
          }
        );
        stream.end(localFilePathOrBuffer);
      });
    } else {
      result = await cloudinary.uploader.upload(localFilePathOrBuffer, uploadOptions);
    }

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
