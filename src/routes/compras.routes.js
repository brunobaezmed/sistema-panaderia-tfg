/**
 * ============================================================================
 * MÓDULO: GESTIÓN DE COMPRAS Y PROVEEDORES (/api/compras)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Gestiona el registro de proveedores, facturas de compra de materias primas,
 * recepción con control de lotes y fechas de vencimiento, e ingreso a Kardex.
 */

const express = require('express');
const router = express.Router();
const { get, all, run, actualizarStock, registrarKardex } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

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

// GET /api/compras
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const compras = await all(`
      SELECT c.*,
             prov.razon_social as proveedor_nombre,
             prov.ruc as proveedor_ruc,
             d.nombre as deposito_nombre,
             u.nombre as usuario_nombre,
             (SELECT COUNT(*) FROM compras_detalles WHERE compra_id = c.id) as total_items
      FROM compras c
      JOIN proveedores prov ON c.proveedor_id = prov.id
      JOIN depositos d ON c.deposito_id = d.id
      JOIN usuarios u ON c.usuario_id = u.id
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
             u.nombre as usuario_nombre
      FROM compras c
      JOIN proveedores prov ON c.proveedor_id = prov.id
      JOIN depositos d ON c.deposito_id = d.id
      JOIN usuarios u ON c.usuario_id = u.id
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
      numero_factura,
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
      totalCompra += (d.cantidad * d.precio_unitario);
    }

    // 1. Save purchase header
    const resultCompra = await run(`
      INSERT INTO compras (
        proveedor_id, deposito_id, usuario_id, numero_factura,
        fecha_compra, total, condicion, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      proveedor_id,
      deposito_id,
      req.usuario.id,
      numero_factura,
      fecha_compra || new Date().toISOString().split('T')[0],
      totalCompra,
      condicion,
      observaciones
    ]);

    const compraId = resultCompra.lastID;

    // 2. Process details, lot creation, stock and kardex
    for (const d of detalles) {
      const subtotal = d.cantidad * d.precio_unitario;
      const codigoLote = d.codigo_lote || `LOT-COM-${Date.now().toString().slice(-6)}`;
      const fechaVto = d.fecha_vencimiento || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Save detail
      await run(`
        INSERT INTO compras_detalles (
          compra_id, producto_id, codigo_lote, fecha_vencimiento, cantidad, precio_unitario, subtotal
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [compraId, d.producto_id, codigoLote, fechaVto, d.cantidad, d.precio_unitario, subtotal]);

      // Create lot
      await run(`
        INSERT INTO lotes (
          producto_id, deposito_id, codigo_lote, cantidad_inicial, cantidad_actual,
          fecha_elaboracion, fecha_vencimiento, precio_compra, estado
        ) VALUES (?, ?, ?, ?, ?, DATE('now', 'localtime'), ?, ?, 'activo')
      `, [d.producto_id, deposito_id, codigoLote, d.cantidad, d.cantidad, fechaVto, d.precio_unitario]);

      // Update product cost price
      await run('UPDATE productos SET precio_costo = ? WHERE id = ?', [d.precio_unitario, d.producto_id]);

      // Increase stock in deposit
      await actualizarStock(d.producto_id, deposito_id, Number(d.cantidad));

      // Register Kardex
      await registrarKardex({
        producto_id: d.producto_id,
        deposito_id,
        tipo_movimiento: 'COMPRA',
        referencia_id: compraId,
        referencia_documento: `FACT-${numero_factura}`,
        cantidad_entrada: Number(d.cantidad),
        costo_unitario: d.precio_unitario,
        usuario_id: req.usuario.id,
        observaciones: `Ingreso por compra Fact. ${numero_factura} (Lote: ${codigoLote})`
      });
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

module.exports = router;
