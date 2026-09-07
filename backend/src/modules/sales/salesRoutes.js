const express = require('express');
const router = express.Router();
const salesController = require('./salesController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

// Sales & POS
router.get('/', salesController.getSales);
router.get('/:id', salesController.getSaleById);
router.post('/checkout', requirePermission('sales.create'), salesController.checkout);
router.post('/:id/cancel', requirePermission('sales.cancel'), salesController.cancelSale);

// Commissions
router.get('/commissions/list', salesController.getCommissions);
router.post('/commissions/pay', salesController.payCommissions);

// Credit Notes
router.get('/credit-notes/list', salesController.getCreditNotes);
router.get('/credit-notes/:id', salesController.getCreditNoteById);
router.post('/credit-notes', requirePermission('sales.create'), salesController.createCreditNote);

// Quotes
router.get('/quotes/list', salesController.getQuotes);
router.post('/quotes', requirePermission('sales.create'), salesController.createQuote);

module.exports = router;

