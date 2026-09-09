const { db, runTransaction } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const ALLOWED_ENTITIES = ['products', 'customers', 'suppliers'];

function validateRow(entityType, row) {
  const errors = [];
  if (entityType === 'products') {
    if (!row.name || String(row.name).trim() === '') errors.push('El nombre del producto es requerido.');
    if (!row.sku || String(row.sku).trim() === '') errors.push('El SKU es requerido.');
    if (row.price === undefined || isNaN(Number(row.price)) || Number(row.price) < 0) errors.push('Precio inválido o negativo.');
    if (row.cost !== undefined && (isNaN(Number(row.cost)) || Number(row.cost) < 0)) errors.push('Costo inválido o negativo.');
  } else if (entityType === 'customers') {
    if ((!row.company_name || String(row.company_name).trim() === '') && (!row.first_name || String(row.first_name).trim() === '')) {
      errors.push('Debe especificar nombre o razón social del cliente.');
    }
    if (!row.phone && !row.email) {
      errors.push('Debe tener al menos teléfono o correo de contacto.');
    }
  } else if (entityType === 'suppliers') {
    if (!row.company_name || String(row.company_name).trim() === '') errors.push('Razón social del proveedor requerida.');
    if (!row.tax_id || String(row.tax_id).trim() === '') errors.push('RNC o identificación fiscal requerida.');
  } else {
    errors.push(`Tipo de entidad [${entityType}] no admitida.`);
  }
  return errors;
}

const importController = {
  previewAndValidate: async (req, res) => {
    try {
      const { entity_type, rows = [] } = req.body;
      if (!entity_type || !ALLOWED_ENTITIES.includes(entity_type)) {
        return res.status(400).json({
          success: false,
          message: `Tipo de entidad inválido. Soportados: ${ALLOWED_ENTITIES.join(', ')}.`
        });
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Filas de datos son obligatorias para la importación.' });
      }

      const validRows = [];
      const errorRows = [];

      rows.forEach((row, index) => {
        const errors = validateRow(entity_type, row);
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
        valid_rows: validRows.slice(0, 50),
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

      if (!entity_type || !ALLOWED_ENTITIES.includes(entity_type)) {
        return res.status(400).json({
          success: false,
          message: `Tipo de entidad inválido. Soportados: ${ALLOWED_ENTITIES.join(', ')}.`
        });
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Datos insuficientes para importar.' });
      }

      const summary = await runTransaction(async (txDb) => {
        let insertedCount = 0;
        let skippedCount = 0;
        let failCount = 0;
        const details = [];

        if (entity_type === 'products') {
          const stmt = await txDb.prepare(`
            INSERT INTO products (
              company_id, name, sku, barcode, cost, price, stock_min, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
            ON CONFLICT (sku) DO NOTHING
          `);

          for (const r of rows) {
            const errs = validateRow(entity_type, r);
            if (errs.length > 0) {
              failCount++;
              details.push({ identifier: r.sku || r.name, error: errs.join('; ') });
              continue;
            }

            try {
              const resIns = await stmt.run(
                companyId, r.name, r.sku, r.barcode || null,
                Number(r.cost || 0), Number(r.price || 0), Number(r.stock_min || 5)
              );
              if (resIns && resIns.changes > 0) {
                insertedCount++;
              } else {
                skippedCount++;
              }
            } catch (e) {
              failCount++;
              details.push({ identifier: r.sku, error: e.message });
            }
          }
        } else if (entity_type === 'customers') {
          const stmt = await txDb.prepare(`
            INSERT INTO customers (
              company_id, person_type, first_name, last_name, company_name, tax_id, id_card, phone, email, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
          `);

          for (const r of rows) {
            const errs = validateRow(entity_type, r);
            if (errs.length > 0) {
              failCount++;
              details.push({ identifier: r.company_name || r.first_name, error: errs.join('; ') });
              continue;
            }

            try {
              const resIns = await stmt.run(
                companyId, r.person_type || 'natural', r.first_name || null, r.last_name || null,
                r.company_name || null, r.tax_id || null, r.id_card || null, r.phone || null, r.email || null
              );
              if (resIns && resIns.changes > 0) {
                insertedCount++;
              } else {
                skippedCount++;
              }
            } catch (e) {
              failCount++;
              details.push({ identifier: r.company_name || r.first_name, error: e.message });
            }
          }
        } else if (entity_type === 'suppliers') {
          const stmt = await txDb.prepare(`
            INSERT INTO suppliers (
              company_id, company_name, tax_id, contact_name, phone, email, status
            ) VALUES (?, ?, ?, ?, ?, ?, 'active')
          `);

          for (const r of rows) {
            const errs = validateRow(entity_type, r);
            if (errs.length > 0) {
              failCount++;
              details.push({ identifier: r.company_name || r.tax_id, error: errs.join('; ') });
              continue;
            }

            try {
              const resIns = await stmt.run(
                companyId, r.company_name, r.tax_id, r.contact_name || null, r.phone || null, r.email || null
              );
              if (resIns && resIns.changes > 0) {
                insertedCount++;
              } else {
                skippedCount++;
              }
            } catch (e) {
              failCount++;
              details.push({ identifier: r.company_name, error: e.message });
            }
          }
        }

        // Log import record in DB
        await txDb.prepare(`
          INSERT INTO import_logs (company_id, user_id, entity_type, total_rows, success_rows, error_rows, error_details)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, req.user.id, entity_type, rows.length, insertedCount, failCount, JSON.stringify(details));

        return { insertedCount, skippedCount, failCount, total: rows.length };
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'imports',
        action: `import_${entity_type}`,
        newValues: summary,
        description: `Importación masiva de ${entity_type}: ${summary.insertedCount} insertados, ${summary.skippedCount} omitidos por conflicto, ${summary.failCount} fallidos.`
      });

      return res.json({
        success: true,
        message: `Importación finalizada: ${summary.insertedCount} insertados, ${summary.skippedCount} omitidos por duplicado, ${summary.failCount} con errores.`,
        summary
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = importController;
