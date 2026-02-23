import os
import datetime as dt
from decimal import Decimal, ROUND_HALF_UP
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
import jwt

from db import fetch_one, fetch_all, execute, execute_returning, get_db
from security import verify_password, hash_password
from structures import (
    ListaPropietarios,
    MatrizRecibos,
    ArbolPropietariosBST,
    ArbolRecibosBST,
    ArbolRecibosAVL,
    ColaPrioridadMorosos,
)

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})


def _ensure_extra_tables():
    # Soporta despliegues donde la tabla de pagos de gastos aún no existe.
    execute(
        """
        CREATE TABLE IF NOT EXISTS pagos_gastos (
            id SERIAL PRIMARY KEY,
            gasto_id INTEGER NOT NULL REFERENCES gastos(id) ON DELETE CASCADE,
            monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
            fecha_pago DATE NOT NULL DEFAULT CURRENT_DATE
        )
        """
    )


_ensure_extra_tables()


def _jwt_secret():
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET no está configurado")
    return secret


def _jwt_issuer():
    return os.getenv("JWT_ISSUER", "condominiox")


def _jwt_exp_seconds():
    try:
        return int(os.getenv("JWT_EXPIRES_SECONDS", "3600"))
    except ValueError:
        return 3600


def _get_payload():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None, ("Token requerido", 401)
    token = auth.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(
            token,
            _jwt_secret(),
            algorithms=["HS256"],
            issuer=_jwt_issuer(),
        )
        return payload, None
    except jwt.ExpiredSignatureError:
        return None, ("Token expirado", 401)
    except jwt.InvalidTokenError:
        return None, ("Token inválido", 401)


def _require_roles(payload, *roles):
    if not roles:
        return None
    if payload.get("tipo") not in roles:
        return ("No autorizado", 403)
    return None


def _get_monto_administracion():
    row = fetch_one("SELECT monto_administracion FROM configuracion ORDER BY id DESC LIMIT 1")
    if row and row.get("monto_administracion") is not None:
        value = row["monto_administracion"]
        return float(value)
    return 50.0


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/login")
def login():
    body = request.get_json(silent=True) or {}
    usuario = (body.get("usuario") or "").strip()
    contrasena = body.get("contrasena") or ""
    tipo = (body.get("tipo") or "").strip()

    if not usuario or not contrasena or not tipo:
        return jsonify({"error": "Datos incompletos"}), 400

    user = fetch_one(
        """
        SELECT u.id, u.usuario, u.password_hash, u.tipo, u.activo,
               p.id AS propietario_id, p.nombre, p.apellido, p.dni,
               p.correo, p.telefono, p.nro_departamento, p.torre
        FROM usuarios u
        LEFT JOIN propietarios p ON p.usuario_id = u.id
        WHERE u.usuario = %s
        """,
        [usuario],
    )

    if not user or not user["activo"]:
        return jsonify({"error": "Usuario o contraseña inválidos"}), 401

    if user["tipo"] != tipo:
        return jsonify({"error": f"Este usuario es {user['tipo']}, no {tipo}"}), 403

    if not verify_password(user["password_hash"], contrasena):
        return jsonify({"error": "Usuario o contraseña inválidos"}), 401

    now = dt.datetime.utcnow()
    payload = {
        "sub": str(user["id"]),
        "usuario": user["usuario"],
        "tipo": user["tipo"],
        "iss": _jwt_issuer(),
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(seconds=_jwt_exp_seconds())).timestamp()),
    }
    if user.get("propietario_id"):
        payload["propietario_id"] = user["propietario_id"]
    token = jwt.encode(payload, _jwt_secret(), algorithm="HS256")

    user_data = {
        "id": user["id"],
        "usuario": user["usuario"],
        "tipo": user["tipo"],
    }
    if user.get("propietario_id"):
        user_data["propietario_id"] = user["propietario_id"]
        user_data["perfil"] = {
            "nombre": user["nombre"],
            "apellido": user["apellido"],
            "dni": user["dni"],
            "correo": user["correo"],
            "telefono": user["telefono"],
            "nro_departamento": user["nro_departamento"],
            "torre": user["torre"],
        }

    return jsonify({"token": token, "user": user_data})


@app.post("/api/recuperar-contrasena")
def recuperar_contrasena():
    body = request.get_json(silent=True) or {}
    usuario = (body.get("usuario") or "").strip()
    dni = (body.get("dni") or "").strip()
    nueva = body.get("nueva_contrasena") or ""

    if not usuario or not dni or not nueva:
        return jsonify({"error": "Datos incompletos"}), 400
    if len(nueva) < 6:
        return jsonify({"error": "La nueva contraseña debe tener al menos 6 caracteres"}), 400

    user = fetch_one(
        """
        SELECT u.id, p.dni
        FROM usuarios u
        LEFT JOIN propietarios p ON p.usuario_id = u.id
        WHERE u.usuario = %s
        """,
        [usuario],
    )
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404
    if (user.get("dni") or "") != dni:
        return jsonify({"error": "Verificación inválida"}), 403

    execute(
        "UPDATE usuarios SET password_hash = %s WHERE id = %s",
        [hash_password(nueva), user["id"]],
    )
    return jsonify({"ok": True})


