function requirePermission(permissionSlug) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }

    // Super Admin, Admin, and Gerente have universal access
    if (req.user.role_slug === 'super-admin' || req.user.role_slug === 'admin' || req.user.role_slug === 'gerente') {
      return next();
    }

    if (!req.user.permissions || !req.user.permissions.includes(permissionSlug)) {
      return res.status(403).json({
        success: false,
        message: `Acceso denegado. Se requiere el permiso: [${permissionSlug}].`
      });
    }

    next();
  };
}

module.exports = {
  requirePermission
};
