/**
 * ============================================================================
 * MÓDULO: SERVICIOS Y PRESUPUESTOS (/api/servicios)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Gestiona el ciclo comercial para eventos y encargos especiales:
 * 1. Catálogo de Servicios (Catering, coffee breaks, tortas personalizadas, vajilla).
 * 2. Emisión e impresión formal de Presupuestos / Cotizaciones a Clientes (PRE-XXXXXXX).
 * 3. Contratos de Pedidos de Servicios y Eventos con seña, fecha, hora y lugar.
 */

const express = require('express');
const router = express.Router();
const { get, all, run } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// ============================================================================
// 1. CATÁLOGO DE SERVICIOS
// ============================================================================

// GET /api/servicios
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const servicios = await all('SELECT * FROM servicios WHERE estado = 1 ORDER BY nombre ASC');
    res.json({ success: true, servicios });
  } catch (err) {
    next(err);
  }
});

// POST /api/servicios
router.post('/', verifyToken, checkRole(['admin', 'vendedor']), async (req, res, next) => {
  try {
    const { codigo, nombre, descripcion, precio_sugerido = 0, unidad_servicio = 'servicio' } = req.body;
    if (!codigo || !nombre) {
      return res.status(400).json({ success: false, message: 'Código y Nombre del servicio son obligatorios' });
    }

    const existe = await get('SELECT id FROM servicios WHERE codigo = ?', [codigo]);
    if (existe) {
      return res.status(400).json({ success: false, message: 'Ya existe un servicio con ese código' });
    }

    const result = await run(`
      INSERT INTO servicios (codigo, nombre, descripcion, precio_sugerido, unidad_servicio)
      VALUES (?, ?, ?, ?, ?)
    `, [codigo, nombre, descripcion || '', Number(precio_sugerido) || 0, unidad_servicio]);

    res.status(201).json({ success: true, message: 'Servicio registrado exitosamente', id: result.lastID });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. PRESUPUESTOS Y COTIZACIONES
// ============================================================================

// GET /api/servicios/presupuestos
router.get('/presupuestos', verifyToken, async (req, res, next) => {
  try {
    const { estado } = req.query;
    let query = `
      SELECT p.*,
             cl.nombre_razon as cliente_nombre,
             cl.ruc_ci as cliente_ruc,
             cl.telefono as cliente_telefono,
             u.nombre as usuario_nombre,
             (SELECT COUNT(*) FROM presupuestos_detalles WHERE presupuesto_id = p.id) as total_items
      FROM presupuestos p
      JOIN clientes cl ON p.cliente_id = cl.id
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      query += ' AND p.estado = ?';
      params.push(estado);
    }

    query += ' ORDER BY p.id DESC LIMIT 100';
    const presupuestos = await all(query, params);
    res.json({ success: true, presupuestos });
  } catch (err) {
    next(err);
  }
});

// GET /api/servicios/presupuestos/:id
router.get('/presupuestos/:id', verifyToken, async (req, res, next) => {
  try {
    const presupuesto = await get(`
      SELECT p.*,
             cl.nombre_razon as cliente_nombre,
             cl.ruc_ci as cliente_ruc,
             cl.telefono as cliente_telefono,
             cl.direccion as cliente_direccion,
             cl.email as cliente_email,
             u.nombre as usuario_nombre
      FROM presupuestos p
      JOIN clientes cl ON p.cliente_id = cl.id
      JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!presupuesto) {
      return res.status(404).json({ success: false, message: 'Presupuesto no encontrado' });
    }

    const detalles = await all(`
      SELECT pd.*,
             pr.codigo as producto_codigo,
             s.codigo as servicio_codigo
      FROM presupuestos_detalles pd
      LEFT JOIN productos pr ON pd.producto_id = pr.id
      LEFT JOIN servicios s ON pd.servicio_id = s.id
      WHERE pd.presupuesto_id = ?
    `, [req.params.id]);

    res.json({ success: true, presupuesto, detalles });
  } catch (err) {
    next(err);
  }
});

// POST /api/servicios/presupuestos
router.post('/presupuestos', verifyToken, async (req, res, next) => {
  try {
    const {
      cliente_id,
      fecha_emision,
      dias_validez = 15,
      descuento = 0,
      observaciones = '',
      items
    } = req.body;

    if (!cliente_id || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Debe seleccionar un cliente y al menos un ítem cotizado' });
    }

    let subtotalGeneral = 0;
    for (const item of items) {
      subtotalGeneral += (Number(item.cantidad) * Number(item.precio_unitario));
    }

    const totalGeneral = Math.max(0, subtotalGeneral - Number(descuento));

    const count = await get('SELECT COUNT(*) as count FROM presupuestos');
    const numeroPresupuesto = `PRE-${String(count.count + 1).padStart(7, '0')}`;

    const fechaEmis = fecha_emision || new Date().toISOString().split('T')[0];
    const fechaVto = new Date(Date.now() + (Number(dias_validez) || 15) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const result = await run(`
      INSERT INTO presupuestos (
        numero_presupuesto, cliente_id, usuario_id, fecha_emision, fecha_vencimiento,
        subtotal, descuento, total, estado, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)
    `, [
      numeroPresupuesto,
      cliente_id,
      req.usuario.id,
      fechaEmis,
      fechaVto,
      subtotalGeneral,
      Number(descuento) || 0,
      totalGeneral,
      observaciones
    ]);

    const presupuestoId = result.lastID;

    for (const item of items) {
      const subtotalItem = Number(item.cantidad) * Number(item.precio_unitario);
      await run(`
        INSERT INTO presupuestos_detalles (
          presupuesto_id, tipo_item, producto_id, servicio_id, descripcion, cantidad, precio_unitario, subtotal
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        presupuestoId,
        item.tipo_item || 'servicio',
        item.producto_id || null,
        item.servicio_id || null,
        item.descripcion || 'Ítem cotizado',
        Number(item.cantidad),
        Number(item.precio_unitario),
        subtotalItem
      ]);
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'REGISTRO_PRESUPUESTO', 'presupuestos', presupuestoId, `Presupuesto ${numeroPresupuesto} emitido por Gs. ${totalGeneral.toLocaleString('es-PY')}`]
    );

    res.status(201).json({
      success: true,
      message: 'Presupuesto registrado exitosamente',
      presupuestoId,
      numeroPresupuesto,
      total: totalGeneral
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/servicios/presupuestos/:id/estado
router.put('/presupuestos/:id/estado', verifyToken, async (req, res, next) => {
  try {
    const { estado } = req.body;
    if (!['pendiente', 'aprobado', 'rechazado', 'vencido', 'facturado'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }

    await run('UPDATE presupuestos SET estado = ? WHERE id = ?', [estado, req.params.id]);
    res.json({ success: true, message: `Presupuesto actualizado a ${estado}` });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 3. PEDIDOS DE SERVICIOS / EVENTOS CONFIRMADOS
// ============================================================================

// GET /api/servicios/pedidos
router.get('/pedidos', verifyToken, async (req, res, next) => {
  try {
    const { estado } = req.query;
    let query = `
      SELECT ps.*,
             cl.nombre_razon as cliente_nombre,
             cl.ruc_ci as cliente_ruc,
             cl.telefono as cliente_telefono,
             u.nombre as usuario_nombre,
             p.numero_presupuesto
      FROM pedidos_servicios ps
      JOIN clientes cl ON ps.cliente_id = cl.id
      JOIN usuarios u ON ps.usuario_id = u.id
      LEFT JOIN presupuestos p ON ps.presupuesto_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (estado) {
      query += ' AND ps.estado = ?';
      params.push(estado);
    }

    query += ' ORDER BY ps.fecha_evento ASC, ps.id DESC LIMIT 100';
    const pedidos = await all(query, params);
    res.json({ success: true, pedidos });
  } catch (err) {
    next(err);
  }
});

// GET /api/servicios/pedidos/:id
router.get('/pedidos/:id', verifyToken, async (req, res, next) => {
  try {
    const pedido = await get(`
      SELECT ps.*,
             cl.nombre_razon as cliente_nombre,
             cl.ruc_ci as cliente_ruc,
             cl.telefono as cliente_telefono,
             cl.direccion as cliente_direccion,
             u.nombre as usuario_nombre,
             p.numero_presupuesto
      FROM pedidos_servicios ps
      JOIN clientes cl ON ps.cliente_id = cl.id
      JOIN usuarios u ON ps.usuario_id = u.id
      LEFT JOIN presupuestos p ON ps.presupuesto_id = p.id
      WHERE ps.id = ?
    `, [req.params.id]);

    if (!pedido) {
      return res.status(404).json({ success: false, message: 'Pedido de servicio no encontrado' });
    }

    let detalles = [];
    if (pedido.presupuesto_id) {
      detalles = await all(`
        SELECT pd.*
        FROM presupuestos_detalles pd
        WHERE pd.presupuesto_id = ?
      `, [pedido.presupuesto_id]);
    }

    res.json({ success: true, pedido, detalles });
  } catch (err) {
    next(err);
  }
});

// POST /api/servicios/pedidos
router.post('/pedidos', verifyToken, async (req, res, next) => {
  try {
    const {
      presupuesto_id,
      cliente_id,
      fecha_evento,
      hora_evento = '19:00',
      lugar_evento,
      total,
      senia_pagada = 0,
      observaciones = ''
    } = req.body;

    if (!cliente_id || !fecha_evento || !lugar_evento || !total) {
      return res.status(400).json({ success: false, message: 'Cliente, fecha, lugar y total son obligatorios' });
    }

    const totalNum = Number(total);
    const seniaNum = Number(senia_pagada) || 0;
    const saldoPendiente = Math.max(0, totalNum - seniaNum);

    const count = await get('SELECT COUNT(*) as count FROM pedidos_servicios');
    const numeroServicio = `SRV-ORD-${String(count.count + 1).padStart(7, '0')}`;

    const result = await run(`
      INSERT INTO pedidos_servicios (
        numero_servicio, presupuesto_id, cliente_id, usuario_id,
        fecha_evento, hora_evento, lugar_evento, total, senia_pagada, saldo_pendiente,
        estado, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'programado', ?)
    `, [
      numeroServicio,
      presupuesto_id || null,
      cliente_id,
      req.usuario.id,
      fecha_evento,
      hora_evento,
      lugar_evento,
      totalNum,
      seniaNum,
      saldoPendiente,
      observaciones
    ]);

    const pedidoId = result.lastID;

    // Si viene de un presupuesto, marcarlo como aprobado
    if (presupuesto_id) {
      await run("UPDATE presupuestos SET estado = 'aprobado' WHERE id = ?", [presupuesto_id]);
    }

    // Si hubo seña y hay caja abierta, asentar ingreso en la sesión de caja activa
    if (seniaNum > 0) {
      const sesion = await get("SELECT id FROM sesiones_caja WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1");
      if (sesion) {
        await run(`
          INSERT INTO movimientos_caja (sesion_caja_id, tipo_movimiento, concepto, monto, usuario_id)
          VALUES (?, 'ingreso', ?, ?, ?)
        `, [sesion.id, `Seña recibida por ${numeroServicio} (${lugar_evento})`, seniaNum, req.usuario.id]);
      }
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'REGISTRO_PEDIDO_SERVICIO', 'pedidos_servicios', pedidoId, `Servicio ${numeroServicio} agendado para ${fecha_evento} en ${lugar_evento}`]
    );

    res.status(201).json({
      success: true,
      message: 'Pedido de servicio agendado exitosamente',
      pedidoId,
      numeroServicio,
      total: totalNum,
      saldoPendiente
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/servicios/pedidos/:id/estado
router.put('/pedidos/:id/estado', verifyToken, async (req, res, next) => {
  try {
    const { estado } = req.body;
    if (!['programado', 'en_preparacion', 'entregado', 'finalizado', 'cancelado'].includes(estado)) {
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    }

    await run('UPDATE pedidos_servicios SET estado = ? WHERE id = ?', [estado, req.params.id]);
    res.json({ success: true, message: `Estado de servicio actualizado a ${estado}` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
