const express = require('express');
const router = express.Router();
const settingsController = require('./settingsController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

router.get('/', settingsController.getCompanySettings);
router.put('/', requirePermission('settings.manage'), settingsController.updateCompanySettings);

module.exports = router;
