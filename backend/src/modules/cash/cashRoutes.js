const express = require('express');
const router = express.Router();
const cashController = require('./cashController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

router.get('/registers', cashController.getRegisters);
router.get('/active-session', cashController.getActiveSession);
router.get('/sessions-history', cashController.getSessionHistory);
router.post('/open', requirePermission('cash.open'), cashController.openSession);
router.post('/movement', requirePermission('cash.withdraw'), cashController.recordCashMovement);
router.post('/close', requirePermission('cash.close'), cashController.closeSession);

module.exports = router;
