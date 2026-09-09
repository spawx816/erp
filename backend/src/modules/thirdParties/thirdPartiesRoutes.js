const express = require('express');
const router = express.Router();
const thirdPartiesController = require('./thirdPartiesController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

// Salespeople (Vendedores)
router.get('/salespeople', (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (req.user?.role_slug === 'admin' || req.user?.role_slug === 'super-admin' || req.user?.role_slug === 'gerente' || perms.includes('*') || perms.includes('salespeople.view') || perms.includes('sales.view')) {
    return next();
  }
  return requirePermission('salespeople.view')(req, res, next);
}, thirdPartiesController.getSalespeople);
router.get('/salespeople/:id', requirePermission('salespeople.view'), thirdPartiesController.getSalespersonById);
router.post('/salespeople', requirePermission('salespeople.create'), thirdPartiesController.createSalesperson);
router.put('/salespeople/:id', requirePermission('salespeople.edit'), thirdPartiesController.updateSalesperson);

// Customers
router.get('/customers', (req, res, next) => {
  const perms = req.user?.permissions || [];
  if (req.user?.role_slug === 'admin' || req.user?.role_slug === 'super-admin' || req.user?.role_slug === 'gerente' || perms.includes('*') || perms.includes('customers.view') || perms.includes('sales.view')) {
    return next();
  }
  return requirePermission('customers.view')(req, res, next);
}, thirdPartiesController.getCustomers);
router.get('/customers/:id/360', requirePermission('customers.view'), thirdPartiesController.getCustomer360);
router.get('/customers/:id/statement', requirePermission('customers.view'), thirdPartiesController.getCustomerStatement);
router.get('/customers/:id/collection-notes', requirePermission('customers.view'), thirdPartiesController.getCollectionNotes);
router.post('/customers/:id/collection-notes', requirePermission('customers.edit'), thirdPartiesController.addCollectionNote);
router.post('/customers', requirePermission('customers.create'), thirdPartiesController.createCustomer);
router.post('/customers/:id/toggle-block', requirePermission('customers.block'), thirdPartiesController.toggleCustomerCreditBlock);
router.put('/customers/:id', requirePermission('customers.edit'), thirdPartiesController.updateCustomer);
router.get('/rnc-lookup/:rnc', require('../fiscal/fiscalController').consultRNC);

// Suppliers
router.get('/suppliers', requirePermission('suppliers.view'), thirdPartiesController.getSuppliers);
router.get('/suppliers/:id', requirePermission('suppliers.view'), thirdPartiesController.getSupplierById);
router.post('/suppliers', requirePermission('suppliers.create'), thirdPartiesController.createSupplier);
router.put('/suppliers/:id', requirePermission('suppliers.edit'), thirdPartiesController.updateSupplier);

// Affiliates
router.get('/affiliates', requirePermission('settings.manage'), thirdPartiesController.getAffiliates);
router.post('/affiliates', requirePermission('settings.manage'), thirdPartiesController.createAffiliate);

module.exports = router;
