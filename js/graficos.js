// =========================================================
// CicloVictoria · graficos.js
// Estadísticas con Chart.js en los colores de la marca (negro, grises
// y amarillo). Un selector de línea (Todas / Bicicletas / Motos)
// filtra todos los gráficos. Series vacías muestran "Sin datos".
// =========================================================

import {
  obtenerProductos, obtenerProducto, obtenerProveedores, nombreProveedor, obtenerCotizaciones, estadoCotizacion,
  obtenerOrdenes, diasEnTaller, obtenerGarantias, estadoGarantia, obtenerHistorialGlobal, estadoStock,
  calcularMargen, margenProducto, margenMinimoPara, tieneMargenBajo, valorVenta, valorCosto
} from "./datos.js";
import { ESTADOS_COTIZACION, ESTADOS_TALLER } from "./config.js";
import { precioFinal } from "./precios.js";
import { el, icono, estadoVacio, formatoCOP, formatoNumero, formatoPorcentaje, prefiereMenosMovimiento, animarContador } from "./ui.js";

let seccion = null;
let linea = "Todas";
let graficos = [];
let renderActual = 0;

const COLORES = {
  gris: "#8C8C87", grisClaro: "#BDBDB8", acento: "#FFC21A", ok: "#1F9D55", alerta: "#F28C28", peligro: "#D93A3A"
};
/** Negro en modo claro, casi blanco en modo oscuro (para que siempre contraste) */
const principal = () => (document.documentElement.dataset.tema === "oscuro" ? "#EDEDE9" : "#0E0E0E");
const secuencia = () => [principal(), COLORES.acento, COLORES.gris, COLORES.grisClaro, "#4A4A47", "#FFE08A", "#6E6E6A", "#E6E6E3"];
const compacto = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });
const pesosCorto = v => `$${compacto.format(v)}`;
const recortar = (t, n = 28) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function iniciarEstadisticas(opciones) {
  seccion = opciones.seccion;
}

// ---------- Filtro por línea ----------
function productosFiltrados() {
  return linea === "Todas" ? obtenerProductos() : obtenerProductos().filter(p => p.linea === linea);
}
const coincideLinea = productoId => linea === "Todas" || obtenerProducto(productoId)?.linea === linea;

// ---------- Utilidades de agrupación ----------
function agrupar(lista, clave, valor = () => 1) {
  return lista.reduce((acc, x) => {
    const k = clave(x);
    acc.set(k, (acc.get(k) || 0) + valor(x));
    return acc;
  }, new Map());
}
const ordenarDesc = mapa => [...mapa.entries()].sort((a, b) => b[1] - a[1]);

// =========================================================
// Render
// =========================================================

