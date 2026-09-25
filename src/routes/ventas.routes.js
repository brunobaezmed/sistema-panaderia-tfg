const express = require('express');
const router = express.Router();
const { get, all, run, actualizarStock, registrarKardex } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// GET /api/ventas/clientes
router.get('/clientes', verifyToken, async (req, res, next) => {
  try {
    const clientes = await all('SELECT * FROM clientes ORDER BY nombre_razon ASC');
    res.json({ success: true, clientes });
  } catch (err) {
    next(err);
  }
});

// POST /api/ventas/clientes
router.post('/clientes', verifyToken, async (req, res, next) => {
  try {
    const { ruc_ci, nombre_razon, telefono, email, direccion } = req.body;
    if (!ruc_ci || !nombre_razon) {
      return res.status(400).json({ success: false, message: 'RUC / CI y Nombre o Razón Social son requeridos' });
    }

    const existe = await get('SELECT id FROM clientes WHERE ruc_ci = ?', [ruc_ci]);
    if (existe) {
      return res.status(400).json({ success: false, message: 'Ya existe un cliente con ese RUC / CI' });
    }

    const result = await run(`
      INSERT INTO clientes (ruc_ci, nombre_razon, telefono, email, direccion)
      VALUES (?, ?, ?, ?, ?)
    `, [ruc_ci, nombre_razon, telefono || '', email || '', direccion || '']);

    res.status(201).json({ success: true, message: 'Cliente registrado exitosamente', id: result.lastID });
  } catch (err) {
    next(err);
  }
});

