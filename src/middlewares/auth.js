/**
 * ============================================================================
 * MÓDULO: MIDDLEWARE DE SEGURIDAD Y AUTENTICACIÓN (auth.js)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Provee la verificación de tokens JWT y control de acceso basado en roles (RBAC):
 * - verifyToken: Valida la firma del token enviado en las cabeceras HTTP.
 * - checkRole: Valida que el rol del usuario posea los permisos necesarios.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tfg_panaderia_capiata_secret_key_2026';

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'] || req.headers['x-access-token'];
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Acceso no autorizado: Token no proporcionado.' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Token inválido o expirado.' });
    }
    req.usuario = decoded;
    next();
  });
};

// Check if user has one of the allowed roles
const checkRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ success: false, message: 'No autenticado.' });
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.usuario.rol)) {
      return res.status(403).json({
        success: false,
        message: `Permisos insuficientes. Rol requerido: ${allowedRoles.join(' o ')}`
      });
    }
    next();
  };
};

module.exports = {
  verifyToken,
  checkRole,
  JWT_SECRET
};
