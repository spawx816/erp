const { db, runTransaction } = require('../../database/db');
const { logAudit } = require('../../middlewares/audit');

const financeController = {
  // ACCOUNTS RECEIVABLE (CxC)
  getReceivables: (req, res) => {
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

      const receivables = db.prepare(`
        SELECT ar.*,
               COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
               c.phone as customer_phone, c.tax_id as customer_tax_id,
               b.name as branch_name,
               CAST((julianday('now') - julianday(ar.due_date)) AS INTEGER) as days_overdue
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

  // CxC AGING TABLE (SEMÁFORO 0-120+ CON AGRUPACIÓN POR CLIENTE)
  getCxCAgingTable: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const receivables = db.prepare(`
        SELECT ar.*,
               COALESCE(c.company_name, c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
               c.code as customer_code,
               c.phone as customer_phone,
               COALESCE(sp.name, 'Vendedor Principal') as salesperson_name,
               CAST((julianday('now') - julianday(ar.due_date)) AS INTEGER) as days_overdue
        FROM accounts_receivable ar
        JOIN customers c ON ar.customer_id = c.id
        LEFT JOIN sales s ON ar.sale_id = s.id
        LEFT JOIN salespeople sp ON s.salesperson_id = sp.id
        WHERE ar.company_id = ? AND ar.status != 'paid' AND ar.balance > 0
        ORDER BY ar.customer_id ASC, ar.due_date ASC
      `).all(companyId);

      const customerMap = {};
      let grandTotal = 0;
      let tot_0_30 = 0;
      let tot_31_60 = 0;
      let tot_61_90 = 0;
      let tot_91_120 = 0;
      let tot_over_120 = 0;

      receivables.forEach(r => {
        const bal = Number(r.balance) || 0;
        const days = Math.max(0, Number(r.days_overdue) || 0);

        if (!customerMap[r.customer_id]) {
          customerMap[r.customer_id] = {
            customer_id: r.customer_id,
            customer_name: r.customer_name,
            code: r.customer_code || `CLI-${r.customer_id}`,
            salesperson_name: r.salesperson_name,
            days_0_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_91_120: 0,
            days_over_120: 0,
            total: 0,
            invoices: []
          };
        }

        const cust = customerMap[r.customer_id];
        cust.total += bal;
        grandTotal += bal;

        if (days <= 30) {
          cust.days_0_30 += bal;
          tot_0_30 += bal;
        } else if (days <= 60) {
          cust.days_31_60 += bal;
          tot_31_60 += bal;
        } else if (days <= 90) {
          cust.days_61_90 += bal;
          tot_61_90 += bal;
        } else if (days <= 120) {
          cust.days_91_120 += bal;
          tot_91_120 += bal;
        } else {
          cust.days_over_120 += bal;
          tot_over_120 += bal;
        }

        cust.invoices.push({
          id: r.id,
          sale_id: r.sale_id,
          invoice_number: r.invoice_number || `FAC-${r.sale_id}`,
          ncf: r.ncf,
          issue_date: r.issue_date,
          due_date: r.due_date,
          amount: Number(r.amount),
          balance: bal,
          days_overdue: days
        });
      });

      const customers = Object.values(customerMap);

      return res.json({
        success: true,
        data: {
          totals: {
            grand_total: grandTotal,
            days_0_30: tot_0_30,
            days_31_60: tot_31_60,
            days_61_90: tot_61_90,
            days_91_120: tot_91_120,
            days_over_120: tot_over_120
          },
          customers
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error generando matriz de antigüedad de saldos.', error: err.message });
    }
  },
  receivePayment: (req, res) => {
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
        activeSession = db.prepare(`
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

      const paymentNumber = `RC-${Date.now().toString().slice(-6)}`;
      const paymentDate = new Date().toISOString().split('T')[0];

      const paymentId = runTransaction(() => {
        // 1. Insert Payment
        const stmtPay = db.prepare(`
          INSERT INTO receivable_payments (
            company_id, branch_id, customer_id, cash_session_id, user_id,
            payment_number, payment_date, total_amount, payment_method, reference_number, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const resPay = stmtPay.run(
          companyId, branchId, customer_id, activeSession ? activeSession.id : null, userId,
          paymentNumber, paymentDate, total_amount, payment_method, reference_number || null, notes || null
        );
        const pId = resPay.lastInsertRowid;

        // 2. Process allocations
        let remainingToApply = Number(total_amount);

        // If no explicit allocations provided, auto-apply FIFO to oldest pending invoices
        let targetAllocations = allocations;
        if (!targetAllocations || targetAllocations.length === 0) {
          const pendingInvoices = db.prepare(`
            SELECT id, balance FROM accounts_receivable
            WHERE customer_id = ? AND status != 'paid'
            ORDER BY due_date ASC
          `).all(customer_id);

          targetAllocations = [];
          for (const inv of pendingInvoices) {
            if (remainingToApply <= 0) break;
            const apply = Math.min(Number(inv.balance), remainingToApply);
            targetAllocations.push({ receivable_id: inv.id, amount_applied: apply });
            remainingToApply -= apply;
          }
        }

        const stmtAlloc = db.prepare(`
          INSERT INTO payment_allocations (payment_id, receivable_id, amount_applied)
          VALUES (?, ?, ?)
        `);

        for (const alloc of targetAllocations) {
          const applied = Number(alloc.amount_applied);
          if (applied <= 0) continue;

          stmtAlloc.run(pId, alloc.receivable_id, applied);

          // Update receivable balance
          const ar = db.prepare('SELECT balance FROM accounts_receivable WHERE id = ?').get(alloc.receivable_id);
          const newBal = Math.max(0, Number(ar.balance) - applied);
          const newStatus = newBal === 0 ? 'paid' : 'partial';

          db.prepare(`
            UPDATE accounts_receivable
            SET balance = ?, status = ?
            WHERE id = ?
          `).run(newBal, newStatus, alloc.receivable_id);
        }

        // 3. Deduct customer balance
        db.prepare('UPDATE customers SET current_balance = MAX(0, current_balance - ?) WHERE id = ?').run(total_amount, customer_id);

        // 4. If cash, record cash movement
        if (payment_method === 'cash' && activeSession) {
          db.prepare(`
            INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
            VALUES (?, ?, 'cxc_payment', ?, ?, 'receivable_payments', ?)
          `).run(activeSession.id, userId, total_amount, `Cobro CxC Recibo #${paymentNumber}`, pId);
        }

        logAudit({
          companyId,
          userId,
          ipAddress: req.ip,
          module: 'finance',
          action: 'cxc_payment',
          recordId: pId,
          newValues: { payment_number: paymentNumber, total_amount, payment_method },
          description: `Cobro a cliente registrado ${paymentNumber} por RD$ ${Number(total_amount).toFixed(2)}`
        });

        return pId;
      });

      return res.status(201).json({ success: true, message: 'Pago registrado exitosamente.', payment_id: paymentId, payment_number: paymentNumber });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // ACCOUNTS PAYABLE (CxP)
  getPayables: (req, res) => {
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

      const payables = db.prepare(`
        SELECT ap.*,
               s.company_name as supplier_name, s.phone as supplier_phone, s.tax_id as supplier_tax_id,
               b.name as branch_name,
               CAST((julianday('now') - julianday(ap.due_date)) AS INTEGER) as days_overdue
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
  paySupplier: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const userId = req.user.id;
      const { payable_id, amount, payment_method = 'transfer', reference_number, notes } = req.body;

      if (!payable_id || !amount || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Cuenta por pagar y monto requeridos.' });
      }

      const payable = db.prepare('SELECT * FROM accounts_payable WHERE id = ? AND company_id = ?').get(payable_id, companyId);
      if (!payable) return res.status(404).json({ success: false, message: 'Cuenta por pagar no encontrada.' });

      const amt = Number(amount);
      if (amt > Number(payable.balance)) {
        return res.status(400).json({ success: false, message: `El monto excede el saldo pendiente (${payable.balance}).` });
      }

      runTransaction(() => {
        const paymentDate = new Date().toISOString().split('T')[0];

        db.prepare(`
          INSERT INTO payable_payments (payable_id, company_id, user_id, payment_date, amount, payment_method, reference_number, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(payable_id, companyId, userId, paymentDate, amt, payment_method, reference_number || null, notes || null);

        const newBal = Number(payable.balance) - amt;
        const newStatus = newBal <= 0.01 ? 'paid' : 'partial';

        db.prepare(`
          UPDATE accounts_payable
          SET balance = ?, status = ?
          WHERE id = ?
        `).run(newBal, newStatus, payable_id);

        // Update supplier balance
        db.prepare('UPDATE suppliers SET current_balance = MAX(0, current_balance - ?) WHERE id = ?').run(amt, payable.supplier_id);

        logAudit({
          companyId,
          userId,
          ipAddress: req.ip,
          module: 'finance',
          action: 'cxp_payment',
          recordId: payable_id,
          newValues: { amount: amt, payment_method },
          description: `Pago a proveedor por RD$ ${amt.toFixed(2)} a documento ${payable.document_number}`
        });
      });

      return res.json({ success: true, message: 'Pago a proveedor aplicado exitosamente.' });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  // EXPENSES
  getExpenses: (req, res) => {
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

      const expenses = db.prepare(`
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

  createExpense: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const branchId = req.user.branch_id;
      const userId = req.user.id;

      const { category_id, amount, payment_method = 'cash', beneficiary, voucher_number, notes } = req.body;

      if (!category_id || !amount) {
        return res.status(400).json({ success: false, message: 'Categoría y monto son obligatorios.' });
      }

      let activeSession = null;
      if (payment_method === 'cash') {
        activeSession = db.prepare('SELECT id FROM cash_sessions WHERE user_id = ? AND branch_id = ? AND status = "open"').get(userId, branchId);
      }

      const expenseDate = new Date().toISOString().split('T')[0];

      runTransaction(() => {
        const stmt = db.prepare(`
          INSERT INTO expenses (
            company_id, branch_id, category_id, user_id, cash_session_id,
            amount, payment_method, beneficiary, voucher_number, notes, expense_date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const resExp = stmt.run(
          companyId, branchId, category_id, userId, activeSession ? activeSession.id : null,
          amount, payment_method, beneficiary || null, voucher_number || null, notes || null, expenseDate
        );
        const expId = resExp.lastInsertRowid;

        // If cash, deduct from active session
        if (payment_method === 'cash' && activeSession) {
          db.prepare(`
            INSERT INTO cash_movements (cash_session_id, user_id, type, amount, reason, reference_type, reference_id)
            VALUES (?, ?, 'expense', ?, ?, 'expenses', ?)
          `).run(activeSession.id, userId, amount, `Gasto: ${notes || beneficiary || 'Salida de caja'}`, expId);
        }

        logAudit({
          companyId,
          userId,
          ipAddress: req.ip,
          module: 'finance',
          action: 'create_expense',
          recordId: expId,
          newValues: { category_id, amount, payment_method },
          description: `Gasto registrado por RD$ ${Number(amount).toFixed(2)}`
        });
      });

      return res.status(201).json({ success: true, message: 'Gasto registrado exitosamente.' });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  },

  getExpenseCategories: (req, res) => {
    try {
      const categories = db.prepare('SELECT * FROM expense_categories WHERE company_id = ? ORDER BY name ASC').all(req.user.company_id);
      return res.json({ success: true, data: categories });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // CXC AGING TABLE (Antigüedad de saldos agrupada por cliente con drill-down)
  getCxCAgingTable: (req, res) => {
    try {
      const companyId = req.user.company_id;

      const customersWithBalances = db.prepare(`
        SELECT c.id as customer_id, c.code, c.company_name, c.first_name, c.last_name, c.phone,
               sp.name as salesperson_name,
               sp.code as salesperson_code,
               ar.id as receivable_id, ar.invoice_number, ar.ncf, ar.issue_date, ar.due_date, ar.amount, ar.balance,
               CAST((julianday('now') - julianday(ar.due_date)) AS INTEGER) as days_overdue
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
          rows,
          totals
        }
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  // RECURRING EXPENSES (PAGOS FIJOS)
  getRecurringExpenses: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const recurring = db.prepare(`
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

  createRecurringExpense: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { concept, estimated_amount, frequency, due_day, next_due_date, responsible_person, category_id, alert_days_before } = req.body;

      if (!concept || !estimated_amount || !next_due_date) {
        return res.status(400).json({ success: false, message: 'Concepto, monto y próxima fecha son obligatorios.' });
      }

      const stmt = db.prepare(`
        INSERT INTO recurring_expenses (company_id, category_id, concept, estimated_amount, frequency, due_day, next_due_date, responsible_person, alert_days_before, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `);
      const r = stmt.run(companyId, category_id || null, concept, estimated_amount, frequency || 'monthly', due_day || 15, next_due_date, responsible_person || null, alert_days_before || 7);

      return res.status(201).json({ success: true, message: 'Obligación recurrente configurada.', id: r.lastInsertRowid });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  },

  updateRecurringExpense: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { concept, estimated_amount, frequency, due_day, next_due_date, responsible_person, category_id, alert_days_before, status } = req.body;

      db.prepare(`
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

  payRecurringExpense: (req, res) => {
    try {
      const companyId = req.user.company_id;
      const { id } = req.params;
      const { payment_method = 'transfer', voucher_number, notes } = req.body;

      const recurring = db.prepare(`SELECT * FROM recurring_expenses WHERE id = ? AND company_id = ?`).get(id, companyId);
      if (!recurring) return res.status(404).json({ success: false, message: 'Obligación no encontrada.' });

      const today = new Date().toISOString().split('T')[0];

      // Calculate next due date (add 1 month)
      const curDue = new Date(recurring.next_due_date);
      curDue.setMonth(curDue.getMonth() + 1);
      const nextDueStr = curDue.toISOString().split('T')[0];

      runTransaction(() => {
        // Register in expenses
        db.prepare(`
          INSERT INTO expenses (company_id, category_id, user_id, amount, payment_method, beneficiary, voucher_number, notes, expense_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(companyId, recurring.category_id, req.user.id, recurring.estimated_amount, payment_method, recurring.responsible_person, voucher_number || null, notes || `Pago recurrente: ${recurring.concept}`, today);

        // Update recurring obligation
        db.prepare(`
          UPDATE recurring_expenses
          SET last_paid_date = ?, next_due_date = ?, status = 'pending'
          WHERE id = ?
        `).run(today, nextDueStr, id);
      });

      return res.json({ success: true, message: 'Pago de obligación registrado y siguiente vencimiento agendado.', next_due_date: nextDueStr });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = financeController;

