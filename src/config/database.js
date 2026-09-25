const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'panaderia.db');
const db = new sqlite3.Database(dbPath);

// Promisified helpers
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const exec = (sql) => {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Helper for Kardex movement insertion
const registrarKardex = async ({
  producto_id,
  deposito_id,
  tipo_movimiento,
  referencia_id = null,
  referencia_documento = '',
  cantidad_entrada = 0,
  cantidad_salida = 0,
  costo_unitario = 0,
  usuario_id = null,
  observaciones = ''
}) => {
  // Obtain current total stock for the product in this deposit
  const stockRow = await get(
    'SELECT cantidad FROM stock_deposito WHERE producto_id = ? AND deposito_id = ?',
    [producto_id, deposito_id]
  );
  const saldo_resultante = stockRow ? stockRow.cantidad : 0;
  const costo_total = (cantidad_entrada > 0 ? cantidad_entrada : cantidad_salida) * costo_unitario;

  await run(
    `INSERT INTO kardex (
      fecha, producto_id, deposito_id, tipo_movimiento, referencia_id,
      referencia_documento, cantidad_entrada, cantidad_salida,
      saldo_resultante, costo_unitario, costo_total, usuario_id, observaciones
    ) VALUES (DATETIME('now', 'localtime'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      producto_id,
      deposito_id,
      tipo_movimiento,
      referencia_id,
      referencia_documento,
      cantidad_entrada,
      cantidad_salida,
      saldo_resultante,
      costo_unitario,
      costo_total,
      usuario_id,
      observaciones
    ]
  );
};

// Helper to update stock safely
const actualizarStock = async (producto_id, deposito_id, deltaCantidad) => {
  const actual = await get(
    'SELECT id, cantidad FROM stock_deposito WHERE producto_id = ? AND deposito_id = ?',
    [producto_id, deposito_id]
  );

  if (actual) {
    const nuevaCantidad = Math.max(0, actual.cantidad + deltaCantidad);
    await run(
      'UPDATE stock_deposito SET cantidad = ? WHERE id = ?',
      [nuevaCantidad, actual.id]
    );
    return nuevaCantidad;
  } else {
    const nuevaCantidad = Math.max(0, deltaCantidad);
    await run(
      'INSERT INTO stock_deposito (producto_id, deposito_id, cantidad) VALUES (?, ?, ?)',
      [producto_id, deposito_id, nuevaCantidad]
    );
    return nuevaCantidad;
  }
};

const initDatabase = async () => {
  await exec('PRAGMA foreign_keys = ON;');

  // Schema creation
  await exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('admin', 'deposito', 'vendedor', 'produccion')),
      telefono TEXT,
      estado INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      descripcion TEXT,
      tipo TEXT NOT NULL CHECK(tipo IN ('materia_prima', 'producto_terminado', 'ambos'))
    );

    CREATE TABLE IF NOT EXISTS unidades_medida (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      simbolo TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS depositos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      ubicacion TEXT,
      descripcion TEXT,
      es_principal INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      codigo_barra TEXT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      tipo TEXT NOT NULL CHECK(tipo IN ('materia_prima', 'producto_terminado')),
      categoria_id INTEGER,
      unidad_id INTEGER,
      stock_minimo REAL DEFAULT 5,
      stock_maximo REAL DEFAULT 500,
      precio_costo REAL DEFAULT 0,
      precio_venta REAL DEFAULT 0,
      iva REAL DEFAULT 10,
      estado INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (categoria_id) REFERENCES categorias(id),
      FOREIGN KEY (unidad_id) REFERENCES unidades_medida(id)
    );

    CREATE TABLE IF NOT EXISTS stock_deposito (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      deposito_id INTEGER NOT NULL,
      cantidad REAL DEFAULT 0,
      UNIQUE(producto_id, deposito_id),
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
      FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id INTEGER NOT NULL,
      deposito_id INTEGER NOT NULL,
      codigo_lote TEXT NOT NULL,
      cantidad_inicial REAL NOT NULL,
      cantidad_actual REAL NOT NULL,
      fecha_elaboracion DATE,
      fecha_vencimiento DATE NOT NULL,
      precio_compra REAL DEFAULT 0,
      estado TEXT DEFAULT 'activo' CHECK(estado IN ('activo', 'vencido', 'agotado')),
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
      FOREIGN KEY (deposito_id) REFERENCES depositos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS proveedores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ruc TEXT UNIQUE NOT NULL,
      razon_social TEXT NOT NULL,
      contacto_nombre TEXT,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      ciudad TEXT DEFAULT 'Capiatá',
      estado INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS compras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proveedor_id INTEGER NOT NULL,
      deposito_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      numero_factura TEXT NOT NULL,
      fecha_compra DATE NOT NULL,
      total REAL NOT NULL,
      condicion TEXT DEFAULT 'contado' CHECK(condicion IN ('contado', 'credito')),
      observaciones TEXT,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
      FOREIGN KEY (deposito_id) REFERENCES depositos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS compras_detalles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      compra_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      codigo_lote TEXT,
      fecha_vencimiento DATE,
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS recetas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      producto_terminado_id INTEGER NOT NULL,
      rendimiento_unidades REAL DEFAULT 1,
      tiempo_estimado_min INTEGER DEFAULT 60,
      costo_estimado REAL DEFAULT 0,
      estado INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (producto_terminado_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS recetas_detalles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receta_id INTEGER NOT NULL,
      insumo_id INTEGER NOT NULL,
      cantidad_requerida REAL NOT NULL,
      FOREIGN KEY (receta_id) REFERENCES recetas(id) ON DELETE CASCADE,
      FOREIGN KEY (insumo_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS producciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      receta_id INTEGER NOT NULL,
      producto_terminado_id INTEGER NOT NULL,
      deposito_origen_id INTEGER NOT NULL,
      deposito_destino_id INTEGER NOT NULL,
      cantidad_planificada REAL NOT NULL,
      cantidad_obtenida REAL NOT NULL,
      merma_estimada REAL DEFAULT 0,
      costo_total REAL DEFAULT 0,
      estado TEXT DEFAULT 'finalizado' CHECK(estado IN ('en_proceso', 'finalizado', 'cancelado')),
      usuario_id INTEGER NOT NULL,
      fecha_produccion DATE NOT NULL,
      observaciones TEXT,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (receta_id) REFERENCES recetas(id),
      FOREIGN KEY (producto_terminado_id) REFERENCES productos(id),
      FOREIGN KEY (deposito_origen_id) REFERENCES depositos(id),
      FOREIGN KEY (deposito_destino_id) REFERENCES depositos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ruc_ci TEXT UNIQUE NOT NULL,
      nombre_razon TEXT NOT NULL,
      telefono TEXT,
      email TEXT,
      direccion TEXT,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS ventas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_comprobante TEXT NOT NULL,
      tipo_comprobante TEXT DEFAULT 'ticket' CHECK(tipo_comprobante IN ('ticket', 'factura')),
      cliente_id INTEGER,
      usuario_id INTEGER NOT NULL,
      deposito_id INTEGER NOT NULL,
      fecha_venta DATETIME DEFAULT (DATETIME('now', 'localtime')),
      subtotal REAL NOT NULL,
      iva_5 REAL DEFAULT 0,
      iva_10 REAL DEFAULT 0,
      total REAL NOT NULL,
      metodo_pago TEXT DEFAULT 'efectivo' CHECK(metodo_pago IN ('efectivo', 'tarjeta', 'transferencia_qr', 'mixto')),
      monto_recibido REAL DEFAULT 0,
      vuelto REAL DEFAULT 0,
      estado TEXT DEFAULT 'completada' CHECK(estado IN ('completada', 'anulada')),
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
      FOREIGN KEY (deposito_id) REFERENCES depositos(id)
    );

    CREATE TABLE IF NOT EXISTS ventas_detalles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venta_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad REAL NOT NULL,
      precio_unitario REAL NOT NULL,
      iva_tipo REAL DEFAULT 10,
      subtotal REAL NOT NULL,
      FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS transferencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      deposito_origen_id INTEGER NOT NULL,
      deposito_destino_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      fecha DATE NOT NULL,
      motivo TEXT,
      estado TEXT DEFAULT 'completada' CHECK(estado IN ('completada', 'pendiente', 'cancelada')),
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (deposito_origen_id) REFERENCES depositos(id),
      FOREIGN KEY (deposito_destino_id) REFERENCES depositos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS transferencias_detalles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transferencia_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      lote_id INTEGER,
      cantidad REAL NOT NULL,
      FOREIGN KEY (transferencia_id) REFERENCES transferencias(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS ajustes_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      deposito_id INTEGER NOT NULL,
      usuario_id INTEGER NOT NULL,
      fecha DATE NOT NULL,
      tipo_ajuste TEXT NOT NULL CHECK(tipo_ajuste IN ('ingreso', 'egreso', 'inventario_fisico')),
      motivo TEXT NOT NULL CHECK(motivo IN ('merma', 'vencimiento', 'rotura', 'recuento_fisico', 'otro')),
      observaciones TEXT,
      created_at DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (deposito_id) REFERENCES depositos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS ajustes_detalles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ajuste_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      cantidad_anterior REAL NOT NULL,
      cantidad_ajustada REAL NOT NULL,
      diferencia REAL NOT NULL,
      FOREIGN KEY (ajuste_id) REFERENCES ajustes_stock(id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos(id)
    );

    CREATE TABLE IF NOT EXISTS kardex (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha DATETIME DEFAULT (DATETIME('now', 'localtime')),
      producto_id INTEGER NOT NULL,
      deposito_id INTEGER NOT NULL,
      tipo_movimiento TEXT NOT NULL,
      referencia_id INTEGER,
      referencia_documento TEXT,
      cantidad_entrada REAL DEFAULT 0,
      cantidad_salida REAL DEFAULT 0,
      saldo_resultante REAL NOT NULL,
      costo_unitario REAL DEFAULT 0,
      costo_total REAL DEFAULT 0,
      usuario_id INTEGER,
      observaciones TEXT,
      FOREIGN KEY (producto_id) REFERENCES productos(id),
      FOREIGN KEY (deposito_id) REFERENCES depositos(id),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS auditoria_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER,
      accion TEXT NOT NULL,
      tabla_afectada TEXT,
      registro_id INTEGER,
      detalles TEXT,
      ip TEXT,
      fecha DATETIME DEFAULT (DATETIME('now', 'localtime')),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    );
  `);

  // Run seed data if empty
  await seedInitialData();
};

const seedInitialData = async () => {
  const userCount = await get('SELECT COUNT(*) as count FROM usuarios');
  if (userCount.count > 0) return; // Already seeded

  console.log('🌱 Inicializando datos semilla de la Panadería...');

  // 1. Usuarios
  const salt = await bcrypt.genSalt(10);
  const hashAdmin = await bcrypt.hash('admin123', salt);
  const hashDeposito = await bcrypt.hash('deposito123', salt);
  const hashVendedor = await bcrypt.hash('cajero123', salt);
  const hashProduccion = await bcrypt.hash('panadero123', salt);

  await run(`INSERT INTO usuarios (nombre, email, password, rol, telefono) VALUES
    ('Bruno Báez (Administrador)', 'admin@panaderia.com', ?, 'admin', '0981-123456'),
    ('Encargado de Depósito', 'deposito@panaderia.com', ?, 'deposito', '0982-234567'),
    ('Cajero Principal', 'cajero@panaderia.com', ?, 'vendedor', '0983-345678'),
    ('Maestro Panadero', 'produccion@panaderia.com', ?, 'produccion', '0984-456789')
  `, [hashAdmin, hashDeposito, hashVendedor, hashProduccion]);

  // 2. Unidades de Medida
  await exec(`
    INSERT INTO unidades_medida (nombre, simbolo) VALUES
    ('Kilogramo', 'kg'),
    ('Gramo', 'gr'),
    ('Litro', 'l'),
    ('Mililitro', 'ml'),
    ('Unidad', 'un'),
    ('Docena', 'doc'),
    ('Bolsa / Fardo', 'bolsa');
  `);

  // 3. Categorías
  await exec(`
    INSERT INTO categorias (nombre, descripcion, tipo) VALUES
    ('Harinas y Féculas', 'Harina 000, 0000, leudante, almidón de mandioca', 'materia_prima'),
    ('Levaduras y Mejoradores', 'Levadura fresca, levadura seca, mejoradores de masa', 'materia_prima'),
    ('Grasas y Lácteos', 'Grasa vacuna, margarina, manteca, leche entera, queso paraguay', 'materia_prima'),
    ('Endulzantes y Esencias', 'Azúcar refinada, esencia de vainilla, anís', 'materia_prima'),
    ('Panes Tradicionales', 'Pan Felipe, Pan Trincha, Pan Francés, Galleta Cuartel', 'producto_terminado'),
    ('Confitería y Masas', 'Medialunas, Facturas, Donas, Palmeritas', 'producto_terminado'),
    ('Especialidades Típicas', 'Chipa Tradicional, Chipa Almidón, Mbejú', 'producto_terminado'),
    ('Empanadas y Salados', 'Empanadas de carne, jamón y queso, pasteles', 'producto_terminado'),
    ('Tortas y Postres', 'Torta de cumpleaños, brownies, tartas dulces', 'producto_terminado');
  `);

  // 4. Depósitos
  await exec(`
    INSERT INTO depositos (nombre, ubicacion, descripcion, es_principal) VALUES
    ('Depósito Central de Insumos', 'Planta Baja - Sector A', 'Almacenamiento general de harinas, grasas y materias primas', 1),
    ('Sala de Producción / Cuadra', 'Planta Baja - Sector Hornos', 'Stock de trabajo diario de panaderos y maestros confiteros', 0),
    ('Salón de Ventas / Mostrador', 'Área Comercial Frontal', 'Exhibición y despacho de panificados y productos terminados', 0);
  `);

  // 5. Proveedores
  await exec(`
    INSERT INTO proveedores (ruc, razon_social, contacto_nombre, telefono, email, direccion, ciudad) VALUES
    ('80012345-6', 'Molinos Harineros del Paraguay S.A.', 'Carlos Benítez', '021-500100', 'ventas@molinospy.com.py', 'Avda. Defensores del Chaco 1450', 'Capiatá'),
    ('80098765-4', 'Lácteos y Derivados Trébol / Chortitzer', 'Marta Duarte', '021-654321', 'pedidos@trebol.com.py', 'Ruta PY02 Km 18', 'Capiatá'),
    ('80055443-2', 'Distribuidora Panificadora Central', 'Esteban Rolón', '0971-889900', 'distribuidorapan@gmail.com', 'Calle San Roque 450', 'San Lorenzo'),
    ('80077889-1', 'Granja Huevos San Fernando', 'Fernando Romero', '0981-778811', 'ventas@granjasanfernando.com', 'Ruta 1 Km 20', 'J. Augusto Saldívar');
  `);

  // 6. Clientes
  await exec(`
    INSERT INTO clientes (ruc_ci, nombre_razon, telefono, email, direccion) VALUES
    ('4444444-4', 'Cliente Ocasional / Mostrador', '0981-000000', 'mostrador@panaderia.com', 'Capiatá'),
    ('3589412-1', 'Despensa La Capiateña', '0981-998877', 'lacapiatena@gmail.com', 'Barrio San Miguel, Capiatá'),
    ('4125896-3', 'Restaurante El Buen Sabor', '0982-334455', 'elbuensabor@gmail.com', 'Centro de Capiatá'),
    ('2985147-8', 'Comedor Escolar San Rafael', '0971-223344', 'comedor.sanrafael@gmail.com', 'Ruta D027, Capiatá');
  `);

  // 7. Insumos (Materias Primas)
  // Categoría IDs: 1 (Harinas), 2 (Levaduras), 3 (Grasas), 4 (Endulzantes)
  // Unidad IDs: 1 (kg), 2 (gr), 3 (l), 4 (ml), 5 (un)
  const insumos = [
    { cod: 'INS-001', bar: '7840001', nom: 'Harina de Trigo 000', desc: 'Bolsa de harina para panadería x 50kg fraccionable', cat: 1, un: 1, min: 50, max: 1000, costo: 4500, precio: 0 },
    { cod: 'INS-002', bar: '7840002', nom: 'Harina de Trigo 0000', desc: 'Harina refinada para repostería y masas finas', cat: 1, un: 1, min: 20, max: 300, costo: 5500, precio: 0 },
    { cod: 'INS-003', bar: '7840003', nom: 'Almidón de Mandioca', desc: 'Almidón puro para elaboración de chipa paraguaya', cat: 1, un: 1, min: 30, max: 400, costo: 8000, precio: 0 },
    { cod: 'INS-004', bar: '7840004', nom: 'Levadura Prensada Fresca Levex', desc: 'Bloque de levadura fresca x 500g', cat: 2, un: 1, min: 5, max: 50, costo: 14000, precio: 0 },
    { cod: 'INS-005', bar: '7840005', nom: 'Grasa Vacuna Refinada', desc: 'Grasa comestible para panes y galletas', cat: 3, un: 1, min: 20, max: 200, costo: 11000, precio: 0 },
    { cod: 'INS-006', bar: '7840006', nom: 'Margarina Hojaldre', desc: 'Margarina para medialunas y masas hojaldradas', cat: 3, un: 1, min: 10, max: 100, costo: 16000, precio: 0 },
    { cod: 'INS-007', bar: '7840007', nom: 'Queso Paraguay Artesanal', desc: 'Queso fresco estacionado para chipa', cat: 3, un: 1, min: 15, max: 100, costo: 28000, precio: 0 },
    { cod: 'INS-008', bar: '7840008', nom: 'Leche Entera Líquida', desc: 'Leche pasteurizada x 1 Litro', cat: 3, un: 3, min: 20, max: 150, costo: 5500, precio: 0 },
    { cod: 'INS-009', bar: '7840009', nom: 'Azúcar Blanca Refinada', desc: 'Azúcar estándar x kg', cat: 4, un: 1, min: 25, max: 250, costo: 6000, precio: 0 },
    { cod: 'INS-010', bar: '7840010', nom: 'Huevos Frescos de Granja', desc: 'Huevo de gallina fresco por unidad', cat: 3, un: 5, min: 60, max: 1000, costo: 850, precio: 0 },
    { cod: 'INS-011', bar: '7840011', nom: 'Sal Fina Entrefina', desc: 'Sal yodada para panificación x kg', cat: 4, un: 1, min: 10, max: 100, costo: 2500, precio: 0 },
    { cod: 'INS-012', bar: '7840012', nom: 'Esencia de Anís Estrellado', desc: 'Aromatizante típico para chipa', cat: 4, un: 4, min: 100, max: 2000, costo: 40, precio: 0 }
  ];

  for (const ins of insumos) {
    await run(`INSERT INTO productos (codigo, codigo_barra, nombre, descripcion, tipo, categoria_id, unidad_id, stock_minimo, stock_maximo, precio_costo, precio_venta, iva)
      VALUES (?, ?, ?, ?, 'materia_prima', ?, ?, ?, ?, ?, ?, 10)`,
      [ins.cod, ins.bar, ins.nom, ins.desc, ins.cat, ins.un, ins.min, ins.max, ins.costo, ins.precio]
    );
  }

  // 8. Productos Terminados
  // Categoría IDs: 5 (Panes), 6 (Confitería), 7 (Chipa), 8 (Empanadas), 9 (Tortas)
  const terminados = [
    { cod: 'PROD-001', bar: '7841001', nom: 'Pan Felipe Tradicional (kg)', desc: 'Pan crujiente de corteza dorada y miga suave', cat: 5, un: 1, min: 10, max: 200, costo: 4500, precio: 9000 },
    { cod: 'PROD-002', bar: '7841002', nom: 'Pan Trincha Crocante (kg)', desc: 'Pan alargado artesanal tradicional paraguayo', cat: 5, un: 1, min: 10, max: 150, costo: 4800, precio: 9500 },
    { cod: 'PROD-003', bar: '7841003', nom: 'Galleta Cuartel (kg)', desc: 'Galleta clásica seca crocante de alta durabilidad', cat: 5, un: 1, min: 5, max: 100, costo: 5000, precio: 10000 },
    { cod: 'PROD-004', bar: '7841004', nom: 'Chipa Tradicional Mestizo (Unidad)', desc: 'Chipa caliente horneada con queso Paraguay y almidón', cat: 7, un: 5, min: 20, max: 300, costo: 2200, precio: 5000 },
    { cod: 'PROD-005', bar: '7841005', nom: 'Chipa Almidón Especial (Unidad)', desc: 'Chipa fina de puro almidón con queso y manteca', cat: 7, un: 5, min: 20, max: 250, costo: 2600, precio: 6000 },
    { cod: 'PROD-006', bar: '7841006', nom: 'Medialunas de Manteca (Docena)', desc: 'Medialunas dulces glaseadas con almíbar artesanal', cat: 6, un: 6, min: 5, max: 50, costo: 15000, precio: 30000 },
    { cod: 'PROD-007', bar: '7841007', nom: 'Facturas Surtidas con Crema y Dulce (Docena)', desc: 'Facturas surtidas de crema pastelera y dulce de guayaba', cat: 6, un: 6, min: 5, max: 40, costo: 16000, precio: 32000 },
    { cod: 'PROD-008', bar: '7841008', nom: 'Empanada de Carne al Horno (Unidad)', desc: 'Empanada casera horneada con relleno jugoso de carne', cat: 8, un: 5, min: 15, max: 100, costo: 3000, precio: 6500 }
  ];

  for (const p of terminados) {
    await run(`INSERT INTO productos (codigo, codigo_barra, nombre, descripcion, tipo, categoria_id, unidad_id, stock_minimo, stock_maximo, precio_costo, precio_venta, iva)
      VALUES (?, ?, ?, ?, 'producto_terminado', ?, ?, ?, ?, ?, ?, 10)`,
      [p.cod, p.bar, p.nom, p.desc, p.cat, p.un, p.min, p.max, p.costo, p.precio]
    );
  }

  // 9. Stock inicial en depósitos y lotes con fechas de vencimiento realistas
  // Depósito 1 = Central, 2 = Producción, 3 = Mostrador
  const stockInicial = [
    // Insumos en Depósito Central (id 1)
    { prodId: 1, depId: 1, cant: 350, lote: 'LOT-HAR-20260901', vto: '2026-12-15', costo: 4500 },
    { prodId: 2, depId: 1, cant: 120, lote: 'LOT-HAR4-20260905', vto: '2026-12-20', costo: 5500 },
    { prodId: 3, depId: 1, cant: 180, lote: 'LOT-ALM-20260910', vto: '2027-01-30', costo: 8000 },
    { prodId: 4, depId: 1, cant: 15, lote: 'LOT-LEV-20260920', vto: '2026-10-10', costo: 14000 }, // Próximo a vencer
    { prodId: 5, depId: 1, cant: 80, lote: 'LOT-GRA-20260815', vto: '2026-11-30', costo: 11000 },
    { prodId: 6, depId: 1, cant: 45, lote: 'LOT-MAR-20260820', vto: '2026-11-15', costo: 16000 },
    { prodId: 7, depId: 1, cant: 30, lote: 'LOT-QUE-20260922', vto: '2026-10-05', costo: 28000 }, // Próximo a vencer
    { prodId: 8, depId: 1, cant: 60, lote: 'LOT-LEC-20260923', vto: '2026-10-12', costo: 5500 },
    { prodId: 9, depId: 1, cant: 150, lote: 'LOT-AZU-20260710', vto: '2027-06-30', costo: 6000 },
    { prodId: 10, depId: 1, cant: 450, lote: 'LOT-HUE-20260921', vto: '2026-10-15', costo: 850 },
    { prodId: 11, depId: 1, cant: 50, lote: 'LOT-SAL-20260501', vto: '2028-01-01', costo: 2500 },
    { prodId: 12, depId: 1, cant: 800, lote: 'LOT-ANI-20260601', vto: '2027-12-31', costo: 40 },

    // Insumos en Sala de Producción (id 2)
    { prodId: 1, depId: 2, cant: 50, lote: 'LOT-HAR-20260901', vto: '2026-12-15', costo: 4500 },
    { prodId: 4, depId: 2, cant: 4, lote: 'LOT-LEV-20260920', vto: '2026-10-10', costo: 14000 },
    { prodId: 5, depId: 2, cant: 15, lote: 'LOT-GRA-20260815', vto: '2026-11-30', costo: 11000 },

    // Productos Terminados en Salón de Ventas / Mostrador (id 3)
    { prodId: 13, depId: 3, cant: 45, lote: 'LOT-PAN-20260925', vto: '2026-09-27', costo: 4500 },
    { prodId: 14, depId: 3, cant: 35, lote: 'LOT-TRI-20260925', vto: '2026-09-27', costo: 4800 },
    { prodId: 15, depId: 3, cant: 25, lote: 'LOT-GAL-20260925', vto: '2026-10-10', costo: 5000 },
    { prodId: 16, depId: 3, cant: 60, lote: 'LOT-CHI-20260925', vto: '2026-09-26', costo: 2200 },
    { prodId: 17, depId: 3, cant: 40, lote: 'LOT-CHIAL-20260925', vto: '2026-09-26', costo: 2600 },
    { prodId: 18, depId: 3, cant: 12, lote: 'LOT-MED-20260925', vto: '2026-09-27', costo: 15000 },
    { prodId: 19, depId: 3, cant: 10, lote: 'LOT-FAC-20260925', vto: '2026-09-27', costo: 16000 },
    { prodId: 20, depId: 3, cant: 30, lote: 'LOT-EMP-20260925', vto: '2026-09-26', costo: 3000 }
  ];

  for (const s of stockInicial) {
    await run(
      'INSERT INTO stock_deposito (producto_id, deposito_id, cantidad) VALUES (?, ?, ?)',
      [s.prodId, s.depId, s.cant]
    );

    await run(`INSERT INTO lotes (producto_id, deposito_id, codigo_lote, cantidad_inicial, cantidad_actual, fecha_elaboracion, fecha_vencimiento, precio_compra, estado)
      VALUES (?, ?, ?, ?, ?, DATE('now', 'localtime'), ?, ?, 'activo')`,
      [s.prodId, s.depId, s.lote, s.cant, s.cant, s.vto, s.costo]
    );

    await run(`INSERT INTO kardex (fecha, producto_id, deposito_id, tipo_movimiento, referencia_documento, cantidad_entrada, saldo_resultante, costo_unitario, costo_total, usuario_id, observaciones)
      VALUES (DATETIME('now', 'localtime'), ?, ?, 'SALDO_INICIAL', 'INVENTARIO-INICIAL', ?, ?, ?, ?, 1, 'Carga inicial de inventario')`,
      [s.prodId, s.depId, s.cant, s.cant, s.costo, s.cant * s.costo]
    );
  }

  // 10. Recetas / Fórmulas de Panadería
  // Receta 1: Pan Felipe (10 kg)
  // Requiere: 10kg Harina 000 (prod 1), 0.3kg Levadura (prod 4), 0.3kg Grasa (prod 5), 0.2kg Sal (prod 11)
  const r1 = await run(`INSERT INTO recetas (codigo, nombre, descripcion, producto_terminado_id, rendimiento_unidades, tiempo_estimado_min, costo_estimado)
    VALUES ('REC-001', 'Pan Felipe Tradicional (Horneada 10 kg)', 'Fórmula artesanal para 10 kg de Pan Felipe caliente y crocante', 13, 10, 90, 45000)`);
  await run(`INSERT INTO recetas_detalles (receta_id, insumo_id, cantidad_requerida) VALUES
    (?, 1, 10),
    (?, 4, 0.3),
    (?, 5, 0.3),
    (?, 11, 0.2)`, [r1.lastID, r1.lastID, r1.lastID, r1.lastID]);

  // Receta 2: Chipa Tradicional (50 unidades)
  // Requiere: 2.5kg Almidón Mandioca (prod 3), 1kg Queso Paraguay (prod 7), 0.5kg Grasa (prod 5), 6 Huevos (prod 10), 0.3L Leche (prod 8), 0.05kg Sal (prod 11), 10gr Anís (prod 12)
  const r2 = await run(`INSERT INTO recetas (codigo, nombre, descripcion, producto_terminado_id, rendimiento_unidades, tiempo_estimado_min, costo_estimado)
    VALUES ('REC-002', 'Chipa Tradicional Mestizo (Tanda 50 unidades)', 'Receta tradicional paraguaya con abundante queso paraguay y anís', 16, 50, 60, 75000)`);
  await run(`INSERT INTO recetas_detalles (receta_id, insumo_id, cantidad_requerida) VALUES
    (?, 3, 2.5),
    (?, 7, 1.0),
    (?, 5, 0.5),
    (?, 10, 6),
    (?, 8, 0.3),
    (?, 11, 0.05),
    (?, 12, 10)`, [r2.lastID, r2.lastID, r2.lastID, r2.lastID, r2.lastID, r2.lastID, r2.lastID]);

  // Receta 3: Medialunas de Manteca (5 docenas = 60 unidades)
  const r3 = await run(`INSERT INTO recetas (codigo, nombre, descripcion, producto_terminado_id, rendimiento_unidades, tiempo_estimado_min, costo_estimado)
    VALUES ('REC-003', 'Medialunas de Manteca Hojaldradas (5 Docenas)', 'Masa fina hojaldrada con manteca/margarina y baño de almíbar', 18, 5, 120, 65000)`);
  await run(`INSERT INTO recetas_detalles (receta_id, insumo_id, cantidad_requerida) VALUES
    (?, 2, 3.0),
    (?, 6, 1.2),
    (?, 9, 0.8),
    (?, 4, 0.15),
    (?, 8, 0.6),
    (?, 10, 3)`, [r3.lastID, r3.lastID, r3.lastID, r3.lastID, r3.lastID, r3.lastID]);

  console.log('✅ Base de datos inicializada y datos de panadería sembrados correctamente.');
};

module.exports = {
  db,
  run,
  get,
  all,
  exec,
  registrarKardex,
  actualizarStock,
  initDatabase
};
