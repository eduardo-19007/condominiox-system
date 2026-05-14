# CondominioX System

Sistema web para gestión de condominios con control de propietarios, recibos, gastos y pagos parciales.

---

# Características Principales

- Gestión de propietarios
- Dashboard administrativo
- Generación de recibos
- Pagos parciales
- Control de gastos
- Ranking de morosos
- Recuperación de contraseña
- Búsquedas optimizadas con estructuras de datos

---

# Roles del Sistema

## Administrador

El administrador puede:

- Gestionar propietarios
- Registrar gastos
- Generar recibos
- Visualizar estadísticas
- Configurar monto de administración
- Ver ranking de morosos

---

## Propietario

El propietario puede:

- Ver sus recibos
- Realizar pagos parciales
- Consultar saldo pendiente
- Editar correo y teléfono
- Cambiar contraseña

---

# Estructuras de Datos Implementadas

| Estructura | Uso |
|---|---|
| BST | Búsqueda de propietarios |
| AVL | Búsqueda de deuda |
| Cola de prioridad | Ranking de morosos |
| Pila | Historial de filtros |
| Hash Map | Filtros rápidos de gastos |

---

# Funcionalidades del Administrador

## Dashboard

Indicadores disponibles:

- Total de propietarios
- Recibos pendientes
- Recibos pagados
- Gastos totales

---

## Gestión de Propietarios

### Funciones

- Crear propietario
- Editar propietario
- Eliminar propietario

### Filtros

- Nombre
- Apellido
- DNI
- Departamento
- Torre
- Piso

---

## Gestión de Gastos

### Categorías

- Mantenimiento
- Luz
- Agua

### Funciones

- Registrar gastos
- Filtrar por mes
- Filtrar por categoría
- Pago manual
- Eliminar gastos

---

## Gestión de Recibos

### Funciones

- Generar recibos
- Recalcular recibos
- Filtrar por mes
- Ver pendientes y pagados

### Extras

- Ranking automático de morosos
- Resumen mensual
- Búsqueda por rango de deuda

---

# Reglas de Pago

## Pago de Recibos

Al realizar un pago:

- Se actualiza el saldo del recibo
- Se actualiza el estado
- El monto se aplica automáticamente a gastos pendientes del mismo mes usando FIFO

---

## Pago Manual de Gastos

- Reduce saldo del gasto
- Actualiza estado automáticamente

---

# Recuperación de Contraseña

Disponible desde:

```text
recuperar.html
```

Flujo:

1. Usuario
2. DNI
3. Nueva contraseña

---

# Tecnologías Recomendadas

## Frontend

- HTML
- CSS
- JavaScript

## Backend

- Node.js / Express

## Base de Datos

- PostgreSQL

---

# Despliegue Recomendado

| Servicio | Uso |
|---|---|
| GitHub Pages | Frontend |
| Render | Backend |
| PostgreSQL | Base de datos |

---

# Estructura del Proyecto

```text
condominiox-system/
│
├── frontend/
├── backend/
├── database/
├── assets/
├── index.html
├── recuperar.html
└── README.md
```

---

# Instalación

## 1. Clonar repositorio

```bash
git clone https://github.com/LauraRangel/condominiox-system.git
```

## 2. Ingresar al proyecto

```bash
cd condominiox-system
```

## 3. Ejecutar frontend

Abrir:

```text
index.html
```

---

# Versión

| Campo | Valor |
|---|---|
| Sistema | CondominioX |
| Versión | 3.0 |
| Fecha | Marzo 2026 |

---

# Licencia

Proyecto académico y educativo.

---