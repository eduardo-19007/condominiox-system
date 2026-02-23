let propietarios = [];
let gastos = [];
let recibos = [];
let currentRecibosView = 'pendientes';
let currentMesFilter = '';
let editingPropietarioId = null;

function toNumber(value) {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateRaw(dateString) {
    if (!dateString) return '-';
    const safe = String(dateString).slice(0, 10);
    const parts = safe.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year}`;
    }
    return safe;
}

function obtenerSiguienteId(items, campo = 'id') {
    if (!items || items.length === 0) return 1;
    return Math.max(...items.map(item => item[campo])) + 1;
}

// ========================================
// DASHBOARD
// ========================================

function actualizarDashboard() {
    document.getElementById('totalPropietarios').textContent = propietarios.length;

    const recibosPendientes = recibos.filter(r => !r.pagado);
    document.getElementById('recibosPendientes').textContent = recibosPendientes.length;

    const totalGastos = gastos.reduce((sum, g) => sum + parseFloat(g.monto), 0);
    document.getElementById('gastosDelMes').textContent = formatCurrency(totalGastos);

    const recibosPagados = recibos.filter(r => r.pagado);
    document.getElementById('recibosPagados').textContent = recibosPagados.length;
}

async function cargarDashboard() {
    await Promise.all([cargarPropietarios(), cargarGastos(), cargarRecibos(), cargarConfiguracion()]);
    actualizarDashboard();
}

// ========================================
// GESTIÓN DE PROPIETARIOS
// ========================================

async function cargarPropietarios() {
    const { response, data } = await apiFetch('/propietarios');
    if (!response.ok) {
        console.error(data);
        return;
    }
    propietarios = data.items || [];
    listarPropietarios();
}

function listarPropietarios() {
    const tbody = document.getElementById('tablaPropietarios');

    if (propietarios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay propietarios registrados</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    propietarios.forEach(prop => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${prop.id}</td>
            <td>${prop.nombre} ${prop.apellido}</td>
            <td>${prop.dni}</td>
            <td>${prop.nro_departamento}</td>
            <td>${prop.torre}</td>
            <td>${prop.telefono || '-'}</td>
            <td>
                <div class="propietario-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editarPropietario(${prop.id})">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="eliminarPropietario(${prop.id})">Eliminar</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function limpiarFormularioPropietario() {
    const form = document.getElementById('formPropietario');
    const titulo = document.getElementById('tituloFormPropietario');
    const btnGuardar = document.getElementById('btnGuardarPropietario');
    const grupoContrasena = document.getElementById('grupoContrasenaPropietario');
    const editId = document.getElementById('propietarioEditId');
    const passwordInput = document.getElementById('propContrasena');

    editingPropietarioId = null;
    if (editId) editId.value = '';
    if (titulo) titulo.textContent = 'Nuevo Propietario';
    if (btnGuardar) btnGuardar.textContent = 'Guardar';
    if (grupoContrasena) grupoContrasena.classList.remove('hidden');
    if (passwordInput) {
        passwordInput.required = true;
        passwordInput.readOnly = true;
    }
    if (form) form.reset();
}

function cerrarFormularioPropietario() {
    limpiarFormularioPropietario();
    cerrarFormulario('agregarPropietario');
}

function abrirNuevoPropietario() {
    limpiarFormularioPropietario();
    mostrarFormulario('agregarPropietario');
}

function editarPropietario(id) {
    const prop = propietarios.find(item => item.id === id);
    if (!prop) {
        alert('No se encontró el propietario');
        return;
    }

    editingPropietarioId = id;
    document.getElementById('propietarioEditId').value = id;
    document.getElementById('propNombre').value = prop.nombre || '';
    document.getElementById('propApellido').value = prop.apellido || '';
    document.getElementById('propDNI').value = prop.dni || '';
    document.getElementById('propTelefono').value = prop.telefono || '';
    document.getElementById('propCorreo').value = prop.correo || '';
    document.getElementById('propDepartamento').value = prop.nro_departamento || '';
    document.getElementById('propTorre').value = prop.torre || '';
    document.getElementById('propUsuario').value = prop.usuario || '';

    const titulo = document.getElementById('tituloFormPropietario');
    const btnGuardar = document.getElementById('btnGuardarPropietario');
    const grupoContrasena = document.getElementById('grupoContrasenaPropietario');
    const passwordInput = document.getElementById('propContrasena');
    if (titulo) titulo.textContent = `Editar Propietario #${id}`;
    if (btnGuardar) btnGuardar.textContent = 'Actualizar';
    if (grupoContrasena) grupoContrasena.classList.add('hidden');
    if (passwordInput) {
        passwordInput.required = false;
        passwordInput.readOnly = false;
    }

    mostrarFormulario('agregarPropietario');
}

