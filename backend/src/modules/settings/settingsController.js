const { db } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const settingsController = {
  getCompanySettings: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
      const settings = db.prepare('SELECT key, value FROM settings WHERE company_id = ?').all(companyId);

      const settingsMap = {};
      settings.forEach(s => { settingsMap[s.key] = s.value; });

      return res.json({ success: true, company, settings: settingsMap });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateCompanySettings: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const {
        name, legal_name, tax_id, phone, email, address, city,
        currency, currency_symbol, allow_negative_inventory,
        receipt_footer, print_format, smtp_host, smtp_port, smtp_user
      } = req.body;

      db.prepare(`
        UPDATE companies SET
          name = COALESCE(?, name),
          legal_name = COALESCE(?, legal_name),
          tax_id = COALESCE(?, tax_id),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          address = COALESCE(?, address),
          city = COALESCE(?, city),
          currency = COALESCE(?, currency),
          currency_symbol = COALESCE(?, currency_symbol),
          allow_negative_inventory = COALESCE(?, allow_negative_inventory),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name, legal_name, tax_id, phone, email, address, city,
        currency, currency_symbol,
        allow_negative_inventory !== undefined ? (allow_negative_inventory ? 1 : 0) : null,
        companyId
      );

      // Save custom settings
      const customKeys = { receipt_footer, print_format, smtp_host, smtp_port, smtp_user };
      const stmtSet = db.prepare(`
        INSERT INTO settings (company_id, key, value, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(company_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
      `);

      Object.entries(customKeys).forEach(([k, v]) => {
        if (v !== undefined && v !== null) {
          stmtSet.run(companyId, k, String(v));
        }
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'settings',
        action: 'update_settings',
        description: 'Actualización de configuración general de empresa'
      });

      return res.json({ success: true, message: 'Configuración actualizada correctamente.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = settingsController;
