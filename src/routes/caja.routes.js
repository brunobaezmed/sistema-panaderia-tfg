/**
 * ============================================================================
 * MÓDULO: GESTIÓN DE CAJA (/api/caja)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Administra el ciclo formal de caja:
 * - Apertura de turno con fondo inicial (monto_apertura).
 * - Registro de movimientos extraordinarios (ingresos y egresos de caja).
 * - Arqueo de caja (conteo físico vs saldo teórico del sistema).
 * - Cierre de caja con cálculo de faltante/sobrante y boleta de recaudación a depositar.
 * - Historial y reimpresión de comprobante de cierre de caja.
 */

const express = require('express');
const router = express.Router();
const { get, all, run } = require('../config/database');
const { verifyToken } = require('../middlewares/auth');

// GET /api/caja/cajas (Listar terminales de caja)
router.get('/cajas', verifyToken, async (req, res, next) => {
  try {
    const cajas = await all('SELECT * FROM cajas WHERE estado = 1 ORDER BY id ASC');
    res.json({ success: true, cajas });
  } catch (err) {
    next(err);
  }
});

// GET /api/caja/sesion-activa (Consultar si el usuario o sucursal tiene caja abierta)
router.get('/sesion-activa', verifyToken, async (req, res, next) => {
  try {
    const sesion = await get(`
      SELECT s.*, c.nombre as caja_nombre, c.punto_expedicion, c.establecimiento, u.nombre as usuario_nombre
      FROM sesiones_caja s
      JOIN cajas c ON s.caja_id = c.id
      JOIN usuarios u ON s.usuario_id = u.id
      WHERE s.estado = 'abierta'
      ORDER BY s.id DESC LIMIT 1
    `);

    if (!sesion) {
      return res.json({ success: true, activa: false, sesion: null });
    }

    // Calcular totales actuales de la sesión
    const ventasEfectivo = await get(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM ventas
      WHERE sesion_caja_id = ? AND metodo_pago = 'efectivo' AND condicion_venta = 'contado' AND estado = 'completada'
    `, [sesion.id]);

    const ventasTarjeta = await get(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM ventas
      WHERE sesion_caja_id = ? AND metodo_pago = 'tarjeta' AND condicion_venta = 'contado' AND estado = 'completada'
    `, [sesion.id]);

    const ventasQR = await get(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM ventas
      WHERE sesion_caja_id = ? AND metodo_pago = 'transferencia_qr' AND condicion_venta = 'contado' AND estado = 'completada'
    `, [sesion.id]);

    const cobrosCredito = await get(`
      SELECT COALESCE(SUM(monto_total), 0) as total
      FROM cobros
      WHERE sesion_caja_id = ? AND forma_cobro = 'efectivo'
    `, [sesion.id]);

    const ingresosExtra = await get(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM movimientos_caja
      WHERE sesion_caja_id = ? AND tipo_movimiento = 'ingreso'
    `, [sesion.id]);

    const egresosExtra = await get(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM movimientos_caja
      WHERE sesion_caja_id = ? AND tipo_movimiento = 'egreso'
    `, [sesion.id]);

    const vEf = ventasEfectivo ? ventasEfectivo.total : 0;
    const vTar = ventasTarjeta ? ventasTarjeta.total : 0;
    const vQR = ventasQR ? ventasQR.total : 0;
    const cobEf = cobrosCredito ? cobrosCredito.total : 0;
    const ingExt = ingresosExtra ? ingresosExtra.total : 0;
    const egExt = egresosExtra ? egresosExtra.total : 0;

    const saldoTeoricoEfectivo = sesion.monto_apertura + vEf + cobEf + ingExt - egExt;

    res.json({
      success: true,
      activa: true,
      sesion: {
        ...sesion,
        ventas_efectivo: vEf,
        ventas_tarjeta: vTar,
        ventas_qr: vQR,
        cobros_credito_efectivo: cobEf,
        ingresos_extra: ingExt,
        egresos_extra: egExt,
        saldo_teorico_efectivo: saldoTeoricoEfectivo
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/caja/apertura (Abrir turno de caja)
router.post('/apertura', verifyToken, async (req, res, next) => {
  try {
    const { caja_id, monto_apertura = 0, observaciones = '' } = req.body;

    const cajaIdFinal = caja_id || 1;

    // Verificar si ya hay una sesión abierta en esta caja
    const abierta = await get("SELECT id FROM sesiones_caja WHERE caja_id = ? AND estado = 'abierta'", [cajaIdFinal]);
    if (abierta) {
      return res.status(400).json({ success: false, message: 'Esta caja ya tiene una sesión abierta activa.' });
    }

    const result = await run(`
      INSERT INTO sesiones_caja (caja_id, usuario_id, monto_apertura, estado, observaciones)
      VALUES (?, ?, ?, 'abierta', ?)
    `, [cajaIdFinal, req.usuario.id, Number(monto_apertura) || 0, observaciones]);

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'APERTURA_CAJA', 'sesiones_caja', result.lastID, `Apertura de caja con fondo inicial Gs. ${(Number(monto_apertura) || 0).toLocaleString('es-PY')}`]
    );

    res.status(201).json({
      success: true,
      message: 'Caja abierta exitosamente con fondo inicial',
      sesionId: result.lastID
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/caja/movimiento (Registrar entrada o salida de efectivo)
router.post('/movimiento', verifyToken, async (req, res, next) => {
  try {
    const { tipo_movimiento, concepto, monto } = req.body;

    if (!tipo_movimiento || !concepto || !monto || Number(monto) <= 0) {
      return res.status(400).json({ success: false, message: 'Debe ingresar tipo (ingreso/egreso), concepto y monto positivo válido.' });
    }

    const sesion = await get("SELECT id FROM sesiones_caja WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1");
    if (!sesion) {
      return res.status(400).json({ success: false, message: 'No hay ninguna caja abierta actualmente.' });
    }

    const result = await run(`
      INSERT INTO movimientos_caja (sesion_caja_id, tipo_movimiento, concepto, monto, usuario_id)
      VALUES (?, ?, ?, ?, ?)
    `, [sesion.id, tipo_movimiento, concepto, Number(monto), req.usuario.id]);

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, `MOVIMIENTO_CAJA_${tipo_movimiento.toUpperCase()}`, 'movimientos_caja', result.lastID, `${concepto}: Gs. ${Number(monto).toLocaleString('es-PY')}`]
    );

    res.status(201).json({ success: true, message: 'Movimiento de caja registrado exitosamente', id: result.lastID });
  } catch (err) {
    next(err);
  }
});

// GET /api/caja/movimientos (Listar movimientos de la sesión activa o por sesión)
router.get('/movimientos', verifyToken, async (req, res, next) => {
  try {
    const sesionId = req.query.sesion_id;
    let query = `
      SELECT m.*, u.nombre as usuario_nombre
      FROM movimientos_caja m
      JOIN usuarios u ON m.usuario_id = u.id
    `;
    const params = [];

    if (sesionId) {
      query += ' WHERE m.sesion_caja_id = ?';
      params.push(sesionId);
    } else {
      const sesion = await get("SELECT id FROM sesiones_caja WHERE estado = 'abierta' ORDER BY id DESC LIMIT 1");
      if (!sesion) return res.json({ success: true, movimientos: [] });
      query += ' WHERE m.sesion_caja_id = ?';
      params.push(sesion.id);
    }

    query += ' ORDER BY m.id DESC';
    const movimientos = await all(query, params);
    res.json({ success: true, movimientos });
  } catch (err) {
    next(err);
  }
});

// POST /api/caja/cierre (Cierre formal de caja y recaudación a depositar)
router.post('/cierre', verifyToken, async (req, res, next) => {
  try {
    const { monto_cierre_efectivo, observaciones = '', recaudacion_depositar } = req.body;

    const sesion = await get(`
      SELECT s.*, c.nombre as caja_nombre
      FROM sesiones_caja s
      JOIN cajas c ON s.caja_id = c.id
      WHERE s.estado = 'abierta'
      ORDER BY s.id DESC LIMIT 1
    `);

    if (!sesion) {
      return res.status(400).json({ success: false, message: 'No hay ninguna caja abierta para cerrar.' });
    }

    // Calcular totales
    const ventasEfectivo = await get(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM ventas
      WHERE sesion_caja_id = ? AND metodo_pago = 'efectivo' AND condicion_venta = 'contado' AND estado = 'completada'
    `, [sesion.id]);

    const cobrosCredito = await get(`
      SELECT COALESCE(SUM(monto_total), 0) as total
      FROM cobros
      WHERE sesion_caja_id = ? AND forma_cobro = 'efectivo'
    `, [sesion.id]);

    const ingresosExtra = await get(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM movimientos_caja
      WHERE sesion_caja_id = ? AND tipo_movimiento = 'ingreso'
    `, [sesion.id]);

    const egresosExtra = await get(`
      SELECT COALESCE(SUM(monto), 0) as total
      FROM movimientos_caja
      WHERE sesion_caja_id = ? AND tipo_movimiento = 'egreso'
    `, [sesion.id]);

    const vEf = ventasEfectivo ? ventasEfectivo.total : 0;
    const cobEf = cobrosCredito ? cobrosCredito.total : 0;
    const ingExt = ingresosExtra ? ingresosExtra.total : 0;
    const egExt = egresosExtra ? egresosExtra.total : 0;

    const saldoTeorico = sesion.monto_apertura + vEf + cobEf + ingExt - egExt;
    const contadoFisico = Number(monto_cierre_efectivo) || 0;
    const diferencia = contadoFisico - saldoTeorico; // >0 sobrante, <0 faltante
    const aDepositar = recaudacion_depositar !== undefined ? Number(recaudacion_depositar) : contadoFisico;

    await run(`
      UPDATE sesiones_caja SET
        fecha_cierre = DATETIME('now', 'localtime'),
        monto_sistema = ?,
        monto_cierre_efectivo = ?,
        diferencia = ?,
        recaudacion_depositar = ?,
        estado = 'cerrada',
        observaciones = ?
      WHERE id = ?
    `, [saldoTeorico, contadoFisico, diferencia, aDepositar, observaciones, sesion.id]);

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'CIERRE_CAJA', 'sesiones_caja', sesion.id, `Cierre de caja. Sistema: Gs. ${saldoTeorico.toLocaleString('es-PY')}, Contado: Gs. ${contadoFisico.toLocaleString('es-PY')}, Dif: Gs. ${diferencia.toLocaleString('es-PY')}, A depositar: Gs. ${aDepositar.toLocaleString('es-PY')}`]
    );

    res.json({
      success: true,
      message: 'Caja cerrada exitosamente',
      resumen: {
        sesion_id: sesion.id,
        monto_apertura: sesion.monto_apertura,
        ventas_efectivo: vEf,
        cobros_efectivo: cobEf,
        ingresos_extra: ingExt,
        egresos_extra: egExt,
        saldo_sistema: saldoTeorico,
        monto_contado_fisico: contadoFisico,
        diferencia,
        recaudacion_depositar: aDepositar
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/caja/historial (Historial de turnos cerrados)
router.get('/historial', verifyToken, async (req, res, next) => {
  try {
    const historial = await all(`
      SELECT s.*, c.nombre as caja_nombre, u.nombre as cajero_nombre
      FROM sesiones_caja s
      JOIN cajas c ON s.caja_id = c.id
      JOIN usuarios u ON s.usuario_id = u.id
      WHERE s.estado = 'cerrada'
      ORDER BY s.id DESC LIMIT 50
    `);
    res.json({ success: true, historial });
  } catch (err) {
    next(err);
  }
});

// GET /api/caja/sesion/:id (Detalle completo para comprobante o impresión de arqueo)
router.get('/sesion/:id', verifyToken, async (req, res, next) => {
  try {
    const sesion = await get(`
      SELECT s.*, c.nombre as caja_nombre, c.punto_expedicion, c.establecimiento, u.nombre as cajero_nombre
      FROM sesiones_caja s
      JOIN cajas c ON s.caja_id = c.id
      JOIN usuarios u ON s.usuario_id = u.id
      WHERE s.id = ?
    `, [req.params.id]);

    if (!sesion) {
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    const ventas = await all(`
      SELECT metodo_pago, COUNT(*) as cantidad, SUM(total) as total
      FROM ventas
      WHERE sesion_caja_id = ? AND estado = 'completada'
      GROUP BY metodo_pago
    `, [sesion.id]);

    const movimientos = await all(`
      SELECT m.*, u.nombre as usuario_nombre
      FROM movimientos_caja m
      JOIN usuarios u ON m.usuario_id = u.id
      WHERE m.sesion_caja_id = ?
      ORDER BY m.id ASC
    `, [sesion.id]);

    const cobros = await all(`
      SELECT c.*, cl.nombre_razon as cliente_nombre
      FROM cobros c
      JOIN clientes cl ON c.cliente_id = cl.id
      WHERE c.sesion_caja_id = ?
      ORDER BY c.id ASC
    `, [sesion.id]);

    res.json({ success: true, sesion, ventas, movimientos, cobros });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
