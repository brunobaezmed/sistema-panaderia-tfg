/**
 * ============================================================================
 * MÓDULO: MANEJADOR GLOBAL DE ERRORES (errorHandler.js)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Middleware de Express que captura de forma centralizada todas las excepciones
 * y errores no controlados, retornando respuestas JSON estandarizadas.
 */

const errorHandler = (err, req, res, next) => {
  console.error('❌ Error capturado:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

module.exports = errorHandler;
