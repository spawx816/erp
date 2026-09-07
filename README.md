# Nexus ERP - Sistema de Gestión Comercial

Plataforma empresarial de gestión comercial, inventario, punto de venta (POS) y facturación fiscal para **Comercial Cambri SRL** con soporte multiempresa, multisucursal, kardex perpetuo, control de turnos de caja, cuentas por cobrar/pagar y cumplimiento fiscal para la República Dominicana (NCF: B01, B02, B04, B14, B15).

---

## 🚀 Arquitectura y Tecnologías

- **Backend**: Node.js, Express REST API v1, SQLite con WAL mode y Foreign Keys habilitadas (altamente transaccional con ACID garantizado), BCrypt, JWT.
- **Frontend**: React 19, Vite, Lucide Icons, diseño empresarial Slate & Sapphire con micro-animaciones y soporte para impresión térmica de 80mm.
- **Base de Datos**: Esquema relacional con más de 35 tablas, índices optimizados y tipos monetarios decimales.
- **Despliegue**: Docker, Dockerfile y Docker Compose con volúmenes persistentes.

---

## 👥 Usuarios Demo Preconfigurados

Todos los usuarios tienen la contraseña: **`Admin123!`**

| Usuario | Rol Asignado | Alcance & Permisos |
|---|---|---|
| **`admin`** | Super Administrador | Acceso total y sin restricciones a todos los módulos y auditoría |
| **`gerente`** | Gerente de Operaciones | Gestión operativa, reportes, autorización de descuentos y compras |
| **`cajero`** | Cajero Principal | Operación de POS, cobros, arqueo, apertura y cierre de caja |
| **`vendedor`** | Vendedora Comercial | Cotizaciones, pedidos, facturación con límite de descuento (10%) |
| **`almacen`** | Encargado de Almacén | Kardex, existencias, transferencias y recepción de mercancía |

> *Nota:* En la pantalla de inicio de sesión dispones de **botones de acceso rápido de 1-clic** para alternar instantáneamente entre cualquiera de estos roles.

---

## ⚙️ Ejecución Local

### 1. Iniciar el Backend (API REST en puerto 5000)
```bash
cd backend
npm install
node src/server.js
```
El backend inicializa automáticamente las migraciones DDL y los seeders empresariales ("Comercial Cambri SRL", 2 sucursales, 2 almacenes, series NCF B01/B02/B04 y catálogo con variantes).

### 2. Iniciar el Frontend (React en puerto 3000)
```bash
cd frontend
npm install
npm run dev
```
Abre en tu navegador: [http://localhost:3000](http://localhost:3000)

### 3. Ejecutar Pruebas Automatizadas
```bash
cd backend
node tests/integration.test.js
```

---

## 🐳 Despliegue con Docker

Para construir y levantar el sistema completo en contenedores:
```bash
docker-compose up --build -d
```
- Frontend accesible en: `http://localhost`
- Backend API accesible en: `http://localhost:5000`

---

## 🔄 Flujos de Negocio Implementados

1. **Venta en Punto de Venta (POS)**:
   - Lectura de código de barras o búsqueda en tiempo real.
   - Validación de stock en almacén seleccionado (bloqueo si no hay stock, salvo configuración de inventario negativo).
   - Control de límites de descuento del usuario con modal de autorización de supervisor.
   - Consumo atómico de secuencia NCF DGII (B01, B02, B14, etc.).
   - Descuento de stock en Kardex (`movement_type: 'sale'`).
   - Si es efectivo: valida sesión de caja abierta y registra movimiento.
   - Si es crédito: genera registro en Cuentas por Cobrar (CxC) con fecha de vencimiento a 30 días.
   - Previsualización e impresión de ticket térmico de 80mm con desglose de ITBIS (18%).

2. **Cierre de Caja & Arqueo**:
   - Comparación entre efectivo esperado según ventas/movimientos y efectivo contado físicamente por el cajero.
   - Si existe diferencia (descuadre), exige justificación obligatoria en las notas de cierre.

3. **Anulación de Factura / Nota de Crédito**:
   - Emite automáticamente una Nota de Crédito oficial con NCF **B04**.
   - Reintegra los productos al inventario físico en el Kardex (`movement_type: 'sale_return'`).
   - Reversa la cuenta por cobrar o el dinero en caja.

4. **Kardex Perpetuo**:
   - Cada movimiento de inventario (compra, venta, transferencia, ajuste) es inmutable y registra: almacén origen, almacén destino, cantidad previa, variación, cantidad nueva, costo unitario, usuario y documento de referencia.

5. **Copias de Seguridad**:
   - Creación de respaldos directos de la base de datos con un clic.
   - Ubicación: `backend/data/backups/`.
   - Procedimiento de restauración documentado en el módulo de configuración.
