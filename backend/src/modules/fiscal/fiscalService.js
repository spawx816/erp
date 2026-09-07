const { db } = require('../../database/db');

const FiscalService = {
  /**
   * Generates the next atomic Dominican NCF number
   * Format: B0100000001 (11 characters)
   */
  getNextNCF: async (companyId, branchId, fiscalTypeCode) => {
    // 1. Fetch sequence
    const seq = await db.prepare(`
      SELECT * FROM fiscal_sequences
      WHERE branch_id = ? AND fiscal_type_code = ? AND status = 'active'
    `).get(branchId, fiscalTypeCode);

    if (!seq) {
      throw new Error(`No hay una secuencia fiscal activa configurada para el tipo [${fiscalTypeCode}] en esta sucursal.`);
    }

    if (seq.current_number > seq.final_number) {
      throw new Error(`La secuencia fiscal para [${fiscalTypeCode}] se ha agotado. Último número permitido: ${seq.final_number}`);
    }

    if (seq.expiration_date) {
      const expDate = new Date(seq.expiration_date);
      const today = new Date();
      if (today > expDate) {
        throw new Error(`La secuencia fiscal para [${fiscalTypeCode}] venció el ${seq.expiration_date}.`);
      }
    }

    // 2. Format NCF: Prefix (e.g. B01 or B02) + 8 digit padded current_number
    const padded = String(seq.current_number).padStart(8, '0');
    const ncf = `${seq.prefix}${padded}`;

    // 3. Atomically increment sequence
    await db.prepare(`
      UPDATE fiscal_sequences
      SET current_number = current_number + 1
      WHERE id = ?
    `).run(seq.id);

    return {
      sequenceId: seq.id,
      ncf
    };
  }
};

module.exports = FiscalService;
