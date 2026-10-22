// =========================================================
// CicloVictoria · cotizaciones.js
// Carrito flotante, cotizaciones (COT-0001), estados, aprobación
// con descuento de stock, historial y PDF para el cliente.
// =========================================================

import { CLAVES, VALIDEZ_COTIZACION_DIAS, ESTADOS_COTIZACION, TIPOS_PRECIO } from "./config.js";
import { precioFinal, precioBase, llevaIva, REGLA_IVA, TEXTO_IVA_INCLUIDO } from "./precios.js";
import {
  leerLocal, guardarLocal, obtenerProducto, calcularTotales, obtenerCotizaciones, obtenerCotizacion,
  crearCotizacion, actualizarCotizacion, eliminarCotizacion, aprobarCotizacion, devolverStockCotizacion,
  estadoCotizacion, faltantesCotizacion, obtenerConfiguracion, calcularMargen, normalizarTexto,
  itemsConSerial, serialesDeProducto, validarSerialesVenta, buscarPorReferencia, reglaIvaDe
} from "./datos.js";
import { abrirEscaner } from "./qr.js";
import {
  el, icono, botonIcono, toast, confirmar, abrirModal, estadoVacio, crearHistorial, imagenProducto,
  formatoCOP, formatoNumero, formatoPorcentaje, prefiereMenosMovimiento, conRetraso,
  nuevoPDF, cuadroPDF, tablaPDF, totalesPDF, filasTotales, piePDF, pdfTexto, pdfCOP, fechaPDF
} from "./ui.js";

let admin = null;
let seccion = null;
let alCambiarInventario = () => {};
let navegar = () => {};

// ---------- Estado del carrito (persistente) ----------
// reglaIva: "redondeado" (precios finales con IVA, redondeados a la centena) salvo al editar una cotización anterior
const CARRITO_VACIO = { items: [], descuentoGeneral: 0, editando: null, tipoPrecio: "publico", reglaIva: REGLA_IVA.redondeado };
let carrito = leerCarrito();

/** Carrito guardado; reglaIva queda en null si es de antes del cambio de IVA (se migra al iniciar) */
function leerCarrito() {
  const guardado = leerLocal(CLAVES.carrito, {});
  return { ...CARRITO_VACIO, ...guardado, reglaIva: guardado.reglaIva ?? null };
}

/**
 * Carrito guardado con una regla anterior: si se estaba editando una cotización vieja conserva
 * su regla; si no, sus líneas pasan al precio final redondeado actual de cada producto.
 * Se llama al iniciar, cuando los productos ya están cargados.
 */
function migrarCarrito() {
  if (carrito.reglaIva === REGLA_IVA.redondeado) return;
  if (carrito.editando) carrito.reglaIva = carrito.reglaIva ?? REGLA_IVA.aparte;
  else {
    carrito.reglaIva = REGLA_IVA.redondeado;
    carrito.items = carrito.items.map(item => conPrecioActual(item, carrito.tipoPrecio, REGLA_IVA.redondeado));
  }
  guardarLocal(CLAVES.carrito, carrito);
}

/** Precio de una línea según la regla: final con IVA (vigente) o base (cotizaciones anteriores) */
function precioLinea(producto, tipo, regla) {
  return regla === REGLA_IVA.aparte ? precioBase(producto, tipo) : precioFinal(producto, tipo);
}

/** Línea con el precio actual del producto (si todavía existe) */
function conPrecioActual(item, tipo, regla) {
  const producto = obtenerProducto(item.productoId);
  if (!producto) return item;
  return { ...item, precio: precioLinea(producto, tipo, regla) ?? item.precio, aplicaIva: llevaIva(producto), costo: producto.costo ?? item.costo };
}

const dom = {};
const formatoFechaCorta = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
const fechaCorta = iso => formatoFechaCorta.format(new Date(iso));
const CLASE_ESTADO = { Borrador: "", Enviada: "chip-negro", Aprobada: "chip-ok", Rechazada: "chip-peligro", Vencida: "chip-alerta" };

// =========================================================
// Arranque
// =========================================================

export function iniciarCotizaciones(opciones) {
  ({ admin, seccion } = opciones);
  alCambiarInventario = opciones.alCambiarInventario ?? alCambiarInventario;
  navegar = opciones.navegar ?? navegar;
  migrarCarrito();
  construirCarrito();
  construirSeccion();
  pintarCarrito();
}

function guardarCarrito() {
  if (!guardarLocal(CLAVES.carrito, carrito)) toast("No se pudo guardar el carrito en el navegador.", "error");
  pintarCarrito();
}

// =========================================================
// Carrito flotante
// =========================================================

