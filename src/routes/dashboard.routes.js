const express = require('express');
const router = express.Router();
const { get, all } = require('../config/database');
const { verifyToken } = require('../middlewares/auth');

// GET /api/dashboard/stats
router.get('/stats', verifyToken, async (req, res, next) => {
  try {
    // 1. Total de insumos y productos
    const totalProductos = await get('SELECT COUNT(*) as count FROM productos WHERE estado = 1');
    const totalInsumos = await get("SELECT COUNT(*) as count FROM productos WHERE tipo = 'materia_prima' AND estado = 1");
    const totalTerminados = await get("SELECT COUNT(*) as count FROM productos WHERE tipo = 'producto_terminado' AND estado = 1");

    // 2. Valor total del inventario valorizado (costo)
    const valorInventario = await get(`
      SELECT SUM(s.cantidad * p.precio_costo) as valor_total
      FROM stock_deposito s
      JOIN productos p ON s.producto_id = p.id
      WHERE p.estado = 1
    `);

    // 3. Ventas de hoy y del mes
    const ventasHoy = await get(`
      SELECT COUNT(*) as total_transacciones, COALESCE(SUM(total), 0) as total_monto
      FROM ventas
      WHERE DATE(fecha_venta) = DATE('now', 'localtime') AND estado = 'completada'
    `);

    const ventasMes = await get(`
      SELECT COUNT(*) as total_transacciones, COALESCE(SUM(total), 0) as total_monto
      FROM ventas
      WHERE STRFTIME('%Y-%m', fecha_venta) = STRFTIME('%Y-%m', 'now', 'localtime') AND estado = 'completada'
    `);

    // 4. Alertas de Stock Crítico (por debajo de stock mínimo)
    const productosStockBajo = await all(`
      SELECT p.id, p.codigo, p.nombre, p.tipo, p.stock_minimo, u.simbolo as unidad,
             COALESCE(SUM(s.cantidad), 0) as stock_actual, c.nombre as categoria
      FROM productos p
      LEFT JOIN stock_deposito s ON p.id = s.producto_id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.estado = 1
      GROUP BY p.id
      HAVING stock_actual <= p.stock_minimo
      ORDER BY (stock_actual - p.stock_minimo) ASC
      LIMIT 10
    `);

    // 5. Alertas de Vencimiento Próximo (dentro de los próximos 15 días o ya vencidos)
    const lotesPorVencer = await all(`
      SELECT l.id, l.codigo_lote, l.fecha_vencimiento, l.cantidad_actual,
             p.codigo, p.nombre, p.tipo, d.nombre as deposito, u.simbolo as unidad,
             CAST(JULIANDAY(l.fecha_vencimiento) - JULIANDAY('now', 'localtime') AS INT) as dias_restantes
      FROM lotes l
      JOIN productos p ON l.producto_id = p.id
      JOIN depositos d ON l.deposito_id = d.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE l.cantidad_actual > 0 AND l.estado = 'activo'
        AND JULIANDAY(l.fecha_vencimiento) - JULIANDAY('now', 'localtime') <= 15
      ORDER BY l.fecha_vencimiento ASC
      LIMIT 10
    `);

    // 6. Últimos movimientos de Kardex
    const ultimosMovimientos = await all(`
      SELECT k.id, k.fecha, k.tipo_movimiento, k.referencia_documento,
             k.cantidad_entrada, k.cantidad_salida, k.saldo_resultante,
             p.nombre as producto, p.tipo as tipo_producto, d.nombre as deposito,
             u.nombre as usuario, um.simbolo as unidad
      FROM kardex k
      JOIN productos p ON k.producto_id = p.id
      JOIN depositos d ON k.deposito_id = d.id
      LEFT JOIN usuarios u ON k.usuario_id = u.id
      LEFT JOIN unidades_medida um ON p.unidad_id = um.id
      ORDER BY k.id DESC
      LIMIT 8
    `);

    // 7. Top 5 productos más vendidos del mes
    const topVendidos = await all(`
      SELECT p.id, p.codigo, p.nombre, SUM(vd.cantidad) as cantidad_total,
             SUM(vd.subtotal) as total_recaudado, u.simbolo as unidad
      FROM ventas_detalles vd
      JOIN ventas v ON vd.venta_id = v.id
      JOIN productos p ON vd.producto_id = p.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE v.estado = 'completada'
      GROUP BY p.id
      ORDER BY cantidad_total DESC
      LIMIT 5
    `);

    // 8. Gráfico de ventas de los últimos 7 días
    const ventasUltimos7Dias = await all(`
      SELECT DATE(fecha_venta) as fecha, COALESCE(SUM(total), 0) as total, COUNT(*) as cantidad
      FROM ventas
      WHERE fecha_venta >= DATE('now', '-7 days', 'localtime') AND estado = 'completada'
      GROUP BY DATE(fecha_venta)
      ORDER BY fecha ASC
    `);

    // 9. Órdenes de producción recientes
    const ultimasProducciones = await all(`
      SELECT p.*,
             r.nombre as receta_nombre,
             prod.nombre as producto_nombre,
             prod.codigo as producto_codigo,
             u.simbolo as unidad_simbolo,
             d_dest.nombre as deposito_destino,
             usr.nombre as usuario_nombre
      FROM producciones p
      JOIN recetas r ON p.receta_id = r.id
      JOIN productos prod ON p.producto_terminado_id = prod.id
      JOIN depositos d_dest ON p.deposito_destino_id = d_dest.id
      JOIN usuarios usr ON p.usuario_id = usr.id
      ORDER BY p.id DESC
      LIMIT 6
    `);

    res.json({
      success: true,
      stats: {
        totalProductos: totalProductos.count,
        totalInsumos: totalInsumos.count,
        totalTerminados: totalTerminados.count,
        valorInventario: valorInventario ? valorInventario.valor_total || 0 : 0,
        ventasHoy,
        ventasMes,
        alertaStockBajoCount: productosStockBajo.length,
        alertaVencimientoCount: lotesPorVencer.length,
        totalProduccionesCount: ultimasProducciones.length
      },
      productosStockBajo,
      lotesPorVencer,
      ultimosMovimientos,
      topVendidos,
      ventasUltimos7Dias,
      ultimasProducciones
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
