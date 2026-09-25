// Main Application Controller
let chartVentasInstance = null;
let productosGlobal = [];
let categoriasGlobal = [];
let unidadesGlobal = [];
let depositosGlobal = [];
let posCart = [];

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
    const [resCat, resUn, resDep] = await Promise.all([
      API.get('/productos/meta/categorias'),
      API.get('/productos/meta/unidades'),
      API.get('/depositos')
    ]);

    categoriasGlobal = resCat.categorias || [];
    unidadesGlobal = resUn.unidades || [];
    depositosGlobal = resDep.depositos || [];
  } catch (err) {
    console.error('Error loading metadata:', err);
  }
}

// Navigation Router
function navigate(viewName) {
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
      tbodyVto.innerHTML = '<tr><td colspan="5" class="text-center text-success py-3"><i class="fa-solid fa-circle-check me-1"></i> No hay lotes próximos a vencer</td></tr>';
    } else {
      tbodyVto.innerHTML = lotesPorVencer.map(l => {
        const urgente = l.dias_restantes <= 5;
        return `
          <tr>
            <td><code>${l.codigo_lote}</code></td>
            <td class="fw-semibold">${l.nombre}</td>
            <td><small class="text-muted">${l.deposito}</small></td>
            <td>${l.fecha_vencimiento}</td>
            <td><span class="badge ${urgente ? 'bg-danger' : 'bg-warning text-dark'}">${l.dias_restantes <= 0 ? '¡VENCIDO!' : l.dias_restantes + ' días'}</span></td>
          </tr>
        `;
      }).join('');
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
          <span class="badge ${badgeCls}">${badgeTxt}</span>
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
            <table class="table table-sm small">
              <thead><tr><th>Lote</th><th>Depósito</th><th>Cantidad</th><th>Vencimiento</th></tr></thead>
              <tbody>
                ${lotes.map(l => `
                  <tr>
                    <td><code>${l.codigo_lote}</code></td>
                    <td>${l.deposito_nombre}</td>
                    <td class="fw-bold">${l.cantidad_actual}</td>
                    <td>${l.fecha_vencimiento}</td>
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
      tbodyHist.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No hay órdenes de producción registradas</td></tr>';
      return;
    }

    tbodyHist.innerHTML = ordenes.map(o => `
      <tr>
        <td><code>${o.codigo}</code></td>
        <td>${API.formatFecha(o.fecha_produccion)}</td>
        <td class="fw-bold">${o.receta_nombre}</td>
        <td><span class="badge bg-success-subtle text-success">${o.cantidad_obtenida} ${o.unidad_simbolo || ''}</span></td>
        <td>${API.formatGs(o.costo_total)}</td>
        <td><small class="text-muted">${o.usuario_nombre}</small></td>
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
  document.getElementById('prodRecetaId').value = recetaId;
  cargarDetalleInsumosProduccion();
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

    const prods = resProd.productos || [];
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
      <div class="pos-product-card" onclick="posAddToCart(${p.id})">
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
  const filtered = productosGlobal.filter(p => {
    if (p.tipo !== 'producto_terminado') return false;
    const matchCat = !catName || p.categoria_nombre === catName;
    const matchSearch = !search || p.nombre.toLowerCase().includes(search) || p.codigo.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });

  renderPOSProducts(filtered);
}

function posAddToCart(prodId) {
  const p = productosGlobal.find(item => item.id === prodId);
  if (!p) return;

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

async function posConfirmSale() {
  if (posCart.length === 0) {
    Swal.fire('Carrito Vacío', 'Agregue al menos un producto para registrar la venta', 'warning');
    return;
  }

  const mostradorDep = depositosGlobal.find(d => d.nombre.includes('Mostrador')) || depositosGlobal[0];
  const clienteId = document.getElementById('posClientSelect').value;
  const tipoComprobante = document.getElementById('posReceiptType').value;
  const metodoPago = document.getElementById('posPaymentMethod').value;
  const montoRecibido = parseFloat(document.getElementById('posMontoRecibido').value) || 0;

  try {
    const res = await API.post('/ventas', {
      cliente_id: clienteId,
      deposito_id: mostradorDep.id,
      tipo_comprobante: tipoComprobante,
      metodo_pago: metodoPago,
      monto_recibido: montoRecibido,
      items: posCart
    });

    if (res.success) {
      // Show Printable Ticket
      mostrarTicketModal(res.ventaId);
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
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">No hay facturas de compras registradas</td></tr>';
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
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary py-0" onclick="verDetalleCompra(${c.id})">
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

  // Periodic alert refresh every 30 seconds
  setInterval(async () => {
    if (API.getToken()) {
      try {
        const res = await API.get('/dashboard/stats');
        if (res.success) {
          actualizarNotificacionesDropdown(res.productosStockBajo, res.lotesPorVencer);
        }
      } catch (e) {
        // silent fail on background poll
      }
    }
  }, 30000);
}
