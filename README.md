# CondominioX - Guía de Uso

Sistema web para gestión de condominio con roles (`Administrador` y `Propietario`), pagos parciales y control de gastos.

## Acceso
1. Abrir `index.html`.
2. Seleccionar rol.
3. Ingresar usuario y contraseña.

## Funciones del Administrador

### Dashboard
- Ver indicadores: propietarios, recibos pendientes/pagados y gastos totales.
- Configurar `monto de administración`.

### Propietarios
- Crear propietario (usuario + perfil).
- Contraseña inicial del propietario: **DNI**.
- Editar propietario completo (usuario, datos personales y unidad).
- Eliminar propietario.
- Filtros de búsqueda por:
  - texto (`nombre`, `apellido`, `DNI`, `departamento`)
  - `torre`
  - `piso`
- La búsqueda de propietarios se resuelve en backend con **BST**.

### Gastos
- Registrar gastos de `mantenimiento`, `luz` y `agua`.
- Filtrar gastos por:
  - `mes`
  - `categoría`
  - `estado` (`pendiente` / `pagado`)
- Control de pagos de gastos:
  - pago manual por botón `Pagar`
  - estado y saldo por gasto (`monto`, `pagado`, `saldo`)
- Eliminar gastos.

### Recibos
- Generar recibos por fecha.
- Recalcular recibos por mes.
- Ver recibos `pendientes/pagados` y filtrar por mes.
- Búsqueda por deuda con **AVL** (inorden fijo), por rango de saldo.
- Top morosos automático (cola de prioridad).
- Resumen mensual al final de la sección.

## Funciones del Propietario

### Mi información
- Ver datos personales y unidad.
- Editar solo `correo` y `teléfono`.

### Recibos
- Ver pendientes y pagados.
- Pagar recibos con pagos parciales.
- Ver total, pagado y saldo por recibo.

### Perfil
- Cambiar contraseña con validación de contraseña actual.

## Reglas de pago actuales
- Pago de recibo:
  - actualiza el recibo (pagado/saldo),
  - y además aplica el monto a gastos pendientes del mismo mes (FIFO).
- Pago de gasto manual:
  - reduce el saldo del gasto seleccionado.

## Recuperación de contraseña
- Flujo por `usuario + DNI + nueva contraseña` en `recuperar.html`.

## Estructuras de datos en uso
- **BST**: búsqueda de propietarios en backend.
- **AVL**: búsqueda por deuda de recibos.
- **Cola de prioridad**: ranking de morosos.
- **Pila**: historial de filtros en búsqueda estructurada.
- **Índice hash (`Map`)**: filtros rápidos de gastos por mes/tipo.

## Recomendaciones de despliegue
- Frontend: GitHub Pages.
- Backend: Render + PostgreSQL.
- Si no ves cambios de frontend, forzar recarga (`Ctrl/Cmd + Shift + R`).

---
**Versión:** 3.0  
**Fecha:** Marzo 2026
