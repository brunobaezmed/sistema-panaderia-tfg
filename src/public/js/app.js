/**
 * ============================================================================
 * MÓDULO CLIENTE: CONTROLADOR DE LA INTERFAZ SPA (app.js)
 * Sistema de Gestión de Inventario y Producción para Panadería
 * Trabajo Final de Grado (TFG) - UNIGRAN
 * ============================================================================
 * Descripción:
 * Controlador central de la aplicación Single Page Application (SPA):
 * enrutamiento interno de vistas, Punto de Venta (POS), órdenes de producción,
 * catálogos interactivos, actualización reactiva del carrito y gráficas.
 */

// Main Application Controller
let chartVentasInstance = null;
let productosGlobal = [];
let categoriasGlobal = [];
let unidadesGlobal = [];
let depositosGlobal = [];
let posCart = [];
let posProductsList = [];

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  setupEventListeners();
  checkAuth();
});

function initLiveClock() {
  setInterval(() => {
    const el = document.getElementById('liveClock');
    if (el) {
      const now = new Date();
      el.textContent = now.toLocaleDateString('es-PY') + ' ' + now.toLocaleTimeString('es-PY');
    }
  }, 1000);
}

function setDemoUser(email, pass) {
  document.getElementById('loginEmail').value = email;
  document.getElementById('loginPassword').value = pass;
}

// Authentication check
async function checkAuth() {
  const token = API.getToken();
  const user = API.getUser();

  if (!token || !user) {
    document.getElementById('loginSection').classList.remove('d-none');
    document.getElementById('appSection').classList.add('d-none');
  } else {
    document.getElementById('loginSection').classList.add('d-none');
    document.getElementById('appSection').classList.remove('d-none');

    // Set user info
    document.getElementById('userNombre').textContent = user.nombre;
    document.getElementById('userRol').textContent = user.rol.toUpperCase();
    document.getElementById('userAvatar').textContent = user.nombre.charAt(0);
    const uMenu = document.getElementById('userNombreMenu');
    if (uMenu) uMenu.textContent = user.nombre;
    const rMenu = document.getElementById('userRolMenu');
    if (rMenu) rMenu.textContent = `Rol: ${user.rol.toUpperCase()}`;

    // Hide user management if not admin
    if (user.rol !== 'admin') {
      const navUsr = document.getElementById('navUsuarios');
      if (navUsr) navUsr.classList.add('d-none');
    }

    await loadGlobalMetadata();
    navigate('dashboard');
  }
}

// Load metadata needed across modules
async function loadGlobalMetadata() {
  try {
    const [resCat, resUn, resDep, resProd] = await Promise.all([
      API.get('/productos/meta/categorias'),
      API.get('/productos/meta/unidades'),
      API.get('/depositos'),
      API.get('/productos')
    ]);

    categoriasGlobal = resCat.categorias || [];
    unidadesGlobal = resUn.unidades || [];
    depositosGlobal = resDep.depositos || [];
    productosGlobal = resProd.productos || [];
  } catch (err) {
    console.error('Error loading metadata:', err);
  }
}

let currentActiveView = 'dashboard';

function togglePOS() {
  if (currentActiveView === 'pos') {
    navigate('dashboard');
  } else {
    navigate('pos');
  }
}

// Navigation Router
function navigate(viewName) {
  currentActiveView = viewName;

  // Actualizar botón de POS en la barra superior dinámica
  const btnNavPOS = document.getElementById('btnNavPOS');
  if (btnNavPOS) {
    if (viewName === 'pos') {
      btnNavPOS.className = 'btn btn-outline-danger fw-bold btn-sm shadow-sm bg-white d-flex align-items-center gap-1';
      btnNavPOS.style.backgroundColor = '#fff';
      btnNavPOS.style.borderColor = '#dc3545';
      btnNavPOS.innerHTML = '<i class="fa-solid fa-circle-xmark text-danger"></i> <span class="text-danger">Cerrar POS</span>';
      btnNavPOS.title = 'Cerrar Punto de Venta y volver al panel';
    } else {
      btnNavPOS.className = 'btn btn-warning text-white fw-semibold btn-sm shadow-sm d-flex align-items-center gap-1';
      btnNavPOS.style.backgroundColor = '#d97706';
      btnNavPOS.style.borderColor = '#d97706';
      btnNavPOS.innerHTML = '<i class="fa-solid fa-cart-shopping me-1"></i> <span>Abrir POS</span>';
      btnNavPOS.title = 'Abrir Punto de Venta (Mostrador)';
    }
  }

  // Update sidebar links active class
  document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    if (link.getAttribute('data-view') === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // Show selected view panel
  document.querySelectorAll('.app-view').forEach(view => {
    view.classList.add('d-none');
  });

  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    targetView.classList.remove('d-none');
  }

  // Update Page Title
  const titles = {
    'dashboard': 'Panel de Control (Dashboard)',
    'productos': 'Catálogo de Insumos y Productos',
    'recetas': 'Recetario y Fórmulas de Panadería',
    'produccion': 'Gestión de Producción / Horneadas',
    'pos': 'Punto de Venta (POS Mostrador)',
    'caja': 'Gestión de Caja y Turnos',
    'creditos': 'Cartera de Cuentas por Cobrar',
    'ventas-historial': 'Historial de Ventas y Facturación',
    'compras': 'Gestión de Compras y Proveedores',
    'depositos': 'Depósitos y Transferencias Internas',
    'ajustes': 'Ajustes de Stock y Mermas',
    'kardex': 'Libro Kardex de Movimientos',
    'reportes': 'Informes y Estadísticas',
    'usuarios': 'Administración de Usuarios'
  };
  document.getElementById('pageTitle').textContent = titles[viewName] || 'Sistema de Gestión';

  // Trigger view data loading
  switch (viewName) {
    case 'dashboard':
      cargarDashboard();
      break;
    case 'productos':
      cargarProductos();
      break;
    case 'recetas':
      cargarRecetas();
      break;
    case 'produccion':
      cargarProduccionView();
      break;
    case 'pos':
      cargarPOSView();
      break;
    case 'caja':
      cargarCaja();
      break;
    case 'creditos':
      cargarCreditos();
      break;
    case 'ventas-historial':
      cargarHistorialVentas();
      break;
    case 'compras':
      cargarComprasView();
      break;
    case 'depositos':
      cargarDepositosView();
      break;
    case 'ajustes':
      cargarAjustesView();
      break;
    case 'kardex':
      cargarKardexView();
      break;
    case 'reportes':
      // Reset view
      break;
    case 'usuarios':
      cargarUsuarios();
      break;
  }
}

