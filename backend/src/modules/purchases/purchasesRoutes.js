const express = require('express');
const router = express.Router();
const purchasesController = require('./purchasesController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

router.get('/', purchasesController.getPurchases);
router.get('/:id', purchasesController.getPurchaseById);
router.post('/', requirePermission('purchases.create'), purchasesController.createPurchase);

module.exports = router;