if (document.getElementById('formPropietario')) {
    const dniInput = document.getElementById('propDNI');
    const passwordInput = document.getElementById('propContrasena');
    if (dniInput && passwordInput) {
        dniInput.addEventListener('input', function() {
            passwordInput.value = dniInput.value.trim();
        });
        passwordInput.setAttribute('readonly', 'readonly');
    }

    document.getElementById('formPropietario').addEventListener('submit', async function(e) {
        e.preventDefault();

        const nuevoPropietario = {
            usuario: document.getElementById('propUsuario').value.trim(),
            nombre: document.getElementById('propNombre').value.trim(),
            apellido: document.getElementById('propApellido').value.trim(),
            dni: document.getElementById('propDNI').value.trim(),
            correo: document.getElementById('propCorreo').value.trim(),
            telefono: document.getElementById('propTelefono').value.trim(),
            nro_departamento: document.getElementById('propDepartamento').value.trim(),
            torre: document.getElementById('propTorre').value
        };

        if (!/^\d{8}$/.test(nuevoPropietario.dni)) {
            mostrarMensaje('mensajePropietario', 'El DNI debe tener 8 dígitos numéricos', 'error');
            return;
        }

        const endpoint = editingPropietarioId ? `/propietarios/${editingPropietarioId}` : '/propietarios';
        const method = editingPropietarioId ? 'PUT' : 'POST';
        const { response, data } = await apiFetch(endpoint, {
            method,
            body: JSON.stringify(nuevoPropietario)
        });

        if (!response.ok) {
            mostrarMensaje('mensajePropietario', data.error || 'Error al registrar', 'error');
            return;
        }

        mostrarMensaje(
            'mensajePropietario',
            editingPropietarioId ? 'Propietario actualizado exitosamente' : 'Propietario registrado exitosamente',
            'success'
        );
        await cargarPropietarios();
        actualizarDashboard();

        setTimeout(() => {
            cerrarFormularioPropietario();
        }, 2000);
    });
}

async function eliminarPropietario(id) {
    if (!confirm('¿Está seguro de eliminar este propietario?')) {
        return;
    }

    const { response, data } = await apiFetch(`/propietarios/${id}`, {
        method: 'DELETE'
    });

    if (!response.ok) {
        alert(data.error || 'No se pudo eliminar');
        return;
    }

    alert('Propietario eliminado exitosamente');
    await cargarPropietarios();
    actualizarDashboard();
}

// ========================================
// GESTIÓN DE GASTOS
// ========================================

async function cargarGastos() {
    const { response, data } = await apiFetch('/gastos');
    if (!response.ok) {
        console.error(data);
        return;
    }
    gastos = data.items || [];
    listarGastos();
}

// ========================================
// CONFIGURACIÓN
// ========================================

async function cargarConfiguracion() {
    const input = document.getElementById('montoAdministracion');
    if (!input) return;

    const { response, data } = await apiFetch('/configuracion');
    if (!response.ok) {
        console.error(data);
        return;
    }
    input.value = data.monto_administracion;
}

if (document.getElementById('formConfigAdmin')) {
    document.getElementById('formConfigAdmin').addEventListener('submit', async function(e) {
        e.preventDefault();
        const monto = parseFloat(document.getElementById('montoAdministracion').value);

        const { response, data } = await apiFetch('/configuracion', {
            method: 'PUT',
            body: JSON.stringify({ monto_administracion: monto })
        });

        if (!response.ok) {
            mostrarMensaje('mensajeConfigAdmin', data.error || 'No se pudo guardar', 'error');
            return;
        }
        mostrarMensaje('mensajeConfigAdmin', 'Configuración guardada', 'success');
    });
}

