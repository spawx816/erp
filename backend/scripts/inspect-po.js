const { db } = require('../src/database/db');

async function inspect() {
  const cols = await db.prepare("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'purchase_orders' ORDER BY ordinal_position").all();
  console.log('PO cols:', cols.map(c => `${c.column_name} (${c.data_type}, null: ${c.is_nullable})`));
  const cols2 = await db.prepare("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'purchase_order_items' ORDER BY ordinal_position").all();
  console.log('POI cols:', cols2.map(c => `${c.column_name} (${c.data_type}, null: ${c.is_nullable})`));
  process.exit(0);
}

inspect();
