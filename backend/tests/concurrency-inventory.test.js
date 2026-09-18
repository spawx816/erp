const assert = require('assert');
const { db } = require('../src/database/db');
const InventoryService = require('../src/modules/inventory/inventoryService');

console.log('--- STARTING CONCURRENCY INVENTORY STRESS TEST ---');

async function testConcurrency() {
  try {
    const company = await db.prepare('SELECT * FROM companies LIMIT 1').get();
    assert(company, 'Company must exist');
    const branch = await db.prepare('SELECT * FROM branches WHERE company_id = ? LIMIT 1').get(company.id);
    const warehouse = await db.prepare('SELECT * FROM warehouses WHERE company_id = ? LIMIT 1').get(company.id);
    const user = await db.prepare('SELECT * FROM users WHERE company_id = ? LIMIT 1').get(company.id);

    // Create or locate a test product
    let testProduct = await db.prepare("SELECT * FROM products WHERE company_id = ? AND sku = 'TEST-CONCURRENCY-SKU'").get(company.id);
    if (!testProduct) {
      const res = await db.prepare(`
        INSERT INTO products (company_id, name, type, cost, price, tax_rate, sku, status)
        VALUES (?, 'Test Concurrency Item', 'physical', 10.00, 25.00, 18.00, 'TEST-CONCURRENCY-SKU', 'active')
      `).run(company.id);
      testProduct = await db.prepare('SELECT * FROM products WHERE id = ?').get(res.lastInsertRowid);
    }

    // Set stock to exactly 1 in inventory
    const existing = await db.prepare('SELECT id FROM inventories WHERE warehouse_id = ? AND product_id = ? AND variant_id IS NULL').get(warehouse.id, testProduct.id);
    if (existing) {
      await db.prepare('UPDATE inventories SET quantity = 1, reserved_quantity = 0 WHERE id = ?').run(existing.id);
    } else {
      await db.prepare(`
        INSERT INTO inventories (company_id, branch_id, warehouse_id, product_id, variant_id, quantity, reserved_quantity)
        VALUES (?, ?, ?, ?, NULL, 1, 0)
      `).run(company.id, branch.id, warehouse.id, testProduct.id);
    }

    const initialStock = await InventoryService.getCurrentStock(warehouse.id, testProduct.id);
    assert.strictEqual(initialStock, 1, 'Initial test stock must be 1');
    console.log(`Initial stock configured to: ${initialStock}`);

    // Launch 5 concurrent deduction requests of quantity = -1
    console.log('Launching 5 parallel deduction requests (qty: -1)...');
    const promises = Array.from({ length: 5 }, (_, idx) => {
      return InventoryService.recordMovement({
        companyId: company.id,
        branchId: branch.id,
        warehouseId: warehouse.id,
        productId: testProduct.id,
        userId: user.id,
        movementType: 'sale',
        quantity: -1,
        unitCost: 10,
        reason: `Concurrencia request #${idx + 1}`
      });
    });

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    console.log(`Results: ${successful.length} successful, ${failed.length} rejected`);
    failed.forEach((f, i) => console.log(`  Rejection #${i + 1}: ${f.reason?.message}`));

    assert.strictEqual(successful.length, 1, `Exactly 1 request must succeed. Got: ${successful.length}`);
    assert.strictEqual(failed.length, 4, `Exactly 4 requests must be rejected. Got: ${failed.length}`);

    const finalStock = await InventoryService.getCurrentStock(warehouse.id, testProduct.id);
    assert.strictEqual(finalStock, 0, `Final stock must be exactly 0, got: ${finalStock}`);
    console.log(`Final stock verified at: ${finalStock} [OK]`);

    // Clean up test data
    await db.prepare('DELETE FROM inventory_movements WHERE product_id = ?').run(testProduct.id);
    await db.prepare('DELETE FROM inventories WHERE product_id = ?').run(testProduct.id);
    await db.prepare('DELETE FROM products WHERE id = ?').run(testProduct.id);

    console.log('=============================================');
    console.log(' CONCURRENCY TEST PASSED WITH ZERO OVER-SELL! ');
    console.log('=============================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Concurrency test failed:', err);
    process.exit(1);
  }
}

testConcurrency();
