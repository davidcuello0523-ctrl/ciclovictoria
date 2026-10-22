// =========================================================
// CicloVictoria · ui.js
// Componentes compartidos: elementos seguros, íconos, logo, toasts,
// modales, lightbox, skeletons, historial, uploader y la tarjeta
// de producto horizontal y desplegable.
// Regla: todo texto de datos se inserta con textContent.
// =========================================================

import {
  NOMBRE_MARCA, CLAVES, PRODUCTOS_POR_PAGINA, MAX_ESCALONADAS,
  IMAGEN_MAX_MB, IMAGEN_MAX_PX, IMAGEN_CALIDAD, IMAGENES_CATEGORIA, IMAGENES_MODELO,
  IMAGEN_BICICLETA_INFANTIL, RINES_INFANTILES
} from "./config.js";
import {
  leerLocal, guardarLocal, TEXTO_ESTADO, estadoStock, calcularMargen, calcularUtilidad,
  estadoMargen, valorVenta, valorCosto, productosCompatibles, margenMinimoPara, serialesDeProducto
} from "./datos.js";
import { precioFinal, precioSinIva, llevaIva, REGLA_IVA, PORCENTAJE_IVA, TEXTO_IVA_INCLUIDO } from "./precios.js";

// =========================================================
// Creación segura de elementos
// =========================================================

/**
 * el("div", { class: "x", dataset: { id: 1 }, "aria-label": "…", onclick: fn }, "texto", nodo…)
 * Los hijos de tipo string se agregan como nodos de texto (nunca HTML).
 */
export function el(etiqueta, props = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props || {})) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === "class") nodo.className = valor;
    else if (clave === "dataset") Object.assign(nodo.dataset, valor);
    else if (clave === "style" && typeof valor === "object") {
      for (const [prop, v] of Object.entries(valor)) {
        if (prop.startsWith("--")) nodo.style.setProperty(prop, v);
        else nodo.style[prop] = v;
      }
    }
    else if (clave.startsWith("on") && typeof valor === "function") nodo.addEventListener(clave.slice(2), valor);
    else if (clave === "text") nodo.textContent = valor;
    else if (valor === true) nodo.setAttribute(clave, "");
    else if (clave in nodo && !clave.includes("-") && clave !== "list" && clave !== "form") nodo[clave] = valor;
    else nodo.setAttribute(clave, valor);
  }
  agregarHijos(nodo, hijos);
  return nodo;
}

function agregarHijos(nodo, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

const NS_SVG = "http://www.w3.org/2000/svg";

/** SVG desde una lista de formas estáticas (nunca datos del usuario) */
export function svg(viewBox, formas, atributos = {}) {
  const raiz = document.createElementNS(NS_SVG, "svg");
  raiz.setAttribute("viewBox", viewBox);
  raiz.setAttribute("fill", "none");
  raiz.setAttribute("stroke", "currentColor");
  raiz.setAttribute("stroke-width", "2");
  raiz.setAttribute("stroke-linecap", "round");
  raiz.setAttribute("stroke-linejoin", "round");
  raiz.setAttribute("aria-hidden", "true");
  raiz.setAttribute("focusable", "false");
  for (const [k, v] of Object.entries(atributos)) raiz.setAttribute(k, v);
  for (const forma of formas) raiz.append(crearForma(forma));
  return raiz;
}

function crearForma(forma) {
  if (typeof forma === "string") forma = { tag: "path", d: forma };
  const { tag = "path", hijos = [], ...atributos } = forma;
  const nodo = document.createElementNS(NS_SVG, tag);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === "estilo") nodo.setAttribute("style", v);
    else nodo.setAttribute(k, v);
  }
  for (const h of hijos) nodo.append(crearForma(h));
  return nodo;
}

// =========================================================
// Íconos (trazo 24×24)
// =========================================================

const ICONOS = {
  buscar: ["M21 21l-4.35-4.35", { tag: "circle", cx: 11, cy: 11, r: 7 }],
  chevron: ["M6 9l6 6 6-6"],
  cerrar: ["M18 6L6 18M6 6l12 12"],
  editar: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"],
  eliminar: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6", "M10 11v6M14 11v6"],
  estrella: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"],
  ojo: ["M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z", { tag: "circle", cx: 12, cy: 12, r: 3 }],
  ojoTachado: ["M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94", "M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19", "M1 1l22 22"],
  caja: ["M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z", "M3.27 6.96L12 12.01l8.73-5.05", "M12 22.08V12"],
  mas: ["M12 5v14M5 12h14"],
  menos: ["M5 12h14"],
  menu: ["M3 6h18M3 12h18M3 18h18"],
  luna: ["M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"],
  sol: [{ tag: "circle", cx: 12, cy: 12, r: 5 }, "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"],
  salir: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  usuario: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", { tag: "circle", cx: 12, cy: 7, r: 4 }],
  subir: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],
  descargar: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  recargar: ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"],
  check: ["M20 6L9 17l-5-5"],
  alerta: ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4M12 17h.01"],
  info: [{ tag: "circle", cx: 12, cy: 12, r: 10 }, "M12 16v-4M12 8h.01"],
  error: [{ tag: "circle", cx: 12, cy: 12, r: 10 }, "M15 9l-6 6M9 9l6 6"],
  filtro: ["M22 3H2l8 9.46V19l4 2v-8.54L22 3z"],
  imagen: ["M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z", { tag: "circle", cx: 8.5, cy: 8.5, r: 1.5 }, "M21 15l-5-5L5 21"],
  carrito: [{ tag: "circle", cx: 9, cy: 21, r: 1 }, { tag: "circle", cx: 20, cy: 21, r: 1 }, "M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"],
  reloj: [{ tag: "circle", cx: 12, cy: 12, r: 10 }, "M12 6v6l4 2"],
  flechaDerecha: ["M5 12h14M12 5l7 7-7 7"],
  qr: [{ tag: "rect", x: 3, y: 3, width: 7, height: 7 }, { tag: "rect", x: 14, y: 3, width: 7, height: 7 }, { tag: "rect", x: 3, y: 14, width: 7, height: 7 }, "M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v3h-3zM20 20v.01"],
  escaner: ["M3 7V5a2 2 0 0 1 2-2h2", "M17 3h2a2 2 0 0 1 2 2v2", "M21 17v2a2 2 0 0 1-2 2h-2", "M7 21H5a2 2 0 0 1-2-2v-2", "M7 12h10"],
  imprimir: ["M6 9V2h12v7", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", { tag: "rect", x: 6, y: 14, width: 12, height: 8 }],
  grafico: ["M18 20V10", "M12 20V4", "M6 20v-6"],
  tienda: ["M3 9l1.5-5h15L21 9", "M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z", "M5 13v8h14v-8"],
  herramienta: ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"]
};

export function icono(nombre, atributos = {}) {
  return svg("0 0 24 24", ICONOS[nombre] ?? ICONOS.info, atributos);
}

/** Botón redondo de ícono con aria-label obligatorio */
export function botonIcono(nombreIcono, etiqueta, { class: clase = "", ...props } = {}) {
  return el("button", { type: "button", class: `boton-icono ${clase}`.trim(), "aria-label": etiqueta, title: etiqueta, ...props }, icono(nombreIcono));
}

// =========================================================
// Logo e ilustraciones
// =========================================================

/** Bicicleta de trazo lineal (viewBox 64×40). animado = se dibuja trazo a trazo */
export function crearIconoBici({ animado = false, clase = "" } = {}) {
  const rueda = (cx, retraso) => ({
    tag: "g", class: "rueda", hijos: [
      { tag: "circle", cx, cy: 27, r: 10, class: "trazo", estilo: `--largo:63;--retraso:${retraso}s` },
      // Radios solo en la versión animada, para que se note el giro
      ...(animado ? [{ tag: "path", d: `M${cx} 20v14M${cx - 7} 27h14`, "stroke-width": "1", opacity: ".45", class: "trazo", estilo: `--largo:28;--retraso:${retraso + .4}s` }] : [])
    ]
  });
  const icono = svg("0 0 64 40", [
    rueda(13, 0),
    rueda(51, .15),
    { tag: "path", d: "M13 27L29 27L24 12Z M24 12L45 12L29 27 M45 12L51 27", class: "trazo", estilo: "--largo:150;--retraso:.3s" },
    { tag: "path", d: "M24 12L22 7M18 7H27M45 12L43 6H49", class: "trazo", estilo: "--largo:40;--retraso:.8s" },
    { tag: "circle", cx: 29, cy: 27, r: 2.4, fill: "var(--acento)", stroke: "none" }
  ], { class: `${animado ? "logo-animado" : ""} ${clase}`.trim(), "stroke-width": "2.4" });
  return icono;
}

