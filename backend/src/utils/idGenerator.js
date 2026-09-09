const crypto = require('crypto');

/**
 * Generates a collision-resistant commercial identifier with high entropy.
 * Format: [PREFIX]-[YYYYMMDD]-[HHMMSS]-[HEX6]
 * Example: RC-20260908-143022-A9F3D1
 */
function generateCommercialId(prefix = 'DOC') {
  const now = new Date();
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = String(now.getHours()).padStart(2, '0') +
               String(now.getMinutes()).padStart(2, '0') +
               String(now.getSeconds()).padStart(2, '0');
  const entropy = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${ymd}-${time}-${entropy}`;
}

module.exports = {
  generateCommercialId
};
