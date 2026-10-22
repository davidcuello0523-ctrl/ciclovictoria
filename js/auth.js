// =========================================================
// CicloVictoria · auth.js
// Sesión y roles con Supabase Auth. Cada usuario ("pacho") existe en Supabase
// como pacho@DOMINIO_USUARIOS. Lo que de verdad protege los datos son las
// políticas RLS de supabase.sql; la sesión del navegador solo cambia las vistas.
// =========================================================

import { USUARIOS, ROLES, CLAVES, MAX_INTENTOS_LOGIN, SEGUNDOS_BLOQUEO, DOMINIO_USUARIOS } from "./config.js";
import { leerLocal, guardarLocal, borrarLocal } from "./datos.js";
import { cliente, nubeConfigurada } from "./nube.js";

export { ROLES };

const correoDe = (usuario) => `${usuario}@${DOMINIO_USUARIOS}`;
const SIN_NUBE = "Falta configurar Supabase en js/config.js (SUPABASE_URL y SUPABASE_CLAVE_PUBLICA).";

// ---------- Bloqueo por intentos fallidos (además del límite de Supabase) ----------
export function estadoBloqueo() {
  const bloqueo = leerLocal(CLAVES.bloqueo, { intentos: 0, hasta: 0 });
  const restante = Math.max(0, Math.ceil((bloqueo.hasta - Date.now()) / 1000));
  return { ...bloqueo, bloqueado: restante > 0, segundosRestantes: restante };
}

function registrarFallo() {
  const bloqueo = estadoBloqueo();
  const intentos = (bloqueo.bloqueado ? 0 : bloqueo.intentos) + 1;
  if (intentos >= MAX_INTENTOS_LOGIN) {
    guardarLocal(CLAVES.bloqueo, { intentos: 0, hasta: Date.now() + SEGUNDOS_BLOQUEO * 1000 });
    return { bloqueado: true, restantes: 0 };
  }
  guardarLocal(CLAVES.bloqueo, { intentos, hasta: 0 });
  return { bloqueado: false, restantes: MAX_INTENTOS_LOGIN - intentos };
}

function falloDeIngreso(texto) {
  const fallo = registrarFallo();
  if (fallo.bloqueado) {
    return { ok: false, bloqueado: true, segundos: SEGUNDOS_BLOQUEO,
      error: `Demasiados intentos fallidos. Espera ${SEGUNDOS_BLOQUEO} segundos.` };
  }
  return { ok: false, error: `${texto} Te quedan ${fallo.restantes} intentos.` };
}

function bloqueoActivo() {
  const bloqueo = estadoBloqueo();
  return bloqueo.bloqueado
    ? { ok: false, bloqueado: true, segundos: bloqueo.segundosRestantes, error: `Demasiados intentos. Espera ${bloqueo.segundosRestantes} s.` }
    : null;
}

// ---------- Sesión ----------

/**
 * Intenta iniciar sesión.
 * Devuelve { ok: true, sesion } o { ok: false, error, bloqueado, segundos }
 */
export async function iniciarSesion(usuario, contrasena, recordar = false) {
  const bloqueado = bloqueoActivo();
  if (bloqueado) return bloqueado;
  if (!nubeConfigurada()) return { ok: false, error: SIN_NUBE };

  const nombreUsuario = String(usuario || "").trim().toLowerCase();
  const registro = USUARIOS.find(u => u.usuario === nombreUsuario);
  if (!registro) return falloDeIngreso("Usuario o contraseña incorrectos.");

  const sb = await cliente();
  const { error } = await sb.auth.signInWithPassword({ email: correoDe(nombreUsuario), password: contrasena || "" });
  if (error) {
    if (error.status === 400) return falloDeIngreso("Usuario o contraseña incorrectos.");
    return { ok: false, error: `No se pudo conectar con el servidor: ${error.message}` };
  }

  borrarLocal(CLAVES.bloqueo);
  const sesion = {
    usuario: registro.usuario,
    nombre: registro.nombre,
    nombreCorto: registro.nombreCorto ?? registro.nombre.split(" ")[0],
    rol: registro.rol,
    inicio: new Date().toISOString(),
    recordar
  };
  // "Recordarme" guarda en localStorage; si no, solo dura la pestaña (sessionStorage)
  borrarLocal(CLAVES.sesion);
  borrarLocal(CLAVES.sesion, "sesion");
  guardarLocal(CLAVES.sesion, sesion, recordar ? "local" : "sesion");
  return { ok: true, sesion };
}