// --------------------------------------------------------------------------
// 1. DASHBOARD
// --------------------------------------------------------------------------
async function cargarDashboard() {
  try {
    const res = await API.get('/dashboard/stats');
    if (!res.success) return;

    const { stats, productosStockBajo, lotesPorVencer, topVendidos, ventasUltimos7Dias } = res;

    // Set KPIs
    document.getElementById('kpiValorInventario').textContent = API.formatGs(stats.valorInventario);
    document.getElementById('kpiVentasHoy').textContent = API.formatGs(stats.ventasHoy.total_monto);
    document.getElementById('kpiTransaccionesHoy').textContent = stats.ventasHoy.total_transacciones;
    document.getElementById('kpiStockBajo').textContent = stats.alertaStockBajoCount;
    document.getElementById('kpiVencimientos').textContent = stats.alertaVencimientoCount;

    // Update notifications in header and dropdown
    actualizarNotificacionesDropdown(productosStockBajo, lotesPorVencer);

    // Top products list
    const listTop = document.getElementById('listTopVendidos');
    if (topVendidos.length === 0) {
      listTop.innerHTML = '<div class="p-3 text-muted text-center small">Sin ventas registradas este mes</div>';
    } else {
      listTop.innerHTML = topVendidos.map((p, idx) => `
        <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-amber-subtle text-dark border fw-bold">${idx + 1}</span>
            <div>
              <div class="fw-semibold small">${p.nombre}</div>
              <small class="text-muted">${p.cantidad_total} ${p.unidad || 'un'} vendidos</small>
            </div>
          </div>
          <span class="fw-bold text-success small">${API.formatGs(p.total_recaudado)}</span>
        </div>
      `).join('');
    }

    // Low stock table
    const tbodyStock = document.getElementById('tablaStockBajo');
    if (productosStockBajo.length === 0) {
      tbodyStock.innerHTML = '<tr><td colspan="5" class="text-center text-success py-3"><i class="fa-solid fa-circle-check me-1"></i> Todos los productos tienen stock suficiente</td></tr>';
    } else {
      tbodyStock.innerHTML = productosStockBajo.map(p => `
        <tr>
          <td><span class="badge bg-secondary-subtle text-dark">${p.codigo}</span></td>
          <td class="fw-semibold">${p.nombre}</td>
          <td><small class="text-muted">${p.categoria || '-'}</small></td>
          <td class="text-danger fw-bold">${p.stock_actual} ${p.unidad || ''}</td>
          <td class="text-muted">${p.stock_minimo} ${p.unidad || ''}</td>
        </tr>
      `).join('');
    }

    // Expiry table
    const tbodyVto = document.getElementById('tablaLotesPorVencer');
    if (lotesPorVencer.length === 0) {
      tbodyVto.innerHTML = '<tr><td colspan="6" class="text-center text-success py-3"><i class="fa-solid fa-circle-check me-1"></i> No hay lotes próximos a vencer</td></tr>';
    } else {
      tbodyVto.innerHTML = lotesPorVencer.map(l => {
        const urgente = l.dias_restantes <= 5;
        return `
          <tr>
            <td><code>${l.codigo_lote}</code></td>
            <td class="fw-bold">${l.nombre}</td>
            <td><small class="text-muted">${l.deposito}</small></td>
            <td>${l.fecha_vencimiento}</td>
            <td><span class="badge ${urgente ? 'bg-danger' : 'bg-warning text-dark'}">${l.dias_restantes <= 0 ? '¡VENCIDO!' : l.dias_restantes + ' días'}</span></td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-warning py-0 px-2" onclick="abrirModalEditarLote(${l.id})" title="Editar lote o fecha de vencimiento">
                <i class="fa-solid fa-calendar-pen me-1"></i> Editar
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Dashboard Production Orders Table
    const tbodyDashProd = document.getElementById('tablaDashboardProduccion');
    const ultimasProd = res.ultimasProducciones || [];
    if (tbodyDashProd) {
      if (ultimasProd.length === 0) {
        tbodyDashProd.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3"><i class="fa-solid fa-fire me-1"></i> No hay horneadas registradas hoy. Haga clic en los botones superiores para hornear.</td></tr>';
      } else {
        tbodyDashProd.innerHTML = ultimasProd.map(o => `
          <tr>
            <td><code>${o.codigo}</code></td>
            <td><small>${API.formatFecha(o.fecha_produccion)}</small></td>
            <td class="fw-bold text-dark">${o.receta_nombre}</td>
            <td><span class="badge bg-success-subtle text-success fs-6 fw-bold">${o.cantidad_obtenida} ${o.unidad_simbolo || ''}</span></td>
            <td><small class="text-muted">${o.deposito_destino}</small></td>
            <td class="fw-bold text-primary">${API.formatGs(o.costo_total)}</td>
            <td><small class="text-muted">${o.usuario_nombre}</small></td>
            <td class="text-end">
              <button class="btn btn-sm btn-outline-primary py-0 px-2 me-1" onclick="verDetalleOrdenProduccion(${o.id})" title="Ver insumos descontados">
                <i class="fa-solid fa-eye me-1"></i> Detalle
              </button>
              <button class="btn btn-sm btn-outline-warning py-0 px-2 text-dark" onclick="iniciarHorneadaDesdeReceta(${o.receta_id})" title="Hornear otra tanda">
                <i class="fa-solid fa-fire me-1"></i> Re-Hornear
              </button>
            </td>
          </tr>
        `).join('');
      }
    }

    // Render Chart.js
    renderVentasChart(ventasUltimos7Dias);
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function renderVentasChart(data) {
  const ctx = document.getElementById('chartVentas7Dias');
  if (!ctx) return;

  if (chartVentasInstance) {
    chartVentasInstance.destroy();
  }

  const labels = data.map(d => d.fecha);
  const totals = data.map(d => d.total);

  // If empty, generate fallback 7 days
  if (labels.length === 0) {
    labels.push('Hoy');
    totals.push(0);
  }

  chartVentasInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Ventas Totales (₲)',
        data: totals,
        borderColor: '#d97706',
        backgroundColor: 'rgba(217, 119, 6, 0.1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: '#d97706'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (val) => val.toLocaleString('es-PY') + ' ₲'
          }
        }
      }
    }
  });
}

function actualizarNotificacionesDropdown(productosStockBajo = [], lotesPorVencer = []) {
  const container = document.getElementById('alertasDropdownLista');
  const badgeTotal = document.getElementById('badgeAlertasTotal');
  const badgeContador = document.getElementById('badgeDropdownContador');
  const total = (productosStockBajo ? productosStockBajo.length : 0) + (lotesPorVencer ? lotesPorVencer.length : 0);

  if (badgeTotal) {
    if (total > 0) {
      badgeTotal.textContent = total;
      badgeTotal.classList.remove('d-none');
    } else {
      badgeTotal.classList.add('d-none');
    }
  }

  if (badgeContador) {
    badgeContador.textContent = total;
    badgeContador.className = `badge rounded-pill ${total > 0 ? 'bg-danger' : 'bg-success'}`;
  }

  if (!container) return;

  if (total === 0) {
    container.innerHTML = `
      <div class="p-4 text-center text-muted small">
        <i class="fa-solid fa-circle-check fa-2x text-success mb-2"></i>
        <p class="mb-0 fw-semibold text-dark">Todo en orden</p>
        <small class="text-muted">No hay alertas de stock bajo ni vencimientos próximos.</small>
      </div>
    `;
    return;
  }

  let html = '';

  // 1. Stock Bajo
  if (productosStockBajo && productosStockBajo.length > 0) {
    html += `
      <div class="px-3 py-2 bg-danger bg-opacity-10 border-bottom d-flex justify-content-between align-items-center">
        <small class="fw-bold text-danger text-uppercase" style="font-size: 0.75rem;"><i class="fa-solid fa-triangle-exclamation me-1"></i> Stock Crítico (${productosStockBajo.length})</small>
        <button class="btn btn-sm btn-link text-danger p-0 text-decoration-none small" style="font-size: 0.75rem;" onclick="navigate('compras')">Comprar Insumos &rarr;</button>
      </div>
    `;
    productosStockBajo.forEach(p => {
      html += `
        <div class="p-2 px-3 border-bottom d-flex justify-content-between align-items-center bg-white">
          <div>
            <div class="fw-bold small text-dark">${p.nombre}</div>
            <small class="text-muted">${p.categoria || 'Insumo'} &bull; Actual: <strong class="text-danger">${p.stock_actual} ${p.unidad || ''}</strong> / Mín: ${p.stock_minimo} ${p.unidad || ''}</small>
          </div>
          <span class="badge bg-danger-subtle text-danger border border-danger-subtle">Bajo</span>
        </div>
      `;
    });
  }

  // 2. Vencimientos
  if (lotesPorVencer && lotesPorVencer.length > 0) {
    html += `
      <div class="px-3 py-2 bg-warning bg-opacity-10 border-bottom d-flex justify-content-between align-items-center">
        <small class="fw-bold text-warning-emphasis text-uppercase" style="font-size: 0.75rem;"><i class="fa-solid fa-calendar-xmark me-1"></i> Próximos a Vencer (${lotesPorVencer.length})</small>
        <button class="btn btn-sm btn-link text-warning-emphasis p-0 text-decoration-none small" style="font-size: 0.75rem;" onclick="navigate('produccion')">Usar / Hornear &rarr;</button>
      </div>
    `;
    lotesPorVencer.forEach(l => {
      const dias = l.dias_restantes;
      const esVencido = dias <= 0;
      const esUrgente = dias <= 3;
      const badgeCls = esVencido ? 'bg-danger text-white' : (esUrgente ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-warning-subtle text-dark border border-warning-subtle');
      const badgeTxt = esVencido ? '¡Vencido!' : `${dias} días`;

      html += `
        <div class="p-2 px-3 border-bottom d-flex justify-content-between align-items-center bg-white">
          <div>
            <div class="fw-bold small text-dark">${l.nombre}</div>
            <small class="text-muted"><code>${l.codigo_lote}</code> &bull; ${l.deposito} &bull; Vence: <strong>${l.fecha_vencimiento}</strong></small>
          </div>
          <div class="d-flex align-items-center gap-1">
            <span class="badge ${badgeCls}">${badgeTxt}</span>
            <button class="btn btn-sm btn-light border py-0 px-1 text-secondary" onclick="abrirModalEditarLote(${l.id})" title="Editar lote y fecha">
              <i class="fa-solid fa-pen"></i>
            </button>
          </div>
        </div>
      `;
    });
  }

  container.innerHTML = html;
}

// --------------------------------------------------------------------------
// 2. PRODUCTOS E INSUMOS
// --------------------------------------------------------------------------
async function cargarProductos() {
  try {
    const tipo = document.getElementById('filtroTipoProducto').value;
    const search = document.getElementById('filtroBuscarProducto').value;

    const res = await API.get('/productos', { tipo, search });
    if (!res.success) return;

    productosGlobal = res.productos || [];
    const tbody = document.getElementById('tablaProductos');

    if (productosGlobal.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No se encontraron productos registrados</td></tr>';
      return;
    }

    tbody.innerHTML = productosGlobal.map(p => `
      <tr>
        <td><code>${p.codigo}</code></td>
        <td>
          <div class="fw-bold">${p.nombre}</div>
          <small class="text-muted">${p.descripcion || ''}</small>
        </td>
        <td>
          <span class="badge ${p.tipo === 'materia_prima' ? 'badge-materia-prima' : 'badge-producto-terminado'}">
            ${p.tipo === 'materia_prima' ? 'Materia Prima' : 'Producto Terminado'}
          </span>
        </td>
        <td>${p.categoria_nombre || '-'}</td>
        <td>
          <span class="fw-bold ${p.stock_total <= p.stock_minimo ? 'text-danger' : 'text-success'}">
            ${p.stock_total} ${p.unidad_simbolo || ''}
          </span>
          <small class="text-muted d-block" style="font-size: 0.75rem;">Mín: ${p.stock_minimo}</small>
        </td>
        <td>${API.formatGs(p.precio_costo)}</td>
        <td class="fw-semibold text-dark">${p.tipo === 'producto_terminado' ? API.formatGs(p.precio_venta) : '-'}</td>
        <td>
          <span class="badge ${p.estado ? 'bg-success' : 'bg-danger'}">${p.estado ? 'Activo' : 'Inactivo'}</span>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary py-0" onclick="verDetalleProducto(${p.id})" title="Ver stock por depósito y lotes">
            <i class="fa-solid fa-eye"></i>
          </button>
          <button class="btn btn-sm btn-outline-warning py-0" onclick="editarProducto(${p.id})" title="Editar">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando productos:', err);
  }
}

function abrirModalProducto() {
  document.getElementById('formProducto').reset();
  document.getElementById('prodId').value = '';
  document.getElementById('modalProductoTitulo').textContent = 'Nuevo Producto / Insumo';

  // Populate categories & units
  const selCat = document.getElementById('pCategoriaId');
  selCat.innerHTML = categoriasGlobal.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  const selUn = document.getElementById('pUnidadId');
  selUn.innerHTML = unidadesGlobal.map(u => `<option value="${u.id}">${u.nombre} (${u.simbolo})</option>`).join('');

  const modal = new bootstrap.Modal(document.getElementById('modalProducto'));
  modal.show();
}

async function editarProducto(id) {
  try {
    const res = await API.get(`/productos/${id}`);
    if (!res.success) return;
    const p = res.producto;

    document.getElementById('prodId').value = p.id;
    document.getElementById('pCodigo').value = p.codigo;
    document.getElementById('pCodigoBarra').value = p.codigo_barra || '';
    document.getElementById('pTipo').value = p.tipo;
    document.getElementById('pNombre').value = p.nombre;
    document.getElementById('pStockMinimo').value = p.stock_minimo;
    document.getElementById('pStockMaximo').value = p.stock_maximo;
    document.getElementById('pPrecioCosto').value = p.precio_costo;
    document.getElementById('pPrecioVenta').value = p.precio_venta;
    document.getElementById('pIva').value = p.iva;
    document.getElementById('pDescripcion').value = p.descripcion || '';

    const selCat = document.getElementById('pCategoriaId');
    selCat.innerHTML = categoriasGlobal.map(c => `<option value="${c.id}" ${c.id === p.categoria_id ? 'selected' : ''}>${c.nombre}</option>`).join('');

    const selUn = document.getElementById('pUnidadId');
    selUn.innerHTML = unidadesGlobal.map(u => `<option value="${u.id}" ${u.id === p.unidad_id ? 'selected' : ''}>${u.nombre} (${u.simbolo})</option>`).join('');

    document.getElementById('modalProductoTitulo').textContent = 'Editar Producto / Insumo';
    const modal = new bootstrap.Modal(document.getElementById('modalProducto'));
    modal.show();
  } catch (err) {
    SwAlert.fire('Error', 'No se pudo cargar el producto', 'error');
  }
}

async function verDetalleProducto(id) {
  try {
    const res = await API.get(`/productos/${id}`);
    if (!res.success) return;
    const { producto, stockPorDeposito, lotes } = res;

    let html = `
      <div class="text-start">
        <h5 class="fw-bold mb-1">${producto.nombre} (${producto.codigo})</h5>
        <p class="text-muted small">${producto.descripcion || 'Sin descripción'}</p>
        
        <h6 class="fw-bold mt-3 mb-2 border-bottom pb-1"><i class="fa-solid fa-warehouse me-1 text-primary"></i> Existencias por Depósito:</h6>
        <ul class="list-group mb-3">
          ${stockPorDeposito.map(s => `
            <li class="list-group-item d-flex justify-content-between align-items-center">
              <span>${s.deposito_nombre}</span>
              <span class="badge bg-primary rounded-pill">${s.cantidad} ${producto.unidad_simbolo || ''}</span>
            </li>
          `).join('')}
        </ul>

        <h6 class="fw-bold mt-3 mb-2 border-bottom pb-1"><i class="fa-solid fa-layer-group me-1 text-warning"></i> Lotes Activos y Vencimientos:</h6>
        ${lotes.length === 0 ? '<p class="text-muted small">No hay lotes con existencias activas.</p>' : `
          <div class="table-responsive">
            <table class="table table-sm small align-middle">
              <thead><tr><th>Lote</th><th>Depósito</th><th>Cantidad</th><th>Vencimiento</th><th class="text-end">Acción</th></tr></thead>
              <tbody>
                ${lotes.map(l => `
                  <tr>
                    <td><code>${l.codigo_lote}</code></td>
                    <td>${l.deposito_nombre}</td>
                    <td class="fw-bold">${l.cantidad_actual}</td>
                    <td>${l.fecha_vencimiento}</td>
                    <td class="text-end">
                      <button class="btn btn-sm btn-outline-warning py-0 px-2" onclick="Swal.close(); abrirModalEditarLote(${l.id});" title="Editar lote">
                        <i class="fa-solid fa-calendar-pen me-1"></i> Editar
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;

    Swal.fire({
      title: 'Trazabilidad del Producto',
      html,
      width: '600px',
      confirmButtonText: 'Entendido'
    });
  } catch (err) {
    Swal.fire('Error', 'No se pudo obtener el detalle', 'error');
  }
}

// --------------------------------------------------------------------------
// 3. RECETARIO & FÓRMULAS
// --------------------------------------------------------------------------
async function cargarRecetas() {
  try {
    const res = await API.get('/recetas');
    if (!res.success) return;

    const recetas = res.recetas || [];
    const container = document.getElementById('contenedorRecetasCards');

    if (recetas.length === 0) {
      container.innerHTML = '<div class="col-12 text-center text-muted py-5">No hay fórmulas de panadería registradas.</div>';
      return;
    }

    container.innerHTML = recetas.map(r => `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card h-100 border shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <span class="badge bg-amber-subtle text-dark border"><code>${r.codigo}</code></span>
              <span class="badge bg-success-subtle text-success">${r.cantidad_insumos} Insumos</span>
            </div>
            <h5 class="card-title fw-bold mb-1">${r.nombre}</h5>
            <p class="text-muted small mb-2">${r.descripcion || ''}</p>
            
            <div class="bg-light p-2 rounded small mb-3">
              <div class="d-flex justify-content-between">
                <span>Producto obtenido:</span>
                <strong>${r.producto_terminado_nombre}</strong>
              </div>
              <div class="d-flex justify-content-between">
                <span>Rendimiento base:</span>
                <strong>${r.rendimiento_unidades} ${r.unidad_simbolo || 'un'}</strong>
              </div>
              <div class="d-flex justify-content-between">
                <span>Tiempo horneado:</span>
                <strong>${r.tiempo_estimado_min} min</strong>
              </div>
              <div class="d-flex justify-content-between border-top pt-1 mt-1">
                <span>Costo estimado:</span>
                <strong class="text-primary">${API.formatGs(r.costo_estimado)}</strong>
              </div>
            </div>

            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-outline-primary w-50" onclick="verDetalleReceta(${r.id})">
                <i class="fa-solid fa-list me-1"></i> Ver Fórmula
              </button>
              <button class="btn btn-sm btn-warning text-white w-50 fw-semibold" onclick="iniciarHorneadaDesdeReceta(${r.id})" style="background-color: #d97706;">
                <i class="fa-solid fa-fire me-1"></i> Hornear
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error cargando recetas:', err);
  }
}

async function verDetalleReceta(id) {
  try {
    const res = await API.get(`/recetas/${id}`);
    if (!res.success) return;
    const { receta, detalles, costoTotalCalculado } = res;

    let html = `
      <div class="text-start">
        <h5 class="fw-bold mb-1">${receta.nombre}</h5>
        <p class="text-muted small">${receta.descripcion || ''}</p>
        <div class="table-responsive">
          <table class="table table-sm small table-bordered">
            <thead class="table-light">
              <tr><th>Insumo</th><th>Proporción</th><th>Costo Unit.</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              ${detalles.map(d => `
                <tr>
                  <td>${d.insumo_nombre}</td>
                  <td class="fw-bold">${d.cantidad_requerida} ${d.unidad_simbolo || ''}</td>
                  <td>${API.formatGs(d.insumo_costo_unitario)}</td>
                  <td>${API.formatGs(d.subtotal_costo)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="fw-bold table-light">
                <td colspan="3" class="text-end">Costo Total Fórmula:</td>
                <td class="text-success">${API.formatGs(costoTotalCalculado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'Fórmula de Producción',
      html,
      width: '650px',
      confirmButtonText: 'Cerrar'
    });
  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar la receta', 'error');
  }
}

async function abrirModalReceta() {
  document.getElementById('formReceta').reset();
  const count = (await API.get('/recetas')).recetas.length + 1;
  document.getElementById('recCodigo').value = `REC-${String(count).padStart(3, '0')}`;

  // Products select
  const terminados = productosGlobal.filter(p => p.tipo === 'producto_terminado');
  const selTerminado = document.getElementById('recProductoTerminadoId');
  selTerminado.innerHTML = terminados.map(p => `<option value="${p.id}">${p.nombre} (${p.codigo})</option>`).join('');

  document.getElementById('contenedorInsumosReceta').innerHTML = '';
  agregarFilaInsumoReceta();
  agregarFilaInsumoReceta();

  const modal = new bootstrap.Modal(document.getElementById('modalReceta'));
  modal.show();
}

function agregarFilaInsumoReceta() {
  const container = document.getElementById('contenedorInsumosReceta');
  const insumos = productosGlobal.filter(p => p.tipo === 'materia_prima');

  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 fila-insumo-receta';
  div.innerHTML = `
    <div class="col-7">
      <select class="form-select form-select-sm sel-insumo-id" required>
        ${insumos.map(i => `<option value="${i.id}">${i.nombre} (${i.unidad_simbolo || ''})</option>`).join('')}
      </select>
    </div>
    <div class="col-4">
      <input type="number" class="form-control form-control-sm inp-insumo-cant" placeholder="Cantidad" step="0.01" min="0.01" required>
    </div>
    <div class="col-1 text-center">
      <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1" onclick="this.closest('.fila-insumo-receta').remove()">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;
  container.appendChild(div);
}

// --------------------------------------------------------------------------
// 4. PRODUCCIÓN / HORNEADAS
// --------------------------------------------------------------------------
async function cargarProduccionView() {
  try {
    const [resRec, resOrd] = await Promise.all([
      API.get('/recetas'),
      API.get('/produccion')
    ]);

    const recetas = resRec.recetas || [];
    const selRec = document.getElementById('prodRecetaId');
    selRec.innerHTML = '<option value="">-- Seleccionar Receta --</option>' +
      recetas.map(r => `<option value="${r.id}" data-rendimiento="${r.rendimiento_unidades}">${r.nombre} (Rinde: ${r.rendimiento_unidades} un/kg)</option>`).join('');

    // Fill deposits
    const selOrig = document.getElementById('prodDepositoOrigen');
    const selDest = document.getElementById('prodDepositoDestino');

    selOrig.innerHTML = depositosGlobal.map(d => `<option value="${d.id}" ${d.es_principal ? 'selected' : ''}>${d.nombre}</option>`).join('');
    selDest.innerHTML = depositosGlobal.map(d => `<option value="${d.id}" ${d.nombre.includes('Mostrador') ? 'selected' : ''}>${d.nombre}</option>`).join('');

    // History table
    const tbodyHist = document.getElementById('tablaHistorialProduccion');
    const ordenes = resOrd.ordenes || [];
    if (ordenes.length === 0) {
      tbodyHist.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay órdenes de producción registradas</td></tr>';
      return;
    }

    tbodyHist.innerHTML = ordenes.map(o => `
      <tr>
        <td><code>${o.codigo}</code></td>
        <td><small>${API.formatFecha(o.fecha_produccion)}</small></td>
        <td class="fw-bold">${o.receta_nombre}</td>
        <td><span class="badge bg-success-subtle text-success fs-6">${o.cantidad_obtenida} ${o.unidad_simbolo || ''}</span></td>
        <td>${API.formatGs(o.costo_total)}</td>
        <td><small class="text-muted">${o.usuario_nombre}</small></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary py-0 px-2 me-1" onclick="verDetalleOrdenProduccion(${o.id})" title="Ver insumos consumidos">
            <i class="fa-solid fa-eye me-1"></i> Detalle
          </button>
          <button class="btn btn-sm btn-outline-warning py-0 px-2 text-dark" onclick="iniciarHorneadaDesdeReceta(${o.receta_id})" title="Hornear otra tanda de esta receta">
            <i class="fa-solid fa-fire me-1"></i> Re-Hornear
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando vista de producción:', err);
  }
}

async function cargarDetalleInsumosProduccion() {
  const recetaId = document.getElementById('prodRecetaId').value;
  const depOrigId = document.getElementById('prodDepositoOrigen').value;
  const mult = parseFloat(document.getElementById('prodMultiplicador').value) || 1;
  const tbody = document.getElementById('tablaPreviewInsumosProduccion');

  if (!recetaId || !depOrigId) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Seleccione una receta y depósito</td></tr>';
    return;
  }

  try {
    const res = await API.get(`/recetas/${recetaId}`);
    if (!res.success) return;

    const { receta, detalles } = res;
    // Set auto estimated final quantity
    document.getElementById('prodCantidadObtenida').value = receta.rendimiento_unidades * mult;

    // Fetch stock for selected deposit
    const resStock = await API.get(`/depositos/${depOrigId}/stock`);
    const stockItems = resStock.stock || [];

    tbody.innerHTML = detalles.map(d => {
      const requerido = d.cantidad_requerida * mult;
      const stockItem = stockItems.find(s => s.producto_id === d.insumo_id);
      const enDeposito = stockItem ? stockItem.cantidad : 0;
      const suficiente = enDeposito >= requerido;

      return `
        <tr>
          <td>${d.insumo_nombre}</td>
          <td class="fw-bold">${requerido.toFixed(2)} ${d.unidad_simbolo || ''}</td>
          <td>${enDeposito.toFixed(2)} ${d.unidad_simbolo || ''}</td>
          <td>
            <span class="badge ${suficiente ? 'bg-success' : 'bg-danger'}">
              ${suficiente ? 'Disponible' : 'Faltante'}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error previewing ingredients:', err);
  }
}

function iniciarHorneadaDesdeReceta(recetaId) {
  navigate('produccion');
  setTimeout(() => {
    const sel = document.getElementById('prodRecetaId');
    if (sel) {
      sel.value = recetaId;
      cargarDetalleInsumosProduccion();
    }
  }, 100);
}

function iniciarHorneadaRapida(recetaId) {
  iniciarHorneadaDesdeReceta(recetaId);
}

async function verDetalleOrdenProduccion(ordenId) {
  try {
    const res = await API.get(`/produccion/${ordenId}`);
    if (!res.success) return;
    const { orden, insumosConsumidos } = res;

    const costoUnit = orden.cantidad_obtenida > 0 ? (orden.costo_total / orden.cantidad_obtenida) : 0;

    let html = `
      <div class="text-start">
        <div class="d-flex justify-content-between align-items-start border-bottom pb-2 mb-3">
          <div>
            <h5 class="fw-bold mb-0 text-dark">${orden.codigo} - ${orden.receta_nombre}</h5>
            <small class="text-muted">${API.formatFecha(orden.fecha_produccion)} &bull; Maestro Panadero: <strong>${orden.usuario_nombre}</strong></small>
          </div>
          <span class="badge bg-success fs-6">${orden.cantidad_obtenida} ${orden.unidad_simbolo || 'un'} elaborados</span>
        </div>

        <div class="row g-2 mb-3 bg-light p-2 rounded small">
          <div class="col-6"><strong>Depósito Origen:</strong> ${orden.deposito_origen}</div>
          <div class="col-6"><strong>Depósito Destino:</strong> ${orden.deposito_destino}</div>
          <div class="col-6"><strong>Costo Total Insumos:</strong> <span class="text-primary fw-bold">${API.formatGs(orden.costo_total)}</span></div>
          <div class="col-6"><strong>Costo Unitario Producido:</strong> <span class="text-success fw-bold">${API.formatGs(costoUnit)}</span></div>
        </div>

        <h6 class="fw-bold mb-2"><i class="fa-solid fa-boxes-stacked me-1 text-warning"></i> Materias Primas Descontadas del Inventario:</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered small">
            <thead class="table-light">
              <tr>
                <th>Código</th>
                <th>Insumo</th>
                <th>Cantidad Utilizada</th>
                <th>Costo Unit.</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${insumosConsumidos.map(i => {
                const cantUtilizada = i.cantidad_requerida * (orden.cantidad_obtenida / (orden.rendimiento_unidades || 10));
                const sub = cantUtilizada * i.insumo_costo;
                return `
                  <tr>
                    <td><code>${i.insumo_codigo}</code></td>
                    <td class="fw-bold">${i.insumo_nombre}</td>
                    <td class="fw-bold text-danger">-${cantUtilizada.toFixed(2)} ${i.unidad_simbolo || ''}</td>
                    <td>${API.formatGs(i.insumo_costo)}</td>
                    <td>${API.formatGs(sub)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot>
              <tr class="table-light fw-bold">
                <td colspan="4" class="text-end">Costo Total de Horneada:</td>
                <td class="text-primary">${API.formatGs(orden.costo_total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'Hoja de Producción / Horneada',
      html,
      width: '700px',
      showCancelButton: true,
      confirmButtonText: '<i class="fa-solid fa-fire me-1"></i> Hornear Otra Tanda',
      cancelButtonText: 'Cerrar',
      confirmButtonColor: '#d97706'
    }).then(result => {
      if (result.isConfirmed) {
        iniciarHorneadaDesdeReceta(orden.receta_id);
      }
    });
  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar la orden de producción', 'error');
  }
}

// --------------------------------------------------------------------------
// 5. POS / PUNTO DE VENTA
// --------------------------------------------------------------------------
async function cargarPOSView() {
  try {
    const [resProd, resCli] = await Promise.all([
      API.get('/productos', { tipo: 'producto_terminado' }),
      API.get('/ventas/clientes')
    ]);

    posProductsList = resProd.productos || [];

    // Sincronizar productos en memoria global
    if (!productosGlobal || productosGlobal.length === 0) {
      productosGlobal = [...posProductsList];
    } else {
      posProductsList.forEach(p => {
        const idx = productosGlobal.findIndex(item => item.id === p.id);
        if (idx !== -1) productosGlobal[idx] = p;
        else productosGlobal.push(p);
      });
    }

    const prods = posProductsList;
    const clients = resCli.clientes || [];

    // Client select
    const selCli = document.getElementById('posClientSelect');
    selCli.innerHTML = clients.map(c => `<option value="${c.id}">${c.nombre_razon} (${c.ruc_ci})</option>`).join('');

    // Categories filter pills
    const cats = [...new Set(prods.map(p => p.categoria_nombre).filter(Boolean))];
    const catContainer = document.getElementById('posCategoryFilters');
    catContainer.innerHTML = `<button class="btn btn-sm btn-outline-dark active py-0" onclick="posFilterCategory('')">Todos</button>` +
      cats.map(c => `<button class="btn btn-sm btn-outline-secondary py-0 text-nowrap" onclick="posFilterCategory('${c}')">${c}</button>`).join('');

    renderPOSProducts(prods);
  } catch (err) {
    console.error('Error cargando POS:', err);
  }
}

function renderPOSProducts(prods) {
  const container = document.getElementById('posProductsContainer');
  if (prods.length === 0) {
    container.innerHTML = '<div class="col-12 text-center text-muted py-5">No hay productos disponibles para venta en mostrador.</div>';
    return;
  }

  container.innerHTML = prods.map(p => `
    <div class="col-6 col-sm-4 col-md-3">
      <div class="pos-product-card shadow-sm" onclick="posAddToCart(${p.id})">
        <div>
          <span class="badge bg-secondary-subtle text-dark small mb-1"><code>${p.codigo}</code></span>
          <div class="fw-bold text-dark mb-1">${p.nombre}</div>
          <small class="text-muted d-block">${p.categoria_nombre || ''}</small>
        </div>
        <div class="mt-2 pt-2 border-top d-flex justify-content-between align-items-center">
          <span class="fw-bold text-success fs-6">${API.formatGs(p.precio_venta)}</span>
          <span class="badge ${p.stock_total > 0 ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'}">
            Stock: ${p.stock_total}
          </span>
        </div>
      </div>
    </div>
  `).join('');
}

function posFilterCategory(catName) {
  document.querySelectorAll('#posCategoryFilters button').forEach(b => {
    b.classList.toggle('active', b.textContent === (catName || 'Todos'));
  });

  const search = document.getElementById('posSearchProduct').value.toLowerCase();
  const source = (posProductsList && posProductsList.length > 0) ? posProductsList : productosGlobal;
  const filtered = source.filter(p => {
    if (p.tipo !== 'producto_terminado') return false;
    const matchCat = !catName || p.categoria_nombre === catName;
    const matchSearch = !search || p.nombre.toLowerCase().includes(search) || p.codigo.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  renderPOSProducts(filtered);
}

function posAddToCart(prodId) {
  const p = (posProductsList && posProductsList.find(item => item.id === prodId)) ||
            (productosGlobal && productosGlobal.find(item => item.id === prodId));
  if (!p) {
    console.error('Producto no encontrado en inventario para el carrito:', prodId);
    return;
  }

  const existing = posCart.find(item => item.producto_id === prodId);
  if (existing) {
    existing.cantidad += 1;
  } else {
    posCart.push({
      producto_id: p.id,
      nombre: p.nombre,
      codigo: p.codigo,
      precio_unitario: p.precio_venta,
      unidad_simbolo: p.unidad_simbolo || 'un',
      iva_tipo: p.iva || 10,
      cantidad: 1
    });
  }

  posRenderCart();
}

function posRenderCart() {
  const container = document.getElementById('posCartItemsList');
  if (posCart.length === 0) {
    container.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="fa-solid fa-basket-shopping fa-3x mb-2 text-secondary opacity-50"></i>
        <p class="small mb-0">El carrito está vacío.<br>Haga clic en un producto para agregarlo.</p>
      </div>
    `;
    document.getElementById('posSubtotalTxt').textContent = '0 ₲';
    document.getElementById('posIva10Txt').textContent = '0 ₲';
    document.getElementById('posTotalTxt').textContent = '0 ₲';
    document.getElementById('posVueltoTxt').textContent = '0 ₲';
    return;
  }

  let subtotal = 0;
  let iva10 = 0;

  container.innerHTML = posCart.map((item, idx) => {
    const itemSubtotal = item.cantidad * item.precio_unitario;
    subtotal += itemSubtotal;
    iva10 += Math.round(itemSubtotal / 11);

    return `
      <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom small">
        <div class="text-truncate" style="max-width: 130px;">
          <strong class="d-block text-truncate">${item.nombre}</strong>
          <small class="text-muted">${API.formatGs(item.precio_unitario)} x ${item.unidad_simbolo}</small>
        </div>
        <div class="d-flex align-items-center gap-1">
          <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="posUpdateQty(${idx}, -1)">-</button>
          <span class="fw-bold px-1">${item.cantidad}</span>
          <button class="btn btn-sm btn-outline-secondary py-0 px-2" onclick="posUpdateQty(${idx}, 1)">+</button>
        </div>
        <div class="text-end">
          <div class="fw-bold">${API.formatGs(itemSubtotal)}</div>
          <button class="btn btn-sm btn-outline-danger border-0 p-0" onclick="posRemoveItem(${idx})"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('posSubtotalTxt').textContent = API.formatGs(subtotal);
  document.getElementById('posIva10Txt').textContent = API.formatGs(iva10);
  document.getElementById('posTotalTxt').textContent = API.formatGs(subtotal);

  posCalcularVuelto();
}

function posUpdateQty(idx, delta) {
  if (posCart[idx]) {
    posCart[idx].cantidad += delta;
    if (posCart[idx].cantidad <= 0) {
      posCart.splice(idx, 1);
    }
    posRenderCart();
  }
}

function posRemoveItem(idx) {
  posCart.splice(idx, 1);
  posRenderCart();
}

function posClearCart() {
  posCart = [];
  posRenderCart();
}

function posCalcularVuelto() {
  const total = posCart.reduce((sum, i) => sum + (i.cantidad * i.precio_unitario), 0);
  const recibido = parseFloat(document.getElementById('posMontoRecibido').value) || 0;
  const vuelto = Math.max(0, recibido - total);
  document.getElementById('posVueltoTxt').textContent = API.formatGs(vuelto);
}

function posCambioCondicionVenta() {
  const cond = document.getElementById('posCondicionVenta') ? document.getElementById('posCondicionVenta').value : 'contado';
  const pContado = document.getElementById('posPanelContado');
  const pCredito = document.getElementById('posPanelCredito');
  const btn = document.getElementById('posBtnConfirmar');
  if (cond === 'credito') {
    if (pContado) pContado.classList.add('d-none');
    if (pCredito) pCredito.classList.remove('d-none');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-hand-holding-dollar me-2"></i> Registrar Venta a Crédito';
  } else {
    if (pContado) pContado.classList.remove('d-none');
    if (pCredito) pCredito.classList.add('d-none');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-print me-2"></i> Cobrar e Imprimir Ticket';
  }
}

async function posConfirmSale() {
  if (posCart.length === 0) {
    Swal.fire('Carrito Vacío', 'Agregue al menos un producto para registrar la venta', 'warning');
    return;
  }

  const mostradorDep = depositosGlobal.find(d => d.nombre.includes('Mostrador')) || depositosGlobal[0];
  const clienteId = document.getElementById('posClientSelect').value;
  const tipoComprobante = document.getElementById('posReceiptType').value;
  const condicionVenta = document.getElementById('posCondicionVenta') ? document.getElementById('posCondicionVenta').value : 'contado';
  const metodoPago = document.getElementById('posPaymentMethod') ? document.getElementById('posPaymentMethod').value : 'efectivo';
  const montoRecibido = parseFloat(document.getElementById('posMontoRecibido').value) || 0;
  const diasCredito = document.getElementById('posDiasCredito') ? parseInt(document.getElementById('posDiasCredito').value) || 30 : 30;
  const cuotasCredito = document.getElementById('posCuotasCredito') ? parseInt(document.getElementById('posCuotasCredito').value) || 1 : 1;

  if (condicionVenta === 'credito' && (!clienteId || clienteId == '1')) {
    Swal.fire('Cliente Requerido', 'Para ventas a crédito debe seleccionar un cliente con nombre y RUC registrado (no se permite Consumidor Final).', 'warning');
    return;
  }

  try {
    const res = await API.post('/ventas', {
      cliente_id: clienteId,
      deposito_id: mostradorDep.id,
      tipo_comprobante: tipoComprobante,
      condicion_venta: condicionVenta,
      metodo_pago: metodoPago,
      monto_recibido: montoRecibido,
      dias_credito: diasCredito,
      cuotas: cuotasCredito,
      items: posCart
    });

    if (res.success) {
      if (condicionVenta === 'credito') {
        Swal.fire({
          icon: 'success',
          title: 'Venta a Crédito Registrada',
          text: `Comprobante ${res.numeroComprobante} generado por ${API.formatGs(res.total)}. Se registró en Cuentas a Cobrar.`,
          showCancelButton: true,
          confirmButtonText: 'Ver Cuentas a Cobrar',
          cancelButtonText: 'Continuar en POS'
        }).then(result => {
          if (result.isConfirmed) {
            navigate('creditos');
          }
        });
      } else {
        // Show Printable Ticket
        mostrarTicketModal(res.ventaId);
      }
      posClearCart();
      document.getElementById('posMontoRecibido').value = '';
      await cargarGlobalMetadata();
      await cargarProductos();
    }
  } catch (err) {
    Swal.fire('Error en Venta', err.message, 'error');
  }
}

async function mostrarTicketModal(ventaId) {
  try {
    const res = await API.get(`/ventas/${ventaId}`);
    if (!res.success) return;
    const { venta, detalles } = res;

    const ticketHtml = `
      <div class="ticket-print text-center">
        <h5 class="fw-bold mb-0">PANADERÍA CAPIATÁ</h5>
        <p class="mb-0">RUC: 80012345-6</p>
        <p class="mb-1">Capiatá, Paraguay - Tel: (021) 500-100</p>
        <hr>
        <p class="text-start mb-0"><strong>${venta.tipo_comprobante.toUpperCase()}:</strong> ${venta.numero_comprobante}</p>
        <p class="text-start mb-0"><strong>Fecha:</strong> ${API.formatFecha(venta.fecha_venta)}</p>
        <p class="text-start mb-0"><strong>Cliente:</strong> ${venta.cliente_nombre || 'Mostrador'} (${venta.cliente_ruc || '4444444-4'})</p>
        <p class="text-start mb-1"><strong>Cajero:</strong> ${venta.cajero_nombre}</p>
        <hr>
        <table style="width: 100%; text-align: left; font-size: 11px;">
          <thead>
            <tr><th>Cant</th><th>Descrip</th><th style="text-align: right;">Total</th></tr>
          </thead>
          <tbody>
            ${detalles.map(d => `
              <tr>
                <td>${d.cantidad}</td>
                <td>${d.producto_nombre}</td>
                <td style="text-align: right;">${d.subtotal.toLocaleString('es-PY')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <hr>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px;">
          <span>TOTAL A PAGAR:</span>
          <span>${venta.total.toLocaleString('es-PY')} ₲</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 4px;">
          <span>Pago (${venta.metodo_pago}):</span>
          <span>${venta.monto_recibido.toLocaleString('es-PY')} ₲</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px;">
          <span>Vuelto:</span>
          <span>${venta.vuelto.toLocaleString('es-PY')} ₲</span>
        </div>
        <hr>
        <p class="mb-0 small" style="font-size: 10px;">Liquidación IVA: 10%: ${venta.iva_10.toLocaleString('es-PY')} ₲ | 5%: ${venta.iva_5.toLocaleString('es-PY')} ₲</p>
        <p class="mt-2 mb-0 fw-bold">¡Gracias por su preferencia!</p>
        <p style="font-size: 9px;" class="text-muted">Sistema TFG - Bruno Báez Medina (UNIGRAN)</p>
      </div>
    `;

    document.getElementById('modalTicketBody').innerHTML = ticketHtml;
    const modal = new bootstrap.Modal(document.getElementById('modalTicket'));
    modal.show();
  } catch (err) {
    console.error('Error fetching receipt:', err);
  }
}

// --------------------------------------------------------------------------
// 6. HISTORIAL VENTAS
// --------------------------------------------------------------------------
async function cargarHistorialVentas() {
  try {
    const fDesde = document.getElementById('filtroVentaDesde').value;
    const fHasta = document.getElementById('filtroVentaHasta').value;

    const res = await API.get('/ventas', { fecha_desde: fDesde, fecha_hasta: fHasta });
    if (!res.success) return;

    const ventas = res.ventas || [];
    const tbody = document.getElementById('tablaVentasHistorial');

    if (ventas.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay ventas en este rango de fechas</td></tr>';
      return;
    }

    tbody.innerHTML = ventas.map(v => `
      <tr>
        <td><strong>${v.numero_comprobante}</strong></td>
        <td><span class="badge ${v.tipo_comprobante === 'factura' ? 'bg-primary' : 'bg-secondary'}">${v.tipo_comprobante.toUpperCase()}</span></td>
        <td>${API.formatFecha(v.fecha_venta)}</td>
        <td>${v.cliente_nombre || 'Cliente Ocasional'}</td>
        <td><span class="badge bg-light text-dark border">${v.metodo_pago}</span></td>
        <td class="fw-bold text-success">${API.formatGs(v.total)}</td>
        <td><small class="text-muted">${v.cajero_nombre}</small></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary py-0" onclick="mostrarTicketModal(${v.id})" title="Ver e Imprimir">
            <i class="fa-solid fa-receipt"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading sales history:', err);
  }
}

// --------------------------------------------------------------------------
// 7. COMPRAS & PROVEEDORES
// --------------------------------------------------------------------------
async function cargarComprasView() {
  try {
    const res = await API.get('/compras');
    if (!res.success) return;

    const compras = res.compras || [];
    const tbody = document.getElementById('tablaCompras');

    if (compras.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No hay facturas de compras registradas</td></tr>';
      return;
    }

    tbody.innerHTML = compras.map(c => `
      <tr>
        <td><strong>${c.numero_factura}</strong></td>
        <td>${c.fecha_compra}</td>
        <td class="fw-bold">${c.proveedor_nombre}</td>
        <td><code>${c.proveedor_ruc}</code></td>
        <td>${c.deposito_nombre}</td>
        <td class="fw-bold text-primary">${API.formatGs(c.total)}</td>
        <td><span class="badge bg-light text-dark border">${c.condicion}</span></td>
        <td>
          ${c.numero_orden ? `<span class="badge bg-success-subtle text-success border border-success">${c.numero_orden}</span>` : '<span class="text-muted small">Directa</span>'}
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary py-0" onclick="verDetalleCompra(${c.id})" title="Ver Detalle Factura">
            <i class="fa-solid fa-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando compras:', err);
  }
}

async function verDetalleCompra(id) {
  try {
    const res = await API.get(`/compras/${id}`);
    if (!res.success) return;
    const { compra, detalles } = res;

    let html = `
      <div class="text-start">
        <h5 class="fw-bold mb-1">Factura Nº: ${compra.numero_factura}</h5>
        <p class="text-muted small mb-2">Proveedor: <strong>${compra.proveedor_nombre}</strong> (${compra.proveedor_ruc}) | Fecha: ${compra.fecha_compra}</p>
        <div class="table-responsive">
          <table class="table table-sm small table-bordered">
            <thead class="table-light">
              <tr><th>Insumo</th><th>Lote</th><th>Vencimiento</th><th>Cant</th><th>Precio Unit.</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              ${detalles.map(d => `
                <tr>
                  <td>${d.producto_nombre}</td>
                  <td><code>${d.codigo_lote}</code></td>
                  <td>${d.fecha_vencimiento}</td>
                  <td class="fw-bold">${d.cantidad} ${d.unidad_simbolo || ''}</td>
                  <td>${API.formatGs(d.precio_unitario)}</td>
                  <td>${API.formatGs(d.subtotal)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr class="fw-bold table-light">
                <td colspan="5" class="text-end">Total Factura:</td>
                <td class="text-success">${API.formatGs(compra.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'Detalle de Factura de Compra',
      html,
      width: '700px',
      confirmButtonText: 'Cerrar'
    });
  } catch (err) {
    Swal.fire('Error', 'No se pudo obtener el detalle de la compra', 'error');
  }
}

async function abrirModalNuevaCompra() {
  document.getElementById('formNuevaCompra').reset();
  document.getElementById('compraFecha').value = new Date().toISOString().split('T')[0];

  const resProv = await API.get('/compras/proveedores');
  const selProv = document.getElementById('compraProveedorId');
  selProv.innerHTML = resProv.proveedores.map(p => `<option value="${p.id}">${p.razon_social} (${p.ruc})</option>`).join('');

  const selDep = document.getElementById('compraDepositoId');
  selDep.innerHTML = depositosGlobal.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');

  document.getElementById('tablaCompraDetalles').innerHTML = '';
  agregarFilaCompraItem();

  const modal = new bootstrap.Modal(document.getElementById('modalCompra'));
  modal.show();
}

function agregarFilaCompraItem() {
  const tbody = document.getElementById('tablaCompraDetalles');
  const insumos = productosGlobal.filter(p => p.tipo === 'materia_prima');
  const vtoDefault = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const loteDefault = `LOT-${Date.now().toString().slice(-6)}`;

  const tr = document.createElement('tr');
  tr.className = 'fila-compra-item';
  tr.innerHTML = `
    <td>
      <select class="form-select form-select-sm sel-compra-prod" required>
        ${insumos.map(i => `<option value="${i.id}" data-costo="${i.precio_costo}">${i.nombre} (${i.codigo})</option>`).join('')}
      </select>
    </td>
    <td><input type="text" class="form-control form-control-sm inp-compra-lote" value="${loteDefault}" required></td>
    <td><input type="date" class="form-control form-control-sm inp-compra-vto" value="${vtoDefault}" required></td>
    <td><input type="number" class="form-control form-control-sm inp-compra-cant" value="10" min="1" step="0.5" required oninput="calcularTotalCompra()"></td>
    <td><input type="number" class="form-control form-control-sm inp-compra-precio" value="5000" min="0" required oninput="calcularTotalCompra()"></td>
    <td class="fw-bold txt-compra-subtotal text-end">50.000 ₲</td>
    <td>
      <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1" onclick="this.closest('.fila-compra-item').remove(); calcularTotalCompra();">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>
  `;
  tbody.appendChild(tr);
  calcularTotalCompra();
}

function calcularTotalCompra() {
  let total = 0;
  document.querySelectorAll('.fila-compra-item').forEach(tr => {
    const cant = parseFloat(tr.querySelector('.inp-compra-cant').value) || 0;
    const precio = parseFloat(tr.querySelector('.inp-compra-precio').value) || 0;
    const sub = cant * precio;
    total += sub;
    tr.querySelector('.txt-compra-subtotal').textContent = API.formatGs(sub);
  });
  document.getElementById('compraTotalTxt').textContent = API.formatGs(total);
}

// --------------------------------------------------------------------------
// 8. DEPÓSITOS & TRANSFERENCIAS
// --------------------------------------------------------------------------
async function cargarDepositosView() {
  try {
    const [resDep, resTrf] = await Promise.all([
      API.get('/depositos'),
      API.get('/depositos/transferencias/historial')
    ]);

    const deps = resDep.depositos || [];
    const container = document.getElementById('cardsDepositosContainer');

    container.innerHTML = deps.map(d => `
      <div class="col-12 col-md-4">
        <div class="card h-100 border shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="badge ${d.es_principal ? 'bg-primary' : 'bg-secondary'}">${d.es_principal ? 'Depósito Principal' : 'Almacén / Sala'}</span>
              <i class="fa-solid fa-warehouse fa-lg text-muted"></i>
            </div>
            <h5 class="fw-bold mb-1">${d.nombre}</h5>
            <p class="text-muted small mb-2">${d.ubicacion || ''} - ${d.descripcion || ''}</p>
            <div class="bg-light p-2 rounded small">
              <div class="d-flex justify-content-between">
                <span>Variedad de Ítems:</span>
                <strong>${d.total_items} productos</strong>
              </div>
              <div class="d-flex justify-content-between">
                <span>Valor en Stock:</span>
                <strong class="text-success">${API.formatGs(d.valor_inventario)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Transfer history
    const tbody = document.getElementById('tablaTransferencias');
    const trfs = resTrf.transferencias || [];
    if (trfs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No hay transferencias entre depósitos registradas</td></tr>';
      return;
    }

    tbody.innerHTML = trfs.map(t => `
      <tr>
        <td><strong>${t.codigo}</strong></td>
        <td>${t.fecha}</td>
        <td><span class="badge bg-secondary-subtle text-dark">${t.deposito_origen}</span></td>
        <td><span class="badge bg-primary-subtle text-primary">${t.deposito_destino}</span></td>
        <td>${t.motivo || '-'}</td>
        <td><small class="text-muted">${t.usuario_nombre}</small></td>
        <td><span class="badge bg-success">${t.estado}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading deposits view:', err);
  }
}

function abrirModalTransferencia() {
  document.getElementById('formTransferencia').reset();
  const selOrig = document.getElementById('trfOrigenId');
  const selDest = document.getElementById('trfDestinoId');

  selOrig.innerHTML = depositosGlobal.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
  selDest.innerHTML = depositosGlobal.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');

  document.getElementById('contenedorItemsTransferencia').innerHTML = '';
  agregarFilaTransferencia();

  const modal = new bootstrap.Modal(document.getElementById('modalTransferencia'));
  modal.show();
}

function agregarFilaTransferencia() {
  const container = document.getElementById('contenedorItemsTransferencia');
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 fila-trf-item';
  div.innerHTML = `
    <div class="col-7">
      <select class="form-select form-select-sm sel-trf-prod" required>
        ${productosGlobal.map(p => `<option value="${p.id}">${p.nombre} (${p.codigo})</option>`).join('')}
      </select>
    </div>
    <div class="col-4">
      <input type="number" class="form-control form-control-sm inp-trf-cant" placeholder="Cantidad" min="1" step="0.5" required>
    </div>
    <div class="col-1 text-center">
      <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1" onclick="this.closest('.fila-trf-item').remove()">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;
  container.appendChild(div);
}

// --------------------------------------------------------------------------
// 9. AJUSTES DE INVENTARIO
// --------------------------------------------------------------------------
async function cargarAjustesView() {
  try {
    const res = await API.get('/ajustes');
    if (!res.success) return;

    const ajustes = res.ajustes || [];
    const tbody = document.getElementById('tablaAjustes');

    if (ajustes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay ajustes de stock registrados</td></tr>';
      return;
    }

    tbody.innerHTML = ajustes.map(a => `
      <tr>
        <td><strong>${a.codigo}</strong></td>
        <td>${a.fecha}</td>
        <td>${a.deposito_nombre}</td>
        <td><span class="badge ${a.tipo_ajuste === 'egreso' ? 'bg-danger' : 'bg-success'}">${a.tipo_ajuste.toUpperCase()}</span></td>
        <td><span class="badge bg-light text-dark border">${a.motivo}</span></td>
        <td>${a.observaciones || '-'}</td>
        <td><small class="text-muted">${a.usuario_nombre}</small></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary py-0" onclick="verDetalleAjuste(${a.id})">
            <i class="fa-solid fa-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando ajustes:', err);
  }
}

async function verDetalleAjuste(id) {
  try {
    const res = await API.get(`/ajustes/${id}`);
    if (!res.success) return;
    const { ajuste, detalles } = res;

    let html = `
      <div class="text-start">
        <h5 class="fw-bold mb-1">Ajuste: ${ajuste.codigo}</h5>
        <p class="text-muted small">Depósito: <strong>${ajuste.deposito_nombre}</strong> | Motivo: ${ajuste.motivo} | ${ajuste.fecha}</p>
        <div class="table-responsive">
          <table class="table table-sm small table-bordered">
            <thead class="table-light">
              <tr><th>Producto</th><th>Stock Previo</th><th>Ajustado</th><th>Diferencia</th></tr>
            </thead>
            <tbody>
              ${detalles.map(d => `
                <tr>
                  <td>${d.producto_nombre}</td>
                  <td>${d.cantidad_anterior} ${d.unidad_simbolo || ''}</td>
                  <td class="fw-bold">${d.cantidad_ajustada} ${d.unidad_simbolo || ''}</td>
                  <td class="fw-bold ${d.diferencia >= 0 ? 'text-success' : 'text-danger'}">${d.diferencia > 0 ? '+' : ''}${d.diferencia}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    Swal.fire({
      title: 'Detalle de Ajuste de Stock',
      html,
      confirmButtonText: 'Cerrar'
    });
  } catch (err) {
    Swal.fire('Error', 'No se pudo obtener el detalle', 'error');
  }
}

function abrirModalAjuste() {
  document.getElementById('formAjusteStock').reset();
  const selDep = document.getElementById('ajusteDepositoId');
  selDep.innerHTML = depositosGlobal.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');

  document.getElementById('contenedorItemsAjuste').innerHTML = '';
  agregarFilaAjuste();

  const modal = new bootstrap.Modal(document.getElementById('modalAjuste'));
  modal.show();
}

function agregarFilaAjuste() {
  const container = document.getElementById('contenedorItemsAjuste');
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 fila-ajuste-item';
  div.innerHTML = `
    <div class="col-7">
      <select class="form-select form-select-sm sel-ajuste-prod" required>
        ${productosGlobal.map(p => `<option value="${p.id}">${p.nombre} (${p.codigo})</option>`).join('')}
      </select>
    </div>
    <div class="col-4">
      <input type="number" class="form-control form-control-sm inp-ajuste-cant" placeholder="Cantidad / Ajuste" step="0.5" required>
    </div>
    <div class="col-1 text-center">
      <button type="button" class="btn btn-sm btn-outline-danger border-0 p-1" onclick="this.closest('.fila-ajuste-item').remove()">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;
  container.appendChild(div);
}

// --------------------------------------------------------------------------
// 10. KARDEX / AUDITORÍA
// --------------------------------------------------------------------------
async function cargarKardexView() {
  // Populate filter selects
  const selProd = document.getElementById('filtroKardexProducto');
  selProd.innerHTML = '<option value="">Todos los Productos</option>' +
    productosGlobal.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');

  const selDep = document.getElementById('filtroKardexDeposito');
  selDep.innerHTML = '<option value="">Todos los Depósitos</option>' +
    depositosGlobal.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');

  await cargarKardex();
}

async function cargarKardex() {
  try {
    const prodId = document.getElementById('filtroKardexProducto').value;
    const depId = document.getElementById('filtroKardexDeposito').value;
    const tipo = document.getElementById('filtroKardexTipo').value;

    const res = await API.get('/kardex', { producto_id: prodId, deposito_id: depId, tipo_movimiento: tipo });
    if (!res.success) return;

    const movs = res.movimientos || [];
    const tbody = document.getElementById('tablaKardex');

    if (movs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">No hay movimientos registrados con los filtros seleccionados</td></tr>';
      return;
    }

    tbody.innerHTML = movs.map(m => {
      let badgeClass = 'bg-secondary';
      if (m.tipo_movimiento === 'COMPRA') badgeClass = 'bg-primary';
      else if (m.tipo_movimiento === 'VENTA') badgeClass = 'bg-success';
      else if (m.tipo_movimiento.includes('PRODUCCION')) badgeClass = 'bg-warning text-dark';
      else if (m.tipo_movimiento.includes('TRANSFERENCIA')) badgeClass = 'bg-info text-dark';
      else if (m.tipo_movimiento.includes('AJUSTE')) badgeClass = 'bg-danger';

      return `
        <tr>
          <td><small>${API.formatFecha(m.fecha)}</small></td>
          <td class="fw-bold">${m.producto_nombre}</td>
          <td><small class="text-muted">${m.deposito_nombre}</small></td>
          <td><span class="badge ${badgeClass}">${m.tipo_movimiento}</span></td>
          <td><code>${m.referencia_documento || '-'}</code></td>
          <td class="text-center fw-bold text-success">${m.cantidad_entrada > 0 ? '+' + m.cantidad_entrada + ' ' + (m.unidad_simbolo || '') : '-'}</td>
          <td class="text-center fw-bold text-danger">${m.cantidad_salida > 0 ? '-' + m.cantidad_salida + ' ' + (m.unidad_simbolo || '') : '-'}</td>
          <td class="text-center fw-bold text-primary">${m.saldo_resultante} ${m.unidad_simbolo || ''}</td>
          <td>${API.formatGs(m.costo_unitario)}</td>
          <td><small class="text-muted">${m.usuario_nombre || 'Sistema'}</small></td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading Kardex:', err);
  }
}

function exportarKardexCSV() {
  const rows = [];
  const headers = ['Fecha', 'Producto', 'Deposito', 'Tipo Movimiento', 'Documento Ref', 'Entrada', 'Salida', 'Saldo', 'Costo Unitario', 'Usuario'];
  rows.push(headers.join(';'));

  document.querySelectorAll('#tablaKardex tr').forEach(tr => {
    const cols = Array.from(tr.querySelectorAll('td')).map(td => `"${td.innerText.replace(/"/g, '""').trim()}"`);
    if (cols.length === headers.length) {
      rows.push(cols.join(';'));
    }
  });

  const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + rows.join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `KARDEX_PANADERIA_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --------------------------------------------------------------------------
// 11. REPORTES
// --------------------------------------------------------------------------
async function cargarReporteInventario() {
  try {
    const res = await API.get('/reportes/inventario-valorizado');
    if (!res.success) return;

    const { items, totales } = res;
    const container = document.getElementById('reporteContenedorResultado');

    container.innerHTML = `
      <div class="card-body p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0"><i class="fa-solid fa-boxes-packing text-primary me-2"></i>Informe de Inventario Valorizado</h5>
          <button class="btn btn-sm btn-outline-secondary" onclick="window.print()"><i class="fa-solid fa-print me-1"></i> Imprimir</button>
        </div>
        <div class="row g-3 mb-3">
          <div class="col-md-4">
            <div class="p-3 bg-light rounded text-center">
              <span class="text-muted small">Valor Total Costo:</span>
              <h4 class="fw-bold text-primary mb-0">${API.formatGs(totales.totalCosto)}</h4>
            </div>
          </div>
          <div class="col-md-4">
            <div class="p-3 bg-light rounded text-center">
              <span class="text-muted small">Valor Estimado Venta:</span>
              <h4 class="fw-bold text-success mb-0">${API.formatGs(totales.totalVenta)}</h4>
            </div>
          </div>
          <div class="col-md-4">
            <div class="p-3 bg-light rounded text-center">
              <span class="text-muted small">Total Unidades/Kg en Stock:</span>
              <h4 class="fw-bold text-dark mb-0">${totales.totalUnidades.toLocaleString('es-PY')}</h4>
            </div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="table table-hover table-sm align-middle small">
            <thead class="table-light">
              <tr>
                <th>Código</th>
                <th>Producto / Insumo</th>
                <th>Depósito</th>
                <th>Categoría</th>
                <th>Cantidad</th>
                <th>Costo Unit.</th>
                <th>Valor Total Costo</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(i => `
                <tr>
                  <td><code>${i.codigo}</code></td>
                  <td class="fw-bold">${i.nombre}</td>
                  <td>${i.deposito}</td>
                  <td>${i.categoria || '-'}</td>
                  <td class="fw-bold">${i.cantidad} ${i.unidad || ''}</td>
                  <td>${API.formatGs(i.precio_costo)}</td>
                  <td class="fw-bold text-primary">${API.formatGs(i.valor_costo_total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error reporte inventario:', err);
  }
}

async function cargarReporteVentas() {
  try {
    const res = await API.get('/reportes/ventas-resumen');
    if (!res.success) return;

    const { ventasPorMetodo, ventasPorProducto, totalVentas } = res;
    const container = document.getElementById('reporteContenedorResultado');

    container.innerHTML = `
      <div class="card-body p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0"><i class="fa-solid fa-chart-pie text-success me-2"></i>Informe de Rentabilidad y Ventas</h5>
          <span class="badge bg-success fs-6">Recaudación Total: ${API.formatGs(totalVentas)}</span>
        </div>

        <h6 class="fw-bold mt-4 mb-2">Desglose por Métodos de Pago:</h6>
        <div class="row g-2 mb-4">
          ${ventasPorMetodo.map(m => `
            <div class="col-12 col-md-4">
              <div class="border rounded p-3 text-center">
                <span class="badge bg-light text-dark border mb-1">${m.metodo_pago.toUpperCase()}</span>
                <h5 class="fw-bold text-dark mb-0">${API.formatGs(m.total_monto)}</h5>
                <small class="text-muted">${m.transacciones} transacciones</small>
              </div>
            </div>
          `).join('')}
        </div>

        <h6 class="fw-bold mb-2">Ranking de Productos por Facturación:</h6>
        <div class="table-responsive">
          <table class="table table-hover table-sm align-middle small">
            <thead class="table-light">
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Cantidad Vendida</th>
                <th>Total Facturado</th>
              </tr>
            </thead>
            <tbody>
              ${ventasPorProducto.map(p => `
                <tr>
                  <td><code>${p.codigo}</code></td>
                  <td class="fw-bold">${p.nombre}</td>
                  <td>${p.categoria || '-'}</td>
                  <td class="fw-bold">${p.cantidad_vendida} ${p.unidad || 'un'}</td>
                  <td class="fw-bold text-success">${API.formatGs(p.total_facturado)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error report sales:', err);
  }
}

async function cargarReporteMermas() {
  try {
    const res = await API.get('/reportes/mermas-ajustes');
    if (!res.success) return;

    const { ajustes } = res;
    const container = document.getElementById('reporteContenedorResultado');

    container.innerHTML = `
      <div class="card-body p-4">
        <h5 class="fw-bold mb-3"><i class="fa-solid fa-triangle-exclamation text-danger me-2"></i>Informe de Mermas, Vencimientos y Pérdidas</h5>
        <div class="table-responsive">
          <table class="table table-hover table-sm align-middle small">
            <thead class="table-light">
              <tr>
                <th>Fecha</th>
                <th>Código Ajuste</th>
                <th>Depósito</th>
                <th>Producto</th>
                <th>Motivo</th>
                <th>Cantidad Perdida/Ajustada</th>
                <th>Observación</th>
              </tr>
            </thead>
            <tbody>
              ${ajustes.length === 0 ? '<tr><td colspan="7" class="text-center py-3 text-muted">No se registran pérdidas ni mermas en el período</td></tr>' : ajustes.map(a => `
                <tr>
                  <td>${a.fecha}</td>
                  <td><code>${a.codigo}</code></td>
                  <td>${a.deposito}</td>
                  <td class="fw-bold">${a.producto}</td>
                  <td><span class="badge bg-danger">${a.motivo}</span></td>
                  <td class="fw-bold text-danger">${a.diferencia}</td>
                  <td><small class="text-muted">${a.observaciones || '-'}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error report mermas:', err);
  }
}

// --------------------------------------------------------------------------
// 12. USUARIOS
// --------------------------------------------------------------------------
async function cargarUsuarios() {
  try {
    const res = await API.get('/usuarios');
    if (!res.success) return;

    const users = res.usuarios || [];
    const tbody = document.getElementById('tablaUsuarios');

    tbody.innerHTML = users.map(u => `
      <tr>
        <td class="fw-bold">${u.nombre}</td>
        <td>${u.email}</td>
        <td><span class="badge bg-primary-subtle text-primary">${u.rol.toUpperCase()}</span></td>
        <td>${u.telefono || '-'}</td>
        <td><span class="badge ${u.estado ? 'bg-success' : 'bg-danger'}">${u.estado ? 'Activo' : 'Inactivo'}</span></td>
        <td class="text-end">
          <button class="btn btn-sm ${u.estado ? 'btn-outline-danger' : 'btn-outline-success'} py-0" onclick="toggleUsuarioEstado(${u.id}, ${u.estado ? 0 : 1})">
            ${u.estado ? 'Desactivar' : 'Activar'}
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

async function toggleUsuarioEstado(id, nuevoEstado) {
  try {
    const res = await API.put(`/usuarios/${id}/estado`, { estado: nuevoEstado });
    if (res.success) {
      cargarUsuarios();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function abrirModalNuevoUsuario() {
  document.getElementById('formNuevoUsuario').reset();
  const modal = new bootstrap.Modal(document.getElementById('modalNuevoUsuario'));
  modal.show();
}

function abrirModalNuevoCliente() {
  document.getElementById('formNuevoCliente').reset();
  const modal = new bootstrap.Modal(document.getElementById('modalNuevoCliente'));
  modal.show();
}

function abrirModalNuevoProveedor() {
  document.getElementById('formNuevoProveedor').reset();
  const modal = new bootstrap.Modal(document.getElementById('modalNuevoProveedor'));
  modal.show();
}

// --------------------------------------------------------------------------
// SETUP FORM LISTENERS
// --------------------------------------------------------------------------
function setupEventListeners() {
  // 1. Login Form
  document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const res = await API.post('/auth/login', { email, password });
      if (res.success) {
        API.setToken(res.token);
        API.setUser(res.usuario);
        checkAuth();
      }
    } catch (err) {
      Swal.fire('Error de Acceso', err.message, 'error');
    }
  });

  // 2. Product Form
  document.getElementById('formProducto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prodId = document.getElementById('prodId').value;
    const body = {
      codigo: document.getElementById('pCodigo').value,
      codigo_barra: document.getElementById('pCodigoBarra').value,
      tipo: document.getElementById('pTipo').value,
      nombre: document.getElementById('pNombre').value,
      categoria_id: document.getElementById('pCategoriaId').value,
      unidad_id: document.getElementById('pUnidadId').value,
      stock_minimo: parseFloat(document.getElementById('pStockMinimo').value),
      stock_maximo: parseFloat(document.getElementById('pStockMaximo').value),
      precio_costo: parseFloat(document.getElementById('pPrecioCosto').value),
      precio_venta: parseFloat(document.getElementById('pPrecioVenta').value),
      iva: parseFloat(document.getElementById('pIva').value),
      descripcion: document.getElementById('pDescripcion').value
    };

    try {
      if (prodId) {
        await API.put(`/productos/${prodId}`, body);
      } else {
        await API.post('/productos', body);
      }
      bootstrap.Modal.getInstance(document.getElementById('modalProducto')).hide();
      Swal.fire('Éxito', 'Producto guardado exitosamente', 'success');
      cargarProductos();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // 3. Recipe Form
  document.getElementById('formReceta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const detalles = [];
    document.querySelectorAll('.fila-insumo-receta').forEach(row => {
      const insumoId = row.querySelector('.sel-insumo-id').value;
      const cant = parseFloat(row.querySelector('.inp-insumo-cant').value);
      if (insumoId && cant > 0) {
        detalles.push({ insumo_id: parseInt(insumoId), cantidad_requerida: cant });
      }
    });

    if (detalles.length === 0) {
      Swal.fire('Fórmula Incompleta', 'Debe agregar al menos un insumo', 'warning');
      return;
    }

    const body = {
      codigo: document.getElementById('recCodigo').value,
      nombre: document.getElementById('recNombre').value,
      producto_terminado_id: parseInt(document.getElementById('recProductoTerminadoId').value),
      rendimiento_unidades: parseFloat(document.getElementById('recRendimiento').value),
      tiempo_estimado_min: parseInt(document.getElementById('recTiempo').value),
      detalles
    };

    try {
      await API.post('/recetas', body);
      bootstrap.Modal.getInstance(document.getElementById('modalReceta')).hide();
      Swal.fire('Éxito', 'Fórmula de panadería guardada', 'success');
      cargarRecetas();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // 4. Production Execution Form
  document.getElementById('formProduccion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      receta_id: parseInt(document.getElementById('prodRecetaId').value),
      deposito_origen_id: parseInt(document.getElementById('prodDepositoOrigen').value),
      deposito_destino_id: parseInt(document.getElementById('prodDepositoDestino').value),
      multiplicador_tandas: parseFloat(document.getElementById('prodMultiplicador').value),
      cantidad_obtenida: parseFloat(document.getElementById('prodCantidadObtenida').value),
      dias_vencimiento_lote: parseInt(document.getElementById('prodDiasVto').value) || 3
    };

    try {
      const res = await API.post('/produccion/ejecutar', body);
      if (res.success) {
        Swal.fire('¡Horneada Registrada!', res.message, 'success');
        cargarProduccionView();
        cargarDetalleInsumosProduccion();
      }
    } catch (err) {
      Swal.fire('No se pudo hornear', err.message, 'error');
    }
  });

  // 5. Purchase Form
  document.getElementById('formNuevaCompra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const detalles = [];
    document.querySelectorAll('.fila-compra-item').forEach(tr => {
      const prodId = tr.querySelector('.sel-compra-prod').value;
      const lote = tr.querySelector('.inp-compra-lote').value;
      const vto = tr.querySelector('.inp-compra-vto').value;
      const cant = parseFloat(tr.querySelector('.inp-compra-cant').value);
      const precio = parseFloat(tr.querySelector('.inp-compra-precio').value);

      if (prodId && cant > 0) {
        detalles.push({
          producto_id: parseInt(prodId),
          codigo_lote: lote,
          fecha_vencimiento: vto,
          cantidad: cant,
          precio_unitario: precio
        });
      }
    });

    const body = {
      proveedor_id: parseInt(document.getElementById('compraProveedorId').value),
      numero_factura: document.getElementById('compraNumeroFactura').value,
      fecha_compra: document.getElementById('compraFecha').value,
      deposito_id: parseInt(document.getElementById('compraDepositoId').value),
      detalles
    };

    try {
      await API.post('/compras', body);
      bootstrap.Modal.getInstance(document.getElementById('modalCompra')).hide();
      Swal.fire('Compra Guardada', 'Se registraron los insumos y se crearon los lotes correspondientes', 'success');
      cargarComprasView();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // 6. Transfer Form
  document.getElementById('formTransferencia').addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = [];
    document.querySelectorAll('.fila-trf-item').forEach(row => {
      const pId = row.querySelector('.sel-trf-prod').value;
      const cant = parseFloat(row.querySelector('.inp-trf-cant').value);
      if (pId && cant > 0) {
        items.push({ producto_id: parseInt(pId), cantidad: cant });
      }
    });

    const body = {
      deposito_origen_id: parseInt(document.getElementById('trfOrigenId').value),
      deposito_destino_id: parseInt(document.getElementById('trfDestinoId').value),
      motivo: document.getElementById('trfMotivo').value,
      items
    };

    try {
      await API.post('/depositos/transferencias', body);
      bootstrap.Modal.getInstance(document.getElementById('modalTransferencia')).hide();
      Swal.fire('Transferencia Exitosa', 'Stock trasladado entre depósitos', 'success');
      cargarDepositosView();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // 7. Adjustment Form
  document.getElementById('formAjusteStock').addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = [];
    document.querySelectorAll('.fila-ajuste-item').forEach(row => {
      const pId = row.querySelector('.sel-ajuste-prod').value;
      const cant = parseFloat(row.querySelector('.inp-ajuste-cant').value);
      if (pId && !isNaN(cant)) {
        items.push({ producto_id: parseInt(pId), cantidad_ajustada: cant });
      }
    });

    const body = {
      deposito_id: parseInt(document.getElementById('ajusteDepositoId').value),
      tipo_ajuste: document.getElementById('ajusteTipo').value,
      motivo: document.getElementById('ajusteMotivo').value,
      observaciones: document.getElementById('ajusteObservaciones').value,
      items
    };

    try {
      await API.post('/ajustes', body);
      bootstrap.Modal.getInstance(document.getElementById('modalAjuste')).hide();
      Swal.fire('Ajuste Aplicado', 'Se corrigieron las existencias en el inventario', 'success');
      cargarAjustesView();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // 8. Client Form
  document.getElementById('formNuevoCliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      ruc_ci: document.getElementById('cliRuc').value,
      nombre_razon: document.getElementById('cliNombre').value,
      telefono: document.getElementById('cliTelefono').value,
      direccion: document.getElementById('cliDireccion').value
    };

    try {
      await API.post('/ventas/clientes', body);
      bootstrap.Modal.getInstance(document.getElementById('modalNuevoCliente')).hide();
      Swal.fire('Cliente Registrado', 'Cliente agregado a la base de datos', 'success');
      cargarPOSView();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // 9. Supplier Form
  document.getElementById('formNuevoProveedor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      ruc: document.getElementById('provRuc').value,
      razon_social: document.getElementById('provRazonSocial').value,
      contacto_nombre: document.getElementById('provContacto').value,
      telefono: document.getElementById('provTelefono').value,
      direccion: document.getElementById('provDireccion').value
    };

    try {
      await API.post('/compras/proveedores', body);
      bootstrap.Modal.getInstance(document.getElementById('modalNuevoProveedor')).hide();
      Swal.fire('Proveedor Guardado', 'Proveedor registrado para compras', 'success');
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // 10. User Form
  document.getElementById('formNuevoUsuario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      nombre: document.getElementById('usrNombre').value,
      email: document.getElementById('usrEmail').value,
      password: document.getElementById('usrPassword').value,
      rol: document.getElementById('usrRol').value,
      telefono: document.getElementById('usrTelefono').value
    };

    try {
      await API.post('/usuarios', body);
      bootstrap.Modal.getInstance(document.getElementById('modalNuevoUsuario')).hide();
      Swal.fire('Usuario Creado', 'Nuevo usuario registrado con éxito', 'success');
      cargarUsuarios();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // Search filter inputs
  document.getElementById('filtroBuscarProducto').addEventListener('input', cargarProductos);
  document.getElementById('filtroTipoProducto').addEventListener('change', cargarProductos);
  document.getElementById('posSearchProduct').addEventListener('input', () => posFilterCategory(''));

  // Notification button click handler
  const btnAlertas = document.getElementById('btnDropdownAlertas');
  if (btnAlertas) {
    btnAlertas.addEventListener('click', async () => {
      try {
        const res = await API.get('/dashboard/stats');
        if (res.success) {
          actualizarNotificacionesDropdown(res.productosStockBajo, res.lotesPorVencer);
        }
      } catch (e) {
        console.warn('Error refrescando alertas:', e);
      }
    });
  }

  // 11. Lot Edit Form
  const formLote = document.getElementById('formEditarLote');
  if (formLote) {
    formLote.addEventListener('submit', async (e) => {
      e.preventDefault();
      const loteId = document.getElementById('editLoteId').value;
      const body = {
        codigo_lote: document.getElementById('editLoteCodigo').value,
        cantidad_actual: parseFloat(document.getElementById('editLoteCantidad').value),
        fecha_elaboracion: document.getElementById('editLoteFechaElab').value || null,
        fecha_vencimiento: document.getElementById('editLoteFechaVto').value,
        estado: document.getElementById('editLoteEstado').value
      };

      try {
        const res = await API.put(`/productos/lotes/${loteId}`, body);
        if (res.success) {
          bootstrap.Modal.getInstance(document.getElementById('modalEditarLote')).hide();
          Swal.fire('Lote Actualizado', 'La fecha de vencimiento y datos del lote se guardaron correctamente', 'success');
          
          // Refresh views and notifications
          const resStats = await API.get('/dashboard/stats');
          if (resStats.success) {
            actualizarNotificacionesDropdown(resStats.productosStockBajo, resStats.lotesPorVencer);
          }
          cargarDashboard();
          cargarProductos();
        }
      } catch (err) {
        Swal.fire('Error', err.message, 'error');
      }
    });
  }
}

async function abrirModalEditarLote(loteId) {
  try {
    const res = await API.get(`/productos/lotes/${loteId}`);
    if (!res.success) return;
    const l = res.lote;

    document.getElementById('editLoteId').value = l.id;
    document.getElementById('editLoteProducto').value = `${l.producto_nombre} (${l.producto_codigo})`;
    document.getElementById('editLoteDeposito').value = l.deposito_nombre;
    document.getElementById('editLoteCodigo').value = l.codigo_lote;
    document.getElementById('editLoteCantidad').value = l.cantidad_actual;
    document.getElementById('editLoteFechaElab').value = l.fecha_elaboracion || '';
    document.getElementById('editLoteFechaVto').value = l.fecha_vencimiento;
    document.getElementById('editLoteEstado').value = l.estado || 'activo';

    const modal = new bootstrap.Modal(document.getElementById('modalEditarLote'));
    modal.show();
  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar la información del lote', 'error');
  }
}

// --------------------------------------------------------------------------
// 12. GESTIÓN DE CAJA Y TURNOS
// --------------------------------------------------------------------------
let sesionCajaActual = null;

async function cargarCaja() {
  try {
    const res = await API.get('/caja/sesion-activa');
    if (!res.success) return;

    const panel = document.getElementById('cajaPanelEstado');
    if (!panel) return;

    if (res.activa && res.sesion) {
      sesionCajaActual = res.sesion;
      const s = res.sesion;
      panel.innerHTML = `
        <div class="card border-0 shadow-sm border-start border-4 border-success p-3 bg-white">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <div>
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-success px-2 py-1"><i class="fa-solid fa-lock-open me-1"></i> CAJA ABIERTA (TURNO ACTIVO)</span>
                <span class="fw-bold text-dark fs-6">${s.caja_nombre}</span>
              </div>
              <small class="text-muted">
                Apertura: ${new Date(s.fecha_apertura).toLocaleString('es-PY')} | Cajero: <strong>${s.usuario_nombre}</strong>
              </small>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-outline-success btn-sm fw-semibold" onclick="abrirModalMovimiento('ingreso')">
                <i class="fa-solid fa-plus-circle me-1"></i> Ingreso Extra
              </button>
              <button class="btn btn-outline-danger btn-sm fw-semibold" onclick="abrirModalMovimiento('egreso')">
                <i class="fa-solid fa-minus-circle me-1"></i> Egreso / Retiro
              </button>
              <button class="btn btn-danger btn-sm fw-bold shadow-sm" onclick="abrirModalCierreCaja()">
                <i class="fa-solid fa-calculator me-1"></i> Arqueo y Cierre de Caja
              </button>
            </div>
          </div>

          <div class="row g-3">
            <div class="col-6 col-md-4 col-xl-2">
              <div class="p-2 border rounded bg-light text-center">
                <small class="text-muted d-block">Fondo Inicial</small>
                <span class="fw-bold fs-6 text-dark">${API.formatGs(s.monto_apertura)}</span>
              </div>
            </div>
            <div class="col-6 col-md-4 col-xl-2">
              <div class="p-2 border rounded bg-light text-center">
                <small class="text-muted d-block">(+) Ventas Efectivo</small>
                <span class="fw-bold fs-6 text-success">${API.formatGs(s.ventas_efectivo)}</span>
              </div>
            </div>
            <div class="col-6 col-md-4 col-xl-2">
              <div class="p-2 border rounded bg-light text-center">
                <small class="text-muted d-block">(+) Cobros Créditos</small>
                <span class="fw-bold fs-6 text-success">${API.formatGs(s.cobros_credito_efectivo)}</span>
              </div>
            </div>
            <div class="col-6 col-md-4 col-xl-2">
              <div class="p-2 border rounded bg-light text-center">
                <small class="text-muted d-block">(+) Ventas Tarjeta/QR</small>
                <span class="fw-bold fs-6 text-info">${API.formatGs(s.ventas_tarjeta + s.ventas_qr)}</span>
              </div>
            </div>
            <div class="col-6 col-md-4 col-xl-2">
              <div class="p-2 border rounded bg-light text-center">
                <small class="text-muted d-block">Mov. Extra (+ / -)</small>
                <span class="fw-bold fs-6 ${s.ingresos_extra >= s.egresos_extra ? 'text-primary' : 'text-danger'}">
                  ${API.formatGs(s.ingresos_extra - s.egresos_extra)}
                </span>
              </div>
            </div>
            <div class="col-6 col-md-4 col-xl-2">
              <div class="p-2 border rounded bg-success-subtle border-success text-center">
                <small class="text-success-emphasis fw-bold d-block">SALDO TEÓRICO EFECTIVO</small>
                <span class="fw-bold fs-6 text-success-emphasis">${API.formatGs(s.saldo_teorico_efectivo)}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      sesionCajaActual = null;
      panel.innerHTML = `
        <div class="card border-0 shadow-sm border-start border-4 border-warning p-4 bg-white text-center">
          <div class="py-3">
            <i class="fa-solid fa-lock fa-3x text-warning mb-3"></i>
            <h5 class="fw-bold text-dark mb-1">La Caja se encuentra actualmente CERRADA</h5>
            <p class="text-muted small mb-3">Para realizar cobros en mostrador y registrar transacciones de turno, debe abrir una caja con un fondo inicial.</p>
            <button class="btn btn-warning text-white fw-bold px-4 py-2 shadow-sm" style="background-color: #d97706;" onclick="abrirModalAperturaCaja()">
              <i class="fa-solid fa-key me-2"></i> Abrir Caja con Fondo Inicial
            </button>
          </div>
        </div>
      `;
    }

    cargarMovimientosCaja();
  } catch (err) {
    console.error('Error al cargar caja:', err);
  }
}

async function cargarMovimientosCaja() {
  try {
    const res = await API.get('/caja/movimientos');
    const tbody = document.getElementById('tablaCajaMovimientos');
    if (!tbody) return;

    if (!res.success || !res.movimientos.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center text-muted py-4">
            <i class="fa-solid fa-receipt fa-2x mb-2 text-secondary opacity-50"></i>
            <p class="mb-0">No se han registrado movimientos extraordinarios en esta sesión.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = res.movimientos.map(m => `
      <tr>
        <td>${new Date(m.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</td>
        <td>
          <span class="badge ${m.tipo_movimiento === 'ingreso' ? 'bg-success' : 'bg-danger'}">
            <i class="fa-solid ${m.tipo_movimiento === 'ingreso' ? 'fa-arrow-down' : 'fa-arrow-up'} me-1"></i>
            ${m.tipo_movimiento.toUpperCase()}
          </span>
        </td>
        <td class="fw-semibold text-dark">${m.concepto}</td>
        <td>${m.usuario_nombre}</td>
        <td class="text-end fw-bold ${m.tipo_movimiento === 'ingreso' ? 'text-success' : 'text-danger'}">
          ${m.tipo_movimiento === 'ingreso' ? '+' : '-'}${API.formatGs(m.monto)}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar movimientos de caja:', err);
  }
}

async function abrirModalAperturaCaja() {
  try {
    const res = await API.get('/caja/cajas');
    const select = document.getElementById('aperturaCajaId');
    if (res.success && res.cajas) {
      select.innerHTML = res.cajas.map(c => `
        <option value="${c.id}">${c.nombre} (Punto Exp. ${c.punto_expedicion})</option>
      `).join('');
    }
    document.getElementById('aperturaMonto').value = '150000';
    document.getElementById('aperturaObs').value = '';
    const modal = new bootstrap.Modal(document.getElementById('modalAbrirCaja'));
    modal.show();
  } catch (err) {
    Swal.fire('Error', 'No se pudieron cargar las terminales de caja', 'error');
  }
}

async function guardarAperturaCaja(e) {
  e.preventDefault();
  const cajaId = document.getElementById('aperturaCajaId').value;
  const monto = parseFloat(document.getElementById('aperturaMonto').value) || 0;
  const obs = document.getElementById('aperturaObs').value;

  try {
    const res = await API.post('/caja/apertura', {
      caja_id: cajaId,
      monto_apertura: monto,
      observaciones: obs
    });

    if (res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalAbrirCaja')).hide();
      Swal.fire('Caja Abierta', 'El turno de caja ha sido habilitado con éxito', 'success');
      cargarCaja();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function abrirModalMovimiento(tipo) {
  if (!sesionCajaActual) {
    Swal.fire('Caja Cerrada', 'Debe abrir la caja antes de registrar movimientos extraordinarios', 'warning');
    return;
  }
  document.getElementById('movTipo').value = tipo;
  document.getElementById('movConcepto').value = '';
  document.getElementById('movMonto').value = '';

  const header = document.getElementById('modalMovimientoHeader');
  const titulo = document.getElementById('modalMovimientoTitulo');
  const btn = document.getElementById('movBtnGuardar');

  if (tipo === 'ingreso') {
    header.className = 'modal-header bg-success text-white';
    titulo.innerHTML = '<i class="fa-solid fa-arrow-down me-2"></i> Registrar Ingreso Extraordinario';
    btn.className = 'btn btn-success fw-bold';
    btn.textContent = 'Registrar Ingreso';
  } else {
    header.className = 'modal-header bg-danger text-white';
    titulo.innerHTML = '<i class="fa-solid fa-arrow-up me-2"></i> Registrar Egreso / Retiro de Efectivo';
    btn.className = 'btn btn-danger fw-bold';
    btn.textContent = 'Registrar Egreso';
  }

  const modal = new bootstrap.Modal(document.getElementById('modalMovimientoCaja'));
  modal.show();
}

async function guardarMovimientoCaja(e) {
  e.preventDefault();
  const tipo = document.getElementById('movTipo').value;
  const concepto = document.getElementById('movConcepto').value;
  const monto = parseFloat(document.getElementById('movMonto').value) || 0;

  try {
    const res = await API.post('/caja/movimiento', {
      tipo_movimiento: tipo,
      concepto,
      monto
    });

    if (res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalMovimientoCaja')).hide();
      Swal.fire('Movimiento Registrado', 'La operación fue asentada en la sesión activa', 'success');
      cargarCaja();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

async function abrirModalCierreCaja() {
  if (!sesionCajaActual) return;
  const s = sesionCajaActual;

  document.getElementById('cierreFondoInicial').textContent = API.formatGs(s.monto_apertura);
  document.getElementById('cierreVentasEfectivo').textContent = API.formatGs(s.ventas_efectivo);
  document.getElementById('cierreCobrosEfectivo').textContent = API.formatGs(s.cobros_credito_efectivo);
  document.getElementById('cierreIngresosExtra').textContent = API.formatGs(s.ingresos_extra);
  document.getElementById('cierreEgresosExtra').textContent = API.formatGs(s.egresos_extra);
  document.getElementById('cierreSaldoTeorico').textContent = API.formatGs(s.saldo_teorico_efectivo);

  document.getElementById('cierreEfectivoFisico').value = s.saldo_teorico_efectivo;
  document.getElementById('cierreRecaudacionDepositar').value = s.saldo_teorico_efectivo;
  document.getElementById('cierreObservaciones').value = '';

  calcularDiferenciaCierre();

  const modal = new bootstrap.Modal(document.getElementById('modalCerrarCaja'));
  modal.show();
}

function calcularDiferenciaCierre() {
  if (!sesionCajaActual) return;
  const teorico = sesionCajaActual.saldo_teorico_efectivo;
  const fisico = parseFloat(document.getElementById('cierreEfectivoFisico').value) || 0;
  const dif = fisico - teorico;

  const box = document.getElementById('cierreDiferenciaBox');
  if (dif === 0) {
    box.className = 'p-2 border rounded fw-bold fs-5 text-center text-primary bg-primary-subtle border-primary';
    box.textContent = '0 ₲ (Arqueo Exacto)';
  } else if (dif > 0) {
    box.className = 'p-2 border rounded fw-bold fs-5 text-center text-success bg-success-subtle border-success';
    box.textContent = `+${API.formatGs(dif)} (SOBRANTE EN CAJA)`;
  } else {
    box.className = 'p-2 border rounded fw-bold fs-5 text-center text-danger bg-danger-subtle border-danger';
    box.textContent = `${API.formatGs(dif)} (FALTANTE EN CAJA)`;
  }

  // Actualizar sugerencia de recaudación a depositar
  document.getElementById('cierreRecaudacionDepositar').value = fisico;
}

async function guardarCierreCaja(e) {
  e.preventDefault();
  const fisico = parseFloat(document.getElementById('cierreEfectivoFisico').value) || 0;
  const aDepositar = parseFloat(document.getElementById('cierreRecaudacionDepositar').value) || 0;
  const obs = document.getElementById('cierreObservaciones').value;

  try {
    const res = await API.post('/caja/cierre', {
      monto_cierre_efectivo: fisico,
      recaudacion_depositar: aDepositar,
      observaciones: obs
    });

    if (res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalCerrarCaja')).hide();
      Swal.fire({
        icon: 'success',
        title: 'Caja Cerrada Correctamente',
        text: 'Se generó el acta de arqueo y boleta de recaudación a depositar.',
        confirmButtonText: 'Ver Acta de Cierre'
      }).then(() => {
        verComprobanteCierre(res.resumen.sesion_id);
      });
      cargarCaja();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

async function cargarHistorialCajas() {
  try {
    const res = await API.get('/caja/historial');
    const tbody = document.getElementById('tablaCajaHistorial');
    if (!tbody) return;

    if (!res.success || !res.historial.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="text-center text-muted py-4">No hay turnos cerrados registrados.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = res.historial.map(h => `
      <tr>
        <td class="fw-bold">#${h.id}</td>
        <td>${h.caja_nombre}</td>
        <td>${h.cajero_nombre}</td>
        <td>${new Date(h.fecha_apertura).toLocaleString('es-PY')}</td>
        <td>${h.fecha_cierre ? new Date(h.fecha_cierre).toLocaleString('es-PY') : '-'}</td>
        <td class="text-end">${API.formatGs(h.monto_apertura)}</td>
        <td class="text-end">${API.formatGs(h.monto_sistema)}</td>
        <td class="text-end fw-bold">${API.formatGs(h.monto_cierre_efectivo)}</td>
        <td class="text-end fw-bold ${h.diferencia === 0 ? 'text-primary' : (h.diferencia > 0 ? 'text-success' : 'text-danger')}">
          ${h.diferencia > 0 ? '+' : ''}${API.formatGs(h.diferencia)}
        </td>
        <td class="text-end text-success fw-bold">${API.formatGs(h.recaudacion_depositar)}</td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-primary py-0" onclick="verComprobanteCierre(${h.id})" title="Imprimir Acta">
            <i class="fa-solid fa-print"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error al cargar historial de cajas:', err);
  }
}

async function verComprobanteCierre(sesionId) {
  try {
    const res = await API.get(`/caja/sesion/${sesionId}`);
    if (!res.success) return;
    const { sesion, ventas, movimientos, cobros } = res;

    const html = `
      <div class="ticket-print border p-4 bg-white" style="font-family: monospace; font-size: 13px;">
        <div class="text-center border-bottom pb-3 mb-3">
          <h5 class="fw-bold mb-1">PANADERÍA Y CONFITERÍA CAPIATÁ</h5>
          <small class="text-muted d-block">ACTA OFICIAL DE CIERRE DE CAJA Y ARQUEO</small>
          <small class="text-muted d-block">Punto de Expedición: ${sesion.punto_expedicion} | Estab: ${sesion.establecimiento}</small>
        </div>

        <div class="mb-3 small">
          <div><strong>Sesión Nº:</strong> #${sesion.id} - ${sesion.caja_nombre}</div>
          <div><strong>Cajero Responsable:</strong> ${sesion.cajero_nombre}</div>
          <div><strong>Fecha Apertura:</strong> ${new Date(sesion.fecha_apertura).toLocaleString('es-PY')}</div>
          <div><strong>Fecha Cierre:</strong> ${sesion.fecha_cierre ? new Date(sesion.fecha_cierre).toLocaleString('es-PY') : '-'}</div>
        </div>

        <div class="border-top border-bottom py-2 my-2">
          <strong>DESGLOSE DE INGRESOS Y OPERACIONES:</strong>
          <div class="d-flex justify-content-between mt-1">
            <span>(+) Fondo Inicial de Caja:</span>
            <strong>${API.formatGs(sesion.monto_apertura)}</strong>
          </div>
          ${ventas.map(v => `
            <div class="d-flex justify-content-between">
              <span>(+) Ventas (${v.metodo_pago.toUpperCase()} - ${v.cantidad} op):</span>
              <strong>${API.formatGs(v.total)}</strong>
            </div>
          `).join('')}
          <div class="d-flex justify-content-between">
            <span>(+) Cobros de Créditos Recibidos:</span>
            <strong>${API.formatGs(cobros.reduce((acc, c) => acc + c.monto_total, 0))}</strong>
          </div>
          <div class="d-flex justify-content-between">
            <span>(+) Ingresos Extraordinarios:</span>
            <strong>${API.formatGs(movimientos.filter(m => m.tipo_movimiento === 'ingreso').reduce((acc, m) => acc + m.monto, 0))}</strong>
          </div>
          <div class="d-flex justify-content-between">
            <span>(-) Egresos / Retiros de Caja:</span>
            <strong>${API.formatGs(movimientos.filter(m => m.tipo_movimiento === 'egreso').reduce((acc, m) => acc + m.monto, 0))}</strong>
          </div>
        </div>

        <div class="py-2">
          <div class="d-flex justify-content-between">
            <span>TOTAL ESPERADO EN SISTEMA:</span>
            <strong>${API.formatGs(sesion.monto_sistema)}</strong>
          </div>
          <div class="d-flex justify-content-between fs-6 fw-bold">
            <span>TOTAL FÍSICO ARQUEADO:</span>
            <span class="text-primary">${API.formatGs(sesion.monto_cierre_efectivo)}</span>
          </div>
          <div class="d-flex justify-content-between fw-bold ${sesion.diferencia === 0 ? 'text-primary' : (sesion.diferencia > 0 ? 'text-success' : 'text-danger')}">
            <span>DIFERENCIA (FALTANTE/SOBRANTE):</span>
            <span>${sesion.diferencia > 0 ? '+' : ''}${API.formatGs(sesion.diferencia)}</span>
          </div>
          <div class="d-flex justify-content-between fw-bold text-success border-top pt-2 mt-2 fs-6">
            <span>RECAUDACIÓN A DEPOSITAR:</span>
            <span>${API.formatGs(sesion.recaudacion_depositar)}</span>
          </div>
        </div>

        ${sesion.observaciones ? `<div class="mt-2 small text-muted"><strong>Obs:</strong> ${sesion.observaciones}</div>` : ''}

        <div class="row text-center mt-5 pt-4">
          <div class="col-6">
            <div class="border-top pt-1 small">Firma Cajero</div>
          </div>
          <div class="col-6">
            <div class="border-top pt-1 small">Firma Tesorería / Admin</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalComprobanteCierreBody').innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('modalComprobanteCierre'));
    modal.show();
  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar el acta de cierre', 'error');
  }
}

// --------------------------------------------------------------------------
// 13. CARTERA DE CUENTAS POR COBRAR Y COBRANZAS
// --------------------------------------------------------------------------
async function cargarCreditos() {
  try {
    const estado = document.getElementById('filtroCreditoEstado') ? document.getElementById('filtroCreditoEstado').value : '';
    
    // Cargar KPIs
    const resResumen = await API.get('/creditos/resumen');
    if (resResumen.success) {
      const r = resResumen.resumen;
      if (document.getElementById('kpiCreditoPendiente')) document.getElementById('kpiCreditoPendiente').textContent = API.formatGs(r.total_pendiente);
      if (document.getElementById('kpiCreditoVencido')) document.getElementById('kpiCreditoVencido').textContent = API.formatGs(r.total_vencido);
      if (document.getElementById('kpiCreditoCobradoMes')) document.getElementById('kpiCreditoCobradoMes').textContent = API.formatGs(r.total_cobrado_mes);
      if (document.getElementById('kpiCreditoMorosos')) document.getElementById('kpiCreditoMorosos').textContent = `${r.clientes_morosos} clientes en mora`;
    }

    // Cargar Lista
    const resCuentas = await API.get('/creditos', { estado });
    const tbody = document.getElementById('tablaCreditos');
    if (!tbody) return;

    if (!resCuentas.success || !resCuentas.cuentas.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="text-center text-muted py-4">
            <i class="fa-solid fa-hand-holding-dollar fa-2x mb-2 text-secondary opacity-50"></i>
            <p class="mb-0">No se encontraron cuentas por cobrar con el filtro seleccionado.</p>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = resCuentas.cuentas.map(c => {
      let badgeEstado = '';
      if (c.estado_calculado === 'vencida') {
        badgeEstado = `<span class="badge bg-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i> Vencida (+${c.dias_atraso}d)</span>`;
      } else if (c.estado === 'parcial') {
        badgeEstado = '<span class="badge bg-warning text-dark"><i class="fa-solid fa-hourglass-half me-1"></i> Pago Parcial</span>';
      } else if (c.estado === 'pagada') {
        badgeEstado = '<span class="badge bg-success"><i class="fa-solid fa-check me-1"></i> Pagada</span>';
      } else {
        badgeEstado = '<span class="badge bg-primary">Pendiente</span>';
      }

      return `
        <tr>
          <td class="fw-bold">${c.venta_comprobante}</td>
          <td>
            <strong>${c.cliente_nombre}</strong><br>
            <small class="text-muted">RUC/CI: ${c.cliente_ruc}</small>
          </td>
          <td><small class="text-muted">${c.cliente_telefono || '-'}</small></td>
          <td class="text-center"><span class="badge bg-secondary">${c.numero_cuota} / ${c.total_cuotas}</span></td>
          <td>${new Date(c.fecha_vencimiento).toLocaleDateString('es-PY')}</td>
          <td>${badgeEstado}</td>
          <td class="text-end">${API.formatGs(c.monto_cuota)}</td>
          <td class="text-end fw-bold ${c.saldo_pendiente > 0 ? (c.estado_calculado === 'vencida' ? 'text-danger' : 'text-primary') : 'text-muted'}">
            ${API.formatGs(c.saldo_pendiente)}
          </td>
          <td class="text-center">
            ${c.saldo_pendiente > 0 ? `
              <button class="btn btn-sm btn-success py-0 fw-semibold" onclick="abrirModalCobro(${c.id}, ${c.cliente_id}, '${c.cliente_nombre.replace(/'/g, "\\'")}', '${c.venta_comprobante}', ${c.saldo_pendiente})">
                <i class="fa-solid fa-hand-holding-dollar me-1"></i> Cobrar
              </button>
            ` : `
              <span class="text-success small fw-semibold"><i class="fa-solid fa-circle-check"></i> Cancelado</span>
            `}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error al cargar creditos:', err);
  }
}

function abrirModalCobro(cuentaId, clienteId, clienteNombre, ventaComp, saldo) {
  document.getElementById('cobroCuentaId').value = cuentaId;
  document.getElementById('cobroClienteId').value = clienteId;
  document.getElementById('cobroClienteNombre').textContent = clienteNombre;
  document.getElementById('cobroVentaComprobante').textContent = ventaComp;
  document.getElementById('cobroSaldoPendiente').textContent = API.formatGs(saldo);
  document.getElementById('cobroMonto').value = saldo;
  document.getElementById('cobroMonto').max = saldo;
  document.getElementById('cobroForma').value = 'efectivo';
  document.getElementById('cobroObs').value = '';

  const modal = new bootstrap.Modal(document.getElementById('modalCobroCredito'));
  modal.show();
}

async function guardarCobroCredito(e) {
  e.preventDefault();
  const cuentaId = parseInt(document.getElementById('cobroCuentaId').value);
  const clienteId = parseInt(document.getElementById('cobroClienteId').value);
  const monto = parseFloat(document.getElementById('cobroMonto').value) || 0;
  const forma = document.getElementById('cobroForma').value;
  const obs = document.getElementById('cobroObs').value;

  try {
    const res = await API.post('/creditos/cobrar', {
      cliente_id: clienteId,
      monto_total: monto,
      forma_cobro: forma,
      observaciones: obs,
      cuotas: [
        { cuenta_cobrar_id: cuentaId, monto_aplicado: monto }
      ]
    });

    if (res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalCobroCredito')).hide();
      Swal.fire({
        icon: 'success',
        title: 'Cobro Registrado',
        text: `Se emitió el Recibo Oficial ${res.numeroRecibo} por ${API.formatGs(res.montoTotal)}`,
        showCancelButton: true,
        confirmButtonText: 'Imprimir Recibo',
        cancelButtonText: 'Aceptar'
      }).then((result) => {
        if (result.isConfirmed) {
          verReciboOficial(res.cobroId);
        }
      });
      cargarCreditos();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

async function verReciboOficial(cobroId) {
  try {
    const res = await API.get(`/creditos/recibo/${cobroId}`);
    if (!res.success) return;
    const { recibo, detalles } = res;

    const buildCopia = (tipoCopia) => `
      <div class="border p-3 rounded mb-3 bg-white" style="font-family: monospace; font-size: 13px;">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
          <div>
            <h6 class="fw-bold mb-0">PANADERÍA Y CONFITERÍA CAPIATÁ</h6>
            <small class="text-muted">RUC: 80012345-6 | Capiatá - Paraguay</small>
          </div>
          <div class="text-end">
            <span class="badge bg-secondary mb-1">${tipoCopia}</span>
            <div class="fw-bold fs-6 text-danger">${recibo.numero_recibo}</div>
          </div>
        </div>

        <div class="row g-2 mb-2 small">
          <div class="col-8">
            <strong>Recibimos de:</strong> ${recibo.cliente_nombre}<br>
            <strong>RUC / CI:</strong> ${recibo.cliente_ruc} | <strong>Tel:</strong> ${recibo.cliente_telefono || '-'}
          </div>
          <div class="col-4 text-end">
            <strong>Fecha:</strong> ${new Date(recibo.fecha_cobro).toLocaleDateString('es-PY')}<br>
            <strong>Cajero:</strong> ${recibo.cajero_nombre}
          </div>
        </div>

        <div class="border-top border-bottom py-2 my-2">
          <table class="w-100 small">
            <thead>
              <tr class="border-bottom">
                <th>Comprobante</th>
                <th>Cuota</th>
                <th class="text-end">Monto Aplicado</th>
              </tr>
            </thead>
            <tbody>
              ${detalles.map(d => `
                <tr>
                  <td>${d.venta_comprobante}</td>
                  <td>Cuota ${d.numero_cuota} de ${d.total_cuotas}</td>
                  <td class="text-end fw-bold">${API.formatGs(d.monto_aplicado)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="d-flex justify-content-between align-items-center mt-2">
          <div>
            <small><strong>Forma de Cobro:</strong> ${recibo.forma_cobro.toUpperCase()}</small><br>
            ${recibo.observaciones ? `<small class="text-muted"><strong>Obs:</strong> ${recibo.observaciones}</small>` : ''}
          </div>
          <div class="text-end">
            <span class="text-muted small">TOTAL RECIBIDO:</span>
            <div class="fw-bold fs-5 text-success">${API.formatGs(recibo.monto_total)}</div>
          </div>
        </div>

        <div class="row text-center mt-4 pt-3">
          <div class="col-6">
            <div class="border-top pt-1 small">Firma del Cliente</div>
          </div>
          <div class="col-6">
            <div class="border-top pt-1 small">Firma y Sello Cobrador</div>
          </div>
        </div>
      </div>
    `;

    const html = `
      <div class="ticket-print">
        ${buildCopia('ORIGINAL')}
        <div class="text-center my-2 text-muted small"> - - - - - - - - - - - - - - - - - - - Cortar aquí - - - - - - - - - - - - - - - - - - - </div>
        ${buildCopia('DUPLICADO')}
      </div>
    `;

    document.getElementById('modalReciboOficialBody').innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('modalReciboOficial'));
    modal.show();
  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar el recibo oficial', 'error');
  }
}

// --------------------------------------------------------------------------
// 14. GESTIÓN DE PEDIDOS INTERNOS DE COMPRAS
// --------------------------------------------------------------------------
async function cargarPedidosCompras() {
  try {
    const res = await API.get('/compras/pedidos');
    const tbody = document.getElementById('tablaPedidosCompras');
    if (!tbody) return;

    if (!res.success || !res.pedidos.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay pedidos internos de compras registrados</td></tr>';
      return;
    }

    tbody.innerHTML = res.pedidos.map(p => {
      let badgePrioridad = 'bg-secondary';
      if (p.prioridad === 'alta') badgePrioridad = 'bg-warning text-dark';
      if (p.prioridad === 'urgente') badgePrioridad = 'bg-danger';

      let badgeEstado = 'bg-primary';
      if (p.estado === 'aprobado') badgeEstado = 'bg-success';
      if (p.estado === 'rechazado') badgeEstado = 'bg-danger';
      if (p.estado === 'procesado') badgeEstado = 'bg-info text-dark';

      return `
        <tr>
          <td><strong>${p.numero_pedido}</strong></td>
          <td>${p.fecha_pedido}</td>
          <td>${p.fecha_requerida || '-'}</td>
          <td>${p.usuario_nombre}</td>
          <td><span class="badge ${badgePrioridad}">${p.prioridad.toUpperCase()}</span></td>
          <td><span class="badge ${badgeEstado}">${p.estado.toUpperCase()}</span></td>
          <td class="text-center"><span class="badge bg-light text-dark border">${p.total_items} ítems</span></td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary py-0" onclick="verComprobantePedidoCompra(${p.id})" title="Imprimir Pedido">
              <i class="fa-solid fa-print"></i>
            </button>
            ${p.estado === 'pendiente' ? `
              <button class="btn btn-sm btn-outline-success py-0 ms-1" onclick="cambiarEstadoPedido(${p.id}, 'aprobado')" title="Aprobar Solicitud">
                <i class="fa-solid fa-check"></i>
              </button>
            ` : ''}
            ${p.estado === 'aprobado' ? `
              <button class="btn btn-sm btn-success py-0 ms-1" onclick="generarOrdenDesdePedido(${p.id})" title="Generar Orden de Compra">
                <i class="fa-solid fa-truck-ramp-box me-1"></i> Orden
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error cargando pedidos compras:', err);
  }
}

async function cambiarEstadoPedido(pedidoId, nuevoEstado) {
  try {
    const res = await API.put(`/compras/pedidos/${pedidoId}/estado`, { estado: nuevoEstado });
    if (res.success) {
      Swal.fire('Actualizado', res.message, 'success');
      cargarPedidosCompras();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function abrirModalNuevoPedidoCompra() {
  document.getElementById('pedFechaPedido').value = new Date().toISOString().split('T')[0];
  document.getElementById('pedFechaRequerida').value = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  document.getElementById('pedPrioridad').value = 'normal';
  document.getElementById('pedObservaciones').value = '';
  document.getElementById('contenedorItemsPedidoCompra').innerHTML = '';
  agregarFilaPedidoCompra();
  const modal = new bootstrap.Modal(document.getElementById('modalNuevoPedidoCompra'));
  modal.show();
}

function agregarFilaPedidoCompra(productoId = '', cantidad = 1) {
  const cont = document.getElementById('contenedorItemsPedidoCompra');
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 fila-item-pedido';

  const prods = productosGlobal.filter(p => p.tipo === 'materia_prima');
  div.innerHTML = `
    <div class="col-6">
      <select class="form-select form-select-sm ped-prod-id" required>
        <option value="">-- Seleccionar Insumo --</option>
        ${prods.map(p => `
          <option value="${p.id}" ${p.id == productoId ? 'selected' : ''}>${p.nombre} (${p.codigo}) - Disp: ${p.stock_total || 0}</option>
        `).join('')}
      </select>
    </div>
    <div class="col-3">
      <input type="number" class="form-control form-control-sm ped-cantidad" min="0.1" step="0.1" value="${cantidad}" required placeholder="Cantidad">
    </div>
    <div class="col-2">
      <input type="text" class="form-control form-control-sm ped-obs" placeholder="Nota/Uso">
    </div>
    <div class="col-1 text-end">
      <button type="button" class="btn btn-sm btn-outline-danger py-0 border-0" onclick="this.closest('.fila-item-pedido').remove()">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;
  cont.appendChild(div);
}

async function guardarNuevoPedidoCompra(e) {
  e.preventDefault();
  const filas = document.querySelectorAll('.fila-item-pedido');
  const items = [];
  filas.forEach(f => {
    const prodId = f.querySelector('.ped-prod-id').value;
    const cant = parseFloat(f.querySelector('.ped-cantidad').value) || 0;
    const obs = f.querySelector('.ped-obs').value;
    if (prodId && cant > 0) {
      items.push({ producto_id: parseInt(prodId), cantidad_solicitada: cant, observaciones: obs });
    }
  });

  if (!items.length) {
    Swal.fire('Atención', 'Debe agregar al menos un insumo con cantidad válida', 'warning');
    return;
  }

  try {
    const res = await API.post('/compras/pedidos', {
      fecha_pedido: document.getElementById('pedFechaPedido').value,
      fecha_requerida: document.getElementById('pedFechaRequerida').value,
      prioridad: document.getElementById('pedPrioridad').value,
      observaciones: document.getElementById('pedObservaciones').value,
      items
    });

    if (res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalNuevoPedidoCompra')).hide();
      Swal.fire({
        icon: 'success',
        title: 'Pedido Registrado',
        text: `Solicitud ${res.numeroPedido} emitida correctamente.`,
        showCancelButton: true,
        confirmButtonText: 'Imprimir Solicitud',
        cancelButtonText: 'Cerrar'
      }).then(result => {
        if (result.isConfirmed) {
          verComprobantePedidoCompra(res.pedidoId);
        }
      });
      cargarPedidosCompras();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

async function verComprobantePedidoCompra(id) {
  try {
    const res = await API.get(`/compras/pedidos/${id}`);
    if (!res.success) return;
    const { pedido, detalles } = res;

    const html = `
      <div class="border p-4 bg-white" style="font-family: monospace; font-size: 13px;">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
          <div>
            <h5 class="fw-bold mb-0">PANADERÍA Y CONFITERÍA CAPIATÁ</h5>
            <small class="text-muted">SOLICITUD INTERNA DE COMPRA DE MATERIAS PRIMAS</small>
          </div>
          <div class="text-end">
            <span class="badge bg-warning text-dark mb-1">PEDIDO INTERNO</span>
            <div class="fw-bold fs-5 text-dark">${pedido.numero_pedido}</div>
          </div>
        </div>

        <div class="row g-2 mb-3 small">
          <div class="col-6">
            <strong>Solicitante:</strong> ${pedido.usuario_nombre}<br>
            <strong>Fecha Emisión:</strong> ${pedido.fecha_pedido}<br>
            <strong>Fecha Requerida:</strong> ${pedido.fecha_requerida || 'Inmediata'}
          </div>
          <div class="col-6 text-end">
            <strong>Prioridad:</strong> <span class="badge bg-secondary">${pedido.prioridad.toUpperCase()}</span><br>
            <strong>Estado:</strong> <span class="badge bg-primary">${pedido.estado.toUpperCase()}</span>
          </div>
        </div>

        <table class="w-100 table table-sm table-bordered small mb-3">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Código</th>
              <th>Insumo / Materia Prima</th>
              <th class="text-end">Cantidad Requerida</th>
              <th>Observación / Uso</th>
            </tr>
          </thead>
          <tbody>
            ${detalles.map((d, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><code>${d.producto_codigo}</code></td>
                <td><strong>${d.producto_nombre}</strong></td>
                <td class="text-end fw-bold">${d.cantidad_solicitada} ${d.unidad_simbolo || ''}</td>
                <td>${d.observaciones || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${pedido.observaciones ? `<div class="mb-3 small"><strong>Justificación:</strong> ${pedido.observaciones}</div>` : ''}

        <div class="row text-center mt-5 pt-3">
          <div class="col-6">
            <div class="border-top pt-1 small">Firma Solicitante / Panadería</div>
          </div>
          <div class="col-6">
            <div class="border-top pt-1 small">Autorización de Compras / Admin</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalComprobantePedidoBody').innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('modalComprobantePedidoCompra'));
    modal.show();
  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar el pedido de compra', 'error');
  }
}

// --------------------------------------------------------------------------
// 15. GESTIÓN DE ÓRDENES DE COMPRA AL PROVEEDOR
// --------------------------------------------------------------------------
async function cargarOrdenesCompras() {
  try {
    const res = await API.get('/compras/ordenes');
    const tbody = document.getElementById('tablaOrdenesCompras');
    if (!tbody) return;

    if (!res.success || !res.ordenes.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay órdenes de compra emitidas</td></tr>';
      return;
    }

    tbody.innerHTML = res.ordenes.map(oc => {
      let badgeEstado = 'bg-primary';
      if (oc.estado === 'recibida') badgeEstado = 'bg-success';
      if (oc.estado === 'cancelada') badgeEstado = 'bg-danger';

      return `
        <tr>
          <td><strong>${oc.numero_orden}</strong></td>
          <td>${oc.fecha_orden}</td>
          <td>
            <strong>${oc.proveedor_nombre}</strong><br>
            <small class="text-muted">RUC: ${oc.proveedor_ruc}</small>
          </td>
          <td>${oc.fecha_entrega_esperada || '-'}</td>
          <td><span class="badge bg-light text-dark border">${oc.condicion_pago}</span></td>
          <td class="text-end fw-bold text-success">${API.formatGs(oc.total)}</td>
          <td><span class="badge ${badgeEstado}">${oc.estado.toUpperCase()}</span></td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-primary py-0" onclick="verComprobanteOrdenCompra(${oc.id})" title="Imprimir Orden">
              <i class="fa-solid fa-print"></i>
            </button>
            ${oc.estado === 'emitida' ? `
              <button class="btn btn-sm btn-success py-0 ms-1" onclick="recepcionarOrdenEnFactura(${oc.id})" title="Recepcionar / Cargar Factura">
                <i class="fa-solid fa-cart-flatbed me-1"></i> Facturar
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error cargando órdenes de compra:', err);
  }
}

async function abrirModalNuevaOrdenCompra() {
  document.getElementById('ocPedidoOrigenId').value = '';
  document.getElementById('ocFechaOrden').value = new Date().toISOString().split('T')[0];
  document.getElementById('ocFechaEntrega').value = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  document.getElementById('ocCondicionPago').value = 'contado';
  document.getElementById('ocObservaciones').value = '';
  document.getElementById('contenedorItemsOrdenCompra').innerHTML = '';

  const resProv = await API.get('/compras/proveedores');
  const selectProv = document.getElementById('ocProveedorId');
  if (resProv.success && resProv.proveedores) {
    selectProv.innerHTML = '<option value="">-- Seleccionar Proveedor --</option>' + resProv.proveedores.map(p => `
      <option value="${p.id}">${p.razon_social} (RUC: ${p.ruc})</option>
    `).join('');
  }

  agregarFilaOrdenCompra();
  const modal = new bootstrap.Modal(document.getElementById('modalNuevaOrdenCompra'));
  modal.show();
}

async function generarOrdenDesdePedido(pedidoId) {
  try {
    const res = await API.get(`/compras/pedidos/${pedidoId}`);
    if (!res.success) return;
    const { pedido, detalles } = res;

    await abrirModalNuevaOrdenCompra();
    document.getElementById('ocPedidoOrigenId').value = pedido.id;
    document.getElementById('ocObservaciones').value = `Generada a partir del ${pedido.numero_pedido}: ${pedido.observaciones || ''}`;

    const cont = document.getElementById('contenedorItemsOrdenCompra');
    cont.innerHTML = '';

    for (const d of detalles) {
      const prod = productosGlobal.find(p => p.id == d.producto_id);
      const precioEstimado = prod ? (prod.precio_costo || 0) : 0;
      agregarFilaOrdenCompra(d.producto_id, d.cantidad_solicitada, precioEstimado);
    }
  } catch (err) {
    Swal.fire('Error', 'No se pudo precargar la información del pedido', 'error');
  }
}

function agregarFilaOrdenCompra(productoId = '', cantidad = 1, precioUnitario = 0) {
  const cont = document.getElementById('contenedorItemsOrdenCompra');
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 fila-item-orden';

  const prods = productosGlobal.filter(p => p.tipo === 'materia_prima');
  div.innerHTML = `
    <div class="col-5">
      <select class="form-select form-select-sm oc-prod-id" required onchange="actualizarPrecioCostoFilaOrden(this)">
        <option value="">-- Seleccionar Insumo --</option>
        ${prods.map(p => `
          <option value="${p.id}" data-costo="${p.precio_costo || 0}" ${p.id == productoId ? 'selected' : ''}>${p.nombre} (${p.codigo})</option>
        `).join('')}
      </select>
    </div>
    <div class="col-2">
      <input type="number" class="form-control form-control-sm oc-cantidad" min="0.1" step="0.1" value="${cantidad}" required placeholder="Cant." oninput="calcularTotalOrdenCompra()">
    </div>
    <div class="col-3">
      <input type="number" class="form-control form-control-sm oc-precio" min="0" step="500" value="${precioUnitario}" required placeholder="Precio Acordado" oninput="calcularTotalOrdenCompra()">
    </div>
    <div class="col-2 text-end d-flex align-items-center justify-content-end gap-1">
      <span class="small fw-bold oc-subtotal-txt">0 ₲</span>
      <button type="button" class="btn btn-sm btn-outline-danger py-0 border-0" onclick="this.closest('.fila-item-orden').remove(); calcularTotalOrdenCompra();">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;
  cont.appendChild(div);
  calcularTotalOrdenCompra();
}

function actualizarPrecioCostoFilaOrden(selectElem) {
  const selected = selectElem.options[selectElem.selectedIndex];
  const costo = selected.getAttribute('data-costo') || 0;
  const fila = selectElem.closest('.fila-item-orden');
  fila.querySelector('.oc-precio').value = costo;
  calcularTotalOrdenCompra();
}

function calcularTotalOrdenCompra() {
  const filas = document.querySelectorAll('.fila-item-orden');
  let total = 0;
  filas.forEach(f => {
    const cant = parseFloat(f.querySelector('.oc-cantidad').value) || 0;
    const precio = parseFloat(f.querySelector('.oc-precio').value) || 0;
    const subtotal = cant * precio;
    total += subtotal;
    const subtxt = f.querySelector('.oc-subtotal-txt');
    if (subtxt) subtxt.textContent = API.formatGs(subtotal);
  });
  const totalTxt = document.getElementById('ocTotalTxt');
  if (totalTxt) totalTxt.textContent = API.formatGs(total);
}

async function guardarNuevaOrdenCompra(e) {
  e.preventDefault();
  const proveedorId = document.getElementById('ocProveedorId').value;
  const pedidoOrigenId = document.getElementById('ocPedidoOrigenId').value;
  const filas = document.querySelectorAll('.fila-item-orden');
  const items = [];

  filas.forEach(f => {
    const prodId = f.querySelector('.oc-prod-id').value;
    const cant = parseFloat(f.querySelector('.oc-cantidad').value) || 0;
    const precio = parseFloat(f.querySelector('.oc-precio').value) || 0;
    if (prodId && cant > 0) {
      items.push({ producto_id: parseInt(prodId), cantidad: cant, precio_unitario: precio });
    }
  });

  if (!items.length) {
    Swal.fire('Atención', 'Debe agregar al menos un ítem a la orden', 'warning');
    return;
  }

  try {
    const res = await API.post('/compras/ordenes', {
      proveedor_id: parseInt(proveedorId),
      pedido_compra_id: pedidoOrigenId ? parseInt(pedidoOrigenId) : null,
      fecha_orden: document.getElementById('ocFechaOrden').value,
      fecha_entrega_esperada: document.getElementById('ocFechaEntrega').value,
      condicion_pago: document.getElementById('ocCondicionPago').value,
      observaciones: document.getElementById('ocObservaciones').value,
      items
    });

    if (res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalNuevaOrdenCompra')).hide();
      Swal.fire({
        icon: 'success',
        title: 'Orden de Compra Emitida',
        text: `Orden ${res.numeroOrden} generada con éxito por ${API.formatGs(res.total)}.`,
        showCancelButton: true,
        confirmButtonText: 'Imprimir Orden',
        cancelButtonText: 'Cerrar'
      }).then(result => {
        if (result.isConfirmed) {
          verComprobanteOrdenCompra(res.ordenId);
        }
      });
      cargarOrdenesCompras();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

async function verComprobanteOrdenCompra(id) {
  try {
    const res = await API.get(`/compras/ordenes/${id}`);
    if (!res.success) return;
    const { orden, detalles } = res;

    const html = `
      <div class="border p-4 bg-white" style="font-family: monospace; font-size: 13px;">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
          <div>
            <h5 class="fw-bold mb-0">PANADERÍA Y CONFITERÍA CAPIATÁ</h5>
            <small class="text-muted">ORDEN OFICIAL DE COMPRA A PROVEEDORES</small><br>
            <small class="text-muted">RUC: 80012345-6 | Tel: 0228-634500 | Capiatá - Paraguay</small>
          </div>
          <div class="text-end">
            <span class="badge bg-success mb-1">ORDEN DE COMPRA</span>
            <div class="fw-bold fs-5 text-success">${orden.numero_orden}</div>
          </div>
        </div>

        <div class="row g-2 mb-3 small">
          <div class="col-7">
            <strong>SEÑOR(ES):</strong> ${orden.proveedor_nombre}<br>
            <strong>RUC:</strong> ${orden.proveedor_ruc} | <strong>Tel:</strong> ${orden.proveedor_telefono || '-'}<br>
            <strong>Dirección:</strong> ${orden.proveedor_direccion || 'Capiatá'}
          </div>
          <div class="col-5 text-end">
            <strong>Fecha Emisión:</strong> ${orden.fecha_orden}<br>
            <strong>Entrega Esperada:</strong> ${orden.fecha_entrega_esperada || 'Inmediata'}<br>
            <strong>Condición:</strong> ${orden.condicion_pago.toUpperCase()}<br>
            <strong>Emitido por:</strong> ${orden.usuario_nombre}
          </div>
        </div>

        <table class="w-100 table table-sm table-bordered small mb-3">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Código</th>
              <th>Descripción del Insumo</th>
              <th class="text-end">Cantidad</th>
              <th class="text-end">Precio Acordado</th>
              <th class="text-end">Subtotal (₲)</th>
            </tr>
          </thead>
          <tbody>
            ${detalles.map((d, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><code>${d.producto_codigo}</code></td>
                <td><strong>${d.producto_nombre}</strong></td>
                <td class="text-end">${d.cantidad} ${d.unidad_simbolo || ''}</td>
                <td class="text-end">${API.formatGs(d.precio_unitario)}</td>
                <td class="text-end fw-bold">${API.formatGs(d.subtotal)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="table-light">
              <th colspan="5" class="text-end">TOTAL ORDEN DE COMPRA:</th>
              <th class="text-end fs-6 text-success">${API.formatGs(orden.total)}</th>
            </tr>
          </tfoot>
        </table>

        ${orden.observaciones ? `<div class="mb-3 small"><strong>Instrucciones de Entrega:</strong> ${orden.observaciones}</div>` : ''}

        <div class="row text-center mt-5 pt-3">
          <div class="col-6">
            <div class="border-top pt-1 small">Firma y Sello Panadería Capiatá</div>
          </div>
          <div class="col-6">
            <div class="border-top pt-1 small">Aceptación y Firma Proveedor</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalComprobanteOrdenBody').innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('modalComprobanteOrdenCompra'));
    modal.show();
  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar la orden de compra', 'error');
  }
}

async function recepcionarOrdenEnFactura(ordenId) {
  try {
    const res = await API.get(`/compras/ordenes/${ordenId}`);
    if (!res.success) return;
    const { orden, detalles } = res;

    // Cambiar a la pestaña de facturas y abrir modal de compra
    abrirModalNuevaCompra();

    document.getElementById('compraProveedor').value = orden.proveedor_id;
    document.getElementById('compraCondicion').value = orden.condicion_pago.includes('credito') ? 'credito' : 'contado';
    document.getElementById('compraObservaciones').value = `Recepción de Orden ${orden.numero_orden}`;

    const cont = document.getElementById('contenedorItemsCompra');
    cont.innerHTML = '';

    for (const d of detalles) {
      agregarFilaCompra(d.producto_id, d.cantidad, d.precio_unitario);
    }
  } catch (err) {
    Swal.fire('Error', 'No se pudo vincular la orden de compra', 'error');
  }
}

// --------------------------------------------------------------------------
// 16. GESTIÓN DE NOTAS DE CRÉDITO DE PROVEEDORES
// --------------------------------------------------------------------------
async function cargarNotasCreditoCompras() {
  try {
    const res = await API.get('/compras/notas-credito');
    const tbody = document.getElementById('tablaNotasCreditoCompras');
    if (!tbody) return;

    if (!res.success || !res.notas.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay notas de crédito registradas</td></tr>';
      return;
    }

    tbody.innerHTML = res.notas.map(nc => `
      <tr>
        <td><strong>${nc.numero_nota}</strong></td>
        <td><code>${nc.timbrado || '12345678'}</code></td>
        <td>${nc.fecha_emision}</td>
        <td><strong>${nc.proveedor_nombre}</strong></td>
        <td><span class="badge bg-light text-dark border">Fact. ${nc.factura_compra}</span></td>
        <td><span class="badge bg-secondary">${nc.motivo.replace(/_/g, ' ').toUpperCase()}</span></td>
        <td class="text-end fw-bold text-danger">${API.formatGs(nc.total)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-danger py-0" onclick="verComprobanteNotaCredito(${nc.id})" title="Imprimir Nota de Crédito">
            <i class="fa-solid fa-print"></i>
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando notas de crédito:', err);
  }
}

async function abrirModalNuevaNotaCredito() {
  try {
    const resCompras = await API.get('/compras');
    const select = document.getElementById('ncCompraId');
    if (resCompras.success && resCompras.compras) {
      select.innerHTML = '<option value="">-- Seleccionar Factura de Compra --</option>' + resCompras.compras.map(c => `
        <option value="${c.id}" data-prov-id="${c.proveedor_id}" data-prov-nombre="${c.proveedor_nombre}">
          Fact. ${c.numero_factura} - ${c.proveedor_nombre} (${c.fecha_compra})
        </option>
      `).join('');
    }

    document.getElementById('ncNumero').value = `NC-001-001-${Date.now().toString().slice(-6)}`;
    document.getElementById('ncTimbrado').value = '12345678';
    document.getElementById('ncFecha').value = new Date().toISOString().split('T')[0];
    document.getElementById('ncMotivo').value = 'devolucion_mercaderia';
    document.getElementById('ncObservaciones').value = '';
    document.getElementById('contenedorItemsNotaCredito').innerHTML = '';
    document.getElementById('ncTotalTxt').textContent = '0 ₲';

    const modal = new bootstrap.Modal(document.getElementById('modalNuevaNotaCredito'));
    modal.show();
  } catch (err) {
    Swal.fire('Error', 'No se pudieron cargar las compras existentes', 'error');
  }
}

async function cargarDetallesCompraParaNC() {
  const compraId = document.getElementById('ncCompraId').value;
  if (!compraId) return;

  try {
    const res = await API.get(`/compras/${compraId}`);
    if (!res.success) return;
    const { compra, detalles } = res;

    const cont = document.getElementById('contenedorItemsNotaCredito');
    cont.innerHTML = '';

    for (const d of detalles) {
      agregarFilaNotaCredito(d.producto_id, d.cantidad, d.precio_unitario);
    }
  } catch (err) {
    console.error('Error cargando detalles para NC:', err);
  }
}

function agregarFilaNotaCredito(productoId = '', cantidad = 1, precioUnitario = 0) {
  const cont = document.getElementById('contenedorItemsNotaCredito');
  const div = document.createElement('div');
  div.className = 'row g-2 align-items-center mb-2 fila-item-nc';

  const prods = productosGlobal.filter(p => p.tipo === 'materia_prima');
  div.innerHTML = `
    <div class="col-5">
      <select class="form-select form-select-sm nc-prod-id" required>
        <option value="">-- Insumo --</option>
        ${prods.map(p => `
          <option value="${p.id}" ${p.id == productoId ? 'selected' : ''}>${p.nombre} (${p.codigo})</option>
        `).join('')}
      </select>
    </div>
    <div class="col-2">
      <input type="number" class="form-control form-control-sm nc-cantidad" min="0.1" step="0.1" value="${cantidad}" required placeholder="Cant." oninput="calcularTotalNotaCredito()">
    </div>
    <div class="col-3">
      <input type="number" class="form-control form-control-sm nc-precio" min="0" step="500" value="${precioUnitario}" required placeholder="Precio" oninput="calcularTotalNotaCredito()">
    </div>
    <div class="col-2 text-end d-flex align-items-center justify-content-end gap-1">
      <span class="small fw-bold nc-subtotal-txt">0 ₲</span>
      <button type="button" class="btn btn-sm btn-outline-danger py-0 border-0" onclick="this.closest('.fila-item-nc').remove(); calcularTotalNotaCredito();">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;
  cont.appendChild(div);
  calcularTotalNotaCredito();
}

function calcularTotalNotaCredito() {
  const filas = document.querySelectorAll('.fila-item-nc');
  let total = 0;
  filas.forEach(f => {
    const cant = parseFloat(f.querySelector('.nc-cantidad').value) || 0;
    const precio = parseFloat(f.querySelector('.nc-precio').value) || 0;
    const subtotal = cant * precio;
    total += subtotal;
    const subtxt = f.querySelector('.nc-subtotal-txt');
    if (subtxt) subtxt.textContent = API.formatGs(subtotal);
  });
  const totalTxt = document.getElementById('ncTotalTxt');
  if (totalTxt) totalTxt.textContent = API.formatGs(total);
}

async function guardarNuevaNotaCredito(e) {
  e.preventDefault();
  const compraSelect = document.getElementById('ncCompraId');
  const compraId = compraSelect.value;
  const selectedOption = compraSelect.options[compraSelect.selectedIndex];
  const proveedorId = selectedOption.getAttribute('data-prov-id');

  const filas = document.querySelectorAll('.fila-item-nc');
  const items = [];
  filas.forEach(f => {
    const prodId = f.querySelector('.nc-prod-id').value;
    const cant = parseFloat(f.querySelector('.nc-cantidad').value) || 0;
    const precio = parseFloat(f.querySelector('.nc-precio').value) || 0;
    if (prodId && cant > 0) {
      items.push({ producto_id: parseInt(prodId), cantidad: cant, precio_unitario: precio });
    }
  });

  if (!items.length) {
    Swal.fire('Atención', 'Debe agregar al menos un ítem devuelto a la nota de crédito', 'warning');
    return;
  }

  try {
    const res = await API.post('/compras/notas-credito', {
      compra_id: parseInt(compraId),
      proveedor_id: parseInt(proveedorId),
      numero_nota: document.getElementById('ncNumero').value,
      timbrado: document.getElementById('ncTimbrado').value,
      fecha_emision: document.getElementById('ncFecha').value,
      motivo: document.getElementById('ncMotivo').value,
      observaciones: document.getElementById('ncObservaciones').value,
      items
    });

    if (res.success) {
      bootstrap.Modal.getInstance(document.getElementById('modalNuevaNotaCredito')).hide();
      Swal.fire({
        icon: 'success',
        title: 'Nota de Crédito Registrada',
        text: `Comprobante ${res.numeroNota} asentado. Se descontó el stock de insumos y se asentó en Kardex.`,
        showCancelButton: true,
        confirmButtonText: 'Imprimir Nota de Crédito',
        cancelButtonText: 'Cerrar'
      }).then(result => {
        if (result.isConfirmed) {
          verComprobanteNotaCredito(res.notaId);
        }
      });
      cargarNotasCreditoCompras();
      await cargarGlobalMetadata();
      await cargarProductos();
    }
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

async function verComprobanteNotaCredito(id) {
  try {
    const res = await API.get(`/compras/notas-credito/${id}`);
    if (!res.success) return;
    const { nota, detalles } = res;

    const html = `
      <div class="border p-4 bg-white" style="font-family: monospace; font-size: 13px;">
        <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3">
          <div>
            <h5 class="fw-bold mb-0">${nota.proveedor_nombre}</h5>
            <small class="text-muted">RUC: ${nota.proveedor_ruc} | Timbrado: ${nota.timbrado || '12345678'}</small><br>
            <small class="text-muted">NOTA DE CRÉDITO COMERCIAL / FISCAL</small>
          </div>
          <div class="text-end">
            <span class="badge bg-danger mb-1">NOTA DE CRÉDITO</span>
            <div class="fw-bold fs-5 text-danger">${nota.numero_nota}</div>
          </div>
        </div>

        <div class="row g-2 mb-3 small">
          <div class="col-7">
            <strong>CLIENTE:</strong> PANADERÍA Y CONFITERÍA CAPIATÁ<br>
            <strong>RUC:</strong> 80012345-6 | <strong>Dirección:</strong> Capiatá - Central<br>
            <strong>Factura Afectada:</strong> FACT-${nota.factura_compra} (Fecha: ${nota.fecha_compra})
          </div>
          <div class="col-5 text-end">
            <strong>Fecha Emisión:</strong> ${nota.fecha_emision}<br>
            <strong>Motivo:</strong> ${nota.motivo.replace(/_/g, ' ').toUpperCase()}<br>
            <strong>Operador:</strong> ${nota.usuario_nombre}
          </div>
        </div>

        <table class="w-100 table table-sm table-bordered small mb-3">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Código</th>
              <th>Descripción del Insumo</th>
              <th class="text-end">Cantidad</th>
              <th class="text-end">Precio Unitario</th>
              <th class="text-end">Total Devolución (₲)</th>
            </tr>
          </thead>
          <tbody>
            ${detalles.map((d, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><code>${d.producto_codigo}</code></td>
                <td><strong>${d.producto_nombre}</strong></td>
                <td class="text-end">${d.cantidad} ${d.unidad_simbolo || ''}</td>
                <td class="text-end">${API.formatGs(d.precio_unitario)}</td>
                <td class="text-end fw-bold text-danger">${API.formatGs(d.subtotal)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr class="table-light">
              <th colspan="5" class="text-end">TOTAL NOTA DE CRÉDITO A FAVOR:</th>
              <th class="text-end fs-6 text-danger">${API.formatGs(nota.total)}</th>
            </tr>
          </tfoot>
        </table>

        ${nota.observaciones ? `<div class="mb-3 small"><strong>Observaciones:</strong> ${nota.observaciones}</div>` : ''}

        <div class="row text-center mt-5 pt-3">
          <div class="col-6">
            <div class="border-top pt-1 small">Firma y Sello Proveedor Emisor</div>
          </div>
          <div class="col-6">
            <div class="border-top pt-1 small">Firma Recepción Panadería Capiatá</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalComprobanteNotaCreditoBody').innerHTML = html;
    const modal = new bootstrap.Modal(document.getElementById('modalComprobanteNotaCredito'));
    modal.show();
  } catch (err) {
    Swal.fire('Error', 'No se pudo cargar la nota de crédito', 'error');
  }
}