function construirCarrito() {
  dom.contador = el("span", { class: "carrito-contador", "aria-hidden": "true" }, "0");
  dom.pestana = el("button", {
    type: "button", class: "carrito-pestana", "aria-controls": "panel-carrito", "aria-expanded": "false",
    onclick: () => abrirCarrito(true)
  }, icono("carrito"), dom.contador);

  dom.titulo = el("h2", { id: "titulo-carrito" }, "Cotización");
  dom.aviso = el("div", { class: "carrito-edicion", hidden: true });
  dom.items = el("div", { class: "carrito-items" });
  // Precio al público o al por mayor: cambia el precio de todas las líneas
  dom.tipoPrecio = el("div", { class: "segmentado", role: "group", "aria-label": "Tipo de precio", id: "tipo-precio" },
    ...Object.entries(TIPOS_PRECIO).map(([valor, texto]) =>
      el("button", { type: "button", dataset: { valor }, "aria-pressed": "false" }, texto)));
  dom.tipoPrecio.addEventListener("click", e => {
    const boton = e.target.closest("button[data-valor]");
    if (boton) cambiarTipoPrecio(boton.dataset.valor);
  });
  dom.descuentoGeneral = el("input", { type: "number", id: "descuento-general", class: "entrada", min: 0, max: 100, step: 0.5, value: 0, inputMode: "decimal" });
  dom.totales = el("dl", { class: "carrito-totales" });
  dom.vaciar = el("button", { type: "button", class: "boton boton-secundario", onclick: vaciarCarrito }, "Vaciar");
  dom.generar = el("button", { type: "button", class: "boton boton-acento", id: "generar-cotizacion", onclick: generarDesdeCarrito }, "Generar cotización");

  dom.panel = el("aside", { class: "panel-carrito", id: "panel-carrito", role: "dialog", "aria-labelledby": "titulo-carrito", inert: true },
    el("div", { class: "carrito-cabecera" }, dom.titulo,
      el("div", { class: "grupo-botones" },
        botonIcono("escaner", "Escanear producto para agregarlo", { onclick: escanearAlCarrito }),
        botonIcono("cerrar", "Cerrar carrito", { onclick: () => abrirCarrito(false) }))),
    dom.aviso,
    dom.items,
    el("div", { class: "carrito-resumen" },
      el("div", { class: "campo carrito-descuento" }, el("span", { class: "etiqueta" }, "Precio"), dom.tipoPrecio),
      el("div", { class: "campo carrito-descuento" },
        el("label", { for: "descuento-general" }, "Descuento general (%)"), dom.descuentoGeneral),
      dom.totales,
      el("div", { class: "carrito-botones" }, dom.vaciar, dom.generar)));
  dom.fondo = el("div", { class: "carrito-fondo", onclick: () => abrirCarrito(false) });
  document.body.append(dom.pestana, dom.fondo, dom.panel);

  // Delegación: un solo listener para todos los ítems
  dom.items.addEventListener("click", e => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    const id = boton.closest("[data-id]").dataset.id;
    const item = carrito.items.find(i => i.productoId === id);
    if (!item) return;
    if (boton.dataset.accion === "mas") cambiarCantidad(id, item.cantidad + 1);
    if (boton.dataset.accion === "menos") cambiarCantidad(id, item.cantidad - 1);
    if (boton.dataset.accion === "quitar") quitarItem(id);
  });
  dom.items.addEventListener("change", e => {
    const fila = e.target.closest("[data-id]");
    if (!fila) return;
    if (e.target.matches(".carrito-cantidad")) cambiarCantidad(fila.dataset.id, Math.round(Number(e.target.value) || 0));
    if (e.target.matches(".carrito-descuento-linea")) cambiarDescuento(fila.dataset.id, Number(e.target.value) || 0);
  });
  dom.descuentoGeneral.addEventListener("change", () => {
    const valor = Math.min(100, Math.max(0, Number(dom.descuentoGeneral.value) || 0));
    carrito.descuentoGeneral = valor;
    guardarCarrito();
    avisarBajoCosto();
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && dom.panel.classList.contains("abierto") && !document.querySelector(".modal-fondo")) abrirCarrito(false);
  });
}

/** Escanea la etiqueta QR de un producto y lo suma al carrito */
function escanearAlCarrito() {
  abrirEscaner({
    titulo: "Agregar al carrito",
    alLeer: codigo => {
      const producto = buscarPorReferencia(codigo);
      if (!producto) { toast(`No hay un producto con el código ${codigo}.`, "error"); return; }
      agregarAlCarrito(producto.id, 1);
    }
  });
}

export function abrirCarrito(abrir = true) {
  dom.panel.classList.toggle("abierto", abrir);
  dom.fondo.classList.toggle("visible", abrir);
  dom.panel.inert = !abrir;
  dom.pestana.setAttribute("aria-expanded", String(abrir));
  if (abrir) requestAnimationFrame(() => dom.panel.querySelector(".boton-icono")?.focus());
  else if (dom.panel.contains(document.activeElement)) dom.pestana.focus();
}

/** Stock máximo que se puede cotizar de un producto */
function stockDisponible(productoId) {
  return obtenerProducto(productoId)?.stock ?? 0;
}

/**
 * Agrega un producto al carrito. Si ya está, suma en la misma línea (findIndex).
 * Devuelve true si se agregó.
 */
export function agregarAlCarrito(productoId, cantidad = 1) {
  const producto = obtenerProducto(productoId);
  if (!producto) { toast("El producto ya no existe.", "error"); return false; }
  const precio = precioLinea(producto, carrito.tipoPrecio, carrito.reglaIva);
  if (!precio) { toast(`"${producto.nombre}" no tiene precio de venta. Asígnalo antes de cotizarlo.`, "error"); return false; }
  const indice = carrito.items.findIndex(i => i.productoId === productoId);
  const enCarrito = indice === -1 ? 0 : carrito.items[indice].cantidad;
  const nuevaCantidad = enCarrito + cantidad;
  if (nuevaCantidad > producto.stock) {
    toast(`Solo hay ${formatoNumero(producto.stock)} unidades de "${producto.nombre}"${enCarrito ? ` y ya tienes ${formatoNumero(enCarrito)} en el carrito` : ""}.`, "error");
    return false;
  }
  if (indice === -1) {
    carrito.items.push({
      productoId, referencia: producto.referencia, nombre: producto.nombre,
      precio, aplicaIva: llevaIva(producto), costo: producto.costo, cantidad, descuento: 0
    });
  } else {
    carrito.items[indice].cantidad = nuevaCantidad;
  }
  guardarCarrito();
  toast(`${formatoNumero(cantidad)} × ${producto.nombre} agregado al carrito.`, "exito", 2500);
  // Rebote del ícono y salto del contador
  dom.pestana.classList.remove("rebote");
  void dom.pestana.offsetWidth;
  dom.pestana.classList.add("rebote");
  return true;
}