if (document.getElementById('formGasto')) {
    document.getElementById('formGasto').addEventListener('submit', async function(e) {
        e.preventDefault();

        const nuevoGasto = {
            proveedor: document.getElementById('gastoProveedor').value.trim(),
            concepto: document.getElementById('gastoConcepto').value.trim(),
            monto: parseFloat(document.getElementById('gastoMonto').value),
            tipo: 'mantenimiento',
            fecha_registro: document.getElementById('gastoFecha').value
        };

        const { response, data } = await apiFetch('/gastos', {
            method: 'POST',
            body: JSON.stringify(nuevoGasto)
        });

        if (!response.ok) {
            mostrarMensaje('mensajeGasto', data.error || 'Error al registrar', 'error');
            return;
        }

        mostrarMensaje('mensajeGasto', 'Gasto registrado exitosamente', 'success');
        document.getElementById('formGasto').reset();
        await cargarGastos();
        actualizarDashboard();

        setTimeout(() => {
            cerrarFormulario('agregarGasto');
        }, 2000);
    });
}

if (document.getElementById('formGastoLuz')) {
    document.getElementById('formGastoLuz').addEventListener('submit', async function(e) {
        e.preventDefault();

        const nuevoGasto = {
            proveedor: 'Luz del Sur',
            concepto: 'Gasto de luz común',
            monto: parseFloat(document.getElementById('gastoLuzMonto').value),
            tipo: 'luz',
            fecha_registro: document.getElementById('gastoLuzFecha').value
        };

        const { response, data } = await apiFetch('/gastos', {
            method: 'POST',
            body: JSON.stringify(nuevoGasto)
        });

        if (!response.ok) {
            mostrarMensaje('mensajeGastoLuz', data.error || 'Error al registrar', 'error');
            return;
        }

        mostrarMensaje('mensajeGastoLuz', 'Gasto de luz registrado', 'success');
        document.getElementById('formGastoLuz').reset();
        await cargarGastos();
        actualizarDashboard();

        setTimeout(() => {
            cerrarFormulario('agregarGastoLuz');
        }, 2000);
    });
}

if (document.getElementById('formGastoAgua')) {
    document.getElementById('formGastoAgua').addEventListener('submit', async function(e) {
        e.preventDefault();

        const nuevoGasto = {
            proveedor: 'Sedapal',
            concepto: 'Gasto de agua',
            monto: parseFloat(document.getElementById('gastoAguaMonto').value),
            tipo: 'agua',
            fecha_registro: document.getElementById('gastoAguaFecha').value
        };

        const { response, data } = await apiFetch('/gastos', {
            method: 'POST',
            body: JSON.stringify(nuevoGasto)
        });

        if (!response.ok) {
            mostrarMensaje('mensajeGastoAgua', data.error || 'Error al registrar', 'error');
            return;
        }

        mostrarMensaje('mensajeGastoAgua', 'Gasto de agua registrado', 'success');
        document.getElementById('formGastoAgua').reset();
        await cargarGastos();
        actualizarDashboard();

        setTimeout(() => {
            cerrarFormulario('agregarGastoAgua');
        }, 2000);
    });
}

