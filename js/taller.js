// =========================================================
// CicloVictoria · taller.js
// Órdenes de reparación y mantenimiento (OT-0001): tablero kanban con
// arrastrar y soltar, lista con filtros, repuestos del inventario,
// mano de obra, alertas de retraso, historial y PDF.
// =========================================================

import { ESTADOS_TALLER, SERVICIOS_TALLER, DIAS_ENTREGA_ESTIMADA, USUARIOS } from "./config.js";
import { precioFinal, precioBase, llevaIva, redondearArriba, REGLA_IVA, TEXTO_IVA_INCLUIDO } from "./precios.js";
import {
  obtenerOrdenes, obtenerOrden, crearOrden, actualizarOrden, cambiarEstadoOrden, eliminarOrden, totalesOrden,
  diasEnTaller, ordenAtrasada, esEstadoFinal, faltantesOrden, buscarSerial, repuestosSugeridos, etiquetasVehiculo,
  obtenerProductos, obtenerProducto, obtenerConfiguracion, normalizarTexto, calcularTotales, buscarPorReferencia, reglaIvaDe
} from "./datos.js";
import { abrirEscaner } from "./qr.js";
import {
  el, icono, botonIcono, toast, confirmar, abrirModal, estadoVacio, crearHistorial, crearUploader,
  formatoCOP, formatoNumero, conRetraso, imagenProducto, nuevoPDF, cuadroPDF, tablaPDF, totalesPDF, filasTotales, piePDF,
  firmasPDF, pdfTexto, pdfCOP, fechaPDF
} from "./ui.js";

let admin = null;
let seccion = null;
let alCambiarInventario = () => {};
let vista = "tablero";
const filtros = { texto: "", estado: "", tipo: "", atrasadas: false };
const dom = {};

const formatoFecha = new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short" });
const fechaCorta = f => (f ? formatoFecha.format(new Date(f.length === 10 ? `${f}T12:00:00` : f)) : "—");
const hoyISO = () => new Date().toISOString().slice(0, 10);
const sumarDias = (iso, dias) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
const CLASE_ESTADO = {
  "Recibida": "", "En diagnóstico": "chip-negro", "En reparación": "chip-negro", "Esperando repuesto": "chip-alerta",
  "Lista": "chip-ok", "Entregada": "chip-ok", "Cancelada": "chip-peligro"
};

export function iniciarTaller(opciones) {
  ({ admin, seccion } = opciones);
  alCambiarInventario = opciones.alCambiarInventario ?? alCambiarInventario;
  dom.vistas = el("div", { class: "segmentado", role: "group", "aria-label": "Vista" },
    el("button", { type: "button", dataset: { vista: "tablero" }, "aria-pressed": "true" }, "Tablero"),
    el("button", { type: "button", dataset: { vista: "lista" }, "aria-pressed": "false" }, "Lista"));
  dom.vistas.addEventListener("click", e => {
    const b = e.target.closest("[data-vista]");
    if (!b) return;
    vista = b.dataset.vista;
    pintarTaller();
  });
  dom.resumen = el("div", { class: "resumen-taller" });
  dom.contenido = el("div", {});
  seccion.replaceChildren(
    el("div", { class: "cabecera-seccion" },
      el("div", {},
        el("h1", { style: { fontSize: "clamp(24px,3.4vw,34px)" } }, "Taller"),
        el("p", {}, "Arrastra las órdenes entre columnas para cambiar su estado.")),
      el("div", { class: "barra-herramientas" }, dom.vistas,
        el("button", { type: "button", class: "boton boton-acento", id: "nueva-orden", onclick: () => abrirOrden() }, "+ Nueva orden"))),
    dom.resumen,
    dom.contenido);
}

export function pintarTaller() {
  if (!seccion) return;
  dom.vistas.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.vista === vista)));
  const ordenes = obtenerOrdenes();
  const activas = ordenes.filter(o => !esEstadoFinal(o.estado));
  const atrasadas = activas.filter(o => ordenAtrasada(o));
  const listas = activas.filter(o => o.estado === "Lista");
  dom.resumen.replaceChildren(
    el("span", { class: "chip chip-negro" }, `${formatoNumero(activas.length)} activas`),
    el("span", { class: "chip chip-ok" }, `${formatoNumero(listas.length)} listas para entregar`),
    ...(atrasadas.length ? [el("span", { class: "chip chip-peligro pulso" }, `${formatoNumero(atrasadas.length)} atrasadas`)] : []));
  if (vista === "tablero") pintarTablero(ordenes);
  else pintarLista(ordenes);
}

// ---------- Tarjeta de orden ----------

