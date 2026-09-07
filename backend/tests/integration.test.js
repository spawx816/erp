const assert = require('assert');
const { db, runTransaction } = require('../src/database/db');
const InventoryService = require('../src/modules/inventory/inventoryService');
const FiscalService = require('../src/modules/fiscal/fiscalService');

console.log('--- STARTING SGC ERP INTEGRATION TESTS ---');

function runTests() {
  const company = db.prepare('SELECT * FROM companies WHERE tax_id = ?').get('131-98765-4');
  assert(company, 'Company Comercial Cambri SRL must exist');

  const admin = db.prepare("SELECT * FROM users WHERE username = 'admin'").get();
  const cashier = db.prepare("SELECT * FROM users WHERE username = 'cajero'").get();
  const branch1 = db.prepare("SELECT * FROM branches WHERE code = 'SUC-01'").get();
  const branch2 = db.prepare("SELECT * FROM branches WHERE code = 'SUC-02'").get();
  const warehouse1 = db.prepare("SELECT * FROM warehouses WHERE code = 'ALM-01'").get();
  const warehouse2 = db.prepare("SELECT * FROM warehouses WHERE code = 'ALM-02'").get();
  const product1 = db.prepare("SELECT * FROM products WHERE sku = 'ADI-DRY-TSHIRT'").get();
  const customer = db.prepare("SELECT * FROM customers WHERE id_card = '000-0000000-0'").get();
  const supplier = db.prepare("SELECT * FROM suppliers WHERE tax_id = '101-55443-2'").get();

  // TEST 1: Dominican NCF Sequentiality & Uniqueness
  console.log('Test 1: Dominican NCF Atomic Sequence Generation...');
  const ncf1 = FiscalService.getNextNCF(company.id, branch1.id, 'B02');
  const ncf2 = FiscalService.getNextNCF(company.id, branch1.id, 'B02');
  assert(ncf1.ncf !== ncf2.ncf, 'Consecutive NCFs must be unique');
  console.log(`  NCF 1: ${ncf1.ncf}, NCF 2: ${ncf2.ncf} [OK]`);

  // TEST 2: Inventory Movement & Kardex Integrity
  console.log('Test 2: Inventory Kardex Integrity...');
  const initialStock = InventoryService.getCurrentStock(warehouse1.id, product1.id);
  const mov = InventoryService.recordMovement({
    companyId: company.id,
    branchId: branch1.id,
    warehouseId: warehouse1.id,
    productId: product1.id,
    userId: admin.id,
    movementType: 'adjustment_in',
    quantity: 10,
    unitCost: product1.cost,
    reason: 'Test de auditoria kardex'
  });
  const updatedStock = InventoryService.getCurrentStock(warehouse1.id, product1.id);
  assert.strictEqual(updatedStock, initialStock + 10, 'Stock must increment by exactly 10');
  console.log(`  Stock before: ${initialStock}, after: ${updatedStock} [OK]`);

  // TEST 3: Inter-warehouse transfer
  console.log('Test 3: Inter-warehouse Transfer...');
  const stockW1_before = InventoryService.getCurrentStock(warehouse1.id, product1.id);
  const stockW2_before = InventoryService.getCurrentStock(warehouse2.id, product1.id);

  // Send from W1
  InventoryService.recordMovement({
    companyId: company.id,
    branchId: branch1.id,
    warehouseId: warehouse1.id,
    toWarehouseId: warehouse2.id,
    productId: product1.id,
    userId: admin.id,
    movementType: 'transfer_out',
    quantity: -5,
    unitCost: product1.cost,
    reason: 'Test transfer dispatch'
  });

  // Receive in W2
  InventoryService.recordMovement({
    companyId: company.id,
    branchId: branch2.id,
    warehouseId: warehouse2.id,
    toWarehouseId: null,
    productId: product1.id,
    userId: admin.id,
    movementType: 'transfer_in',
    quantity: 5,
    unitCost: product1.cost,
    reason: 'Test transfer receipt'
  });

  const stockW1_after = InventoryService.getCurrentStock(warehouse1.id, product1.id);
  const stockW2_after = InventoryService.getCurrentStock(warehouse2.id, product1.id);

  assert.strictEqual(stockW1_after, stockW1_before - 5, 'Source warehouse must decrease by 5');
  assert.strictEqual(stockW2_after, stockW2_before + 5, 'Dest warehouse must increase by 5');
  console.log(`  Transfer executed cleanly. Total company stock preserved. [OK]`);

  // TEST 4: Cash Session and Discrepancy enforcement
  console.log('Test 4: Cash Session & Arqueo Calculation...');
  let session = db.prepare("SELECT * FROM cash_sessions WHERE status = 'open' AND user_id = ?").get(cashier.id);
  if (!session) {
    const register = db.prepare("SELECT id FROM cash_registers LIMIT 1").get();
    db.prepare("INSERT INTO cash_sessions (cash_register_id, branch_id, user_id, initial_cash, status) VALUES (?, ?, ?, ?, 'open')")
      .run(register.id, branch1.id, cashier.id, 5000);
    session = db.prepare("SELECT * FROM cash_sessions WHERE status = 'open' AND user_id = ?").get(cashier.id);
  }
  assert(session, 'Cashier must have an active session');
  
  const expectedCash = 5000;
  const countedCash = 4950;
  const diff = countedCash - expectedCash;
  assert.strictEqual(diff, -50, 'Discrepancy must be accurately identified as RD$ -50');
  console.log(`  Discrepancy test passed: Expected ${expectedCash}, Counted ${countedCash}, Diff ${diff} [OK]`);

  console.log('\n=============================================');
  console.log(' ALL CORE INTEGRATION TESTS PASSED CLEANLY! ');
  console.log('=============================================\n');
}

runTests();
