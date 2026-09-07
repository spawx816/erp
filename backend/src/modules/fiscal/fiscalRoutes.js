const express = require('express');
const router = express.Router();
const fiscalController = require('./fiscalController');
const { authenticateToken } = require('../../middlewares/auth');
const { requirePermission } = require('../../middlewares/rbac');

router.use(authenticateToken);

router.get('/sequences', fiscalController.getSequences);
router.post('/sequences', requirePermission('fiscal.manage'), fiscalController.createSequence);
router.get('/document-types', fiscalController.getDocumentTypes);

// RNC / Cédula DGII Consultation (Megaplus API integration)
router.get('/rnc/consulta/:rnc', fiscalController.consultRNC);
router.get('/rnc/buscar-nombre', fiscalController.searchRNCByName);

module.exports = router;