function tarjetaOrden(o) {
  const atrasada = ordenAtrasada(o);
  const dias = diasEnTaller(o);
  const serial = buscarSerial(o.vehiculo.serial);
  const final = esEstadoFinal(o.estado);
  const tarjeta = el("article", {
    class: `tarjeta-orden ${atrasada ? "atrasada" : ""} ${serial?.estado === "Reportado" ? "serial-reportado" : ""}`,
    dataset: { id: o.id }, tabindex: "0", role: "button",
    "aria-label": `${o.numero}, ${o.cliente.nombre}, ${o.estado}. Enter para abrir.`
  },
    el("div", { class: "tarjeta-orden-cabecera" },
      el("strong", {}, o.numero),
      el("span", { class: `chip ${atrasada ? "chip-peligro" : ""}`, title: atrasada ? `Debía entregarse el ${fechaCorta(o.fechaEstimada)}` : "Días en el taller" },
        atrasada ? `Atrasada · ${dias} ${dias === 1 ? "día" : "días"}` : `${dias} ${dias === 1 ? "día" : "días"}`)),
    el("p", { class: "tarjeta-orden-cliente" }, o.cliente.nombre),
    el("p", { class: "texto-suave" }, [o.vehiculo.tipo, o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(" · ")),
    el("p", { class: "tarjeta-orden-trabajo" }, o.trabajo),
    serial?.estado === "Reportado" ? el("span", { class: "chip chip-peligro pulso" }, `Serial reportado`) : null,
    o.garantiaId ? el("span", { class: "chip chip-acento" }, "Garantía") : null,
    el("div", { class: "tarjeta-orden-pie" },
      el("span", { class: "texto-suave" }, o.responsable || "Sin responsable"),
      el("strong", { class: "numero" }, formatoCOP(totalesOrden(o).total))));
  // Las órdenes entregadas o canceladas ya no se pueden arrastrar
  tarjeta.setAttribute("draggable", String(!final));
  return tarjeta;
}

// ---------- Tablero kanban (drag & drop nativo) ----------

function pintarTablero(ordenes) {
  const columnas = ESTADOS_TALLER.map(estado => {
    const deEstado = ordenes.filter(o => o.estado === estado)
      .sort((a, b) => (ordenAtrasada(b) - ordenAtrasada(a)) || a.fechaIngreso.localeCompare(b.fechaIngreso));
    const cuerpo = el("div", { class: "columna-cuerpo" },
      deEstado.length ? deEstado.slice(0, estado === "Entregada" || estado === "Cancelada" ? 15 : 100).map(tarjetaOrden) : el("p", { class: "columna-vacia" }, "Arrastra aquí"));
    return el("section", { class: `columna-kanban ${esEstadoFinal(estado) ? "final" : ""}`, dataset: { estado }, "aria-label": `${estado}: ${deEstado.length} órdenes` },
      el("header", {}, el("span", {}, estado), el("span", { class: "contador-columna" }, formatoNumero(deEstado.length))),
      cuerpo);
  });
  const tablero = el("div", { class: "tablero-kanban" }, columnas);

  let arrastrando = null;
  tablero.addEventListener("dragstart", e => {
    const tarjeta = e.target.closest(".tarjeta-orden");
    if (!tarjeta || !tarjeta.draggable) { e.preventDefault(); return; }
    arrastrando = tarjeta.dataset.id;
    e.dataTransfer.setData("text/plain", arrastrando);
    e.dataTransfer.effectAllowed = "move";
    tarjeta.classList.add("arrastrando");
  });
  tablero.addEventListener("dragend", e => {
    e.target.closest(".tarjeta-orden")?.classList.remove("arrastrando");
    tablero.querySelectorAll(".sobre").forEach(c => c.classList.remove("sobre"));
    arrastrando = null;
  });
  tablero.addEventListener("dragover", e => {
    const columna = e.target.closest(".columna-kanban");
    if (!columna) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    tablero.querySelectorAll(".sobre").forEach(c => { if (c !== columna) c.classList.remove("sobre"); });
    columna.classList.add("sobre");
  });
  tablero.addEventListener("dragleave", e => {
    const columna = e.target.closest(".columna-kanban");
    if (columna && !columna.contains(e.relatedTarget)) columna.classList.remove("sobre");
  });
  tablero.addEventListener("drop", e => {
    const columna = e.target.closest(".columna-kanban");
    if (!columna) return;
    e.preventDefault();
    columna.classList.remove("sobre");
    const id = e.dataTransfer.getData("text/plain") || arrastrando;
    if (id) moverOrden(id, columna.dataset.estado);
  });
  // Abrir con clic o Enter
  tablero.addEventListener("click", e => { const t = e.target.closest(".tarjeta-orden"); if (t) abrirOrden(t.dataset.id); });
  tablero.addEventListener("keydown", e => {
    const t = e.target.closest(".tarjeta-orden");
    if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrirOrden(t.dataset.id); }
  });
  dom.contenido.replaceChildren(ordenes.length ? tablero : estadoVacio({ titulo: "Sin órdenes de taller", mensaje: "Crea la primera con “+ Nueva orden”." }));
  if (!ordenes.length) dom.contenido.firstChild.append(el("button", { type: "button", class: "boton boton-acento", onclick: () => abrirOrden() }, "+ Nueva orden"));
}

