const { db } = require('../database/db');

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'new_password',
  'old_password',
  'token',
  'jwt',
  'secret',
  'jwt_secret',
  'credit_card',
  'card_number',
  'cvv',
  'pin',
  'auth_token'
]);

function sanitizeAuditData(data) {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') {
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') {
          return JSON.stringify(sanitizeAuditData(parsed));
        }
      } catch (_) {}
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeAuditData(item));
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret')) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      cleaned[key] = sanitizeAuditData(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

async function logAudit({ companyId, userId, ipAddress, module, action, recordId, oldValues, newValues, description }) {
  try {
    const sanitizedOld = oldValues !== undefined && oldValues !== null ? sanitizeAuditData(oldValues) : null;
    const sanitizedNew = newValues !== undefined && newValues !== null ? sanitizeAuditData(newValues) : null;

    const stmt = await db.prepare(`
      INSERT INTO audit_logs (company_id, user_id, ip_address, module, action, record_id, old_values, new_values, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    await stmt.run(
      companyId || null,
      userId || null,
      ipAddress || '127.0.0.1',
      module,
      action,
      recordId ? String(recordId) : null,
      sanitizedOld ? (typeof sanitizedOld === 'string' ? sanitizedOld : JSON.stringify(sanitizedOld)) : null,
      sanitizedNew ? (typeof sanitizedNew === 'string' ? sanitizedNew : JSON.stringify(sanitizedNew)) : null,
      description || null
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = {
  logAudit,
  sanitizeAuditData
};