/** Logo completo: ícono + "Ciclo" regular + "Victoria" negrita */
export function crearLogo({ animado = false, enlace = null } = {}) {
  const texto = el("span", { class: "logo-texto" },
    el("span", { class: "regular" }, "Ciclo"),
    el("span", { class: "negrita" }, "Victoria"));
  const contenido = [crearIconoBici({ animado }), texto];
  return enlace
    ? el("a", { class: "logo", href: enlace, "aria-label": `${NOMBRE_MARCA}, ir al inicio` }, ...contenido)
    : el("span", { class: "logo" }, ...contenido);
}

/** Ilustración lineal para estados vacíos (bici o moto) */
export function ilustracion(linea = "Bicicleta") {
  if (linea === "Moto") {
    return svg("0 0 120 70", [
      { tag: "circle", cx: 24, cy: 50, r: 15 }, { tag: "circle", cx: 96, cy: 50, r: 15 },
      "M24 50L46 30H70L80 44H96", "M70 30L62 18H52", "M80 44L88 22H98", "M46 30L56 44H80",
      { tag: "circle", cx: 96, cy: 50, r: 3, fill: "var(--acento)", stroke: "none" }
    ], { "stroke-width": "2.2" });
  }
  return svg("0 0 64 40", [
    { tag: "circle", cx: 13, cy: 27, r: 10 }, { tag: "circle", cx: 51, cy: 27, r: 10 },
    "M13 27L29 27L24 12Z M24 12L45 12L29 27 M45 12L51 27", "M24 12L22 7M18 7H27M45 12L43 6H49",
    { tag: "circle", cx: 29, cy: 27, r: 2.4, fill: "var(--acento)", stroke: "none" }
  ], { "stroke-width": "1.8" });
}

// Placeholders de imagen (SVG estático en data URI, sin datos del usuario)
const PLACEHOLDER_BICI = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff"/><g transform="translate(16 38)" fill="none" stroke="#CFCFCA" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" transform-origin="0 0"><g transform="scale(1.37)"><circle cx="13" cy="27" r="10"/><circle cx="51" cy="27" r="10"/><path d="M13 27L29 27L24 12Z M24 12L45 12L29 27 M45 12L51 27M24 12L22 7M18 7H27M45 12L43 6H49"/></g></g></svg>`);
const PLACEHOLDER_MOTO = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff"/><g transform="translate(8 30) scale(.87)" fill="none" stroke="#CFCFCA" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="50" r="15"/><circle cx="96" cy="50" r="15"/><path d="M24 50L46 30H70L80 44H96M70 30L62 18H52M80 44L88 22H98M46 30L56 44H80"/></g></svg>`);

export const placeholderLinea = linea => (linea === "Moto" ? PLACEHOLDER_MOTO : PLACEHOLDER_BICI);

/**
 * Qué imagen mostrar y de qué tipo es:
 * "propia" (subida por el admin) → "modelo" (foto del modelo de bicicleta) →
 * "categoria" (foto ilustrativa) → "placeholder" (dibujo).
 */
export function infoImagen(producto) {
  if (producto.imagen) return { src: producto.imagen, tipo: "propia" };
  const nombre = String(producto.nombre ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (producto.categoria === "Bicicletas") {
    const modelo = IMAGENES_MODELO.find(m => m.patron.test(nombre));
    if (modelo) return { src: modelo.imagen, tipo: "modelo", modelo: modelo.modelo };
    // Una bicicleta infantil no debe ilustrarse con una de montaña de adulto
    if (RINES_INFANTILES.includes(producto.talla)) return { src: IMAGEN_BICICLETA_INFANTIL, tipo: "categoria" };
  }
  const categoria = IMAGENES_CATEGORIA[producto.categoria];
  if (categoria) return { src: categoria, tipo: "categoria" };
  return { src: placeholderLinea(producto.linea), tipo: "placeholder" };
}

export function imagenProducto(producto) {
  return infoImagen(producto).src;
}

/** Si una imagen no carga, se reemplaza por el dibujo de la línea (una sola vez) */
export function respaldoImagen(linea) {
  return evento => {
    const img = evento.target;
    if (img.dataset.respaldo) return;
    img.dataset.respaldo = "1";
    img.src = placeholderLinea(linea);
  };
}

/** Texto que aclara que la foto no es del producto exacto */
export function leyendaImagen(producto, info = infoImagen(producto)) {
  if (info.tipo === "modelo") return `Foto de referencia del modelo ${info.modelo}. El color y los accesorios pueden variar.`;
  if (info.tipo === "categoria") return `Imagen ilustrativa de la categoría ${producto.categoria}; no corresponde al producto exacto.`;
  return "";
}

// =========================================================
// Formatos
// =========================================================

const formatoMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const formatoEntero = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const formatoRelativo = new Intl.RelativeTimeFormat("es", { numeric: "auto", style: "short" });
const formatoFecha = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const formatoCOP = v => (v === null || v === undefined || Number.isNaN(v) ? "—" : formatoMoneda.format(v));
export const formatoNumero = v => formatoEntero.format(v || 0);
export const formatoPorcentaje = v => (v === null || v === undefined ? "—" : `${v.toFixed(1).replace(".", ",")} %`);
export const fechaLarga = iso => formatoFecha.format(new Date(iso));

/** "hace 2 h", "ayer", "hace 3 días"… */
export function fechaRelativa(iso) {
  const segundos = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const unidades = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [unidad, s] of unidades) {
    if (Math.abs(segundos) >= s) return formatoRelativo.format(Math.round(segundos / s), unidad);
  }
  return "hace un momento";
}

/** Abreviación de números grandes para KPIs: $1.090 M */
export function formatoCompacto(v) {
  return new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "COP" }).format(v || 0);
}

// =========================================================
// Tema claro / oscuro
// =========================================================

/** Botón de sol/luna de la página (opcional; en el panel el tema está en el menú de cuenta) */
let botonTema = null;

export function iniciarTema(boton = null) {
  botonTema = boton;
  aplicarTema(leerLocal(CLAVES.tema, "claro"));
  boton?.addEventListener("click", alternarTema);
}

export function alternarTema() {
  const nuevo = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro";
  aplicarTema(nuevo);
  guardarLocal(CLAVES.tema, nuevo);
}

function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema;
  const boton = botonTema;
  if (boton) {
    boton.replaceChildren(icono(tema === "oscuro" ? "sol" : "luna"));
    const etiqueta = tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    boton.setAttribute("aria-label", etiqueta);
    boton.title = etiqueta;
  }
}

export const prefiereMenosMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Reinicia la animación de entrada de una sección */
export function animarEntrada(nodo) {
  nodo.classList.remove("seccion-entrando");
  void nodo.offsetWidth; // fuerza reflujo para reiniciar la animación
  nodo.classList.add("seccion-entrando");
}

// =========================================================
// Toasts
// =========================================================

let zonaToasts = null;
const ICONO_TOAST = { exito: "check", error: "error", advertencia: "alerta", info: "info" };

export function toast(mensaje, tipo = "info", duracion = 4000) {
  if (!zonaToasts) {
    zonaToasts = el("div", { class: "zona-toasts", role: "status", "aria-live": "polite" });
    document.body.append(zonaToasts);
  }
  const cerrar = () => {
    nodo.classList.add("saliendo");
    setTimeout(() => nodo.remove(), prefiereMenosMovimiento() ? 0 : 230);
  };
  const nodo = el("div", { class: `toast toast-${tipo}`, role: tipo === "error" ? "alert" : "status" },
    icono(ICONO_TOAST[tipo] ?? "info"),
    el("p", {}, mensaje),
    botonIcono("cerrar", "Cerrar aviso", { onclick: cerrar }));
  zonaToasts.append(nodo);
  const temporizador = setTimeout(cerrar, duracion);
  nodo.addEventListener("mouseenter", () => clearTimeout(temporizador), { once: true });
  nodo.addEventListener("mouseleave", () => setTimeout(cerrar, 1500), { once: true });
}

// =========================================================
// Modales (foco atrapado, Esc, clic fuera, botón X)
// =========================================================

const pilaModales = [];
const SELECTOR_ENFOCABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * abrirModal({ titulo, contenido: Node, acciones: [{ texto, clase, alHacerClic, tipo }], ancho, alCerrar })
 * alHacerClic puede devolver false (o una promesa con false) para no cerrar.
 */
