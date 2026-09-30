/**
 * ============================================================================
 * MÓDULO: GESTIÓN DE COMPRAS Y ABASTECIMIENTO (/api/compras)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Gestiona el ciclo completo de compras:
 * 1. Solicitudes y Pedidos Internos de Compras (generar e imprimir).
 * 2. Órdenes de Compras formal al proveedor (generar e imprimir).
 * 3. Gestión y facturas de compras con lote, vencimiento, costo y Kardex.
 * 4. Notas de Crédito de compras (devolución física de insumos y descuentos).
 * 5. Informes y catálogo de proveedores.
 */

const express = require('express');
const router = express.Router();
const { get, all, run, actualizarStock, registrarKardex } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// ============================================================================
// 1. PROVEEDORES
// ============================================================================

// GET /api/compras/proveedores
router.get('/proveedores', verifyToken, async (req, res, next) => {
  try {
    const proveedores = await all('SELECT * FROM proveedores WHERE estado = 1 ORDER BY razon_social ASC');
    res.json({ success: true, proveedores });
  } catch (err) {
    next(err);
  }
});

// POST /api/compras/proveedores
router.post('/proveedores', verifyToken, checkRole(['admin', 'deposito']), async (req, res, next) => {
  try {
    const { ruc, razon_social, contacto_nombre, telefono, email, direccion, ciudad } = req.body;
    if (!ruc || !razon_social) {
      return res.status(400).json({ success: false, message: 'RUC y Razón Social son requeridos' });
    }

    const existe = await get('SELECT id FROM proveedores WHERE ruc = ?', [ruc]);
    if (existe) {
      return res.status(400).json({ success: false, message: 'Ya existe un proveedor con ese RUC' });
    }

    const result = await run(`
      INSERT INTO proveedores (ruc, razon_social, contacto_nombre, telefono, email, direccion, ciudad, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `, [ruc, razon_social, contacto_nombre || '', telefono || '', email || '', direccion || '', ciudad || 'Capiatá']);

    res.status(201).json({ success: true, message: 'Proveedor registrado exitosamente', id: result.lastID });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. PEDIDOS INTERNOS DE COMPRAS
// ============================================================================

// GET /api/compras/pedidos
router.get('/pedidos', verifyToken, async (req, res, next) => {
  try {
    const { estado } = req.query;
    let query = `
      SELECT p.*,
             u.nombre as usuario_nombre,
             (SELECT COUNT(*) FROM pedidos_compras_detalles WHERE pedido_compra_id = p.id) as total_items
      FROM pedidos_compras p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      query += ' AND p.estado = ?';
      params.push(estado);
    }

    query += ' ORDER BY p.id DESC LIMIT 100';
    const pedidos = await all(query, params);
    res.json({ success: true, pedidos });
  } catch (err) {
    next(err);
  }
});

// GET /api/compras/pedidos/:id
router.get('/pedidos/:id', verifyToken, async (req, res, next) => {
  try {
    const pedido = await get(`
      SELECT p.*, u.nombre as usuario_nombre
      FROM pedidos_compras p
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!pedido) {
      return res.status(404).json({ success: false, message: 'Pedido de compra no encontrado' });
    }

    const detalles = await all(`
      SELECT pd.*,
             pr.nombre as producto_nombre,
             pr.codigo as producto_codigo,
             u.simbolo as unidad_simbolo
      FROM pedidos_compras_detalles pd
      JOIN productos pr ON pd.producto_id = pr.id
      LEFT JOIN unidades_medida u ON pr.unidad_id = u.id
      WHERE pd.pedido_compra_id = ?
    `, [req.params.id]);

    res.json({ success: true, pedido, detalles });
  } catch (err) {
    next(err);
  }
});

// POST /api/compras/pedidos
router.post('/pedidos', verifyToken, async (req, res, next) => {
  try {
    const { fecha_pedido, fecha_requerida, prioridad = 'normal', observaciones = '', items } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Debe ingresar al menos un insumo para el pedido' });
    }

    const count = await get('SELECT COUNT(*) as count FROM pedidos_compras');
    const numeroPedido = `PED-${String(count.count + 1).padStart(7, '0')}`;

    const result = await run(`
      INSERT INTO pedidos_compras (numero_pedido, usuario_id, fecha_pedido, fecha_requerida, prioridad, estado, observaciones)
      VALUES (?, ?, ?, ?, ?, 'pendiente', ?)
    `, [
      numeroPedido,
      req.usuario.id,
      fecha_pedido || new Date().toISOString().split('T')[0],
      fecha_requerida || null,
      prioridad,
      observaciones
    ]);

    const pedidoId = result.lastID;

    for (const item of items) {
      await run(`
        INSERT INTO pedidos_compras_detalles (pedido_compra_id, producto_id, cantidad_solicitada, observaciones)
        VALUES (?, ?, ?, ?)
      `, [pedidoId, item.producto_id, Number(item.cantidad_solicitada), item.observaciones || '']);
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'REGISTRO_PEDIDO_COMPRA', 'pedidos_compras', pedidoId, `Pedido de compras emitido: ${numeroPedido}`]
    );

    res.status(201).json({
      success: true,
      message: 'Pedido de compra registrado exitosamente',
      pedidoId,
      numeroPedido
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/compras/pedidos/:id/estado
router.put('/pedidos/:id/estado', verifyToken, checkRole(['admin', 'deposito']), async (req, res, next) => {
  try {
    const { estado } = req.body;
    if (!['pendiente', 'aprobado', 'rechazado', 'procesado'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }

    await run('UPDATE pedidos_compras SET estado = ? WHERE id = ?', [estado, req.params.id]);
    res.json({ success: true, message: `Pedido actualizado a ${estado}` });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. ÓRDENES DE COMPRA AL PROVEEDOR
// ============================================================================

// GET /api/compras/ordenes
router.get('/ordenes', verifyToken, async (req, res, next) => {
  try {
    const { estado } = req.query;
    let query = `
      SELECT oc.*,
             prov.razon_social as proveedor_nombre,
             prov.ruc as proveedor_ruc,
             u.nombre as usuario_nombre,
             (SELECT COUNT(*) FROM ordenes_compras_detalles WHERE orden_compra_id = oc.id) as total_items
      FROM ordenes_compras oc
      JOIN proveedores prov ON oc.proveedor_id = prov.id
      JOIN usuarios u ON oc.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      query += ' AND oc.estado = ?';
      params.push(estado);
    }

    query += ' ORDER BY oc.id DESC LIMIT 100';
    const ordenes = await all(query, params);
    res.json({ success: true, ordenes });
  } catch (err) {
    next(err);
  }
});

// GET /api/compras/ordenes/:id
router.get('/ordenes/:id', verifyToken, async (req, res, next) => {
  try {
    const orden = await get(`
      SELECT oc.*,
             prov.razon_social as proveedor_nombre,
             prov.ruc as proveedor_ruc,
             prov.telefono as proveedor_telefono,
             prov.direccion as proveedor_direccion,
             prov.email as proveedor_email,
             u.nombre as usuario_nombre
      FROM ordenes_compras oc
      JOIN proveedores prov ON oc.proveedor_id = prov.id
      JOIN usuarios u ON oc.usuario_id = u.id
      WHERE oc.id = ?
    `, [req.params.id]);

    if (!orden) {
      return res.status(404).json({ success: false, message: 'Orden de compra no encontrada' });
    }

    const detalles = await all(`
      SELECT od.*,
             pr.nombre as producto_nombre,
             pr.codigo as producto_codigo,
             u.simbolo as unidad_simbolo
      FROM ordenes_compras_detalles od
      JOIN productos pr ON od.producto_id = pr.id
      LEFT JOIN unidades_medida u ON pr.unidad_id = u.id
      WHERE od.orden_compra_id = ?
    `, [req.params.id]);

    res.json({ success: true, orden, detalles });
  } catch (err) {
    next(err);
  }
});

// POST /api/compras/ordenes
router.post('/ordenes', verifyToken, checkRole(['admin', 'deposito']), async (req, res, next) => {
  try {
    const {
      pedido_compra_id,
      proveedor_id,
      fecha_orden,
      fecha_entrega_esperada,
      condicion_pago = 'contado',
      observaciones = '',
      items
    } = req.body;

    if (!proveedor_id || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Debe seleccionar un proveedor y al menos un ítem' });
    }

    let totalOrden = 0;
    for (const item of items) {
      totalOrden += (Number(item.cantidad) * Number(item.precio_unitario));
    }

    const count = await get('SELECT COUNT(*) as count FROM ordenes_compras');
    const numeroOrden = `OC-${String(count.count + 1).padStart(7, '0')}`;

    const result = await run(`
      INSERT INTO ordenes_compras (
        numero_orden, pedido_compra_id, proveedor_id, usuario_id,
        fecha_orden, fecha_entrega_esperada, condicion_pago, subtotal, total, estado, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitida', ?)
    `, [
      numeroOrden,
      pedido_compra_id || null,
      proveedor_id,
      req.usuario.id,
      fecha_orden || new Date().toISOString().split('T')[0],
      fecha_entrega_esperada || null,
      condicion_pago,
      totalOrden,
      totalOrden,
      observaciones
    ]);

    const ordenId = result.lastID;

    for (const item of items) {
      const subtotalItem = Number(item.cantidad) * Number(item.precio_unitario);
      await run(`
        INSERT INTO ordenes_compras_detalles (orden_compra_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `, [ordenId, item.producto_id, Number(item.cantidad), Number(item.precio_unitario), subtotalItem]);
    }

    // Si provenía de un pedido interno, marcarlo como procesado
    if (pedido_compra_id) {
      await run("UPDATE pedidos_compras SET estado = 'procesado' WHERE id = ?", [pedido_compra_id]);
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'REGISTRO_ORDEN_COMPRA', 'ordenes_compras', ordenId, `Orden de compra emitida: ${numeroOrden} por Gs. ${totalOrden.toLocaleString('es-PY')}`]
    );

    res.status(201).json({
      success: true,
      message: 'Orden de compra emitida exitosamente',
      ordenId,
      numeroOrden,
      total: totalOrden
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. FACTURAS DE COMPRAS Y RECEPCIÓN
// ============================================================================

// GET /api/compras
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const compras = await all(`
      SELECT c.*,
             prov.razon_social as proveedor_nombre,
             prov.ruc as proveedor_ruc,
             d.nombre as deposito_nombre,
             u.nombre as usuario_nombre,
             oc.numero_orden,
             (SELECT COUNT(*) FROM compras_detalles WHERE compra_id = c.id) as total_items
      FROM compras c
      JOIN proveedores prov ON c.proveedor_id = prov.id
      JOIN depositos d ON c.deposito_id = d.id
      JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN ordenes_compras oc ON c.orden_compra_id = oc.id
      ORDER BY c.id DESC
      LIMIT 100
    `);

    res.json({ success: true, compras });
  } catch (err) {
    next(err);
  }
});

// GET /api/compras/:id
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const compra = await get(`
      SELECT c.*,
             prov.razon_social as proveedor_nombre,
             prov.ruc as proveedor_ruc,
             prov.telefono as proveedor_telefono,
             d.nombre as deposito_nombre,
             u.nombre as usuario_nombre,
             oc.numero_orden
      FROM compras c
      JOIN proveedores prov ON c.proveedor_id = prov.id
      JOIN depositos d ON c.deposito_id = d.id
      JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN ordenes_compras oc ON c.orden_compra_id = oc.id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!compra) {
      return res.status(404).json({ success: false, message: 'Compra no encontrada' });
    }

    const detalles = await all(`
      SELECT cd.*,
             p.nombre as producto_nombre,
             p.codigo as producto_codigo,
             u.simbolo as unidad_simbolo
      FROM compras_detalles cd
      JOIN productos p ON cd.producto_id = p.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE cd.compra_id = ?
    `, [req.params.id]);

    res.json({ success: true, compra, detalles });
  } catch (err) {
    next(err);
  }
});

// POST /api/compras
router.post('/', verifyToken, checkRole(['admin', 'deposito']), async (req, res, next) => {
  try {
    const {
      proveedor_id,
      deposito_id,
      orden_compra_id,
      numero_factura,
      timbrado = '12345678',
      fecha_compra,
      condicion = 'contado',
      observaciones = '',
      detalles
    } = req.body;

    if (!proveedor_id || !deposito_id || !numero_factura || !detalles || !detalles.length) {
      return res.status(400).json({ success: false, message: 'Faltan datos obligatorios de la compra o ítems' });
    }

    let totalCompra = 0;
    for (const d of detalles) {
      totalCompra += (Number(d.cantidad) * Number(d.precio_unitario));
    }

    // 1. Guardar cabecera de compra
    const resultCompra = await run(`
      INSERT INTO compras (
        proveedor_id, deposito_id, orden_compra_id, usuario_id, numero_factura, timbrado,
        fecha_compra, total, condicion, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      proveedor_id,
      deposito_id,
      orden_compra_id || null,
      req.usuario.id,
      numero_factura,
      timbrado,
      fecha_compra || new Date().toISOString().split('T')[0],
      totalCompra,
      condicion,
      observaciones
    ]);

    const compraId = resultCompra.lastID;

    // 2. Procesar detalles, creación de lote, stock y Kardex
    for (const d of detalles) {
      const subtotal = Number(d.cantidad) * Number(d.precio_unitario);
      const codigoLote = d.codigo_lote || `LOT-COM-${Date.now().toString().slice(-6)}`;
      const fechaVto = d.fecha_vencimiento || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      await run(`
        INSERT INTO compras_detalles (
          compra_id, producto_id, codigo_lote, fecha_vencimiento, cantidad, precio_unitario, subtotal
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [compraId, d.producto_id, codigoLote, fechaVto, Number(d.cantidad), Number(d.precio_unitario), subtotal]);

      await run(`
        INSERT INTO lotes (
          producto_id, deposito_id, codigo_lote, cantidad_inicial, cantidad_actual,
          fecha_elaboracion, fecha_vencimiento, precio_compra, estado
        ) VALUES (?, ?, ?, ?, ?, DATE('now', 'localtime'), ?, ?, 'activo')
      `, [d.producto_id, deposito_id, codigoLote, Number(d.cantidad), Number(d.cantidad), fechaVto, Number(d.precio_unitario)]);

      await run('UPDATE productos SET precio_costo = ? WHERE id = ?', [Number(d.precio_unitario), d.producto_id]);
      await actualizarStock(d.producto_id, deposito_id, Number(d.cantidad));

      await registrarKardex({
        producto_id: d.producto_id,
        deposito_id,
        tipo_movimiento: 'COMPRA',
        referencia_id: compraId,
        referencia_documento: `FACT-${numero_factura}`,
        cantidad_entrada: Number(d.cantidad),
        costo_unitario: Number(d.precio_unitario),
        usuario_id: req.usuario.id,
        observaciones: `Ingreso por compra Fact. ${numero_factura} (Lote: ${codigoLote})`
      });
    }

    // Si proviene de orden de compra, marcarla como recibida
    if (orden_compra_id) {
      await run("UPDATE ordenes_compras SET estado = 'recibida' WHERE id = ?", [orden_compra_id]);
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'REGISTRO_COMPRA', 'compras', compraId, `Compra registrada Fact. ${numero_factura} por Gs. ${totalCompra.toLocaleString('es-PY')}`]
    );

    res.status(201).json({
      success: true,
      message: 'Compra registrada con éxito e inventario actualizado',
      compraId,
      total: totalCompra
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 5. NOTAS DE CRÉDITO DE COMPRAS (DEVOLUCIONES Y DESCUENTOS)
// ============================================================================

// GET /api/compras/notas-credito
router.get('/notas-credito', verifyToken, async (req, res, next) => {
  try {
    const notas = await all(`
      SELECT nc.*,
             prov.razon_social as proveedor_nombre,
             prov.ruc as proveedor_ruc,
             c.numero_factura as factura_compra,
             u.nombre as usuario_nombre
      FROM notas_credito_compras nc
      JOIN proveedores prov ON nc.proveedor_id = prov.id
      JOIN compras c ON nc.compra_id = c.id
      JOIN usuarios u ON nc.usuario_id = u.id
      ORDER BY nc.id DESC LIMIT 100
    `);

    res.json({ success: true, notas });
  } catch (err) {
    next(err);
  }
});

// GET /api/compras/notas-credito/:id
router.get('/notas-credito/:id', verifyToken, async (req, res, next) => {
  try {
    const nota = await get(`
      SELECT nc.*,
             prov.razon_social as proveedor_nombre,
             prov.ruc as proveedor_ruc,
             prov.telefono as proveedor_telefono,
             prov.direccion as proveedor_direccion,
             c.numero_factura as factura_compra,
             c.fecha_compra,
             u.nombre as usuario_nombre
      FROM notas_credito_compras nc
      JOIN proveedores prov ON nc.proveedor_id = prov.id
      JOIN compras c ON nc.compra_id = c.id
      JOIN usuarios u ON nc.usuario_id = u.id
      WHERE nc.id = ?
    `, [req.params.id]);

    if (!nota) {
      return res.status(404).json({ success: false, message: 'Nota de crédito no encontrada' });
    }

    const detalles = await all(`
      SELECT nd.*,
             pr.nombre as producto_nombre,
             pr.codigo as producto_codigo,
             u.simbolo as unidad_simbolo
      FROM notas_credito_compras_detalles nd
      JOIN productos pr ON nd.producto_id = pr.id
      LEFT JOIN unidades_medida u ON pr.unidad_id = u.id
      WHERE nd.nota_credito_id = ?
    `, [req.params.id]);

    res.json({ success: true, nota, detalles });
  } catch (err) {
    next(err);
  }
});

// POST /api/compras/notas-credito
router.post('/notas-credito', verifyToken, checkRole(['admin', 'deposito']), async (req, res, next) => {
  try {
    const {
      numero_nota,
      timbrado = '12345678',
      compra_id,
      proveedor_id,
      fecha_emision,
      motivo = 'devolucion_mercaderia',
      observaciones = '',
      items
    } = req.body;

    if (!numero_nota || !compra_id || !proveedor_id || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Faltan datos obligatorios para la Nota de Crédito' });
    }

    const compra = await get('SELECT deposito_id, numero_factura FROM compras WHERE id = ?', [compra_id]);
    if (!compra) {
      return res.status(400).json({ success: false, message: 'Factura de compra asociada no encontrada' });
    }

    let totalNota = 0;
    for (const item of items) {
      totalNota += (Number(item.cantidad) * Number(item.precio_unitario));
    }

    const result = await run(`
      INSERT INTO notas_credito_compras (
        numero_nota, timbrado, compra_id, proveedor_id, usuario_id,
        fecha_emision, motivo, total, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      numero_nota,
      timbrado,
      compra_id,
      proveedor_id,
      req.usuario.id,
      fecha_emision || new Date().toISOString().split('T')[0],
      motivo,
      totalNota,
      observaciones
    ]);

    const notaId = result.lastID;

    for (const item of items) {
      const subtotalItem = Number(item.cantidad) * Number(item.precio_unitario);
      await run(`
        INSERT INTO notas_credito_compras_detalles (nota_credito_id, producto_id, cantidad, precio_unitario, subtotal)
        VALUES (?, ?, ?, ?, ?)
      `, [notaId, item.producto_id, Number(item.cantidad), Number(item.precio_unitario), subtotalItem]);

      // Si es devolución física de mercadería, descontar del depósito y asentar en Kardex
      if (motivo === 'devolucion_mercaderia') {
        await actualizarStock(item.producto_id, compra.deposito_id, -Number(item.cantidad));

        await registrarKardex({
          producto_id: item.producto_id,
          deposito_id: compra.deposito_id,
          tipo_movimiento: 'DEVOLUCION_COMPRA_NC',
          referencia_id: notaId,
          referencia_documento: `NC-${numero_nota}`,
          cantidad_salida: Number(item.cantidad),
          costo_unitario: Number(item.precio_unitario),
          usuario_id: req.usuario.id,
          observaciones: `Devolución de mercadería según NC ${numero_nota} sobre Fact. ${compra.numero_factura}`
        });
      }
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'REGISTRO_NOTA_CREDITO_COMPRA', 'notas_credito_compras', notaId, `Nota de Crédito ${numero_nota} registrada por Gs. ${totalNota.toLocaleString('es-PY')}`]
    );

    res.status(201).json({
      success: true,
      message: 'Nota de crédito registrada exitosamente y stock actualizado',
      notaId,
      numeroNota: numero_nota,
      total: totalNota
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
