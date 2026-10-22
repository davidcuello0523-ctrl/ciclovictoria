// =========================================================
// CicloVictoria · seriales.js
// Seriales por unidad (registro, buscador, reportados) y garantías
// (estados automáticos, buscador, reclamos y certificado PDF).
// =========================================================

import { ESTADOS_SERIAL } from "./config.js";
import {
  obtenerProductos, obtenerProducto, obtenerSeriales, buscarSerial, serialesDeProducto, registrarSeriales,
  reportarSerial, quitarReporteSerial, eliminarSerial, obtenerGarantias, obtenerGarantia, estadoGarantia,
  buscarGarantias, agregarReclamo, actualizarReclamo, RESOLUCIONES_RECLAMO, crearOrden, obtenerOrden,
  obtenerConfiguracion, normalizarTexto
} from "./datos.js";
import {
  el, icono, botonIcono, toast, confirmar, abrirModal, estadoVacio, crearHistorial, crearUploader,
  abrirLightbox, formatoNumero, conRetraso, nuevoPDF, cuadroPDF, piePDF, firmasPDF, pdfTexto, fechaPDF
} from "./ui.js";
import { abrirEscaner, imagenQR, imprimirEtiquetas, mostrarQR } from "./qr.js";

let admin = null;
let seccion = null;
let alCrearOrden = () => {};
const dom = {};
let pestana = "seriales";
const filtrosSerial = { texto: "", estado: "" };
const filtrosGarantia = { texto: "", estado: "" };
let limiteSeriales = 50;

const formatoFecha = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });
const fecha = iso => (iso ? formatoFecha.format(new Date(iso)) : "—");
const CLASE_SERIAL = { Disponible: "chip-ok", Vendido: "chip-negro", "En taller": "chip-alerta", Reportado: "chip-peligro pulso" };
const CLASE_GARANTIA = { Vigente: "chip-ok", "Por vencer": "chip-alerta", Vencida: "chip-peligro", Anulada: "" };

export function iniciarSeriales(opciones) {
  ({ admin, seccion } = opciones);
  alCrearOrden = opciones.alCrearOrden ?? alCrearOrden;

  dom.pestanas = el("div", { class: "segmentado", role: "tablist", "aria-label": "Seriales o garantías" });
  dom.contenido = el("div", { class: "contenido-seriales" });
  seccion.replaceChildren(
    el("div", { class: "cabecera-seccion" },
      el("div", {},
        el("h1", { style: { fontSize: "clamp(24px,3.4vw,34px)" } }, "Seriales y Garantías"),
        el("p", {}, "Número de serie o marco de cada bicicleta y moto, y las garantías de lo vendido.")),
      dom.pestanas),
    dom.contenido);
  dom.pestanas.addEventListener("click", e => {
    const b = e.target.closest("button[data-pestana]");
    if (!b) return;
    pestana = b.dataset.pestana;
    pintarSeriales();
  });
}

/** Abre la pestaña de seriales con un serial ya buscado (búsqueda global) */
export function mostrarSerial(serial) {
  pestana = "seriales";
  filtrosSerial.consulta = serial;
  pintarSeriales();
}

/** Abre una garantía (búsqueda global) */
export function mostrarGarantia(id) {
  pestana = "garantias";
  pintarSeriales();
  verGarantia(id);
}

/** Punto de entrada al abrir la sección */
export function pintarSeriales() {
  if (!seccion) return;
  const garantias = obtenerGarantias();
  const porVencer = garantias.filter(g => estadoGarantia(g) === "Por vencer").length;
  dom.pestanas.replaceChildren(
    el("button", { type: "button", role: "tab", dataset: { pestana: "seriales" }, "aria-pressed": String(pestana === "seriales"), "aria-selected": String(pestana === "seriales") },
      `Seriales (${formatoNumero(obtenerSeriales().length)})`),
    el("button", { type: "button", role: "tab", dataset: { pestana: "garantias" }, "aria-pressed": String(pestana === "garantias"), "aria-selected": String(pestana === "garantias") },
      `Garantías (${formatoNumero(garantias.length)})`, porVencer ? el("span", { class: "punto-alerta", title: `${porVencer} por vencer` }) : null));
  if (pestana === "seriales") pintarPestanaSeriales();
  else pintarPestanaGarantias();
}

// =========================================================
// Pestaña Seriales
// =========================================================

