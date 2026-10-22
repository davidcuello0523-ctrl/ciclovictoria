// =========================================================
// CicloVictoria · nube.js
// Guardado en Supabase: cada clave del inventario que se guarda en el navegador
// también se sube a la tabla "datos" (clave → valor JSON). Al entrar como
// administrador se baja lo último, así cualquier PC ve los mismos datos.
// La seguridad la ponen las políticas RLS de supabase.sql, no este archivo.
// =========================================================

import { SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, CLAVES } from "./config.js";

/** Claves que viven en la nube (las de sesión, tema y bloqueo se quedan en el navegador) */
export const CLAVES_NUBE = [
  CLAVES.productos, CLAVES.proveedores, CLAVES.historial, CLAVES.meta, CLAVES.configuracion,
  CLAVES.cotizaciones, CLAVES.seriales, CLAVES.garantias, CLAVES.ordenes
];
export const CLAVE_CATALOGO_PUBLICO = "catalogo_publico";

export const nubeConfigurada = () => Boolean(SUPABASE_URL && SUPABASE_CLAVE_PUBLICA);

let clientePromesa = null;
export function cliente() {
  if (!nubeConfigurada()) return Promise.resolve(null);
  clientePromesa ??= import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm")
    .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA));
  return clientePromesa;
}

// ---------- Subida (agrupada: muchos cambios seguidos = una sola escritura) ----------
const pendientes = new Map();
let temporizador = null;

export function subir(clave, valor) {
  if (!nubeConfigurada()) return;
  pendientes.set(clave, valor);
  clearTimeout(temporizador);
  temporizador = setTimeout(vaciarPendientes, 800);
}

async function vaciarPendientes() {
  const filas = [...pendientes].map(([clave, valor]) => ({ clave, valor, actualizado: new Date().toISOString() }));
  pendientes.clear();
  if (!filas.length) return;
  const sb = await cliente();
  const { error } = await sb.from("datos").upsert(filas);
  if (error) {
    // Se reintenta en el próximo cambio; el dato sigue a salvo en este navegador.
    filas.forEach(f => pendientes.has(f.clave) || pendientes.set(f.clave, f.valor));
    console.error("[Nube] No se pudo guardar:", error.message);
    window.dispatchEvent(new CustomEvent("cv:nube-error", { detail: error.message }));
  }
}

// Si se cierra la pestaña con cambios sin subir, se avisa.
window.addEventListener("beforeunload", (e) => {
  if (pendientes.size) { vaciarPendientes(); e.preventDefault(); }
});

/** Baja todas las claves de la nube. Devuelve { clave: valor } (vacío si no hay sesión o falla). */
export async function bajarTodo() {
  const sb = await cliente();
  if (!sb) return {};
  const { data, error } = await sb.from("datos").select("clave, valor").in("clave", CLAVES_NUBE);
  if (error) {
    console.warn("[Nube] No se pudieron bajar los datos:", error.message);
    return {};
  }
  return Object.fromEntries(data.map(f => [f.clave, f.valor]));
}

/** Catálogo sin precios ni costos (lo puede leer cualquier visitante) */
export async function bajarCatalogoPublico() {
  const sb = await cliente();
  if (!sb) return null;
  const { data, error } = await sb.from("datos").select("valor").eq("clave", CLAVE_CATALOGO_PUBLICO).maybeSingle();
  return error ? null : data?.valor ?? null;
}