async function cambiarCantidad(productoId, cantidad) {
  const item = carrito.items.find(i => i.productoId === productoId);
  if (!item) return;
  if (cantidad <= 0) {
    const quitar = await confirmar({ titulo: "Quitar producto", mensaje: `¿Quitar "${item.nombre}" del carrito?`, aceptar: "Quitar" });
    if (quitar) quitarItem(productoId, false);
    else pintarCarrito();
    return;
  }
  const maximo = stockDisponible(productoId);
  if (cantidad > maximo) {
    toast(`Solo hay ${formatoNumero(maximo)} unidades disponibles de "${item.nombre}".`, "error");
    cantidad = maximo;
  }
  item.cantidad = cantidad;
  guardarCarrito();
}

/** Cambia todas las líneas al precio al público o al por mayor actual de cada producto */
function cambiarTipoPrecio(tipo) {
  if (tipo === carrito.tipoPrecio) return;
  carrito.tipoPrecio = tipo;
  for (const item of carrito.items) {
    const producto = obtenerProducto(item.productoId);
    if (producto) item.precio = precioLinea(producto, tipo, carrito.reglaIva) ?? item.precio;
  }
  guardarCarrito();
  if (carrito.items.length) toast(`Precios ${tipo === "mayorista" ? "al por mayor" : "al público"} aplicados.`, "info", 2500);
}

function cambiarDescuento(productoId, descuento) {
  const item = carrito.items.find(i => i.productoId === productoId);
  if (!item) return;
  item.descuento = Math.min(100, Math.max(0, descuento));
  guardarCarrito();
  avisarBajoCosto();
}

/** Avisa si algún descuento deja un ítem por debajo del costo */
function avisarBajoCosto() {
  const { lineas } = calcularTotales(carrito.items, carrito.descuentoGeneral, carrito.reglaIva);
  const bajos = carrito.items.filter((_, i) => lineas[i].bajoCosto);
  if (bajos.length) toast(`Con ese descuento ${bajos.length === 1 ? `"${bajos[0].nombre}" queda` : `${bajos.length} productos quedan`} por debajo del costo.`, "advertencia", 5000);
}

function quitarItem(productoId, avisar = true) {
  const item = carrito.items.find(i => i.productoId === productoId);
  carrito.items = carrito.items.filter(i => i.productoId !== productoId);
  guardarCarrito();
  if (avisar && item) toast(`"${item.nombre}" quitado del carrito.`, "info", 2500);
}

async function vaciarCarrito() {
  if (!carrito.items.length && !carrito.editando) return;
  const ok = await confirmar({
    titulo: carrito.editando ? "Cancelar edición" : "Vaciar carrito",
    mensaje: carrito.editando ? `Se descartarán los cambios de ${carrito.editando.numero}.` : "Se quitarán todos los productos del carrito.",
    aceptar: carrito.editando ? "Descartar cambios" : "Vaciar", peligro: true
  });
  if (!ok) return;
  carrito = { ...CARRITO_VACIO, items: [] };
  guardarCarrito();
}

/** Filas dt/dd de los totales; "Incluye IVA" va en texto pequeño debajo del total */
function filasTotalesCarrito(totales) {
  return filasTotales(totales).flatMap(f => {
    const clase = f.tipo === "total" ? "total" : f.tipo === "nota-iva" ? "nota-iva" : "";
    const valor = f.tipo === "descuento" ? (f.valor ? `− ${formatoCOP(f.valor)}` : formatoCOP(0)) : formatoCOP(f.valor);
    return [el("dt", { class: clase }, f.etiqueta), el("dd", { class: `numero ${clase}` }, valor)];
  });
}

function pintarCarrito() {
  const unidades = carrito.items.reduce((s, i) => s + i.cantidad, 0);
  dom.contador.textContent = formatoNumero(carrito.items.length);
  dom.contador.hidden = !carrito.items.length;
  dom.pestana.setAttribute("aria-label", `Abrir carrito (${carrito.items.length} productos, ${formatoNumero(unidades)} unidades)`);
  dom.titulo.textContent = carrito.editando ? `Editando ${carrito.editando.numero}` : "Cotización";
  dom.aviso.hidden = !carrito.editando;
  if (carrito.editando) {
    dom.aviso.replaceChildren(icono("info"), el("span", {}, `Los cambios se guardarán sobre ${carrito.editando.numero}.`));
  }
  dom.descuentoGeneral.value = carrito.descuentoGeneral;
  dom.tipoPrecio.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.valor === (carrito.tipoPrecio ?? "publico"))));
  dom.generar.textContent = carrito.editando ? "Guardar cambios" : "Generar cotización";
  dom.generar.disabled = !carrito.items.length;
  dom.vaciar.textContent = carrito.editando ? "Cancelar edición" : "Vaciar";
  dom.vaciar.disabled = !carrito.items.length && !carrito.editando;

  const totales = calcularTotales(carrito.items, carrito.descuentoGeneral, carrito.reglaIva);
  if (!carrito.items.length) {
    dom.items.replaceChildren(estadoVacio({
      titulo: "Carrito vacío",
      mensaje: "Usa el botón AGREGAR de las tarjetas del inventario para armar una cotización."
    }));
  } else {
    dom.items.replaceChildren(...carrito.items.map((item, i) => filaCarrito(item, totales.lineas[i])));
  }

  const fila = (titulo, valor, clase = "") => [el("dt", { class: clase }, titulo), el("dd", { class: `numero ${clase}` }, valor)];
  dom.totales.replaceChildren(
    ...filasTotalesCarrito(totales),
    ...fila("Utilidad estimada (sin IVA)", totales.utilidadCompleta ? formatoCOP(totales.utilidad) : `${formatoCOP(totales.utilidad)} *`, "utilidad"));
}