function pintarPestanaSeriales() {
  const entrada = el("input", { type: "search", id: "buscar-serial", placeholder: "Buscar o escribir un serial", autocomplete: "off", value: filtrosSerial.consulta ?? "" });
  const resultado = el("div", { class: "resultado-serial", "aria-live": "polite" });
  const buscar = () => {
    filtrosSerial.consulta = entrada.value;
    pintarResultadoSerial(resultado, entrada.value);
  };
  entrada.addEventListener("input", conRetraso(buscar, 200));
  entrada.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); buscar(); } });

  const selectEstado = el("select", { class: "entrada", id: "filtro-estado-serial", "aria-label": "Filtrar por estado" },
    el("option", { value: "" }, "Todos los estados"), ESTADOS_SERIAL.map(s => el("option", { value: s, selected: filtrosSerial.estado === s }, s)));
  const filtroTexto = el("input", { type: "search", class: "entrada", id: "filtro-texto-serial", placeholder: "Filtrar por serial, producto o cliente", "aria-label": "Filtrar seriales registrados", value: filtrosSerial.texto });
  dom.tablaSeriales = el("div", {});
  const repintar = conRetraso(() => { filtrosSerial.texto = filtroTexto.value; filtrosSerial.estado = selectEstado.value; limiteSeriales = 50; pintarTablaSeriales(); }, 200);
  filtroTexto.addEventListener("input", repintar);
  selectEstado.addEventListener("change", repintar);

  dom.contenido.replaceChildren(
    el("div", { class: "tarjeta tarjeta-relleno bloque-buscador-serial" },
      el("label", { for: "buscar-serial", class: "etiqueta" }, "Buscador de seriales"),
      el("div", { class: "fila-manual" },
        el("div", { class: "buscador", style: { flex: 1 } }, entrada, el("button", { type: "button", class: "lupa", "aria-label": "Buscar serial", onclick: buscar }, icono("buscar"))),
        el("button", { type: "button", class: "boton boton-secundario", id: "escanear-serial", onclick: () => abrirEscaner({
          titulo: "Escanear serial", ayuda: "Apunta a la etiqueta QR del serial o del marco.",
          alLeer: codigo => { entrada.value = codigo; buscar(); }
        }) }, icono("escaner"), "Escanear")),
      resultado),
    panelDiferencias(),
    el("div", { class: "barra-resultados", style: { marginTop: "24px" } },
      el("h2", { style: { fontSize: "18px" } }, "Seriales registrados"),
      el("div", { class: "grupo" },
        filtroTexto, selectEstado,
        el("button", { type: "button", class: "boton boton-acento", id: "registrar-seriales", onclick: () => abrirRegistro() }, "+ Registrar seriales"))),
    dom.tablaSeriales);
  if (entrada.value) buscar();
  pintarTablaSeriales();
}

/** Respuesta rápida del buscador */
function pintarResultadoSerial(contenedor, texto) {
  if (!texto.trim()) { contenedor.replaceChildren(); return; }
  const s = buscarSerial(texto);
  if (!s) {
    contenedor.replaceChildren(el("div", { class: "aviso aviso-alerta", role: "status" }, icono("info"),
      el("div", { style: { flex: 1 } }, el("strong", {}, `El serial ${texto.trim().toUpperCase()} no existe en el sistema.`),
        el("p", {}, "No está registrado en el inventario ni en ninguna venta.")),
      el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => abrirRegistro(null, texto) }, "Registrarlo")));
    return;
  }
  contenedor.replaceChildren(fichaSerial(s));
}

function fichaSerial(s) {
  const detalle = {
    Disponible: "Está en el inventario, disponible para la venta.",
    Vendido: `Vendido a ${s.cliente?.nombre ?? "—"} el ${fecha(s.fechaVenta)}${s.cotizacion ? ` (${s.cotizacion})` : ""}.`,
    "En taller": `Está en el taller${s.ordenId ? ` (${obtenerOrden(s.ordenId)?.numero ?? "orden eliminada"})` : ""}.`,
    Reportado: `REPORTADO: ${s.nota || "sin nota"}`
  }[s.estado];
  const garantia = obtenerGarantias().find(g => g.serial === s.serial && !g.anulada);
  return el("div", { class: `ficha-serial ${s.estado === "Reportado" ? "reportado" : ""}` },
    el("div", { class: "ficha-serial-cabecera" },
      el("div", {},
        el("span", { class: "serial-grande" }, s.serial),
        el("p", { class: "texto-suave" }, `${s.referencia} · ${s.nombreProducto}`)),
      el("span", { class: `chip ${CLASE_SERIAL[s.estado]}` }, s.estado)),
    el("p", { class: "ficha-serial-detalle" }, detalle),
    s.estado === "Reportado" && s.estadoPrevio ? el("p", { class: "texto-suave" }, `Estado antes del reporte: ${s.estadoPrevio}.`) : null,
    s.cliente?.telefono ? el("p", { class: "texto-suave" }, `Tel. ${s.cliente.telefono}`) : null,
    garantia ? el("p", {}, el("span", { class: `chip ${CLASE_GARANTIA[estadoGarantia(garantia)]}` }, `Garantía ${estadoGarantia(garantia).toLowerCase()}`), ` hasta el ${fecha(garantia.vence)}`) : null,
    el("div", { class: "ficha-serial-qr" },
      el("button", { type: "button", class: "boton-qr", "aria-label": `Ver QR del serial ${s.serial}`, onclick: () => mostrarQR({ codigo: s.serial, titulo: s.nombreProducto, subtitulo: "Código QR del serial" }) },
        imagenQR(s.serial, { tamano: 88 })),
      el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => imprimirEtiquetas({ seriales: [s] }) }, icono("imprimir"), "Imprimir etiqueta")),
    el("div", { class: "ficha-serial-acciones" },
      s.estado === "Reportado"
        ? el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => quitarReporte(s) }, "Quitar reporte")
        : el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => abrirReporte(s) }, icono("alerta"), "Reportar")),
    crearHistorial(s.historial || [], { visibles: 5, titulo: "Historial del serial" }));
}