export function pintarEstadisticas() {
  if (!seccion) return;
  graficos.forEach(g => g.destroy());
  graficos = [];
  const render = ++renderActual;
  if (!window.Chart) {
    seccion.replaceChildren(el("div", { class: "aviso aviso-peligro" }, icono("alerta"), el("p", {}, "No se cargó Chart.js. Revisa tu conexión a internet.")));
    return;
  }
  configurarChart();
  const productos = productosFiltrados();

  const selector = el("div", { class: "segmentado", role: "group", "aria-label": "Línea" },
    ["Todas", "Bicicleta", "Moto"].map(v => el("button", { type: "button", dataset: { valor: v }, "aria-pressed": String(linea === v) },
      v === "Todas" ? "Todas" : v === "Bicicleta" ? "Bicicletas" : "Motos")));
  selector.addEventListener("click", e => {
    const b = e.target.closest("[data-valor]");
    if (!b || b.dataset.valor === linea) return;
    linea = b.dataset.valor;
    pintarEstadisticas();
  });

  const grilla = el("div", { class: "grilla-graficos" });
  seccion.replaceChildren(
    el("div", { class: "cabecera-seccion" },
      el("div", {},
        el("h1", { style: { fontSize: "clamp(24px,3.4vw,34px)" } }, "Estadísticas"),
        el("p", {}, `${formatoNumero(productos.length)} productos · inventario, márgenes, cotizaciones y taller.`)),
      selector),
    tarjetasResumen(productos),
    el("h2", { class: "subtitulo-seccion" }, "Inventario"),
    grilla);

  const agregar = (titulo, construir, { ancho = false, ayuda = "" } = {}) => {
    const config = construir();
    const tarjeta = el("section", { class: `tarjeta tarjeta-grafico ${ancho ? "ancho" : ""}`, "aria-label": titulo },
      el("h3", {}, titulo), ayuda ? el("p", { class: "texto-suave ayuda-grafico" }, ayuda) : null);
    if (!config) {
      tarjeta.append(estadoVacio({ titulo: "Sin datos", mensaje: "Todavía no hay información para este gráfico." }));
    } else if (config instanceof Node) {
      tarjeta.append(config);
    } else {
      const lienzo = el("canvas", { role: "img", "aria-label": `Gráfico: ${titulo}` });
      tarjeta.append(el("div", { class: "lienzo-grafico" }, lienzo));
      // Se crea después de insertarlo para que tenga tamaño
      requestAnimationFrame(() => { if (render === renderActual) graficos.push(new window.Chart(lienzo, config)); });
    }
    grilla.append(tarjeta);
  };
  const subtitulo = texto => grilla.append(el("h2", { class: "subtitulo-seccion ancho-grafico" }, texto));

  // ---------- Inventario ----------
  agregar("Valor de inventario por categoría", () => {
    const venta = agrupar(productos, p => p.categoria, valorVenta);
    const costo = agrupar(productos, p => p.categoria, valorCosto);
    const top = ordenarDesc(venta).filter(([, v]) => v > 0).slice(0, 12);
    if (!top.length) return null;
    return barra(top.map(([k]) => k), [
      { label: "A costo", data: top.map(([k]) => costo.get(k) || 0), backgroundColor: COLORES.grisClaro },
      { label: "A venta", data: top.map(([, v]) => v), backgroundColor: principal() }
    ], { horizontal: true, dinero: true });
  }, { ancho: true });

  agregar("Unidades por marca", () => {
    const top = ordenarDesc(agrupar(productos.filter(p => p.marca !== "Sin marca"), p => p.marca, p => p.stock)).slice(0, 10);
    if (!top.length) return null;
    return barra(top.map(([k]) => k), [{ label: "Unidades", data: top.map(([, v]) => v), backgroundColor: COLORES.acento }]);
  }, { ancho: true, ayuda: "Top 10 (sin contar productos sin marca)." });

  agregar("Bicicletas vs Motos", () => {
    const lineas = ["Bicicleta", "Moto"];
    const base = obtenerProductos().filter(p => linea === "Todas" || p.linea === linea);
    if (!base.length) return null;
    const valor = lineas.map(l => base.filter(p => p.linea === l).reduce((s, p) => s + valorVenta(p), 0));
    const unidades = lineas.map(l => base.filter(p => p.linea === l).reduce((s, p) => s + p.stock, 0));
    return {
      type: "bar",
      data: {
        labels: ["Bicicletas", "Motos"],
        datasets: [
          { label: "Valor a venta", data: valor, backgroundColor: principal(), yAxisID: "y" },
          { label: "Unidades", data: unidades, backgroundColor: COLORES.acento, yAxisID: "y1" }
        ]
      },
      options: opcionesBase({
        scales: {
          y: { position: "left", ticks: { callback: pesosCorto }, grid: { color: colorRejilla() } },
          y1: { position: "right", grid: { display: false }, ticks: { callback: v => compacto.format(v) } }
        },
        plugins: { tooltip: { callbacks: { label: c => c.dataset.yAxisID === "y" ? `${c.dataset.label}: ${formatoCOP(c.raw)}` : `${c.dataset.label}: ${formatoNumero(c.raw)}` } } }
      })
    };
  });

  agregar("Estados de stock", () => {
    const conteo = agrupar(productos, estadoStock);
    if (!productos.length) return null;
    return dona(["Disponible", "Stock bajo", "Agotado"], [conteo.get("normal") || 0, conteo.get("bajo") || 0, conteo.get("agotado") || 0],
      [COLORES.ok, COLORES.alerta, COLORES.peligro]);
  });

  agregar("Top 10 productos por valor en inventario", () => {
    const top = [...productos].sort((a, b) => valorVenta(b) - valorVenta(a)).filter(p => valorVenta(p) > 0).slice(0, 10);
    if (!top.length) return null;
    return barra(top.map(p => recortar(p.nombre)), [{ label: "Valor a venta", data: top.map(valorVenta), backgroundColor: principal() }], { horizontal: true, dinero: true });
  }, { ancho: true });

  agregar("Margen promedio por categoría", () => {
    const grupos = agrupar(productos.filter(p => margenProducto(p) !== null), p => p.categoria, () => 1);
    if (!grupos.size) return null;
    const categorias = [...grupos.keys()].sort((a, b) => a.localeCompare(b, "es"));
    const promedios = categorias.map(c => {
      const lista = productos.filter(p => p.categoria === c).map(p => margenProducto(p)).filter(m => m !== null);
      return lista.reduce((a, b) => a + b, 0) / lista.length;
    });
    const colores = categorias.map((c, i) => (promedios[i] < margenMinimoPara(c) ? COLORES.peligro : principal()));
    return barra(categorias, [{ label: "Margen promedio %", data: promedios.map(v => Number(v.toFixed(1))), backgroundColor: colores }], { porcentaje: true });
  }, { ancho: true, ayuda: "En rojo, las categorías por debajo de su margen mínimo." });

  agregar("Margen promedio por proveedor", () => {
    const provs = [...obtenerProveedores(), { id: "sin", nombre: "Sin proveedor" }];
    const datos = provs.map(pr => {
      const lista = productos.filter(p => p.proveedorId === pr.id).map(p => margenProducto(p)).filter(m => m !== null);
      return [pr.nombre, lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : null];
    }).filter(([, v]) => v !== null);
    if (!datos.length) return null;
    return barra(datos.map(([k]) => k), [{ label: "Margen promedio %", data: datos.map(([, v]) => Number(v.toFixed(1))), backgroundColor: COLORES.acento }], { porcentaje: true });
  });

  agregar("Valor de inventario por proveedor", () => {
    const grupos = ordenarDesc(agrupar(productos, p => nombreProveedor(p.proveedorId), valorVenta)).filter(([, v]) => v > 0);
    if (!grupos.length) return null;
    return dona(grupos.map(([k]) => k), grupos.map(([, v]) => v), secuencia(), { dinero: true });
  });

  // ---------- Cotizaciones ----------
  subtitulo("Cotizaciones");
  const cotizaciones = obtenerCotizaciones().filter(c => c.items.some(i => coincideLinea(i.productoId)));
  agregar("Cotizaciones por estado", () => {
    if (!cotizaciones.length) return null;
    const conteo = agrupar(cotizaciones, c => estadoCotizacion(c));
    const colores = { Borrador: COLORES.grisClaro, Enviada: principal(), Aprobada: COLORES.ok, Rechazada: COLORES.peligro, Vencida: COLORES.alerta };
    const estados = ESTADOS_COTIZACION.filter(e => conteo.get(e));
    return dona(estados, estados.map(e => conteo.get(e)), estados.map(e => colores[e]));
  });
  agregar("Valor cotizado por mes", () => {
    if (!cotizaciones.length) return null;
    const meses = agrupar(cotizaciones, c => c.fecha.slice(0, 7), c => c.totales.total);
    const aprobado = agrupar(cotizaciones.filter(c => c.estado === "Aprobada"), c => c.fecha.slice(0, 7), c => c.totales.total);
    const etiquetas = [...meses.keys()].sort().slice(-12);
    const nombreMes = k => new Date(`${k}-15`).toLocaleDateString("es-CO", { month: "short", year: "2-digit" });
    return barra(etiquetas.map(nombreMes), [
      { label: "Cotizado", data: etiquetas.map(k => meses.get(k)), backgroundColor: COLORES.grisClaro },
      { label: "Aprobado", data: etiquetas.map(k => aprobado.get(k) || 0), backgroundColor: COLORES.acento }
    ], { dinero: true });
  });

  // ---------- Taller y garantías ----------
  subtitulo("Taller y garantías");
  const ordenes = obtenerOrdenes().filter(o => linea === "Todas" || o.vehiculo.tipo === linea);
  agregar("Órdenes de taller por estado", () => {
    if (!ordenes.length) return null;
    const conteo = agrupar(ordenes, o => o.estado);
    return barra(ESTADOS_TALLER, [{ label: "Órdenes", data: ESTADOS_TALLER.map(e => conteo.get(e) || 0),
      backgroundColor: ESTADOS_TALLER.map(e => e === "Entregada" ? COLORES.ok : e === "Cancelada" ? COLORES.peligro : e === "Lista" ? COLORES.acento : principal()) }]);
  });
  agregar("Tiempo promedio en taller", () => {
    if (!ordenes.length) return null;
    const cerradas = ordenes.filter(o => o.estado === "Entregada");
    const base = cerradas.length ? cerradas : ordenes;
    const promedio = base.reduce((s, o) => s + diasEnTaller(o), 0) / base.length;
    const valor = el("span", { class: "dato-grande numero" });
    animarContador(valor, Math.round(promedio * 10), v => `${(v / 10).toLocaleString("es-CO", { maximumFractionDigits: 1 })} días`);
    return el("div", { class: "dato-destacado" }, valor,
      el("p", { class: "texto-suave" }, cerradas.length ? `Promedio de ${cerradas.length} órdenes entregadas` : `Promedio de ${ordenes.length} órdenes (aún no hay entregadas)`));
  });
  const garantias = obtenerGarantias().filter(g => coincideLinea(g.productoId));
  agregar("Garantías", () => {
    if (!garantias.length) return null;
    const conteo = agrupar(garantias, g => estadoGarantia(g));
    const estados = ["Vigente", "Por vencer", "Vencida"];
    return dona(estados, estados.map(e => conteo.get(e) || 0), [COLORES.ok, COLORES.alerta, COLORES.peligro]);
  });
  agregar("Reclamos por producto", () => {
    const top = ordenarDesc(agrupar(garantias.filter(g => g.reclamos?.length), g => g.nombreProducto, g => g.reclamos.length)).slice(0, 8);
    if (!top.length) return null;
    return barra(top.map(([k]) => recortar(k)), [{ label: "Reclamos", data: top.map(([, v]) => v), backgroundColor: COLORES.peligro }], { horizontal: true });
  });

  // ---------- Movimientos ----------
  subtitulo("Movimientos de stock");
  agregar("Entradas vs salidas por día (últimos 30 días)", () => {
    const desde = new Date();
    desde.setDate(desde.getDate() - 29);
    const movimientos = obtenerHistorialGlobal().filter(h => h.tipo === "stock" && new Date(h.fecha) >= desde && (linea === "Todas" || coincideLinea(h.productoId)));
    // El detalle guarda "antes → después"
    const conDelta = movimientos.map(h => {
      const m = String(h.detalle).match(/(-?[\d.]+)\s*→\s*(-?[\d.]+)/);
      return m ? { dia: h.fecha.slice(0, 10), delta: Number(m[2]) - Number(m[1]) } : null;
    }).filter(Boolean);
    const entradas = agrupar(conDelta.filter(x => x.delta > 0), x => x.dia, x => x.delta);
    const salidas = agrupar(conDelta.filter(x => x.delta < 0), x => x.dia, x => -x.delta);
    const dias = Array.from({ length: 30 }, (_, i) => { const d = new Date(desde); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
    if (!conDelta.length) return null;
    return {
      type: "line",
      data: {
        labels: dias.map(d => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })),
        datasets: [
          { label: "Entradas", data: dias.map(d => entradas.get(d) || 0), borderColor: COLORES.ok, backgroundColor: "rgba(31,157,85,.15)", fill: true, tension: .3 },
          { label: "Salidas", data: dias.map(d => salidas.get(d) || 0), borderColor: COLORES.peligro, backgroundColor: "rgba(217,58,58,.12)", fill: true, tension: .3 }
        ]
      },
      options: opcionesBase({ scales: { y: { beginAtZero: true, grid: { color: colorRejilla() } }, x: { grid: { display: false } } } })
    };
  }, { ancho: true });
}

