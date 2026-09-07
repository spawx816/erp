const { db } = require('../database/db');

async function logAudit({ companyId, userId, ipAddress, module, action, recordId, oldValues, newValues, description }) {
  try {
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
      oldValues ? (typeof oldValues === 'string' ? oldValues : JSON.stringify(oldValues)) : null,
      newValues ? (typeof newValues === 'string' ? newValues : JSON.stringify(newValues)) : null,
      description || null
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

module.exports = {
  logAudit
};
