let perfil = null;
let recibosPendientes = [];
let recibosPagados = [];
let editandoContacto = false;

function toNumber(value) {
    if (typeof value === 'number') return value;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function getPropietarioId() {
    const user = getUserData();
    return user && user.propietario_id ? user.propietario_id : null;
}

// ========================================
// CARGAR INFORMACIÓN PERSONAL
// ========================================

async function cargarInformacionPersonal() {
    const { response, data } = await apiFetch('/mi-perfil');
    if (!response.ok) {
        console.error(data);
        return;
    }

    perfil = data.perfil || {};

    document.getElementById('infoNombre').textContent = `${perfil.nombre || ''} ${perfil.apellido || ''}`.trim();
    document.getElementById('infoDepartamentoTorre').textContent = `Depto. ${perfil.nro_departamento || '-'} - Torre ${perfil.torre || '-'}`;
    document.getElementById('infoDNI').textContent = perfil.dni || '-';
    document.getElementById('infoCorreo').textContent = perfil.correo || '-';
    document.getElementById('infoTelefono').textContent = perfil.telefono || '-';
    const correoInput = document.getElementById('infoCorreoInput');
    const telefonoInput = document.getElementById('infoTelefonoInput');
    if (correoInput) correoInput.value = perfil.correo || '';
    if (telefonoInput) telefonoInput.value = perfil.telefono || '';

    await cargarEstadisticas();
}

function activarEdicionContacto(activo) {
    editandoContacto = activo;
    const correoValor = document.getElementById('infoCorreo');
    const telefonoValor = document.getElementById('infoTelefono');
    const correoInput = document.getElementById('infoCorreoInput');
    const telefonoInput = document.getElementById('infoTelefonoInput');
    const acciones = document.getElementById('accionesEditarContacto');
    const btnEditar = document.getElementById('btnEditarContacto');

    if (!correoValor || !telefonoValor || !correoInput || !telefonoInput || !acciones || !btnEditar) {
        return;
    }

    correoValor.classList.toggle('hidden', activo);
    telefonoValor.classList.toggle('hidden', activo);
    correoInput.classList.toggle('hidden', !activo);
    telefonoInput.classList.toggle('hidden', !activo);
    correoInput.disabled = !activo;
    telefonoInput.disabled = !activo;
    acciones.classList.toggle('hidden', !activo);
    btnEditar.classList.toggle('hidden', activo);

    if (activo) {
        correoInput.value = perfil?.correo || '';
        telefonoInput.value = perfil?.telefono || '';
        correoInput.focus();
    }
}

async function guardarContacto() {
    const correoInput = document.getElementById('infoCorreoInput');
    const telefonoInput = document.getElementById('infoTelefonoInput');
    if (!correoInput || !telefonoInput) return;

    const correo = correoInput.value.trim();
    const telefono = telefonoInput.value.trim();
    const { response, data } = await apiFetch('/mi-perfil', {
        method: 'PUT',
        body: JSON.stringify({ correo, telefono })
    });
    if (!response.ok) {
        mostrarMensaje('mensajeContacto', data.error || 'No se pudo actualizar', 'error');
        return;
    }

    activarEdicionContacto(false);
    await cargarInformacionPersonal();
    mostrarMensaje('mensajeContacto', 'Guardado exitosamente', 'success');
}

function cancelarEdicionContacto() {
    activarEdicionContacto(false);
}

async function cargarEstadisticas() {
    await Promise.all([cargarRecibosPendientes(), cargarRecibosPagados()]);

    document.getElementById('totalPendientes').textContent = recibosPendientes.length;

    const totalPendiente = recibosPendientes.reduce((sum, r) => {
        const total = toNumber(r.monto_administracion)
            + toNumber(r.monto_agua)
            + toNumber(r.monto_luz)
            + toNumber(r.monto_mantenimiento);
        const pagado = toNumber(r.monto_pagado);
        return sum + (total - pagado);
    }, 0);
    document.getElementById('montoPendiente').textContent = formatCurrency(totalPendiente);

    document.getElementById('totalPagados').textContent = recibosPagados.length;
}

// ========================================
// RECIBOS PENDIENTES
// ========================================

async function cargarRecibosPendientes() {
    const propietarioId = getPropietarioId();
    if (!propietarioId) return;

    const { response, data } = await apiFetch(`/recibos/propietario/${propietarioId}?estado=pendientes`);
    if (!response.ok) {
        console.error(data);
        return;
    }

    recibosPendientes = data.items || [];
    const tbody = document.getElementById('tablaRecibosPendientes');

    if (recibosPendientes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No tiene recibos pendientes</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    recibosPendientes.forEach(recibo => {
        const total = toNumber(recibo.monto_administracion)
            + toNumber(recibo.monto_agua)
            + toNumber(recibo.monto_luz)
            + toNumber(recibo.monto_mantenimiento);
        const pagado = toNumber(recibo.monto_pagado);
        const saldo = recibo.saldo !== undefined ? toNumber(recibo.saldo) : (total - pagado);

        const mesAnio = formatMonthYear(recibo.fecha_emision);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${recibo.id}</td>
            <td>${mesAnio}</td>
            <td>${formatCurrency(recibo.monto_administracion)}</td>
            <td>${formatCurrency(recibo.monto_agua)}</td>
            <td>${formatCurrency(recibo.monto_luz)}</td>
            <td>${formatCurrency(recibo.monto_mantenimiento)}</td>
            <td><strong>${formatCurrency(total)}</strong></td>
            <td>${formatCurrency(pagado)}</td>
            <td>${formatCurrency(saldo)}</td>
            <td>
                <button class="btn btn-success" onclick="pagarRecibo(${recibo.id})"
                        style="padding: 0.4rem 0.8rem;">
                    Pagar
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function pagarRecibo(idRecibo) {
    const montoStr = prompt('Ingrese el monto a pagar');
    if (!montoStr) {
        return;
    }
    const monto = parseFloat(montoStr);
    if (Number.isNaN(monto) || monto <= 0) {
        alert('Monto inválido');
        return;
    }

    const { response, data } = await apiFetch(`/recibos/${idRecibo}/pagar`, {
        method: 'POST',
        body: JSON.stringify({ monto })
    });

    if (!response.ok) {
        alert(data.error || 'No se pudo procesar el pago');
        return;
    }

    await cargarEstadisticas();
}

// ========================================
// RECIBOS PAGADOS
// ========================================

async function cargarRecibosPagados() {
    const propietarioId = getPropietarioId();
    if (!propietarioId) return;

    const { response, data } = await apiFetch(`/recibos/propietario/${propietarioId}?estado=pagados`);
    if (!response.ok) {
        console.error(data);
        return;
    }

    recibosPagados = data.items || [];
    const tbody = document.getElementById('tablaRecibosPagados');

    if (recibosPagados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-state">No tiene recibos pagados aún</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    recibosPagados.forEach(recibo => {
        const total = toNumber(recibo.monto_administracion)
            + toNumber(recibo.monto_agua)
            + toNumber(recibo.monto_luz)
            + toNumber(recibo.monto_mantenimiento);
        const pagado = toNumber(recibo.monto_pagado);
        const saldo = recibo.saldo !== undefined ? toNumber(recibo.saldo) : (total - pagado);

        const mesAnio = formatMonthYear(recibo.fecha_emision);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${recibo.id}</td>
            <td>${mesAnio}</td>
            <td><strong>${formatCurrency(total)}</strong></td>
            <td>${formatCurrency(pagado)}</td>
            <td>${formatCurrency(saldo)}</td>
            <td>${formatDate(recibo.fecha_pago)}</td>
            <td>${formatCurrency(recibo.monto_administracion)}</td>
            <td>${formatCurrency(recibo.monto_agua)}</td>
            <td>${formatCurrency(recibo.monto_luz)}</td>
            <td>${formatCurrency(recibo.monto_mantenimiento)}</td>
        `;
        tbody.appendChild(tr);
    });
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

if (document.getElementById('btnEditarContacto')) {
    document.getElementById('btnEditarContacto').addEventListener('click', () => activarEdicionContacto(true));
}
if (document.getElementById('btnGuardarContacto')) {
    document.getElementById('btnGuardarContacto').addEventListener('click', guardarContacto);
}
if (document.getElementById('btnCancelarContacto')) {
    document.getElementById('btnCancelarContacto').addEventListener('click', cancelarEdicionContacto);
}

// ========================================
// CARGA DE DATOS POR SECCIÓN
// ========================================

function cargarDatosSeccion(seccionId) {
    switch(seccionId) {
        case 'informacion':
            cargarInformacionPersonal();
            break;
        case 'pendientes':
            cargarRecibosPendientes();
            break;
        case 'pagados':
            cargarRecibosPagados();
            break;
    }
}

document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', function() {
        const seccion = this.getAttribute('data-section');
        if (seccion) {
            cargarDatosSeccion(seccion);
        }
    });
});

// ========================================
// INICIALIZACIÓN
// ========================================

window.addEventListener('DOMContentLoaded', function() {
    cargarInformacionPersonal();
});