function filaCarrito(item, linea) {
  const producto = obtenerProducto(item.productoId);
  const maximo = producto?.stock ?? 0;
  return el("div", { class: "carrito-item", dataset: { id: item.productoId } },
    el("img", { src: producto ? imagenProducto(producto) : imagenProducto({ linea: "Bicicleta" }), alt: "", width: 56, height: 56 }),
    el("div", { class: "carrito-item-info" },
      el("strong", {}, item.nombre),
      el("span", { class: "texto-suave" }, `${item.referencia} · ${formatoCOP(item.precio)} c/u${carrito.reglaIva !== REGLA_IVA.aparte && item.aplicaIva ? ` · ${TEXTO_IVA_INCLUIDO}` : ""}`),
      linea.bajoCosto ? el("span", { class: "chip chip-peligro", style: { alignSelf: "flex-start" } }, "Bajo el costo") : null,
      !producto ? el("span", { class: "chip chip-alerta", style: { alignSelf: "flex-start" } }, "Producto eliminado") : null),
    botonIcono("eliminar", `Quitar ${item.nombre}`, { class: "pequeno", dataset: { accion: "quitar" } }),
    el("div", { class: "carrito-item-controles" },
      el("div", { class: "cantidad" },
        el("button", { type: "button", "aria-label": "Restar una unidad", dataset: { accion: "menos" } }, "−"),
        el("input", { type: "number", class: "carrito-cantidad", min: 0, max: maximo, value: item.cantidad, "aria-label": `Cantidad de ${item.nombre}` }),
        el("button", { type: "button", "aria-label": "Sumar una unidad", dataset: { accion: "mas" }, disabled: item.cantidad >= maximo }, "+")),
      el("label", { class: "carrito-desc" }, "Desc. %",
        el("input", { type: "number", class: "entrada carrito-descuento-linea", min: 0, max: 100, step: 0.5, value: item.descuento, "aria-label": `Descuento de ${item.nombre}` })),
      el("span", { class: "carrito-subtotal numero" }, formatoCOP(linea.neto))));
}

/** "Generar cotización" o "Guardar cambios" (si se está editando una) */
function generarDesdeCarrito() {
  if (!carrito.items.length) return;
  const faltan = carrito.items.filter(i => i.cantidad > stockDisponible(i.productoId));
  if (faltan.length) {
    toast(`No hay stock suficiente para: ${faltan.map(i => i.nombre).join(", ")}.`, "error");
    return;
  }
  const existente = carrito.editando ? obtenerCotizacion(carrito.editando.id) : null;
  abrirDatosCliente(existente);
}

function abrirDatosCliente(existente = null) {
  const campo = (id, etiqueta, control, ancho = false) => {
    control.id = id;
    return el("div", { class: `campo ${ancho ? "ancho-completo" : ""}` }, el("label", { for: id }, etiqueta), control);
  };
  const c = {
    nombre: el("input", { class: "entrada", type: "text", required: true, maxLength: 120, value: existente?.cliente.nombre ?? "", autocomplete: "off" }),
    telefono: el("input", { class: "entrada", type: "tel", maxLength: 30, value: existente?.cliente.telefono ?? "" }),
    documento: el("input", { class: "entrada", type: "text", maxLength: 30, value: existente?.cliente.documento ?? "" }),
    validez: el("input", { class: "entrada", type: "number", min: 1, max: 365, value: existente?.validezDias ?? VALIDEZ_COTIZACION_DIAS }),
    observaciones: el("textarea", { class: "entrada", rows: 3, maxLength: 600 })
  };
  c.observaciones.value = existente?.observaciones ?? "";
  const error = el("p", { class: "campo-error", role: "alert" });
  const totales = calcularTotales(carrito.items, carrito.descuentoGeneral, carrito.reglaIva);
  const formulario = el("form", { class: "form-grilla", novalidate: true, onsubmit: e => e.preventDefault() },
    campo("cot-cliente", "Cliente *", c.nombre, true),
    campo("cot-telefono", "Teléfono", c.telefono),
    campo("cot-documento", "Cédula / NIT (opcional)", c.documento),
    campo("cot-validez", "Validez (días)", c.validez),
    el("div", { class: "campo" }, el("span", { class: "etiqueta" }, "Total"), el("strong", { class: "numero", style: { fontSize: "20px" } }, formatoCOP(totales.total))),
    campo("cot-observaciones", "Observaciones", c.observaciones, true),
    el("div", { class: "ancho-completo" }, error));

  abrirModal({
    titulo: existente ? `Guardar cambios en ${existente.numero}` : "Generar cotización",
    contenido: formulario,
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      {
        texto: existente ? "Guardar cambios" : "Generar cotización", clase: "boton-acento",
        alHacerClic: () => {
          const datos = {
            cliente: { nombre: c.nombre.value, telefono: c.telefono.value, documento: c.documento.value },
            validezDias: Math.max(1, Math.round(Number(c.validez.value) || VALIDEZ_COTIZACION_DIAS)),
            observaciones: c.observaciones.value,
            items: carrito.items,
            descuentoGeneral: carrito.descuentoGeneral,
            tipoPrecio: carrito.tipoPrecio ?? "publico"
          };
          if (!datos.cliente.nombre.trim()) {
            error.textContent = "Escribe el nombre del cliente.";
            c.nombre.setAttribute("aria-invalid", "true");
            c.nombre.focus();
            return false;
          }
          try {
            const cotizacion = existente
              ? actualizarCotizacion(existente.id, datos, admin, "Editó la cotización", `${datos.items.length} ítems · total ${formatoCOP(calcularTotales(datos.items, datos.descuentoGeneral, reglaIvaDe(existente)).total)}`)
              : crearCotizacion(datos, admin);
            carrito = { ...CARRITO_VACIO, items: [] };
            guardarCarrito();
            abrirCarrito(false);
            toast(existente ? `${cotizacion.numero} actualizada.` : `Cotización ${cotizacion.numero} creada.`, "exito");
            navegar("cotizaciones");
            pintarCotizaciones();
          } catch (e) {
            error.textContent = e.message;
            return false;
          }
        }
      }
    ]
  });
}

// =========================================================
// Sección Cotizaciones: listado, filtros y acciones
// =========================================================

const filtros = { texto: "", estado: "", desde: "", hasta: "" };

