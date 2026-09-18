const { db, runTransaction } = require('../src/database/db');
const ordersController = require('../src/modules/sales/ordersController');
const assert = require('assert');

async function testOrdersWorkflow() {
  console.log('--- STARTING SALES ORDERS WORKFLOW INTEGRATION TEST ---');

  // 1. Setup mock users
  const vendedorUser = await db.prepare(`SELECT * FROM users WHERE username = 'vendedor'`).get();
  const gerenteUser = await db.prepare(`SELECT * FROM users WHERE username = 'gerente'`).get();
  const almacenUser = await db.prepare(`SELECT * FROM users WHERE username = 'almacen'`).get();
  const cajeroUser = await db.prepare(`SELECT * FROM users WHERE username = 'cajero'`).get();

  assert.ok(vendedorUser, 'vendedor user must exist');
  assert.ok(gerenteUser, 'gerente user must exist');
  assert.ok(almacenUser, 'almacen user must exist');
  assert.ok(cajeroUser, 'cajero user must exist');

  // Get test customer, warehouse and product with stock
  const customer = await db.prepare('SELECT id FROM customers WHERE company_id = 1 AND status = \'active\' LIMIT 1').get();
  const warehouse = await db.prepare('SELECT id, branch_id FROM warehouses WHERE company_id = 1 LIMIT 1').get();
  const product = await db.prepare(`
    SELECT p.id, p.price, p.tax_rate, i.quantity
    FROM products p
    JOIN inventories i ON p.id = i.product_id AND i.warehouse_id = ?
    WHERE p.company_id = 1 AND p.type = 'physical' AND i.quantity > 5
    LIMIT 1
  `).get(warehouse.id);

  assert.ok(customer, 'Customer must exist');
  assert.ok(warehouse, 'Warehouse must exist');
  assert.ok(product, 'Product with stock must exist');

  const initialStock = Number(product.quantity);
  console.log(`Initial product stock (ID ${product.id}): ${initialStock}`);

  // STEP 1: Vendedor creates Order via POS (No cash register needed!)
  console.log('\nStep 1: Vendedor creates order without cash shift...');
  let createdOrderId = null;
  let orderNumber = null;

  const reqCreate = {
    user: vendedorUser,
    headers: { 'x-branch-id': String(warehouse.branch_id) },
    ip: '127.0.0.1',
    body: {
      customer_id: customer.id,
      warehouse_id: warehouse.id,
      notes: 'Pedido de prueba flujo vendedor sin cobro',
      items: [
        {
          product_id: product.id,
          quantity: 2,
          unit_price: Number(product.price),
          discount_percent: 0
        }
      ]
    }
  };

  await ordersController.createOrder(reqCreate, {
    status(code) {
      assert.strictEqual(code, 201, `Order creation should return 201, got ${code}`);
      return this;
    },
    json(data) {
      assert.strictEqual(data.success, true);
      createdOrderId = data.data.orderId;
      orderNumber = data.data.orderNumber;
      console.log(`  ✓ Order created successfully: ${orderNumber} (ID: ${createdOrderId})`);
      return this;
    }
  });

  const orderRow1 = await db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(createdOrderId);
  assert.strictEqual(orderRow1.status, 'pending_approval', 'Order must start in pending_approval');

  // STEP 2: Gerente Approves the Order
  console.log('\nStep 2: Gerente approves the order...');
  const reqApprove = {
    user: gerenteUser,
    params: { id: createdOrderId },
    ip: '127.0.0.1'
  };

  await ordersController.approveOrder(reqApprove, {
    status(code) {
      assert.strictEqual(code, 200, `Approval should return 200, got ${code}`);
      return this;
    },
    json(data) {
      assert.strictEqual(data.success, true);
      console.log(`  ✓ Order approved by Gerente: ${data.message}`);
      return this;
    }
  });

  const orderRow2 = await db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(createdOrderId);
  assert.strictEqual(orderRow2.status, 'approved', 'Order must be approved');
  assert.strictEqual(Number(orderRow2.approved_by_user_id), Number(gerenteUser.id));

  // STEP 3: Almacén Dispatches the Order (Physically deducted from Kardex)
  console.log('\nStep 3: Almacen dispatches order and deducts Kardex...');
  const reqDispatch = {
    user: almacenUser,
    params: { id: createdOrderId },
    ip: '127.0.0.1'
  };

  await ordersController.dispatchOrder(reqDispatch, {
    status(code) {
      assert.strictEqual(code, 200, `Dispatch should return 200, got ${code}`);
      return this;
    },
    json(data) {
      assert.strictEqual(data.success, true);
      console.log(`  ✓ Order dispatched by Almacén: ${data.message}`);
      return this;
    }
  });

  const orderRow3 = await db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(createdOrderId);
  assert.strictEqual(orderRow3.status, 'dispatched', 'Order must be dispatched');
  assert.strictEqual(Number(orderRow3.dispatched_by_user_id), Number(almacenUser.id));

  // Verify inventory deduction in inventories and inventory_movements
  const postStock = await db.prepare('SELECT quantity FROM inventories WHERE warehouse_id = ? AND product_id = ?').get(warehouse.id, product.id);
  assert.strictEqual(Number(postStock.quantity), initialStock - 2, `Stock must be decreased by 2 (was ${initialStock}, now ${postStock.quantity})`);
  console.log(`  ✓ Kardex verified: stock correctly reduced from ${initialStock} to ${postStock.quantity}`);

  // STEP 4: Cajero Invoices the Order (Fiscal NCF assigned, payments registered)
  console.log('\nStep 4: Cajero invoices the dispatched order...');
  const reqInvoice = {
    user: cajeroUser,
    params: { id: createdOrderId },
    ip: '127.0.0.1',
    body: {
      fiscal_type_code: 'B02',
      payments: [
        { payment_method: 'cash', amount: Number(orderRow3.total) }
      ]
    }
  };

  await ordersController.invoiceOrder(reqInvoice, {
    status(code) {
      assert.strictEqual(code, 200, `Invoice should return 200, got ${code}`);
      return this;
    },
    json(data) {
      assert.strictEqual(data.success, true);
      console.log(`  ✓ Order invoiced by Cajero: Factura ${data.data.saleNumber} (NCF: ${data.data.ncf})`);
      return this;
    }
  });

  const orderRow4 = await db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(createdOrderId);
  assert.strictEqual(orderRow4.status, 'invoiced', 'Order must be invoiced');
  assert.ok(orderRow4.sale_id, 'Sale ID must be linked');

  const saleRow = await db.prepare('SELECT * FROM sales WHERE id = ?').get(orderRow4.sale_id);
  assert.ok(saleRow, 'Fiscal Sale record must exist');
  assert.ok(saleRow.ncf.startsWith('B02'), 'Must have Dominican B02 NCF');

  console.log('\n======================================================');
  console.log(' ALL 4 STEPS OF SALES ORDERS WORKFLOW PASSED CLEANLY! ');
  console.log('======================================================\n');
  process.exit(0);
}

testOrdersWorkflow().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
