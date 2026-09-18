const express = require('express');
const router = express.Router();
const catalogController = require('./catalogController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

// Products
router.get('/products', catalogController.getProducts);
router.get('/products/barcode/:barcode', catalogController.lookupBarcode);
router.get('/products/:id', catalogController.getProductById);
router.post('/products', requirePermission('inventory.adjust'), catalogController.createProduct);
router.put('/products/:id', requirePermission('inventory.adjust'), catalogController.updateProduct);

// Classifications
router.get('/categories', catalogController.getCategories);
router.post('/categories', catalogController.createCategory);
router.put('/categories/:id', catalogController.updateCategory);
router.delete('/categories/:id', catalogController.deleteCategory);
router.get('/brands', catalogController.getBrands);
router.post('/brands', catalogController.createBrand);
router.put('/brands/:id', catalogController.updateBrand);
router.delete('/brands/:id', catalogController.deleteBrand);
router.get('/units', catalogController.getUnits);
router.get('/price-lists', catalogController.getPriceLists);

module.exports = router;