function construirSeccion() {
  dom.lista = el("div", { class: "lista-cotizaciones" });
  dom.contadorCot = el("span", { class: "contador-resultados", "aria-live": "polite" });
  dom.buscador = el("input", { type: "search", id: "buscar-cotizacion", placeholder: "Buscar por número, cliente o teléfono", autocomplete: "off" });
  const selectEstado = el("select", { id: "filtro-estado-cot", class: "entrada" },
    el("option", { value: "" }, "Todos los estados"), ESTADOS_COTIZACION.map(e => el("option", { value: e }, e)));
  const desde = el("input", { type: "date", id: "filtro-desde", class: "entrada" });
  const hasta = el("input", { type: "date", id: "filtro-hasta", class: "entrada" });

  const repintar = conRetraso(() => {
    filtros.texto = dom.buscador.value;
    filtros.estado = selectEstado.value;
    filtros.desde = desde.value;
    filtros.hasta = hasta.value;
    pintarCotizaciones();
  }, 180);
  [dom.buscador, selectEstado, desde, hasta].forEach(c => c.addEventListener(c === dom.buscador ? "input" : "change", repintar));

  seccion.replaceChildren(
    el("div", { class: "cabecera-seccion" },
      el("div", {},
        el("h1", { style: { fontSize: "clamp(24px,3.4vw,34px)" } }, "Cotizaciones"),
        el("p", {}, "Arma el carrito desde el inventario con AGREGAR y genera la cotización.")),
      el("div", { class: "barra-herramientas" },
        el("button", { type: "button", class: "boton boton-acento", onclick: () => abrirCarrito(true) }, icono("carrito"), "Abrir carrito"))),
    el("div", { class: "tarjeta bloque-filtro filtros-cotizaciones" },
      el("div", { class: "buscador" }, el("label", { for: "buscar-cotizacion", class: "solo-lector" }, "Buscar cotización"), dom.buscador,
        el("span", { class: "lupa", "aria-hidden": "true" }, icono("buscar"))),
      el("div", { class: "campo" }, el("label", { for: "filtro-estado-cot" }, "Estado"), selectEstado),
      el("div", { class: "campo" }, el("label", { for: "filtro-desde" }, "Desde"), desde),
      el("div", { class: "campo" }, el("label", { for: "filtro-hasta" }, "Hasta"), hasta)),
    el("div", { class: "barra-resultados", style: { marginTop: "16px" } }, dom.contadorCot),
    dom.lista);

  // Delegación de eventos de la lista
  dom.lista.addEventListener("click", e => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    const id = boton.closest("[data-id]").dataset.id;
    const acciones = { ver: verDetalle, pdf: descargarPDF, editar: editarCotizacion, duplicar: duplicarCotizacion, eliminar: borrarCotizacion };
    acciones[boton.dataset.accion]?.(id);
  });
  dom.lista.addEventListener("change", e => {
    if (!e.target.matches(".select-estado")) return;
    const id = e.target.closest("[data-id]").dataset.id;
    cambiarEstado(id, e.target.value);
  });
}

function filtrarCotizaciones() {
  const texto = normalizarTexto(filtros.texto);
  return obtenerCotizaciones().filter(c => {
    const estado = estadoCotizacion(c);
    if (filtros.estado && estado !== filtros.estado) return false;
    const dia = c.fecha.slice(0, 10);
    if (filtros.desde && dia < filtros.desde) return false;
    if (filtros.hasta && dia > filtros.hasta) return false;
    if (texto && !normalizarTexto(`${c.numero} ${c.cliente.nombre} ${c.cliente.telefono} ${c.cliente.documento}`).includes(texto)) return false;
    return true;
  });
}

export function pintarCotizaciones() {
  if (!dom.lista) return;
  const todas = obtenerCotizaciones();
  const lista = filtrarCotizaciones();
  dom.contadorCot.textContent = `${formatoNumero(lista.length)} de ${formatoNumero(todas.length)} cotizaciones`;
  if (!lista.length) {
    dom.lista.replaceChildren(estadoVacio({
      titulo: todas.length ? "Sin resultados" : "Aún no hay cotizaciones",
      mensaje: todas.length ? "Cambia la búsqueda o los filtros." : "Agrega productos al carrito desde el inventario y pulsa “Generar cotización”."
    }));
    return;
  }
  dom.lista.replaceChildren(el("div", { class: "tarjeta tabla-cotizaciones-contenedor" },
    el("table", { class: "tabla-simple tabla-cotizaciones" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Número"), el("th", {}, "Cliente"), el("th", {}, "Fecha"), el("th", { class: "num" }, "Total"),
        el("th", { class: "num" }, "Utilidad"), el("th", {}, "Administrador"), el("th", {}, "Estado"), el("th", {}, el("span", { class: "solo-lector" }, "Acciones")))),
      el("tbody", {}, lista.map(filaCotizacion)))));
}

