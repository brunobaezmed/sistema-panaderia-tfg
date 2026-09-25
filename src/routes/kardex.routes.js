const express = require('express');
const router = express.Router();
const { all } = require('../config/database');
const { verifyToken } = require('../middlewares/auth');

// GET /api/kardex
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { producto_id, deposito_id, tipo_movimiento, fecha_desde, fecha_hasta, limit = 200 } = req.query;

    let query = `
      SELECT k.*,
             p.nombre as producto_nombre,
             p.codigo as producto_codigo,
             p.tipo as producto_tipo,
             d.nombre as deposito_nombre,
             u.nombre as usuario_nombre,
             um.simbolo as unidad_simbolo
      FROM kardex k
      JOIN productos p ON k.producto_id = p.id
      JOIN depositos d ON k.deposito_id = d.id
      LEFT JOIN usuarios u ON k.usuario_id = u.id
      LEFT JOIN unidades_medida um ON p.unidad_id = um.id
      WHERE 1=1
    `;
    const params = [];

    if (producto_id) {
      query += ' AND k.producto_id = ?';
      params.push(producto_id);
    }
    if (deposito_id) {
      query += ' AND k.deposito_id = ?';
      params.push(deposito_id);
    }
    if (tipo_movimiento) {
      query += ' AND k.tipo_movimiento = ?';
      params.push(tipo_movimiento);
    }
    if (fecha_desde) {
      query += ' AND DATE(k.fecha) >= ?';
      params.push(fecha_desde);
    }
    if (fecha_hasta) {
      query += ' AND DATE(k.fecha) <= ?';
      params.push(fecha_hasta);
    }

    query += ' ORDER BY k.id DESC LIMIT ?';
    params.push(parseInt(limit) || 200);

    const movimientos = await all(query, params);
    res.json({ success: true, movimientos });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