/** Cambio de estado con confirmación para Entregada (descuenta repuestos) y Cancelada */
export async function moverOrden(id, nuevo) {
  const orden = obtenerOrden(id);
  if (!orden || orden.estado === nuevo) return false;
  if (esEstadoFinal(orden.estado)) { toast(`${orden.numero} ya está ${orden.estado.toLowerCase()}; no se puede mover.`, "advertencia"); return false; }
  if (nuevo === "Entregada") {
    const faltantes = faltantesOrden(orden);
    if (faltantes.length) {
      toast(`No hay stock para entregar ${orden.numero}: ${faltantes.map(f => `${f.nombre} (usa ${f.cantidad}, hay ${f.disponible})`).join("; ")}.`, "error", 7000);
      return false;
    }
    const ok = await confirmar({
      titulo: `Entregar ${orden.numero}`,
      mensaje: orden.repuestos.length
        ? `Se descontarán del inventario: ${orden.repuestos.map(r => `${r.cantidad} × ${r.nombre}`).join(", ")}. Total a cobrar: ${formatoCOP(totalesOrden(orden).total)}.`
        : `La orden no usa repuestos. Total a cobrar: ${formatoCOP(totalesOrden(orden).total)}.`,
      aceptar: "Marcar como entregada"
    });
    if (!ok) { pintarTaller(); return false; }
  }
  if (nuevo === "Cancelada") {
    const ok = await confirmar({ titulo: `Cancelar ${orden.numero}`, mensaje: "La orden quedará cancelada y ya no se podrá mover.", aceptar: "Cancelar orden", cancelar: "Volver", peligro: true });
    if (!ok) { pintarTaller(); return false; }
  }
  try {
    cambiarEstadoOrden(id, nuevo, admin);
    if (nuevo === "Entregada" && orden.repuestos.length) alCambiarInventario();
    toast(`${orden.numero}: ${nuevo}.`, "exito");
    pintarTaller();
    return true;
  } catch (e) {
    toast(e.message, "error", 7000);
    pintarTaller();
    return false;
  }
}

// ---------- Vista de lista ----------