function filaCotizacion(c, indice) {
  const estado = estadoCotizacion(c);
  const opciones = ESTADOS_COTIZACION.filter(e => e !== "Vencida" || estado === "Vencida");
  const select = el("select", { class: `entrada select-estado estado-${estado.toLowerCase()}`, "aria-label": `Estado de ${c.numero}` },
    opciones.map(e => el("option", { value: e, selected: e === estado, disabled: e === "Vencida" }, e)));
  return el("tr", { dataset: { id: c.id }, class: "aparecer", style: { "--i": Math.min(indice, 12) } },
    el("td", { "data-titulo": "Número" }, el("button", { type: "button", class: "enlace-simple", dataset: { accion: "ver" } }, c.numero)),
    el("td", { "data-titulo": "Cliente" }, el("div", { style: { fontWeight: 600 } }, c.cliente.nombre), c.cliente.telefono ? el("div", { class: "texto-suave" }, c.cliente.telefono) : null,
      c.tipoPrecio === "mayorista" ? el("span", { class: "chip chip-negro" }, "Por mayor") : null),
    el("td", { "data-titulo": "Fecha" }, fechaCorta(c.fecha), el("div", { class: "texto-suave" }, `Vence ${fechaCorta(c.venceEl)}`)),
    el("td", { class: "num", "data-titulo": "Total" }, el("strong", {}, formatoCOP(c.totales.total))),
    el("td", { class: "num", "data-titulo": "Utilidad" }, formatoCOP(c.totales.utilidad)),
    el("td", { "data-titulo": "Administrador" }, c.admin),
    el("td", { "data-titulo": "Estado" }, select),
    el("td", { class: "acciones-fila" },
      botonIcono("ojo", `Ver ${c.numero}`, { class: "pequeno", dataset: { accion: "ver" } }),
      botonIcono("descargar", `PDF de ${c.numero}`, { class: "pequeno", dataset: { accion: "pdf" } }),
      c.estado !== "Aprobada" ? botonIcono("editar", `Editar ${c.numero}`, { class: "pequeno", dataset: { accion: "editar" } }) : null,
      botonIcono("caja", `Duplicar ${c.numero}`, { class: "pequeno", dataset: { accion: "duplicar" } }),
      botonIcono("eliminar", `Eliminar ${c.numero}`, { class: "pequeno peligro", dataset: { accion: "eliminar" } })));
}

function intentar(fn, exito) {
  try {
    const r = fn();
    if (exito) toast(exito, "exito");
    return r ?? true;
  } catch (e) {
    console.error(e);
    toast(e.message, "error", 7000);
    return null;
  }
}

// ---------- Cambio de estado y aprobación ----------

async function cambiarEstado(id, nuevo) {
  const cotizacion = obtenerCotizacion(id);
  if (!cotizacion) return;
  const anterior = estadoCotizacion(cotizacion);
  if (nuevo === anterior) return;

  if (nuevo === "Aprobada") {
    abrirAprobacion(cotizacion);
    return;
  }
  // Si estaba aprobada con stock descontado, se ofrece devolverlo
  if (cotizacion.estado === "Aprobada" && cotizacion.stockDescontado) {
    const devolver = await confirmar({
      titulo: "Devolver unidades",
      mensaje: `${cotizacion.numero} descontó stock al aprobarse. ¿Devolver esas unidades al inventario al pasarla a "${nuevo}"?`,
      aceptar: "Devolver y cambiar", cancelar: "Cambiar sin devolver"
    });
    if (devolver) {
      if (!intentar(() => devolverStockCotizacion(id, admin))) { pintarCotizaciones(); return; }
      alCambiarInventario();
    }
  }
  const cambios = { estado: nuevo };
  // Si estaba vencida y se reactiva, la validez vuelve a contar desde hoy
  if (anterior === "Vencida" && ["Borrador", "Enviada"].includes(nuevo)) {
    const vence = new Date();
    vence.setDate(vence.getDate() + (cotizacion.validezDias || VALIDEZ_COTIZACION_DIAS));
    cambios.venceEl = vence.toISOString();
  }
  intentar(() => actualizarCotizacion(id, cambios, admin, `Cambió el estado a ${nuevo}`, `${anterior} → ${nuevo}`), `${cotizacion.numero}: ${nuevo}.`);
  pintarCotizaciones();
}

function abrirAprobacion(cotizacion) {
  const faltantes = faltantesCotizacion(cotizacion);
  const conSerial = itemsConSerial(cotizacion);
  let aprobada = false;

  // Un campo por unidad para los productos que manejan serial (con los disponibles como sugerencia)
  const camposSerial = new Map();
  const bloqueSeriales = conSerial.length
    ? el("div", { class: "seriales-aprobacion" },
        el("h4", {}, "Seriales de las unidades vendidas"),
        el("p", { class: "campo-ayuda" }, "Elige un serial disponible de la lista o escribe uno nuevo (se registra como vendido)."),
        conSerial.map(item => {
          const disponibles = serialesDeProducto(item.productoId, "Disponible");
          const idLista = `seriales-${item.productoId}`;
          const entradas = Array.from({ length: item.cantidad }, (_, n) =>
            el("input", { class: "entrada entrada-serial", type: "text", list: idLista, autocomplete: "off",
              placeholder: `Serial unidad ${n + 1}`, "aria-label": `Serial de la unidad ${n + 1} de ${item.nombre}` }));
          camposSerial.set(item.productoId, entradas);
          return el("div", { class: "grupo-serial" },
            el("strong", {}, `${item.nombre} × ${formatoNumero(item.cantidad)}`),
            el("span", { class: "texto-suave" }, `${disponibles.length} serial${disponibles.length === 1 ? "" : "es"} disponible${disponibles.length === 1 ? "" : "s"}`),
            el("datalist", { id: idLista }, disponibles.map(s => el("option", { value: s.serial }))),
            el("div", { class: "entradas-serial" }, entradas));
        }))
    : null;
  const errorSerial = el("p", { class: "campo-error", role: "alert" });

  const leerSeriales = () => Object.fromEntries([...camposSerial].map(([id, entradas]) => [id, entradas.map(e => e.value.trim())]));
  const validar = () => {
    errorSerial.textContent = "";
    const errores = validarSerialesVenta(cotizacion, leerSeriales());
    if (errores.length) { errorSerial.textContent = errores.join(" "); return false; }
    return true;
  };

  const cuerpo = el("div", {},
    el("p", {}, `Vas a aprobar ${cotizacion.numero} de ${cotizacion.cliente.nombre} por ${formatoCOP(cotizacion.totales.total)}.`),
    el("p", { class: "texto-suave", style: { marginTop: "8px" } }, "¿Quieres descontar del inventario las unidades vendidas? Quedará registrado como “Venta – " + cotizacion.numero + "”. Los productos con garantía generan su garantía automáticamente."),
    faltantes.length
      ? el("div", { class: "aviso aviso-peligro", style: { marginTop: "12px" } }, icono("alerta"),
          el("div", {}, el("strong", {}, "No hay existencias suficientes para descontar:"),
            el("ul", { style: { marginTop: "6px", paddingLeft: "18px", listStyle: "disc" } },
              faltantes.map(f => el("li", {}, `${f.nombre}: pide ${formatoNumero(f.cantidad)}, hay ${formatoNumero(f.disponible)}`)))))
      : null,
    bloqueSeriales, errorSerial);

  const aprobar = descontarStock => {
    if (!validar()) return false;
    aprobada = Boolean(intentar(() => aprobarCotizacion(cotizacion.id, admin, { descontarStock, seriales: leerSeriales() }),
      descontarStock ? `${cotizacion.numero} aprobada. Stock descontado.` : `${cotizacion.numero} aprobada sin descontar stock.`));
    if (aprobada) alCambiarInventario();
    return aprobada ? undefined : false;
  };

  abrirModal({
    titulo: "Aprobar cotización",
    contenido: cuerpo,
    ancho: conSerial.length > 0,
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      { texto: "Aprobar sin descontar", clase: "boton-secundario", alHacerClic: () => aprobar(false) },
      { texto: "Aprobar y descontar stock", clase: "boton-acento", alHacerClic: () => {
          if (faltantes.length) { toast("No se puede descontar: faltan existencias.", "error"); return false; }
          return aprobar(true);
        } }
    ],
    alCerrar: () => pintarCotizaciones()
  });
}

