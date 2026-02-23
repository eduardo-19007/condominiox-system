let propietarios = [];
let gastos = [];
let recibos = [];
let currentRecibosView = 'pendientes';
let currentMesFilter = '';
let editingPropietarioId = null;
let confirmModalResolver = null;
let filtroPropietarioTexto = '';
let filtroPropietarioTorre = '';
let filtroPropietarioPiso = '';

class PilaFiltros {
    constructor() {
        this.items = [];
    }
    push(item) {
        this.items.push(item);
    }
    pop() {
        return this.items.length ? this.items.pop() : null;
    }
    size() {
        return this.items.length;
    }
}

const pilaFiltrosEstructura = new PilaFiltros();

class NodoPropietarioBST {
    constructor(key, value) {
        this.key = key;
        this.value = value;
        this.left = null;
        this.right = null;
    }
}

class ArbolPropietariosBST {
    constructor() {
        this.root = null;
    }

    insertar(key, value) {
        const nuevo = new NodoPropietarioBST(key, value);
        if (!this.root) {
            this.root = nuevo;
            return;
        }
        let curr = this.root;
        while (true) {
            if (key < curr.key) {
                if (!curr.left) {
                    curr.left = nuevo;
                    return;
                }
                curr = curr.left;
            } else {
                if (!curr.right) {
                    curr.right = nuevo;
                    return;
                }
                curr = curr.right;
            }
        }
    }

    buscar(key) {
        let curr = this.root;
        while (curr) {
            if (key === curr.key) return curr.value;
            curr = key < curr.key ? curr.left : curr.right;
        }
        return null;
    }

    inorden() {
        const out = [];
        const walk = (node) => {
            if (!node) return;
            walk(node.left);
            out.push(node.value);
            walk(node.right);
        };
        walk(this.root);
        return out;
    }
}

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

function inicializarConfirmModal() {
    const modal = document.getElementById('confirmModal');
    const btnCancel = document.getElementById('confirmModalCancel');
    const btnAccept = document.getElementById('confirmModalAccept');
    if (!modal || !btnCancel || !btnAccept) return;

    btnCancel.addEventListener('click', () => cerrarConfirmModal(false));
    btnAccept.addEventListener('click', () => cerrarConfirmModal(true));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarConfirmModal(false);
    });
}

function cerrarConfirmModal(accepted) {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('hidden');
    if (confirmModalResolver) {
        confirmModalResolver(accepted);
        confirmModalResolver = null;
    }
}