/** Productos con serial cuyo stock no coincide con los seriales disponibles */
function panelDiferencias() {
  const seriales = obtenerSeriales();
  const disponibles = seriales.reduce((acc, s) => { if (s.estado === "Disponible") acc[s.productoId] = (acc[s.productoId] || 0) + 1; return acc; }, {});
  const conSerial = obtenerProductos().filter(p => p.manejaSerial);
  const diferencias = conSerial
    .map(p => ({ p, registrados: disponibles[p.id] || 0 }))
    .filter(({ p, registrados }) => registrados !== p.stock)
    .sort((a, b) => (b.p.stock - b.registrados) - (a.p.stock - a.registrados));
  const unidadesSinSerial = diferencias.reduce((s, d) => s + Math.max(0, d.p.stock - d.registrados), 0);
  if (!diferencias.length) {
    return el("div", { class: "aviso aviso-info", style: { marginTop: "16px" } }, icono("check"),
      el("p", {}, `Los ${formatoNumero(conSerial.length)} productos con serial tienen tantos seriales disponibles como unidades en stock.`));
  }
  const lista = el("div", { class: "lista-diferencias" }, diferencias.slice(0, 8).map(({ p, registrados }) =>
    el("div", { class: "fila-diferencia" },
      el("div", { style: { minWidth: 0 } }, el("strong", {}, p.nombre), el("div", { class: "texto-suave" }, p.referencia)),
      el("span", { class: "numero" }, `${formatoNumero(registrados)} / ${formatoNumero(p.stock)}`),
      el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => abrirRegistro(p.id) }, "Registrar"))));
  return el("details", { class: "tarjeta panel-diferencias" },
    el("summary", {}, icono("alerta"),
      el("span", {}, el("strong", {}, `${formatoNumero(diferencias.length)} productos con serial no cuadran con el stock`),
        el("span", { class: "texto-suave" }, ` · ${formatoNumero(unidadesSinSerial)} unidades sin serial registrado`)),
      icono("chevron", { class: "flecha" })),
    el("div", { class: "panel-diferencias-cuerpo" },
      el("p", { class: "texto-suave" }, "Seriales disponibles / unidades en stock. Registra los seriales cuando revises cada unidad; al vender también puedes escribirlo en el momento."),
      lista,
      diferencias.length > 8 ? el("p", { class: "texto-suave" }, `… y ${formatoNumero(diferencias.length - 8)} más.`) : null));
}

