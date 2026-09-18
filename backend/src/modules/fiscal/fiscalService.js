const { db, runTransaction } = require('../../database/db');

const FiscalService = {
  /**
   * Generates the next atomic Dominican NCF number with row-level locking
   * Format: B0100000001 (11 characters)
   * Concurrency-safe: uses FOR UPDATE row-level lock within transactions.
   * If txClient is not provided, automatically wraps in an atomic runTransaction.
   */
  getNextNCF: async (companyId, branchId, fiscalTypeCode, txClient = null) => {
    if (!txClient) {
      return await runTransaction(async (txDb) => {
        return await FiscalService.getNextNCF(companyId, branchId, fiscalTypeCode, txDb);
      });
    }

    const activeDb = txClient;

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
  },

  /**
   * Validates supplier invoice NCF against DGII standard structure (B01, B02, B11, etc. or e-CF)
   */
  validateSupplierNCF: (ncf) => {
    if (!ncf) return { valid: true };
    const clean = String(ncf).trim().toUpperCase();
    if (!clean) return { valid: true };

    const standardRegex = /^B(01|02|03|04|11|13|14|15)[0-9]{8}$/;
    const electronicRegex = /^E(31|32|33|34|41|43|44|45)[0-9]{10}$/;

    if (standardRegex.test(clean) || electronicRegex.test(clean)) {
      return { valid: true, cleanNCF: clean };
    }

    return {
      valid: false,
      message: `El NCF "${clean}" no cumple con la estructura oficial de la DGII. Debe ser de 11 caracteres (ej: B0100000001, B0200000001) o 13 caracteres si es e-CF (ej: E310000000001).`
    };
  }
};

module.exports = FiscalService;
