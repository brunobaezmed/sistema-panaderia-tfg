const express = require('express');
const router = express.Router();
const { get, all, run } = require('../config/database');
const { verifyToken, checkRole } = require('../middlewares/auth');

// GET /api/productos/categorias
router.get('/meta/categorias', verifyToken, async (req, res, next) => {
  try {
    const categorias = await all('SELECT * FROM categorias ORDER BY nombre ASC');
    res.json({ success: true, categorias });
  } catch (err) {
    next(err);
  }
});

// GET /api/productos/unidades
router.get('/meta/unidades', verifyToken, async (req, res, next) => {
  try {
    const unidades = await all('SELECT * FROM unidades_medida ORDER BY nombre ASC');
    res.json({ success: true, unidades });
  } catch (err) {
    next(err);
  }
});

// GET /api/productos
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const { tipo, categoria_id, search, estado } = req.query;
    let query = `
      SELECT p.*,
             c.nombre as categoria_nombre,
             u.nombre as unidad_nombre,
             u.simbolo as unidad_simbolo,
             COALESCE((SELECT SUM(cantidad) FROM stock_deposito WHERE producto_id = p.id), 0) as stock_total
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (tipo) {
      query += ' AND p.tipo = ?';
      params.push(tipo);
    }
    if (categoria_id) {
      query += ' AND p.categoria_id = ?';
      params.push(categoria_id);
    }
    if (estado !== undefined) {
      query += ' AND p.estado = ?';
      params.push(estado);
    }
    if (search) {
      query += ' AND (p.nombre LIKE ? OR p.codigo LIKE ? OR p.codigo_barra LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY p.tipo DESC, p.nombre ASC';
    const productos = await all(query, params);
    res.json({ success: true, productos });
  } catch (err) {
    next(err);
  }
});

// GET /api/productos/:id
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const producto = await get(`
      SELECT p.*,
             c.nombre as categoria_nombre,
             u.nombre as unidad_nombre,
             u.simbolo as unidad_simbolo
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN unidades_medida u ON p.unidad_id = u.id
      WHERE p.id = ?
    `, [req.params.id]);

    if (!producto) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    // Stocks per deposit
    const stockPorDeposito = await all(`
      SELECT d.id as deposito_id, d.nombre as deposito_nombre, COALESCE(s.cantidad, 0) as cantidad
      FROM depositos d
      LEFT JOIN stock_deposito s ON d.id = s.deposito_id AND s.producto_id = ?
    `, [req.params.id]);

    // Active lots
    const lotes = await all(`
      SELECT l.*, d.nombre as deposito_nombre
      FROM lotes l
      JOIN depositos d ON l.deposito_id = d.id
      WHERE l.producto_id = ? AND l.cantidad_actual > 0
      ORDER BY l.fecha_vencimiento ASC
    `, [req.params.id]);

    res.json({
      success: true,
      producto,
      stockPorDeposito,
      lotes
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/productos
router.post('/', verifyToken, checkRole(['admin', 'deposito', 'produccion']), async (req, res, next) => {
  try {
    const {
      codigo,
      codigo_barra,
      nombre,
      descripcion,
      tipo,
      categoria_id,
      unidad_id,
      stock_minimo,
      stock_maximo,
      precio_costo,
      precio_venta,
      iva
    } = req.body;

    if (!codigo || !nombre || !tipo) {
      return res.status(400).json({ success: false, message: 'Código, nombre y tipo son obligatorios' });
    }

    const existe = await get('SELECT id FROM productos WHERE codigo = ?', [codigo]);
    if (existe) {
      return res.status(400).json({ success: false, message: 'El código de producto ya existe' });
    }

    const result = await run(`
      INSERT INTO productos (
        codigo, codigo_barra, nombre, descripcion, tipo,
        categoria_id, unidad_id, stock_minimo, stock_maximo,
        precio_costo, precio_venta, iva, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [
      codigo,
      codigo_barra || null,
      nombre,
      descripcion || '',
      tipo,
      categoria_id || null,
      unidad_id || null,
      stock_minimo || 5,
      stock_maximo || 1000,
      precio_costo || 0,
      precio_venta || 0,
      iva !== undefined ? iva : 10
    ]);

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'CREAR_PRODUCTO', 'productos', result.lastID, `Producto creado: ${nombre} (${codigo})`]
    );

    res.status(201).json({
      success: true,
      message: 'Producto creado exitosamente',
      id: result.lastID
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/productos/:id
router.put('/:id', verifyToken, checkRole(['admin', 'deposito', 'produccion']), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      codigo,
      codigo_barra,
      nombre,
      descripcion,
      tipo,
      categoria_id,
      unidad_id,
      stock_minimo,
      stock_maximo,
      precio_costo,
      precio_venta,
      iva,
      estado
    } = req.body;

    const producto = await get('SELECT id FROM productos WHERE id = ?', [id]);
    if (!producto) {
      return res.status(404).json({ success: false, message: 'Producto no encontrado' });
    }

    await run(`
      UPDATE productos SET
        codigo = ?,
        codigo_barra = ?,
        nombre = ?,
        descripcion = ?,
        tipo = ?,
        categoria_id = ?,
        unidad_id = ?,
        stock_minimo = ?,
        stock_maximo = ?,
        precio_costo = ?,
        precio_venta = ?,
        iva = ?,
        estado = ?
      WHERE id = ?
    `, [
      codigo,
      codigo_barra,
      nombre,
      descripcion,
      tipo,
      categoria_id,
      unidad_id,
      stock_minimo,
      stock_maximo,
      precio_costo,
      precio_venta,
      iva,
      estado !== undefined ? estado : 1,
      id
    ]);

    await run('INSERT INTO auditoria_logs (usuario_id, accion, tabla_afectada, registro_id, detalles) VALUES (?, ?, ?, ?, ?)',
      [req.usuario.id, 'ACTUALIZAR_PRODUCTO', 'productos', id, `Producto modificado: ${nombre}`]
    );

    res.json({ success: true, message: 'Producto actualizado exitosamente' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/productos/:id
router.delete('/:id', verifyToken, checkRole(['admin']), async (req, res, next) => {
  try {
    const { id } = req.params;
    await run('UPDATE productos SET estado = 0 WHERE id = ?', [id]);
    res.json({ success: true, message: 'Producto desactivado exitosamente' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