function pintarTablaSeriales() {
  const texto = normalizarTexto(filtrosSerial.texto);
  const lista = obtenerSeriales().filter(s =>
    (!filtrosSerial.estado || s.estado === filtrosSerial.estado) &&
    (!texto || normalizarTexto(`${s.serial} ${s.referencia} ${s.nombreProducto} ${s.cliente?.nombre ?? ""}`).includes(texto)));
  if (!lista.length) {
    dom.tablaSeriales.replaceChildren(estadoVacio({ titulo: obtenerSeriales().length ? "Sin resultados" : "Aún no hay seriales", mensaje: "Registra los seriales de las bicicletas y motos con “+ Registrar seriales”." }));
    return;
  }
  const filas = lista.slice(0, limiteSeriales).map(s => el("tr", { dataset: { id: s.id }, class: s.estado === "Reportado" ? "fila-reportada" : "" },
    el("td", { "data-titulo": "Serial" }, el("button", { type: "button", class: "enlace-simple", dataset: { accion: "ver" } }, s.serial)),
    el("td", { "data-titulo": "Producto" }, el("div", {}, s.nombreProducto), el("div", { class: "texto-suave" }, s.referencia)),
    el("td", { "data-titulo": "Estado" }, el("span", { class: `chip ${CLASE_SERIAL[s.estado]}` }, s.estado)),
    el("td", { "data-titulo": "Cliente / nota" }, s.estado === "Reportado" ? s.nota : (s.cliente?.nombre ?? "—")),
    el("td", { "data-titulo": "Fecha" }, fecha(s.fechaVenta ?? s.creado)),
    el("td", { class: "acciones-fila" },
      s.estado === "Reportado"
        ? botonIcono("check", `Quitar reporte de ${s.serial}`, { class: "pequeno", dataset: { accion: "quitar-reporte" } })
        : botonIcono("alerta", `Reportar ${s.serial}`, { class: "pequeno", dataset: { accion: "reportar" } }),
      s.estado === "Disponible" ? botonIcono("eliminar", `Eliminar ${s.serial}`, { class: "pequeno peligro", dataset: { accion: "eliminar" } }) : null)));
  const tabla = el("div", { class: "tarjeta tabla-cotizaciones-contenedor" },
    el("table", { class: "tabla-simple tabla-cotizaciones" },
      el("thead", {}, el("tr", {}, ["Serial", "Producto", "Estado", "Cliente / nota", "Fecha"].map(t => el("th", {}, t)), el("th", {}, el("span", { class: "solo-lector" }, "Acciones")))),
      el("tbody", {}, filas)));
  tabla.addEventListener("click", e => {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    const s = obtenerSeriales().find(x => x.id === b.closest("[data-id]").dataset.id);
    if (!s) return;
    if (b.dataset.accion === "ver") verSerial(s);
    if (b.dataset.accion === "reportar") abrirReporte(s);
    if (b.dataset.accion === "quitar-reporte") quitarReporte(s);
    if (b.dataset.accion === "eliminar") borrarSerial(s);
  });
  const mas = lista.length > limiteSeriales
    ? el("div", { class: "cargar-mas" }, el("button", { type: "button", class: "boton boton-secundario", onclick: () => { limiteSeriales += 50; pintarTablaSeriales(); } }, `Ver más (${formatoNumero(lista.length - limiteSeriales)} restantes)`))
    : null;
  dom.tablaSeriales.replaceChildren(el("p", { class: "contador-resultados", style: { marginBottom: "10px" } }, `${formatoNumero(lista.length)} seriales`), tabla, ...(mas ? [mas] : []));
}

function verSerial(s) {
  abrirModal({ titulo: `Serial ${s.serial}`, contenido: fichaSerial(s), ancho: true });
}

function refrescar() { pintarSeriales(); }

function abrirRegistro(productoId = null, serialInicial = "") {
  const conSerial = obtenerProductos().filter(p => p.manejaSerial).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const etiqueta = p => `${p.referencia} · ${p.nombre}`;
  const producto = el("input", { class: "entrada", id: "registro-producto", list: "lista-productos-serial", autocomplete: "off", placeholder: "Escribe la referencia o el nombre",
    value: productoId ? etiqueta(obtenerProducto(productoId)) : "" });
  const datalist = el("datalist", { id: "lista-productos-serial" }, conSerial.map(p => el("option", { value: etiqueta(p) })));
  const seriales = el("textarea", { class: "entrada", id: "registro-seriales", rows: 5, placeholder: "Un serial por línea (o separados por comas)" });
  seriales.value = serialInicial.trim().toUpperCase();
  const info = el("p", { class: "campo-ayuda", "aria-live": "polite" });
  const error = el("p", { class: "campo-error", role: "alert" });
  const productoElegido = () => conSerial.find(p => etiqueta(p) === producto.value.trim())
    ?? conSerial.find(p => normalizarTexto(p.referencia) === normalizarTexto(producto.value));
  const leer = () => seriales.value.split(/[\n,;]+/).map(x => x.trim()).filter(Boolean);
  const actualizarInfo = () => {
    const p = productoElegido();
    const n = leer().length;
    info.textContent = p
      ? `${p.nombre}: ${formatoNumero(serialesDeProducto(p.id, "Disponible").length)} seriales disponibles para ${formatoNumero(p.stock)} unidades en stock. Vas a registrar ${n}.`
      : `Vas a registrar ${n} serial${n === 1 ? "" : "es"}. Elige el producto de la lista.`;
  };
  producto.addEventListener("input", actualizarInfo);
  seriales.addEventListener("input", actualizarInfo);
  actualizarInfo();

  abrirModal({
    titulo: "Registrar seriales",
    contenido: el("div", { class: "form-grilla" },
      el("div", { class: "campo ancho-completo" }, el("label", { for: "registro-producto" }, "Producto (bicicleta o moto con serial)"), producto, datalist),
      el("div", { class: "campo ancho-completo" }, el("label", { for: "registro-seriales" }, "Seriales / números de marco"), seriales, info),
      el("div", { class: "ancho-completo" }, error)),
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      { texto: "Registrar", clase: "boton-acento", alHacerClic: () => {
          const p = productoElegido();
          if (!p) { error.textContent = "Elige un producto de la lista."; producto.focus(); return false; }
          try {
            const nuevos = registrarSeriales(p.id, leer(), admin);
            toast(`${nuevos.length} serial${nuevos.length === 1 ? "" : "es"} registrado${nuevos.length === 1 ? "" : "s"} para ${p.nombre}.`, "exito");
            refrescar();
          } catch (e) {
            error.textContent = e.message;
            return false;
          }
        } }
    ]
  });
}