export function abrirModal({ titulo, contenido, acciones = [], ancho = false, alCerrar = null, etiquetaCerrar = "Cerrar" }) {
  const focoAnterior = document.activeElement;
  const idTitulo = `modal-titulo-${Date.now()}`;
  const cuerpo = el("div", { class: "modal-cuerpo" }, contenido);
  const pie = acciones.length ? el("div", { class: "modal-pie" }) : null;
  const caja = el("div", { class: `modal ${ancho ? "ancho" : ""}`, role: "dialog", "aria-modal": "true", "aria-labelledby": idTitulo },
    el("div", { class: "modal-cabecera" },
      el("h2", { id: idTitulo }, titulo),
      botonIcono("cerrar", etiquetaCerrar, { onclick: () => cerrar() })),
    cuerpo, pie);
  const fondo = el("div", { class: "modal-fondo" }, caja);

  let cerrado = false;
  function cerrar(resultado) {
    if (cerrado) return;
    cerrado = true;
    pilaModales.splice(pilaModales.indexOf(api), 1);
    fondo.classList.add("cerrando");
    setTimeout(() => {
      fondo.remove();
      if (!pilaModales.length) document.body.style.overflow = "";
    }, prefiereMenosMovimiento() ? 0 : 170);
    focoAnterior?.focus?.();
    alCerrar?.(resultado);
  }

  for (const accion of acciones) {
    const boton = el("button", { type: accion.tipo ?? "button", class: `boton ${accion.clase ?? "boton-secundario"}` }, accion.texto);
    boton.addEventListener("click", async () => {
      const r = accion.alHacerClic ? await accion.alHacerClic(api) : undefined;
      if (r !== false) cerrar(accion.valor);
    });
    pie.append(boton);
  }

  // Clic fuera de la caja
  fondo.addEventListener("mousedown", e => { if (e.target === fondo) cerrar(); });
  // Esc y foco atrapado
  fondo.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.stopPropagation(); cerrar(); return; }
    if (e.key !== "Tab") return;
    const enfocables = [...caja.querySelectorAll(SELECTOR_ENFOCABLE)].filter(n => n.offsetParent !== null);
    if (!enfocables.length) return;
    const primero = enfocables[0], ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  });

  document.body.append(fondo);
  document.body.style.overflow = "hidden";
  const api = { cerrar, fondo, caja, cuerpo, pie };
  pilaModales.push(api);
  // Enfoca el primer campo, o el primer botón
  requestAnimationFrame(() => {
    const primerCampo = cuerpo.querySelector("input, select, textarea") ?? caja.querySelector(SELECTOR_ENFOCABLE);
    primerCampo?.focus();
  });
  return api;
}

/** Modal de confirmación propio. Devuelve una promesa con true/false */
export function confirmar({ titulo = "¿Estás seguro?", mensaje = "", aceptar = "Aceptar", cancelar = "Cancelar", peligro = false }) {
  return new Promise(resolver => {
    let respuesta = false;
    abrirModal({
      titulo,
      contenido: el("p", { class: "texto-suave" }, mensaje),
      acciones: [
        { texto: cancelar, clase: "boton-secundario" },
        { texto: aceptar, clase: peligro ? "boton-peligro" : "boton-acento", alHacerClic: () => { respuesta = true; } }
      ],
      alCerrar: () => resolver(respuesta)
    });
  });
}

/** Imagen en pantalla completa */
export function abrirLightbox(src, alt = "") {
  const focoAnterior = document.activeElement;
  const cerrarBtn = botonIcono("cerrar", "Cerrar imagen");
  const caja = el("div", { class: "lightbox", role: "dialog", "aria-modal": "true", "aria-label": alt || "Imagen ampliada" },
    el("img", { src, alt }), cerrarBtn);
  const cerrar = () => { caja.remove(); document.removeEventListener("keydown", teclas); focoAnterior?.focus?.(); };
  const teclas = e => { if (e.key === "Escape") cerrar(); };
  caja.addEventListener("click", cerrar);
  document.addEventListener("keydown", teclas);
  document.body.append(caja);
  cerrarBtn.focus();
}

// =========================================================
// Skeletons y estados vacíos
// =========================================================

export function crearSkeletons(cantidad = 4) {
  return Array.from({ length: cantidad }, () =>
    el("div", { class: "skeleton-tarjeta", "aria-hidden": "true" },
      el("div", { class: "skeleton sk-img" }),
      el("div", { class: "sk-lineas" },
        el("div", { class: "skeleton sk-linea", style: { width: "40%" } }),
        el("div", { class: "skeleton sk-linea", style: { width: "85%", height: "18px" } }),
        el("div", { class: "skeleton sk-linea", style: { width: "30%" } })),
      el("div", { class: "sk-lineas" },
        el("div", { class: "skeleton sk-linea", style: { width: "70%" } }),
        el("div", { class: "skeleton sk-linea", style: { height: "38px", borderRadius: "99px" } }))));
}

export function estadoVacio({ titulo = "Sin resultados", mensaje = "", linea = "Bicicleta", accion = null } = {}) {
  return el("div", { class: "estado-vacio" },
    ilustracion(linea),
    el("strong", {}, titulo),
    mensaje ? el("p", {}, mensaje) : null,
    accion);
}

// =========================================================
// Historial compacto desplegable
// =========================================================

export function filaHistorial(entrada) {
  return el("div", { class: "entrada-historial" },
    el("span", { class: "punto", "aria-hidden": "true" }),
    el("div", {},
      el("div", {}, entrada.descripcion),
      el("div", { class: "detalle" },
        [entrada.detalle, `${entrada.admin} · ${fechaRelativa(entrada.fecha)}`].filter(Boolean).join(" · ")),
    ));
}

/**
 * crearHistorial(entradas, { visibles: 3 })
 * Muestra el último movimiento en el <summary> y el resto al desplegar,
 * de `visibles` en `visibles` con un botón "Ver más".
 */
export function crearHistorial(entradas = [], { visibles = 3, titulo = "Historial" } = {}) {
  if (!entradas.length) {
    return el("div", { class: "historial" }, el("p", { class: "historial-vacio" }, "Sin movimientos registrados todavía."));
  }
  const [ultima, ...resto] = entradas;
  const lista = el("div", {});
  const verMas = el("button", { type: "button", class: "boton boton-fantasma boton-pequeno", style: { margin: "4px 12px 10px" } });
  let mostradas = 0;
  const mostrarMas = () => {
    resto.slice(mostradas, mostradas + visibles).forEach(e => lista.append(filaHistorial(e)));
    mostradas += visibles;
    const faltan = resto.length - mostradas;
    verMas.hidden = faltan <= 0;
    verMas.textContent = `Ver ${Math.min(faltan, visibles)} más`;
  };
  verMas.addEventListener("click", mostrarMas);
  mostrarMas();

  const resumen = el("summary", {},
    icono("reloj", { width: 16, height: 16, style: "flex-shrink:0" }),
    el("div", { style: { minWidth: 0 } },
      el("div", { class: "mayus-pequena texto-suave" }, `${titulo} · ${entradas.length} movimiento${entradas.length === 1 ? "" : "s"}`),
      el("div", { style: { fontSize: "13px", fontWeight: 600 } }, ultima.descripcion),
      el("div", { class: "texto-suave", style: { fontSize: "12px" } },
        [ultima.detalle, `${ultima.admin} · ${fechaRelativa(ultima.fecha)}`].filter(Boolean).join(" · "))),
    resto.length ? icono("chevron", { class: "flecha" }) : null);

  const detalles = el("details", { class: "historial" }, resumen,
    el("div", { class: "historial-resto" }, el("div", {}, lista, verMas)));
  if (!resto.length) resumen.addEventListener("click", e => e.preventDefault());
  return detalles;
}

// =========================================================
// Imágenes: compresión y uploader reutilizable
// =========================================================

