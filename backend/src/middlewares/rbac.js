function requirePermission(permissionSlug) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }

    // Only 'super-admin' has total wildcard bypass
    if (req.user.role_slug === 'super-admin') {
      return next();
    }

    const permissions = req.user.permissions || [];

    // Check for universal wildcard '*' or module wildcard (e.g. 'sales.*')
    if (permissions.includes('*')) {
      return next();
    }

    if (permissionSlug) {
      const modulePrefix = permissionSlug.split('.')[0] + '.*';
      if (permissions.includes(permissionSlug) || permissions.includes(modulePrefix)) {
        return next();
      }
    }

    return res.status(403).json({
      success: false,
      message: `Acceso denegado. Se requiere el permiso específico: [${permissionSlug}].`
    });
  };
}

module.exports = {
  requirePermission
};
