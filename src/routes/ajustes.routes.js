const express = require('express');
const router = express.Router();
const { get, all, run, actualizarStock, registrarKardex } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// GET /api/ajustes
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const ajustes = await all(`
      SELECT a.*,
             d.nombre as deposito_nombre,
             u.nombre as usuario_nombre,
             (SELECT COUNT(*) FROM ajustes_detalles WHERE ajuste_id = a.id) as total_items
      FROM ajustes_stock a
      JOIN depositos d ON a.deposito_id = d.id
      JOIN usuarios u ON a.usuario_id = u.id
      ORDER BY a.id DESC
      LIMIT 100
    `);

    res.json({ success: true, ajustes });
  } catch (err) {
    next(err);
  }
});

// GET /api/ajustes/:id
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const ajuste = await get(`
      SELECT a.*,
             d.nombre as deposito_nombre,
             u.nombre as usuario_nombre
      FROM ajustes_stock a
      JOIN depositos d ON a.deposito_id = d.id
      JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.id = ?
    `, [req.params.id]);

    if (!ajuste) {
      return res.status(404).json({ success: false, message: 'Ajuste no encontrado' });
    }

    const detalles = await all(`
      SELECT ad.*,
             p.nombre as producto_nombre,
             p.codigo as producto_codigo,
             u.simbolo as unidad_simbolo
      FROM ajustes_detalles ad
      JOIN productos p ON ad.producto_id = p.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE ad.ajuste_id = ?
    `, [req.params.id]);

    res.json({ success: true, ajuste, detalles });
  } catch (err) {
    next(err);
  }
});

// POST /api/ajustes
router.post('/', verifyToken, checkRole(['admin', 'deposito']), async (req, res, next) => {
  try {
    const { deposito_id, tipo_ajuste, motivo, observaciones = '', items } = req.body;

    if (!deposito_id || !tipo_ajuste || !motivo || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Datos incompletos para el ajuste de inventario' });
    }

    const countAjustes = await get('SELECT COUNT(*) as count FROM ajustes_stock');
    const codigoAjuste = `AJU-${String(countAjustes.count + 1).padStart(5, '0')}`;

    const resultAjuste = await run(`
      INSERT INTO ajustes_stock (codigo, deposito_id, usuario_id, fecha, tipo_ajuste, motivo, observaciones)
      VALUES (?, ?, ?, DATE('now', 'localtime'), ?, ?, ?)
    `, [codigoAjuste, deposito_id, req.usuario.id, tipo_ajuste, motivo, observaciones]);

    const ajusteId = resultAjuste.lastID;

    for (const item of items) {
      const stockRow = await get(
        'SELECT cantidad FROM stock_deposito WHERE producto_id = ? AND deposito_id = ?',
        [item.producto_id, deposito_id]
      );
      const stockAnterior = stockRow ? stockRow.cantidad : 0;
      let diferencia = 0;
      let nuevoStock = 0;

      if (tipo_ajuste === 'inventario_fisico') {
        nuevoStock = Number(item.cantidad_ajustada);
        diferencia = nuevoStock - stockAnterior;
      } else if (tipo_ajuste === 'ingreso') {
        diferencia = Number(item.cantidad_ajustada);
        nuevoStock = stockAnterior + diferencia;
      } else if (tipo_ajuste === 'egreso') {
        diferencia = -Number(item.cantidad_ajustada);
        nuevoStock = Math.max(0, stockAnterior - Number(item.cantidad_ajustada));
      }

      // Save detail
      await run(`
        INSERT INTO ajustes_detalles (ajuste_id, producto_id, cantidad_anterior, cantidad_ajustada, diferencia)
        VALUES (?, ?, ?, ?, ?)
      `, [ajusteId, item.producto_id, stockAnterior, nuevoStock, diferencia]);

      // Update actual stock
      await run(
        'INSERT INTO stock_deposito (producto_id, deposito_id, cantidad) VALUES (?, ?, ?) ON CONFLICT(producto_id, deposito_id) DO UPDATE SET cantidad = ?',
        [item.producto_id, deposito_id, nuevoStock, nuevoStock]
      );

      const prod = await get('SELECT precio_costo FROM productos WHERE id = ?', [item.producto_id]);
      const costo = prod ? prod.precio_costo : 0;

      // Register Kardex
      await registrarKardex({
        producto_id: item.producto_id,
        deposito_id,
        tipo_movimiento: diferencia >= 0 ? 'AJUSTE_POSITIVO' : 'AJUSTE_NEGATIVO',
        referencia_id: ajusteId,
        referencia_documento: codigoAjuste,
        cantidad_entrada: diferencia > 0 ? diferencia : 0,
        cantidad_salida: diferencia < 0 ? Math.abs(diferencia) : 0,
        costo_unitario: costo,
        usuario_id: req.usuario.id,
        observaciones: `Ajuste (${motivo}): ${observaciones || 'Corrección de inventario'}`
      });
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'AJUSTE_INVENTARIO', 'ajustes_stock', ajusteId, `Ajuste ${codigoAjuste} (${motivo}) aplicado`]
    );

    res.status(201).json({
      success: true,
      message: `Ajuste de inventario ${codigoAjuste} aplicado correctamente`,
      ajusteId
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
