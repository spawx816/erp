// Memory-efficient rate limiter tracking failed attempts with compound IP + account key
const loginAttempts = new Map();

// Periodic prune to prevent unbounded memory growth
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now > record.resetTime) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

function loginRateLimiter(maxAttempts = 10, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const username = req.body && req.body.username ? String(req.body.username).trim().toLowerCase() : '';
    const key = `${ip}:${username}`;
    const now = Date.now();

    const record = loginAttempts.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
      loginAttempts.set(key, record);
    }

    if (record.count >= maxAttempts) {
      const remainingSeconds = Math.ceil((record.resetTime - now) / 1000);
      return res.status(429).json({
        success: false,
        message: `Demasiados intentos fallidos de inicio de sesión. Por seguridad, intente nuevamente en ${remainingSeconds} segundos.`
      });
    }

    // Intercept response to only increment on failed attempts and reset on success
    res.on('finish', () => {
      if (res.statusCode >= 400 && res.statusCode < 500) {
        // Increment on client-side authentication failure (e.g. 400, 401, 403)
        record.count++;
        loginAttempts.set(key, record);
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        // Reset counter on successful login
        loginAttempts.delete(key);
      }
    });

    next();
  };
}

module.exports = {
  loginRateLimiter
};
