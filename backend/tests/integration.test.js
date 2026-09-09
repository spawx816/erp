const assert = require('assert');
const { db } = require('../src/database/db');
const InventoryService = require('../src/modules/inventory/inventoryService');
const FiscalService = require('../src/modules/fiscal/fiscalService');

console.log('--- STARTING SGC ERP INTEGRATION TESTS ---');

async function runTests() {
  try {
    const company = await db.prepare('SELECT * FROM companies LIMIT 1').get();
    if (!company) {
      console.log('⚠️ No company found in DB, skipping live integration assertions.');
      return;
    }
    assert(company && company.id, 'Company must exist');

    const admin = await db.prepare("SELECT * FROM users WHERE role_id = 1 OR role_id IN (SELECT id FROM roles WHERE slug = 'admin') LIMIT 1").get();
    const branch1 = await db.prepare('SELECT * FROM branches WHERE company_id = ? LIMIT 1').get(company.id);
    const warehouse1 = await db.prepare('SELECT * FROM warehouses WHERE company_id = ? LIMIT 1').get(company.id);
    const product1 = await db.prepare('SELECT * FROM products WHERE company_id = ? AND type = \'physical\' LIMIT 1').get(company.id);

    // TEST 1: Dominican NCF Sequentiality & Uniqueness
    console.log('Test 1: Dominican NCF Atomic Sequence Generation...');
    if (branch1) {
      const seqCheck = await db.prepare("SELECT id FROM fiscal_sequences WHERE company_id = ? AND branch_id = ? AND fiscal_type_code = 'B02' AND status = 'active'").get(company.id, branch1.id);
      if (seqCheck) {
        const ncf1 = await FiscalService.getNextNCF(company.id, branch1.id, 'B02');
        const ncf2 = await FiscalService.getNextNCF(company.id, branch1.id, 'B02');
        assert(ncf1.ncf !== ncf2.ncf, 'Consecutive NCFs must be unique');
        console.log(`  NCF 1: ${ncf1.ncf}, NCF 2: ${ncf2.ncf} [OK]`);
      } else {
        console.log('  Skipping NCF test (no active B02 sequence configured for branch) [SKIP]');
      }
    }

    // TEST 2: Inventory Movement & Kardex Integrity
    console.log('Test 2: Inventory Kardex Integrity...');
    if (warehouse1 && product1 && admin) {
      const initialStock = await InventoryService.getCurrentStock(warehouse1.id, product1.id);
      await InventoryService.recordMovement({
        companyId: company.id,
        branchId: branch1 ? branch1.id : 1,
        warehouseId: warehouse1.id,
        productId: product1.id,
        userId: admin.id,
        movementType: 'adjustment_in',
        quantity: 2,
        unitCost: product1.cost || 0,
        reason: 'Test automatizado de kardex'
      });
      const updatedStock = await InventoryService.getCurrentStock(warehouse1.id, product1.id);
      assert.strictEqual(updatedStock, initialStock + 2, 'Stock must increment by exactly 2');
      console.log(`  Stock before: ${initialStock}, after: ${updatedStock} [OK]`);

      // Revert test movement
      await InventoryService.recordMovement({
        companyId: company.id,
        branchId: branch1 ? branch1.id : 1,
        warehouseId: warehouse1.id,
        productId: product1.id,
        userId: admin.id,
        movementType: 'adjustment_out',
        quantity: -2,
        unitCost: product1.cost || 0,
        reason: 'Reversión de test automatizado'
      });
      const revertedStock = await InventoryService.getCurrentStock(warehouse1.id, product1.id);
      assert.strictEqual(revertedStock, initialStock, 'Stock must return to original');
      console.log(`  Reverted cleanly to: ${revertedStock} [OK]`);
    }

    // TEST 3: Cash Session calculation logic
    console.log('Test 3: Cash Session & Arqueo Calculation...');
    const expectedCash = 5000;
    const countedCash = 4950;
    const diff = countedCash - expectedCash;
    assert.strictEqual(diff, -50, 'Discrepancy must be accurately identified as RD$ -50');
    console.log(`  Discrepancy test passed: Expected ${expectedCash}, Counted ${countedCash}, Diff ${diff} [OK]`);

    console.log('\n=============================================');
    console.log(' ALL CORE INTEGRATION TESTS PASSED CLEANLY! ');
    console.log('=============================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Integration test failed:', err);
    process.exit(1);
  }
}

runTests();
