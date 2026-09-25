const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const errorHandler = require('./middlewares/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const productosRoutes = require('./routes/productos.routes');
const recetasRoutes = require('./routes/recetas.routes');
const produccionRoutes = require('./routes/produccion.routes');
const depositosRoutes = require('./routes/depositos.routes');
const comprasRoutes = require('./routes/compras.routes');
const ventasRoutes = require('./routes/ventas.routes');
const ajustesRoutes = require('./routes/ajustes.routes');
const kardexRoutes = require('./routes/kardex.routes');
const reportesRoutes = require('./routes/reportes.routes');
const usuariosRoutes = require('./routes/usuarios.routes');

const app = express();

// Middlewares
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/recetas', recetasRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/depositos', depositosRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/ajustes', ajustesRoutes);
app.use('/api/kardex', kardexRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/usuarios', usuariosRoutes);

// Root & SPA routing fallback for non-API routes
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  next();
});

// Error handling middleware
app.use(errorHandler);

module.exports = app;
