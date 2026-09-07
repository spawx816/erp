const express = require('express');
const router = express.Router();
const thirdPartiesController = require('./thirdPartiesController');
const { authenticateToken } = require('../../middlewares/auth');

router.use(authenticateToken);

// Salespeople (Vendedores)
router.get('/salespeople', thirdPartiesController.getSalespeople);
router.get('/salespeople/:id', thirdPartiesController.getSalespersonById);
router.post('/salespeople', thirdPartiesController.createSalesperson);
router.put('/salespeople/:id', thirdPartiesController.updateSalesperson);

// Customers
router.get('/customers', thirdPartiesController.getCustomers);
router.get('/customers/:id/360', thirdPartiesController.getCustomer360);
router.get('/customers/:id/statement', thirdPartiesController.getCustomerStatement);
router.get('/customers/:id/collection-notes', thirdPartiesController.getCollectionNotes);
router.post('/customers/:id/collection-notes', thirdPartiesController.addCollectionNote);
router.post('/customers', thirdPartiesController.createCustomer);
router.post('/customers/:id/toggle-block', thirdPartiesController.toggleCustomerCreditBlock);
router.put('/customers/:id', thirdPartiesController.updateCustomer);
router.get('/rnc-lookup/:rnc', require('../fiscal/fiscalController').consultRNC);

// Suppliers
router.get('/suppliers', thirdPartiesController.getSuppliers);
router.get('/suppliers/:id', thirdPartiesController.getSupplierById);
router.post('/suppliers', thirdPartiesController.createSupplier);
router.put('/suppliers/:id', thirdPartiesController.updateSupplier);

// Affiliates
router.get('/affiliates', thirdPartiesController.getAffiliates);
router.post('/affiliates', thirdPartiesController.createAffiliate);

module.exports = router;
