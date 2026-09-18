const assert = require('assert');
const { db } = require('../src/database/db');

console.log('--- STARTING SALESPEOPLE MULTI-TENANT CONSTRAINT TEST ---');

async function testSalespeopleMultiTenant() {
  try {
    const comp1 = await db.prepare('SELECT * FROM companies LIMIT 1').get();
    assert(comp1, 'Company 1 must exist');

    // Create or find Company 2
    let comp2 = await db.prepare("SELECT * FROM companies WHERE tax_id = '999-TEST-TENANT'").get();
    if (!comp2) {
      const res = await db.prepare(`
        INSERT INTO companies (name, legal_name, tax_id, phone, email, currency)
        VALUES ('Empresa Test 2', 'Empresa Test 2 SRL', '999-TEST-TENANT', '809-000-0000', 'test2@erp.do', 'DOP')
      `).run();
      comp2 = await db.prepare('SELECT * FROM companies WHERE id = ?').get(res.lastInsertRowid);
    }

    // Clean any previous test salespeople
    await db.prepare("DELETE FROM salespeople WHERE code = 'VEND-MULTI-99'").run();

    // 1. Insert VEND-MULTI-99 in Company 1
    console.log('Inserting VEND-MULTI-99 in Company 1...');
    const sp1 = await db.prepare(`
      INSERT INTO salespeople (company_id, code, name, commission_rate, commission_calculation_type)
      VALUES (?, 'VEND-MULTI-99', 'Vendedor Company 1', 5.00, 'invoiced')
    `).run(comp1.id);
    assert.ok(sp1.lastInsertRowid, 'Salesperson in Company 1 must be created');
    console.log('  Created in Company 1 with ID:', sp1.lastInsertRowid);

    // 2. Attempt duplicate in SAME Company 1 -> MUST FAIL
    console.log('Attempting duplicate code in Company 1 (Must fail)...');
    let duplicateFailed = false;
    try {
      await db.prepare(`
        INSERT INTO salespeople (company_id, code, name, commission_rate, commission_calculation_type)
        VALUES (?, 'VEND-MULTI-99', 'Duplicado Company 1', 5.00, 'invoiced')
      `).run(comp1.id);
    } catch (err) {
      duplicateFailed = true;
      console.log('  Duplicate correctly rejected by DB constraint:', err.message);
    }
    assert.strictEqual(duplicateFailed, true, 'Duplicate code in same company must be rejected');

    // 3. Insert SAME code VEND-MULTI-99 in Company 2 -> MUST SUCCEED (Multi-tenant)
    console.log('Inserting SAME code VEND-MULTI-99 in Company 2 (Must succeed)...');
    const sp2 = await db.prepare(`
      INSERT INTO salespeople (company_id, code, name, commission_rate, commission_calculation_type)
      VALUES (?, 'VEND-MULTI-99', 'Vendedor Company 2', 7.50, 'collected')
    `).run(comp2.id);
    assert.ok(sp2.lastInsertRowid, 'Salesperson in Company 2 with same code must be created cleanly');
    console.log('  Successfully created in Company 2 with ID:', sp2.lastInsertRowid);

    // Clean up test data
    await db.prepare("DELETE FROM salespeople WHERE code = 'VEND-MULTI-99'").run();
    await db.prepare("DELETE FROM companies WHERE tax_id = '999-TEST-TENANT'").run();

    console.log('=============================================');
    console.log(' MULTI-TENANT SALESPEOPLE TEST PASSED!       ');
    console.log('=============================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Multi-tenant test failed:', err);
    process.exit(1);
  }
}

testSalespeopleMultiTenant();
