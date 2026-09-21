const express = require('express');
const router = express.Router();
const inventoryController = require('./inventoryController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');
const { idempotencyMiddleware } = require('../../middlewares/idempotency');

router.use(authenticateToken);

router.get('/stock', inventoryController.getStock);
router.get('/kardex', inventoryController.getKardex);
router.get('/movements', inventoryController.getKardex);
router.get('/lots', inventoryController.getLots);
router.get('/analysis', inventoryController.getInventoryAnalysis);
router.post('/adjust', requirePermission('inventory.adjust'), idempotencyMiddleware(), inventoryController.adjustStock);
router.get('/transfers', inventoryController.getTransfers);
router.post('/transfers', requirePermission('inventory.transfer'), idempotencyMiddleware(), inventoryController.createTransfer);
router.post('/transfers/:id/receive', requirePermission('inventory.transfer'), idempotencyMiddleware(), inventoryController.receiveTransfer);

module.exports = router;