function abrirReporte(s) {
  const nota = el("textarea", { class: "entrada", id: "nota-reporte", rows: 3, placeholder: "Ej: reportada como robada el 20/09/2026, denuncia N.º…" });
  const error = el("p", { class: "campo-error", role: "alert" });
  abrirModal({
    titulo: `Reportar ${s.serial}`,
    contenido: el("div", {},
      el("p", { class: "texto-suave", style: { marginBottom: "12px" } }, "Un serial reportado se resalta en rojo si vuelve a aparecer, por ejemplo en una orden de taller."),
      el("div", { class: "campo" }, el("label", { for: "nota-reporte" }, "Motivo del reporte *"), nota), error),
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      { texto: "Marcar como reportado", clase: "boton-peligro", alHacerClic: () => {
          try { reportarSerial(s.id, nota.value, admin); toast(`Serial ${s.serial} reportado.`, "advertencia"); refrescar(); }
          catch (e) { error.textContent = e.message; return false; }
        } }
    ]
  });
}

async function quitarReporte(s) {
  if (!(await confirmar({ titulo: "Quitar reporte", mensaje: `El serial ${s.serial} volverá a "${s.estadoPrevio || "Disponible"}".`, aceptar: "Quitar reporte" }))) return;
  quitarReporteSerial(s.id, admin);
  toast("Reporte quitado.", "exito");
  refrescar();
}

async function borrarSerial(s) {
  if (!(await confirmar({ titulo: "Eliminar serial", mensaje: `¿Eliminar el serial ${s.serial}?`, aceptar: "Eliminar", peligro: true }))) return;
  try { eliminarSerial(s.id, admin); toast("Serial eliminado.", "exito"); refrescar(); }
  catch (e) { toast(e.message, "error"); }
}

// =========================================================
// Pestaña Garantías
// =========================================================

/** Frase de respuesta rápida: "Esta garantía está vigente hasta el 12/03/2027" */
function respuestaGarantia(g) {
  const estado = estadoGarantia(g);
  const dias = Math.ceil((new Date(g.vence) - new Date()) / 86400000);
  const quien = `${g.nombreProducto}${g.serial ? ` (${g.serial})` : ""} de ${g.cliente.nombre}`;
  if (estado === "Anulada") return `La garantía de ${quien} fue anulada.`;
  if (estado === "Vencida") return `La garantía de ${quien} venció el ${fecha(g.vence)}.`;
  if (estado === "Por vencer") return `Esta garantía está vigente hasta el ${fecha(g.vence)} (vence en ${dias} día${dias === 1 ? "" : "s"}) · ${quien}.`;
  return `Esta garantía está vigente hasta el ${fecha(g.vence)} · ${quien}.`;
}

function pintarPestanaGarantias() {
  const entrada = el("input", { type: "search", id: "buscar-garantia", placeholder: "Buscar por cliente, serial o número de cotización", autocomplete: "off", value: filtrosGarantia.texto });
  dom.respuesta = el("div", { class: "respuesta-garantia", "aria-live": "polite" });
  dom.chipsEstado = el("div", { class: "tp-chips filtros-estado-garantia" });
  dom.tablaGarantias = el("div", {});
  entrada.addEventListener("input", conRetraso(() => { filtrosGarantia.texto = entrada.value; pintarListaGarantias(); }, 200));
  dom.chipsEstado.addEventListener("click", e => {
    const b = e.target.closest("button[data-estado]");
    if (!b) return;
    filtrosGarantia.estado = b.dataset.estado;
    pintarListaGarantias();
  });
  dom.contenido.replaceChildren(
    el("div", { class: "tarjeta tarjeta-relleno bloque-buscador-serial" },
      el("label", { for: "buscar-garantia", class: "etiqueta" }, "Consultar garantía"),
      el("div", { class: "buscador" }, entrada, el("span", { class: "lupa", "aria-hidden": "true" }, icono("buscar"))),
      dom.respuesta),
    dom.chipsEstado,
    dom.tablaGarantias);
  pintarListaGarantias();
}

