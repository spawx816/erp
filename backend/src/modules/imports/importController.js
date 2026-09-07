const { db, runTransaction } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const importController = {
  previewAndValidate: async (req, res) => {
    try {
      const { entity_type, rows = [] } = req.body;
      if (!entity_type || !rows || rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Tipo de entidad y filas de datos son obligatorios.' });
      }

      const validRows = [];
      const errorRows = [];

      rows.forEach((row, index) => {
        const errors = [];
        if (entity_type === 'products') {
          if (!row.name) errors.push('El nombre es requerido');
          if (!row.sku) errors.push('El SKU es requerido');
          if (row.price === undefined || isNaN(row.price)) errors.push('Precio inválido');
        } else if (entity_type === 'customers') {
          if (!row.company_name && !row.first_name) errors.push('Debe especificar nombre o razón social');
          if (!row.phone && !row.email) errors.push('Debe tener al menos teléfono o correo');
        } else if (entity_type === 'suppliers') {
          if (!row.company_name) errors.push('Razón social requerida');
          if (!row.tax_id) errors.push('RNC o identificación requerida');
        }

        if (errors.length > 0) {
          errorRows.push({ row_index: index + 1, data: row, errors });
        } else {
          validRows.push(row);
        }
      });

      return res.json({
        success: true,
        summary: {
          total: rows.length,
          valid_count: validRows.length,
          error_count: errorRows.length
        },
        valid_rows: validRows.slice(0, 25), // preview first 25
        error_rows: errorRows
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  executeImport: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { entity_type, rows = [] } = req.body;

      if (!entity_type || rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Datos insuficientes para importar.' });
      }

      const summary = await runTransaction(async () => {
        let successCount = 0;
        let failCount = 0;
        const details = [];

        if (entity_type === 'products') {
          const stmt = await db.prepare(`
            INSERT OR IGNORE INTO products (
              company_id, name, sku, barcode, cost, price, stock_min, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `);
          for (const r of rows) {
            try {
              await stmt.run(companyId, r.name, r.sku, r.barcode || null, Number(r.cost || 0), Number(r.price || 0), Number(r.stock_min || 5));
              successCount++;
            } catch (e) {
              failCount++;
              details.push({ sku: r.sku, error: e.message });
            }
          }
        } else if (entity_type === 'customers') {
          const stmt = await db.prepare(`
            INSERT OR IGNORE INTO customers (
              company_id, person_type, first_name, last_name, company_name, tax_id, id_card, phone, email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
          `);
          for (const r of rows) {
            try {
              await stmt.run(
                companyId, r.person_type || 'natural', r.first_name || null, r.last_name || null,
                r.company_name || null, r.tax_id || null, r.id_card || null, r.phone || null, r.email || null
              );
              successCount++;
            } catch (e) {
              failCount++;
              details.push({ name: r.company_name || r.first_name, error: e.message });
            }
          }
        }

        // Log import
        await db.prepare(`
          INSERT INTO import_logs (company_id, user_id, entity_type, total_rows, success_rows, error_rows, error_details)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, req.user.id, entity_type, rows.length, successCount, failCount, JSON.stringify(details));

        logAudit({
          companyId,
          userId: req.user.id,
          ipAddress: req.ip,
          module: 'imports',
          action: `import_${entity_type}`,
          newValues: { total: rows.length, success: successCount, errors: failCount },
          description: `Importación masiva de ${entity_type}: ${successCount} registros exitosos, ${failCount} errores`
        });

        return { successCount, failCount };
      });

      return res.json({
        success: true,
        message: `Importación finalizada. ${summary.successCount} registros importados correctamente.`
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = importController;
