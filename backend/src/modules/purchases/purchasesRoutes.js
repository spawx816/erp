const express = require('express');
const router = express.Router();
const purchasesController = require('./purchasesController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');
const { idempotencyMiddleware } = require('../../middlewares/idempotency');

router.use(authenticateToken);

// Purchase Orders Routes
router.get('/orders', purchasesController.getPurchaseOrders);
router.get('/orders/:id', purchasesController.getPurchaseOrderById);
router.post('/orders', requirePermission('purchases.create'), purchasesController.createPurchaseOrder);
router.put('/orders/:id', requirePermission('purchases.create'), purchasesController.updatePurchaseOrder);
router.put('/orders/:id/status', requirePermission('purchases.create'), purchasesController.updatePurchaseOrderStatus);
router.post('/orders/:id/receive', requirePermission('purchases.create'), purchasesController.receivePurchaseOrder);

// Direct Purchases Routes
router.get('/', purchasesController.getPurchases);
router.get('/:id', purchasesController.getPurchaseById);
router.post('/', requirePermission('purchases.create'), idempotencyMiddleware(), purchasesController.createPurchase);

module.exports = router;