function pintarListaGarantias() {
  const encontradas = buscarGarantias(filtrosGarantia.texto);
  const conteo = encontradas.reduce((acc, g) => { const e = estadoGarantia(g); acc[e] = (acc[e] || 0) + 1; return acc; }, {});
  dom.chipsEstado.replaceChildren(...["", "Vigente", "Por vencer", "Vencida", "Anulada"].map(e =>
    el("button", { type: "button", class: `chip chip-filtro ${filtrosGarantia.estado === e ? "activo" : ""}`, dataset: { estado: e }, "aria-pressed": String(filtrosGarantia.estado === e) },
      `${e || "Todas"} (${formatoNumero(e ? conteo[e] || 0 : encontradas.length)})`)));
  const lista = encontradas.filter(g => !filtrosGarantia.estado || estadoGarantia(g) === filtrosGarantia.estado);

  // Respuesta rápida cuando se está buscando
  dom.respuesta.replaceChildren();
  if (filtrosGarantia.texto.trim()) {
    if (!encontradas.length) dom.respuesta.append(el("p", { class: "aviso aviso-alerta" }, icono("info"), el("span", {}, "No hay garantías con esos datos.")));
    else {
      const g = encontradas[0];
      const e = estadoGarantia(g);
      dom.respuesta.append(el("div", { class: `aviso ${e === "Vigente" ? "aviso-info" : e === "Por vencer" ? "aviso-alerta" : "aviso-peligro"}` },
        icono(e === "Vigente" ? "check" : "alerta"),
        el("div", {}, el("strong", {}, respuestaGarantia(g)),
          encontradas.length > 1 ? el("p", {}, `y ${encontradas.length - 1} garantía${encontradas.length === 2 ? "" : "s"} más en la lista.`) : null)));
    }
  }

  if (!lista.length) {
    dom.tablaGarantias.replaceChildren(estadoVacio({
      titulo: obtenerGarantias().length ? "Sin resultados" : "Aún no hay garantías",
      mensaje: "Las garantías se crean solas al aprobar una cotización con productos que tienen garantía."
    }));
    return;
  }
  const tabla = el("div", { class: "tarjeta tabla-cotizaciones-contenedor" },
    el("table", { class: "tabla-simple tabla-cotizaciones" },
      el("thead", {}, el("tr", {}, ["Producto", "Serial", "Cliente", "Venta", "Vence", "Estado", "Reclamos"].map(t => el("th", {}, t)), el("th", {}, el("span", { class: "solo-lector" }, "Acciones")))),
      el("tbody", {}, lista.map(g => {
        const estado = estadoGarantia(g);
        return el("tr", { dataset: { id: g.id } },
          el("td", { "data-titulo": "Producto" }, el("div", {}, g.nombreProducto), el("div", { class: "texto-suave" }, `${g.referencia} · ${g.cotizacion}`)),
          el("td", { "data-titulo": "Serial" }, g.serial ?? "—"),
          el("td", { "data-titulo": "Cliente" }, el("div", {}, g.cliente.nombre), g.cliente.telefono ? el("div", { class: "texto-suave" }, g.cliente.telefono) : null),
          el("td", { "data-titulo": "Venta" }, fecha(g.fechaVenta)),
          el("td", { "data-titulo": "Vence" }, fecha(g.vence)),
          el("td", { "data-titulo": "Estado" }, el("span", { class: `chip ${CLASE_GARANTIA[estado]}` }, estado)),
          el("td", { "data-titulo": "Reclamos" }, formatoNumero((g.reclamos || []).length)),
          el("td", { class: "acciones-fila" },
            botonIcono("ojo", "Ver garantía", { class: "pequeno", dataset: { accion: "ver" } }),
            estado !== "Anulada" ? botonIcono("herramienta", "Registrar reclamo", { class: "pequeno", dataset: { accion: "reclamo" } }) : null,
            botonIcono("descargar", "Certificado PDF", { class: "pequeno", dataset: { accion: "pdf" } })));
      }))));
  tabla.addEventListener("click", e => {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    if (b.dataset.accion === "ver") verGarantia(id);
    if (b.dataset.accion === "reclamo") abrirReclamo(id);
    if (b.dataset.accion === "pdf") descargarCertificado(id);
  });
  dom.tablaGarantias.replaceChildren(tabla);
}

