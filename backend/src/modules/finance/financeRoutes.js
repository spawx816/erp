const express = require('express');
const router = express.Router();
const financeController = require('./financeController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');
const { idempotencyMiddleware } = require('../../middlewares/idempotency');

router.use(authenticateToken);

// Accounts Receivable (CxC)
router.get('/receivables', (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (['admin', 'super-admin', 'gerente', 'cobros', 'cajero', 'vendedor'].includes(req.user?.role_slug) || perms.includes('*') || perms.includes('cxc.view') || perms.includes('cxc.*')) {
    return next();
  }
  return requirePermission('cxc.view')(req, res, next);
}, financeController.getReceivables);

router.get('/receivables/aging-table', (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (['admin', 'super-admin', 'gerente', 'cobros'].includes(req.user?.role_slug) || perms.includes('*') || perms.includes('cxc.view') || perms.includes('cxc.*')) {
    return next();
  }
  return requirePermission('cxc.view')(req, res, next);
}, financeController.getCxCAgingTable);

router.post('/receivables/pay', requirePermission('cxc.pay'), idempotencyMiddleware(), financeController.receivePayment);

// Accounts Payable (CxP)
router.get('/payables', (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (['admin', 'super-admin', 'gerente', 'almacen', 'cobros'].includes(req.user?.role_slug) || perms.includes('*') || perms.includes('cxp.view') || perms.includes('cxp.*')) {
    return next();
  }
  return requirePermission('cxp.view')(req, res, next);
}, financeController.getPayables);

router.post('/payables/pay', requirePermission('cxp.pay'), idempotencyMiddleware(), financeController.paySupplier);

// Expenses
router.get('/expenses', (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (['admin', 'super-admin', 'gerente', 'cajero'].includes(req.user?.role_slug) || perms.includes('*') || perms.includes('expenses.view') || perms.includes('expenses.*')) {
    return next();
  }
  return requirePermission('expenses.view')(req, res, next);
}, financeController.getExpenses);

router.post('/expenses', requirePermission('expenses.create'), financeController.createExpense);
router.delete('/expenses/:id', requirePermission('expenses.delete'), financeController.deleteExpense);
router.get('/expense-categories', financeController.getExpenseCategories);

// Recurring Expenses (Pagos Fijos)
router.get('/recurring-expenses', (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (['admin', 'super-admin', 'gerente', 'cajero'].includes(req.user?.role_slug) || perms.includes('*') || perms.includes('expenses.view') || perms.includes('expenses.*')) {
    return next();
  }
  return requirePermission('expenses.view')(req, res, next);
}, financeController.getRecurringExpenses);

router.post('/recurring-expenses', requirePermission('expenses.create'), financeController.createRecurringExpense);
router.put('/recurring-expenses/:id', requirePermission('expenses.edit'), financeController.updateRecurringExpense);
router.post('/recurring-expenses/:id/pay', requirePermission('expenses.pay'), financeController.payRecurringExpense);

module.exports = router;
