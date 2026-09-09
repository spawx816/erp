const express = require('express');
const router = express.Router();
const adminController = require('./adminController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

// Global Search
router.get('/search', adminController.globalSearch);

// Notifications Center
router.get('/notifications', adminController.getNotifications);
router.post('/notifications/:id/read', adminController.markNotificationRead);

// Authorizations (Operaciones sensibles)
router.get('/authorizations', requirePermission('authorizations.view'), adminController.getAuthorizations);
router.post('/authorizations/request', adminController.requestAuthorization);
router.post('/authorizations/:id/approve', requirePermission('authorizations.approve'), adminController.approveAuthorization);

// Users & RBAC
router.get('/users', requirePermission('users.view'), adminController.getUsers);
router.post('/users', requirePermission('users.create'), adminController.createUser);
router.put('/users/:id', requirePermission('users.update'), adminController.updateUser);
router.get('/roles', requirePermission('users.view'), adminController.getRoles);

// Branches & Warehouses
router.get('/branches-warehouses', adminController.getBranchesAndWarehouses);
router.post('/branches', requirePermission('settings.manage'), adminController.createBranch);
router.post('/warehouses', requirePermission('settings.manage'), adminController.createWarehouse);

// Audit & Backups
router.get('/audit-logs', requirePermission('audit.view'), adminController.getAuditLogs);
router.get('/backups', requirePermission('settings.manage'), adminController.getBackups);
router.post('/backups', requirePermission('settings.manage'), adminController.createBackup);

module.exports = router;