function confirmModal(message, title = 'Confirmar acción') {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmModalTitle');
    const messageEl = document.getElementById('confirmModalMessage');
    if (!modal || !titleEl || !messageEl) {
        return Promise.resolve(window.confirm(message));
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.remove('hidden');

    return new Promise((resolve) => {
        confirmModalResolver = resolve;
    });
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

function obtenerFiltroEstructuraActual() {
    return {
        estructura: document.getElementById('estructuraTipo')?.value || 'bst',
        recorrido: document.getElementById('estructuraRecorrido')?.value || 'inorden',
        saldo_min: document.getElementById('filtroSaldoMin')?.value || '',
        saldo_max: document.getElementById('filtroSaldoMax')?.value || '',
        mes: document.getElementById('filtroMesRecibos')?.value || '',
        estado: currentRecibosView
    };
}

function toggleOpcionesTecnicas() {
    const bloque = document.getElementById('bloqueOpcionesTecnicas');
    if (!bloque) return;
    bloque.classList.toggle('hidden');
}

function aplicarFiltroEstructuraEnUI(filtro) {
    const estructura = document.getElementById('estructuraTipo');
    const recorrido = document.getElementById('estructuraRecorrido');
    const saldoMin = document.getElementById('filtroSaldoMin');
    const saldoMax = document.getElementById('filtroSaldoMax');
    const mes = document.getElementById('filtroMesRecibos');
    if (estructura) estructura.value = filtro.estructura || 'bst';
    if (recorrido) recorrido.value = filtro.recorrido || 'inorden';
    if (saldoMin) saldoMin.value = filtro.saldo_min || '';
    if (saldoMax) saldoMax.value = filtro.saldo_max || '';
    if (mes) mes.value = filtro.mes || '';
    currentMesFilter = filtro.mes || '';
    if (filtro.estado) {
        currentRecibosView = filtro.estado;
        actualizarBotonesRecibos();
    }
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
    const arbol = new ArbolPropietariosBST();
    propietarios.forEach((prop) => {
        const dniKey = parseInt(prop.dni, 10);
        arbol.insertar(Number.isNaN(dniKey) ? 0 : dniKey, prop);
    });

    // Si el filtro es un DNI exacto, usa búsqueda O(log n) en BST.
    let base = [];
    if (/^\d{8}$/.test(filtroPropietarioTexto)) {
        const encontrado = arbol.buscar(parseInt(filtroPropietarioTexto, 10));
        base = encontrado ? [encontrado] : [];
    } else {
        // Para búsqueda general, recorre BST en orden por DNI.
        base = arbol.inorden();
    }

    const filtrados = base.filter((prop) => {
        const textoBase = [
            prop.nombre || '',
            prop.apellido || '',
            prop.dni || '',
            prop.nro_departamento || ''
        ].join(' ').toLowerCase();
        const textoOk = !filtroPropietarioTexto || textoBase.includes(filtroPropietarioTexto);
        const torreOk = !filtroPropietarioTorre || (prop.torre || '') === filtroPropietarioTorre;
        const pisoActual = obtenerPisoDesdeDepartamento(prop.nro_departamento);
        const pisoOk = !filtroPropietarioPiso || pisoActual === filtroPropietarioPiso;
        return textoOk && torreOk && pisoOk;
    });

    if (filtrados.length === 0) {
        const mensaje = propietarios.length === 0
            ? 'No hay propietarios registrados'
            : 'No hay coincidencias con el filtro';
        tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${mensaje}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    filtrados.forEach(prop => {
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

function obtenerPisoDesdeDepartamento(nroDepartamento) {
    const match = String(nroDepartamento || '').match(/\d+/);
    if (!match) return '';
    const digits = match[0];
    if (digits.length <= 2) {
        return String(parseInt(digits, 10));
    }
    const piso = digits.slice(0, -2);
    const normalizado = String(parseInt(piso, 10));
    return normalizado === 'NaN' ? '' : normalizado;
}

function setFiltroPropietarios() {
    const textoInput = document.getElementById('filtroPropietarioTexto');
    const torreInput = document.getElementById('filtroPropietarioTorre');
    const pisoInput = document.getElementById('filtroPropietarioPiso');
    filtroPropietarioTexto = (textoInput?.value || '').trim().toLowerCase();
    filtroPropietarioTorre = (torreInput?.value || '').trim();
    filtroPropietarioPiso = (pisoInput?.value || '').trim();
    listarPropietarios();
}

function limpiarFiltroPropietarios() {
    const textoInput = document.getElementById('filtroPropietarioTexto');
    const torreInput = document.getElementById('filtroPropietarioTorre');
    const pisoInput = document.getElementById('filtroPropietarioPiso');
    if (textoInput) textoInput.value = '';
    if (torreInput) torreInput.value = '';
    if (pisoInput) pisoInput.value = '';
    filtroPropietarioTexto = '';
    filtroPropietarioTorre = '';
    filtroPropietarioPiso = '';
    listarPropietarios();
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
    if (!(await confirmModal('¿Está seguro de eliminar este propietario?', 'Eliminar propietario'))) {
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
    if (!(await confirmModal('¿Eliminar este gasto?', 'Eliminar gasto'))) {
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
    if (!(await confirmModal('¿Generar recibos para todos los propietarios?', 'Generar recibos'))) {
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
    await cargarTopMorosos();
    actualizarDashboard();
}

async function recalcularRecibos() {
    const mesInput = document.getElementById('mesRecibos');
    const mes = mesInput && mesInput.value
        ? mesInput.value
        : new Date().toISOString().slice(0, 7);

    if (!(await confirmModal(`¿Recalcular recibos del mes ${mes}?`, 'Recalcular recibos'))) {
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
    await cargarTopMorosos();
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
    if (!(await confirmModal('¿Eliminar este recibo?', 'Eliminar recibo'))) {
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
    await cargarTopMorosos();
    actualizarDashboard();
}

function setRecibosVista(vista) {
    currentRecibosView = vista;
    cargarRecibos(vista);
    cargarTopMorosos();
    actualizarBotonesRecibos();
}

function setFiltroMesRecibos() {
    const input = document.getElementById('filtroMesRecibos');
    currentMesFilter = input && input.value ? input.value : '';
    cargarRecibos(currentRecibosView);
    cargarTopMorosos();
}

function limpiarFiltroMesRecibos() {
    const input = document.getElementById('filtroMesRecibos');
    if (input) input.value = '';
    currentMesFilter = '';
    cargarRecibos(currentRecibosView);
    cargarTopMorosos();
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

async function buscarConEstructura() {
    const filtro = obtenerFiltroEstructuraActual();
    const endpoint = filtro.estructura === 'avl'
        ? '/recibos/estructura/avl'
        : '/recibos/estructura/bst';
    const params = new URLSearchParams();
    if (filtro.recorrido) params.set('recorrido', filtro.recorrido);
    if (filtro.saldo_min !== '') params.set('saldo_min', filtro.saldo_min);
    if (filtro.saldo_max !== '') params.set('saldo_max', filtro.saldo_max);
    if (filtro.mes) params.set('mes', filtro.mes);
    if (filtro.estado) params.set('estado', filtro.estado);

    const { response, data } = await apiFetch(`${endpoint}?${params.toString()}`);
    if (!response.ok) {
        mostrarMensaje('mensajeEstructuras', data.error || 'No se pudo consultar la estructura', 'error');
        return;
    }

    renderTablaEstructura(data.items || []);
    mostrarMensaje(
        'mensajeEstructuras',
        `Busqueda completada (${data.total || 0} resultados)`,
        'success'
    );
}

function guardarFiltroEstructura() {
    const filtro = obtenerFiltroEstructuraActual();
    pilaFiltrosEstructura.push(filtro);
    mostrarMensaje(
        'mensajeEstructuras',
        `Filtro guardado en pila. Total en pila: ${pilaFiltrosEstructura.size()}`,
        'success'
    );
}

async function deshacerFiltroEstructura() {
    if (pilaFiltrosEstructura.size() === 0) {
        mostrarMensaje('mensajeEstructuras', 'La pila de filtros esta vacia', 'error');
        return;
    }
    const filtro = pilaFiltrosEstructura.pop();
    aplicarFiltroEstructuraEnUI(filtro);
    await cargarRecibos(currentRecibosView);
    await buscarConEstructura();
}

function aplicarPresetSaldo(min, max) {
    const saldoMin = document.getElementById('filtroSaldoMin');
    const saldoMax = document.getElementById('filtroSaldoMax');
    if (saldoMin) saldoMin.value = min;
    if (saldoMax) saldoMax.value = max;
}

async function limpiarFiltroEstructura() {
    aplicarPresetSaldo('', '');
    const estructura = document.getElementById('estructuraTipo');
    const recorrido = document.getElementById('estructuraRecorrido');
    if (estructura) estructura.value = 'bst';
    if (recorrido) recorrido.value = 'inorden';
    await buscarConEstructura();
}

function renderTablaEstructura(items) {
    const tbody = document.getElementById('tablaEstructuraRecibos');
    if (!tbody) return;
    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin resultados</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    items.forEach(item => {
        const estadoHtml = item.pagado
            ? '<span style="color: green;">Pagado</span>'
            : '<span style="color: #b45309;">Pendiente</span>';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.id}</td>
            <td>${item.propietario.nombre} ${item.propietario.apellido}</td>
            <td>${item.nro_departamento} - ${item.torre}</td>
            <td>${formatCurrency(item.saldo)}</td>
            <td>${formatDate(item.fecha_emision)}</td>
            <td>${estadoHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function cargarTopMorosos() {
    const mes = document.getElementById('filtroMesRecibos')?.value || '';
    const params = new URLSearchParams();
    if (mes) params.set('mes', mes);
    params.set('limit', '5');
    const query = params.toString();
    const { response, data } = await apiFetch(`/recibos/morosos/prioridad?${query}`);
    const tbody = document.getElementById('tablaTopMorosos');
    if (!tbody) return;

    if (!response.ok) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No se pudo cargar el ranking</td></tr>';
        return;
    }
    if (!data.items || data.items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Sin morosos pendientes</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    data.items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.recibo_id}</td>
            <td>${item.propietario.nombre} ${item.propietario.apellido}</td>
            <td>${item.nro_departamento} - ${item.torre}</td>
            <td>${formatCurrency(item.saldo)}</td>
            <td>${item.dias_pendiente}</td>
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
    inicializarConfirmModal();
    limpiarFormularioPropietario();
    const fechaInput = document.getElementById('fechaRecibos');
    if (fechaInput && !fechaInput.value) {
        fechaInput.value = new Date().toISOString().slice(0, 10);
    }
    const mesInput = document.getElementById('mesRecibos');
    if (mesInput && !mesInput.value) {
        mesInput.value = new Date().toISOString().slice(0, 7);
    }
    cargarDashboard();
    setRecibosVista('pendientes');
    cargarTopMorosos();
    buscarConEstructura();
});
