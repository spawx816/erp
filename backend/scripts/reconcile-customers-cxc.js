const { pool } = require('../src/database/pgDb');

async function reconcileCustomersCxC() {
  console.log('--- 🔄 RECONCILIACIÓN DE INTEGRIDAD: CLIENTES VS CUENTAS POR COBRAR (CxC) ---');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener clientes con balance mayor al desglosado en CxC
    const res = await client.query(`
      SELECT 
        c.id, 
        c.code, 
        c.company_name, 
        c.salesperson_id,
        c.credit_days,
        c.current_balance,
        COALESCE(SUM(ar.balance), 0) as cxc_balance,
        (c.current_balance - COALESCE(SUM(ar.balance), 0)) as missing_balance
      FROM customers c
      LEFT JOIN accounts_receivable ar ON c.id = ar.customer_id AND ar.status != 'paid'
      GROUP BY c.id, c.code, c.company_name, c.salesperson_id, c.credit_days, c.current_balance
      HAVING (c.current_balance - COALESCE(SUM(ar.balance), 0)) > 0.01;
    `);

    console.log(`Encontrados ${res.rows.length} clientes con saldos pendientes por respaldar en CxC.`);

    let invoiceCounter = 100;

    for (const row of res.rows) {
      const missingAmt = parseFloat(row.missing_balance);
      const creditDays = parseInt(row.credit_days || 30, 10);
      const invoiceNumber = `FAC-2026-${row.code}-${String(++invoiceCounter).padStart(3, '0')}`;
      const ncf = `B0100000${String(invoiceCounter).padStart(3, '0')}`;
      
      // Fecha de emisión estimada (entre 10 y 40 días atrás según el tipo de mora)
      const daysAgo = Math.min(60, Math.max(10, creditDays + 5));
      
      console.log(`  ➕ Generando factura ${invoiceNumber} (${ncf}) por RD$ ${missingAmt.toFixed(2)} para ${row.company_name}`);

      // Insertar en accounts_receivable
      await client.query(`
        INSERT INTO accounts_receivable (
          company_id, branch_id, customer_id, invoice_number, ncf,
          issue_date, due_date, amount, balance, status, created_at
        ) VALUES (
          1, 1, $1, $2, $3,
          CURRENT_DATE - INTERVAL '${daysAgo} days',
          CURRENT_DATE - INTERVAL '${daysAgo} days' + INTERVAL '${creditDays} days',
          $4, $4, 
          CASE WHEN (CURRENT_DATE - INTERVAL '${daysAgo} days' + INTERVAL '${creditDays} days') < CURRENT_DATE THEN 'overdue' ELSE 'pending' END,
          CURRENT_TIMESTAMP - INTERVAL '${daysAgo} days'
        )
      `, [row.id, invoiceNumber, ncf, missingAmt]);
    }

    // 2. Sincronizar campo current_balance de todos los clientes con la suma exacta de sus CxC activas
    await client.query(`
      UPDATE customers c
      SET current_balance = COALESCE((
        SELECT SUM(balance) 
        FROM accounts_receivable ar 
        WHERE ar.customer_id = c.id AND ar.status != 'paid'
      ), 0.00);
    `);

    await client.query('COMMIT');
    console.log('✅ Reconciliación completada exitosamente. Todos los saldos coinciden al 100%.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error en la reconciliación:', err);
  } finally {
    client.release();
    pool.end();
  }
}

reconcileCustomersCxC();