function verGarantia(id) {
  const g = obtenerGarantia(id);
  if (!g) return;
  const estado = estadoGarantia(g);
  const fila = (a, b) => el("tr", {}, el("th", { scope: "row" }, a), el("td", {}, b || "—"));
  const reclamos = (g.reclamos || []).map(r => {
    const select = el("select", { class: "entrada", "aria-label": "Resolución del reclamo", style: { width: "auto", minHeight: "34px" } },
      RESOLUCIONES_RECLAMO.map(x => el("option", { value: x, selected: x === r.resolucion }, x)));
    select.addEventListener("change", () => {
      actualizarReclamo(g.id, r.id, { resolucion: select.value }, admin);
      toast(`Reclamo: ${select.value}.`, "exito");
      pintarSeriales();
    });
    const orden = r.ordenId ? obtenerOrden(r.ordenId) : null;
    return el("div", { class: "reclamo" },
      el("div", { class: "reclamo-cabecera" }, el("strong", {}, fecha(r.fecha)), select),
      el("p", {}, r.descripcion),
      orden ? el("p", { class: "texto-suave" }, `Orden de taller ${orden.numero} (${orden.estado})`) : null,
      r.fotos?.length ? el("div", { class: "reclamo-fotos" }, r.fotos.map((f, i) =>
        el("button", { type: "button", "aria-label": `Ver foto ${i + 1}`, onclick: () => abrirLightbox(f, `Foto ${i + 1} del reclamo`) }, el("img", { src: f, alt: "" })))) : null,
      el("p", { class: "texto-suave" }, `Registró: ${r.admin}`));
  });
  abrirModal({
    titulo: `Garantía · ${g.nombreProducto}`,
    ancho: true,
    contenido: el("div", {},
      el("div", { class: `aviso ${estado === "Vigente" ? "aviso-info" : estado === "Por vencer" ? "aviso-alerta" : "aviso-peligro"}` }, icono("info"), el("strong", {}, respuestaGarantia(g))),
      el("div", { class: "ficha-proveedor-columnas", style: { marginTop: "16px" } },
        el("table", { class: "ficha" }, el("tbody", {},
          fila("Producto", `${g.referencia} · ${g.nombreProducto}`), fila("Serial", g.serial), fila("Cotización", g.cotizacion),
          fila("Fecha de venta", fecha(g.fechaVenta)), fila("Meses", String(g.meses)), fila("Vence", fecha(g.vence)))),
        el("table", { class: "ficha" }, el("tbody", {},
          fila("Cliente", g.cliente.nombre), fila("Teléfono", g.cliente.telefono), fila("CC / NIT", g.cliente.documento)))),
      el("h4", { class: "subtitulo-modal" }, `Reclamos (${(g.reclamos || []).length})`),
      reclamos.length ? el("div", { class: "lista-reclamos" }, reclamos) : el("p", { class: "texto-suave" }, "Sin reclamos."),
      el("div", { style: { marginTop: "16px" } }, crearHistorial(g.historial || [], { visibles: 5 }))),
    acciones: [
      ...(estado !== "Anulada" ? [{ texto: "Registrar reclamo", clase: "boton-secundario", alHacerClic: () => { abrirReclamo(g.id); } }] : []),
      { texto: "Certificado PDF", clase: "boton-acento", alHacerClic: () => { descargarCertificado(g.id); return false; } }
    ]
  });
}

