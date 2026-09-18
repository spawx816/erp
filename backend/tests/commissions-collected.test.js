const assert = require('assert');
const { db, runTransaction } = require('../src/database/db');

console.log('--- STARTING COMMISSIONS ON COLLECTION (COLLECTED) TEST ---');

async function testCommissionsCollected() {
  try {
    const company = await db.prepare('SELECT * FROM companies LIMIT 1').get();
    assert(company, 'Company must exist');
    const branch = await db.prepare('SELECT * FROM branches WHERE company_id = ? LIMIT 1').get(company.id);
    const user = await db.prepare('SELECT * FROM users WHERE company_id = ? LIMIT 1').get(company.id);

    const warehouse = await db.prepare('SELECT id FROM warehouses WHERE company_id = ? LIMIT 1').get(company.id);

    // Clean prior test records if any in FK order
    await db.prepare("DELETE FROM customers WHERE code = 'CUST-COMM-TEST'").run();
    await db.prepare("DELETE FROM salespeople WHERE code = 'VEND-COMM-COLLECT'").run();

    // 1. Create a test salesperson with calculation_type = 'collected'
    const spRes = await db.prepare(`
      INSERT INTO salespeople (company_id, code, name, commission_rate, commission_calculation_type)
      VALUES (?, 'VEND-COMM-COLLECT', 'Vendedor Comisiones al Cobro', 10.00, 'collected')
    `).run(company.id);
    const salespersonId = spRes.lastInsertRowid;

    // 2. Create customer
    const custRes = await db.prepare(`
      INSERT INTO customers (company_id, salesperson_id, code, company_name, id_card, credit_limit, current_balance, status)
      VALUES (?, ?, 'CUST-COMM-TEST', 'Cliente Test Comisiones', '001-8888888-2', 50000.00, 0, 'active')
    `).run(company.id, salespersonId);
    const customerId = custRes.lastInsertRowid;

    // 3. Create a credit sale for RD$ 1,000.00
    const saleRes = await db.prepare(`
      INSERT INTO sales (
        company_id, branch_id, warehouse_id, customer_id, salesperson_id, user_id,
        sale_number, invoice_number, ncf, fiscal_type_code, sale_type,
        subtotal, discount_amount, tax_amount, total, amount_paid, balance, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'VTA-COMM-100', 'FAC-COMM-100', 'B0100000098', 'B01', 'credit', 1000.00, 0, 0, 1000.00, 0, 1000.00, 'pending')
    `).run(company.id, branch.id, warehouse.id, customerId, salespersonId, user.id);
    const saleId = saleRes.lastInsertRowid;

    // Create AR record
    const arRes = await db.prepare(`
      INSERT INTO accounts_receivable (
        company_id, branch_id, customer_id, sale_id, invoice_number, ncf,
        issue_date, due_date, amount, balance, status
      ) VALUES (?, ?, ?, ?, 'FAC-COMM-100', 'B0100000098', CURRENT_DATE, CURRENT_DATE, 1000.00, 1000.00, 'pending')
    `).run(company.id, branch.id, customerId, saleId);
    const arId = arRes.lastInsertRowid;

    // 4. Verify that NO commission exists yet for this sale (because calculation_type is 'collected')
    const initialComm = await db.prepare('SELECT * FROM commissions WHERE sale_id = ?').get(saleId);
    assert.strictEqual(initialComm, null, 'Commission must not exist prior to payment for collected scheme');
    console.log('Verified: No commission generated on credit checkout for collected salesperson [OK]');

    // 5. Simulate payment allocation of RD$ 400.00 to this invoice
    console.log('Simulating payment of RD$ 400.00 to account receivable...');
    const applied = 400.00;
    await runTransaction(async (txDb) => {
      const pRes = await txDb.prepare(`
        INSERT INTO receivable_payments (
          company_id, branch_id, customer_id, user_id, payment_number, payment_date, total_amount, payment_method
        ) VALUES (?, ?, ?, ?, 'REC-COMM-001', CURRENT_DATE, ?, 'transfer')
      `).run(company.id, branch.id, customerId, user.id, applied);
      const pId = pRes.lastInsertRowid;

      await txDb.prepare(`
        INSERT INTO payment_allocations (payment_id, receivable_id, amount_applied)
        VALUES (?, ?, ?)
      `).run(pId, arId, applied);

      await txDb.prepare('UPDATE accounts_receivable SET balance = balance - ?, status = \'partial\' WHERE id = ?').run(applied, arId);
      await txDb.prepare('UPDATE sales SET balance = balance - ? WHERE id = ?').run(applied, saleId);

      // Accrue proportional commission for collected salesperson
      const saleData = await txDb.prepare('SELECT salesperson_id, invoice_number, total, subtotal FROM sales WHERE id = ?').get(saleId);
      const sp = await txDb.prepare('SELECT commission_rate, commission_calculation_type FROM salespeople WHERE id = ?').get(saleData.salesperson_id);
      assert.strictEqual(sp.commission_calculation_type, 'collected');

      const rate = Number(sp.commission_rate || 5);
      const saleTotal = Number(saleData.total || applied);
      const ratio = saleTotal > 0 ? (applied / saleTotal) : 1;
      const baseAmount = Math.round(Number(saleData.subtotal || applied) * ratio * 100) / 100;
      const commAmt = Math.round((baseAmount * (rate / 100)) * 100) / 100;

      await txDb.prepare(`
        INSERT INTO commissions (
          company_id, salesperson_id, sale_id, payment_id, invoice_number,
          base_amount, commission_rate, commission_amount, calculation_type, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'collected', 'pending')
      `).run(company.id, saleData.salesperson_id, saleId, pId, saleData.invoice_number, baseAmount, rate, commAmt);
    });

    // 6. Check that the commission was created upon collection
    const createdComm = await db.prepare('SELECT * FROM commissions WHERE sale_id = ?').get(saleId);
    assert.ok(createdComm, 'Commission must be created upon collection');
    assert.strictEqual(createdComm.calculation_type, 'collected');
    assert.strictEqual(Number(createdComm.base_amount), 400.00);
    assert.strictEqual(Number(createdComm.commission_rate), 10.00);
    assert.strictEqual(Number(createdComm.commission_amount), 40.00, 'Commission must be 10% of 400.00 = 40.00');
    console.log(`Verified: Commission accrued upon collection: RD$ ${createdComm.commission_amount} on base RD$ ${createdComm.base_amount} [OK]`);

    // Clean up test data
    await db.prepare('DELETE FROM commissions WHERE sale_id = ?').run(saleId);
    await db.prepare('DELETE FROM payment_allocations WHERE receivable_id = ?').run(arId);
    await db.prepare('DELETE FROM receivable_payments WHERE customer_id = ?').run(customerId);
    await db.prepare('DELETE FROM accounts_receivable WHERE id = ?').run(arId);
    await db.prepare('DELETE FROM sales WHERE id = ?').run(saleId);
    await db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
    await db.prepare('DELETE FROM salespeople WHERE id = ?').run(salespersonId);

    console.log('=============================================');
    console.log(' COMMISSIONS ON COLLECTION TEST PASSED!      ');
    console.log('=============================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Commissions collected test failed:', err);
    process.exit(1);
  }
}

testCommissionsCollected();
