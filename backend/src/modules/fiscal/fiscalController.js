const { db } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const fiscalController = {
  getSequences: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { branch_id } = req.query;

      let where = 's.company_id = ?';
      let params = [companyId];
      if (branch_id) {
        where += ' AND s.branch_id = ?';
        params.push(branch_id);
      }

      const sequences = await db.prepare(`
        SELECT s.*, b.name as branch_name, fdt.name as document_type_name
        FROM fiscal_sequences s
        JOIN branches b ON s.branch_id = b.id
        LEFT JOIN fiscal_document_types fdt ON s.fiscal_type_code = fdt.code AND fdt.company_id = s.company_id
        WHERE ${where}
        ORDER BY s.branch_id ASC, s.fiscal_type_code ASC
      `).all(...params);

      return res.json({ success: true, data: sequences });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando secuencias fiscales.', error: err.message });
    }
  },

  getDocumentTypes: async (req, res) => {
    try {
      const types = await db.prepare('SELECT * FROM fiscal_document_types WHERE company_id = ?').all(req.user.company_id);
      return res.json({ success: true, data: types });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createSequence: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { branch_id, fiscal_type_code, series = 'B', prefix, current_number = 1, final_number, expiration_date, warning_threshold = 50 } = req.body;

      if (!branch_id || !fiscal_type_code || !final_number) {
        return res.status(400).json({ success: false, message: 'Sucursal, tipo fiscal y número final son obligatorios.' });
      }

      const cleanPrefix = prefix || fiscal_type_code;

      const stmt = await db.prepare(`
        INSERT INTO fiscal_sequences (
          company_id, branch_id, fiscal_type_code, series, prefix,
          current_number, final_number, expiration_date, warning_threshold, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `);

      const result = await stmt.run(companyId, branch_id, fiscal_type_code, series, cleanPrefix, current_number, final_number, expiration_date || null, warning_threshold);

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'fiscal',
        action: 'create_sequence',
        recordId: result.lastInsertRowid,
        newValues: req.body,
        description: `Nueva secuencia fiscal ${cleanPrefix} (Rango ${current_number} - ${final_number})`
      });

      return res.status(201).json({ success: true, message: 'Secuencia fiscal configurada correctamente.', id: result.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error creando secuencia fiscal.', error: err.message });
    }
  },

  consultRNC: async (req, res) => {
    try {
      const { rnc } = req.params;
      const { queryRncApi } = require('./rncService');
      const result = await queryRncApi(rnc);

      if (!result.found) {
        return res.status(404).json({
          success: false,
          found: false,
          message: result.message || 'El RNC/Cédula no se encuentra inscrito en la DGII.',
          rnc: result.rnc,
          formatted_rnc: result.formatted_rnc
        });
      }

      return res.json({
        success: true,
        data: result
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Error al consultar RNC en la DGII.'
      });
    }
  },

  searchRNCByName: async (req, res) => {
    try {
      const { buscar, q, pagina, page } = req.query;
      const term = buscar || q;
      const pageNum = pagina || page || 1;

      const { searchRncByName } = require('./rncService');
      const result = await searchRncByName(term, pageNum);

      return res.json(result);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Error en búsqueda por nombre en DGII.'
      });
    }
  }
};

module.exports = fiscalController;