@app.get("/api/mi-perfil")
def mi_perfil():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]

    user = fetch_one(
        """
        SELECT u.id, u.usuario, u.tipo,
               p.id AS propietario_id, p.nombre, p.apellido, p.dni,
               p.correo, p.telefono, p.nro_departamento, p.torre
        FROM usuarios u
        LEFT JOIN propietarios p ON p.usuario_id = u.id
        WHERE u.id = %s
        """,
        [payload.get("sub")],
    )
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404

    return jsonify(
        {
            "id": user["id"],
            "usuario": user["usuario"],
            "tipo": user["tipo"],
            "propietario_id": user.get("propietario_id"),
            "perfil": {
                "nombre": user.get("nombre"),
                "apellido": user.get("apellido"),
                "dni": user.get("dni"),
                "correo": user.get("correo"),
                "telefono": user.get("telefono"),
                "nro_departamento": user.get("nro_departamento"),
                "torre": user.get("torre"),
            },
        }
    )


@app.put("/api/mi-perfil")
def actualizar_mi_perfil():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]

    if payload.get("tipo") != "Propietario":
        return jsonify({"error": "No autorizado"}), 403

    body = request.get_json(silent=True) or {}
    correo = (body.get("correo") or "").strip() or None
    telefono = (body.get("telefono") or "").strip() or None

    propietario_id = payload.get("propietario_id")
    if not propietario_id:
        return jsonify({"error": "Propietario no encontrado"}), 404

    row = execute_returning(
        """
        UPDATE propietarios
        SET correo = %s, telefono = %s
        WHERE id = %s
        RETURNING id, correo, telefono
        """,
        [correo, telefono, propietario_id],
    )
    if not row:
        return jsonify({"error": "Propietario no encontrado"}), 404

    return jsonify(row)


@app.put("/api/mi-contrasena")
def cambiar_mi_contrasena():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]

    body = request.get_json(silent=True) or {}
    actual = body.get("actual_contrasena") or ""
    nueva = body.get("nueva_contrasena") or ""
    if not actual or not nueva:
        return jsonify({"error": "Datos incompletos"}), 400
    if len(nueva) < 6:
        return jsonify({"error": "La nueva contraseña debe tener al menos 6 caracteres"}), 400

    user = fetch_one(
        "SELECT id, password_hash FROM usuarios WHERE id = %s",
        [payload.get("sub")],
    )
    if not user:
        return jsonify({"error": "Usuario no encontrado"}), 404
    if not verify_password(user["password_hash"], actual):
        return jsonify({"error": "Contraseña actual incorrecta"}), 403

    execute(
        "UPDATE usuarios SET password_hash = %s WHERE id = %s",
        [hash_password(nueva), user["id"]],
    )
    return jsonify({"ok": True})


@app.get("/api/configuracion")
def obtener_configuracion():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    return jsonify({"monto_administracion": _get_monto_administracion()})


@app.put("/api/configuracion")
def actualizar_configuracion():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    body = request.get_json(silent=True) or {}
    monto = body.get("monto_administracion")
    if monto is None:
        return jsonify({"error": "Monto de administración requerido"}), 400

    row = execute_returning(
        """
        INSERT INTO configuracion (monto_administracion)
        VALUES (%s)
        RETURNING monto_administracion
        """,
        [monto],
    )
    return jsonify({"monto_administracion": row["monto_administracion"]})


def _listar_propietarios_rows():
    return fetch_all(
        """
        SELECT p.id, p.usuario_id, u.usuario, p.nombre, p.apellido, p.dni, p.correo,
               p.telefono, p.nro_departamento, p.torre
        FROM propietarios p
        LEFT JOIN usuarios u ON u.id = p.usuario_id
        ORDER BY p.id
        """
    )


def _calcular_piso_departamento(nro_departamento):
    digits = "".join(ch for ch in str(nro_departamento or "") if ch.isdigit())
    if not digits:
        return ""
    if len(digits) <= 2:
        return str(int(digits))
    return str(int(digits[:-2]))


@app.get("/api/propietarios")
def listar_propietarios():
    # Usa ListaPropietarios (lista enlazada) para el recorrido y salida ordenada.
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    rows = _listar_propietarios_rows()
    lista = ListaPropietarios()
    for row in rows:
        lista.insertar(row)
    return jsonify({"items": lista.to_list(), "total": lista.length})


@app.get("/api/propietarios/busqueda")
def buscar_propietarios():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    q = (request.args.get("q") or "").strip().lower()
    torre = (request.args.get("torre") or "").strip().upper()
    piso = (request.args.get("piso") or "").strip()

    rows = _listar_propietarios_rows()
    arbol = ArbolPropietariosBST()
    for row in rows:
        try:
            key = int(str(row.get("dni") or "0"))
        except ValueError:
            key = 0
        arbol.insertar(key, row)

    if q.isdigit() and len(q) == 8:
        encontrado = arbol.buscar(int(q))
        base = [encontrado] if encontrado else []
    else:
        base = arbol.inorden()

    items = []
    for row in base:
        texto_base = " ".join(
            [
                str(row.get("usuario") or ""),
                str(row.get("nombre") or ""),
                str(row.get("apellido") or ""),
                str(row.get("dni") or ""),
                str(row.get("nro_departamento") or ""),
            ]
        ).lower()
        if q and q not in texto_base:
            continue
        if torre and str(row.get("torre") or "").upper() != torre:
            continue
        if piso and _calcular_piso_departamento(row.get("nro_departamento")) != piso:
            continue
        items.append(row)

    return jsonify({"items": items, "total": len(items), "origen": "backend_bst"})