// ---------- Ver, editar, duplicar, eliminar ----------

function verDetalle(id) {
  const c = obtenerCotizacion(id);
  if (!c) return;
  const estado = estadoCotizacion(c);
  const t = c.totales;
  // Valor de cada línea según la regla con la que se guardó (las nuevas, redondeado a la centena)
  const { lineas } = calcularTotales(c.items, c.descuentoGeneral, reglaIvaDe(c));
  const tabla = el("table", { class: "tabla-simple" },
    el("thead", {}, el("tr", {}, el("th", {}, "Ref."), el("th", {}, "Producto"), el("th", { class: "num" }, "Cant."),
      el("th", { class: "num" }, "Precio und"), el("th", { class: "num" }, "Desc."), el("th", { class: "num" }, "Subtotal"))),
    el("tbody", {}, c.items.map((i, n) => el("tr", {},
      el("td", {}, i.referencia), el("td", {}, i.nombre), el("td", { class: "num" }, formatoNumero(i.cantidad)),
      el("td", { class: "num" }, formatoCOP(i.precio)), el("td", { class: "num" }, i.descuento ? `${i.descuento} %` : "—"),
      el("td", { class: "num" }, formatoCOP(lineas[n].neto))))));
  const fila = (a, b, clase = "") => el("div", { class: `fila-total ${clase}` }, el("span", {}, a), el("strong", { class: "numero" }, b));
  const margen = calcularMargen(t.base, t.costo);

  const contenido = el("div", { class: "detalle-cotizacion" },
    el("div", { class: "detalle-cot-cabecera" },
      el("div", {},
        el("span", { class: `chip ${CLASE_ESTADO[estado]}` }, estado), " ",
        el("span", { class: "chip" }, `Precios: ${TIPOS_PRECIO[c.tipoPrecio ?? "publico"].toLowerCase()}`),
        el("p", { style: { marginTop: "8px" } }, `Fecha: ${fechaCorta(c.fecha)} · Válida hasta: ${fechaCorta(c.venceEl)}`),
        el("p", { class: "texto-suave" }, `Atendió: ${c.admin}`)),
      el("div", { style: { textAlign: "right" } },
        el("strong", {}, c.cliente.nombre),
        c.cliente.telefono ? el("p", {}, `Tel. ${c.cliente.telefono}`) : null,
        c.cliente.documento ? el("p", {}, `CC/NIT ${c.cliente.documento}`) : null)),
    el("div", { class: "tabla-desplazable" }, tabla),
    el("div", { class: "detalle-cot-totales" },
      ...filasTotales(t).map(f => f.tipo === "descuento"
        ? fila(`Descuentos${c.descuentoGeneral ? ` (incluye ${c.descuentoGeneral} % general)` : ""}`, `− ${formatoCOP(f.valor)}`)
        : fila(f.etiqueta, formatoCOP(f.valor), f.tipo === "total" ? "total" : f.tipo === "nota-iva" ? "nota-iva" : "")),
      el("div", { class: "solo-pantalla" },
        fila("Costo", formatoCOP(t.costo)),
        fila("Utilidad estimada (sin IVA)", `${formatoCOP(t.utilidad)} (${formatoPorcentaje(margen)})`))),
    c.observaciones ? el("p", { style: { marginTop: "12px" } }, el("strong", {}, "Observaciones: "), c.observaciones) : null,
    c.seriales && Object.values(c.seriales).flat().length
      ? el("p", { style: { marginTop: "12px" } }, el("strong", {}, "Seriales vendidos: "), Object.values(c.seriales).flat().join(", "))
      : null,
    c.garantias?.length ? el("p", { class: "texto-suave" }, `${c.garantias.length} garantía${c.garantias.length === 1 ? "" : "s"} generada${c.garantias.length === 1 ? "" : "s"}.`) : null,
    el("div", { class: "solo-pantalla", style: { marginTop: "16px" } }, crearHistorial(c.historial || [], { visibles: 5, titulo: "Historial" })));
  // FUTURO: enviar cotización por WhatsApp

  abrirModal({
    titulo: c.numero,
    contenido,
    ancho: true,
    acciones: [
      { texto: "Imprimir", clase: "boton-secundario", alHacerClic: () => { window.print(); return false; } },
      { texto: "Duplicar", clase: "boton-secundario", alHacerClic: () => { duplicarCotizacion(id); } },
      ...(c.estado !== "Aprobada" ? [{ texto: "Editar", clase: "boton-secundario", alHacerClic: () => { editarCotizacion(id); } }] : []),
      { texto: "Descargar PDF", clase: "boton-acento", alHacerClic: () => { descargarPDF(id); return false; } }
    ]
  });
}

