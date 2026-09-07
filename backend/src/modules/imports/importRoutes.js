const express = require('express');
const router = express.Router();
const importController = require('./importController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

router.post('/preview', requirePermission('settings.manage'), importController.previewAndValidate);
router.post('/execute', requirePermission('settings.manage'), importController.executeImport);

module.exports = router;
