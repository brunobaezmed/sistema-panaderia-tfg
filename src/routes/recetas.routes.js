const express = require('express');
const router = express.Router();
const { get, all, run } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// GET /api/recetas
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const recetas = await all(`
      SELECT r.*,
             p.nombre as producto_terminado_nombre,
             p.codigo as producto_terminado_codigo,
             u.simbolo as unidad_simbolo,
             (SELECT COUNT(*) FROM recetas_detalles WHERE receta_id = r.id) as cantidad_insumos
      FROM recetas r
      JOIN productos p ON r.producto_terminado_id = p.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE r.estado = 1
      ORDER BY r.nombre ASC
    `);

    res.json({ success: true, recetas });
  } catch (err) {
    next(err);
  }
});

// GET /api/recetas/:id
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const receta = await get(`
      SELECT r.*,
             p.nombre as producto_terminado_nombre,
             p.codigo as producto_terminado_codigo,
             u.simbolo as unidad_simbolo
      FROM recetas r
      JOIN productos p ON r.producto_terminado_id = p.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE r.id = ?
    `, [req.params.id]);

    if (!receta) {
      return res.status(404).json({ success: false, message: 'Receta no encontrada' });
    }

    const detalles = await all(`
      SELECT rd.*,
             p.nombre as insumo_nombre,
             p.codigo as insumo_codigo,
             p.precio_costo as insumo_costo_unitario,
             (rd.cantidad_requerida * p.precio_costo) as subtotal_costo,
             u.simbolo as unidad_simbolo
      FROM recetas_detalles rd
      JOIN productos p ON rd.insumo_id = p.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE rd.receta_id = ?
    `, [req.params.id]);

    const costoTotalCalculado = detalles.reduce((sum, item) => sum + (item.subtotal_costo || 0), 0);

    res.json({
      success: true,
      receta,
      detalles,
      costoTotalCalculado
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/recetas
router.post('/', verifyToken, checkRole(['admin', 'produccion']), async (req, res, next) => {
  try {
    const {
      codigo,
      nombre,
      descripcion,
      producto_terminado_id,
      rendimiento_unidades,
      tiempo_estimado_min,
      detalles
    } = req.body;

    if (!codigo || !nombre || !producto_terminado_id || !detalles || !detalles.length) {
      return res.status(400).json({ success: false, message: 'Datos incompletos o faltan insumos en la receta' });
    }

    // Calculate estimated cost
    let costoEstimado = 0;
    for (const d of detalles) {
      const ins = await get('SELECT precio_costo FROM productos WHERE id = ?', [d.insumo_id]);
      if (ins) {
        costoEstimado += (ins.precio_costo * d.cantidad_requerida);
      }
    }

    const result = await run(`
      INSERT INTO recetas (
        codigo, nombre, descripcion, producto_terminado_id,
        rendimiento_unidades, tiempo_estimado_min, costo_estimado, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      codigo,
      nombre,
      descripcion || '',
      producto_terminado_id,
      rendimiento_unidades || 1,
      tiempo_estimado_min || 60,
      costoEstimado
    ]);

    const recetaId = result.lastID;

    for (const d of detalles) {
      await run(`
        INSERT INTO recetas_detalles (receta_id, insumo_id, cantidad_requerida)
        VALUES (?, ?, ?)
      `, [recetaId, d.insumo_id, d.cantidad_requerida]);
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'CREAR_RECETA', 'recetas', recetaId, `Receta creada: ${nombre}`]
    );

    res.status(201).json({
      success: true,
      message: 'Fórmula/Receta guardada exitosamente',
      id: recetaId
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
