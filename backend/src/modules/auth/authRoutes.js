const express = require('express');
const router = express.Router();
const authController = require('./authController');
const { authenticateToken } = require('../../middlewares/auth');
const { loginRateLimiter } = require('../../middlewares/rateLimiter');

router.post('/login', loginRateLimiter(10, 15 * 60 * 1000), authController.login);
router.get('/me', authenticateToken, authController.me);
router.post('/logout', authenticateToken, authController.logout);

module.exports = router;