/** Lee un archivo de imagen y lo comprime con <canvas> (máx. 600 px, calidad 0.7) */
export function comprimirImagen(archivo, { maxPx = IMAGEN_MAX_PX, calidad = IMAGEN_CALIDAD } = {}) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error("No se pudo leer la imagen."));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error("El archivo no es una imagen válida."));
      img.onload = () => {
        const escala = Math.min(1, maxPx / Math.max(img.width, img.height));
        const lienzo = document.createElement("canvas");
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        const ctx = lienzo.getContext("2d");
        ctx.fillStyle = "#fff"; // fondo blanco para PNG transparentes
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
        resolver(lienzo.toDataURL("image/jpeg", calidad));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

/**
 * crearUploader({ max, maxMB, onChange, iniciales })
 * Arrastrar y soltar + input file, vista previa, validación y compresión.
 * Devuelve { elemento, obtener(), establecer(lista) }
 */
export function crearUploader({ max = 1, maxMB = IMAGEN_MAX_MB, onChange = () => {}, iniciales = [], etiqueta = "Imagen del producto" } = {}) {
  let imagenes = [...iniciales].filter(Boolean);
  const idInput = `archivo-${Math.random().toString(36).slice(2, 8)}`;
  const input = el("input", { type: "file", accept: "image/*", id: idInput, class: "solo-lector", multiple: max > 1 });
  const vistas = el("div", { class: "uploader-vistas" });
  const texto = el("p", {});
  const botonElegir = el("label", { for: idInput, class: "boton boton-secundario boton-pequeno", tabindex: "0", role: "button" },
    icono("subir"), "Elegir imagen");
  botonElegir.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  const zona = el("div", { class: "uploader" },
    el("span", { class: "etiqueta" }, etiqueta),
    texto, botonElegir, input, vistas);

  function pintar() {
    texto.textContent = imagenes.length >= max
      ? (max === 1 ? "Arrastra otra imagen para reemplazarla." : `Máximo ${max} imágenes.`)
      : `Arrastra y suelta aquí o elige un archivo (máx. ${maxMB} MB).`;
    botonElegir.lastChild.textContent = imagenes.length && max === 1 ? "Reemplazar imagen" : "Elegir imagen";
    vistas.replaceChildren(...imagenes.map((src, i) =>
      el("div", { class: "uploader-vista" },
        el("img", { src, alt: `Vista previa ${i + 1}` }),
        botonIcono("cerrar", "Quitar imagen", {
          onclick: () => { imagenes.splice(i, 1); pintar(); onChange([...imagenes]); }
        }))));
  }

  async function procesar(archivos) {
    for (const archivo of [...archivos]) {
      if (!archivo.type.startsWith("image/")) { toast(`"${archivo.name}" no es una imagen.`, "error"); continue; }
      if (archivo.size > maxMB * 1024 * 1024) { toast(`"${archivo.name}" pesa más de ${maxMB} MB.`, "error"); continue; }
      try {
        const comprimida = await comprimirImagen(archivo);
        if (max === 1) imagenes = [comprimida];
        else if (imagenes.length < max) imagenes.push(comprimida);
        else { toast(`Máximo ${max} imágenes.`, "advertencia"); break; }
      } catch (error) {
        toast(error.message, "error");
      }
    }
    pintar();
    onChange([...imagenes]);
  }

  input.addEventListener("change", () => { procesar(input.files); input.value = ""; });
  zona.addEventListener("dragover", e => { e.preventDefault(); zona.classList.add("arrastrando"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("arrastrando"));
  zona.addEventListener("drop", e => {
    e.preventDefault();
    zona.classList.remove("arrastrando");
    if (e.dataTransfer?.files?.length) procesar(e.dataTransfer.files);
  });
  pintar();
  return {
    elemento: zona,
    obtener: () => [...imagenes],
    establecer: lista => { imagenes = [...lista].filter(Boolean); pintar(); }
  };
}

// =========================================================
// Tarjeta de producto horizontal y desplegable
// =========================================================

const CLASE_CHIP_ESTADO = { normal: "chip-ok", bajo: "chip-alerta", agotado: "chip-peligro pulso" };

function chipEstado(estado) {
  return el("span", { class: `chip ${CLASE_CHIP_ESTADO[estado]}` }, TEXTO_ESTADO[estado]);
}

/** Chip de margen: verde sobre el mínimo, naranja cerca (hasta +5 puntos), rojo por debajo */
export function chipMargen(margen, minimo) {
  const estado = estadoMargen(margen, minimo);
  const clases = { ok: "chip-ok", justo: "chip-alerta", bajo: "chip-peligro", "sin-costo": "" };
  return el("span", { class: `chip ${clases[estado]}`, dataset: { estadoMargen: estado }, title: `Margen mínimo ${formatoPorcentaje(minimo ?? 0)}` },
    margen === null ? "Sin costo" : `Margen ${formatoPorcentaje(margen)}`);
}

/** Chips de color, talla y hasta 3 de compatibilidad con "+N" */
function chipsProducto(producto) {
  const chips = [];
  if (producto.color && producto.color !== "Sin color") chips.push(el("span", { class: "chip" }, producto.color));
  if (producto.talla && producto.talla !== "Sin talla") chips.push(el("span", { class: "chip" }, producto.talla));
  // No se repite en compatibilidad lo que ya se ve como talla
  const compat = (producto.compatibilidad || []).filter(c => c !== producto.talla);
  compat.slice(0, 3).forEach(c => chips.push(el("span", { class: "chip chip-negro" }, c)));
  if (compat.length > 3) chips.push(el("span", { class: "chip", title: compat.slice(3).join(", ") }, `+${compat.length - 3}`));
  return chips;
}

/**
 * Una sola función para ambas vistas.
 * rol "cliente": recibe productoPublico(p) (sin precio ni costo) y muestra disponibilidad.
 * rol "admin": muestra precios, stock, margen, cantidad y acciones.
 */
export function crearTarjetaProducto(producto, { rol = "cliente", indice = 0 } = {}) {
  const esAdmin = rol === "admin";
  const estado = esAdmin ? estadoStock(producto) : producto.estado;
  const idPanel = `detalle-${producto.id}`;
  const idBoton = `boton-detalle-${producto.id}`;

  const foto = infoImagen(producto);
  const imagen = el("div", { class: `tp-imagen imagen-${foto.tipo}` },
    el("img", { src: foto.src, alt: producto.nombre, loading: "lazy", decoding: "async", width: 160, height: 160, onerror: respaldoImagen(producto.linea) }),
    foto.tipo === "modelo" || foto.tipo === "categoria"
      ? el("span", { class: "etiqueta-referencia", title: leyendaImagen(producto, foto) }, "Foto de referencia") : null,
    chipEstado(estado),
    producto.destacado ? el("span", { class: "marca-destacado", title: "Destacado" }, icono("estrella")) : null);

  const info = el("div", { class: "tp-info" },
    el("p", { class: "tp-meta" }, [producto.marca, producto.referencia, producto.linea].filter(Boolean).join(" · ")),
    el("h3", { class: "tp-nombre", title: producto.nombre }, producto.nombre),
    el("div", { class: "tp-chips" }, chipsProducto(producto)),
    esAdmin && !producto.visibleCatalogo ? el("span", { class: "chip", style: { alignSelf: "flex-start" } }, icono("ojoTachado", { width: 12, height: 12 }), "Oculto en catálogo") : null);

  const lateral = esAdmin ? lateralAdmin(producto, estado) : lateralCliente(estado);

  const toggle = el("button", {
    type: "button", class: "tp-toggle", id: idBoton,
    "aria-expanded": "false", "aria-controls": idPanel, dataset: { action: "detalles" }
  }, el("span", { class: "tp-toggle-texto" }, "Ver detalles"), icono("chevron"));

  const pie = el("div", { class: "tp-pie" }, toggle, esAdmin ? accionesAdmin(producto) : null);
  // FUTURO: pedir / hablar con asesor por WhatsApp (PEDIDOS_HABILITADOS / WHATSAPP_ASESOR en config.js)

  const panel = el("div", { class: "tp-detalle", id: idPanel, role: "region", "aria-labelledby": idBoton, inert: true },
    el("div", { class: "tp-detalle-interno" }));

  const clases = ["tarjeta-producto", "aparecer", `estado-${estado}`];
  if (esAdmin && !producto.visibleCatalogo) clases.push("oculta-catalogo");
  return el("article", {
    class: clases.join(" "),
    dataset: { id: producto.id },
    style: { "--i": Math.min(indice, MAX_ESCALONADAS) },
    "aria-label": producto.nombre
  }, el("div", { class: "tp-cuerpo" }, imagen, info, lateral), pie, panel);
}

function lateralCliente(estado) {
  const ayudas = {
    normal: "Hay unidades en el local.",
    bajo: "Quedan pocas, pregunta pronto.",
    agotado: "Sin existencias por ahora."
  };
  return el("div", { class: `tp-lateral estado-${estado}` },
    el("div", { class: "tp-disponibilidad" }, el("span", { class: "punto-estado", "aria-hidden": "true" }), TEXTO_ESTADO[estado]),
    el("p", { class: "tp-disponibilidad-ayuda" }, ayudas[estado]));
  // FUTURO: pedir / hablar con asesor por WhatsApp
}

/** Nota gris "IVA incluido" bajo un precio; nada para los productos sin IVA (bicicletas) */
export function notaIva(producto, precio = true) {
  return precio && llevaIva(producto) ? el("span", { class: "nota-iva" }, TEXTO_IVA_INCLUIDO) : null;
}

/** Precio final al por mayor (solo si tiene precio al por mayor propio) */
const precioMayorFinal = producto => (producto.precioMayorBase ? precioFinal(producto, "mayor") : null);

function lateralAdmin(producto, estado) {
  const margen = calcularMargen(precioSinIva(producto, "publico"), producto.costo);
  const publico = precioFinal(producto, "publico");
  const mayor = precioMayorFinal(producto);
  const precio = el("span", {
    class: "precio-editable tp-precio-principal", tabindex: "0", role: "button",
    "aria-label": `Editar precio al público de ${producto.nombre}`, title: "Clic para editar el precio al público",
    dataset: { action: "editar-precio" }
  }, publico ? formatoCOP(publico) : "Sin precio");

  const agotado = estado === "agotado" || !publico;
  const cantidad = el("div", { class: "cantidad" },
    el("button", { type: "button", "aria-label": "Restar una unidad", dataset: { action: "menos" }, disabled: agotado }, "−"),
    el("input", { type: "number", min: 1, max: producto.stock || 1, value: 1, "aria-label": "Cantidad", disabled: agotado, class: "cantidad-valor" }),
    el("button", { type: "button", "aria-label": "Sumar una unidad", dataset: { action: "mas" }, disabled: agotado || producto.stock <= 1 }, "+"));

  return el("div", { class: "tp-lateral" },
    el("dl", { class: "tp-precios" },
      el("div", {}, el("dt", {}, "Al por mayor"), el("dd", { class: "precio-mayorista" }, mayor ? formatoCOP(mayor) : "—", notaIva(producto, mayor))),
      el("div", {}, el("dt", {}, "Al público"), el("dd", { class: "precio-celda" }, precio, notaIva(producto, publico))),
      el("div", {}, el("dt", {}, "Stock"), el("dd", {}, `${formatoNumero(producto.stock)} und`)),
      el("div", {}, el("dt", {}, "Margen"), el("dd", { class: "margen-celda" }, chipMargen(margen, margenMinimoPara(producto.categoria))))),
    el("div", { class: "tp-compra" }, cantidad,
      el("button", { type: "button", class: "boton boton-acento", dataset: { action: "agregar" }, disabled: agotado }, icono("carrito"), "Agregar")));
}

function accionesAdmin(producto) {
  return el("div", { class: "tp-acciones" },
    botonIcono("caja", "Ajustar stock", { dataset: { action: "stock" } }),
    botonIcono("editar", "Editar producto", { dataset: { action: "editar" } }),
    botonIcono("qr", "Código QR y etiquetas", { dataset: { action: "qr" } }),
    botonIcono("estrella", producto.destacado ? "Quitar de destacados" : "Destacar", { dataset: { action: "destacar" }, "aria-pressed": String(producto.destacado) }),
    botonIcono(producto.visibleCatalogo ? "ojo" : "ojoTachado", producto.visibleCatalogo ? "Ocultar del catálogo" : "Mostrar en el catálogo", { dataset: { action: "visibilidad" } }),
    botonIcono("eliminar", "Eliminar producto", { class: "peligro", dataset: { action: "eliminar" } }));
}

/**
 * Contenido del panel desplegado (se construye solo la primera vez que se abre).
 * lista = productos para buscar compatibles (públicos o completos según el rol)
 */
export function construirDetalleProducto(producto, { rol = "cliente", lista = [], nombreProveedor = () => "", extra = null } = {}) {
  const esAdmin = rol === "admin";
  const info = infoImagen(producto);
  const src = info.src;

  const leyenda = leyendaImagen(producto, info);
  const columnaImagen = el("div", {},
    el("button", { type: "button", class: `tp-imagen-grande imagen-${info.tipo}`, dataset: { action: "ampliar" }, "aria-label": "Ver imagen en pantalla completa" },
      el("img", { src, alt: producto.nombre, loading: "lazy", onerror: respaldoImagen(producto.linea) })),
    leyenda ? el("p", { class: "leyenda-imagen" }, leyenda, esAdmin ? " Sube la foto real desde Editar." : "") : null);

  const fila = (titulo, valor) => el("tr", {}, el("th", { scope: "row" }, titulo), el("td", {}, valor));
  const ficha = el("table", { class: "ficha" }, el("tbody", {},
    fila("Marca", producto.marca),
    fila("Referencia", producto.referencia),
    fila("Línea", producto.linea),
    fila("Categoría", producto.categoria),
    fila("Color", producto.color),
    fila("Talla", producto.talla),
    fila("Garantía", producto.garantiaMeses ? `${producto.garantiaMeses} meses` : "Sin garantía"),
    fila("Maneja serial", producto.manejaSerial ? "Sí" : "No")));

  const columnaCentro = el("div", {},
    el("section", {}, el("h4", {}, "Descripción"),
      el("p", { class: "tp-descripcion" }, producto.descripcion || producto.nombre)),
    el("section", {}, el("h4", {}, "Ficha técnica"), ficha));

  if (esAdmin) {
    // Margen y utilidad sobre el precio final redondeado sin IVA: el IVA no es ganancia del negocio
    const margen = calcularMargen(precioSinIva(producto, "publico"), producto.costo);
    const utilidad = calcularUtilidad(precioSinIva(producto, "publico"), producto.costo);
    const publico = precioFinal(producto, "publico");
    const mayor = precioMayorFinal(producto);
    columnaCentro.append(el("section", {}, el("h4", {}, "Inventario y costos"),
      el("table", { class: "ficha" }, el("tbody", {},
        fila("Costo", producto.costo === null ? "Sin costo" : formatoCOP(producto.costo)),
        fila("Al por mayor", el("span", {}, mayor ? formatoCOP(mayor) : "—", notaIva(producto, mayor))),
        fila("Al público", el("span", {}, publico ? formatoCOP(publico) : "Sin precio", notaIva(producto, publico))),
        fila("Margen al por mayor", formatoPorcentaje(producto.precioMayorBase ? calcularMargen(precioSinIva(producto, "mayor"), producto.costo) : null)),
        fila("Utilidad por unidad", utilidad === null ? "—" : formatoCOP(utilidad)),
        fila("Margen", el("span", {}, formatoPorcentaje(margen), " ", chipMargen(margen, margenMinimoPara(producto.categoria)))),
        fila("Margen mínimo", formatoPorcentaje(margenMinimoPara(producto.categoria))),
        fila("Proveedor", producto.proveedorId && producto.proveedorId !== "sin"
          ? el("button", { type: "button", class: "enlace-simple", dataset: { action: "ver-proveedor", destino: producto.proveedorId } }, nombreProveedor(producto.proveedorId))
          : nombreProveedor(producto.proveedorId)),
        fila("Stock / mínimo", `${formatoNumero(producto.stock)} / ${formatoNumero(producto.minStock)}`),
        producto.manejaSerial ? fila("Seriales disponibles", (() => {
          const n = serialesDeProducto(producto.id, "Disponible").length;
          return el("span", {}, `${formatoNumero(n)} de ${formatoNumero(producto.stock)}`,
            n !== producto.stock ? el("span", { class: "chip chip-alerta", style: { marginLeft: "6px" } },
              n < producto.stock ? `Faltan ${formatoNumero(producto.stock - n)}` : `Sobran ${formatoNumero(n - producto.stock)}`) : null);
        })()) : null,
        fila("Valor en inventario (venta)", formatoCOP(valorVenta(producto))),
        fila("Valor en inventario (costo)", producto.costo === null ? "Sin costo" : formatoCOP(valorCosto(producto)))))));
  }

  const compat = producto.compatibilidad || [];
  const relacionados = productosCompatibles(producto, lista);
  const columnaDerecha = el("div", {},
    el("section", {}, el("h4", {}, "Compatibilidad"),
      compat.length
        ? el("div", { class: "tp-chips" }, compat.map(c => el("span", { class: "chip chip-negro" }, c)))
        : el("p", { class: "texto-suave" }, "Sin etiquetas de compatibilidad.")),
    el("section", {}, el("h4", {}, "Productos compatibles"),
      relacionados.length
        ? el("div", { class: "carrusel-mini" }, relacionados.map(r =>
            el("button", { type: "button", dataset: { action: "ir-producto", destino: r.id }, title: r.nombre },
              el("img", { src: imagenProducto(r), alt: "", loading: "lazy", onerror: respaldoImagen(r.linea) }),
              el("span", {}, r.nombre))))
        : el("p", { class: "texto-suave" }, "No hay productos relacionados.")));

  if (extra) columnaDerecha.append(extra(producto));
  if (esAdmin) {
    columnaDerecha.append(el("section", {}, el("h4", {}, "Historial"),
      crearHistorial(producto.historial || [], { visibles: 10 })));
  }

  return el("div", { class: "tp-detalle-contenido" }, columnaImagen, columnaCentro, columnaDerecha);
}

// =========================================================
// Lista de productos: delegación de eventos, acordeón y paginación
// =========================================================

/**
 * Un único listener en el contenedor maneja todas las acciones con closest("[data-action]").
 * opciones:
 *  - construirDetalle(id) → Node   (carga perezosa del panel)
 *  - alAccion(accion, id, boton, tarjeta)
 *  - permitirVarias() → boolean
 */
export function configurarListaProductos(contenedor, { construirDetalle, alAccion = () => {}, permitirVarias = () => false }) {
  function alternar(tarjeta, abrir) {
    const boton = tarjeta.querySelector('[data-action="detalles"]');
    const panel = tarjeta.querySelector(".tp-detalle");
    if (abrir && !permitirVarias()) {
      contenedor.querySelectorAll(".tarjeta-producto.abierta").forEach(otra => { if (otra !== tarjeta) alternar(otra, false); });
    }
    if (abrir && !tarjeta.dataset.cargado) {
      tarjeta.querySelector(".tp-detalle-interno").append(construirDetalle(tarjeta.dataset.id));
      tarjeta.dataset.cargado = "1";
    }
    tarjeta.classList.toggle("abierta", abrir);
    boton.setAttribute("aria-expanded", String(abrir));
    boton.querySelector(".tp-toggle-texto").textContent = abrir ? "Ocultar detalles" : "Ver detalles";
    panel.inert = !abrir;
    if (abrir) {
      // Espera a que termine la animación y asegura que la tarjeta quede visible
      setTimeout(() => {
        const r = tarjeta.getBoundingClientRect();
        const alto = window.innerHeight;
        if (r.bottom > alto || r.top < 80) {
          tarjeta.scrollIntoView({ behavior: prefiereMenosMovimiento() ? "auto" : "smooth", block: r.height > alto - 100 ? "start" : "nearest" });
        }
      }, prefiereMenosMovimiento() ? 0 : 270);
    }
  }

  contenedor.addEventListener("click", evento => {
    const objetivo = evento.target.closest("[data-action]");
    if (!objetivo || !contenedor.contains(objetivo)) return;
    const tarjeta = objetivo.closest(".tarjeta-producto");
    if (!tarjeta) return;
    const accion = objetivo.dataset.action;
    const id = tarjeta.dataset.id;

    if (accion === "detalles") return alternar(tarjeta, !tarjeta.classList.contains("abierta"));
    if (accion === "ampliar") {
      const img = objetivo.querySelector("img");
      return abrirLightbox(img.src, img.alt);
    }
    if (accion === "menos" || accion === "mas") {
      const entrada = tarjeta.querySelector(".cantidad-valor");
      const maximo = Number(entrada.max) || 1;
      const valor = Math.min(maximo, Math.max(1, (Number(entrada.value) || 1) + (accion === "mas" ? 1 : -1)));
      entrada.value = valor;
      tarjeta.querySelector('[data-action="menos"]').disabled = valor <= 1;
      tarjeta.querySelector('[data-action="mas"]').disabled = valor >= maximo;
      return;
    }
    alAccion(accion, accion === "ir-producto" ? objetivo.dataset.destino : id, objetivo, tarjeta);
  });

  // Enter o Espacio en elementos con rol de botón que no son <button>
  contenedor.addEventListener("keydown", evento => {
    const objetivo = evento.target.closest('[data-action][role="button"]');
    if (!objetivo || (evento.key !== "Enter" && evento.key !== " ")) return;
    evento.preventDefault();
    objetivo.click();
  });

  // Cantidad escrita a mano: se limita al stock
  contenedor.addEventListener("change", evento => {
    if (!evento.target.matches(".cantidad-valor")) return;
    const entrada = evento.target;
    const maximo = Number(entrada.max) || 1;
    entrada.value = Math.min(maximo, Math.max(1, Math.round(Number(entrada.value) || 1)));
  });

  return { alternar };
}

/**
 * Renderiza de 20 en 20 con botón "Cargar más".
 * crearTarjeta(producto, indiceEnLote) → Node
 */
export function crearListaPaginada({ contenedor, botonMas, crearTarjeta, porPagina = PRODUCTOS_POR_PAGINA, vacio = () => estadoVacio() }) {
  let lista = [];
  let mostrados = 0;

  function agregarLote() {
    const lote = lista.slice(mostrados, mostrados + porPagina);
    const fragmento = document.createDocumentFragment();
    lote.forEach((p, i) => fragmento.append(crearTarjeta(p, i)));
    contenedor.append(fragmento);
    mostrados += lote.length;
    const faltan = lista.length - mostrados;
    botonMas.hidden = faltan <= 0;
    botonMas.textContent = `Cargar más (${formatoNumero(faltan)} restantes)`;
  }
  botonMas.addEventListener("click", agregarLote);

  return {
    mostrar(nuevaLista) {
      lista = nuevaLista;
      mostrados = 0;
      contenedor.replaceChildren();
      if (!lista.length) {
        contenedor.append(vacio());
        botonMas.hidden = true;
        return;
      }
      agregarLote();
    },
    /** Asegura que un producto esté renderizado (carga lotes hasta encontrarlo) */
    asegurar(id) {
      const posicion = lista.findIndex(p => p.id === id);
      if (posicion === -1) return false;
      while (mostrados <= posicion) agregarLote();
      return true;
    },
    get total() { return lista.length; }
  };
}

/** Lleva a una tarjeta, la resalta y la despliega */
export function enfocarTarjeta(contenedor, id, controlLista) {
  const tarjeta = contenedor.querySelector(`.tarjeta-producto[data-id="${CSS.escape(id)}"]`);
  if (!tarjeta) return false;
  tarjeta.scrollIntoView({ behavior: prefiereMenosMovimiento() ? "auto" : "smooth", block: "start" });
  tarjeta.classList.add("resaltada");
  setTimeout(() => tarjeta.classList.remove("resaltada"), 1800);
  if (!tarjeta.classList.contains("abierta")) controlLista.alternar(tarjeta, true);
  tarjeta.querySelector('[data-action="detalles"]').focus({ preventScroll: true });
  return true;
}

/** Retrasa la ejecución mientras el usuario escribe */
export function conRetraso(funcion, ms = 200) {
  let temporizador;
  return (...args) => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => funcion(...args), ms);
  };
}

// =========================================================
// Campo de etiquetas (compatibilidad): Enter o coma agrega, X quita
// =========================================================

/**
 * crearCampoEtiquetas({ id, valores, sugerencias, placeholder, onChange })
 * Devuelve { elemento, entrada, obtener() }
 */
export function crearCampoEtiquetas({ id, valores = [], sugerencias = [], placeholder = "Escribe y pulsa Enter", onChange = () => {} } = {}) {
  let etiquetas = [...new Set(valores.map(v => String(v).trim()).filter(Boolean))];
  const idLista = `${id}-sugerencias`;
  const lista = el("datalist", { id: idLista });
  const entrada = el("input", { type: "text", id, class: "campo-etiquetas-entrada", list: idLista, placeholder, autocomplete: "off" });
  const chips = el("div", { class: "campo-etiquetas-chips" });
  const contenedor = el("div", { class: "campo-etiquetas" }, chips, entrada, lista);

  const existe = texto => etiquetas.some(t => t.toLowerCase() === texto.toLowerCase());

  function pintar() {
    chips.replaceChildren(...etiquetas.map(t =>
      el("span", { class: "chip chip-negro etiqueta-chip" }, t,
        el("button", { type: "button", "aria-label": `Quitar ${t}`, dataset: { quitar: t } }, "×"))));
    lista.replaceChildren(...sugerencias.filter(s => !existe(s)).map(s => el("option", { value: s })));
  }

  function agregar(texto) {
    const limpio = String(texto).replace(/,/g, " ").replace(/\s+/g, " ").trim();
    entrada.value = "";
    if (!limpio || existe(limpio)) return;
    // Si coincide con una sugerencia se usa su escritura exacta
    etiquetas.push(sugerencias.find(s => s.toLowerCase() === limpio.toLowerCase()) ?? limpio);
    pintar();
    onChange([...etiquetas]);
  }

  function quitar(texto) {
    etiquetas = etiquetas.filter(t => t !== texto);
    pintar();
    onChange([...etiquetas]);
    entrada.focus();
  }

  entrada.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      agregar(entrada.value);
    } else if (e.key === "Backspace" && !entrada.value && etiquetas.length) {
      quitar(etiquetas[etiquetas.length - 1]);
    }
  });
  // Elegir una sugerencia de la lista la agrega de una vez
  entrada.addEventListener("input", e => {
    if ((e.inputType === undefined || e.inputType === "insertReplacementText") && sugerencias.includes(entrada.value)) {
      agregar(entrada.value);
    }
  });
  entrada.addEventListener("blur", () => { if (entrada.value.trim()) agregar(entrada.value); });
  chips.addEventListener("click", e => {
    const boton = e.target.closest("[data-quitar]");
    if (boton) quitar(boton.dataset.quitar);
  });
  contenedor.addEventListener("click", e => { if (e.target === contenedor || e.target === chips) entrada.focus(); });

  pintar();
  return { elemento: contenedor, entrada, obtener: () => [...etiquetas] };
}

