/**
 * ============================================================================
 * MÓDULO: CUENTAS A COBRAR Y COBRANZAS (/api/creditos)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Gestiona el crédito a clientes y la emisión de recibos oficiales:
 * - Consulta de cartera de cuentas por cobrar (pendientes, parciales, pagadas y vencidas).
 * - Liquidación y amortización de cuotas/créditos.
 * - Emisión e impresión de Recibos Oficiales de Cobranza (REC-XXXXXXX).
 * - Integración automática con el saldo en efectivo de la sesión de caja activa.
 */

const express = require('express');
const router = express.Router();
const { get, all, run } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// GET /api/creditos (Listado general de cuentas por cobrar)
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { cliente_id, estado, fecha_desde, fecha_hasta } = req.query;

    let query = `
      SELECT cc.*,
             cl.nombre_razon as cliente_nombre,
             cl.ruc_ci as cliente_ruc,
             cl.telefono as cliente_telefono,
             v.numero_comprobante as venta_comprobante,
             v.fecha_venta,
             CASE
               WHEN cc.saldo_pendiente > 0 AND DATE(cc.fecha_vencimiento) < DATE('now', 'localtime') THEN 'vencida'
               ELSE cc.estado
             END as estado_calculado,
             CAST((julianday(DATE('now', 'localtime')) - julianday(cc.fecha_vencimiento)) AS INTEGER) as dias_atraso
      FROM cuentas_cobrar cc
      JOIN clientes cl ON cc.cliente_id = cl.id
      JOIN ventas v ON cc.venta_id = v.id
      WHERE 1=1
    `;
    const params = [];

    if (cliente_id) {
      query += ' AND cc.cliente_id = ?';
      params.push(cliente_id);
    }
    if (estado) {
      if (estado === 'vencida') {
        query += " AND cc.saldo_pendiente > 0 AND DATE(cc.fecha_vencimiento) < DATE('now', 'localtime')";
      } else {
        query += ' AND cc.estado = ?';
        params.push(estado);
      }
    }
    if (fecha_desde) {
      query += ' AND DATE(cc.fecha_vencimiento) >= ?';
      params.push(fecha_desde);
    }
    if (fecha_hasta) {
      query += ' AND DATE(cc.fecha_vencimiento) <= ?';
      params.push(fecha_hasta);
    }

    query += ' ORDER BY cc.fecha_vencimiento ASC, cc.id DESC';
    const cuentas = await all(query, params);

    res.json({ success: true, cuentas });
  } catch (err) {
    next(err);
  }
});