@app.post("/api/propietarios")
def crear_propietario():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    body = request.get_json(silent=True) or {}
    required = [
        "usuario",
        "nombre",
        "apellido",
        "dni",
        "nro_departamento",
        "torre",
    ]
    if not all(body.get(k) for k in required):
        return jsonify({"error": "Datos incompletos"}), 400

    if not str(body.get("dni", "")).isdigit() or len(str(body.get("dni"))) != 8:
        return jsonify({"error": "El DNI debe tener 8 dígitos"}), 400

    existe_usuario = fetch_one("SELECT id FROM usuarios WHERE usuario = %s", [body["usuario"]])
    if existe_usuario:
        return jsonify({"error": "Ya existe un usuario con ese nombre"}), 409

    existe = fetch_one("SELECT id FROM propietarios WHERE dni = %s", [body["dni"]])
    if existe:
        return jsonify({"error": "Ya existe un propietario con ese DNI"}), 409

    password_hash = hash_password(body["dni"].strip())

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO usuarios (usuario, password_hash, tipo, activo)
                    VALUES (%s, %s, 'Propietario', TRUE)
                    RETURNING id
                    """,
                    [body["usuario"].strip(), password_hash],
                )
                usuario_row = cur.fetchone()
                cur.execute(
                    """
                    INSERT INTO propietarios (usuario_id, nombre, apellido, dni, correo, telefono, nro_departamento, torre)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, usuario_id, nombre, apellido, dni, correo, telefono, nro_departamento, torre
                    """,
                    [
                        usuario_row["id"],
                        body["nombre"].strip(),
                        body["apellido"].strip(),
                        body["dni"].strip(),
                        body.get("correo"),
                        body.get("telefono"),
                        body["nro_departamento"].strip(),
                        body["torre"].strip(),
                    ],
                )
                row = cur.fetchone()
            conn.commit()
    except Exception:
        return jsonify({"error": "No se pudo crear el propietario"}), 500

    return jsonify(row), 201


@app.put("/api/propietarios/<int:propietario_id>")
def actualizar_propietario(propietario_id):
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    body = request.get_json(silent=True) or {}
    required = ["usuario", "nombre", "apellido", "dni", "nro_departamento", "torre"]
    if not all(str(body.get(k) or "").strip() for k in required):
        return jsonify({"error": "Datos incompletos"}), 400

    dni = str(body.get("dni") or "").strip()
    if not dni.isdigit() or len(dni) != 8:
        return jsonify({"error": "El DNI debe tener 8 dígitos"}), 400

    existente = fetch_one(
        """
        SELECT p.id, p.usuario_id
        FROM propietarios p
        WHERE p.id = %s
        """,
        [propietario_id],
    )
    if not existente:
        return jsonify({"error": "Propietario no encontrado"}), 404

    usuario_existe = fetch_one(
        """
        SELECT id FROM usuarios
        WHERE usuario = %s AND id <> %s
        """,
        [body["usuario"].strip(), existente["usuario_id"]],
    )
    if usuario_existe:
        return jsonify({"error": "Ya existe otro usuario con ese nombre"}), 409

    dni_existe = fetch_one(
        """
        SELECT id FROM propietarios
        WHERE dni = %s AND id <> %s
        """,
        [dni, propietario_id],
    )
    if dni_existe:
        return jsonify({"error": "Ya existe otro propietario con ese DNI"}), 409

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE usuarios
                    SET usuario = %s
                    WHERE id = %s
                    """,
                    [body["usuario"].strip(), existente["usuario_id"]],
                )
                cur.execute(
                    """
                    UPDATE propietarios
                    SET nombre = %s,
                        apellido = %s,
                        dni = %s,
                        correo = %s,
                        telefono = %s,
                        nro_departamento = %s,
                        torre = %s
                    WHERE id = %s
                    RETURNING id, usuario_id, nombre, apellido, dni, correo, telefono, nro_departamento, torre
                    """,
                    [
                        body["nombre"].strip(),
                        body["apellido"].strip(),
                        dni,
                        (body.get("correo") or None),
                        (body.get("telefono") or None),
                        body["nro_departamento"].strip(),
                        body["torre"].strip(),
                        propietario_id,
                    ],
                )
                row = cur.fetchone()
            conn.commit()
    except Exception:
        return jsonify({"error": "No se pudo actualizar el propietario"}), 500

    row["usuario"] = body["usuario"].strip()
    return jsonify(row)


@app.delete("/api/propietarios/<int:propietario_id>")
def eliminar_propietario(propietario_id):
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    row = execute_returning(
        "DELETE FROM propietarios WHERE id = %s RETURNING id",
        [propietario_id],
    )
    if not row:
        return jsonify({"error": "Propietario no encontrado"}), 404
    return jsonify({"deleted": propietario_id})


