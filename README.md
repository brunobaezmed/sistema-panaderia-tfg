# 🍞 Sistema de Gestión de Inventario para Panadería

**Trabajo Final de Grado (TFG) - Ingeniería en Informática**  
**Universidad Gran Asunción (UNIGRAN)** — Sede Central / Filial Capiatá, Paraguay (2026)

---

## 👨‍🎓 Autoría y Tutoría

- **Autor:** Bruno Matias Báez Medina
- **Tutora Metodológica:** Dra. Francisca Castillo
- **Tema:** *Sistema de Gestión de Inventario de una Panadería*
- **Título de la Investigación:** *Implementación de un Sistema de Gestión para Optimizar los Procesos de una Panadería en Capiatá*

---

## 📌 Descripción del Proyecto

Este sistema informático fue diseñado y desarrollado con base en la investigación y requerimientos del Trabajo Final de Grado. Automatiza el control integral de materias primas, productos panificados terminados, recetas de elaboración, compras con recepción por lotes, ventas en punto de venta (POS) con cálculo fiscal de IVA (Paraguay), transferencias internas entre depósitos, ajustes por mermas y auditoría continua mediante el libro **Kardex** en tiempo real.

---

## 🚀 Módulos Funcionales

1. **📊 Panel de Control (Dashboard en Tiempo Real):**
   - KPIs de existencias, valorización total del inventario en Guaraníes (₲).
   - Alertas automáticas de stock crítico por debajo del umbral mínimo.
   - Alertas preventivas de lotes próximos a caducar (≤ 15 días).
   - Gráfico dinámico de evolución de ventas y ranking de panificados con mayor rotación.

2. **📦 Catálogo de Productos y Materias Primas:**
   - Clasificación por tipo (*Materia Prima* / *Producto Terminado*) y categorías (Harinas, Levaduras, Grasas, Panes, Confitería, Especialidades Típicas como Chipa).
   - Control de precios de costo, precios de venta, márgenes y tipos de IVA (10%, 5%, Exento).
   - Trazabilidad de existencias por depósito físico y desglose de lotes activos.

3. **🧑‍🍳 Recetario y Formulación de Panadería:**
   - Estandarización de fórmulas (Pan Felipe, Pan Trincha, Chipa Tradicional Mestizo, Medialunas, etc.).
   - Cálculo del costo unitario estimado por insumo y por tanda.

4. **🔥 Módulo de Producción / Horneadas (Consumo Automático):**
   - Registro de órdenes de elaboración con multiplicador de tandas.
   - Validación y descuento automático de insumos en el depósito de producción.
   - Alta del producto terminado en el salón de ventas / mostrador con generación de nuevo lote y fecha de caducidad.
   - Registro instantáneo en el Kardex.

5. **🛒 Punto de Venta (POS Mostrador & Facturación):**
   - Interfaz ágil para despacho en mostrador con selección rápida de productos.
   - Carrito en tiempo real con cálculo de IVA 10% / IVA 5%, total y cálculo de vuelto en efectivo.
   - Emisión e impresión de Tickets / Facturas con datos fiscales y desglose.
   - Descuento de existencias bajo método FIFO (primero en entrar, primero en salir).

6. **🏢 Depósitos y Transferencias Internas:**
   - Depósito Central de Insumos, Sala de Producción (Cuadra) y Salón de Ventas.
   - Registro y validación de traslados entre áreas con trazabilidad.

7. **🚚 Gestión de Compras a Proveedores:**
   - Catálogo de proveedores con RUC.
   - Registro de facturas de compra con asignación de número de lote y fecha de vencimiento.

8. **⚖️ Ajustes de Inventario & Mermas:**
   - Registro de pérdidas, productos vencidos, roturas y conciliación de recuentos físicos.

9. **📜 Libro Mayor Kardex & Auditoría:**
   - Historial cronológico inmutable de cada movimiento (Entradas, Salidas, Producción, Ajustes, Saldos).
   - Filtros avanzados por fecha, depósito, producto y exportación a formato **CSV / Excel**.

10. **📈 Reportes Estadísticos:**
    - Inventario valorizado a costo y precio de venta estimado.
    - Resumen de recaudación por métodos de pago y producto.
    - Informe detallado de mermas y desperdicios.

11. **👥 Administración de Usuarios y Roles:**
    - Control de acceso basado en roles (*Administrador*, *Encargado de Depósito*, *Vendedor/Cajero*, *Maestro Panadero*).

---

## 🛠️ Stack Tecnológico

- **Backend:** Node.js (v20+ / v24+) con Express.js
- **Base de Datos:** SQLite3 relacional con foreign keys, migraciones automáticas y transacciones.
- **Seguridad:** Autenticación JWT (JSON Web Tokens) y contraseñas cifradas con `bcryptjs`.
- **Frontend:** SPA moderna con HTML5, CSS3, JavaScript (ES6+), Bootstrap 5, FontAwesome 6, SweetAlert2 y Chart.js.

---

## ⚙️ Instalación y Puesta en Marcha Local

### 1. Clonar o descargar el repositorio
```bash
git clone https://github.com/brunobaezmed/sistema-panaderia-tfg.git
cd sistema-panaderia-tfg
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Iniciar el servidor
```bash
npm start
```
> La base de datos `panaderia.db` y todos los datos iniciales de panadería paraguaya se crearán automáticamente.

### 4. Abrir en el navegador
Visitar: **`http://localhost:3000`**

---

## 🔑 Credenciales de Acceso Demostrativas

| Rol | Correo Electrónico | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `admin@panaderia.com` | `admin123` |
| **Depósito / Inventario** | `deposito@panaderia.com` | `deposito123` |
| **Ventas / Cajero** | `cajero@panaderia.com` | `cajero123` |
| **Producción / Panadero** | `produccion@panaderia.com` | `panadero123` |

---

   git push -u origin main
   ```

---

*Proyecto desarrollado como Trabajo Final de Grado para la obtención del título de Ingeniero en Informática — UNIGRAN.*
