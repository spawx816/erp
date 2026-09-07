const express = require('express');
const router = express.Router();
const reportsController = require('./reportsController');
const { authenticateToken } = require('../../middlewares/auth');

router.use(authenticateToken);

router.get('/dashboard', reportsController.getExecutiveDashboard);
router.get('/monthly-closing', reportsController.getMonthlyClosing);
router.post('/monthly-closing', reportsController.saveMonthlyClosing);
router.get('/center', reportsController.getReportsCenter);
router.get('/sales', reportsController.getSalesReport);
router.get('/inventory-valuation', reportsController.getInventoryValuationReport);

module.exports = router;