async function editarCotizacion(id) {
  const c = obtenerCotizacion(id);
  if (!c) return;
  if (c.estado === "Aprobada") { toast("Una cotización aprobada no se puede editar. Cámbiale el estado primero.", "advertencia"); return; }
  if (carrito.items.length && carrito.editando?.id !== id) {
    const ok = await confirmar({
      titulo: "Reemplazar carrito",
      mensaje: "El carrito tiene productos. Se reemplazarán por los de la cotización que vas a editar.",
      aceptar: "Reemplazar"
    });
    if (!ok) return;
  }
  carrito = {
    items: c.items.map(i => ({ ...i })),
    descuentoGeneral: c.descuentoGeneral || 0,
    tipoPrecio: c.tipoPrecio ?? "publico",
    // Una cotización anterior al cambio se edita con su regla de IVA original
    reglaIva: reglaIvaDe(c),
    editando: { id: c.id, numero: c.numero }
  };
  guardarCarrito();
  abrirCarrito(true);
  toast(`Editando ${c.numero}: suma o resta productos y pulsa “Guardar cambios”.`, "info");
}

function duplicarCotizacion(id) {
  const c = obtenerCotizacion(id);
  if (!c) return;
  // Se toman el precio final y el costo actuales de cada producto (si todavía existe); la copia ya usa IVA incluido
  const items = c.items.map(i => conPrecioActual(i, c.tipoPrecio, REGLA_IVA.redondeado));
  const nueva = intentar(() => crearCotizacion({
    cliente: c.cliente, validezDias: c.validezDias, observaciones: c.observaciones,
    items, descuentoGeneral: c.descuentoGeneral, tipoPrecio: c.tipoPrecio
  }, admin), null);
  if (nueva) {
    actualizarCotizacion(nueva.id, {}, admin, `Duplicada de ${c.numero}`);
    toast(`${c.numero} duplicada como ${nueva.numero}.`, "exito");
    pintarCotizaciones();
  }
}

async function borrarCotizacion(id) {
  const c = obtenerCotizacion(id);
  if (!c) return;
  const ok = await confirmar({
    titulo: "Eliminar cotización",
    mensaje: `Se eliminará ${c.numero} de ${c.cliente.nombre}.${c.stockDescontado ? " El stock descontado NO se devuelve automáticamente." : ""}`,
    aceptar: "Eliminar", peligro: true
  });
  if (!ok) return;
  intentar(() => eliminarCotizacion(id, admin), `${c.numero} eliminada.`);
  if (carrito.editando?.id === id) { carrito = { ...CARRITO_VACIO, items: [] }; guardarCarrito(); }
  pintarCotizaciones();
}

// =========================================================
// PDF para el cliente (sin costos ni márgenes)
// =========================================================

export function generarPDFCotizacion(cotizacion) {
  const { doc, ancho, margen } = nuevoPDF({ titulo: "COTIZACIÓN", numero: cotizacion.numero, tienda: obtenerConfiguracion().tienda });

  let y = cuadroPDF(doc, {
    x: margen, y: 42, ancho: ancho - margen * 2,
    columnas: [
      [["Cliente", cotizacion.cliente.nombre], ["Teléfono", cotizacion.cliente.telefono], ["CC / NIT", cotizacion.cliente.documento]],
      [["Emitida", fechaPDF(cotizacion.fecha)], ["Válida hasta", fechaPDF(cotizacion.venceEl)], ["Atendió", cotizacion.admin],
        ...(cotizacion.tipoPrecio === "mayorista" ? [["Precios", "Al por mayor"]] : [])]
    ]
  });

  const { lineas } = calcularTotales(cotizacion.items, cotizacion.descuentoGeneral, reglaIvaDe(cotizacion));
  y = tablaPDF(doc, {
    y: y + 6, margen,
    cabecera: ["Ref.", "Producto", "Cant.", "Precio und", "Desc.", "Subtotal"],
    filas: cotizacion.items.map((i, n) => [
      pdfTexto(i.referencia), pdfTexto(i.nombre), formatoNumero(i.cantidad), pdfCOP(i.precio),
      i.descuento ? `${i.descuento} %` : "—", pdfCOP(lineas[n].neto)
    ]),
    columnas: { 0: { cellWidth: 22 }, 2: { halign: "right", cellWidth: 14 }, 3: { halign: "right", cellWidth: 28 }, 4: { halign: "right", cellWidth: 15 }, 5: { halign: "right", cellWidth: 30 } }
  });

  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 20; }
  y = totalesPDF(doc, y + 8, cotizacion.totales, { ancho, margen });

  if (cotizacion.observaciones) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Observaciones", margen, y + 2);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(pdfTexto(cotizacion.observaciones), ancho - margen * 2), margen, y + 7);
  }
  piePDF(doc, `Precios en pesos colombianos. Cotización válida hasta el ${fechaPDF(cotizacion.venceEl)}, sujeta a disponibilidad de inventario.`);
  return doc;
}

function descargarPDF(id) {
  const c = obtenerCotizacion(id);
  if (!c) return;
  try {
    generarPDFCotizacion(c).save(`${c.numero}.pdf`);
    toast(`PDF de ${c.numero} descargado.`, "exito", 2500);
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
  }
}

/** Abre el detalle de una cotización (lo usa la búsqueda global) */
export const verCotizacion = id => verDetalle(id);

/** Para que otras vistas sepan si el carrito se está usando */
export function itemsEnCarrito() { return carrito.items.length; }

// Mantener el carrito al día si cambia el inventario en otra pestaña
window.addEventListener("storage", e => {
  if (e.key === CLAVES.carrito) {
    carrito = leerCarrito();
    migrarCarrito();
    if (dom.panel) pintarCarrito();
  }
  if (e.key === CLAVES.cotizaciones) pintarCotizaciones();
});
