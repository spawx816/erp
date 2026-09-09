const { db } = require('../../database/db');

const FiscalService = {
  /**
   * Generates the next atomic Dominican NCF number with row-level locking
   * Format: B0100000001 (11 characters)
   * Concurrency-safe: uses FOR UPDATE row-level lock within transactions.
   */
  getNextNCF: async (companyId, branchId, fiscalTypeCode, txClient = null) => {
    const activeDb = txClient || db;

    // 1. Fetch sequence with row-level exclusive lock
    const seq = await activeDb.prepare(`
      SELECT * FROM fiscal_sequences
      WHERE company_id = ? AND branch_id = ? AND fiscal_type_code = ? AND status = 'active'
      FOR UPDATE
    `).get(companyId, branchId, fiscalTypeCode);

    if (!seq) {
      throw new Error(`No hay una secuencia fiscal activa configurada para el tipo [${fiscalTypeCode}] en esta sucursal.`);
    }

    const currentNum = Number(seq.current_number);
    const finalNum = Number(seq.final_number);

    if (currentNum > finalNum) {
      throw new Error(`La secuencia fiscal para [${fiscalTypeCode}] se ha agotado. Último número permitido: ${finalNum}`);
    }

    if (seq.expiration_date) {
      const expDate = new Date(seq.expiration_date);
      const today = new Date();
      // Set to end of expiration day
      expDate.setHours(23, 59, 59, 999);
      if (today > expDate) {
        throw new Error(`La secuencia fiscal para [${fiscalTypeCode}] venció el ${seq.expiration_date}.`);
      }
    }

    // 2. Format NCF: Prefix (e.g. B01 or B02) + 8 digit zero-padded number
    const padded = String(currentNum).padStart(8, '0');
    const ncf = `${seq.prefix}${padded}`;

    // 3. Atomically increment sequence for next request
    await activeDb.prepare(`
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
