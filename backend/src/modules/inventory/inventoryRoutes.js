const express = require('express');
const router = express.Router();
const inventoryController = require('./inventoryController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

router.get('/stock', inventoryController.getStock);
router.get('/kardex', inventoryController.getKardex);
router.get('/lots', inventoryController.getLots);
router.get('/analysis', inventoryController.getInventoryAnalysis);
router.post('/adjust', requirePermission('inventory.adjust'), inventoryController.adjustStock);
router.get('/transfers', inventoryController.getTransfers);
router.post('/transfers', requirePermission('inventory.transfer'), inventoryController.createTransfer);
router.post('/transfers/:id/receive', requirePermission('inventory.transfer'), inventoryController.receiveTransfer);

module.exports = router;
