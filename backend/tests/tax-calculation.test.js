const assert = require('assert');

console.log('--- STARTING TAX CALCULATION & ITBIS TEST SUITE ---');

function calculateTotals(items, discountPercent = 0) {
  let subtotal = 0;
  let totalDiscount = 0;
  let itbisTax = 0;
  let total = 0;
  let taxableSubtotal = 0;
  let exemptSubtotal = 0;

  items.forEach(it => {
    const itemQty = Number(it.quantity || 1);
    const unitPrice = Number(it.price || 0);
    const itemBase = Math.round(itemQty * unitPrice * 100) / 100;
    const itemDiscPercent = discountPercent > 0 ? discountPercent : Number(it.discount_percent || 0);
    const itemDiscAmount = Math.round(itemBase * (itemDiscPercent / 100) * 100) / 100;
    const itemNet = Math.round((itemBase - itemDiscAmount) * 100) / 100;

    const itemTaxRate = (it.tax_rate !== undefined && it.tax_rate !== null) ? Number(it.tax_rate) : 18;
    const itemTaxAmount = Math.round(itemNet * (itemTaxRate / 100) * 100) / 100;
    const itemTotal = Math.round((itemNet + itemTaxAmount) * 100) / 100;

    subtotal = Math.round((subtotal + itemBase) * 100) / 100;
    totalDiscount = Math.round((totalDiscount + itemDiscAmount) * 100) / 100;
    itbisTax = Math.round((itbisTax + itemTaxAmount) * 100) / 100;
    total = Math.round((total + itemTotal) * 100) / 100;

    if (itemTaxRate > 0) {
      taxableSubtotal = Math.round((taxableSubtotal + itemNet) * 100) / 100;
    } else {
      exemptSubtotal = Math.round((exemptSubtotal + itemNet) * 100) / 100;
    }
  });

  return {
    subtotal,
    totalDiscount,
    netSubtotal: Math.round((subtotal - totalDiscount) * 100) / 100,
    itbisTax,
    total,
    taxableSubtotal,
    exemptSubtotal
  };
}

// Case 1: All exempt items (tax_rate = 0)
const cartExempt = [
  { name: 'Leche Líquida', price: 100, quantity: 2, tax_rate: 0 },
  { name: 'Pan de Agua', price: 50, quantity: 1, tax_rate: 0 }
];
const res1 = calculateTotals(cartExempt);
console.log('Case 1 (All Exempt):', res1);
assert.strictEqual(res1.subtotal, 250);
assert.strictEqual(res1.itbisTax, 0, 'Exempt items must yield 0 ITBIS');
assert.strictEqual(res1.exemptSubtotal, 250);
assert.strictEqual(res1.total, 250);
console.log('  Case 1 Passed [OK]');

// Case 2: Mixed cart (Standard 18% + Exempt 0%)
const cartMixed = [
  { name: 'Producto Gravado', price: 1000, quantity: 1, tax_rate: 18 },
  { name: 'Producto Exento', price: 500, quantity: 1, tax_rate: 0 }
];
const res2 = calculateTotals(cartMixed);
console.log('Case 2 (Mixed Cart):', res2);
assert.strictEqual(res2.subtotal, 1500);
assert.strictEqual(res2.taxableSubtotal, 1000);
assert.strictEqual(res2.exemptSubtotal, 500);
assert.strictEqual(res2.itbisTax, 180, 'Only 18% of 1000 should be taxed');
assert.strictEqual(res2.total, 1680);
console.log('  Case 2 Passed [OK]');

// Case 3: Mixed cart with general discount of 10%
const res3 = calculateTotals(cartMixed, 10);
console.log('Case 3 (Mixed + 10% Discount):', res3);
assert.strictEqual(res3.subtotal, 1500);
assert.strictEqual(res3.totalDiscount, 150);
assert.strictEqual(res3.netSubtotal, 1350);
// Net gravado = 900, 18% = 162
assert.strictEqual(res3.taxableSubtotal, 900);
assert.strictEqual(res3.exemptSubtotal, 450);
assert.strictEqual(res3.itbisTax, 162);
assert.strictEqual(res3.total, 1512);
console.log('  Case 3 Passed [OK]');

console.log('=============================================');
console.log(' ALL TAX CALCULATION TESTS PASSED CLEANLY!   ');
console.log('=============================================');
process.exit(0);
