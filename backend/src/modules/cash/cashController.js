const { db, runTransaction } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const cashController = {
  getRegisters: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { branch_id } = req.query;

      let where = 'cr.company_id = ?';
      let params = [companyId];
      if (branch_id) {
        where += ' AND cr.branch_id = ?';
        params.push(branch_id);
      }

      const registers = await db.prepare(`
        SELECT cr.*, b.name as branch_name,
               (SELECT cs.id FROM cash_sessions cs WHERE cs.cash_register_id = cr.id AND cs.status = 'open' ORDER BY cs.id DESC LIMIT 1) as active_session_id,
               (SELECT u.username FROM cash_sessions cs JOIN users u ON cs.user_id = u.id WHERE cs.cash_register_id = cr.id AND cs.status = 'open' ORDER BY cs.id DESC LIMIT 1) as active_cashier
        FROM cash_registers cr
        LEFT JOIN branches b ON cr.branch_id = b.id
        WHERE ${where}
        ORDER BY cr.name ASC
      `).all(...params);

      return res.json({ success: true, data: registers });
    } catch (err) {
      console.error('Error in getRegisters:', err);
      return res.status(500).json({ success: false, message: 'Error consultando cajas.', error: err.message });
    }
  },

  getActiveSession: async (req, res) => {
    try {
      const branchId = req.user.branch_id;
      const userId = req.user.id;

      const session = await db.prepare(`
        SELECT cs.*, cr.name as register_name, cr.code as register_code,
               u.username as cashier_name
        FROM cash_sessions cs
        JOIN cash_registers cr ON cs.cash_register_id = cr.id
        JOIN users u ON cs.user_id = u.id
        WHERE cs.user_id = ? AND cs.branch_id = ? AND cs.status = 'open'
      `).get(userId, branchId);

      if (!session) {
        return res.json({ success: true, has_open_session: false, session: null });
      }

      // Calculate current expected cash in real-time
      const movements = await db.prepare(`
        SELECT type, SUM(amount) as total
        FROM cash_movements
        WHERE cash_session_id = ?
        GROUP BY type
      `).all(session.id);

      let netCash = Number(session.initial_cash);
      movements.forEach(m => {
        if (['sale_cash', 'cxc_payment', 'deposit'].includes(m.type)) {
          netCash += Number(m.total);
        } else if (['withdrawal', 'expense', 'refund'].includes(m.type)) {
          netCash -= Number(m.total);
        }
      });

      session.current_cash = netCash;
      session.movements = await db.prepare('SELECT * FROM cash_movements WHERE cash_session_id = ? ORDER BY created_at DESC').all(session.id);

      return res.json({ success: true, has_open_session: true, session });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error obteniendo sesión de caja.', error: err.message });
    }
  },

  openSession: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { cash_register_id, initial_cash = 0 } = req.body;

      if (!cash_register_id) {
        return res.status(400).json({ success: false, message: 'La caja registradora es obligatoria.' });
      }

      // Verify register belongs to company
      const reg = await db.prepare('SELECT branch_id FROM cash_registers WHERE id = ? AND company_id = ?').get(cash_register_id, companyId);
      if (!reg) {
        return res.status(404).json({ success: false, message: 'Caja registradora no válida para su empresa.' });
      }
      const branchId = reg.branch_id || req.user.branch_id || 1;
      const userId = req.user.id;

      // Check if this register already has an open session
      const existingRegisterSession = await db.prepare(`
        SELECT id FROM cash_sessions WHERE cash_register_id = ? AND status = 'open'
      `).get(cash_register_id);

      if (existingRegisterSession) {
        return res.status(400).json({ success: false, message: 'Esta caja ya tiene una sesión abierta activa.' });
      }

      // Check if user already has an open session
      const existingUserSession = await db.prepare(`
        SELECT id FROM cash_sessions WHERE user_id = ? AND status = 'open'
      `).get(userId);

      if (existingUserSession) {
        return res.status(400).json({ success: false, message: 'Ya tienes una sesión de caja abierta en este u otro punto.' });
      }

      const sessionId = await runTransaction(async (txDb) => {
        const resSession = await txDb.prepare(`
          INSERT INTO cash_sessions (
            cash_register_id, branch_id, user_id, initial_cash, status
          ) VALUES (?, ?, ?, ?, 'open')
        `).run(cash_register_id, branchId, userId, Number(initial_cash) || 0);
        const sId = resSession.lastInsertRowid;

        // Record initial fund movement if initial cash > 0 (marked as 'initial_fund' to avoid double-counting in closing)
        if (Number(initial_cash) > 0) {
          await txDb.prepare(`
            INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason)
            VALUES (?, ?, 'initial_fund', ?, 'Monto inicial de apertura de caja')
          `).run(sId, userId, Number(initial_cash));
        }

        return sId;
      });

      logAudit({
        companyId,
        userId,
        ipAddress: req.ip,
        module: 'cash',
        action: 'open_cash',
        recordId: sessionId,
        newValues: { cash_register_id, initial_cash },
        description: `Apertura de turno de caja registradora ID ${cash_register_id} con monto inicial RD$ ${Number(initial_cash).toFixed(2)}`
      });

      return res.status(201).json({ success: true, message: 'Caja aperturada exitosamente.', session_id: sessionId });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  recordCashMovement: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const userId = req.user.id;
      const { session_id, type, amount, reason } = req.body;

      if (!session_id || !type || !amount || !reason) {
        return res.status(400).json({ success: false, message: 'Sesión, tipo, monto y motivo son obligatorios.' });
      }

      // Verify session belongs to company and is open
      const session = await db.prepare(`
        SELECT cs.*
        FROM cash_sessions cs
        JOIN cash_registers cr ON cs.cash_register_id = cr.id
        WHERE cs.id = ? AND cr.company_id = ? AND cs.status = 'open'
      `).get(session_id, companyId);

      if (!session) {
        return res.status(404).json({ success: false, message: 'Sesión de caja no encontrada o cerrada.' });
      }

      // Check ownership or supervisor authorization
      const canManageCash = ['super-admin', 'admin'].includes(req.user.role_slug) ||
        (req.user.permissions && (req.user.permissions.includes('cash.manage') || req.user.permissions.includes('cash.withdraw')));

      if (Number(session.user_id) !== Number(userId) && !canManageCash) {
        return res.status(403).json({ success: false, message: 'No está autorizado para registrar movimientos en la sesión de otro cajero.' });
      }

      await db.prepare(`
        INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason)
        VALUES (?, ?, ?, ?, ?)
      `).run(session_id, userId, type, Math.abs(Number(amount)), reason);

      logAudit({
        companyId,
        userId,
        ipAddress: req.ip,
        module: 'cash',
        action: `movement_${type}`,
        recordId: session_id,
        newValues: { type, amount, reason },
        description: `Movimiento de caja [${type}] por RD$ ${Number(amount).toFixed(2)}: ${reason}`
      });

      return res.json({ success: true, message: 'Movimiento de caja registrado exitosamente.' });
    } catch (err) {
      console.error('Error in recordCashMovement:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  closeSession: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const userId = req.user.id;
      const {
        session_id,
        counted_cash,
        actual_cash,
        total_card = 0,
        total_transfer = 0,
        total_check = 0,
        total_credit = 0,
        close_notes,
        notes
      } = req.body;

      if (!session_id) {
        return res.status(400).json({ success: false, message: 'ID de sesión es requerido.' });
      }

      const counted = Number(counted_cash !== undefined ? counted_cash : (actual_cash !== undefined ? actual_cash : 0));
      const finalNotes = close_notes || notes || '';

      const summary = await runTransaction(async (txDb) => {
        // Lock session with row-level lock and verify company scope
        const session = await txDb.prepare(`
          SELECT cs.*
          FROM cash_sessions cs
          JOIN cash_registers cr ON cs.cash_register_id = cr.id
          WHERE cs.id = ? AND cr.company_id = ? AND cs.status = 'open'
          FOR UPDATE
        `).get(session_id, companyId);

        if (!session) {
          throw new Error('Sesión no encontrada o ya se encuentra cerrada.');
        }

        // Verify ownership: user must own session or have supervisor privileges
        const canCloseAny = ['super-admin', 'admin'].includes(req.user.role_slug) ||
          (req.user.permissions && (req.user.permissions.includes('cash.manage') || req.user.permissions.includes('cash.close')));

        if (Number(session.user_id) !== Number(userId) && !canCloseAny) {
          throw new Error('No está autorizado para cerrar la sesión de caja de otro usuario.');
        }

        // Calculate expected cash: initial_cash + incoming cash movements - outgoing cash movements
        // (Note: 'initial_fund' is excluded since initial_cash is already the starting base)
        const movements = await txDb.prepare(`
          SELECT type, SUM(amount) as total
          FROM cash_movements
          WHERE cash_session_id = ?
          GROUP BY type
        `).all(session_id);

        let expectedCash = Number(session.initial_cash || 0);
        movements.forEach(m => {
          if (['sale_cash', 'cxc_payment', 'deposit'].includes(m.type)) {
            expectedCash += Number(m.total);
          } else if (['withdrawal', 'expense', 'refund', 'refund_cash'].includes(m.type)) {
            expectedCash -= Number(m.total);
          }
        });

        expectedCash = Math.round(expectedCash * 100) / 100;
        const cashDifference = Math.round((counted - expectedCash) * 100) / 100;

        if (Math.abs(cashDifference) > 0.01 && (!finalNotes || finalNotes.trim() === '')) {
          throw new Error(`Existe un descuadre de caja de RD$ ${cashDifference.toFixed(2)}. Es obligatorio justificar la diferencia en las observaciones de cierre.`);
        }

        await txDb.prepare(`
          UPDATE cash_sessions
          SET status = 'closed',
              closed_at = CURRENT_TIMESTAMP,
              expected_cash = ?,
              counted_cash = ?,
              cash_difference = ?,
              total_card = ?,
              total_transfer = ?,
              total_check = ?,
              total_credit = ?,
              total_sales = (SELECT COALESCE(SUM(total), 0) FROM sales WHERE cash_session_id = ? AND status != 'cancelled'),
              close_notes = ?
          WHERE id = ?
        `).run(
          expectedCash, counted, cashDifference,
          total_card, total_transfer, total_check, total_credit,
          session_id, finalNotes, session_id
        );

        return { expectedCash, counted, cashDifference, registerId: session.cash_register_id };
      });

      logAudit({
        companyId,
        userId,
        ipAddress: req.ip,
        module: 'cash',
        action: 'close_cash',
        recordId: session_id,
        newValues: { expectedCash: summary.expectedCash, counted: summary.counted, cashDifference: summary.cashDifference, close_notes: finalNotes },
        description: `Cierre y arqueo de caja #${summary.registerId}. Esperado: RD$ ${summary.expectedCash.toFixed(2)}, Contado: RD$ ${summary.counted.toFixed(2)}, Dif: RD$ ${summary.cashDifference.toFixed(2)}`
      });

      return res.json({
        success: true,
        message: 'Caja cerrada y arqueo completado exitosamente.',
        summary: {
          expected_cash: summary.expectedCash,
          counted_cash: summary.counted,
          cash_difference: summary.cashDifference
        }
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  getSessionHistory: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { branch_id, date } = req.query;

      let where = 'cs.branch_id IN (SELECT id FROM branches WHERE company_id = ?)';
      let params = [companyId];
      if (branch_id) {
        where += ' AND cs.branch_id = ?';
        params.push(branch_id);
      }
      if (date) {
        where += ' AND date(cs.opened_at) = ?';
        params.push(date);
      }

      const sessions = await db.prepare(`
        SELECT cs.*, cr.name as register_name,
               u.username as cashier_username, u.first_name || ' ' || u.last_name as cashier_name
        FROM cash_sessions cs
        JOIN cash_registers cr ON cs.cash_register_id = cr.id
        JOIN users u ON cs.user_id = u.id
        WHERE ${where}
        ORDER BY cs.opened_at DESC
        LIMIT 50
      `).all(...params);

      return res.json({ success: true, data: sessions });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = cashController;
