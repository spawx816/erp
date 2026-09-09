// Simple, memory-efficient in-process rate limiter for brute-force protection
const loginAttempts = new Map();

function loginRateLimiter(maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    const record = loginAttempts.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      loginAttempts.set(ip, record);
      return next();
    }

    if (record.count >= maxAttempts) {
      const remainingSeconds = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        success: false,
        message: `Demasiados intentos fallidos de inicio de sesión. Por seguridad, intente nuevamente en ${remainingSeconds} segundos.`
      });
    }

    record.count++;
    loginAttempts.set(ip, record);
    next();
  };
}

module.exports = {
  loginRateLimiter
};
