/**
 * ============================================================================
 * MÓDULO: INFORMES GERENCIALES Y ESTADÍSTICAS (/api/reportes)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Genera reportes estratégicos: inventario valorizado a costo y precio de venta,
 * resumen de ventas por método de pago, pérdidas por mermas y vencimientos.
 */

const express = require('express');
const router = express.Router();
const { all, get } = require('../config/database');
const { verifyToken } = require('../middlewares/auth');

// GET /api/reportes/inventario-valorizado
router.get('/inventario-valorizado', verifyToken, async (req, res, next) => {
  try {
    const items = await all(`
      SELECT p.id, p.codigo, p.nombre, p.tipo,
             c.nombre as categoria,
             u.simbolo as unidad,
             d.nombre as deposito,
             s.cantidad,
             p.precio_costo,
             p.precio_venta,
             (s.cantidad * p.precio_costo) as valor_costo_total,
             (s.cantidad * p.precio_venta) as valor_venta_estimado
      FROM stock_deposito s
      JOIN productos p ON s.producto_id = p.id
      JOIN depositos d ON s.deposito_id = d.id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE s.cantidad > 0 AND p.estado = 1
      ORDER BY d.id ASC, p.tipo DESC, p.nombre ASC
    `);

    const totales = items.reduce((acc, curr) => {
      acc.totalCosto += (curr.valor_costo_total || 0);
      acc.totalVenta += (curr.valor_venta_estimado || 0);
      acc.totalUnidades += (curr.cantidad || 0);
      return acc;
    }, { totalCosto: 0, totalVenta: 0, totalUnidades: 0 });

    res.json({ success: true, items, totales });
  } catch (err) {
    next(err);
  }
});

// GET /api/reportes/ventas-resumen
router.get('/ventas-resumen', verifyToken, async (req, res, next) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;
    let filter = '';
    const params = [];

    if (fecha_desde && fecha_hasta) {
      filter = ' AND DATE(v.fecha_venta) BETWEEN ? AND ?';
      params.push(fecha_desde, fecha_hasta);
    }

    const ventasPorMetodo = await all(`
      SELECT metodo_pago, COUNT(*) as transacciones, SUM(total) as total_monto
      FROM ventas v
      WHERE v.estado = 'completada' ${filter}
      GROUP BY metodo_pago
    `, params);

    const ventasPorProducto = await all(`
      SELECT p.id, p.codigo, p.nombre, c.nombre as categoria,
             SUM(vd.cantidad) as cantidad_vendida,
             SUM(vd.subtotal) as total_facturado,
             u.simbolo as unidad
      FROM ventas_detalles vd
      JOIN ventas v ON vd.venta_id = v.id
      JOIN productos p ON vd.producto_id = p.id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE v.estado = 'completada' ${filter}
      GROUP BY p.id
      ORDER BY total_facturado DESC
    `, params);

    const totalVentas = ventasPorProducto.reduce((sum, i) => sum + i.total_facturado, 0);

    res.json({
      success: true,
      ventasPorMetodo,
      ventasPorProducto,
      totalVentas
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reportes/mermas-ajustes
router.get('/mermas-ajustes', verifyToken, async (req, res, next) => {
  try {
    const ajustes = await all(`
      SELECT a.id, a.codigo, a.fecha, a.tipo_ajuste, a.motivo, a.observaciones,
             d.nombre as deposito,
             p.nombre as producto,
             ad.cantidad_anterior,
             ad.cantidad_ajustada,
             ad.diferencia,
             u.nombre as usuario
      FROM ajustes_stock a
      JOIN ajustes_detalles ad ON a.id = ad.ajuste_id
      JOIN productos p ON ad.producto_id = p.id
      JOIN depositos d ON a.deposito_id = d.id
      JOIN usuarios u ON a.usuario_id = u.id
      ORDER BY a.fecha DESC
    `);

    res.json({ success: true, ajustes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