// GET /api/ventas
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { fecha_desde, fecha_hasta, estado } = req.query;
    let query = `
      SELECT v.*,
             c.nombre_razon as cliente_nombre,
             c.ruc_ci as cliente_ruc,
             u.nombre as cajero_nombre,
             d.nombre as deposito_nombre,
             (SELECT COUNT(*) FROM ventas_detalles WHERE venta_id = v.id) as total_items
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      JOIN usuarios u ON v.usuario_id = u.id
      JOIN depositos d ON v.deposito_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (fecha_desde) {
      query += ' AND DATE(v.fecha_venta) >= ?';
      params.push(fecha_desde);
    }
    if (fecha_hasta) {
      query += ' AND DATE(v.fecha_venta) <= ?';
      params.push(fecha_hasta);
    }
    if (estado) {
      query += ' AND v.estado = ?';
      params.push(estado);
    }

    query += ' ORDER BY v.id DESC LIMIT 150';
    const ventas = await all(query, params);
    res.json({ success: true, ventas });
  } catch (err) {
    next(err);
  }
});

// GET /api/ventas/:id
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const venta = await get(`
      SELECT v.*,
             c.nombre_razon as cliente_nombre,
             c.ruc_ci as cliente_ruc,
             c.direccion as cliente_direccion,
             c.telefono as cliente_telefono,
             u.nombre as cajero_nombre,
             d.nombre as deposito_nombre
      FROM ventas v
      LEFT JOIN clientes c ON v.cliente_id = c.id
      JOIN usuarios u ON v.usuario_id = u.id
      JOIN depositos d ON v.deposito_id = d.id
      WHERE v.id = ?
    `, [req.params.id]);

    if (!venta) {
      return res.status(404).json({ success: false, message: 'Venta no encontrada' });
    }

    const detalles = await all(`
      SELECT vd.*,
             p.nombre as producto_nombre,
             p.codigo as producto_codigo,
             u.simbolo as unidad_simbolo
      FROM ventas_detalles vd
      JOIN productos p ON vd.producto_id = p.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE vd.venta_id = ?
    `, [req.params.id]);

    res.json({ success: true, venta, detalles });
  } catch (err) {
    next(err);
  }
});

// POST /api/ventas (POS Checkout)
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const {
      cliente_id,
      deposito_id,
      tipo_comprobante = 'ticket',
      metodo_pago = 'efectivo',
      monto_recibido = 0,
      items
    } = req.body;

    if (!deposito_id || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Datos incompletos o carrito de venta vacío' });
    }

    // 1. Verify stock availability
    for (const item of items) {
      const stockRow = await get(
        'SELECT cantidad FROM stock_deposito WHERE producto_id = ? AND deposito_id = ?',
        [item.producto_id, deposito_id]
      );
      const disp = stockRow ? stockRow.cantidad : 0;
      if (disp < item.cantidad) {
        const prod = await get('SELECT nombre FROM productos WHERE id = ?', [item.producto_id]);
        return res.status(400).json({
          success: false,
          message: `Stock insuficiente en mostrador para ${prod ? prod.nombre : 'Producto'}. Disponible: ${disp}, Solicitado: ${item.cantidad}`
        });
      }
    }

    // 2. Calculate totals and IVA (Paraguay Tax standard: IVA 10% = subtotal / 11, IVA 5% = subtotal / 21)
    let subtotalGeneral = 0;
    let iva5Total = 0;
    let iva10Total = 0;

    for (const item of items) {
      const subtotalItem = item.cantidad * item.precio_unitario;
      subtotalGeneral += subtotalItem;

      if (item.iva_tipo === 5) {
        iva5Total += Math.round(subtotalItem / 21);
      } else if (item.iva_tipo === 10 || item.iva_tipo === undefined) {
        iva10Total += Math.round(subtotalItem / 11);
      }
    }

    const totalVenta = subtotalGeneral;
    const vuelto = Math.max(0, (Number(monto_recibido) || totalVenta) - totalVenta);

    // 3. Generate receipt number
    const countVentas = await get('SELECT COUNT(*) as count FROM ventas');
    const prefijo = tipo_comprobante === 'factura' ? 'FAC-001-' : 'TKT-';
    const numeroComprobante = `${prefijo}${String(countVentas.count + 1).padStart(7, '0')}`;

    // 4. Insert sale header
    const resultVenta = await run(`
      INSERT INTO ventas (
        numero_comprobante, tipo_comprobante, cliente_id, usuario_id,
        deposito_id, subtotal, iva_5, iva_10, total,
        metodo_pago, monto_recibido, vuelto, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completada')
    `, [
      numeroComprobante,
      tipo_comprobante,
      cliente_id || null,
      req.usuario.id,
      deposito_id,
      subtotalGeneral,
      iva5Total,
      iva10Total,
      totalVenta,
      metodo_pago,
      Number(monto_recibido) || totalVenta,
      vuelto
    ]);

    const ventaId = resultVenta.lastID;

    // 5. Insert details, deduct stock and update Kardex & FIFO lots
    for (const item of items) {
      const subtotalItem = item.cantidad * item.precio_unitario;
      const prod = await get('SELECT precio_costo FROM productos WHERE id = ?', [item.producto_id]);
      const costo = prod ? prod.precio_costo : 0;

      await run(`
        INSERT INTO ventas_detalles (venta_id, producto_id, cantidad, precio_unitario, iva_tipo, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [ventaId, item.producto_id, item.cantidad, item.precio_unitario, item.iva_tipo || 10, subtotalItem]);

      // Deduct from deposit stock
      await actualizarStock(item.producto_id, deposito_id, -item.cantidad);

      // FIFO lot deduction
      let cantidadPorDescontar = item.cantidad;
      const lotesDisponibles = await all(`
        SELECT id, cantidad_actual FROM lotes
        WHERE producto_id = ? AND deposito_id = ? AND cantidad_actual > 0 AND estado = 'activo'
        ORDER BY fecha_vencimiento ASC
      `, [item.producto_id, deposito_id]);

      for (const lote of lotesDisponibles) {
        if (cantidadPorDescontar <= 0) break;
        if (lote.cantidad_actual <= cantidadPorDescontar) {
          cantidadPorDescontar -= lote.cantidad_actual;
          await run("UPDATE lotes SET cantidad_actual = 0, estado = 'agotado' WHERE id = ?", [lote.id]);
        } else {
          await run('UPDATE lotes SET cantidad_actual = cantidad_actual - ? WHERE id = ?', [cantidadPorDescontar, lote.id]);
          cantidadPorDescontar = 0;
        }
      }

      // Register Kardex movement
      await registrarKardex({
        producto_id: item.producto_id,
        deposito_id,
        tipo_movimiento: 'VENTA',
        referencia_id: ventaId,
        referencia_documento: numeroComprobante,
        cantidad_salida: item.cantidad,
        costo_unitario: costo,
        usuario_id: req.usuario.id,
        observaciones: `Salida por venta mostrador ${numeroComprobante}`
      });
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'VENTA_POS', 'ventas', ventaId, `Venta emitida ${numeroComprobante} por Gs. ${totalVenta.toLocaleString('es-PY')}`]
    );

    res.status(201).json({
      success: true,
      message: 'Venta registrada con éxito',
      ventaId,
      numeroComprobante,
      total: totalVenta,
      vuelto
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
