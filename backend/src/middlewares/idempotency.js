// In-memory idempotency cache to prevent duplicate financial and inventory transactions
const idempotencyStore = new Map();

// Periodic prune to prevent memory leaks
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of idempotencyStore.entries()) {
    if (now - record.createdAt > (record.ttlMs || 120000)) {
      idempotencyStore.delete(key);
    }
  }
}, 60 * 1000);

if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * Middleware that guarantees idempotent request handling using Idempotency-Key header.
 * @param {Object} options
 * @param {number} options.ttlMs - Expiration time in ms (default: 120,000ms = 2 min)
 */
function idempotencyMiddleware(options = {}) {
  const ttlMs = options.ttlMs || 120000;

  return (req, res, next) => {
    // Only apply to state-changing HTTP methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
    if (!idempotencyKey) {
      return next();
    }

    const companyId = req.user?.company_id || 'anonymous';
    const path = req.originalUrl || `${req.baseUrl || ''}${req.path}`;
    const cacheKey = `${companyId}:${req.method}:${path}:${String(idempotencyKey).trim()}`;

    const existing = idempotencyStore.get(cacheKey);

    if (existing) {
      if (existing.status === 'pending') {
        return res.status(409).json({
          success: false,
          message: 'Una solicitud con la misma clave de idempotencia se encuentra actualmente en proceso. Por favor espere.'
        });
      }

      if (existing.status === 'completed') {
        res.setHeader('Idempotent-Replayed', 'true');
        return res.status(existing.statusCode).json(existing.body);
      }
    }

    // Mark key as pending
    idempotencyStore.set(cacheKey, {
      status: 'pending',
      createdAt: Date.now(),
      ttlMs
    });

    // Capture response
    const originalJson = res.json.bind(res);
    let captured = false;

    res.json = (body) => {
      if (!captured) {
        captured = true;
        // Only cache valid operational responses (success and domain client errors like 400, 422)
        // Never cache 500 server errors so client can retry safely
        if (res.statusCode < 500) {
          idempotencyStore.set(cacheKey, {
            status: 'completed',
            statusCode: res.statusCode,
            body,
            createdAt: Date.now(),
            ttlMs
          });
        } else {
          idempotencyStore.delete(cacheKey);
        }
      }
      return originalJson(body);
    };

    res.on('close', () => {
      const entry = idempotencyStore.get(cacheKey);
      if (entry && entry.status === 'pending') {
        idempotencyStore.delete(cacheKey);
      }
    });

    next();
  };
}

module.exports = {
  idempotencyMiddleware,
  _store: idempotencyStore // Exported for unit testing
};
