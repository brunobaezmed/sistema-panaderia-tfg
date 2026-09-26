/**
 * ============================================================================
 * MÓDULO: RUTAS DE AUTENTICACIÓN (/api/auth)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Gestiona el inicio de sesión, validación de contraseñas con bcrypt,
 * emisión de tokens JWT y consulta del perfil del usuario autenticado.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { get, run } = require('../config/database');
const { verifyToken, JWT_SECRET } = require('../middlewares/auth');

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña requeridos' });
    }

    const usuario = await get('SELECT * FROM usuarios WHERE email = ? AND estado = 1', [email]);
    if (!usuario) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas o usuario inactivo' });
    }

    const passwordMatch = await bcrypt.compare(password, usuario.password);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    // Auditoría
    await run(
      'INSERT INTO auditoria_logs (usuario_id, accion, detalles, ip) VALUES (?, ?, ?, ?)',
      [usuario.id, 'INICIO_SESION', `Inicio de sesión exitoso como ${usuario.rol}`, req.ip]
    );

    res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        telefono: usuario.telefono
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/perfil
router.get('/perfil', verifyToken, async (req, res, next) => {
  try {
    const usuario = await get('SELECT id, nombre, email, rol, telefono, created_at FROM usuarios WHERE id = ?', [req.usuario.id]);
    if (!usuario) {
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    res.json({ success: true, usuario });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
