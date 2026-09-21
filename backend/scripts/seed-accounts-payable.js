const { db } = require('../src/database/db');

async function seedAccountsPayable() {
  try {
    console.log('Seeding accounts_payable records for suppliers with balances...');

    const suppliers = await db.prepare("SELECT id, company_name, tax_id, current_balance FROM suppliers WHERE company_id = 1 AND current_balance > 0").all();
    console.log(`Found ${suppliers.length} suppliers with balance.`);

    // Clear any previous AP records to start clean
    await db.prepare('DELETE FROM payable_payments WHERE company_id = 1').run();
    await db.prepare('DELETE FROM accounts_payable WHERE company_id = 1').run();

    const sampleInvoices = [
      // 1. Distribuidora Cosmética del Caribe SAS (145,000 balance)
      {
        supplier_id: 1,
        doc_num: 'FPROV-9821',
        issue_date: '2026-08-05',
        due_date: '2026-09-04', // Vencida
        amount: 85000.00,
        balance: 85000.00,
        status: 'overdue'
      },
      {
        supplier_id: 1,
        doc_num: 'FPROV-9940',
        issue_date: '2026-08-25',
        due_date: '2026-09-24', // Al día
        amount: 60000.00,
        balance: 60000.00,
        status: 'pending'
      },

      // 2. L’Oréal Caribe Dominicana SRL (230,000 balance)
      {
        supplier_id: 2,
        doc_num: 'LOR-2026-441',
        issue_date: '2026-07-15',
        due_date: '2026-08-14', // Vencida
        amount: 150000.00,
        balance: 150000.00,
        status: 'overdue'
      },
      {
        supplier_id: 2,
        doc_num: 'LOR-2026-590',
        issue_date: '2026-08-28',
        due_date: '2026-09-27', // Al día
        amount: 80000.00,
        balance: 80000.00,
        status: 'pending'
      },

      // 3. Alfaparf Milano Dominicana SRL (85,000 balance)
      {
        supplier_id: 3,
        doc_num: 'ALF-88192',
        issue_date: '2026-08-10',
        due_date: '2026-09-09', // Vencida
        amount: 85000.00,
        balance: 85000.00,
        status: 'overdue'
      },

      // 4. Envases & Accesorios Plásticos SAS (22,000 balance)
      {
        supplier_id: 5,
        doc_num: 'ENV-3301',
        issue_date: '2026-09-01',
        due_date: '2026-10-01', // Al día
        amount: 22000.00,
        balance: 22000.00,
        status: 'pending'
      },

      // 5. Químicos & Formulaciones del Este SRL (60,000 balance)
      {
        supplier_id: 6,
        doc_num: 'QUIM-5510',
        issue_date: '2026-08-12',
        due_date: '2026-09-11', // Vencida
        amount: 60000.00,
        balance: 60000.00,
        status: 'overdue'
      },

      // 6. Distribuidora Deportiva del Caribe SAS (45,000 balance)
      {
        supplier_id: 8,
        doc_num: 'DEP-1092',
        issue_date: '2026-08-20',
        due_date: '2026-09-19', // Al día
        amount: 45000.00,
        balance: 45000.00,
        status: 'pending'
      }
    ];

    for (const inv of sampleInvoices) {
      // Find purchase record for reference if exists
      let purch = await db.prepare("SELECT id FROM purchases WHERE supplier_id = ? AND company_id = 1 LIMIT 1").get(inv.supplier_id);
      const purchId = purch ? purch.id : null;

      await db.prepare(`
        INSERT INTO accounts_payable (
          company_id, branch_id, supplier_id, purchase_id, document_number,
          issue_date, due_date, amount, balance, status
        ) VALUES (
          1, 1, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `).run(
        inv.supplier_id, purchId, inv.doc_num,
        inv.issue_date, inv.due_date, inv.amount, inv.balance, inv.status
      );
    }

    console.log(`✅ Seeded ${sampleInvoices.length} accounts payable invoices successfully!`);
    process.exit(0);
  } catch (err) {
    console.error('Error seeding accounts_payable:', err);
    process.exit(1);
  }
}

seedAccountsPayable();