// =========================================================
// Tarjetas de resumen
// =========================================================

function tarjetasResumen(productos) {
  const conPrecio = productos.filter(p => precioFinal(p));
  const masCaro = conPrecio.reduce((a, p) => (!a || precioFinal(p) > precioFinal(a) ? p : a), null);
  // Márgenes contra el precio base (sin IVA)
  const conMargen = productos.map(p => ({ p, m: margenProducto(p) })).filter(x => x.m !== null);
  const mayorMargen = conMargen.reduce((a, x) => (!a || x.m > a.m ? x : a), null);
  const bajoMargen = productos.filter(tieneMargenBajo).length;
  const criticos = productos.filter(p => estadoStock(p) !== "normal").length;
  const porcentajeCritico = productos.length ? (criticos / productos.length) * 100 : 0;

  // Top 5 más cotizados (reduce sobre los ítems de todas las cotizaciones)
  const cotizados = [...obtenerCotizaciones().flatMap(c => c.items)
    .filter(i => coincideLinea(i.productoId))
    .reduce((acc, i) => acc.set(i.nombre, (acc.get(i.nombre) || 0) + i.cantidad), new Map())]
    .sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Repuesto más usado en el taller
  const usados = [...obtenerOrdenes().filter(o => o.estado !== "Cancelada").flatMap(o => o.repuestos)
    .filter(r => coincideLinea(r.productoId))
    .reduce((acc, r) => acc.set(r.nombre, (acc.get(r.nombre) || 0) + r.cantidad), new Map())]
    .sort((a, b) => b[1] - a[1]);

  const tarjeta = (titulo, valor, detalle, clase = "") => el("div", { class: `tarjeta kpi ${clase}` },
    el("span", { class: "kpi-titulo" }, titulo),
    valor instanceof Node ? valor : el("span", { class: "kpi-valor dinero" }, valor),
    detalle ? el("span", { class: "kpi-ayuda" }, detalle) : null);
  const contador = (numero, formato) => { const n = el("span", { class: "kpi-valor" }); animarContador(n, numero, formato); return n; };

  return el("div", { class: "grilla-kpis grilla-resumen-estadisticas" },
    tarjeta("Producto más caro", masCaro ? formatoCOP(precioFinal(masCaro)) : "—", masCaro ? recortar(masCaro.nombre, 40) : "Sin datos", "destacado"),
    tarjeta("Mayor margen", mayorMargen ? formatoPorcentaje(mayorMargen.m) : "—", mayorMargen ? recortar(mayorMargen.p.nombre, 40) : "Sin datos"),
    tarjeta("Bajo el margen mínimo", contador(bajoMargen, formatoNumero), "Productos", bajoMargen ? "peligro" : ""),
    tarjeta("Stock crítico", contador(Math.round(porcentajeCritico * 10), v => formatoPorcentaje(v / 10)), `${formatoNumero(criticos)} productos bajos o agotados`, porcentajeCritico > 25 ? "alerta" : ""),
    tarjeta("Top 5 más cotizados", cotizados.length
      ? el("ol", { class: "lista-top" }, cotizados.map(([n, c]) => el("li", {}, el("span", {}, recortar(n, 30)), el("strong", {}, formatoNumero(c)))))
      : el("span", { class: "kpi-valor dinero" }, "—"), cotizados.length ? "" : "Aún no hay cotizaciones"),
    tarjeta("Repuesto más usado en taller", usados.length ? `${formatoNumero(usados[0][1])} und` : "—", usados.length ? recortar(usados[0][0], 40) : "Aún no hay repuestos usados"));
}