// =========================================================
// PDF compartido (jsPDF): encabezado con el logo, datos de la tienda y pie
// Lo usan la cotización, la orden de taller y el certificado de garantía.
// =========================================================

/** jsPDF no maneja bien los espacios especiales de Intl: se cambian por espacios normales */
export const pdfTexto = v => String(v ?? "").replace(/[  ]/g, " ");
export const pdfCOP = v => pdfTexto(formatoCOP(v));
const formatoFechaPDF = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
export const fechaPDF = iso => (iso ? formatoFechaPDF.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : "—");

/** Dibuja la bicicleta del logo con trazos vectoriales */
export function dibujarLogoPDF(doc, x, y, escala = 0.42) {
  const p = (px, py) => [x + px * escala, y + py * escala];
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.8);
  doc.setLineCap("round");
  doc.circle(...p(13, 27), 10 * escala, "S");
  doc.circle(...p(51, 27), 10 * escala, "S");
  const segmentos = [[13, 27, 29, 27], [29, 27, 24, 12], [24, 12, 13, 27], [24, 12, 45, 12], [45, 12, 29, 27], [45, 12, 51, 27], [24, 12, 22, 7], [18, 7, 27, 7], [45, 12, 43, 6], [43, 6, 49, 6]];
  for (const [x1, y1, x2, y2] of segmentos) doc.line(...p(x1, y1), ...p(x2, y2));
  doc.setFillColor(255, 194, 26);
  doc.circle(...p(29, 27), 2.4 * escala, "F");
}

