const assert = require('assert');
const { db } = require('../src/database/db');
const thirdPartiesController = require('../src/modules/thirdParties/thirdPartiesController');

console.log('--- STARTING UNIFIED CREDIT CHECK COMPREHENSIVE TESTS ---');

async function testCreditCheck() {
  try {
    const company = await db.prepare('SELECT * FROM companies LIMIT 1').get();
    assert(company, 'Company must exist');

    const sp = await db.prepare('SELECT id FROM salespeople WHERE company_id = ? LIMIT 1').get(company.id);
    assert(sp, 'Salesperson must exist');

    // 1. Setup a test customer
    let testCust = await db.prepare("SELECT * FROM customers WHERE company_id = ? AND code = 'CUST-TEST-CREDIT'").get(company.id);
    if (!testCust) {
      const res = await db.prepare(`
        INSERT INTO customers (
          company_id, salesperson_id, code, company_name, id_card, credit_limit, current_balance,
          is_credit_blocked, requires_special_auth, allow_sales_with_overdue_invoices, status
        ) VALUES (?, ?, 'CUST-TEST-CREDIT', 'Cliente Test Crédito', '001-9999999-1', 10000.00, 2000.00, 0, 0, 1, 'active')
      `).run(company.id, sp.id);
      testCust = await db.prepare('SELECT * FROM customers WHERE id = ?').get(res.lastInsertRowid);
    } else {
      await db.prepare(`
        UPDATE customers
        SET credit_limit = 10000.00, current_balance = 2000.00, is_credit_blocked = 0,
            requires_special_auth = 0, allow_sales_with_overdue_invoices = 1, status = 'active'
        WHERE id = ?
      `).run(testCust.id);
    }

    // Clean any overdue AR for this test customer
    await db.prepare('DELETE FROM accounts_receivable WHERE customer_id = ?').run(testCust.id);

    // CASE 1: Normal credit sale within available limit (Limit: 10000, Balance: 2000, Available: 8000, Amount: 3000)
    console.log('Case 1: Sale within available credit limit...');
    const res1 = await thirdPartiesController.evaluateCustomerCredit({
      customerId: testCust.id,
      companyId: company.id,
      amount: 3000.00
    });
    assert.strictEqual(res1.eligible, true);
    assert.strictEqual(res1.needs_supervisor_auth, false);
    assert.strictEqual(res1.available_credit, 8000.00);
    console.log('  Case 1 Passed [OK]');

    // CASE 2: Amount exceeds available credit (Amount: 9000 > Available 8000)
    console.log('Case 2: Amount exceeds available credit...');
    const res2 = await thirdPartiesController.evaluateCustomerCredit({
      customerId: testCust.id,
      companyId: company.id,
      amount: 9000.00
    });
    assert.strictEqual(res2.eligible, false);
    assert.strictEqual(res2.needs_supervisor_auth, true);
    assert.ok(res2.reason.includes('supera el crédito disponible'), `Reason must mention limit exceeded. Got: ${res2.reason}`);
    console.log(`  Case 2 Passed: ${res2.reason} [OK]`);

    // CASE 3: Administratively blocked credit (is_credit_blocked = 1)
    console.log('Case 3: Administratively blocked customer...');
    await db.prepare('UPDATE customers SET is_credit_blocked = 1 WHERE id = ?').run(testCust.id);
    const res3 = await thirdPartiesController.evaluateCustomerCredit({
      customerId: testCust.id,
      companyId: company.id,
      amount: 100.00
    });
    assert.strictEqual(res3.eligible, false);
    assert.strictEqual(res3.needs_supervisor_auth, true);
    assert.ok(res3.reason.includes('bloqueado por administración'), `Reason must mention admin block. Got: ${res3.reason}`);
    console.log(`  Case 3 Passed: ${res3.reason} [OK]`);
    await db.prepare('UPDATE customers SET is_credit_blocked = 0 WHERE id = ?').run(testCust.id);

    // CASE 4: Overdue invoices with allow_sales_with_overdue_invoices = 0
    console.log('Case 4: Customer with overdue invoices blocked...');
    await db.prepare('UPDATE customers SET allow_sales_with_overdue_invoices = 0 WHERE id = ?').run(testCust.id);
    // Insert overdue invoice
    await db.prepare(`
      INSERT INTO accounts_receivable (
        company_id, branch_id, customer_id, invoice_number, ncf, issue_date, due_date, amount, balance, status
      ) VALUES (?, 1, ?, 'FAC-TEST-OVERDUE', 'B0100000099', '2026-01-01', '2026-02-01', 1500, 1500, 'overdue')
    `).run(company.id, testCust.id);

    const res4 = await thirdPartiesController.evaluateCustomerCredit({
      customerId: testCust.id,
      companyId: company.id,
      amount: 500.00
    });
    assert.strictEqual(res4.eligible, false);
    assert.strictEqual(res4.needs_supervisor_auth, true);
    assert.ok(res4.reason.includes('factura(s) vencida(s)'), `Reason must mention overdue invoices. Got: ${res4.reason}`);
    console.log(`  Case 4 Passed: ${res4.reason} [OK]`);

    // CASE 5: Requires special auth
    console.log('Case 5: Customer with requires_special_auth = 1...');
    await db.prepare('DELETE FROM accounts_receivable WHERE customer_id = ?').run(testCust.id);
    await db.prepare('UPDATE customers SET requires_special_auth = 1, allow_sales_with_overdue_invoices = 1 WHERE id = ?').run(testCust.id);
    const res5 = await thirdPartiesController.evaluateCustomerCredit({
      customerId: testCust.id,
      companyId: company.id,
      amount: 500.00
    });
    assert.strictEqual(res5.eligible, false);
    assert.strictEqual(res5.needs_supervisor_auth, true);
    assert.ok(res5.reason.includes('perfil de riesgo'), `Reason must mention risk profile. Got: ${res5.reason}`);
    console.log(`  Case 5 Passed: ${res5.reason} [OK]`);

    // CASE 6: Inactive customer
    console.log('Case 6: Inactive customer...');
    await db.prepare("UPDATE customers SET status = 'inactive' WHERE id = ?").run(testCust.id);
    const res6 = await thirdPartiesController.evaluateCustomerCredit({
      customerId: testCust.id,
      companyId: company.id,
      amount: 500.00
    });
    assert.strictEqual(res6.eligible, false);
    assert.strictEqual(res6.blocked, true);
    assert.ok(res6.reason.includes('INACTIVO'), `Reason must mention inactive. Got: ${res6.reason}`);
    console.log(`  Case 6 Passed: ${res6.reason} [OK]`);

    // Clean up test customer
    await db.prepare('DELETE FROM accounts_receivable WHERE customer_id = ?').run(testCust.id);
    await db.prepare('DELETE FROM customers WHERE id = ?').run(testCust.id);

    console.log('=============================================');
    console.log(' ALL CREDIT CHECK SCENARIOS PASSED CLEANLY!  ');
    console.log('=============================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Credit check test failed:', err);
    process.exit(1);
  }
}

testCreditCheck();