function listarGastos() {
    const tbody = document.getElementById('tablaGastos');

    if (gastos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay gastos registrados</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    let total = 0;
    gastos.forEach(gasto => {
        total += toNumber(gasto.monto);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${gasto.id}</td>
            <td>${gasto.proveedor}</td>
            <td>${gasto.concepto}</td>
            <td><span style="background: var(--accent-gold); color: white; padding: 0.2rem 0.5rem; border-radius: 3px;">${gasto.tipo}</span></td>
            <td>${formatCurrency(gasto.monto)}</td>
            <td>${formatDateRaw(gasto.fecha_registro)}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="eliminarGasto(${gasto.id})">Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    const trTotal = document.createElement('tr');
    trTotal.className = 'total-row';
    trTotal.innerHTML = `
        <td colspan="4">Total</td>
        <td>${formatCurrency(total)}</td>
        <td colspan="2"></td>
    `;
    tbody.appendChild(trTotal);
}

async function eliminarGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) {
        return;
    }

    const { response, data } = await apiFetch(`/gastos/${id}`, {
        method: 'DELETE'
    });

    if (!response.ok) {
        alert(data.error || 'No se pudo eliminar');
        return;
    }

    alert('Gasto eliminado');
    await cargarGastos();
    actualizarDashboard();
}

// ========================================
// GESTIÓN DE RECIBOS
// ========================================

async function generarRecibos() {
    if (!confirm('¿Generar recibos para todos los propietarios?')) {
        return;
    }

    const fechaInput = document.getElementById('fechaRecibos');
    const fechaEmision = fechaInput && fechaInput.value
        ? fechaInput.value
        : new Date().toISOString().slice(0, 10);

    const { response, data } = await apiFetch('/recibos/generar', {
        method: 'POST',
        body: JSON.stringify({ fecha_emision: fechaEmision })
    });

    if (!response.ok) {
        alert(data.error || 'No se pudieron generar los recibos');
        return;
    }

    alert(`Se generaron ${data.generados} recibos exitosamente`);
    await cargarRecibos();
    await cargarRecibos(currentRecibosView);
    actualizarDashboard();
}

async function recalcularRecibos() {
    const mesInput = document.getElementById('mesRecibos');
    const mes = mesInput && mesInput.value
        ? mesInput.value
        : new Date().toISOString().slice(0, 7);

    if (!confirm(`¿Recalcular recibos del mes ${mes}?`)) {
        return;
    }

    const { response, data } = await apiFetch('/recibos/recalcular', {
        method: 'POST',
        body: JSON.stringify({ mes })
    });

    if (!response.ok) {
        alert(data.error || 'No se pudo recalcular');
        return;
    }

    alert(`Se recalcularon ${data.actualizados} recibos`);
    await cargarRecibos();
    await cargarRecibos(currentRecibosView);
    actualizarDashboard();
}

async function cargarRecibos(estado = '') {
    const params = [];
    if (estado) params.push(`estado=${estado}`);
    if (currentMesFilter) params.push(`mes=${currentMesFilter}`);
    const query = params.length ? `?${params.join('&')}` : '';
    const { response, data } = await apiFetch(`/recibos${query}`);
    if (!response.ok) {
        console.error(data);
        return;
    }
    if (!estado) {
        recibos = data.items || [];
        actualizarResumenMensual(data.resumen_mensual || []);
    }
    if (estado) {
        listarRecibos(estado, data.items || []);
    }
}

function listarRecibos(tipo = 'pendientes', items = []) {
    const tbody = document.getElementById('tablaRecibos');
    const filtrados = items;

    if (filtrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No hay recibos ${tipo}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    filtrados.forEach(recibo => {
        const total = toNumber(recibo.monto_administracion)
            + toNumber(recibo.monto_agua)
            + toNumber(recibo.monto_luz)
            + toNumber(recibo.monto_mantenimiento);
        const estado = recibo.pagado
            ? '<span style="color: green;">✅ Pagado</span>'
            : '<span style="color: orange;">⏳ Pendiente</span>';

        const tr = document.createElement('tr');
        const pagado = toNumber(recibo.monto_pagado);
        const saldo = recibo.saldo !== undefined ? recibo.saldo : (total - pagado);

        tr.innerHTML = `
            <td>${recibo.id}</td>
            <td>${recibo.propietario.nombre} ${recibo.propietario.apellido}</td>
            <td>${recibo.nro_departamento} - ${recibo.torre}</td>
            <td>${formatCurrency(total)}</td>
            <td>${formatCurrency(pagado)}</td>
            <td>${formatCurrency(saldo)}</td>
            <td>${estado}</td>
            <td>${formatDate(recibo.fecha_emision)}</td>
            <td>${formatDate(recibo.fecha_pago)}</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="eliminarRecibo(${recibo.id})">Eliminar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function eliminarRecibo(id) {
    if (!confirm('¿Eliminar este recibo?')) {
        return;
    }

    const { response, data } = await apiFetch(`/recibos/${id}`, {
        method: 'DELETE'
    });

    if (!response.ok) {
        alert(data.error || 'No se pudo eliminar');
        return;
    }

    alert('Recibo eliminado');
    await cargarRecibos();
    await cargarRecibos(currentRecibosView);
    actualizarDashboard();
}

function setRecibosVista(vista) {
    currentRecibosView = vista;
    cargarRecibos(vista);
    actualizarBotonesRecibos();
}

function setFiltroMesRecibos() {
    const input = document.getElementById('filtroMesRecibos');
    currentMesFilter = input && input.value ? input.value : '';
    cargarRecibos(currentRecibosView);
}

function limpiarFiltroMesRecibos() {
    const input = document.getElementById('filtroMesRecibos');
    if (input) input.value = '';
    currentMesFilter = '';
    cargarRecibos(currentRecibosView);
}

function actualizarResumenMensual(items) {
    const tbody = document.getElementById('tablaResumenMensual');
    if (!tbody) return;

    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Sin datos</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    items.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.mes}</td>
            <td>${formatCurrency(row.emitido)}</td>
            <td>${formatCurrency(row.pagado)}</td>
            <td>${formatCurrency(row.pendiente)}</td>
            <td>${row.cantidad}</td>
        `;
        tbody.appendChild(tr);
    });
}

function actualizarBotonesRecibos() {
    const btnPendientes = document.getElementById('btnRecibosPendientes');
    const btnPagados = document.getElementById('btnRecibosPagados');
    if (!btnPendientes || !btnPagados) return;

    btnPendientes.classList.toggle('btn-filter-active', currentRecibosView === 'pendientes');
    btnPagados.classList.toggle('btn-filter-active', currentRecibosView === 'pagados');
    btnPendientes.classList.toggle('btn-state-pendientes-active', currentRecibosView === 'pendientes');
    btnPagados.classList.toggle('btn-state-pagados-active', currentRecibosView === 'pagados');
    btnPendientes.setAttribute('aria-pressed', String(currentRecibosView === 'pendientes'));
    btnPagados.setAttribute('aria-pressed', String(currentRecibosView === 'pagados'));
}

// ========================================
// CAMBIAR CONTRASEÑA
// ========================================

if (document.getElementById('formCambiarContrasena')) {
    document.getElementById('formCambiarContrasena').addEventListener('submit', async function(e) {
        e.preventDefault();

        const actualContrasena = document.getElementById('actualContrasena').value;
        const nuevaContrasena = document.getElementById('nuevaContrasena').value;
        const confirmarContrasena = document.getElementById('confirmarContrasena').value;

        if (nuevaContrasena !== confirmarContrasena) {
            mostrarMensaje('mensajePerfil', 'Las contraseñas no coinciden', 'error');
            return;
        }

        const { response, data } = await apiFetch('/mi-contrasena', {
            method: 'PUT',
            body: JSON.stringify({
                actual_contrasena: actualContrasena,
                nueva_contrasena: nuevaContrasena
            })
        });
        if (!response.ok) {
            mostrarMensaje('mensajePerfil', data.error || 'No se pudo cambiar la contraseña', 'error');
            return;
        }

        mostrarMensaje('mensajePerfil', 'Contraseña cambiada exitosamente', 'success');
        document.getElementById('formCambiarContrasena').reset();
    });
}

// ========================================
// INICIALIZACIÓN
// ========================================

window.addEventListener('DOMContentLoaded', function() {
    limpiarFormularioPropietario();
    const fechaInput = document.getElementById('fechaRecibos');
    if (fechaInput && !fechaInput.value) {
        fechaInput.value = new Date().toISOString().slice(0, 10);
    }
    const mesInput = document.getElementById('mesRecibos');
    if (mesInput && !mesInput.value) {
        mesInput.value = new Date().toISOString().slice(0, 7);
    }
    const filtroMes = document.getElementById('filtroMesRecibos');
    if (filtroMes) {
        filtroMes.addEventListener('change', setFiltroMesRecibos);
    }
    cargarDashboard();
    setRecibosVista('pendientes');
});
