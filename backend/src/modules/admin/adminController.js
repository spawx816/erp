const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { db, runTransaction } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const adminController = {
  // GLOBAL SEARCH
  globalSearch: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { q } = req.query;

      if (!q || q.trim().length < 2) {
        return res.json({ success: true, results: [] });
      }

      const term = `%${q.trim()}%`;

      // 1. Products
      const products = db.prepare(`
        SELECT id, name as title, 'Producto: ' || sku || ' | ' || COALESCE(barcode, '') as subtitle, 'product' as type, '/products' as link
        FROM products
        WHERE company_id = ? AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ? OR internal_code LIKE ?)
        LIMIT 5
      `).all(companyId, term, term, term, term);

      // 2. Customers
      const customers = db.prepare(`
        SELECT id, COALESCE(company_name, first_name || ' ' || COALESCE(last_name, '')) as title, 'Cliente: ' || COALESCE(tax_id, id_card, phone, '') as subtitle, 'customer' as type, '/customers' as link
        FROM customers
        WHERE company_id = ? AND (company_name LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR tax_id LIKE ? OR id_card LIKE ?)
        LIMIT 5
      `).all(companyId, term, term, term, term, term);

      // 3. Sales / Invoices
      const sales = db.prepare(`
        SELECT id, 'Factura ' || sale_number || ' (' || COALESCE(ncf, '') || ')' as title, 'Monto: RD$ ' || total || ' | ' || status as subtitle, 'sale' as type, '/sales' as link
        FROM sales
        WHERE company_id = ? AND (sale_number LIKE ? OR ncf LIKE ? OR invoice_number LIKE ?)
        LIMIT 5
      `).all(companyId, term, term, term);

        // 4. Suppliers
      const suppliers = db.prepare(`
        SELECT id, company_name as title, 'Proveedor: ' || tax_id || ' | ' || COALESCE(contact_person, '') as subtitle, 'supplier' as type, '/suppliers' as link
        FROM suppliers
        WHERE company_id = ? AND (company_name LIKE ? OR trade_name LIKE ? OR tax_id LIKE ?)
        LIMIT 5
      `).all(companyId, term, term, term);

      // 5. Salespeople
      const salespeople = db.prepare(`
        SELECT id, name as title, 'Vendedor: ' || code || ' | ' || COALESCE(zone, '') as subtitle, 'salesperson' as type, '/salespeople' as link
        FROM salespeople
        WHERE company_id = ? AND (name LIKE ? OR code LIKE ? OR phone LIKE ?)
        LIMIT 5
      `).all(companyId, term, term, term);

      const results = [...products, ...customers, ...sales, ...suppliers, ...salespeople];
      return res.json({ success: true, results });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error en búsqueda global.', error: err.message });
    }
  },

  // NOTIFICATIONS
  getNotifications: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const notifs = db.prepare(`
        SELECT * FROM notifications
        WHERE company_id = ?
        ORDER BY is_read ASC, created_at DESC
        LIMIT 25
      `).all(companyId);
      const unreadCount = db.prepare(`SELECT COUNT(*) as count FROM notifications WHERE company_id = ? AND is_read = 0`).get(companyId).count;
      return res.json({ success: true, data: notifs, unread_count: unreadCount });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  markNotificationRead: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND company_id = ?`).run(id, companyId);
      return res.json({ success: true, message: 'Notificación marcada como leída.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // AUTHORIZATIONS
  getAuthorizations: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const list = db.prepare(`
        SELECT da.*,
               uReq.first_name || ' ' || uReq.last_name as requested_by_name,
               uAuth.first_name || ' ' || uAuth.last_name as authorized_by_name,
               c.company_name as customer_name, c.code as customer_code
        FROM discount_authorizations da
        LEFT JOIN users uReq ON da.requested_by_user_id = uReq.id
        LEFT JOIN users uAuth ON da.authorized_by_user_id = uAuth.id
        LEFT JOIN customers c ON da.customer_id = c.id
        WHERE da.company_id = ?
        ORDER BY da.created_at DESC
        LIMIT 30
      `).all(companyId);
      return res.json({ success: true, data: list });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  requestAuthorization: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { customer_id, auth_type, requested_percent, reason, supervisor_username, supervisor_password } = req.body;

      // Verify supervisor credentials
      const supervisor = db.prepare(`
        SELECT u.id, u.password_hash, r.slug as role_slug
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE (u.username = ? OR u.email = ?) AND u.company_id = ? AND u.status = 'active'
      `).get(supervisor_username, supervisor_username, companyId);

      if (!supervisor || !bcrypt.compareSync(supervisor_password, supervisor.password_hash)) {
        return res.status(403).json({ success: false, message: 'Credenciales de supervisor no válidas.' });
      }

      const stmt = db.prepare(`
        INSERT INTO discount_authorizations (
          company_id, customer_id, requested_by_user_id, authorized_by_user_id, auth_type,
          requested_percent, discount_amount, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, 0.00, ?, 'approved')
      `);
      const r = stmt.run(companyId, customer_id || null, req.user.id, supervisor.id, auth_type || 'special_override', requested_percent || 0, reason || 'Autorización de supervisor para facturación');

      logAudit({
        companyId,
        userId: supervisor.id,
        module: 'authorizations',
        action: 'approve',
        recordId: String(r.lastInsertRowid),
        description: `Autorización especial concedida por supervisor (${supervisor_username}) para usuario ${req.user.username}. Motivo: ${reason}`
      });

      return res.json({ success: true, message: 'Autorización concedida con éxito.', authorization_id: r.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  approveAuthorization: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      db.prepare(`UPDATE discount_authorizations SET status = 'approved', authorized_by_user_id = ? WHERE id = ? AND company_id = ?`).run(req.user.id, id, companyId);
      return res.json({ success: true, message: 'Autorización aprobada.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // USERS
  getUsers: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const users = db.prepare(`
        SELECT u.id, u.username, u.first_name, u.last_name, u.email, u.phone, u.id_card,
               u.job_title, u.max_discount_percentage, u.status, u.role_id, u.branch_id,
               r.name as role_name, r.slug as role_slug,
               b.name as branch_name
        FROM users u
        JOIN roles r ON u.role_id = r.id
        LEFT JOIN branches b ON u.branch_id = b.id
        WHERE u.company_id = ?
        ORDER BY u.first_name ASC
      `).all(companyId);

      return res.json({ success: true, data: users });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createUser: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const {
        username, first_name, last_name, email, password, role_id, branch_id,
        phone, id_card, job_title, max_discount_percentage = 5
      } = req.body;

      if (!username || !email || !password || !role_id) {
        return res.status(400).json({ success: false, message: 'Usuario, correo, contraseña y rol son obligatorios.' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
      if (existing) {
        return res.status(400).json({ success: false, message: 'El usuario o correo electrónico ya se encuentra registrado.' });
      }

      const passwordHash = bcrypt.hashSync(password, 10);

      const userId = runTransaction(() => {
        const stmt = db.prepare(`
          INSERT INTO users (
            company_id, branch_id, role_id, username, first_name, last_name,
            email, phone, id_card, password_hash, job_title, max_discount_percentage, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
        `);

        const result = stmt.run(
          companyId, branch_id || null, role_id, username, first_name, last_name,
          email, phone || null, id_card || null, passwordHash, job_title || null, max_discount_percentage
        );
        const uid = result.lastInsertRowid;

        // Assign branch
        if (branch_id) {
          db.prepare('INSERT OR IGNORE INTO user_branches (user_id, branch_id) VALUES (?, ?)').run(uid, branch_id);
        }

        logAudit({
          companyId,
          userId: req.user.id,
          ipAddress: req.ip,
          module: 'users',
          action: 'create_user',
          recordId: uid,
          newValues: { username, email, role_id },
          description: `Creación de usuario ${username} (${first_name} ${last_name})`
        });

        return uid;
      });

      return res.status(201).json({ success: true, message: 'Usuario creado exitosamente.', user_id: userId });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateUser: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const {
        first_name, last_name, email, role_id, branch_id,
        phone, id_card, job_title, max_discount_percentage, status, password
      } = req.body;

      const user = db.prepare('SELECT * FROM users WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });

      runTransaction(() => {
        let passwordHash = user.password_hash;
        if (password && password.trim().length >= 6) {
          passwordHash = bcrypt.hashSync(password, 10);
        }

        db.prepare(`
          UPDATE users SET
            first_name = COALESCE(?, first_name),
            last_name = COALESCE(?, last_name),
            email = COALESCE(?, email),
            role_id = COALESCE(?, role_id),
            branch_id = COALESCE(?, branch_id),
            phone = COALESCE(?, phone),
            id_card = COALESCE(?, id_card),
            job_title = COALESCE(?, job_title),
            max_discount_percentage = COALESCE(?, max_discount_percentage),
            status = COALESCE(?, status),
            password_hash = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND company_id = ?
        `).run(
          first_name, last_name, email, role_id, branch_id,
          phone, id_card, job_title, max_discount_percentage, status,
          passwordHash, id, companyId
        );

        if (branch_id) {
          db.prepare('INSERT OR IGNORE INTO user_branches (user_id, branch_id) VALUES (?, ?)').run(id, branch_id);
        }

        logAudit({
          companyId,
          userId: req.user.id,
          ipAddress: req.ip,
          module: 'users',
          action: 'update_user',
          recordId: id,
          newValues: req.body,
          description: `Actualización del usuario ${user.username}`
        });
      });

      return res.json({ success: true, message: 'Usuario actualizado exitosamente.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // ROLES & PERMISSIONS
  getRoles: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const roles = db.prepare(`
        SELECT r.*,
               (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) as permissions_count
        FROM roles r
        WHERE r.company_id = ? OR r.company_id IS NULL
        ORDER BY r.id ASC
      `).all(companyId);

      const allPermissions = db.prepare('SELECT * FROM permissions ORDER BY module ASC, name ASC').all();

      return res.json({ success: true, roles, all_permissions: allPermissions });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // BRANCHES & WAREHOUSES
  getBranchesAndWarehouses: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const branches = db.prepare('SELECT * FROM branches WHERE company_id = ? ORDER BY is_main DESC, name ASC').all(companyId);
      const warehouses = db.prepare(`
        SELECT w.*, b.name as branch_name
        FROM warehouses w
        JOIN branches b ON w.branch_id = b.id
        WHERE w.company_id = ?
        ORDER BY w.name ASC
      `).all(companyId);

      return res.json({ success: true, branches, warehouses });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createBranch: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { name, code, phone, email, address, city } = req.body;
      if (!name || !code) return res.status(400).json({ success: false, message: 'Nombre y código requeridos.' });

      const stmt = db.prepare(`
        INSERT INTO branches (company_id, name, code, phone, email, address, city, is_main, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'active')
      `);
      const resB = stmt.run(companyId, name, code, phone || null, email || null, address || null, city || null);
      return res.status(201).json({ success: true, message: 'Sucursal creada exitosamente.', branch_id: resB.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createWarehouse: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { branch_id, name, code } = req.body;
      if (!branch_id || !name || !code) return res.status(400).json({ success: false, message: 'Sucursal, nombre y código requeridos.' });

      const stmt = db.prepare(`
        INSERT INTO warehouses (company_id, branch_id, name, code, is_default, status)
        VALUES (?, ?, ?, ?, 0, 'active')
      `);
      const resW = stmt.run(companyId, branch_id, name, code);
      return res.status(201).json({ success: true, message: 'Almacén creado exitosamente.', warehouse_id: resW.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // AUDIT LOGS
  getAuditLogs: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { module, action, start_date, end_date, page = 1, limit = 50 } = req.query;
      const offset = (page - 1) * limit;

      let where = ['al.company_id = ?'];
      let params = [companyId];

      if (module) {
        where.push('al.module = ?');
        params.push(module);
      }
      if (action) {
        where.push('al.action = ?');
        params.push(action);
      }
      if (start_date) {
        where.push('date(al.created_at) >= ?');
        params.push(start_date);
      }
      if (end_date) {
        where.push('date(al.created_at) <= ?');
        params.push(end_date);
      }

      const whereSQL = where.join(' AND ');

      const count = db.prepare(`SELECT COUNT(*) as total FROM audit_logs al WHERE ${whereSQL}`).get(...params).total;

      const logs = db.prepare(`
        SELECT al.*, u.username, u.first_name || ' ' || u.last_name as user_name
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        WHERE ${whereSQL}
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset);

      return res.json({
        success: true,
        data: logs,
        pagination: {
          total: count,
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          pages: Math.ceil(count / limit)
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // BACKUPS
  getBackups: (req, res) => {
    try {
      const backups = db.prepare('SELECT * FROM backups WHERE company_id = ? ORDER BY created_at DESC').all(req.user.company_id);
      return res.json({ success: true, data: backups });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createBackup: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const backupDir = path.resolve(__dirname, '../../../data/backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `sgc_backup_${timestamp}.sqlite`;
      const backupPath = path.resolve(backupDir, filename);

      // Perform sqlite backup safely using better-sqlite3 backup API
      db.backup(backupPath)
        .then(() => {
          const stats = fs.statSync(backupPath);
          const stmt = db.prepare(`
            INSERT INTO backups (company_id, filename, file_path, size_bytes, backup_type, status)
            VALUES (?, ?, ?, ?, 'manual', 'completed')
          `);
          stmt.run(companyId, filename, backupPath, stats.size);

          logAudit({
            companyId,
            userId: req.user.id,
            ipAddress: req.ip,
            module: 'system',
            action: 'backup_created',
            newValues: { filename, size: stats.size },
            description: `Copia de seguridad creada exitosamente: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`
          });

          return res.json({
            success: true,
            message: 'Copia de seguridad generada exitosamente.',
            backup: { filename, size_bytes: stats.size, path: backupPath }
          });
        })
        .catch(err => {
          return res.status(500).json({ success: false, message: 'Error generando backup.', error: err.message });
        });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = adminController;