export function obtenerSesion() {
  return leerLocal(CLAVES.sesion, null, "sesion") ?? leerLocal(CLAVES.sesion, null, "local");
}

/** Nombre para la ficha del header (las sesiones viejas no lo traen guardado) */
export function nombreCortoDe(sesion) {
  return sesion.nombreCorto ?? USUARIOS.find(u => u.usuario === sesion.usuario)?.nombreCorto ?? sesion.nombre.split(" ")[0];
}

export function esAdmin(sesion = obtenerSesion()) {
  return sesion?.rol === ROLES.ADMIN;
}

/** Datos mínimos del administrador para el historial */
export function adminActual() {
  const s = obtenerSesion();
  return s ? { usuario: s.usuario, nombre: s.nombre } : null;
}

export async function cerrarSesion(destino = "index.html") {
  borrarLocal(CLAVES.sesion);
  borrarLocal(CLAVES.sesion, "sesion");
  const sb = await cliente();
  await sb?.auth.signOut().catch(() => {});
  window.location.href = destino;
}

/** Para admin.html: si no hay administrador, redirige al login */
export function protegerAdmin() {
  const sesion = obtenerSesion();
  if (!esAdmin(sesion)) {
    window.location.replace("login.html");
    return null;
  }
  return sesion;
}

// ---------- Contraseñas ----------

/** Cambio de contraseña desde el Perfil: se confirma la actual volviendo a ingresar */
export async function cambiarContrasena(usuario, actual, nueva) {
  if (!nueva || nueva.length < 6) return { ok: false, error: "La nueva contraseña debe tener al menos 6 caracteres." };
  if (!nubeConfigurada()) return { ok: false, error: SIN_NUBE };
  const sb = await cliente();
  const { error: errorActual } = await sb.auth.signInWithPassword({ email: correoDe(usuario), password: actual || "" });
  if (errorActual) return { ok: false, error: "La contraseña actual no es correcta." };
  const { error } = await sb.auth.updateUser({ password: nueva });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** "¿Olvidaste tu contraseña?": usuario + código de recuperación (se verifica en Supabase) */
export async function recuperarContrasena(usuario, codigo, nueva) {
  const bloqueado = bloqueoActivo();
  if (bloqueado) return bloqueado;
  if (!nueva || nueva.length < 6) return { ok: false, error: "La nueva contraseña debe tener al menos 6 caracteres." };
  if (!nubeConfigurada()) return { ok: false, error: SIN_NUBE };
  const sb = await cliente();
  const { data: ok, error } = await sb.rpc("recuperar_clave", {
    p_usuario: String(usuario || "").trim().toLowerCase(),
    p_codigo: String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, ""),
    p_nueva: nueva
  });
  if (error) return { ok: false, error: error.message };
  if (!ok) return falloDeIngreso("Usuario o código de recuperación incorrectos.");
  borrarLocal(CLAVES.bloqueo);
  return { ok: true };
}

/** Un administrador conectado restablece la contraseña de otro, sin conocer la anterior */
export async function restablecerContrasenaDe(usuario, nueva) {
  if (!esAdmin()) return { ok: false, error: "Solo un administrador puede restablecer contraseñas." };
  if (!USUARIOS.some(u => u.usuario === usuario)) return { ok: false, error: "Ese usuario no existe." };
  if (!nueva || nueva.length < 6) return { ok: false, error: "La nueva contraseña debe tener al menos 6 caracteres." };
  const sb = await cliente();
  if (!sb) return { ok: false, error: SIN_NUBE };
  const { error } = await sb.rpc("restablecer_clave", { p_usuario: usuario, p_nueva: nueva });
  return error ? { ok: false, error: error.message } : { ok: true };
}
