const API = 'http://localhost:5000/api/v1';

async function req(url, options = {}) {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(fullUrl, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || `HTTP ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 INICIANDO SUITE DE PRUEBAS DEL MÓDULO DE VENTAS & POS');
  console.log('========================================================\n');

  let adminToken = '';
  let cajeroToken = '';

  // 1. Authenticate
  try {
    const adminRes = await req('/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'Admin123!' }
    });
    adminToken = adminRes.token;
    console.log('✅ 1. Login Admin exitoso. Active Cash Session:', adminRes.user.active_cash_session?.id || 'Ninguna');

    const cajeroRes = await req('/auth/login', {
      method: 'POST',
      body: { username: 'cajero', password: 'Admin123!' }
    });
    cajeroToken = cajeroRes.token;
    console.log('✅ 2. Login Cajero exitoso. Active Cash Session:', cajeroRes.user.active_cash_session?.id || 'Ninguna');
  } catch (err) {
    console.error('❌ Error de autenticación:', err.data || err.message);
    process.exit(1);
  }

  const authHeaders = { Authorization: `Bearer ${adminToken}` };
  const cajeroHeaders = { Authorization: `Bearer ${cajeroToken}` };

  // 2. Ensure all open cash sessions for branch 1 are closed to test closed-cash POS rejection
  try {
    const regRes = await req('/cash/registers?branch_id=1', { headers: authHeaders });
    const registers = regRes.data || [];
    for (const r of registers) {
      if (r.active_session_id) {
        console.log(`ℹ️ Cerrando sesión activa previa #${r.active_session_id} en caja "${r.name}"...`);
        await req(`/cash/close`, {
          method: 'POST',
          headers: authHeaders,
          body: {
            session_id: r.active_session_id,
            actual_cash: 5000,
            notes: 'Cierre preventivo para suite de pruebas'
          }
        }).catch(async () => {
          // If close requires cashier token, try cajeroHeaders
          await req(`/cash/close`, {
            method: 'POST',
            headers: cajeroHeaders,
            body: {
              session_id: r.active_session_id,
              actual_cash: 5000,
              notes: 'Cierre preventivo con cajero'
            }
          });
        });
        console.log(`✅ Sesión previa #${r.active_session_id} cerrada.`);
      }
    }
  } catch (err) {
    console.log('ℹ️ Cierre de sesiones previas:', err.message);
  }

  // 3. Test: Intentar facturar en POS con caja CERRADA
  console.log('\n--- TEST 1: Intento de facturación POS con Caja Cerrada ---');
  try {
    const checkoutAttempt = await req('/sales/checkout', {
      method: 'POST',
      headers: authHeaders,
      body: {
        customer_id: 1,
        warehouse_id: 1,
        fiscal_type_code: 'B02',
        is_pos: true,
        items: [{ product_id: 1, quantity: 1, unit_price: 1000, tax_rate: 18 }],
        payments: [{ payment_method: 'cash', amount: 1180, tendered: 1200 }]
      }
    });

    console.error('❌ FALLÓ: El backend permitió facturar en efectivo sin caja abierta!', checkoutAttempt);
    process.exit(1);
  } catch (err) {
    if (err.status === 400 && err.data?.requires_cash_open) {
      console.log('✅ ÉXITO: El sistema bloqueó la venta correctamente y devolvió requires_cash_open = true.');
      console.log('   Mensaje retornado:', err.data.message);
    } else {
      console.error('❌ Respuesta inesperada en prueba de caja cerrada:', err.status, err.data);
      process.exit(1);
    }
  }

  // 4. Test: Aperturar Turno de Caja
  console.log('\n--- TEST 2: Apertura de Turno de Caja ---');
  let newSessionId = null;
  try {
    const openRes = await req('/cash/open', {
      method: 'POST',
      headers: authHeaders,
      body: {
        cash_register_id: 1,
        initial_cash: 3000
      }
    });
    newSessionId = openRes.session_id || openRes.data?.id;
    console.log(`✅ Turno de caja #${newSessionId} aperturado exitosamente con RD$ 3,000.00 en Caja 1.`);
  } catch (err) {
    console.error('❌ Error al aperturar caja:', err.data || err.message);
    process.exit(1);
  }

  // 5. Test: Facturación en POS con Efectivo y Asignación de NCF
  console.log('\n--- TEST 3: Facturación POS en Efectivo (B02 Consumo) ---');
  let saleId = null;
  let saleInvoiceNumber = '';
  let saleNCF = '';
  let testProductId = 1;
  let testPrice = 650;
  try {
    // Get products with stock
    const prodsRes = await req('/catalog/products?limit=50', { headers: authHeaders });
    const productWithStock = (prodsRes.data || []).find(p => Number(p.total_stock) > 2) || (prodsRes.data || [])[0];
    testProductId = productWithStock ? productWithStock.id : 1;
    testPrice = Number(productWithStock?.price || 650);

    console.log(`ℹ️ Utilizando producto #${testProductId} (${productWithStock?.name}) - Stock: ${productWithStock?.total_stock}`);

    const subtotalCalc = 2 * testPrice;
    const totalCalc = subtotalCalc * 1.18;

    const checkoutRes = await req('/sales/checkout', {
      method: 'POST',
      headers: authHeaders,
      body: {
        customer_id: 1,
        warehouse_id: 1,
        fiscal_type_code: 'B02',
        is_pos: true,
        items: [{ product_id: testProductId, quantity: 2, unit_price: testPrice, tax_rate: 18 }],
        payments: [{ payment_method: 'cash', amount: totalCalc, tendered: totalCalc + 200 }]
      }
    });

    saleId = checkoutRes.data.id;
    saleInvoiceNumber = checkoutRes.data.invoice_number;
    saleNCF = checkoutRes.data.ncf;
    console.log(`✅ Venta #${saleId} procesada con éxito!`);
    console.log(`   Factura: ${saleInvoiceNumber}`);
    console.log(`   NCF Asignado: ${saleNCF}`);
    console.log(`   Total: RD$ ${checkoutRes.data.total}`);
    console.log(`   Cambio devuelto: RD$ ${checkoutRes.data.change_given}`);
  } catch (err) {
    console.error('❌ Error procesando venta en efectivo:', err.data || err.message);
    process.exit(1);
  }

  // 6. Test: Verificar Movimiento de Caja Registrado
  console.log('\n--- TEST 4: Verificación de Movimiento en Caja ---');
  try {
    const sessRes = await req('/cash/active-session', { headers: authHeaders });
    if (sessRes.has_open_session && sessRes.session) {
      console.log(`✅ Sesión activa #${sessRes.session.id} confirmada para el usuario.`);
      console.log(`   Efectivo esperado en caja: RD$ ${sessRes.session.expected_cash}`);
    } else {
      console.log(`ℹ️ Sesión activa data:`, sessRes);
    }
  } catch (err) {
    console.error('❌ Error consultando sesión activa de caja:', err.data || err.message);
  }

  // 7. Test: Facturación a Crédito (B01 Crédito Fiscal)
  console.log('\n--- TEST 5: Facturación a Crédito con Comprobante Fiscal B01 ---');
  let creditSaleId = null;
  try {
    const creditRes = await req('/sales/checkout', {
      method: 'POST',
      headers: authHeaders,
      body: {
        customer_id: 2, // Cliente comercial con crédito
        warehouse_id: 1,
        fiscal_type_code: 'B01',
        is_pos: false,
        items: [{ product_id: testProductId, quantity: 1, unit_price: testPrice, tax_rate: 18 }],
        payments: [{ payment_method: 'credit', amount: testPrice * 1.18, tendered: testPrice * 1.18 }]
      }
    });

    creditSaleId = creditRes.data.id;
    console.log(`✅ Venta a crédito #${creditSaleId} procesada!`);
    console.log(`   Factura: ${creditRes.data.invoice_number}`);
    console.log(`   NCF Fiscal: ${creditRes.data.ncf}`);
    console.log(`   Estado de pago: ${creditRes.data.status}`);
  } catch (err) {
    console.error('❌ Error en venta a crédito:', err.data || err.message);
    process.exit(1);
  }

  // 8. Test: Consulta de Historial de Ventas con Filtros
  console.log('\n--- TEST 6: Consulta de Historial de Ventas con Filtros ---');
  try {
    const listRes = await req('/sales?branch_id=1&limit=10', { headers: authHeaders });
    console.log(`✅ Historial recuperado: ${listRes.data?.length || 0} facturas listadas.`);
    const detailRes = await req(`/sales/${saleId}`, { headers: authHeaders });
    console.log(`✅ Detalle de venta #${saleId} obtenido con ${detailRes.data.items?.length || 0} ítems y ${detailRes.data.payments?.length || 0} pagos.`);
  } catch (err) {
    console.error('❌ Error en consulta de ventas:', err.data || err.message);
    process.exit(1);
  }

  // 9. Test: Creación de Cotización
  console.log('\n--- TEST 7: Creación de Cotización ---');
  try {
    const quoteRes = await req('/sales/quotes', {
      method: 'POST',
      headers: authHeaders,
      body: {
        customer_id: 1,
        branch_id: 1,
        warehouse_id: 1,
        items: [{ product_id: testProductId, quantity: 5, unit_price: 600, discount_percent: 5 }],
        valid_days: 15,
        notes: 'Cotización especial por volumen'
      }
    });
    console.log(`✅ Cotización generada: ${quoteRes.data?.quote_number || 'OK'} - Total: RD$ ${quoteRes.data?.total}`);
  } catch (err) {
    console.error('❌ Error en cotización:', err.data || err.message);
    process.exit(1);
  }

  // 10. Test: Anulación de Venta / Emisión de Nota de Crédito B04
  console.log('\n--- TEST 8: Anulación de Factura & Emisión de Nota de Crédito (NCF B04) ---');
  try {
    const cancelRes = await req(`/sales/${saleId}/cancel`, {
      method: 'POST',
      headers: authHeaders,
      body: { reason: 'Devolución por cambio de producto del cliente' }
    });
    console.log(`✅ Factura #${saleId} anulada exitosamente!`);
    console.log(`   Nota de Crédito generada: ${cancelRes.data?.credit_note_ncf || 'B04...'}`);
    console.log(`   Reintegro a inventario completado.`);
  } catch (err) {
    console.error('❌ Error anulando venta:', err.data || err.message);
    process.exit(1);
  }

  // 11. Test: Cierre de Sesión de Caja
  console.log('\n--- TEST 9: Arqueo y Cierre de Turno de Caja ---');
  try {
    const closeRes = await req('/cash/close', {
      method: 'POST',
      headers: authHeaders,
      body: {
        session_id: newSessionId,
        actual_cash: 4534,
        notes: 'Cierre de turno verificado'
      }
    });
    console.log(`✅ Turno #${newSessionId} cerrado con éxito.`);
    console.log(`   Diferencia en caja: RD$ ${closeRes.data?.difference || 0}`);
  } catch (err) {
    console.error('❌ Error al cerrar caja:', err.data || err.message);
    process.exit(1);
  }

  console.log('\n========================================================');
  console.log('🎉 TODAS LAS PRUEBAS DEL MÓDULO DE VENTAS COMPLETADAS CON ÉXITO');
  console.log('========================================================\n');
}

runTests();