function abrirReclamo(id) {
  const g = obtenerGarantia(id);
  if (!g) return;
  let fotos = [];
  const descripcion = el("textarea", { class: "entrada", id: "reclamo-descripcion", rows: 3, placeholder: "¿Qué falla reporta el cliente?" });
  const resolucion = el("select", { class: "entrada", id: "reclamo-resolucion" }, RESOLUCIONES_RECLAMO.map(r => el("option", { value: r }, r)));
  const crearOT = el("input", { type: "checkbox", id: "reclamo-orden", checked: true });
  const uploader = crearUploader({ max: 3, etiqueta: "Fotos (hasta 3)", onChange: l => { fotos = l; } });
  const error = el("p", { class: "campo-error", role: "alert" });
  const vigente = ["Vigente", "Por vencer"].includes(estadoGarantia(g));
  abrirModal({
    titulo: "Reclamo de garantía",
    ancho: true,
    contenido: el("div", { class: "form-grilla" },
      el("div", { class: "ancho-completo" }, el("p", {}, el("strong", {}, g.nombreProducto), g.serial ? ` · ${g.serial}` : "", ` · ${g.cliente.nombre}`),
        !vigente ? el("div", { class: "aviso aviso-alerta", style: { marginTop: "8px" } }, icono("alerta"), el("span", {}, "Ojo: esta garantía está vencida.")) : null),
      el("div", { class: "campo ancho-completo" }, el("label", { for: "reclamo-descripcion" }, "Descripción *"), descripcion),
      el("div", { class: "campo" }, el("label", { for: "reclamo-resolucion" }, "Resolución"), resolucion),
      el("label", { class: "casilla", style: { alignSelf: "end", paddingBottom: "10px" } }, crearOT, "Crear orden de taller vinculada"),
      el("div", { class: "ancho-completo" }, uploader.elemento),
      el("div", { class: "ancho-completo" }, error)),
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      { texto: "Guardar reclamo", clase: "boton-acento", alHacerClic: () => {
          if (!descripcion.value.trim()) { error.textContent = "Describe el reclamo."; descripcion.focus(); return false; }
          try {
            let orden = null;
            if (crearOT.checked) {
              const producto = obtenerProducto(g.productoId);
              orden = crearOrden({
                cliente: { nombre: g.cliente.nombre, telefono: g.cliente.telefono },
                vehiculo: { tipo: producto?.linea ?? "Bicicleta", marca: producto?.marca !== "Sin marca" ? producto?.marca : "", modelo: g.nombreProducto, serial: g.serial ?? "" },
                trabajo: `Garantía (${g.cotizacion}): ${descripcion.value.trim()}`,
                responsable: admin.nombre, fotos, garantiaId: g.id
              }, admin);
            }
            agregarReclamo(g.id, { descripcion: descripcion.value, fotos, resolucion: resolucion.value, ordenId: orden?.id ?? null }, admin);
            toast(orden ? `Reclamo registrado y orden ${orden.numero} creada en el taller.` : "Reclamo registrado.", "exito");
            if (orden) alCrearOrden(orden);
            pintarSeriales();
          } catch (e) {
            error.textContent = e.message;
            return false;
          }
        } }
    ]
  });
}

/** Certificado de garantía en PDF para entregar al cliente */
export function generarCertificado(g) {
  const { doc, ancho, margen } = nuevoPDF({ titulo: "CERTIFICADO DE GARANTÍA", numero: g.serial || g.cotizacion, tienda: obtenerConfiguracion().tienda });
  let y = cuadroPDF(doc, {
    x: margen, y: 42, ancho: ancho - margen * 2,
    columnas: [
      [["Cliente", g.cliente.nombre], ["Teléfono", g.cliente.telefono], ["CC / NIT", g.cliente.documento]],
      [["Producto", g.nombreProducto], ["Referencia", g.referencia], ["Serial", g.serial || "No aplica"]]
    ]
  });
  y = cuadroPDF(doc, {
    x: margen, y: y + 5, ancho: ancho - margen * 2,
    columnas: [[["Fecha de venta", fechaPDF(g.fechaVenta)], ["Cobertura", `${g.meses} meses`]], [["Vence", fechaPDF(g.vence)], ["Cotización", g.cotizacion]]]
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Condiciones de la garantía", margen, y + 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const condiciones = [
    "1. La garantía cubre defectos de fabricación del marco y de los componentes originales durante el tiempo indicado.",
    "2. No cubre desgaste normal (llantas, neumáticos, pastillas, cadena, cables), golpes, caídas, mal uso ni modificaciones.",
    "3. Para hacerla efectiva presente este certificado y el producto en el local. El serial debe coincidir con el registrado.",
    "4. El diagnóstico lo realiza el taller de CicloVictoria, que decidirá si procede la reparación o el cambio.",
    "5. Los mantenimientos periódicos no están incluidos y ayudan a conservar la garantía."
  ];
  let yy = y + 19;
  for (const c of condiciones) {
    const lineas = doc.splitTextToSize(pdfTexto(c), ancho - margen * 2);
    doc.text(lineas, margen, yy);
    yy += lineas.length * 5 + 1.5;
  }
  firmasPDF(doc, yy + 10, ["Firma y sello de CicloVictoria", "Firma del cliente"], { ancho, margen });
  piePDF(doc, `Garantía válida hasta el ${fechaPDF(g.vence)}. Conserve este documento.`);
  return doc;
}

function descargarCertificado(id) {
  const g = obtenerGarantia(id);
  if (!g) return;
  try {
    generarCertificado(g).save(`Garantia_${g.serial || g.cotizacion}.pdf`);
    toast("Certificado descargado.", "exito", 2500);
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
  }
}
