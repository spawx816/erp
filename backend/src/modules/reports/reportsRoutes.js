const express = require('express');
const router = express.Router();
const reportsController = require('./reportsController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

router.get('/dashboard', requirePermission('dashboard.view'), reportsController.getExecutiveDashboard);
router.get('/monthly-closing', requirePermission('reports.view'), reportsController.getMonthlyClosing);
router.post('/monthly-closing', requirePermission('monthly_closing.execute'), reportsController.saveMonthlyClosing);
router.get('/center', requirePermission('reports.view'), reportsController.getReportsCenter);
router.get('/sales', requirePermission('reports.view'), reportsController.getSalesReport);
router.get('/inventory-valuation', requirePermission('reports.view'), reportsController.getInventoryValuationReport);

module.exports = router;