@app.get("/api/gastos")
def listar_gastos():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    rows = fetch_all(
        """
        SELECT
            g.id,
            g.proveedor,
            g.concepto,
            g.monto,
            g.tipo,
            g.fecha_registro,
            COALESCE(SUM(pg.monto), 0) AS monto_pagado
        FROM gastos g
        LEFT JOIN pagos_gastos pg ON pg.gasto_id = g.id
        GROUP BY g.id, g.proveedor, g.concepto, g.monto, g.tipo, g.fecha_registro
        ORDER BY g.fecha_registro DESC, g.id DESC
        """
    )
    for row in rows:
        total = float(row["monto"] or 0)
        pagado = float(row.get("monto_pagado") or 0)
        saldo = max(total - pagado, 0)
        if row.get("fecha_registro"):
            row["fecha_registro"] = row["fecha_registro"].isoformat()
        row["saldo"] = saldo
        row["pagado_gasto"] = saldo <= 0
    return jsonify({"items": rows})


@app.delete("/api/gastos/<int:gasto_id>")
def eliminar_gasto(gasto_id):
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    row = execute_returning(
        "DELETE FROM gastos WHERE id = %s RETURNING id",
        [gasto_id],
    )
    if not row:
        return jsonify({"error": "Gasto no encontrado"}), 404
    return jsonify({"deleted": gasto_id})


@app.post("/api/gastos")
def crear_gasto():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    body = request.get_json(silent=True) or {}
    required = ["proveedor", "concepto", "monto", "tipo"]
    if not all(body.get(k) for k in required):
        return jsonify({"error": "Datos incompletos"}), 400

    if body.get("tipo") not in ("mantenimiento", "luz", "agua"):
        return jsonify({"error": "Tipo de gasto inválido"}), 400

    fecha_registro = body.get("fecha_registro")
    if not fecha_registro:
        return jsonify({"error": "Fecha requerida"}), 400

    row = execute_returning(
        """
        INSERT INTO gastos (proveedor, concepto, monto, tipo, fecha_registro)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, proveedor, concepto, monto, tipo, fecha_registro
        """,
        [
            body["proveedor"].strip(),
            body["concepto"].strip(),
            body["monto"],
            body["tipo"],
            fecha_registro,
        ],
    )
    return jsonify(row), 201


@app.post("/api/gastos/<int:gasto_id>/pagar")
def pagar_gasto(gasto_id):
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    body = request.get_json(silent=True) or {}
    monto = body.get("monto")
    if monto is None:
        return jsonify({"error": "Monto requerido"}), 400
    try:
        monto = float(monto)
    except (TypeError, ValueError):
        return jsonify({"error": "Monto inválido"}), 400
    if monto <= 0:
        return jsonify({"error": "El monto debe ser mayor a cero"}), 400

    gasto = fetch_one(
        """
        SELECT g.id, g.monto, COALESCE(SUM(pg.monto), 0) AS monto_pagado
        FROM gastos g
        LEFT JOIN pagos_gastos pg ON pg.gasto_id = g.id
        WHERE g.id = %s
        GROUP BY g.id, g.monto
        """,
        [gasto_id],
    )
    if not gasto:
        return jsonify({"error": "Gasto no encontrado"}), 404

    total = float(gasto["monto"] or 0)
    pagado = float(gasto.get("monto_pagado") or 0)
    saldo = total - pagado
    if monto > saldo:
        return jsonify({"error": f"El monto excede el saldo del gasto ({saldo:.2f})"}), 400

    row = execute_returning(
        """
        INSERT INTO pagos_gastos (gasto_id, monto, fecha_pago)
        VALUES (%s, %s, CURRENT_DATE)
        RETURNING id, gasto_id, monto, fecha_pago
        """,
        [gasto_id, monto],
    )
    return jsonify(row), 201


def _recibo_total(recibo):
    return (
        recibo["monto_administracion"]
        + recibo["monto_agua"]
        + recibo["monto_luz"]
        + recibo["monto_mantenimiento"]
    )


def _recibo_saldo(recibo):
    return _recibo_total(recibo) - (recibo.get("monto_pagado") or 0)