function pintarLista(ordenes) {
  const texto = el("input", { type: "search", class: "entrada", id: "filtro-orden-texto", placeholder: "Número, cliente, serial…", value: filtros.texto });
  const estado = el("select", { class: "entrada", id: "filtro-orden-estado", "aria-label": "Estado" },
    el("option", { value: "" }, "Todos los estados"), ESTADOS_TALLER.map(e => el("option", { value: e, selected: filtros.estado === e }, e)));
  const tipo = el("select", { class: "entrada", id: "filtro-orden-tipo", "aria-label": "Tipo de vehículo" },
    el("option", { value: "" }, "Bicicletas y motos"), ["Bicicleta", "Moto"].map(t => el("option", { value: t, selected: filtros.tipo === t }, t)));
  const atrasadas = el("input", { type: "checkbox", id: "filtro-atrasadas", checked: filtros.atrasadas });
  const cuerpo = el("div", {});
  const repintar = () => {
    Object.assign(filtros, { texto: texto.value, estado: estado.value, tipo: tipo.value, atrasadas: atrasadas.checked });
    const q = normalizarTexto(filtros.texto);
    const lista = ordenes.filter(o =>
      (!filtros.estado || o.estado === filtros.estado) && (!filtros.tipo || o.vehiculo.tipo === filtros.tipo) &&
      (!filtros.atrasadas || ordenAtrasada(o)) &&
      (!q || normalizarTexto(`${o.numero} ${o.cliente.nombre} ${o.cliente.telefono} ${o.vehiculo.serial} ${o.vehiculo.marca} ${o.vehiculo.modelo}`).includes(q)));
    if (!lista.length) { cuerpo.replaceChildren(estadoVacio({ titulo: "Sin órdenes", mensaje: "Cambia los filtros o crea una orden." })); return; }
    cuerpo.replaceChildren(el("div", { class: "tarjeta tabla-cotizaciones-contenedor" },
      el("table", { class: "tabla-simple tabla-cotizaciones" },
        el("thead", {}, el("tr", {}, ["Número", "Cliente", "Vehículo", "Ingreso", "Entrega estimada", "Días", "Estado", "Total"].map(t => el("th", {}, t)), el("th", {}, el("span", { class: "solo-lector" }, "Acciones")))),
        el("tbody", {}, lista.map(o => el("tr", { dataset: { id: o.id }, class: ordenAtrasada(o) ? "fila-reportada" : "" },
          el("td", { "data-titulo": "Número" }, el("button", { type: "button", class: "enlace-simple", dataset: { accion: "ver" } }, o.numero)),
          el("td", { "data-titulo": "Cliente" }, o.cliente.nombre),
          el("td", { "data-titulo": "Vehículo" }, [o.vehiculo.tipo, o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(" · ")),
          el("td", { "data-titulo": "Ingreso" }, fechaCorta(o.fechaIngreso)),
          el("td", { "data-titulo": "Entrega estimada" }, fechaCorta(o.fechaEstimada)),
          el("td", { "data-titulo": "Días" }, ordenAtrasada(o) ? el("span", { class: "chip chip-peligro" }, `${diasEnTaller(o)} · atrasada`) : String(diasEnTaller(o))),
          el("td", { "data-titulo": "Estado" }, el("span", { class: `chip ${CLASE_ESTADO[o.estado]}` }, o.estado)),
          el("td", { "data-titulo": "Total" }, el("strong", {}, formatoCOP(totalesOrden(o).total))),
          el("td", { class: "acciones-fila" },
            botonIcono("ojo", `Abrir ${o.numero}`, { class: "pequeno", dataset: { accion: "ver" } }),
            botonIcono("descargar", `PDF de ${o.numero}`, { class: "pequeno", dataset: { accion: "pdf" } }),
            o.estado !== "Entregada" ? botonIcono("eliminar", `Eliminar ${o.numero}`, { class: "pequeno peligro", dataset: { accion: "eliminar" } }) : null)))))));
  };
  cuerpo.addEventListener("click", e => {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    if (b.dataset.accion === "ver") abrirOrden(id);
    if (b.dataset.accion === "pdf") descargarPDF(id);
    if (b.dataset.accion === "eliminar") borrarOrden(id);
  });
  const repintarConRetraso = conRetraso(repintar, 200);
  texto.addEventListener("input", repintarConRetraso);
  [estado, tipo, atrasadas].forEach(c => c.addEventListener("change", repintar));
  dom.contenido.replaceChildren(
    el("div", { class: "tarjeta bloque-filtro filtros-taller" }, texto, estado, tipo,
      el("label", { class: "casilla" }, atrasadas, "Solo atrasadas")),
    cuerpo);
  repintar();
}

async function borrarOrden(id) {
  const o = obtenerOrden(id);
  if (!o) return;
  if (!(await confirmar({ titulo: "Eliminar orden", mensaje: `¿Eliminar ${o.numero} de ${o.cliente.nombre}?`, aceptar: "Eliminar", peligro: true }))) return;
  try { eliminarOrden(id, admin); toast(`${o.numero} eliminada.`, "exito"); pintarTaller(); }
  catch (e) { toast(e.message, "error"); }
}

// =========================================================
// Formulario de la orden (crear / editar)
// =========================================================

export function abrirOrden(id = null) {
  const orden = id ? obtenerOrden(id) : null;
  if (id && !orden) { toast("La orden ya no existe.", "error"); return; }
  const soloLectura = orden ? esEstadoFinal(orden.estado) : false;
  // Órdenes nuevas: precios finales con IVA incluido. Las anteriores al cambio conservan el IVA aparte.
  const reglaIva = orden ? reglaIvaDe(orden) : REGLA_IVA.redondeado;
  const precioRepuesto = p => (reglaIva === REGLA_IVA.aparte ? precioBase(p) : precioFinal(p));
  const hoy = hoyISO();
  const estadoForm = {
    repuestos: structuredClone(orden?.repuestos ?? []),
    manoObra: structuredClone(orden?.manoObra ?? []),
    fotos: [...(orden?.fotos ?? [])]
  };

  const entrada = (id2, props = {}) => el("input", { class: "entrada", id: id2, ...props });
  const campo = (etiqueta, control, ancho = false) => el("div", { class: `campo ${ancho ? "ancho-completo" : ""}` }, el("label", { for: control.id }, etiqueta), control);
  const c = {
    nombre: entrada("ot-cliente", { type: "text", maxLength: 120, value: orden?.cliente.nombre ?? "" }),
    telefono: entrada("ot-telefono", { type: "tel", maxLength: 30, value: orden?.cliente.telefono ?? "" }),
    tipo: el("select", { class: "entrada", id: "ot-tipo" }, ["Bicicleta", "Moto"].map(t => el("option", { value: t, selected: orden?.vehiculo.tipo === t }, t))),
    marca: entrada("ot-marca", { type: "text", maxLength: 60, value: orden?.vehiculo.marca ?? "" }),
    modelo: entrada("ot-modelo", { type: "text", maxLength: 80, value: orden?.vehiculo.modelo ?? "", placeholder: "Ej: MTB rin 29, NKD 125" }),
    color: entrada("ot-color", { type: "text", maxLength: 40, value: orden?.vehiculo.color ?? "" }),
    serial: entrada("ot-serial", { type: "text", maxLength: 60, value: orden?.vehiculo.serial ?? "", autocomplete: "off" }),
    trabajo: el("textarea", { class: "entrada", id: "ot-trabajo", rows: 2, maxLength: 500 }),
    diagnostico: el("textarea", { class: "entrada", id: "ot-diagnostico", rows: 2, maxLength: 800 }),
    responsable: el("select", { class: "entrada", id: "ot-responsable" }, USUARIOS.map(u => el("option", { value: u.nombre, selected: (orden?.responsable ?? admin.nombre) === u.nombre }, u.nombre))),
    ingreso: entrada("ot-ingreso", { type: "date", value: orden?.fechaIngreso ?? hoy }),
    estimada: entrada("ot-estimada", { type: "date", value: orden?.fechaEstimada ?? sumarDias(hoy, DIAS_ENTREGA_ESTIMADA) }),
    estado: orden ? el("select", { class: "entrada", id: "ot-estado" }, ESTADOS_TALLER.map(e => el("option", { value: e, selected: orden.estado === e }, e))) : null
  };
  c.trabajo.value = orden?.trabajo ?? "";
  c.diagnostico.value = orden?.diagnostico ?? "";

  // Aviso del serial (reportado en rojo, o a quién se vendió)
  const avisoSerial = el("div", { class: "aviso-serial", "aria-live": "polite" });
  const revisarSerial = () => {
    const s = buscarSerial(c.serial.value);
    avisoSerial.replaceChildren();
    if (!c.serial.value.trim() || !s) return;
    if (s.estado === "Reportado") {
      avisoSerial.append(el("div", { class: "aviso aviso-peligro pulso" }, icono("alerta"),
        el("div", {}, el("strong", {}, `¡Serial ${s.serial} REPORTADO!`), el("p", {}, s.nota || "Sin nota."))));
    } else {
      avisoSerial.append(el("p", { class: "campo-ayuda" },
        `Serial registrado: ${s.referencia} · ${s.nombreProducto} · ${s.estado}${s.cliente ? ` (vendido a ${s.cliente.nombre})` : ""}.`));
    }
    pintarSugeridos();
  };
  c.serial.addEventListener("input", conRetraso(revisarSerial, 250));

  // --- Repuestos ---
  const buscadorRepuesto = el("input", { type: "search", class: "entrada", id: "ot-buscar-repuesto", placeholder: "Buscar repuesto por nombre o referencia", autocomplete: "off" });
  const resultados = el("div", { class: "resultados-repuesto", role: "listbox", "aria-label": "Resultados" });
  const sugeridos = el("div", { class: "sugeridos-repuesto" });
  const tablaRepuestos = el("div", {});
  const vehiculoActual = () => ({ tipo: c.tipo.value, marca: c.marca.value, modelo: c.modelo.value, serial: c.serial.value });

  const botonProducto = p => el("button", { type: "button", class: "opcion-repuesto", dataset: { agregar: p.id }, role: "option" },
    el("img", { src: imagenProducto(p), alt: "", width: 36, height: 36 }),
    el("span", {}, el("strong", {}, p.nombre), el("small", { class: "texto-suave" }, `${p.referencia} · ${formatoCOP(precioRepuesto(p))} · stock ${formatoNumero(p.stock)}`)));

  function pintarSugeridos() {
    const etiquetas = etiquetasVehiculo(vehiculoActual());
    const lista = repuestosSugeridos(vehiculoActual(), 6).filter(p => !estadoForm.repuestos.some(r => r.productoId === p.id));
    sugeridos.replaceChildren(
      lista.length
        ? el("div", {}, el("span", { class: "etiqueta" }, `Compatibles con este vehículo (${etiquetas.join(", ")})`), el("div", { class: "lista-sugeridos" }, lista.map(botonProducto)))
        : el("p", { class: "campo-ayuda" }, etiquetas.length ? `Sin repuestos compatibles con ${etiquetas.join(", ")} en stock.` : "Escribe el rin en el modelo (ej. “rin 26”) o el serial para ver repuestos compatibles."));
  }
  const buscar = conRetraso(() => {
    const q = normalizarTexto(buscadorRepuesto.value);
    if (!q) { resultados.replaceChildren(); return; }
    const palabras = q.split(" ");
    const etiquetas = new Set(etiquetasVehiculo(vehiculoActual()));
    const encontrados = obtenerProductos()
      .filter(p => p.stock > 0 && precioBase(p) && palabras.every(w => normalizarTexto(`${p.nombre} ${p.referencia} ${p.marca}`).includes(w)))
      // Primero los compatibles con el vehículo
      .sort((a, b) => Number((b.compatibilidad || []).some(e => etiquetas.has(e))) - Number((a.compatibilidad || []).some(e => etiquetas.has(e))))
      .slice(0, 8);
    resultados.replaceChildren(...(encontrados.length ? encontrados.map(botonProducto) : [el("p", { class: "campo-ayuda" }, "Sin resultados con stock.")]));
  }, 180);
  buscadorRepuesto.addEventListener("input", buscar);
  [c.tipo, c.modelo, c.marca].forEach(x => x.addEventListener("change", pintarSugeridos));

  const agregarRepuesto = productoId => {
    const p = obtenerProducto(productoId);
    if (!p) return;
    const existente = estadoForm.repuestos.find(r => r.productoId === productoId);
    const usados = existente ? existente.cantidad : 0;
    if (usados + 1 > p.stock) { toast(`Solo hay ${formatoNumero(p.stock)} unidades de "${p.nombre}".`, "error"); return; }
    if (existente) existente.cantidad++;
    else estadoForm.repuestos.push({ productoId, referencia: p.referencia, nombre: p.nombre, precio: precioRepuesto(p), aplicaIva: llevaIva(p), costo: p.costo, cantidad: 1, descuento: 0 });
    buscadorRepuesto.value = "";
    resultados.replaceChildren();
    pintarRepuestos();
    pintarSugeridos();
  };
  [resultados, sugeridos].forEach(z => z.addEventListener("click", e => {
    const b = e.target.closest("[data-agregar]");
    if (b) agregarRepuesto(b.dataset.agregar);
  }));

  function pintarRepuestos() {
    if (!estadoForm.repuestos.length) { tablaRepuestos.replaceChildren(el("p", { class: "campo-ayuda" }, "Sin repuestos todavía.")); pintarTotales(); return; }
    tablaRepuestos.replaceChildren(el("table", { class: "tabla-simple tabla-repuestos" },
      el("thead", {}, el("tr", {}, el("th", {}, "Repuesto"), el("th", { class: "num" }, "Precio"), el("th", {}, "Cant."), el("th", { class: "num" }, "Subtotal"), el("th", {}, el("span", { class: "solo-lector" }, "Quitar")))),
      el("tbody", {}, estadoForm.repuestos.map(r => {
        const stock = obtenerProducto(r.productoId)?.stock ?? 0;
        return el("tr", { dataset: { id: r.productoId } },
          el("td", {}, el("div", {}, r.nombre), el("div", { class: "texto-suave" }, `${r.referencia}${reglaIva !== REGLA_IVA.aparte && r.aplicaIva ? ` · ${TEXTO_IVA_INCLUIDO}` : ""}`)),
          el("td", { class: "num" }, formatoCOP(r.precio)),
          el("td", {}, el("div", { class: "cantidad" },
            el("button", { type: "button", "aria-label": "Restar", dataset: { rep: "menos" }, disabled: soloLectura }, "−"),
            el("input", { type: "number", value: r.cantidad, readOnly: true, "aria-label": `Cantidad de ${r.nombre}` }),
            el("button", { type: "button", "aria-label": "Sumar", dataset: { rep: "mas" }, disabled: soloLectura || r.cantidad >= stock }, "+"))),
          el("td", { class: "num" }, formatoCOP(r.precio * r.cantidad)),
          el("td", {}, soloLectura ? null : botonIcono("eliminar", `Quitar ${r.nombre}`, { class: "pequeno", dataset: { rep: "quitar" } })));
      }))));
    pintarTotales();
  }
  tablaRepuestos.addEventListener("click", e => {
    const b = e.target.closest("[data-rep]");
    if (!b) return;
    const r = estadoForm.repuestos.find(x => x.productoId === b.closest("[data-id]").dataset.id);
    if (!r) return;
    if (b.dataset.rep === "mas") r.cantidad = Math.min(obtenerProducto(r.productoId)?.stock ?? r.cantidad, r.cantidad + 1);
    if (b.dataset.rep === "menos") r.cantidad--;
    if (b.dataset.rep === "quitar" || r.cantidad <= 0) estadoForm.repuestos = estadoForm.repuestos.filter(x => x !== r);
    pintarRepuestos();
    pintarSugeridos();
  });

  // --- Mano de obra ---
  const listaServicios = el("datalist", { id: "servicios-taller" }, SERVICIOS_TALLER.map(s => el("option", { value: s.descripcion })));
  const tablaMano = el("div", { class: "lista-mano-obra" });
  function pintarManoObra() {
    tablaMano.replaceChildren(...estadoForm.manoObra.map((m, i) => {
      const descripcion = el("input", { class: "entrada", list: "servicios-taller", value: m.descripcion, placeholder: "Servicio", "aria-label": `Servicio ${i + 1}`, disabled: soloLectura });
      const valor = el("input", { class: "entrada", type: "number", min: 0, step: 1000, value: m.valor || "", placeholder: "Valor", "aria-label": `Valor del servicio ${i + 1}`, disabled: soloLectura });
      descripcion.addEventListener("input", () => {
        m.descripcion = descripcion.value;
        const conocido = SERVICIOS_TALLER.find(s => s.descripcion === descripcion.value);
        if (conocido && !Number(valor.value)) { valor.value = conocido.valor; m.valor = conocido.valor; pintarTotales(); }
      });
      valor.addEventListener("input", () => { m.valor = Number(valor.value) || 0; pintarTotales(); });
      return el("div", { class: "fila-mano-obra" }, descripcion, valor,
        soloLectura ? null : botonIcono("eliminar", "Quitar servicio", { class: "pequeno", onclick: () => { estadoForm.manoObra.splice(i, 1); pintarManoObra(); pintarTotales(); } }));
    }), soloLectura ? "" : el("button", { type: "button", class: "boton boton-secundario boton-pequeno", id: "agregar-servicio",
      onclick: () => { estadoForm.manoObra.push({ descripcion: "", valor: 0 }); pintarManoObra(); tablaMano.querySelector(".fila-mano-obra:last-of-type input")?.focus(); } }, "+ Agregar servicio"));
  }

  // --- Totales ---
  const cajaTotales = el("dl", { class: "carrito-totales totales-orden" });
  function pintarTotales() {
    const t = totalesOrden({ repuestos: estadoForm.repuestos, manoObra: estadoForm.manoObra, reglaIva });
    const repuestos = calcularTotales(estadoForm.repuestos, 0, reglaIva).subtotal;
    const fila = (a, b, clase = "") => [el("dt", { class: clase }, a), el("dd", { class: `numero ${clase}` }, b)];
    cajaTotales.replaceChildren(
      ...fila("Repuestos", formatoCOP(repuestos)),
      ...fila("Mano de obra", formatoCOP(t.subtotal - repuestos)),
      // Sin la fila "Subtotal" (repuestos + mano de obra ya la reemplazan) ni descuentos (las órdenes no tienen)
      ...filasTotales(t).filter(f => f.tipo !== "descuento" && f.etiqueta !== "Subtotal").flatMap(f =>
        fila(f.etiqueta, formatoCOP(f.valor), f.tipo === "total" ? "total" : f.tipo === "nota-iva" ? "nota-iva" : "")));
  }

  const uploader = crearUploader({ max: 3, iniciales: estadoForm.fotos, etiqueta: "Fotos de cómo llega el vehículo (hasta 3)", onChange: l => { estadoForm.fotos = l; } });
  const error = el("p", { class: "campo-error", role: "alert" });

  const formulario = el("form", { class: "form-grilla form-orden", novalidate: true, onsubmit: e => e.preventDefault() },
    orden ? el("div", { class: "ancho-completo orden-estado-fila" },
      el("span", { class: `chip ${CLASE_ESTADO[orden.estado]}` }, orden.estado),
      el("span", { class: "texto-suave" }, `${diasEnTaller(orden)} días en el taller${ordenAtrasada(orden) ? " · ATRASADA" : ""}`),
      soloLectura ? el("span", { class: "texto-suave" }, "· Orden cerrada: solo lectura.") : null) : null,
    el("p", { class: "form-grupo-titulo" }, "Cliente"),
    campo("Nombre *", c.nombre), campo("Teléfono", c.telefono),
    el("p", { class: "form-grupo-titulo" }, "Vehículo"),
    campo("Tipo", c.tipo), campo("Marca", c.marca), campo("Modelo", c.modelo), campo("Color", c.color),
    el("div", { class: "campo ancho-completo" }, el("label", { for: "ot-serial" }, "Serial / número de marco (si lo tiene)"), c.serial, avisoSerial),
    el("p", { class: "form-grupo-titulo" }, "Trabajo"),
    campo("Trabajo solicitado *", c.trabajo, true), campo("Diagnóstico", c.diagnostico, true),
    campo("Técnico / responsable", c.responsable),
    orden && !soloLectura ? campo("Estado", c.estado) : el("div", {}),
    campo("Fecha de ingreso", c.ingreso), campo("Entrega estimada", c.estimada),
    el("div", { class: "ancho-completo" }, uploader.elemento),
    el("p", { class: "form-grupo-titulo" }, "Repuestos del inventario"),
    soloLectura ? null : el("div", { class: "campo ancho-completo" }, el("label", { for: "ot-buscar-repuesto" }, "Agregar repuesto"),
      el("div", { class: "fila-manual" }, buscadorRepuesto,
        el("button", { type: "button", class: "boton boton-secundario", id: "ot-escanear", onclick: () => abrirEscaner({
          titulo: "Escanear repuesto",
          alLeer: codigo => {
            const p = buscarPorReferencia(codigo);
            if (!p) { toast(`No hay un producto con el código ${codigo}.`, "error"); return; }
            agregarRepuesto(p.id);
          }
        }) }, icono("escaner"), "Escanear")),
      resultados),
    soloLectura ? null : el("div", { class: "ancho-completo" }, sugeridos),
    el("div", { class: "ancho-completo" }, tablaRepuestos),
    el("p", { class: "form-grupo-titulo" }, "Mano de obra"),
    el("div", { class: "ancho-completo" }, tablaMano, listaServicios,
      reglaIva === REGLA_IVA.aparte ? null : el("p", { class: "campo-ayuda" }, `Escribe el valor final del servicio (${TEXTO_IVA_INCLUIDO}).${reglaIva === REGLA_IVA.redondeado ? " Se cobra redondeado hacia arriba a la centena." : ""}`)),
    el("div", { class: "ancho-completo" }, cajaTotales),
    orden ? el("div", { class: "ancho-completo" }, crearHistorial(orden.historial || [], { visibles: 6, titulo: "Historial de la orden" })) : null,
    el("div", { class: "ancho-completo" }, error));

  if (soloLectura) formulario.querySelectorAll("input, select, textarea").forEach(x => { x.disabled = true; });
  if (soloLectura) uploader.elemento.querySelectorAll("button, label").forEach(x => { x.hidden = true; });

  pintarRepuestos();
  pintarManoObra();
  pintarSugeridos();
  revisarSerial();

  const recoger = () => ({
    cliente: { nombre: c.nombre.value, telefono: c.telefono.value },
    vehiculo: { tipo: c.tipo.value, marca: c.marca.value, modelo: c.modelo.value, color: c.color.value, serial: c.serial.value },
    trabajo: c.trabajo.value, diagnostico: c.diagnostico.value, responsable: c.responsable.value,
    fechaIngreso: c.ingreso.value, fechaEstimada: c.estimada.value,
    fotos: estadoForm.fotos, repuestos: estadoForm.repuestos, manoObra: estadoForm.manoObra
  });

  const modal = abrirModal({
    titulo: orden ? `Orden ${orden.numero}` : "Nueva orden de taller",
    contenido: formulario,
    ancho: true,
    acciones: [
      { texto: soloLectura ? "Cerrar" : "Cancelar", clase: "boton-secundario" },
      ...(orden ? [{ texto: "PDF", clase: "boton-secundario", alHacerClic: () => { descargarPDF(orden.id); return false; } }] : []),
      ...(soloLectura ? [] : [{
        texto: orden ? "Guardar cambios" : "Crear orden", clase: "boton-acento",
        alHacerClic: async () => {
          error.textContent = "";
          if (!c.nombre.value.trim()) { error.textContent = "El nombre del cliente es obligatorio."; c.nombre.focus(); return false; }
          if (!c.trabajo.value.trim()) { error.textContent = "Describe el trabajo solicitado."; c.trabajo.focus(); return false; }
          try {
            const guardada = orden ? actualizarOrden(orden.id, recoger(), admin) : crearOrden(recoger(), admin);
            toast(orden ? `${guardada.numero} guardada.` : `Orden ${guardada.numero} creada.`, "exito");
            const serial = buscarSerial(guardada.vehiculo.serial);
            if (serial?.estado === "Reportado") toast(`⚠ El serial ${serial.serial} está REPORTADO: ${serial.nota}`, "error", 9000);
            if (orden && c.estado.value !== orden.estado) {
              modal.cerrar();
              await moverOrden(orden.id, c.estado.value);
              return;
            }
            pintarTaller();
          } catch (e) {
            error.textContent = e.message;
            return false;
          }
        }
      }])
    ]
  });
}

// =========================================================
// PDF de la orden (ingreso o entrega)
// =========================================================

export function generarPDFOrden(o) {
  const entregada = o.estado === "Entregada";
  const { doc, ancho, margen } = nuevoPDF({ titulo: entregada ? "ORDEN DE TALLER · ENTREGA" : "ORDEN DE TALLER · INGRESO", numero: o.numero, tienda: obtenerConfiguracion().tienda });
  let y = cuadroPDF(doc, {
    x: margen, y: 42, ancho: ancho - margen * 2,
    columnas: [
      [["Cliente", o.cliente.nombre], ["Teléfono", o.cliente.telefono], ["Responsable", o.responsable]],
      [["Vehículo", `${o.vehiculo.tipo} ${o.vehiculo.marca}`.trim()], ["Modelo", `${o.vehiculo.modelo} ${o.vehiculo.color}`.trim()], ["Serial", o.vehiculo.serial]]
    ]
  });
  y = cuadroPDF(doc, {
    x: margen, y: y + 4, ancho: ancho - margen * 2,
    columnas: [
      [["Ingreso", fechaPDF(o.fechaIngreso)], ["Estado", o.estado]],
      [["Entrega estimada", fechaPDF(o.fechaEstimada)], [entregada ? "Entregada" : "Días en taller", entregada ? fechaPDF(o.fechaEntrega) : String(diasEnTaller(o))]]
    ]
  });
  const bloqueTexto = (titulo, texto) => {
    if (!texto) return;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
    doc.text(titulo, margen, y + 8);
    doc.setFont("helvetica", "normal");
    const lineas = doc.splitTextToSize(pdfTexto(texto), ancho - margen * 2);
    doc.text(lineas, margen, y + 13);
    y += 10 + lineas.length * 4.5;
  };
  bloqueTexto("Trabajo solicitado", o.trabajo);
  bloqueTexto("Diagnóstico", o.diagnostico);

  const filas = [
    ...o.repuestos.map(r => [pdfTexto(r.referencia), pdfTexto(r.nombre), formatoNumero(r.cantidad), pdfCOP(r.precio), pdfCOP(r.precio * r.cantidad)]),
    ...o.manoObra.map(m => {
      // En las órdenes vigentes el servicio se cobra redondeado hacia arriba a la centena
      const valor = reglaIvaDe(o) === REGLA_IVA.redondeado ? redondearArriba(m.valor) : m.valor;
      return ["M. obra", pdfTexto(m.descripcion), "1", pdfCOP(valor), pdfCOP(valor)];
    })
  ];
  if (filas.length) {
    y = tablaPDF(doc, {
      y: y + 6, margen, cabecera: ["Ref.", "Repuesto / servicio", "Cant.", "Valor und", "Subtotal"], filas,
      columnas: { 0: { cellWidth: 22 }, 2: { halign: "right", cellWidth: 14 }, 3: { halign: "right", cellWidth: 30 }, 4: { halign: "right", cellWidth: 32 } }
    });
    if (y > doc.internal.pageSize.getHeight() - 70) { doc.addPage(); y = 20; }
    y = totalesPDF(doc, y + 8, totalesOrden(o), { ancho, margen });
  }
  firmasPDF(doc, y + 6, [entregada ? "Entregado por CicloVictoria" : "Recibido por CicloVictoria", entregada ? "Recibí a satisfacción (cliente)" : "Cliente"], { ancho, margen });
  piePDF(doc, entregada
    ? "Comprobante de entrega. Los repuestos cambiados quedan a disposición del cliente por 8 días."
    : "Comprobante de ingreso. Presente este documento para retirar el vehículo. CicloVictoria no responde por objetos dejados en el vehículo.");
  return doc;
}

function descargarPDF(id) {
  const o = obtenerOrden(id);
  if (!o) return;
  try {
    generarPDFOrden(o).save(`${o.numero}_${o.estado === "Entregada" ? "entrega" : "ingreso"}.pdf`);
    toast(`PDF de ${o.numero} descargado.`, "exito", 2500);
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
  }
}
