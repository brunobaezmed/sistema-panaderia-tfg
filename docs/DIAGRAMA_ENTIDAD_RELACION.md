# Diagrama Entidad-Relación (DER)
## Sistema de Gestión para Panadería y Confitería
**Proyecto de Tesis - UNIGRAN**  
**Tesista:** Bruno Matías Báez Medina  
**Carrera:** Licenciatura en Análisis de Sistemas Informáticos  

---

## 1. Diagrama Entidad-Relación (Visual en Mermaid)

```mermaid
erDiagram

    %% ==========================================
    %% MÓDULO: SEGURIDAD Y ACCESO
    %% ==========================================
    ROLES {
        int id PK
        string nombre
        string descripcion
        int estado
        datetime created_at
    }

    USUARIOS {
        int id PK
        string username
        string password
        string nombre
        string apellido
        string email
        string telefono
        int rol_id FK
        int estado
        datetime ultimo_acceso
        datetime created_at
    }

    PERMISOS {
        int id PK
        string modulo
        string accion
        string descripcion
    }

    ROL_PERMISOS {
        int id PK
        int rol_id FK
        int permiso_id FK
    }

    AUDITORIA {
        int id PK
        int usuario_id FK
        string accion
        string tabla
        int registro_id
        text datos_anteriores
        text datos_nuevos
        string ip_address
        datetime created_at
    }

    %% ==========================================
    %% MÓDULO: INVENTARIO Y MATERIAS PRIMAS
    %% ==========================================
    CATEGORIAS {
        int id PK
        string nombre
        string descripcion
        int estado
        datetime created_at
    }

    PROVEEDORES {
        int id PK
        string razon_social
        string ruc
        string telefono
        string email
        string direccion
        string contacto_nombre
        int estado
        datetime created_at
    }

    INSUMOS {
        int id PK
        string codigo
        string nombre
        string descripcion
        string unidad_medida
        decimal stock_actual
        decimal stock_minimo
        decimal costo_unitario
        int proveedor_id FK
        int estado
        datetime created_at
    }

    %% ==========================================
    %% MÓDULO: PRODUCTOS Y RECETAS
    %% ==========================================
    PRODUCTOS {
        int id PK
        string codigo
        string nombre
        string descripcion
        int categoria_id FK
        decimal precio_costo
        decimal precio_venta
        decimal stock_actual
        decimal stock_minimo
        string unidad_medida
        string imagen
        int estado
        datetime created_at
    }

    RECETAS {
        int id PK
        int producto_id FK
        string nombre
        string descripcion
        decimal rendimiento
        string tiempo_preparacion
        int estado
        datetime created_at
    }

    RECETA_DETALLES {
        int id PK
        int receta_id FK
        int insumo_id FK
        decimal cantidad
        string unidad_medida
        decimal costo_calculado
    }

    %% ==========================================
    %% MÓDULO: PRODUCCIÓN
    %% ==========================================
    ORDENES_PRODUCCION {
        int id PK
        string numero_orden
        int producto_id FK
        int receta_id FK
        decimal cantidad_planificada
        decimal cantidad_producida
        string estado
        date fecha_inicio
        date fecha_fin
        int usuario_id FK
        text observaciones
        datetime created_at
    }

    DETALLE_PRODUCCION {
        int id PK
        int orden_produccion_id FK
        int insumo_id FK
        decimal cantidad_utilizada
        decimal costo_unitario
        decimal costo_total
    }

    %% ==========================================
    %% MÓDULO: CLIENTES Y CAJA
    %% ==========================================
    CLIENTES {
        int id PK
        string nombre
        string apellido
        string ruc_cedula
        string telefono
        string email
        string direccion
        int estado
        datetime created_at
    }

    CAJAS {
        int id PK
        string nombre
        string punto_expedicion
        string establecimiento
        int estado
        datetime created_at
    }

    SESIONES_CAJA {
        int id PK
        int caja_id FK
        int usuario_id FK
        datetime fecha_apertura
        datetime fecha_cierre
        decimal monto_apertura
        decimal monto_cierre
        decimal diferencia
        string estado
        text observaciones
    }

    MOVIMIENTOS_CAJA {
        int id PK
        int sesion_caja_id FK
        string tipo_movimiento
        decimal monto
        string concepto
        int usuario_id FK
        datetime created_at
    }

    %% ==========================================
    %% MÓDULO: VENTAS Y FACTURACIÓN
    %% ==========================================
    VENTAS {
        int id PK
        string numero_factura
        string timbrado
        datetime fecha_venta
        int cliente_id FK
        int usuario_id FK
        int sesion_caja_id FK
        string forma_pago
        string condicion_venta
        decimal subtotal_exenta
        decimal subtotal_iva5
        decimal subtotal_iva10
        decimal total_iva5
        decimal total_iva10
        decimal total_iva
        decimal total
        string estado
        datetime created_at
    }

    DETALLE_VENTAS {
        int id PK
        int venta_id FK
        int producto_id FK
        decimal cantidad
        decimal precio_unitario
        decimal porcentaje_iva
        decimal monto_iva
        decimal subtotal
    }

    %% ==========================================
    %% MÓDULO: COMPRAS
    %% ==========================================
    COMPRAS {
        int id PK
        string numero_factura
        string timbrado
        date fecha_compra
        int proveedor_id FK
        int usuario_id FK
        string condicion_compra
        decimal subtotal_exenta
        decimal subtotal_iva5
        decimal subtotal_iva10
        decimal total_iva
        decimal total
        string estado
        datetime created_at
    }

    DETALLE_COMPRAS {
        int id PK
        int compra_id FK
        int insumo_id FK
        decimal cantidad
        decimal precio_unitario
        decimal subtotal
    }

    %% ==========================================
    %% MÓDULO: PEDIDOS
    %% ==========================================
    PEDIDOS {
        int id PK
        string numero_pedido
        int cliente_id FK
        int usuario_id FK
        datetime fecha_pedido
        datetime fecha_entrega
        decimal total
        decimal saldo_pendiente
        string estado
        text observaciones
        datetime created_at
    }

    DETALLE_PEDIDOS {
        int id PK
        int pedido_id FK
        int producto_id FK
        decimal cantidad
        decimal precio_unitario
        decimal subtotal
    }

    %% ==========================================
    %% RELACIONES ENTRE TABLAS
    %% ==========================================

    %% Seguridad
    ROLES ||--o{ USUARIOS : "asigna a"
    ROLES ||--o{ ROL_PERMISOS : "contiene"
    PERMISOS ||--o{ ROL_PERMISOS : "se asocia en"
    USUARIOS ||--o{ AUDITORIA : "registra acciones"

    %% Inventario & Productos
    CATEGORIAS ||--o{ PRODUCTOS : "clasifica"
    PROVEEDORES ||--o{ INSUMOS : "suministra"

    %% Recetas
    PRODUCTOS ||--o{ RECETAS : "tiene fórmula"
    RECETAS ||--|{ RECETA_DETALLES : "se compone de"
    INSUMOS ||--o{ RECETA_DETALLES : "es ingrediente en"

    %% Producción
    PRODUCTOS ||--o{ ORDENES_PRODUCCION : "se elabora en"
    RECETAS ||--o{ ORDENES_PRODUCCION : "sigue fórmula"
    USUARIOS ||--o{ ORDENES_PRODUCCION : "supervisa"
    ORDENES_PRODUCCION ||--|{ DETALLE_PRODUCCION : "consume"
    INSUMOS ||--o{ DETALLE_PRODUCCION : "se gasta en"

    %% Caja
    CAJAS ||--o{ SESIONES_CAJA : "se abre en"
    USUARIOS ||--o{ SESIONES_CAJA : "opera"
    SESIONES_CAJA ||--o{ MOVIMIENTOS_CAJA : "registra movimientos"
    USUARIOS ||--o{ MOVIMIENTOS_CAJA : "autoriza"

    %% Ventas
    CLIENTES ||--o{ VENTAS : "compra"
    USUARIOS ||--o{ VENTAS : "factura"
    SESIONES_CAJA ||--o{ VENTAS : "cobra en"
    VENTAS ||--|{ DETALLE_VENTAS : "contiene items"
    PRODUCTOS ||--o{ DETALLE_VENTAS : "se vende en"

    %% Compras
    PROVEEDORES ||--o{ COMPRAS : "provee"
    USUARIOS ||--o{ COMPRAS : "registra compra"
    COMPRAS ||--|{ DETALLE_COMPRAS : "detalla items"
    INSUMOS ||--o{ DETALLE_COMPRAS : "se adquiere en"

    %% Pedidos
    CLIENTES ||--o{ PEDIDOS : "solicita"
    USUARIOS ||--o{ PEDIDOS : "toma pedido"
    PEDIDOS ||--|{ DETALLE_PEDIDOS : "incluye"
    PRODUCTOS ||--o{ DETALLE_PEDIDOS : "se encarga en"
```

