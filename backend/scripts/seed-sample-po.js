const { db } = require('../src/database/db');

async function seedSamplePOs() {
  try {
    console.log('Seeding sample purchase orders...');

    const suppliers = await db.prepare('SELECT id, company_name FROM suppliers WHERE company_id = 1 LIMIT 3').all();
    const products = await db.prepare('SELECT id, name, cost FROM products WHERE company_id = 1 LIMIT 5').all();

    if (!suppliers.length || !products.length) {
      console.log('No suppliers or products found.');
      process.exit(0);
    }

    const count = await db.prepare('SELECT COUNT(*) as c FROM purchase_orders WHERE company_id = 1').get();
    if (parseInt(count.c, 10) > 0) {
      console.log('Purchase orders already exist, count:', count.c);
      process.exit(0);
    }

    // 1. PO-0001 (pending)
    const s1 = suppliers[0];
    const exp1 = new Date();
    exp1.setDate(exp1.getDate() + 5);

    const p1 = products[0];
    const p2 = products[1] || products[0];

    const qty1 = 20;
    const cost1 = Number(p1.cost || 450);
    const sub1 = qty1 * cost1;
    const tax1 = Math.round(sub1 * 0.18 * 100) / 100;
    const tot1 = sub1 + tax1;

    const res1 = await db.prepare(`
      INSERT INTO purchase_orders (
        company_id, branch_id, warehouse_id, supplier_id, user_id,
        order_number, status, expected_date, subtotal, tax_amount, total, notes
      ) VALUES (
        1, 1, 1, ?, 5,
        'OC-2026-001', 'pending', ?, ?, ?, ?, 'Pedido quincenal de reposición estándar'
      ) RETURNING id
    `).run(s1.id, exp1.toISOString().split('T')[0], sub1, tax1, tot1);

    const poId1 = res1.row ? res1.row.id : 1;

    await db.prepare(`
      INSERT INTO purchase_order_items (
        purchase_order_id, product_id, quantity, received_quantity, unit_cost, subtotal, tax_rate, tax_amount, total
      ) VALUES (
        ?, ?, ?, 0.00, ?, ?, 18.00, ?, ?
      )
    `).run(poId1, p1.id, qty1, cost1, sub1, tax1, tot1);

    // 2. PO-0002 (approved)
    const s2 = suppliers[1] || suppliers[0];
    const exp2 = new Date();
    exp2.setDate(exp2.getDate() + 3);

    const qty2 = 15;
    const cost2 = Number(p2.cost || 820);
    const sub2 = qty2 * cost2;
    const tax2 = Math.round(sub2 * 0.18 * 100) / 100;
    const tot2 = sub2 + tax2;

    const res2 = await db.prepare(`
      INSERT INTO purchase_orders (
        company_id, branch_id, warehouse_id, supplier_id, user_id,
        order_number, status, expected_date, subtotal, tax_amount, total, notes
      ) VALUES (
        1, 1, 1, ?, 5,
        'OC-2026-002', 'approved', ?, ?, ?, ?, 'Aprobado por gerencia. Entrega prioritaria'
      ) RETURNING id
    `).run(s2.id, exp2.toISOString().split('T')[0], sub2, tax2, tot2);

    const poId2 = res2.row ? res2.row.id : 2;

    await db.prepare(`
      INSERT INTO purchase_order_items (
        purchase_order_id, product_id, quantity, received_quantity, unit_cost, subtotal, tax_rate, tax_amount, total
      ) VALUES (
        ?, ?, ?, 0.00, ?, ?, 18.00, ?, ?
      )
    `).run(poId2, p2.id, qty2, cost2, sub2, tax2, tot2);

    console.log('Sample purchase orders seeded successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding sample POs:', err);
    process.exit(1);
  }
}

seedSamplePOs();
