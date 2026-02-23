// Manejar el formulario de login
if (document.getElementById('loginForm')) {
    document.getElementById('loginForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const usuario = document.getElementById('usuario').value;
        const contrasena = document.getElementById('contrasena').value;
        const tipoUsuario = document.getElementById('tipoUsuario').value;
        const mensaje = document.getElementById('mensaje');

        // Validar tipo de usuario
        if (!tipoUsuario) {
            mensaje.textContent = 'Por favor seleccione el tipo de usuario';
            mensaje.className = 'mensaje error';
            return;
        }

        if (!window.API_URL) {
            mensaje.textContent = 'No se encontró la configuración del servidor';
            mensaje.className = 'mensaje error';
            return;
        }

        // Limpiar mensaje previo
        mensaje.textContent = 'Iniciando sesión...';
        mensaje.className = 'mensaje';
        mensaje.style.display = 'block';

        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    usuario: usuario,
                    contrasena: contrasena,
                    tipo: tipoUsuario
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                mensaje.textContent = data.error || 'Usuario o contraseña incorrectos';
                mensaje.className = 'mensaje error';
                return;
            }

            setAuthToken(data.token);
            setUserData(data.user);

            mensaje.textContent = 'Inicio de sesión exitoso. Redirigiendo...';
            mensaje.className = 'mensaje success';

            setTimeout(() => {
                if (data.user.tipo === 'Administrador') {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'propietario.html';
                }
            }, 1000);
        } catch (error) {
            console.error('Error:', error);
            mensaje.textContent = 'Error de conexión. Intente nuevamente.';
            mensaje.className = 'mensaje error';
        }
    });
}

// Función para cerrar sesión
function cerrarSesion() {
    if (confirm('¿Está seguro que desea cerrar sesión?')) {
        removeAuthToken();
        window.location.href = 'index.html';
    }
}

// Verificar autenticación en páginas protegidas
if (window.location.pathname.includes('admin.html') ||
    window.location.pathname.includes('propietario.html')) {
    requireAuth();

    // Mostrar nombre del usuario
    const userData = getUserData();
    if (userData) {
        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = userData.usuario;
        }
    }
}

// ========================================
// FUNCIONES DE UI
// ========================================

// Función para mostrar/ocultar secciones
function mostrarSeccion(seccionId) {
    const secciones = document.querySelectorAll('.content-section');
    secciones.forEach(seccion => {
        seccion.classList.add('hidden');
    });

    const seccion = document.getElementById(`${seccionId}-section`);
    if (seccion) {
        seccion.classList.remove('hidden');
    }

    const links = document.querySelectorAll('.nav-list a');
    links.forEach(link => {
        link.classList.remove('active');
    });
    if (event && event.target) {
        event.target.classList.add('active');
    }
}

// Función para mostrar formularios
function mostrarFormulario(formId) {
    const form = document.getElementById(`form${formId.charAt(0).toUpperCase() + formId.slice(1)}`);
    if (form) {
        form.classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Función para cerrar formularios
function cerrarFormulario(formId) {
    const form = document.getElementById(`form${formId.charAt(0).toUpperCase() + formId.slice(1)}`);
    if (form) {
        form.classList.add('hidden');
        const formElement = form.querySelector('form');
        if (formElement) {
            formElement.reset();
        }
        const mensaje = form.querySelector('.mensaje');
        if (mensaje) {
            mensaje.textContent = '';
            mensaje.className = 'mensaje';
        }
    }
}

// Mostrar mensajes de alerta
function mostrarMensaje(elementId, texto, tipo = 'success') {
    const elemento = document.getElementById(elementId);
    if (elemento) {
        elemento.textContent = texto;
        elemento.className = `mensaje ${tipo}`;
        elemento.style.display = 'block';

        setTimeout(() => {
            elemento.style.display = 'none';
        }, 5000);
    }
}

function inicializarToggleContrasenas() {
    const botones = document.querySelectorAll('.password-toggle-btn[data-target]');
    botones.forEach(btn => {
        const iconoAbierto = '<img src="img/eye-open.svg" alt="" aria-hidden="true">';
        const iconoCerrado = '<img src="img/eye-close.svg" alt="" aria-hidden="true">';

        btn.setAttribute('aria-label', 'Mostrar contraseña');
        btn.setAttribute('title', 'Mostrar contraseña');
        btn.innerHTML = iconoAbierto;
        btn.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (!input) return;

            const mostrando = input.type === 'text';
            input.type = mostrando ? 'password' : 'text';
            if (mostrando) {
                this.innerHTML = iconoAbierto;
                this.setAttribute('aria-label', 'Mostrar contraseña');
                this.setAttribute('title', 'Mostrar contraseña');
            } else {
                this.innerHTML = iconoCerrado;
                this.setAttribute('aria-label', 'Ocultar contraseña');
                this.setAttribute('title', 'Ocultar contraseña');
            }
        });
    });
}

window.addEventListener('DOMContentLoaded', inicializarToggleContrasenas);
