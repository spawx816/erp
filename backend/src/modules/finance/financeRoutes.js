const express = require('express');
const router = express.Router();
const financeController = require('./financeController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

// Accounts Receivable (CxC)
router.get('/receivables', requirePermission('cxc.view'), financeController.getReceivables);
router.get('/receivables/aging-table', requirePermission('cxc.view'), financeController.getCxCAgingTable);
router.post('/receivables/pay', requirePermission('cxc.pay'), financeController.receivePayment);

// Accounts Payable (CxP)
router.get('/payables', requirePermission('cxp.view'), financeController.getPayables);
router.post('/payables/pay', requirePermission('cxp.pay'), financeController.paySupplier);

// Expenses
router.get('/expenses', requirePermission('expenses.view'), financeController.getExpenses);
router.post('/expenses', requirePermission('expenses.create'), financeController.createExpense);
router.get('/expense-categories', financeController.getExpenseCategories);

// Recurring Expenses (Pagos Fijos)
router.get('/recurring-expenses', requirePermission('expenses.view'), financeController.getRecurringExpenses);
router.post('/recurring-expenses', requirePermission('expenses.create'), financeController.createRecurringExpense);
router.put('/recurring-expenses/:id', requirePermission('expenses.edit'), financeController.updateRecurringExpense);
router.post('/recurring-expenses/:id/pay', requirePermission('expenses.pay'), financeController.payRecurringExpense);

module.exports = router;
