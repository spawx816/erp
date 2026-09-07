// Automated E2E verification test
const API = 'http://localhost:5000/api/v1';

async function runTest() {
  console.log('Testing SGC ERP Backend APIs...');

  // 1. Health check
  const healthRes = await fetch(`${API}/health`);
  const health = await healthRes.json();
  console.log('Health:', health.status, health.service);

  // 2. Login
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
  });
  const loginData = await loginRes.json();
  if (!loginData.success) throw new Error(`Login failed: ${loginData.message}`);
  const token = loginData.token;
  const user = loginData.user;
  console.log(`Login successful: ${user.username} (${user.role_slug})`);
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  // 3. Get Products
  const prodRes = await fetch(`${API}/catalog/products`, { headers });
  const prodData = await prodRes.json();
  console.log(`Products in catalog: ${prodData.data.length}`);
  const firstProd = prodData.data[0];
  console.log('Sample product:', firstProd.name, firstProd.sku, 'Stock:', firstProd.total_stock, 'Price:', firstProd.price);

  // 4. Get Customers
  const custRes = await fetch(`${API}/third-parties/customers`, { headers });
  const custData = await custRes.json();
  console.log(`Customers found: ${custData.data.length}`);
  const customer = custData.data[0];

  const itemPrice = Number(firstProd.price);
  const taxRate = Number(firstProd.tax_rate || 18);
  const totalAmount = Math.round(itemPrice * (1 + taxRate / 100) * 100) / 100;

  // 5. Check & Open Cash Session if needed
  const activeSessRes = await fetch(`${API}/cash/active-session`, { headers });
  const activeSessData = await activeSessRes.json();
  if (!activeSessData.has_open_session) {
    const regRes = await fetch(`${API}/cash/registers`, { headers });
    const regData = await regRes.json();
    console.log('Cash registers available:', regData.data);
    const registerId = regData.data?.[0]?.id || 1;
    const openRes = await fetch(`${API}/cash/open`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cash_register_id: registerId, initial_cash: 5000 })
    });
    const openData = await openRes.json();
    console.log('Cash drawer open result:', openData);
  }

  // 6. POS Checkout Sale
  const checkoutPayload = {
    branch_id: user.accessible_branches?.[0]?.id || 1,
    warehouse_id: 1,
    customer_id: customer.id,
    receipt_type: 'B02', // Consumo
    currency: 'DOP',
    items: [
      {
        product_id: firstProd.id,
        description: firstProd.name,
        quantity: 1,
        unit_price: itemPrice,
        discount_rate: 0,
        tax_rate: taxRate
      }
    ],
    payments: [
      {
        payment_method: 'cash',
        amount: totalAmount,
        currency: 'DOP',
        received_amount: 5000,
        change_amount: 5000 - totalAmount
      }
    ]
  };

  const saleRes = await fetch(`${API}/sales/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify(checkoutPayload)
  });
  const saleData = await saleRes.json();
  if (!saleData.success) throw new Error(`Sale failed: ${saleData.message}`);
  console.log(`Sale completed successfully! Invoice #${saleData.data.invoice_number}, NCF: ${saleData.data.ncf}`);
  console.log(`Total: RD$ ${saleData.data.total_amount}`);

  // 6. Check Reports Dashboard KPIs
  const kpiRes = await fetch(`${API}/reports/dashboard`, { headers });
  const kpiData = await kpiRes.json();
  console.log('Dashboard KPIs:', kpiData.data.cards);

  console.log('\n>>> ALL END-TO-END TESTS COMPLETED SUCCESSFULLY! <<<');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