/**
 * Crea un PDF carta con el encabezado negro de la marca.
 * tienda = { nombre, nit, direccion, ciudad, telefono, correo }
 * Devuelve { doc, ancho, alto, margen } y deja el cursor de texto listo en y ≈ 42
 */
export function nuevoPDF({ titulo, numero, tienda = {} }) {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) throw new Error("No se cargó la librería jsPDF. Revisa tu conexión a internet.");
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  if (typeof doc.autoTable !== "function") throw new Error("No se cargó jspdf-autotable.");
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const margen = 14;

  doc.setFillColor(14, 14, 14);
  doc.rect(0, 0, ancho, 30, "F");
  dibujarLogoPDF(doc, margen, 5);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(18);
  doc.text("Ciclo", margen + 31, 18);
  // El ancho se mide con la fuente normal, antes de pasar a negrita
  const anchoCiclo = doc.getTextWidth("Ciclo");
  doc.setFont("helvetica", "bold");
  doc.text("Victoria", margen + 31 + anchoCiclo, 18);
  doc.setTextColor(255, 194, 26);
  doc.setFontSize(10);
  doc.text(pdfTexto(titulo), ancho - margen, 12, { align: "right" });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  if (numero) doc.text(pdfTexto(numero), ancho - margen, 20, { align: "right" });

  doc.setTextColor(110, 110, 106);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const datosTienda = [tienda.nombre || "CicloVictoria", tienda.nit && `NIT ${tienda.nit}`, tienda.direccion, tienda.ciudad, tienda.telefono && `Tel. ${tienda.telefono}`, tienda.correo]
    .filter(Boolean).join(" · ");
  doc.text(pdfTexto(datosTienda), margen, 37);
  doc.setTextColor(14, 14, 14);
  return { doc, ancho, alto, margen };
}

