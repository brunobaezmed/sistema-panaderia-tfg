/**
 * ============================================================================
 * MÓDULO: SERVIDOR PRINCIPAL (Entry Point)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - Universidad Gran Asunción (UNIGRAN)
 * Autor: Bruno Matias Báez Medina | Capiatá, Paraguay
 * ============================================================================
 * Descripción:
 * Punto de entrada de la aplicación Node.js. Carga variables de entorno,
 * inicializa el esquema de base de datos SQLite y levanta el servidor HTTP.
 */

require('dotenv').config();
const app = require('./app');
const { initDatabase } = require('./config/database');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database schema and seeds
    await initDatabase();

    app.listen(PORT, () => {
      console.log('================================================================');
      console.log(`🍞 Sistema de Gestión de Inventario para Panadería (UNIGRAN)`);
      console.log(`👤 Autor: Bruno Matias Báez Medina`);
      console.log(`📍 Capiatá, Paraguay - Trabajo Final de Grado`);
      console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT}`);
      console.log('================================================================');
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
}

startServer();
