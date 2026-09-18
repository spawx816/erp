const { db } = require('../src/database/db');

async function seedFourYearCustomer() {
  try {
    console.log('🌱 Creando cliente con más de 4 años de historial transaccional...');

    // 1. Verificar si ya existe
    const existing = await db.prepare("SELECT id FROM customers WHERE code = 'CLI-2021-001' OR tax_id = '131-98745-6'").get();
    if (existing) {
      console.log(`ℹ️ El cliente ya existe con ID: ${existing.id}. Limpiando datos previos para reinserción limpia...`);
      await db.prepare("DELETE FROM receivable_payments WHERE customer_id = ?").run(existing.id);
      await db.prepare("DELETE FROM sale_payments WHERE sale_id IN (SELECT id FROM sales WHERE customer_id = ?)").run(existing.id);
      await db.prepare("DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE customer_id = ?)").run(existing.id);
      await db.prepare("DELETE FROM sales WHERE customer_id = ?").run(existing.id);
      await db.prepare("DELETE FROM customers WHERE id = ?").run(existing.id);
    }

    // 2. Insertar cliente con fecha de inicio en Marzo 2021 (hace más de 5 años)
    const custInsert = await db.prepare(`
      INSERT INTO customers (
        company_id, code, salesperson_id, person_type, first_name, last_name, company_name,
        tax_id, id_card, email, phone, mobile, address, province, municipality, sector, city,
        contact_person, customer_type, credit_condition, credit_limit, credit_days, current_balance,
        risk_score, status, created_at, updated_at
      ) VALUES (
        1, 'CLI-2021-001', 1, 'juridica', 'Valentina', 'Morales Peña',
        'Centro Dermatológico & Estético Dra. Morales SRL',
        '131-98745-6', '001-1827364-5', 'dra.morales@esteticamorales.do',
        '809-540-2233', '829-991-8844',
        'Av. Gustavo Mejía Ricart #102, Torre Piantini, Suite 604',
        'Distrito Nacional', 'Santo Domingo', 'Piantini', 'Santo Domingo',
        'Dra. Valentina Morales (Directora Médica)', 'Salón de Belleza', 'credit',
        250000.00, 30, 155500.00,
        'low', 'active', '2021-03-15 09:30:00', '2026-09-12 11:30:00'
      ) RETURNING id
    `).run();

    const customerId = custInsert.row ? custInsert.row.id : (await db.prepare("SELECT id FROM customers WHERE code = 'CLI-2021-001'").get()).id;
    console.log(`✅ Cliente creado: 'Centro Dermatológico & Estético Dra. Morales SRL' (ID: ${customerId})`);

    // 3. Obtener un producto base para los items de venta
    const prod = await db.prepare("SELECT id, name, price FROM products WHERE company_id = 1 LIMIT 1").get();
    const productId = prod ? prod.id : 1;
    const productName = prod ? prod.name : 'Tratamiento Capilar Profesional Ampollas';

    // 4. Lista de transacciones a lo largo de más de 5 años
    const timeline = [
      // --- 2021 (Hace más de 5 años) ---
      {
        date: '2021-04-10 14:00:00',
        due: '2021-05-10',
        number: 'VTA-2021-0012',
        ncf: 'B0100000012',
        total: 85000.00,
        balance: 0.00,
        paid: 85000.00,
        status: 'paid',
        paymentDate: '2021-05-02 11:15:00',
        payRef: 'TRANSF-POP-2021-01'
      },
      {
        date: '2021-08-20 16:30:00',
        due: '2021-09-20',
        number: 'VTA-2021-0045',
        ncf: 'B0100000045',
        total: 120000.00,
        balance: 0.00,
        paid: 120000.00,
        status: 'paid',
        paymentDate: '2021-09-15 10:00:00',
        payRef: 'TRANSF-BHD-2021-09'
      },
      // --- 2022 (Hace 4 años) ---
      {
        date: '2022-02-14 10:45:00',
        due: '2022-03-16',
        number: 'VTA-2022-0089',
        ncf: 'B0100000089',
        total: 150000.00,
        balance: 0.00,
        paid: 150000.00,
        status: 'paid',
        paymentDate: '2022-03-10 15:20:00',
        payRef: 'TRANSF-RES-2022-03'
      },
      {
        date: '2022-11-05 12:00:00',
        due: '2022-12-05',
        number: 'VTA-2022-0160',
        ncf: 'B0100000160',
        total: 95000.00,
        balance: 0.00,
        paid: 95000.00,
        status: 'paid',
        paymentDate: '2022-12-01 09:30:00',
        payRef: 'TRANSF-POP-2022-12'
      },
      // --- 2023 (Hace 3 años) ---
      {
        date: '2023-06-18 11:20:00',
        due: '2023-07-18',
        number: 'VTA-2023-0210',
        ncf: 'B0100000210',
        total: 210000.00,
        balance: 0.00,
        paid: 210000.00,
        status: 'paid',
        paymentDate: '2023-07-12 14:10:00',
        payRef: 'TRANSF-POP-2023-07'
      },
      // --- 2024 (Hace 2 años) ---
      {
        date: '2024-03-10 15:00:00',
        due: '2024-04-10',
        number: 'VTA-2024-0340',
        ncf: 'B0100000340',
        total: 145000.00,
        balance: 0.00,
        paid: 145000.00,
        status: 'paid',
        paymentDate: '2024-04-05 16:45:00',
        payRef: 'TRANSF-BHD-2024-04'
      },
      {
        date: '2024-09-22 13:10:00',
        due: '2024-10-22',
        number: 'VTA-2024-0512',
        ncf: 'B0100000512',
        total: 180000.00,
        balance: 0.00,
        paid: 180000.00,
        status: 'paid',
        paymentDate: '2024-10-18 11:00:00',
        payRef: 'TRANSF-POP-2024-10'
      },
      // --- 2025 (Hace 1 año) ---
      {
        date: '2025-05-14 10:30:00',
        due: '2025-06-14',
        number: 'VTA-2025-0680',
        ncf: 'B0100000680',
        total: 160000.00,
        balance: 0.00,
        paid: 160000.00,
        status: 'paid',
        paymentDate: '2025-06-10 12:30:00',
        payRef: 'TRANSF-RES-2025-06'
      },
      // Factura con balance remanente en mora de 2025:
      {
        date: '2025-11-20 16:00:00',
        due: '2025-12-20',
        number: 'VTA-2025-0899',
        ncf: 'B0100000899',
        total: 115000.00,
        balance: 45000.00, // Quedan 45,000 pendientes
        paid: 70000.00,
        status: 'overdue',
        paymentDate: '2025-12-15 14:00:00',
        payRef: 'ABONO-PARCIAL-2025-12'
      },
      // --- Últimos 30 días (Agosto 2026) ---
      {
        date: '2026-08-18 14:20:00',
        due: '2026-09-17',
        number: 'VTA-2026-1120',
        ncf: 'B0100001120',
        total: 78500.00,
        balance: 78500.00, // Pendiente dentro de crédito
        paid: 0.00,
        status: 'pending',
        paymentDate: null
      },
      // --- HOY (12 de Septiembre 2026) ---
      {
        date: '2026-09-12 11:15:00',
        due: '2026-10-12',
        number: 'VTA-2026-1245',
        ncf: 'B0100001245',
        total: 32000.00,
        balance: 32000.00, // Factura generada hoy
        paid: 0.00,
        status: 'pending',
        paymentDate: null
      }
    ];

    let payCounter = 1;

    for (const item of timeline) {
      const subtotal = Math.round((item.total / 1.18) * 100) / 100;
      const tax = Math.round((item.total - subtotal) * 100) / 100;

      const saleInsert = await db.prepare(`
        INSERT INTO sales (
          company_id, branch_id, warehouse_id, customer_id, salesperson_id, user_id,
          sale_number, invoice_number, ncf, fiscal_type_code, sale_type,
          subtotal, discount_amount, tax_amount, total, amount_paid, balance, change_given,
          due_date, status, created_at
        ) VALUES (
          1, 1, 1, ?, 1, 5,
          ?, ?, ?, 'B01', 'credit',
          ?, 0.00, ?, ?, ?, ?, 0.00,
          ?, ?, ?
        ) RETURNING id
      `).run(
        customerId,
        item.number, item.number, item.ncf,
        subtotal, tax, item.total, item.paid, item.balance,
        item.due, item.status, item.date
      );

      const saleId = saleInsert.row ? saleInsert.row.id : (await db.prepare("SELECT id FROM sales WHERE sale_number = ?").get(item.number)).id;

      // Item
      await db.prepare(`
        INSERT INTO sale_items (
          sale_id, product_id, product_name, quantity, unit_cost, unit_price, subtotal, tax_rate, tax_amount, total
        ) VALUES (
          ?, ?, ?, 1, ?, ?, ?, 18.00, ?, ?
        )
      `).run(
        saleId, productId, productName,
        subtotal * 0.6, subtotal, subtotal, tax, item.total
      );

      // Si hubo pago o abono registrado
      if (item.paid > 0 && item.paymentDate) {
        const payNum = `REC-2021-${String(payCounter++).padStart(4, '0')}`;
        await db.prepare(`
          INSERT INTO receivable_payments (
            company_id, branch_id, customer_id, user_id, payment_number, payment_date,
            total_amount, payment_method, reference_number, notes, created_at
          ) VALUES (
            1, 1, ?, 5, ?, ?,
            ?, 'transfer', ?, 'Transferencia bancaria conciliada', ?
          )
        `).run(
          customerId, payNum, item.paymentDate.split(' ')[0],
          item.paid, item.payRef, item.paymentDate
        );

        // También registrar en sale_payments para consistencia de libro mayor
        await db.prepare(`
          INSERT INTO sale_payments (
            sale_id, payment_method, amount, reference_number, created_at
          ) VALUES (
            ?, 'transfer', ?, ?, ?
          )
        `).run(
          saleId, item.paid, item.payRef, item.paymentDate
        );
      }
    }

    console.log('🎉 Se insertaron exitosamente 11 facturas y 9 recibos a lo largo de 5+ años (2021 a 2026).');
    console.log('Balance actual del cliente: RD$ 155,500.00 (Distribuido entre 2025, últimos 30 días y hoy).');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error seeding 4-year customer:', err);
    process.exit(1);
  }
}

seedFourYearCustomer();
