const express = require('express');
const router = express.Router();
const { get, all, run, actualizarStock, registrarKardex } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// GET /api/depositos
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const depositos = await all(`
      SELECT d.*,
             (SELECT COUNT(DISTINCT producto_id) FROM stock_deposito WHERE deposito_id = d.id AND cantidad > 0) as total_items,
             (SELECT COALESCE(SUM(s.cantidad * p.precio_costo), 0)
              FROM stock_deposito s
              JOIN productos p ON s.producto_id = p.id
              WHERE s.deposito_id = d.id) as valor_inventario
      FROM depositos d
      ORDER BY d.es_principal DESC, d.nombre ASC
    `);

    res.json({ success: true, depositos });
  } catch (err) {
    next(err);
  }
});

// GET /api/depositos/:id/stock
router.get('/:id/stock', verifyToken, async (req, res, next) => {
  try {
    const stock = await all(`
      SELECT s.id as stock_id,
             s.cantidad,
             p.id as producto_id,
             p.codigo,
             p.codigo_barra,
             p.nombre,
             p.tipo,
             p.precio_costo,
             p.precio_venta,
             p.stock_minimo,
             c.nombre as categoria,
             u.simbolo as unidad
      FROM stock_deposito s
      JOIN productos p ON s.producto_id = p.id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE s.deposito_id = ? AND p.estado = 1
      ORDER BY p.tipo DESC, p.nombre ASC
    `, [req.params.id]);

    res.json({ success: true, stock });
  } catch (err) {
    next(err);
  }
});

// GET /api/depositos/transferencias/historial
router.get('/transferencias/historial', verifyToken, async (req, res, next) => {
  try {
    const transferencias = await all(`
      SELECT t.*,
             d_orig.nombre as deposito_origen,
             d_dest.nombre as deposito_destino,
             usr.nombre as usuario_nombre,
             (SELECT COUNT(*) FROM transferencias_detalles WHERE transferencia_id = t.id) as total_items
      FROM transferencias t
      JOIN depositos d_orig ON t.deposito_origen_id = d_orig.id
      JOIN depositos d_dest ON t.deposito_destino_id = d_dest.id
      JOIN usuarios usr ON t.usuario_id = usr.id
      ORDER BY t.id DESC
      LIMIT 100
    `);

    res.json({ success: true, transferencias });
  } catch (err) {
    next(err);
  }
});

// POST /api/depositos/transferencias
router.post('/transferencias', verifyToken, checkRole(['admin', 'deposito', 'produccion']), async (req, res, next) => {
  try {
    const { deposito_origen_id, deposito_destino_id, motivo = '', items } = req.body;

    if (!deposito_origen_id || !deposito_destino_id || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Faltan datos de depósitos o productos a transferir' });
    }

    if (parseInt(deposito_origen_id) === parseInt(deposito_destino_id)) {
      return res.status(400).json({ success: false, message: 'El depósito origen y destino no pueden ser iguales' });
    }

    // 1. Verify stock for each item in source deposit
    for (const item of items) {
      const stockRow = await get(
        'SELECT cantidad FROM stock_deposito WHERE producto_id = ? AND deposito_id = ?',
        [item.producto_id, deposito_origen_id]
      );
      const disp = stockRow ? stockRow.cantidad : 0;
      if (disp < item.cantidad) {
        const prod = await get('SELECT nombre FROM productos WHERE id = ?', [item.producto_id]);
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente para transferir: ${prod ? prod.nombre : 'Producto'}. Disponible: ${disp}, Solicitado: ${item.cantidad}`
        });
      }
    }

    // 2. Create transfer header
    const countTrans = await get('SELECT COUNT(*) as count FROM transferencias');
    const codigoTrans = `TRF-${String(countTrans.count + 1).padStart(5, '0')}`;

    const resultTrans = await run(`
      INSERT INTO transferencias (codigo, deposito_origen_id, deposito_destino_id, usuario_id, fecha, motivo, estado)
      VALUES (?, ?, ?, ?, DATE('now', 'localtime'), ?, 'completada')
    `, [codigoTrans, deposito_origen_id, deposito_destino_id, req.usuario.id, motivo]);

    const transferenciaId = resultTrans.lastID;

    // 3. Process each item: update stock & Kardex
    for (const item of items) {
      const prod = await get('SELECT precio_costo FROM productos WHERE id = ?', [item.producto_id]);
      const costo = prod ? prod.precio_costo : 0;

      // Save detail
      await run(`
        INSERT INTO transferencias_detalles (transferencia_id, producto_id, cantidad)
        VALUES (?, ?, ?)
      `, [transferenciaId, item.producto_id, item.cantidad]);

      // Deduct from origin
      await actualizarStock(item.producto_id, deposito_origen_id, -item.cantidad);
      await registrarKardex({
        producto_id: item.producto_id,
        deposito_id: deposito_origen_id,
        tipo_movimiento: 'TRANSFERENCIA_SALIDA',
        referencia_id: transferenciaId,
        referencia_documento: codigoTrans,
        cantidad_salida: item.cantidad,
        costo_unitario: costo,
        usuario_id: req.usuario.id,
        observaciones: `Transferencia hacia depósito destino (Ref: ${codigoTrans})`
      });

      // Add to destination
      await actualizarStock(item.producto_id, deposito_destino_id, item.cantidad);
      await registrarKardex({
        producto_id: item.producto_id,
        deposito_id: deposito_destino_id,
        tipo_movimiento: 'TRANSFERENCIA_ENTRADA',
        referencia_id: transferenciaId,
        referencia_documento: codigoTrans,
        cantidad_entrada: item.cantidad,
        costo_unitario: costo,
        usuario_id: req.usuario.id,
        observaciones: `Transferencia desde depósito origen (Ref: ${codigoTrans})`
      });
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'TRANSFERENCIA_STOCK', 'transferencias', transferenciaId, `Transferencia ${codigoTrans} completada`]
    );

    res.status(201).json({
      success: true,
      message: `Transferencia ${codigoTrans} realizada con éxito`,
      transferenciaId
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
