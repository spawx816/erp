const { db, runTransaction } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');
const { generateCommercialId } = require('../../utils/idGenerator');

const financeController = {
  // ACCOUNTS RECEIVABLE (CxC)
  getReceivables: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { customer_id, status, aging_bracket } = req.query;

      let whereClauses = ['ar.company_id = ?'];
      let params = [companyId];

      if (customer_id) {
        whereClauses.push('ar.customer_id = ?');
        params.push(customer_id);
      }
      if (status) {
        whereClauses.push('ar.status = ?');
        params.push(status);
      } else {
        whereClauses.push("ar.status != 'paid'");
      }

      const receivables = await db.prepare(`
        SELECT ar.*,
               COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
               c.phone as customer_phone, c.tax_id as customer_tax_id,
               b.name as branch_name,
               COALESCE((CURRENT_DATE - ar.due_date), 0) as days_overdue
        FROM accounts_receivable ar
        JOIN customers c ON ar.customer_id = c.id
        JOIN branches b ON ar.branch_id = b.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY ar.due_date ASC
      `).all(...params);

      // Filter by aging bracket if requested
      const filtered = receivables.filter(r => {
        const days = r.days_overdue;
        if (!aging_bracket) return true;
        if (aging_bracket === '0-30') return days <= 30;
        if (aging_bracket === '31-60') return days > 30 && days <= 60;
        if (aging_bracket === '61-90') return days > 60 && days <= 90;
        if (aging_bracket === '91-120') return days > 90 && days <= 120;
        if (aging_bracket === '120+') return days > 120;
        return true;
      });

      // Compute summary stats
      let totalReceivable = 0;
      let totalOverdue = 0;
      filtered.forEach(r => {
        totalReceivable += Number(r.balance);
        if (r.days_overdue > 0) totalOverdue += Number(r.balance);
      });

      return res.json({
        success: true,
        summary: {
          total_receivable: totalReceivable,
          total_overdue: totalOverdue,
          count: filtered.length
        },
        data: filtered
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando CxC.', error: err.message });
    }
  },

  receivePayment: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const branchId = req.user.branch_id;
      const userId = req.user.id;

      const {
        customer_id,
        total_amount,
        payment_method = 'cash',
        reference_number,
        notes,
        allocations = [] // Array of { receivable_id, amount_applied }
      } = req.body;

      if (!customer_id || !total_amount || Number(total_amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Cliente y monto válido requeridos.' });
      }

      // If cash, verify open session
      let activeSession = null;
      if (payment_method === 'cash') {
        activeSession = await db.prepare(`
          SELECT id FROM cash_sessions
          WHERE user_id = ? AND branch_id = ? AND status = 'open'
        `).get(userId, branchId);

        if (!activeSession) {
          return res.status(400).json({
            success: false,
            message: 'Se requiere una sesión de caja abierta para recibir pagos en efectivo.'
          });
        }
      }

      const totalAmountNum = Math.round(Number(total_amount) * 100) / 100;
      if (isNaN(totalAmountNum) || !isFinite(totalAmountNum) || totalAmountNum <= 0) {
        return res.status(400).json({ success: false, message: 'El monto total a cobrar debe ser un número positivo mayor a cero.' });
      }

      const now = new Date();
      const paymentNumber = generateCommercialId('RC');
      const paymentDate = now.toISOString().split('T')[0];

      const paymentId = await runTransaction(async (txDb) => {
        // 1. Verify customer belongs to company and lock row
        const cust = await txDb.prepare(`
          SELECT id, current_balance FROM customers
          WHERE id = ? AND company_id = ?
          FOR UPDATE
        `).get(customer_id, companyId);

        if (!cust) {
          throw new Error('Cliente no válido o no pertenece a su empresa.');
        }

        // 2. Insert Payment Record
        const resPay = await txDb.prepare(`
          INSERT INTO receivable_payments (
            company_id, branch_id, customer_id, cash_session_id, user_id,
            payment_number, payment_date, total_amount, payment_method, reference_number, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          companyId, branchId, customer_id, activeSession ? activeSession.id : null, userId,
          paymentNumber, paymentDate, totalAmountNum, payment_method, reference_number || null, notes || null
        );
        const pId = resPay.lastInsertRowid;

        // 3. Process allocations
        let remainingToApply = totalAmountNum;
        let targetAllocations = allocations;

        if (!targetAllocations || targetAllocations.length === 0) {
          // FIFO auto-apply to oldest pending invoices
          const pendingInvoices = await txDb.prepare(`
            SELECT id, balance FROM accounts_receivable
            WHERE customer_id = ? AND company_id = ? AND status != 'paid' AND balance > 0
            ORDER BY due_date ASC
            FOR UPDATE
          `).all(customer_id, companyId);

          targetAllocations = [];
          for (const inv of pendingInvoices) {
            if (remainingToApply <= 0) break;
            const apply = Math.min(Number(inv.balance), remainingToApply);
            targetAllocations.push({ receivable_id: inv.id, amount_applied: apply });
            remainingToApply = Math.round((remainingToApply - apply) * 100) / 100;
          }
        }

        let totalAppliedSum = 0;
        for (const alloc of targetAllocations) {
          const applied = Math.round(Number(alloc.amount_applied) * 100) / 100;
          if (isNaN(applied) || applied <= 0) continue;

          // Lock and verify receivable ownership and company
          const ar = await txDb.prepare(`
            SELECT id, sale_id, balance, status FROM accounts_receivable
            WHERE id = ? AND company_id = ? AND customer_id = ?
            FOR UPDATE
          `).get(alloc.receivable_id, companyId, customer_id);

          if (!ar) {
            throw new Error(`Cuenta por cobrar ID ${alloc.receivable_id} no pertenece a este cliente o empresa.`);
          }

          if (applied > Number(ar.balance) + 0.01) {
            throw new Error(`El monto aplicado (RD$ ${applied.toFixed(2)}) excede el saldo pendiente (RD$ ${Number(ar.balance).toFixed(2)}) del documento.`);
          }

          await txDb.prepare(`
            INSERT INTO payment_allocations (payment_id, receivable_id, amount_applied)
            VALUES (?, ?, ?)
          `).run(pId, alloc.receivable_id, applied);

          // Update receivable balance
          const newBal = Math.max(0, Math.round((Number(ar.balance) - applied) * 100) / 100);
          const newStatus = newBal <= 0.01 ? 'paid' : 'partial';

          await txDb.prepare(`
            UPDATE accounts_receivable
            SET balance = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newBal, newStatus, alloc.receivable_id);

          // Synchronize sales balance if tied to a sale (#17)
          if (ar.sale_id) {
            await txDb.prepare(`
              UPDATE sales
              SET balance = GREATEST(0, balance - ?), updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(applied, ar.sale_id);
          }

          totalAppliedSum = Math.round((totalAppliedSum + applied) * 100) / 100;
        }

        // Validate allocations against total payment amount (#11)
        if (targetAllocations && targetAllocations.length > 0 && totalAppliedSum > totalAmountNum + 0.01) {
          throw new Error(`La suma de las aplicaciones (RD$ ${totalAppliedSum.toFixed(2)}) excede el monto total del pago (RD$ ${totalAmountNum.toFixed(2)}).`);
        }

        // 4. Deduct customer balance using PostgreSQL native GREATEST
        await txDb.prepare(`
          UPDATE customers
          SET current_balance = GREATEST(0, current_balance - ?), updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(totalAmountNum, customer_id);

        // 5. If cash, record cash movement
        if (payment_method === 'cash' && activeSession) {
          await txDb.prepare(`
            INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
            VALUES (?, ?, 'cxc_payment', ?, ?, 'receivable_payments', ?)
          `).run(activeSession.id, userId, totalAmountNum, `Cobro CxC Recibo #${paymentNumber}`, pId);
        }

        return pId;
      });

      logAudit({
        companyId,
        userId,
        ipAddress: req.ip,
        module: 'finance',
        action: 'cxc_payment',
        recordId: paymentId,
        newValues: { payment_number: paymentNumber, total_amount: totalAmountNum, payment_method },
        description: `Cobro a cliente registrado ${paymentNumber} por RD$ ${totalAmountNum.toFixed(2)}`
      });

      return res.status(201).json({ success: true, message: 'Pago registrado exitosamente.', payment_id: paymentId, payment_number: paymentNumber });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // ACCOUNTS PAYABLE (CxP)
  getPayables: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { supplier_id, status } = req.query;

      let whereClauses = ['ap.company_id = ?'];
      let params = [companyId];

      if (supplier_id) {
        whereClauses.push('ap.supplier_id = ?');
        params.push(supplier_id);
      }
      if (status) {
        whereClauses.push('ap.status = ?');
        params.push(status);
      } else {
        whereClauses.push("ap.status != 'paid'");
      }

      const payables = await db.prepare(`
        SELECT ap.*,
               s.company_name as supplier_name, s.phone as supplier_phone, s.tax_id as supplier_tax_id,
               b.name as branch_name,
               COALESCE((CURRENT_DATE - ap.due_date), 0) as days_overdue
        FROM accounts_payable ap
        JOIN suppliers s ON ap.supplier_id = s.id
        JOIN branches b ON ap.branch_id = b.id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY ap.due_date ASC
      `).all(...params);

      let totalPayable = 0;
      payables.forEach(p => { totalPayable += Number(p.balance); });

      return res.json({ success: true, summary: { total_payable: totalPayable }, data: payables });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error consultando CxP.', error: err.message });
    }
  },

  // PAY TO SUPPLIER
  paySupplier: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const userId = req.user.id;
      const { payable_id, amount, payment_method = 'transfer', reference_number, notes } = req.body;

      const amt = Math.round(Number(amount) * 100) / 100;
      if (isNaN(amt) || !isFinite(amt) || amt <= 0) {
        return res.status(400).json({ success: false, message: 'El monto a pagar debe ser un número positivo mayor a cero.' });
      }

      await runTransaction(async (txDb) => {
        const payable = await txDb.prepare(`
          SELECT * FROM accounts_payable
          WHERE id = ? AND company_id = ?
          FOR UPDATE
        `).get(payable_id, companyId);

        if (!payable) throw new Error('Cuenta por pagar no encontrada.');

        if (amt > Number(payable.balance) + 0.01) {
          throw new Error(`El monto (RD$ ${amt}) excede el saldo pendiente (${payable.balance}).`);
        }

        const paymentDate = new Date().toISOString().split('T')[0];

        await txDb.prepare(`
          INSERT INTO payable_payments (payable_id, company_id, user_id, payment_date, amount, payment_method, reference_number, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(payable_id, companyId, userId, paymentDate, amt, payment_method, reference_number || null, notes || null);

        const newBal = Math.max(0, Math.round((Number(payable.balance) - amt) * 100) / 100);
        const newStatus = newBal <= 0.01 ? 'paid' : 'partial';

        await txDb.prepare(`
          UPDATE accounts_payable
          SET balance = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newBal, newStatus, payable_id);

        // Update supplier balance using native GREATEST
        await txDb.prepare(`
          UPDATE suppliers
          SET current_balance = GREATEST(0, current_balance - ?), updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(amt, payable.supplier_id);
      });

      logAudit({
        companyId,
        userId,
        ipAddress: req.ip,
        module: 'finance',
        action: 'cxp_payment',
        recordId: payable_id,
        newValues: { amount: amt, payment_method },
      });

      return res.json({ success: true, message: 'Pago a proveedor aplicado exitosamente.' });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // EXPENSES
  getExpenses: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { category_id, branch_id, start_date, end_date } = req.query;

      let where = 'e.company_id = ?';
      let params = [companyId];
      if (category_id) {
        where += ' AND e.category_id = ?';
        params.push(category_id);
      }
      if (branch_id) {
        where += ' AND e.branch_id = ?';
        params.push(branch_id);
      }
      if (start_date) {
        where += ' AND e.expense_date >= ?';
        params.push(start_date);
      }
      if (end_date) {
        where += ' AND e.expense_date <= ?';
        params.push(end_date);
      }

      const expenses = await db.prepare(`
        SELECT e.*, ec.name as category_name, b.name as branch_name,
               u.first_name || ' ' || u.last_name as user_name
        FROM expenses e
        JOIN expense_categories ec ON e.category_id = ec.id
        JOIN branches b ON e.branch_id = b.id
        JOIN users u ON e.user_id = u.id
        WHERE ${where}
        ORDER BY e.expense_date DESC
      `).all(...params);

      return res.json({ success: true, data: expenses });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createExpense: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const branchId = req.user.branch_id;
      const userId = req.user.id;

      const { category_id, amount, payment_method = 'cash', beneficiary, voucher_number, notes } = req.body;

      const amountNum = Math.round(Number(amount) * 100) / 100;
      if (!category_id || isNaN(amountNum) || !isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ success: false, message: 'Categoría y un monto numérico positivo mayor a cero son obligatorios.' });
      }

      let activeSession = null;
      if (payment_method === 'cash') {
        activeSession = await db.prepare("SELECT id FROM cash_sessions WHERE user_id = ? AND branch_id = ? AND status = 'open'").get(userId, branchId);
        if (!activeSession) {
          return res.status(400).json({ success: false, message: 'Se requiere una sesión de caja abierta para registrar gastos en efectivo.' });
        }
      }

      const expenseDate = new Date().toISOString().split('T')[0];

      const expId = await runTransaction(async (txDb) => {
        const resExp = await txDb.prepare(`
          INSERT INTO expenses (
            company_id, branch_id, category_id, user_id, cash_session_id,
            amount, payment_method, beneficiary, voucher_number, notes, expense_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          companyId, branchId, category_id, userId, activeSession ? activeSession.id : null,
          amountNum, payment_method, beneficiary || null, voucher_number || null, notes || null, expenseDate
        );
        const newExpId = resExp.lastInsertRowid;

        // If cash, deduct from active session
        if (payment_method === 'cash' && activeSession) {
          await txDb.prepare(`
            INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
            VALUES (?, ?, 'expense', ?, ?, 'expenses', ?)
          `).run(activeSession.id, userId, amountNum, `Gasto: ${notes || beneficiary || 'Salida de caja'}`, newExpId);
        }

        return newExpId;
      });

      logAudit({
        companyId,
        userId,
        ipAddress: req.ip,
        module: 'finance',
        action: 'create_expense',
        recordId: expId,
        newValues: { category_id, amount: amountNum, payment_method },
        description: `Gasto registrado por RD$ ${amountNum.toFixed(2)}`
      });

      return res.status(201).json({ success: true, message: 'Gasto registrado exitosamente.' });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  getExpenseCategories: async (req, res) => {
    try {
      const categories = await db.prepare('SELECT * FROM expense_categories WHERE company_id = ? ORDER BY name ASC').all(req.user.company_id);
      return res.json({ success: true, data: categories });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // CXC AGING TABLE (Antigüedad de saldos agrupada por cliente con drill-down)
  getCxCAgingTable: async (req, res) => {
    try {
      const companyId = req.user.company_id;

      const customersWithBalances = await db.prepare(`
        SELECT c.id as customer_id, c.code, c.company_name, c.first_name, c.last_name, c.phone,
               sp.name as salesperson_name,
               sp.code as salesperson_code,
               ar.id as receivable_id, ar.invoice_number, ar.ncf, ar.issue_date, ar.due_date, ar.amount, ar.balance,
               COALESCE((CURRENT_DATE - ar.due_date), 0) as days_overdue
        FROM accounts_receivable ar
        JOIN customers c ON ar.customer_id = c.id
        LEFT JOIN salespeople sp ON c.salesperson_id = sp.id
        WHERE ar.company_id = ? AND ar.status != 'paid' AND ar.balance > 0
        ORDER BY c.company_name ASC, ar.due_date ASC
      `).all(companyId);

      const customerMap = {};
      let totals = {
        days_0_30: 0,
        days_31_60: 0,
        days_61_90: 0,
        days_91_120: 0,
        days_over_120: 0,
        grand_total: 0
      };

      customersWithBalances.forEach(row => {
        const cid = row.customer_id;
        if (!customerMap[cid]) {
          customerMap[cid] = {
            customer_id: cid,
            code: row.code,
            customer_name: row.company_name || `${row.first_name} ${row.last_name || ''}`,
            salesperson_name: row.salesperson_name || 'Sin asignar',
            salesperson_code: row.salesperson_code || '',
            days_0_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_91_120: 0,
            days_over_120: 0,
            total: 0,
            invoices: []
          };
        }

        const bal = parseFloat(row.balance || 0);
        const days = row.days_overdue;

        let bracket = '0-30';
        if (days <= 30) {
          customerMap[cid].days_0_30 += bal;
          totals.days_0_30 += bal;
          bracket = '0-30';
        } else if (days <= 60) {
          customerMap[cid].days_31_60 += bal;
          totals.days_31_60 += bal;
          bracket = '31-60';
        } else if (days <= 90) {
          customerMap[cid].days_61_90 += bal;
          totals.days_61_90 += bal;
          bracket = '61-90';
        } else if (days <= 120) {
          customerMap[cid].days_91_120 += bal;
          totals.days_91_120 += bal;
          bracket = '91-120';
        } else {
          customerMap[cid].days_over_120 += bal;
          totals.days_over_120 += bal;
          bracket = '+120';
        }

        customerMap[cid].total += bal;
        totals.grand_total += bal;

        customerMap[cid].invoices.push({
          receivable_id: row.receivable_id,
          invoice_number: row.invoice_number,
          ncf: row.ncf,
          issue_date: row.issue_date,
          due_date: row.due_date,
          amount: row.amount,
          balance: row.balance,
          days_overdue: row.days_overdue,
          bracket
        });
      });

      const rows = Object.values(customerMap).sort((a, b) => b.total - a.total);

      return res.json({
        success: true,
        data: {
          customers: rows,
          rows,
          totals
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // RECURRING EXPENSES (PAGOS FIJOS)
  getRecurringExpenses: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const recurring = await db.prepare(`
        SELECT re.*, ec.name as category_name
        FROM recurring_expenses re
        LEFT JOIN expense_categories ec ON re.category_id = ec.id
        WHERE re.company_id = ?
        ORDER BY re.next_due_date ASC
      `).all(companyId);

      const today = new Date().toISOString().split('T')[0];

      const formatted = recurring.map(r => {
        const dueDate = r.next_due_date;
        let dynamicStatus = r.status;
        if (r.status !== 'paid') {
          if (dueDate < today) {
            dynamicStatus = 'overdue';
          } else {
            const diffDays = Math.ceil((new Date(dueDate) - new Date(today)) / (1000 * 60 * 60 * 24));
            if (diffDays <= (r.alert_days_before || 7)) {
              dynamicStatus = 'upcoming';
            } else {
              dynamicStatus = 'pending';
            }
          }
        }
        return {
          ...r,
          status: dynamicStatus
        };
      });

      return res.json({ success: true, data: formatted });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  createRecurringExpense: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { concept, estimated_amount, frequency, due_day, next_due_date, responsible_person, category_id, alert_days_before } = req.body;

      if (!concept || !estimated_amount || !next_due_date) {
        return res.status(400).json({ success: false, message: 'Concepto, monto y próxima fecha son obligatorios.' });
      }

      const stmt = await db.prepare(`
        INSERT INTO recurring_expenses (company_id, category_id, concept, estimated_amount, frequency, due_day, next_due_date, responsible_person, alert_days_before, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `);
      const r = await stmt.run(companyId, category_id || null, concept, estimated_amount, frequency || 'monthly', due_day || 15, next_due_date, responsible_person || null, alert_days_before || 7);

      return res.status(201).json({ success: true, message: 'Obligación recurrente configurada.', id: r.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateRecurringExpense: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { concept, estimated_amount, frequency, due_day, next_due_date, responsible_person, category_id, alert_days_before, status } = req.body;

      await db.prepare(`
        UPDATE recurring_expenses
        SET concept = COALESCE(?, concept),
            estimated_amount = COALESCE(?, estimated_amount),
            frequency = COALESCE(?, frequency),
            due_day = COALESCE(?, due_day),
            next_due_date = COALESCE(?, next_due_date),
            responsible_person = COALESCE(?, responsible_person),
            category_id = COALESCE(?, category_id),
            alert_days_before = COALESCE(?, alert_days_before),
            status = COALESCE(?, status)
        WHERE id = ? AND company_id = ?
      `).run(concept, estimated_amount, frequency, due_day, next_due_date, responsible_person, category_id, alert_days_before, status, id, companyId);

      return res.json({ success: true, message: 'Obligación actualizada.' });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  payRecurringExpense: async (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { payment_method = 'transfer', voucher_number, notes } = req.body;

      // 1. If cash payment, require active open cash session
      let activeSession = null;
      if (payment_method === 'cash') {
        activeSession = await db.prepare(`
          SELECT id FROM cash_sessions
          WHERE user_id = ? AND company_id = ? AND status = 'open'
          ORDER BY id DESC LIMIT 1
        `).get(req.user.id, companyId);
        if (!activeSession) {
          return res.status(400).json({
            success: false,
            message: 'Se requiere una sesión de caja abierta para registrar un pago de gasto fijo en efectivo.'
          });
        }
      }

      const today = new Date().toISOString().split('T')[0];
      let nextDueStr = null;
      let obligationConcept = '';
      let amountPaid = 0;

      await runTransaction(async (txDb) => {
        // 2. Lock recurring obligation with FOR UPDATE
        const recurring = await txDb.prepare(`
          SELECT * FROM recurring_expenses
          WHERE id = ? AND company_id = ?
          FOR UPDATE
        `).get(id, companyId);

        if (!recurring) {
          throw new Error('Obligación recurrente no encontrada o no pertenece a su empresa.');
        }

        obligationConcept = recurring.concept;
        amountPaid = Number(recurring.estimated_amount || 0);

        // 3. Dynamic next_due_date calculation based on actual frequency (#22)
        const curDue = new Date((recurring.next_due_date || today) + 'T12:00:00Z');
        const freq = (recurring.frequency || 'monthly').toLowerCase();
        if (freq === 'weekly') {
          curDue.setUTCDate(curDue.getUTCDate() + 7);
        } else if (freq === 'biweekly') {
          curDue.setUTCDate(curDue.getUTCDate() + 14);
        } else if (freq === 'quarterly') {
          curDue.setUTCMonth(curDue.getUTCMonth() + 3);
        } else if (freq === 'annually' || freq === 'yearly') {
          curDue.setUTCFullYear(curDue.getUTCFullYear() + 1);
        } else {
          // monthly default
          curDue.setUTCMonth(curDue.getUTCMonth() + 1);
        }
        nextDueStr = curDue.toISOString().split('T')[0];

        // 4. Register in expenses
        const resExp = await txDb.prepare(`
          INSERT INTO expenses (company_id, category_id, user_id, amount, payment_method, beneficiary, voucher_number, notes, expense_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          companyId, recurring.category_id, req.user.id, recurring.estimated_amount,
          payment_method, recurring.responsible_person, voucher_number || null,
          notes || `Pago recurrente: ${recurring.concept}`, today
        );
        const expenseId = resExp.lastInsertRowid;

        // 5. If cash, register cash outflow in cash_movements
        if (payment_method === 'cash' && activeSession) {
          await txDb.prepare(`
            INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
            VALUES (?, ?, 'expense', ?, ?, 'expenses', ?)
          `).run(activeSession.id, req.user.id, recurring.estimated_amount, `Pago recurrente: ${recurring.concept}`, expenseId);
        }

        // 6. Update recurring obligation
        await txDb.prepare(`
          UPDATE recurring_expenses
          SET last_paid_date = ?, next_due_date = ?, status = 'pending'
          WHERE id = ? AND company_id = ?
        `).run(today, nextDueStr, id, companyId);
      });

      logAudit({
        companyId,
        userId: req.user.id,
        ipAddress: req.ip,
        module: 'finance',
        action: 'pay_recurring_expense',
        recordId: id,
        newValues: { concept: obligationConcept, amount: amountPaid, payment_method, next_due_date: nextDueStr },
        description: `Pago de obligación fija [${obligationConcept}] por RD$ ${amountPaid.toFixed(2)} registrado.`
      });

      return res.json({
        success: true,
        message: 'Pago de obligación registrado y siguiente vencimiento agendado.',
        next_due_date: nextDueStr
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = financeController;

