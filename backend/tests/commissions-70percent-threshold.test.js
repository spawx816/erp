const assert = require('assert');
const { pool } = require('../src/database/pgDb');
const { db } = require('../src/database/db');
const salesController = require('../src/modules/sales/salesController');

async function runTest() {
  console.log('--- RUNNING COMMISSIONS 70% THRESHOLD TEST ---');

  const testMonth = '2026-09';
  const companyId = 1;

  // 1. Create 2 test salespeople:
  // - Seller A: Goal 100,000. Collects 50,000 (50% -> does NOT qualify -> Commission 0)
  // - Seller B: Goal 100,000. Collects 80,000 (80% -> QUALIFIES -> Commission 80,000 * 5% = 4,000)
  const codeA = 'TEST-SP-A-' + Date.now();
  const codeB = 'TEST-SP-B-' + Date.now();

  const spA = await db.prepare(`
    INSERT INTO salespeople (company_id, code, name, monthly_goal, commission_rate, status)
    VALUES (?, ?, 'Vendedor Prueba A (50%)', 100000.00, 5.00, 'active')
    RETURNING id
  `).run(companyId, codeA);

  const spB = await db.prepare(`
    INSERT INTO salespeople (company_id, code, name, monthly_goal, commission_rate, status)
    VALUES (?, ?, 'Vendedor Prueba B (80%)', 100000.00, 5.00, 'active')
    RETURNING id
  `).run(companyId, codeB);

  const spAId = spA.lastInsertRowid;
  const spBId = spB.lastInsertRowid;

  // Insert sales for A (50,000 cash paid)
  await db.prepare(`
    INSERT INTO sales (company_id, branch_id, warehouse_id, customer_id, salesperson_id, user_id, sale_number, subtotal, tax_amount, total, amount_paid, status, sale_type, created_at)
    VALUES (?, 1, 1, 1, ?, 1, ?, 50000.00, 0.00, 50000.00, 50000.00, 'paid', 'cash', '2026-09-10 10:00:00')
  `).run(companyId, spAId, 'VTA-TEST-' + Date.now() + '-A');

  // Insert sales for B (80,000 cash paid)
  await db.prepare(`
    INSERT INTO sales (company_id, branch_id, warehouse_id, customer_id, salesperson_id, user_id, sale_number, subtotal, tax_amount, total, amount_paid, status, sale_type, created_at)
    VALUES (?, 1, 1, 1, ?, 1, ?, 80000.00, 0.00, 80000.00, 80000.00, 'paid', 'cash', '2026-09-10 10:00:00')
  `).run(companyId, spBId, 'VTA-TEST-' + Date.now() + '-B');

  // 2. Query monthly summary
  let summaryData = null;
  const reqSummary = {
    user: { company_id: companyId },
    query: { month: testMonth }
  };
  const resSummary = {
    json: (d) => { summaryData = d; },
    status: (code) => ({ json: (err) => console.error(code, err) })
  };

  await salesController.getMonthlyCommissionsSummary(reqSummary, resSummary);

  assert(summaryData && summaryData.success, 'Summary query must succeed');
  const summaryA = summaryData.data.find(s => s.salesperson_id === spAId);
  const summaryB = summaryData.data.find(s => s.salesperson_id === spBId);

  assert(summaryA, 'Seller A must be in summary');
  assert(summaryB, 'Seller B must be in summary');

  console.log(`Seller A: Cobrado: ${summaryA.total_collected}, Meta: ${summaryA.monthly_goal}, Cumplimiento: ${summaryA.compliance_percentage}%, Califica: ${summaryA.qualifies}, Comision: ${summaryA.commission_amount}`);
  assert.strictEqual(summaryA.qualifies, false, 'Seller A at 50% must NOT qualify (< 70%)');
  assert.strictEqual(summaryA.commission_amount, 0, 'Seller A must have 0 commission');
  assert.strictEqual(summaryA.amount_to_threshold, 20000, 'Seller A needs 20,000 to reach 70% threshold');

  console.log(`Seller B: Cobrado: ${summaryB.total_collected}, Meta: ${summaryB.monthly_goal}, Cumplimiento: ${summaryB.compliance_percentage}%, Califica: ${summaryB.qualifies}, Comision: ${summaryB.commission_amount}`);
  assert.strictEqual(summaryB.qualifies, true, 'Seller B at 80% MUST qualify (>= 70%)');
  assert.strictEqual(summaryB.commission_amount, 4000, 'Seller B commission must be 80,000 * 5% = 4,000');

  // 3. Test payMonthlyCommissions on Unqualified Seller A (must fail)
  let failResponse = null;
  let failCode = 200;
  const reqPayA = {
    user: { company_id: companyId },
    body: { salesperson_ids: [spAId], month: testMonth }
  };
  const resPayA = {
    status: (c) => { failCode = c; return { json: (d) => { failResponse = d; } }; },
    json: (d) => { failResponse = d; }
  };

  await salesController.payMonthlyCommissions(reqPayA, resPayA);
  assert.strictEqual(failCode, 400, 'Attempting to pay commission to unqualified seller must return 400');
  console.log('Unqualified seller payment rejected correctly:', failResponse.message);

  // 4. Test payMonthlyCommissions on Qualified Seller B (must succeed)
  let successResponse = null;
  const reqPayB = {
    user: { company_id: companyId },
    body: { salesperson_ids: [spBId], month: testMonth, payment_method: 'transfer' }
  };
  const resPayB = {
    status: (c) => ({ json: (d) => { successResponse = d; } }),
    json: (d) => { successResponse = d; }
  };

  await salesController.payMonthlyCommissions(reqPayB, resPayB);
  assert(successResponse && successResponse.success, 'Payment for qualified seller must succeed');
  assert.strictEqual(successResponse.data.total_paid, 4000, 'Total paid must be 4000');
  console.log('Qualified seller paid correctly:', successResponse.message);

  // Cleanup test records
  await db.prepare('DELETE FROM sales WHERE salesperson_id IN (?, ?)').run(spAId, spBId);
  await db.prepare('DELETE FROM commissions WHERE salesperson_id IN (?, ?)').run(spAId, spBId);
  await db.prepare('DELETE FROM salespeople WHERE id IN (?, ?)').run(spAId, spBId);

  console.log('✅ ALL COMMISSIONS 70% THRESHOLD TESTS PASSED CLEANLY!');
  await pool.end();
}

runTest().catch(err => {
  console.error('❌ Test failed:', err);
  pool.end();
  process.exit(1);
});
