const express = require('express');
const router = express.Router();
const salesController = require('./salesController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

// Sales & POS
router.get('/', requirePermission('sales.view'), salesController.getSales);
router.get('/:id', requirePermission('sales.view'), salesController.getSaleById);
router.post('/checkout', requirePermission('sales.create'), salesController.checkout);
router.post('/:id/cancel', requirePermission('sales.cancel'), salesController.cancelSale);

// Commissions
router.get('/commissions/list', requirePermission('commissions.view'), salesController.getCommissions);
router.post('/commissions/pay', requirePermission('commissions.pay'), salesController.payCommissions);

// Credit Notes
router.get('/credit-notes/list', requirePermission('sales.view'), salesController.getCreditNotes);
router.get('/credit-notes/:id', requirePermission('sales.view'), salesController.getCreditNoteById);
router.post('/credit-notes', requirePermission('sales.return'), salesController.createCreditNote);

// Quotes
router.get('/quotes/list', requirePermission('quotes.view'), salesController.getQuotes);
router.post('/quotes', requirePermission('quotes.create'), salesController.createQuote);

module.exports = router;