// =========================================================
// Fábricas de configuración
// =========================================================

function colorRejilla() {
  return document.documentElement.dataset.tema === "oscuro" ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";
}

function configurarChart() {
  const estilos = getComputedStyle(document.documentElement);
  window.Chart.defaults.font.family = "Inter, Arial, sans-serif";
  window.Chart.defaults.font.size = 12;
  window.Chart.defaults.color = estilos.getPropertyValue("--texto-suave").trim() || "#6E6E6A";
  window.Chart.defaults.borderColor = colorRejilla();
}

function opcionesBase(extra = {}) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: prefiereMenosMovimiento() ? false : { duration: 700, easing: "easeOutCubic" },
    plugins: {
      legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true } },
      tooltip: { backgroundColor: "#0E0E0E", titleColor: "#FFFFFF", bodyColor: "#FFFFFF", padding: 10, cornerRadius: 8 }
    }
  };
  return fusionar(base, extra);
}

function fusionar(a, b) {
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) {
    r[k] = v && typeof v === "object" && !Array.isArray(v) && typeof a[k] === "object" ? fusionar(a[k], v) : v;
  }
  return r;
}

function barra(etiquetas, datasets, { horizontal = false, dinero = false, porcentaje = false } = {}) {
  const formato = dinero ? pesosCorto : porcentaje ? v => `${v} %` : v => compacto.format(v);
  const ejeValor = { beginAtZero: true, ticks: { callback: formato }, grid: { color: colorRejilla() } };
  const ejeEtiqueta = { grid: { display: false }, ticks: { autoSkip: false } };
  return {
    type: "bar",
    data: { labels: etiquetas, datasets: datasets.map(d => ({ borderRadius: 6, maxBarThickness: 36, ...d })) },
    options: opcionesBase({
      indexAxis: horizontal ? "y" : "x",
      scales: horizontal ? { x: ejeValor, y: ejeEtiqueta } : { y: ejeValor, x: { grid: { display: false } } },
      plugins: {
        legend: { display: datasets.length > 1 },
        tooltip: { callbacks: { label: c => `${c.dataset.label}: ${dinero ? formatoCOP(c.raw) : porcentaje ? `${c.raw} %` : formatoNumero(c.raw)}` } }
      }
    })
  };
}

function dona(etiquetas, valores, colores, { dinero = false } = {}) {
  if (!valores.some(v => v > 0)) return null;
  return {
    type: "doughnut",
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: colores, borderWidth: 2, borderColor: getComputedStyle(document.documentElement).getPropertyValue("--superficie").trim() || "#fff" }] },
    options: opcionesBase({
      cutout: "62%",
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: c => {
              const total = c.dataset.data.reduce((a, b) => a + b, 0);
              return `${c.label}: ${dinero ? formatoCOP(c.raw) : formatoNumero(c.raw)} (${formatoPorcentaje((c.raw / total) * 100)})`;
            }
          }
        }
      }
    })
  };
}