---

## 2. Diccionario de Entidades del Sistema

| Módulo | Entidad | Descripción |
| :--- | :--- | :--- |
| **Seguridad** | `ROLES` | Define los perfiles de usuario (Administrador, Panadero, Cajero, etc.). |
| **Seguridad** | `USUARIOS` | Operadores y personal con credenciales de acceso al software. |
| **Seguridad** | `PERMISOS` | Catálogo de privilegios granulares por módulo. |
| **Seguridad** | `ROL_PERMISOS` | Tabla asociativa de privilegios por cada rol. |
| **Seguridad** | `AUDITORIA` | Registro de trazabilidad y cambios de cada tabla. |
| **Inventario** | `CATEGORIAS` | Clasificación de productos terminados. |
| **Inventario** | `PROVEEDORES` | Personas físicas y jurídicas proveedoras de materia prima. |
| **Inventario** | `INSUMOS` | Materias primas pesables y contables (harina, levadura, etc.). |
| **Productos** | `PRODUCTOS` | Productos elaborados listos para mostrador o venta. |
| **Recetas** | `RECETAS` | Ficha técnica de formulación por producto. |
| **Recetas** | `RECETA_DETALLES`| Relación insumo-cantidad necesaria para la receta. |
| **Producción** | `ORDENES_PRODUCCION`| Planificación y lote de horneado/elaboración. |
| **Producción** | `DETALLE_PRODUCCION`| Insumos reales descontados de stock durante el lote. |
| **Caja** | `CAJAS` | Puntos físicos y timbrado de facturación. |
| **Caja** | `SESIONES_CAJA` | Control de turno, arqueo, saldo inicial y cierre. |
| **Caja** | `MOVIMIENTOS_CAJA` | Entradas/salidas extraordinarias de dinero. |
| **Ventas** | `VENTAS` | Cabecera del comprobante fiscal o ticket con IVA discriminado. |
| **Ventas** | `DETALLE_VENTAS` | Renglones de venta y cálculo por tasa impositiva (10%, 5%, Exenta). |
| **Compras** | `COMPRAS` | Cabecera de factura de compra recibida del proveedor. |
| **Compras** | `DETALLE_COMPRAS`| Renglones de insumos comprados con actualización de stock y costo. |
| **Pedidos** | `PEDIDOS` | Encargos anticipados con seña y fecha programada de entrega. |
| **Pedidos** | `DETALLE_PEDIDOS` | Productos solicitados en el encargo. |
| **Clientes** | `CLIENTES` | Clientes registrados con RUC o Cédula para facturación. |
