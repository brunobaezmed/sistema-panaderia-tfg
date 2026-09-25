const express = require('express');
const router = express.Router();
const { get, all, run, actualizarStock, registrarKardex } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// GET /api/produccion
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const ordenes = await all(`
      SELECT p.*,
             r.nombre as receta_nombre,
             prod.nombre as producto_nombre,
             prod.codigo as producto_codigo,
             u.simbolo as unidad_simbolo,
             d_orig.nombre as deposito_origen,
             d_dest.nombre as deposito_destino,
             usr.nombre as usuario_nombre
      FROM producciones p
      JOIN recetas r ON p.receta_id = r.id
      JOIN productos prod ON p.producto_terminado_id = prod.id
      JOIN depositos d_orig ON p.deposito_origen_id = d_orig.id
      JOIN depositos d_dest ON p.deposito_destino_id = d_dest.id
      JOIN usuarios usr ON p.usuario_id = usr.id
      ORDER BY p.id DESC
      LIMIT 100
    `);

    res.json({ success: true, ordenes });
  } catch (err) {
    next(err);
  }
});

// POST /api/produccion/ejecutar
router.post('/ejecutar', verifyToken, checkRole(['admin', 'produccion', 'deposito']), async (req, res, next) => {
  try {
    const {
      receta_id,
      deposito_origen_id,
      deposito_destino_id,
      multiplicador_tandas = 1,
      cantidad_obtenida,
      merma_estimada = 0,
      dias_vencimiento_lote = 3,
      observaciones = ''
    } = req.body;

    if (!receta_id || !deposito_origen_id || !deposito_destino_id || !cantidad_obtenida) {
      return res.status(400).json({ success: false, message: 'Faltan parámetros requeridos para la producción' });
    }

    // 1. Fetch recipe and required ingredients
    const receta = await get('SELECT * FROM recetas WHERE id = ? AND estado = 1', [receta_id]);
    if (!receta) {
      return res.status(404).json({ success: false, message: 'Receta no encontrada o inactiva' });
    }

    const detallesReceta = await all('SELECT * FROM recetas_detalles WHERE receta_id = ?', [receta_id]);
    if (!detallesReceta.length) {
      return res.status(400).json({ success: false, message: 'La receta no contiene insumos registrados' });
    }

    // 2. Validate stock availability for all ingredients
    const faltantes = [];
    let costoTotalInsumos = 0;

    for (const det of detallesReceta) {
      const cantidadNecesaria = det.cantidad_requerida * multiplicador_tandas;
      const insumo = await get('SELECT nombre, precio_costo FROM productos WHERE id = ?', [det.insumo_id]);
      const stockActual = await get(
        'SELECT cantidad FROM stock_deposito WHERE producto_id = ? AND deposito_id = ?',
        [det.insumo_id, deposito_origen_id]
      );

      const disponible = stockActual ? stockActual.cantidad : 0;
      if (disponible < cantidadNecesaria) {
        faltantes.push({
          insumo: insumo ? insumo.nombre : `ID ${det.insumo_id}`,
          requerido: cantidadNecesaria,
          disponible
        });
      }

      if (insumo) {
        costoTotalInsumos += (insumo.precio_costo * cantidadNecesaria);
      }
    }

    if (faltantes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock insuficiente de materias primas en el depósito de origen para esta tanda de producción',
        faltantes
      });
    }

    // 3. Generate production order code
    const countProd = await get('SELECT COUNT(*) as count FROM producciones');
    const codigoProduccion = `ORD-PROD-${String(countProd.count + 1).padStart(5, '0')}`;
    const cantidadPlanificada = receta.rendimiento_unidades * multiplicador_tandas;

    // 4. Save production master record
    const resultProd = await run(`
      INSERT INTO producciones (
        codigo, receta_id, producto_terminado_id, deposito_origen_id, deposito_destino_id,
        cantidad_planificada, cantidad_obtenida, merma_estimada, costo_total,
        estado, usuario_id, fecha_produccion, observaciones
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'finalizado', ?, DATE('now', 'localtime'), ?)
    `, [
      codigoProduccion,
      receta.id,
      receta.producto_terminado_id,
      deposito_origen_id,
      deposito_destino_id,
      cantidadPlanificada,
      cantidad_obtenida,
      merma_estimada,
      costoTotalInsumos,
      req.usuario.id,
      observaciones
    ]);

    const produccionId = resultProd.lastID;

    // 5. Consume ingredients: update stock & Kardex
    for (const det of detallesReceta) {
      const cantidadConsumida = det.cantidad_requerida * multiplicador_tandas;
      const insumo = await get('SELECT precio_costo FROM productos WHERE id = ?', [det.insumo_id]);

      await actualizarStock(det.insumo_id, deposito_origen_id, -cantidadConsumida);

      await registrarKardex({
        producto_id: det.insumo_id,
        deposito_id: deposito_origen_id,
        tipo_movimiento: 'PRODUCCION_CONSUMO',
        referencia_id: produccionId,
        referencia_documento: codigoProduccion,
        cantidad_salida: cantidadConsumida,
        costo_unitario: insumo ? insumo.precio_costo : 0,
        usuario_id: req.usuario.id,
        observaciones: `Insumo utilizado en orden ${codigoProduccion} (${receta.nombre})`
      });
    }

    // 6. Add finished product to destination deposit: update stock & lot & Kardex
    await actualizarStock(receta.producto_terminado_id, deposito_destino_id, Number(cantidad_obtenida));

    const costoUnitarioProduccion = cantidad_obtenida > 0 ? (costoTotalInsumos / cantidad_obtenida) : 0;
    const codigoLote = `LOT-PROD-${Date.now().toString().slice(-6)}`;
    const fechaVto = new Date();
    fechaVto.setDate(fechaVto.getDate() + (parseInt(dias_vencimiento_lote) || 3));
    const fechaVtoStr = fechaVto.toISOString().split('T')[0];

    await run(`
      INSERT INTO lotes (
        producto_id, deposito_id, codigo_lote, cantidad_inicial,
        cantidad_actual, fecha_elaboracion, fecha_vencimiento, precio_compra, estado
      ) VALUES (?, ?, ?, ?, ?, DATE('now', 'localtime'), ?, ?, 'activo')
    `, [
      receta.producto_terminado_id,
      deposito_destino_id,
      codigoLote,
      cantidad_obtenida,
      cantidad_obtenida,
      fechaVtoStr,
      costoUnitarioProduccion
    ]);

    await registrarKardex({
      producto_id: receta.producto_terminado_id,
      deposito_id: deposito_destino_id,
      tipo_movimiento: 'PRODUCCION_ENTRADA',
      referencia_id: produccionId,
      referencia_documento: codigoProduccion,
      cantidad_entrada: Number(cantidad_obtenida),
      costo_unitario: costoUnitarioProduccion,
      usuario_id: req.usuario.id,
      observaciones: `Entrada por elaboración / horneada ${codigoProduccion}`
    });

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'EJECUTAR_PRODUCCION', 'producciones', produccionId, `Horneada completada: ${codigoProduccion} - ${cantidad_obtenida} un/kg de producto`]
    );

    res.status(201).json({
      success: true,
      message: `¡Producción ejecutada exitosamente! Se descontaron los insumos y se ingresaron ${cantidad_obtenida} unidades/kg al stock.`,
      codigo: codigoProduccion,
      produccionId,
      costoTotalInsumos,
      costoUnitarioProduccion
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
