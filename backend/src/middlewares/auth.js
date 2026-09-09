const jwt = require('jsonwebtoken');
const { db } = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable must be set in production.');
  }
  return 'sgc_super_secret_enterprise_jwt_key_2026';
})();

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Acceso no autorizado. Token no proporcionado.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify user still exists and is active
    const user = await db.prepare(`
      SELECT u.id, u.company_id, u.branch_id, u.role_id, u.username, u.first_name, u.last_name, u.email, u.max_discount_percentage, u.status, u.token_version,
             r.name as role_name, r.slug as role_slug,
             c.name as company_name, c.currency, c.currency_symbol, c.allow_negative_inventory
      FROM users u
      JOIN roles r ON u.role_id = r.id
      JOIN companies c ON u.company_id = c.id
      WHERE u.id = ? AND u.status = 'active'
    `).get(decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Sesión inválida o usuario inactivo.' });
    }

    // Check token version to enforce revocation on logout or password change
    const userTokenVer = user.token_version !== undefined && user.token_version !== null ? Number(user.token_version) : 1;
    const decodedTokenVer = decoded.tokenVersion !== undefined && decoded.tokenVersion !== null ? Number(decoded.tokenVersion) : 1;

    if (decodedTokenVer !== userTokenVer) {
      return res.status(401).json({ success: false, message: 'La sesión ha expirado o fue revocada. Inicie sesión nuevamente.' });
    }

    // Load user permissions
    const permissions = (await db.prepare(`
      SELECT p.slug
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.id
      WHERE rp.role_id = ?
    `).all(user.role_id)).map(row => row.slug);

    user.permissions = permissions;
    
    // If client supplied custom branch header, verify authorization
    const customBranchHeader = req.headers['x-branch-id'];
    const customBranchId = parseInt(customBranchHeader, 10);
    if (!isNaN(customBranchId) && customBranchId > 0) {
      const branchAuth = await db.prepare(`
        SELECT branch_id FROM user_branches WHERE user_id = ? AND branch_id = ?
      `).get(user.id, customBranchId);
      if (branchAuth || user.role_slug === 'super-admin' || user.role_slug === 'admin') {
        user.branch_id = customBranchId;
      }
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token inválido o sesión expirada.' });
  }
}

module.exports = {
  authenticateToken,
  JWT_SECRET
};
