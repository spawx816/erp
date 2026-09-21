const express = require('express');
const router = express.Router();
const salesController = require('./salesController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');
const { idempotencyMiddleware } = require('../../middlewares/idempotency');

router.use(authenticateToken);

// Orders & Pedidos Workflow
router.use('/orders', require('./ordersRoutes'));

// Sales & POS list & checkout
router.get('/', requirePermission('sales.view'), salesController.getSales);
router.get('/history', requirePermission('sales.view'), salesController.getSales);
router.post('/checkout', requirePermission('sales.create'), idempotencyMiddleware(), salesController.checkout);

// Commissions
router.get('/commissions/monthly-summary', requirePermission('commissions.view'), salesController.getMonthlyCommissionsSummary);
router.post('/commissions/pay-monthly', requirePermission('commissions.pay'), salesController.payMonthlyCommissions);
router.get('/commissions/list', requirePermission('commissions.view'), salesController.getCommissions);
router.post('/commissions/pay', requirePermission('commissions.pay'), salesController.payCommissions);

// Credit Notes
router.get('/credit-notes/list', requirePermission('sales.view'), salesController.getCreditNotes);
router.get('/credit-notes/:id', requirePermission('sales.view'), salesController.getCreditNoteById);
router.post('/credit-notes', requirePermission('sales.return'), idempotencyMiddleware(), salesController.createCreditNote);

// Quotes
router.get('/quotes/list', requirePermission('quotes.view'), salesController.getQuotes);
router.post('/quotes', requirePermission('quotes.create'), salesController.createQuote);

// Parameterized sale routes (must be at the end)
router.get('/:id', requirePermission('sales.view'), salesController.getSaleById);
router.post('/:id/cancel', requirePermission('sales.cancel'), idempotencyMiddleware(), salesController.cancelSale);

module.exports = router;