/** Recuadro con etiquetas en negrita y valores: columnas = [[["ETIQUETA", "valor"], …], …] */
export function cuadroPDF(doc, { x, y, ancho, columnas, alto = null }) {
  const lineas = Math.max(...columnas.map(c => c.length));
  const altoFinal = alto ?? 8 + lineas * 5.5;
  doc.setDrawColor(230, 230, 227);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, ancho, altoFinal, 2, 2, "S");
  const anchoColumna = ancho / columnas.length;
  columnas.forEach((columna, i) => {
    let yy = y + 6.5;
    columna.forEach(([etiqueta, valor]) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(110, 110, 106);
      doc.text(pdfTexto(etiqueta.toUpperCase()), x + 4 + anchoColumna * i, yy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(14, 14, 14);
      const texto = doc.splitTextToSize(pdfTexto(valor || "—"), anchoColumna - 8 - 30)[0];
      doc.text(texto, x + 4 + anchoColumna * i + 30, yy);
      yy += 5.5;
    });
  });
  return y + altoFinal;
}

/** Pie con texto y número de página en todas las páginas */
export function piePDF(doc, texto) {
  const paginas = doc.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    const alto = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 106);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(pdfTexto(texto), ancho - 60), 14, alto - 12);
    doc.text(`Página ${i} de ${paginas}`, ancho - 14, alto - 10, { align: "right" });
  }
}

/**
 * Filas de totales de una cotización u orden según su regla de IVA:
 * - IVA incluido (vigente): Subtotal, Descuentos, Total y debajo "Incluye IVA" (solo si hay ítems con IVA).
 * - Documentos anteriores: Subtotal, Descuentos, Base, IVA y Total, tal como se guardaron.
 * Devuelve [{ tipo, etiqueta, valor }] con tipo "normal" | "descuento" | "total" | "nota-iva".
 */
export function filasTotales(t) {
  const filas = [
    { tipo: "normal", etiqueta: "Subtotal", valor: t.subtotal },
    { tipo: "descuento", etiqueta: "Descuentos", valor: t.descuentos || 0 }
  ];
  if (t.regla && t.regla !== REGLA_IVA.aparte) {
    filas.push({ tipo: "total", etiqueta: "Total", valor: t.total });
    if (t.ivaIncluido > 0) filas.push({ tipo: "nota-iva", etiqueta: "Incluye IVA", valor: t.ivaIncluido });
  } else {
    filas.push(
      { tipo: "normal", etiqueta: "Base", valor: t.base },
      { tipo: "normal", etiqueta: `IVA ${PORCENTAJE_IVA} %`, valor: t.iva },
      { tipo: "total", etiqueta: "Total", valor: t.total });
  }
  return filas;
}

/** Bloque de totales alineado a la derecha, con la barra amarilla del TOTAL */
export function totalesPDF(doc, y, t, { ancho, margen }) {
  const xEtiqueta = ancho - margen - 70;
  const fila = (etiqueta, valor) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(14, 14, 14);
    doc.text(etiqueta, xEtiqueta, y);
    doc.text(valor, ancho - margen, y, { align: "right" });
    y += 6;
  };
  for (const f of filasTotales(t)) {
    if (f.tipo === "descuento") {
      if (f.valor) fila(f.etiqueta, `- ${pdfCOP(f.valor)}`);
    } else if (f.tipo === "normal") {
      fila(f.etiqueta === "Base" ? "Base gravable" : f.etiqueta, pdfCOP(f.valor));
    } else if (f.tipo === "total") {
      doc.setFillColor(255, 194, 26);
      doc.roundedRect(xEtiqueta - 4, y - 5, 78, 10, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(14, 14, 14);
      doc.text("TOTAL", xEtiqueta, y + 1.5);
      doc.text(pdfCOP(f.valor), ancho - margen, y + 1.5, { align: "right" });
      y += 12;
    } else {
      // Desglose informativo, en texto pequeño y gris debajo del total
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(110, 110, 106);
      doc.text(`${f.etiqueta}: ${pdfCOP(f.valor)}`, ancho - margen, y - 3, { align: "right" });
      y += 3;
    }
  }
  return y;
}

