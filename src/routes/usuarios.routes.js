/**
 * ============================================================================
 * MÓDULO: ADMINISTRACIÓN DE USUARIOS (/api/usuarios)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Gestión de usuarios, roles de acceso y contraseñas cifradas con bcrypt.
 * Módulo de acceso restringido exclusivamente para administradores.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { get, all, run } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// GET /api/usuarios
router.get('/', verifyToken, checkRole(['admin']), async (req, res, next) => {
  try {
    const usuarios = await all('SELECT id, nombre, email, rol, telefono, estado, created_at FROM usuarios ORDER BY id ASC');
    res.json({ success: true, usuarios });
  } catch (err) {
    next(err);
  }
});

// POST /api/usuarios
router.post('/', verifyToken, checkRole(['admin']), async (req, res, next) => {
  try {
    const { nombre, email, password, rol, telefono } = req.body;
    if (!nombre || !email || !password || !rol) {
      return res.status(400).json({ success: false, message: 'Todos los campos requeridos deben ser completados' });
    }

    const existe = await get('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe) {
      return res.status(400).json({ success: false, message: 'El correo electrónico ya está registrado' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await run(`
      INSERT INTO usuarios (nombre, email, password, rol, telefono, estado)
      VALUES (?, ?, ?, ?, ?, 1)
    `, [nombre, email, hashedPassword, rol, telefono || '']);

    res.status(201).json({
      success: true,
      message: 'Usuario creado exitosamente',
      id: result.lastID
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/usuarios/:id/estado
router.put('/:id/estado', verifyToken, checkRole(['admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (parseInt(id) === req.usuario.id) {
      return res.status(400).json({ success: false, message: 'No puedes desactivar tu propio usuario' });
    }

    await run('UPDATE usuarios SET estado = ? WHERE id = ?', [estado ? 1 : 0, id]);
    res.json({ success: true, message: `Usuario ${estado ? 'activado' : 'desactivado'} correctamente` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
