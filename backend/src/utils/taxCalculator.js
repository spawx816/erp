/**
 * Tax Calculation Utility - Shared between Frontend and Backend
 * Ensures consistent ITBIS calculation across the entire ERP
 * Republica Dominicana: ITBIS 18% standard, 0% for exempt goods
 */

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Calculate tax for a single line item
 * @param {Object} params
 * @param {number} params.quantity
 * @param {number} params.unitPrice
 * @param {number} params.discountPercent
 * @param {number} params.taxRate
 * @returns {Object} { base, discount, net, tax, total }
 */
function calculateLineItem({ quantity, unitPrice, discountPercent = 0, taxRate = 18 }) {
  const qty = round2(quantity);
  const price = round2(unitPrice);
  const discPct = round2(discountPercent);
  const taxPct = round2(taxRate);

  const base = round2(qty * price);
  const discount = round2(base * (discPct / 100));
  const net = round2(base - discount);
  const tax = round2(net * (taxPct / 100));
  const total = round2(net + tax);

  return { base, discount, net, tax, total, taxRate: taxPct };
}

/**
 * Calculate totals for a cart/checkout
 * @param {Array} items - Array of { quantity, unitPrice, discountPercent?, taxRate?, productId?, variantId? }
 * @param {number} generalDiscountPercent - General discount applied to entire cart
 * @returns {Object} { subtotal, discount, netSubtotal, tax, total, items: [...] }
 */
function calculateCartTotals(items, generalDiscountPercent = 0) {
  const generalDiscPct = round2(generalDiscountPercent);
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let total = 0;
  const calculatedItems = [];

  for (const item of items) {
    const line = calculateLineItem({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent || 0,
      taxRate: item.taxRate !== undefined ? item.taxRate : 18
    });

    subtotal = round2(subtotal + line.base);
    totalDiscount = round2(totalDiscount + line.discount);
    totalTax = round2(totalTax + line.tax);
    total = round2(total + line.total);

    calculatedItems.push({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent || 0,
      discountAmount: line.discount,
      net: line.net,
      taxRate: line.taxRate,
      taxAmount: line.tax,
      total: line.total
    });
  }

  // Apply general discount on top (if not already applied per item)
  if (generalDiscPct > 0) {
    const generalDiscAmount = round2(subtotal * (generalDiscPct / 100));
    totalDiscount = round2(totalDiscount + generalDiscAmount);
    const netSubtotal = round2(subtotal - totalDiscount);
    // Recalculate tax on net (proportional reduction)
    const taxRatio = subtotal > 0 ? totalTax / subtotal : 0;
    totalTax = round2(netSubtotal * taxRatio);
    total = round2(netSubtotal + totalTax);
  }

  return {
    subtotal,
    discount: totalDiscount,
    netSubtotal: round2(subtotal - totalDiscount),
    tax: totalTax,
    total,
    items: calculatedItems
  };
}

/**
 * Calculate change for cash payment
 * @param {number} tendered - Amount given by customer
 * @param {number} total - Total amount due
 * @returns {number} Change amount (>= 0)
 */
function calculateChange(tendered, total) {
  return round2(Math.max(0, tendered - total));
}

/**
 * Split payments into cash vs non-cash
 * @param {Array} payments - Array of { paymentMethod, amount, tendered? }
 * @returns {Object} { cashTotal, cashTendered, nonCashTotal, hasCredit }
 */
function splitPayments(payments) {
  let cashTotal = 0;
  let cashTendered = 0;
  let nonCashTotal = 0;
  let hasCredit = false;

  for (const p of payments) {
    const amt = round2(p.amount);
    if (p.paymentMethod === 'cash') {
      cashTotal = round2(cashTotal + amt);
      cashTendered = round2(cashTendered + round2(p.tendered !== undefined ? p.tendered : amt));
    } else if (p.paymentMethod === 'credit') {
      hasCredit = true;
      nonCashTotal = round2(nonCashTotal + amt);
    } else {
      nonCashTotal = round2(nonCashTotal + amt);
    }
  }

  return { cashTotal, cashTendered, nonCashTotal, hasCredit };
}

module.exports = {
  round2,
  calculateLineItem,
  calculateCartTotals,
  calculateChange,
  splitPayments
};