/** Líneas de firma al final del documento */
export function firmasPDF(doc, y, etiquetas, { ancho, margen }) {
  const alto = doc.internal.pageSize.getHeight();
  if (y > alto - 45) { doc.addPage(); y = 30; }
  const anchoFirma = (ancho - margen * 2 - 20 * (etiquetas.length - 1)) / etiquetas.length;
  etiquetas.forEach((etiqueta, i) => {
    const x = margen + i * (anchoFirma + 20);
    doc.setDrawColor(14, 14, 14);
    doc.setLineWidth(0.3);
    doc.line(x, y + 18, x + anchoFirma, y + 18);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text(pdfTexto(etiqueta), x, y + 23);
  });
  return y + 28;
}

/** Tabla con el estilo de la marca */
export function tablaPDF(doc, { y, margen, cabecera, filas, columnas = {} }) {
  doc.autoTable({
    startY: y,
    margin: { left: margen, right: margen },
    head: [cabecera],
    body: filas,
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.4, textColor: [14, 14, 14], lineColor: [230, 230, 227], lineWidth: 0.1 },
    headStyles: { fillColor: [14, 14, 14], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 246, 244] },
    columnStyles: columnas
  });
  return doc.lastAutoTable.finalY;
}

// =========================================================
// Contadores animados (KPIs): el número sube desde 0 en ~800 ms
// =========================================================

export function animarContador(nodo, valor, formato = formatoNumero, duracion = 800) {
  const final = Number(valor) || 0;
  if (prefiereMenosMovimiento() || !final) { nodo.textContent = formato(final); return; }
  const inicio = performance.now();
  const paso = ahora => {
    const progreso = Math.min(1, (ahora - inicio) / duracion);
    const suavizado = 1 - Math.pow(1 - progreso, 3);
    nodo.textContent = formato(progreso < 1 ? Math.round(final * suavizado) : final);
    if (progreso < 1) requestAnimationFrame(paso);
  };
  nodo.textContent = formato(0);
  requestAnimationFrame(paso);
}

// =========================================================
// Resaltado de coincidencias (creado con DOM, sin innerHTML)
// =========================================================

/** Devuelve un fragmento con las palabras buscadas envueltas en <mark> (ignora tildes y mayúsculas) */
export function resaltar(texto, consulta) {
  const fragmento = document.createDocumentFragment();
  const original = String(texto ?? "");
  const caracteres = [...original];
  // Cada carácter se compara por su letra base, así la longitud no cambia
  const base = caracteres.map(c => c.normalize("NFD")[0].toLowerCase()).join("");
  const palabras = String(consulta ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/).filter(Boolean);
  const marcas = new Array(caracteres.length).fill(false);
  for (const palabra of palabras) {
    let desde = 0;
    let i;
    while ((i = base.indexOf(palabra, desde)) !== -1) {
      for (let k = i; k < i + palabra.length; k++) marcas[k] = true;
      desde = i + palabra.length;
    }
  }
  let actual = "";
  let marcado = false;
  const volcar = () => {
    if (!actual) return;
    fragmento.append(marcado ? el("mark", {}, actual) : document.createTextNode(actual));
    actual = "";
  };
  caracteres.forEach((c, i) => {
    if (marcas[i] !== marcado) { volcar(); marcado = marcas[i]; }
    actual += c;
  });
  volcar();
  return fragmento;
}

// =========================================================
// Búsqueda global (Ctrl + K)
// =========================================================

/**
 * iniciarBusquedaGlobal({ buscar, escanear, placeholder, boton })
 * buscar(texto) → [{ grupo, resultados: [{ titulo, subtitulo, accion }] }]
 */
export function iniciarBusquedaGlobal({ buscar, escanear = null, placeholder = "Buscar…", boton = null }) {
  let abierta = null;

  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (abierta) abierta.cerrar(); else abrir();
    }
  });
  boton?.addEventListener("click", () => abrir());

  function abrir() {
    if (abierta) return;
    const focoAnterior = document.activeElement;
    const entrada = el("input", {
      type: "search", class: "paleta-entrada", placeholder, autocomplete: "off", spellcheck: "false",
      role: "combobox", "aria-expanded": "true", "aria-controls": "paleta-resultados", "aria-autocomplete": "list", "aria-label": "Buscar en todo"
    });
    const lista = el("div", { id: "paleta-resultados", class: "paleta-resultados", role: "listbox", "aria-label": "Resultados" });
    const caja = el("div", { class: "paleta", role: "dialog", "aria-modal": "true", "aria-label": "Búsqueda global" },
      el("div", { class: "paleta-cabecera" }, icono("buscar"), entrada,
        escanear ? botonIcono("escaner", "Escanear código", { onclick: () => { cerrar(); escanear(); } }) : null,
        el("kbd", {}, "Esc")),
      lista,
      el("div", { class: "paleta-pie" }, el("span", {}, el("kbd", {}, "↑"), el("kbd", {}, "↓"), " moverse"), el("span", {}, el("kbd", {}, "Enter"), " abrir"), el("span", {}, el("kbd", {}, "Esc"), " cerrar")));
    const fondo = el("div", { class: "modal-fondo paleta-fondo" }, caja);

    let opciones = [];
    let activo = 0;

    const marcar = () => {
      opciones.forEach((o, i) => {
        o.nodo.classList.toggle("activa", i === activo);
        o.nodo.setAttribute("aria-selected", String(i === activo));
      });
      const actual = opciones[activo]?.nodo;
      if (actual) {
        entrada.setAttribute("aria-activedescendant", actual.id);
        actual.scrollIntoView({ block: "nearest" });
      }
    };

    const pintar = () => {
      const q = entrada.value.trim();
      opciones = [];
      activo = 0;
      if (!q) {
        lista.replaceChildren(el("p", { class: "paleta-ayuda" }, "Escribe para buscar. Atajo: Ctrl + K."));
        return;
      }
      const grupos = buscar(q).filter(g => g.resultados.length);
      if (!grupos.length) {
        lista.replaceChildren(el("p", { class: "paleta-ayuda" }, `Sin resultados para “${q}”.`));
        return;
      }
      lista.replaceChildren(...grupos.map(g => el("div", { class: "paleta-grupo", role: "group", "aria-label": g.grupo },
        el("p", { class: "paleta-grupo-titulo" }, g.grupo),
        g.resultados.map(r => {
          const nodo = el("button", { type: "button", class: "paleta-opcion", role: "option", id: `paleta-op-${opciones.length}`, tabindex: "-1" },
            el("span", { class: "paleta-opcion-titulo" }, resaltar(r.titulo, q)),
            r.subtitulo ? el("span", { class: "paleta-opcion-sub" }, resaltar(r.subtitulo, q)) : null);
          const indice = opciones.length;
          nodo.addEventListener("click", () => ejecutar(indice));
          nodo.addEventListener("mousemove", () => { if (activo !== indice) { activo = indice; marcar(); } });
          opciones.push({ nodo, accion: r.accion });
          return nodo;
        }))));
      marcar();
    };

    const ejecutar = i => {
      const opcion = opciones[i];
      if (!opcion) return;
      cerrar(false);
      opcion.accion();
    };

    function cerrar(devolverFoco = true) {
      fondo.remove();
      document.body.style.overflow = "";
      abierta = null;
      if (devolverFoco) focoAnterior?.focus?.();
    }

    entrada.addEventListener("input", conRetraso(pintar, 120));
    entrada.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { e.preventDefault(); activo = Math.min(opciones.length - 1, activo + 1); marcar(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); activo = Math.max(0, activo - 1); marcar(); }
      else if (e.key === "Enter") { e.preventDefault(); ejecutar(activo); }
    });
    fondo.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } });
    fondo.addEventListener("mousedown", e => { if (e.target === fondo) cerrar(); });

    document.body.append(fondo);
    document.body.style.overflow = "hidden";
    abierta = { cerrar };
    pintar();
    requestAnimationFrame(() => entrada.focus());
  }

  return { abrir };
}
