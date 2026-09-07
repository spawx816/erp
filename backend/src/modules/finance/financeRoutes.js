const express = require('express');
const router = express.Router();
const financeController = require('./financeController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

// Accounts Receivable (CxC)
router.get('/receivables', financeController.getReceivables);
router.get('/receivables/aging-table', financeController.getCxCAgingTable);
router.post('/receivables/pay', requirePermission('cxc.pay'), financeController.receivePayment);

// Accounts Payable (CxP)
router.get('/payables', financeController.getPayables);
router.post('/payables/pay', requirePermission('cxp.pay'), financeController.paySupplier);

// Expenses
router.get('/expenses', financeController.getExpenses);
router.post('/expenses', financeController.createExpense);
router.get('/expense-categories', financeController.getExpenseCategories);

// Recurring Expenses (Pagos Fijos)
router.get('/recurring-expenses', financeController.getRecurringExpenses);
router.post('/recurring-expenses', financeController.createRecurringExpense);
router.put('/recurring-expenses/:id', financeController.updateRecurringExpense);
router.post('/recurring-expenses/:id/pay', financeController.payRecurringExpense);

module.exports = router;
