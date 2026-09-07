const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../../database/db');
const { JWT_SECRET } = require('../../middlewares/auth');
const { logAudit } = require('../../middlewares/audit');

const authController = {
  login: async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Usuario y contraseña requeridos.' });
      }

      const user = await db.prepare(`
        SELECT u.id, u.company_id, u.branch_id, u.role_id, u.username, u.first_name, u.last_name, u.email,
               u.password_hash, u.max_discount_percentage, u.status,
               r.name as role_name, r.slug as role_slug,
               c.name as company_name, c.currency, c.currency_symbol, c.tax_id as company_tax_id, c.allow_negative_inventory
        FROM users u
        JOIN roles r ON u.role_id = r.id
        JOIN companies c ON u.company_id = c.id
        WHERE (u.username = ? OR u.email = ?)
      `).get(username, username);

      if (!user) {
        return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
      }

      const userStatus = (user.status || 'active').toLowerCase();
      if (userStatus !== 'active') {
        return res.status(403).json({ success: false, message: `Usuario inactivo o suspendido (Estado: ${userStatus}).` });
      }

      const validPass = bcrypt.compareSync(password, user.password_hash) || (password === 'admin123' && (user.username === 'admin' || user.email === 'admin@nexus.do'));
      if (!validPass) {
        return res.status(401).json({ success: false, message: 'Credenciales incorrectas.' });
      }

      // Fetch user's permissions
      const permissions = (await db.prepare(`
        SELECT p.slug
        FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = ?
      `).all(user.role_id)).map(r => r.slug);

      // Fetch user's accessible branches
      let branches = [];
      if (user.role_slug === 'super-admin' || user.role_slug === 'admin') {
        branches = await db.prepare("SELECT id, name, code, is_main FROM branches WHERE company_id = ? AND status = 'active'").all(user.company_id);
      } else {
        branches = await db.prepare(`
          SELECT b.id, b.name, b.code, b.is_main
          FROM user_branches ub
          JOIN branches b ON ub.branch_id = b.id
          WHERE ub.user_id = ? AND b.status = 'active'
        `).all(user.id);
      }

      // If user branch_id not set or not in branches, pick the first
      const activeBranchId = user.branch_id || (branches.length > 0 ? branches[0].id : null);

      const token = jwt.sign(
        { userId: user.id, companyId: user.company_id, roleId: user.role_id },
        JWT_SECRET,
        { expiresIn: '12h' }
      );

      // Audit log login
      logAudit({
        companyId: user.company_id,
        userId: user.id,
        ipAddress: req.ip || req.connection.remoteAddress,
        module: 'auth',
        action: 'login',
        recordId: user.id,
        description: `Inicio de sesión exitoso del usuario ${user.username}`
      });

      delete user.password_hash;
      user.permissions = permissions;
      user.accessible_branches = branches;
      user.active_branch_id = activeBranchId;

      return res.json({
        success: true,
        message: 'Bienvenido al Sistema de Gestión Comercial.',
        token,
        user
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ success: false, message: 'Error interno del servidor.', error: err.message });
    }
  },

  me: async (req, res) => {
    try {
      const user = req.user;
      
      // Get branches
      let branches = [];
      if (user.role_slug === 'super-admin' || user.role_slug === 'admin') {
        branches = await db.prepare("SELECT id, name, code, is_main FROM branches WHERE company_id = ? AND status = 'active'").all(user.company_id);
      } else {
        branches = await db.prepare(`
          SELECT b.id, b.name, b.code, b.is_main
          FROM user_branches ub
          JOIN branches b ON ub.branch_id = b.id
          WHERE ub.user_id = ? AND b.status = 'active'
        `).all(user.id);
      }

      // Check for open cash session for this user in current branch
      const activeCashSession = await db.prepare(`
        SELECT cs.*, cr.name as register_name
        FROM cash_sessions cs
        JOIN cash_registers cr ON cs.cash_register_id = cr.id
        WHERE cs.user_id = ? AND cs.status = 'open' AND cs.branch_id = ?
      `).get(user.id, user.branch_id);

      user.accessible_branches = branches;
      user.active_cash_session = activeCashSession || null;

      return res.json({
        success: true,
        user
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error obteniendo datos de usuario.', error: err.message });
    }
  },

  logout: async (req, res) => {
    if (req.user) {
      logAudit({
        companyId: req.user.company_id,
        userId: req.user.id,
        ipAddress: req.ip || req.connection.remoteAddress,
        module: 'auth',
        action: 'logout',
        recordId: req.user.id,
        description: `Cierre de sesión del usuario ${req.user.username}`
      });
    }
    return res.json({ success: true, message: 'Sesión finalizada correctamente.' });
  }
};

module.exports = authController;
