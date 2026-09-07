const { db } = require('./src/database/db');
// Check inventories table columns
const cols = db.prepare("PRAGMA table_info(inventories)").all().map(c => c.name);
console.log('inventories columns:', cols);

// Get sample row
const sample = db.prepare("SELECT * FROM inventories WHERE company_id=1 LIMIT 2").all();
console.log('Sample inventories:', JSON.stringify(sample, null, 2));

// Get warehouses
const wh = db.prepare("SELECT * FROM warehouses WHERE company_id=1 LIMIT 2").all();
console.log('Warehouses:', JSON.stringify(wh));

// Get customers
const cust = db.prepare("SELECT id, company_name, first_name, tax_id FROM customers WHERE company_id=1 LIMIT 2").all();
console.log('Customers:', JSON.stringify(cust));

// Get B04 sequence
const b04 = db.prepare("SELECT * FROM fiscal_sequences WHERE company_id=1 AND fiscal_type_code='B04'").all();
console.log('B04 sequences:', JSON.stringify(b04));

// Get B01 sequence
const b01 = db.prepare("SELECT * FROM fiscal_sequences WHERE company_id=1 AND fiscal_type_code='B01'").all();
console.log('B01 sequences:', JSON.stringify(b01));

process.exit(0);
