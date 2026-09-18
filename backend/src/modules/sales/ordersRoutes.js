const express = require('express');
const router = express.Router();
const ordersController = require('./ordersController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');
const { idempotencyMiddleware } = require('../../middlewares/idempotency');

router.use(authenticateToken);

// Sales Orders Routes
router.get('/', requirePermission('orders.view'), ordersController.getOrders);
router.get('/:id', requirePermission('orders.view'), ordersController.getOrderById);
router.post('/', requirePermission('orders.create'), idempotencyMiddleware(), ordersController.createOrder);
router.post('/:id/approve', requirePermission('orders.approve'), ordersController.approveOrder);
router.post('/:id/reject', requirePermission('orders.approve'), ordersController.rejectOrder);
router.post('/:id/dispatch', requirePermission('orders.dispatch'), ordersController.dispatchOrder);
router.post('/:id/invoice', requirePermission('sales.create'), idempotencyMiddleware(), ordersController.invoiceOrder);

module.exports = router;