// GET /api/creditos/resumen (Indicadores de cartera de clientes)
router.get('/resumen', verifyToken, async (req, res, next) => {
  try {
    const totalPendiente = await get(`
      SELECT COALESCE(SUM(saldo_pendiente), 0) as total
      FROM cuentas_cobrar
      WHERE estado IN ('pendiente', 'parcial')
    `);

    const totalVencido = await get(`
      SELECT COALESCE(SUM(saldo_pendiente), 0) as total
      FROM cuentas_cobrar
      WHERE estado IN ('pendiente', 'parcial') AND DATE(fecha_vencimiento) < DATE('now', 'localtime')
    `);

    const totalCobradoMes = await get(`
      SELECT COALESCE(SUM(monto_total), 0) as total
      FROM cobros
      WHERE strftime('%Y-%m', fecha_cobro) = strftime('%Y-%m', 'now', 'localtime')
    `);

    const clientesMorosos = await get(`
      SELECT COUNT(DISTINCT cliente_id) as count
      FROM cuentas_cobrar
      WHERE estado IN ('pendiente', 'parcial') AND DATE(fecha_vencimiento) < DATE('now', 'localtime')
    `);

    res.json({
      success: true,
      resumen: {
        total_pendiente: totalPendiente ? totalPendiente.total : 0,
        total_vencido: totalVencido ? totalVencido.total : 0,
        total_cobrado_mes: totalCobradoMes ? totalCobradoMes.total : 0,
        clientes_morosos: clientesMorosos ? clientesMorosos.count : 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/creditos/cliente/:cliente_id (Cuentas pendientes de un cliente específico)
router.get('/cliente/:cliente_id', verifyToken, async (req, res, next) => {
  try {
    const cuentas = await all(`
      SELECT cc.*, v.numero_comprobante, v.fecha_venta
      FROM cuentas_cobrar cc
      JOIN ventas v ON cc.venta_id = v.id
      WHERE cc.cliente_id = ? AND cc.saldo_pendiente > 0
      ORDER BY cc.fecha_vencimiento ASC
    `, [req.params.cliente_id]);

    res.json({ success: true, cuentas });
  } catch (err) {
    next(err);
  }
});

// POST /api/creditos/cobrar (Registrar cobro y emitir Recibo Oficial)
router.post('/cobrar', verifyToken, checkRole(['admin', 'vendedor']), async (req, res, next) => {
  try {
    const {
      cliente_id,
      monto_total,
      forma_cobro = 'efectivo',
      observaciones = '',
      cuotas // Array: [{ cuenta_cobrar_id, monto_aplicado }]
    } = req.body;

    if (!cliente_id || !monto_total || Number(monto_total) <= 0 || !cuotas || !cuotas.length) {
      return res.status(400).json({ success: false, message: 'Datos incompletos o monto inválido' });
    }

    // Buscar sesión de caja abierta (si existe) para asociar el cobro en efectivo
    const sesionActiva = await get("SELECT id FROM sesiones_caja WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1");
    const sesionCajaId = sesionActiva ? sesionActiva.id : null;

    // Generar número correlativo de recibo
    const countCobros = await get('SELECT COUNT(*) as count FROM cobros');
    const numeroRecibo = `REC-${String(countCobros.count + 1).padStart(7, '0')}`;

    const resultCobro = await run(`
      INSERT INTO cobros (numero_recibo, cliente_id, sesion_caja_id, usuario_id, monto_total, forma_cobro, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      numeroRecibo,
      cliente_id,
      sesionCajaId,
      req.usuario.id,
      Number(monto_total),
      forma_cobro,
      observaciones
    ]);

    const cobroId = resultCobro.lastID;

    // Aplicar montos a cada cuenta por cobrar
    for (const item of cuotas) {
      const cuenta = await get('SELECT id, saldo_pendiente, monto_cuota FROM cuentas_cobrar WHERE id = ?', [item.cuenta_cobrar_id]);
      if (!cuenta) continue;

      const aplicado = Math.min(cuenta.saldo_pendiente, Number(item.monto_aplicado));
      const nuevoSaldo = Math.max(0, cuenta.saldo_pendiente - aplicado);
      const nuevoEstado = nuevoSaldo === 0 ? 'pagada' : 'parcial';

      await run(`
        INSERT INTO cobros_detalles (cobro_id, cuenta_cobrar_id, monto_aplicado)
        VALUES (?, ?, ?)
      `, [cobroId, item.cuenta_cobrar_id, aplicado]);

      await run(`
        UPDATE cuentas_cobrar
        SET saldo_pendiente = ?, estado = ?
        WHERE id = ?
      `, [nuevoSaldo, nuevoEstado, item.cuenta_cobrar_id]);
    }

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'COBRO_CREDITO', 'cobros', cobroId, `Recibo ${numeroRecibo} emitido por Gs. ${Number(monto_total).toLocaleString('es-PY')} (${forma_cobro})`]
    );

    res.status(201).json({
      success: true,
      message: 'Cobro registrado exitosamente y recibo emitido',
      cobroId,
      numeroRecibo,
      montoTotal: Number(monto_total)
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/creditos/recibo/:id (Detalle de un recibo oficial para imprimir)
router.get('/recibo/:id', verifyToken, async (req, res, next) => {
  try {
    const recibo = await get(`
      SELECT c.*,
             cl.nombre_razon as cliente_nombre,
             cl.ruc_ci as cliente_ruc,
             cl.direccion as cliente_direccion,
             cl.telefono as cliente_telefono,
             u.nombre as cajero_nombre
      FROM cobros c
      JOIN clientes cl ON c.cliente_id = cl.id
      JOIN usuarios u ON c.usuario_id = u.id
      WHERE c.id = ?
    `, [req.params.id]);

    if (!recibo) {
      return res.status(404).json({ success: false, message: 'Recibo no encontrado' });
    }

    const detalles = await all(`
      SELECT cd.*,
             cc.numero_cuota,
             cc.total_cuotas,
             cc.monto_cuota,
             cc.saldo_pendiente,
             v.numero_comprobante as venta_comprobante
      FROM cobros_detalles cd
      JOIN cuentas_cobrar cc ON cd.cuenta_cobrar_id = cc.id
      JOIN ventas v ON cc.venta_id = v.id
      WHERE cd.cobro_id = ?
    `, [req.params.id]);

    res.json({ success: true, recibo, detalles });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