def _aplicar_pago_a_gastos_del_mes(monto, fecha_emision):
    # Distribuye pagos de recibos a gastos del mismo mes (FIFO por fecha/id).
    mes = str(fecha_emision)[:7]
    remaining = float(monto)
    applied = 0.0
    if remaining <= 0:
        return applied, remaining

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT g.id, g.monto, g.fecha_registro, COALESCE(SUM(pg.monto), 0) AS monto_pagado
                FROM gastos g
                LEFT JOIN pagos_gastos pg ON pg.gasto_id = g.id
                WHERE TO_CHAR(g.fecha_registro, 'YYYY-MM') = %s
                GROUP BY g.id, g.monto, g.fecha_registro
                HAVING (g.monto - COALESCE(SUM(pg.monto), 0)) > 0
                ORDER BY g.fecha_registro ASC, g.id ASC
                """,
                [mes],
            )
            gastos = cur.fetchall()

            for gasto in gastos:
                if remaining <= 0:
                    break
                saldo_gasto = float(gasto["monto"]) - float(gasto["monto_pagado"] or 0)
                if saldo_gasto <= 0:
                    continue
                aplicar = min(remaining, saldo_gasto)
                cur.execute(
                    """
                    INSERT INTO pagos_gastos (gasto_id, monto, fecha_pago)
                    VALUES (%s, %s, CURRENT_DATE)
                    """,
                    [gasto["id"], aplicar],
                )
                remaining -= aplicar
                applied += aplicar
        conn.commit()

    return round(applied, 2), round(remaining, 2)


@app.post("/api/recibos/generar")
def generar_recibos():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    body = request.get_json(silent=True) or {}
    fecha_emision = body.get("fecha_emision") or dt.date.today().isoformat()
    mes = body.get("mes") or str(fecha_emision)[:7]

    propietarios = fetch_all(
        """
        SELECT id, nombre, apellido, nro_departamento, torre
        FROM propietarios
        ORDER BY id
        """
    )
    if not propietarios:
        return jsonify({"error": "No hay propietarios registrados"}), 400

    def _sum_por_tipo(tipo):
        row = fetch_one(
            """
            SELECT COALESCE(SUM(monto), 0) AS total
            FROM gastos
            WHERE tipo = %s
              AND TO_CHAR(fecha_registro, 'YYYY-MM') = %s
            """,
            [tipo, mes],
        )
        total_tipo = row["total"] or 0
        if not isinstance(total_tipo, Decimal):
            total_tipo = Decimal(str(total_tipo))
        return total_tipo

    total_agua = _sum_por_tipo("agua")
    total_luz = _sum_por_tipo("luz")
    total_mantenimiento = _sum_por_tipo("mantenimiento")

    divisor = Decimal(len(propietarios))
    monto_administracion = Decimal(str(_get_monto_administracion()))
    monto_agua = (total_agua / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_luz = (total_luz / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_mantenimiento = (total_mantenimiento / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    generados = 0
    recibos = []
    for prop in propietarios:
        existe = fetch_one(
            """
            SELECT id FROM recibos
            WHERE propietario_id = %s
              AND TO_CHAR(fecha_emision, 'YYYY-MM') = %s
            """,
            [prop["id"], mes],
        )
        if existe:
            continue

        recibo = execute_returning(
            """
            INSERT INTO recibos (
                propietario_id, monto_administracion, monto_agua,
                monto_luz, monto_mantenimiento, monto_pagado, fecha_emision, fecha_pago, pagado
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, NULL, FALSE)
            RETURNING id, propietario_id, monto_administracion, monto_agua,
                      monto_luz, monto_mantenimiento, monto_pagado, fecha_emision, fecha_pago, pagado
            """,
            [
                prop["id"],
                monto_administracion,
                monto_agua,
                float(monto_luz),
                float(monto_mantenimiento),
                0,
                fecha_emision,
            ],
        )
        recibo["propietario"] = {
            "nombre": prop["nombre"],
            "apellido": prop["apellido"],
        }
        recibo["nro_departamento"] = prop["nro_departamento"]
        recibo["torre"] = prop["torre"]
        recibo["total"] = _recibo_total(recibo)
        recibo["saldo"] = _recibo_saldo(recibo)
        recibos.append(recibo)
        generados += 1

    return jsonify({"generados": generados, "items": recibos})


@app.post("/api/recibos/recalcular")
def recalcular_recibos():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    body = request.get_json(silent=True) or {}
    mes = body.get("mes")
    if not mes:
        return jsonify({"error": "Mes requerido (YYYY-MM)"}), 400

    propietarios = fetch_all(
        """
        SELECT id FROM propietarios
        ORDER BY id
        """
    )
    if not propietarios:
        return jsonify({"error": "No hay propietarios registrados"}), 400

    def _sum_por_tipo(tipo):
        row = fetch_one(
            """
            SELECT COALESCE(SUM(monto), 0) AS total
            FROM gastos
            WHERE tipo = %s
              AND TO_CHAR(fecha_registro, 'YYYY-MM') = %s
            """,
            [tipo, mes],
        )
        total_tipo = row["total"] or 0
        if not isinstance(total_tipo, Decimal):
            total_tipo = Decimal(str(total_tipo))
        return total_tipo

    total_agua = _sum_por_tipo("agua")
    total_luz = _sum_por_tipo("luz")
    total_mantenimiento = _sum_por_tipo("mantenimiento")

    divisor = Decimal(len(propietarios))
    monto_administracion = Decimal(str(_get_monto_administracion()))
    monto_agua = (total_agua / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_luz = (total_luz / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    monto_mantenimiento = (total_mantenimiento / divisor).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    rows = fetch_all(
        """
        UPDATE recibos
        SET monto_administracion = %s,
            monto_agua = %s,
            monto_luz = %s,
            monto_mantenimiento = %s,
            pagado = CASE
                WHEN monto_pagado >= (%s + %s + %s + %s) THEN TRUE
                ELSE FALSE
            END,
            fecha_pago = CASE
                WHEN monto_pagado >= (%s + %s + %s + %s)
                    THEN COALESCE(fecha_pago, CURRENT_DATE)
                ELSE NULL
            END
        WHERE TO_CHAR(fecha_emision, 'YYYY-MM') = %s
        RETURNING id, propietario_id, monto_administracion, monto_agua, monto_luz,
                  monto_mantenimiento, monto_pagado, fecha_emision, fecha_pago, pagado
        """,
        [
            float(monto_administracion),
            float(monto_agua),
            float(monto_luz),
            float(monto_mantenimiento),
            float(monto_administracion),
            float(monto_agua),
            float(monto_luz),
            float(monto_mantenimiento),
            float(monto_administracion),
            float(monto_agua),
            float(monto_luz),
            float(monto_mantenimiento),
            mes,
        ],
    )

    items = []
    for row in rows:
        recibo = {
            "id": row["id"],
            "propietario_id": row["propietario_id"],
            "monto_administracion": row["monto_administracion"],
            "monto_agua": row["monto_agua"],
            "monto_luz": row["monto_luz"],
            "monto_mantenimiento": row["monto_mantenimiento"],
            "monto_pagado": row["monto_pagado"],
            "fecha_emision": row["fecha_emision"].isoformat(),
            "fecha_pago": row["fecha_pago"].isoformat() if row["fecha_pago"] else None,
            "pagado": row["pagado"],
        }
        recibo["total"] = _recibo_total(recibo)
        recibo["saldo"] = _recibo_saldo(recibo)
        items.append(recibo)

    return jsonify({"actualizados": len(items), "items": items})


@app.delete("/api/recibos/<int:recibo_id>")
def eliminar_recibo(recibo_id):
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    row = execute_returning(
        "DELETE FROM recibos WHERE id = %s RETURNING id",
        [recibo_id],
    )
    if not row:
        return jsonify({"error": "Recibo no encontrado"}), 404
    return jsonify({"deleted": recibo_id})


@app.get("/api/recibos")
def listar_recibos_admin():
    # Usa MatrizRecibos para organizar recibos por mes/propietario.
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    estado = (request.args.get("estado") or "").strip().lower()
    mes_filter = (request.args.get("mes") or "").strip()
    filtros = []
    params = []
    if estado == "pendientes":
        filtros.append("r.pagado = FALSE")
    elif estado == "pagados":
        filtros.append("r.pagado = TRUE")
    if mes_filter:
        filtros.append("TO_CHAR(r.fecha_emision, 'YYYY-MM') = %s")
        params.append(mes_filter)

    where = f"WHERE {' AND '.join(filtros)}" if filtros else ""
    rows = fetch_all(
        f"""
        SELECT r.id, r.propietario_id, r.monto_administracion, r.monto_agua,
               r.monto_luz, r.monto_mantenimiento, r.monto_pagado,
               r.fecha_emision, r.fecha_pago, r.pagado,
               p.nombre, p.apellido, p.nro_departamento, p.torre
        FROM recibos r
        JOIN propietarios p ON p.id = r.propietario_id
        {where}
        ORDER BY r.fecha_emision DESC, r.id DESC
        """,
        params,
    )

    matriz = MatrizRecibos()
    items = []
    resumen = {}
    for row in rows:
        recibo = {
            "id": row["id"],
            "propietario_id": row["propietario_id"],
            "propietario": {"nombre": row["nombre"], "apellido": row["apellido"]},
            "nro_departamento": row["nro_departamento"],
            "torre": row["torre"],
            "monto_administracion": row["monto_administracion"],
            "monto_agua": row["monto_agua"],
            "monto_luz": row["monto_luz"],
            "monto_mantenimiento": row["monto_mantenimiento"],
            "monto_pagado": row.get("monto_pagado", 0),
            "fecha_emision": row["fecha_emision"].isoformat(),
            "fecha_pago": row["fecha_pago"].isoformat() if row["fecha_pago"] else None,
            "pagado": row["pagado"],
        }
        mes = recibo["fecha_emision"][:7]
        matriz.set_recibo(mes, recibo["propietario_id"], recibo)
        recibo["total"] = _recibo_total(recibo)
        recibo["saldo"] = _recibo_saldo(recibo)
        items.append(recibo)

        bucket = resumen.setdefault(mes, {"mes": mes, "emitido": 0, "pagado": 0, "pendiente": 0, "cantidad": 0})
        bucket["emitido"] += recibo["total"]
        bucket["pagado"] += recibo["monto_pagado"] or 0
        bucket["pendiente"] += recibo["saldo"]
        bucket["cantidad"] += 1

    resumen_list = sorted(resumen.values(), key=lambda x: x["mes"], reverse=True)
    return jsonify({"items": items, "resumen_mensual": resumen_list})


@app.get("/api/recibos/propietario/<int:propietario_id>")
def listar_recibos_propietario(propietario_id):
    # Usa MatrizRecibos para organizar recibos por mes/propietario.
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]

    if payload.get("tipo") == "Propietario":
        if str(propietario_id) != str(payload.get("propietario_id")):
            return jsonify({"error": "No autorizado"}), 403

    estado = (request.args.get("estado") or "").strip().lower()
    filtros = ["r.propietario_id = %s"]
    params = [propietario_id]
    if estado == "pendientes":
        filtros.append("r.pagado = FALSE")
    elif estado == "pagados":
        filtros.append("r.pagado = TRUE")

    rows = fetch_all(
        f"""
        SELECT r.id, r.propietario_id, r.monto_administracion, r.monto_agua,
               r.monto_luz, r.monto_mantenimiento, r.monto_pagado,
               r.fecha_emision, r.fecha_pago, r.pagado
        FROM recibos r
        WHERE {' AND '.join(filtros)}
        ORDER BY r.fecha_emision DESC, r.id DESC
        """,
        params,
    )

    matriz = MatrizRecibos()
    items = []
    for row in rows:
        recibo = {
            "id": row["id"],
            "propietario_id": row["propietario_id"],
            "monto_administracion": row["monto_administracion"],
            "monto_agua": row["monto_agua"],
            "monto_luz": row["monto_luz"],
            "monto_mantenimiento": row["monto_mantenimiento"],
            "monto_pagado": row["monto_pagado"],
            "fecha_emision": row["fecha_emision"].isoformat(),
            "fecha_pago": row["fecha_pago"].isoformat() if row["fecha_pago"] else None,
            "pagado": row["pagado"],
        }
        mes = recibo["fecha_emision"][:7]
        matriz.set_recibo(mes, propietario_id, recibo)
        recibo["total"] = _recibo_total(recibo)
        recibo["saldo"] = _recibo_saldo(recibo)
        items.append(recibo)

    return jsonify({"items": items})


@app.post("/api/recibos/<int:recibo_id>/pagar")
def pagar_recibo(recibo_id):
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]

    if payload.get("tipo") == "Propietario":
        recibo = fetch_one(
            "SELECT propietario_id FROM recibos WHERE id = %s",
            [recibo_id],
        )
        if not recibo:
            return jsonify({"error": "Recibo no encontrado"}), 404
        if str(recibo["propietario_id"]) != str(payload.get("propietario_id")):
            return jsonify({"error": "No autorizado"}), 403

    body = request.get_json(silent=True) or {}
    monto = body.get("monto")
    if monto is None:
        return jsonify({"error": "Monto requerido"}), 400
    try:
        monto = float(monto)
    except (TypeError, ValueError):
        return jsonify({"error": "Monto inválido"}), 400
    if monto <= 0:
        return jsonify({"error": "El monto debe ser mayor a cero"}), 400

    current = fetch_one(
        """
        SELECT id, monto_pagado, monto_administracion, monto_agua, monto_luz, monto_mantenimiento
        FROM recibos
        WHERE id = %s
        """,
        [recibo_id],
    )
    if not current:
        return jsonify({"error": "Recibo no encontrado"}), 404
    total_actual = (
        float(current["monto_administracion"])
        + float(current["monto_agua"])
        + float(current["monto_luz"])
        + float(current["monto_mantenimiento"])
    )
    saldo_actual = total_actual - float(current["monto_pagado"] or 0)
    if monto > saldo_actual:
        return jsonify({"error": f"El monto excede el saldo pendiente ({saldo_actual:.2f})"}), 400

    row = execute_returning(
        """
        UPDATE recibos
        SET monto_pagado = monto_pagado + %s,
            pagado = CASE
                WHEN (monto_pagado + %s) >= (monto_administracion + monto_agua + monto_luz + monto_mantenimiento)
                    THEN TRUE
                ELSE FALSE
            END,
            fecha_pago = CASE
                WHEN (monto_pagado + %s) >= (monto_administracion + monto_agua + monto_luz + monto_mantenimiento)
                    THEN CURRENT_DATE
                ELSE NULL
            END
        WHERE id = %s
        RETURNING id, monto_pagado, pagado, fecha_emision, fecha_pago,
                  monto_administracion, monto_agua, monto_luz, monto_mantenimiento
        """,
        [monto, monto, monto, recibo_id],
    )
    if not row:
        return jsonify({"error": "Recibo no encontrado"}), 404
    recibo = {
        "id": row["id"],
        "monto_pagado": row["monto_pagado"],
        "monto_administracion": row["monto_administracion"],
        "monto_agua": row["monto_agua"],
        "monto_luz": row["monto_luz"],
        "monto_mantenimiento": row["monto_mantenimiento"],
        "pagado": row["pagado"],
        "fecha_emision": row["fecha_emision"].isoformat() if row["fecha_emision"] else None,
        "fecha_pago": row["fecha_pago"].isoformat() if row["fecha_pago"] else None,
    }
    aplicado_gastos = 0.0
    saldo_no_aplicado = 0.0
    try:
        aplicado_gastos, saldo_no_aplicado = _aplicar_pago_a_gastos_del_mes(
            monto,
            recibo["fecha_emision"],
        )
    except Exception:
        # No bloquea el pago del recibo si falla el asiento de gastos.
        aplicado_gastos = 0.0
        saldo_no_aplicado = round(float(monto), 2)

    recibo["total"] = _recibo_total(recibo)
    recibo["saldo"] = _recibo_saldo(recibo)
    recibo["aplicado_gastos"] = aplicado_gastos
    recibo["saldo_no_aplicado_gastos"] = saldo_no_aplicado
    return jsonify(recibo)


def _recibos_para_estructuras(mes_filter="", estado=""):
    filtros = []
    params = []
    if estado == "pendientes":
        filtros.append("r.pagado = FALSE")
    elif estado == "pagados":
        filtros.append("r.pagado = TRUE")
    if mes_filter:
        filtros.append("TO_CHAR(r.fecha_emision, 'YYYY-MM') = %s")
        params.append(mes_filter)

    where = f"WHERE {' AND '.join(filtros)}" if filtros else ""
    rows = fetch_all(
        f"""
        SELECT r.id, r.propietario_id, r.monto_administracion, r.monto_agua,
               r.monto_luz, r.monto_mantenimiento, r.monto_pagado,
               r.fecha_emision, r.fecha_pago, r.pagado,
               p.nombre, p.apellido, p.nro_departamento, p.torre
        FROM recibos r
        JOIN propietarios p ON p.id = r.propietario_id
        {where}
        ORDER BY r.fecha_emision DESC, r.id DESC
        """,
        params,
    )

    items = []
    for row in rows:
        recibo = {
            "id": row["id"],
            "propietario_id": row["propietario_id"],
            "propietario": {"nombre": row["nombre"], "apellido": row["apellido"]},
            "nro_departamento": row["nro_departamento"],
            "torre": row["torre"],
            "monto_administracion": row["monto_administracion"],
            "monto_agua": row["monto_agua"],
            "monto_luz": row["monto_luz"],
            "monto_mantenimiento": row["monto_mantenimiento"],
            "monto_pagado": row.get("monto_pagado", 0),
            "fecha_emision": row["fecha_emision"].isoformat(),
            "fecha_pago": row["fecha_pago"].isoformat() if row["fecha_pago"] else None,
            "pagado": row["pagado"],
        }
        recibo["total"] = _recibo_total(recibo)
        recibo["saldo"] = _recibo_saldo(recibo)
        items.append(recibo)
    return items


def _parse_saldo_range():
    saldo_min = request.args.get("saldo_min")
    saldo_max = request.args.get("saldo_max")
    try:
        min_val = float(saldo_min) if saldo_min not in (None, "") else None
        max_val = float(saldo_max) if saldo_max not in (None, "") else None
    except ValueError:
        return None, None, ("Parámetros de saldo inválidos", 400)
    return min_val, max_val, None


def _tree_filtered_items(tree, recorrido, min_val, max_val):
    if min_val is None and max_val is None:
        return tree.recorrer(recorrido)
    if min_val is None:
        min_val = -1e18
    if max_val is None:
        max_val = 1e18
    return tree.rango((float(min_val), -1), (float(max_val), 10**12))


@app.get("/api/recibos/estructura/bst")
def buscar_recibos_bst():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    mes = (request.args.get("mes") or "").strip()
    estado = (request.args.get("estado") or "").strip().lower()
    recorrido = (request.args.get("recorrido") or "inorden").strip().lower()
    if recorrido not in ("inorden", "preorden", "postorden"):
        recorrido = "inorden"

    min_val, max_val, parse_err = _parse_saldo_range()
    if parse_err:
        return jsonify({"error": parse_err[0]}), parse_err[1]

    items = _recibos_para_estructuras(mes, estado)
    tree = ArbolRecibosBST()
    for item in items:
        tree.insertar((float(item["saldo"]), item["id"]), item)

    result = _tree_filtered_items(tree, recorrido, min_val, max_val)
    return jsonify({"estructura": "bst", "total": len(result), "items": result})


@app.get("/api/recibos/estructura/avl")
def buscar_recibos_avl():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    mes = (request.args.get("mes") or "").strip()
    estado = (request.args.get("estado") or "").strip().lower()
    recorrido = (request.args.get("recorrido") or "inorden").strip().lower()
    if recorrido not in ("inorden", "preorden", "postorden"):
        recorrido = "inorden"

    min_val, max_val, parse_err = _parse_saldo_range()
    if parse_err:
        return jsonify({"error": parse_err[0]}), parse_err[1]

    items = _recibos_para_estructuras(mes, estado)
    tree = ArbolRecibosAVL()
    for item in items:
        tree.insertar((float(item["saldo"]), item["id"]), item)

    result = _tree_filtered_items(tree, recorrido, min_val, max_val)
    return jsonify({"estructura": "avl", "total": len(result), "items": result})


@app.get("/api/recibos/morosos/prioridad")
def morosos_prioridad():
    payload, err = _get_payload()
    if err:
        return jsonify({"error": err[0]}), err[1]
    role_err = _require_roles(payload, "Administrador")
    if role_err:
        return jsonify({"error": role_err[0]}), role_err[1]

    mes = (request.args.get("mes") or "").strip()
    limit = request.args.get("limit", "5")
    try:
        limit = max(1, min(int(limit), 100))
    except ValueError:
        limit = 5

    pendientes = _recibos_para_estructuras(mes, "pendientes")
    hoy = dt.date.today()
    cola = ColaPrioridadMorosos()
    for r in pendientes:
        fecha = dt.date.fromisoformat(r["fecha_emision"][:10])
        dias = max((hoy - fecha).days, 0)
        cola.enqueue(
            {
                "recibo_id": r["id"],
                "propietario_id": r["propietario_id"],
                "propietario": r["propietario"],
                "nro_departamento": r["nro_departamento"],
                "torre": r["torre"],
                "saldo": float(r["saldo"]),
                "dias_pendiente": dias,
                "fecha_emision": r["fecha_emision"],
            }
        )

    items = cola.to_sorted_list(limit=limit)
    return jsonify({"total": len(items), "items": items})


if __name__ == "__main__":
    app.run(debug=True)
