/**
 * ============================================================================
 * MÓDULO CLIENTE: SERVICIO DE COMUNICACIÓN HTTP (api.js)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Encapsula las solicitudes HTTP a la API RESTful (GET, POST, PUT, DELETE),
 * inyección de cabeceras de autorización JWT y utilidades de formateo.
 */

// API helper with JWT token management and SweetAlert2 notifications
const API = {
  baseURL: '/api',

  getToken() {
    return localStorage.getItem('panaderia_token');
  },

  setToken(token) {
    localStorage.setItem('panaderia_token', token);
  },

  getUser() {
    const userStr = localStorage.getItem('panaderia_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  setUser(user) {
    localStorage.setItem('panaderia_user', JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem('panaderia_token');
    localStorage.removeItem('panaderia_user');
    window.location.reload();
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        if (response.status === 401 && !endpoint.includes('/auth/login')) {
          this.logout();
          return { success: false, message: 'Sesión expirada' };
        }
      }

      if (!response.ok) {
        throw new Error(data.message || 'Error en la petición al servidor');
      }

      return data;
    } catch (error) {
      console.error(`Error en API [${endpoint}]:`, error);
      throw error;
    }
  },

  get(endpoint, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${endpoint}?${query}` : endpoint;
    return this.request(url, { method: 'GET' });
  },

  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },

  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  },

  // Helpers
  formatGs(val) {
    if (val === null || val === undefined || isNaN(val)) return '0 ₲';
    return Number(val).toLocaleString('es-PY') + ' ₲';
  },

  formatFecha(fechaStr) {
    if (!fechaStr) return '-';
    const d = new Date(fechaStr);
    return isNaN(d.getTime()) ? fechaStr : d.toLocaleDateString('es-PY') + ' ' + d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
  }
};
