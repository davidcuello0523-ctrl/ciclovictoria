// =========================================================
// CicloVictoria · admin.js
// Panel de administración: Inicio con KPIs, inventario (CRUD, ajuste
// de stock, precio en línea, destacar, mostrar/ocultar, imágenes,
// historial, márgenes, recargar y exportar Excel) y Perfil.
// Cotizaciones y Proveedores viven en sus propios módulos.
// =========================================================

import { RUTA_EXCEL, GANANCIAS, SIN_PROVEEDOR, VALORES_POR_DEFECTO, USUARIOS } from "./config.js";
import {
  inicializarDatos, obtenerProductos, obtenerProducto, obtenerProveedores, nombreProveedor,
  obtenerHistorialGlobal, obtenerMeta, crearProducto, actualizarProducto, eliminarProducto, ajustarStock,
  existeReferencia, siguienteReferencia, valoresUnicos, filtrarProductos, ordenarProductos,
  estadoStock, calcularMargen, precioSugerido, preciosDesdeCosto, gananciasPara, valorVenta, valorCosto,
  recargarDesdeExcel, exportarExcel, espacioUsado, aNumero, sincronizarDesdeAlmacen, ErrorDatos,
  margenMinimoPara, tieneMargenBajo, precioParaMargen, obtenerConfiguracion, guardarConfiguracion,
  registrarMovimiento, obtenerOrdenes, esEstadoFinal, ordenAtrasada, totalesOrden, obtenerGarantias,
  estadoGarantia, registrarSeriales, buscarPorReferencia, buscarSerial, obtenerSeriales, obtenerCotizaciones,
  estadoCotizacion, normalizarTexto, generarCatalogoPublico
} from "./datos.js";
import { precioFinal, precioSinIva, ivaPorCategoria, PORCENTAJE_IVA, TEXTO_IVA_INCLUIDO } from "./precios.js";
import { protegerAdmin, adminActual, cerrarSesion, cambiarContrasena, restablecerContrasenaDe, nombreCortoDe } from "./auth.js";
import { iniciarCotizaciones, pintarCotizaciones, agregarAlCarrito, verCotizacion } from "./cotizaciones.js";
import { iniciarProveedores, pintarProveedores, abrirFichaProveedor } from "./proveedores.js";
import { iniciarTaller, pintarTaller, abrirOrden } from "./taller.js";
import { iniciarSeriales, pintarSeriales, mostrarSerial, mostrarGarantia } from "./seriales.js";
import { abrirEscaner, mostrarQR, imagenQR, abrirImpresionEtiquetas } from "./qr.js";
import { iniciarEstadisticas, pintarEstadisticas } from "./graficos.js";
import { iniciarHeader, crearFichaUsuario } from "./header.js";
import {
  el, icono, crearLogo, iniciarTema, animarEntrada, toast, confirmar, abrirModal,
  crearSkeletons, estadoVacio, crearTarjetaProducto, construirDetalleProducto, configurarListaProductos,
  crearListaPaginada, enfocarTarjeta, conRetraso, crearUploader, filaHistorial, chipMargen,
  formatoCOP, formatoNumero, formatoPorcentaje, fechaLarga, crearCampoEtiquetas, crearHistorial,
  fechaRelativa, imagenProducto, animarContador, iniciarBusquedaGlobal
} from "./ui.js";

const sesion = protegerAdmin();
const admin = adminActual();

const $ = s => document.querySelector(s);
const dom = {
  inicio: $("#seccion-inicio"),
  lista: $("#lista-inventario"),
  cargarMas: $("#cargar-mas"),
  contador: $("#contador-resultados"),
  buscarTexto: $("#buscar-texto"),
  buscarReferencia: $("#buscar-referencia"),
  orden: $("#orden"),
  permitirVarias: $("#permitir-varias"),
  sidebar: $("#sidebar-filtros"),
  fondoPanel: $("#fondo-panel")
};

// ---------- Secciones del menú ----------
const SECCIONES = [
  { id: "inicio", titulo: "Inicio" },
  { id: "catalogo", titulo: "Catálogo" },
  { id: "cotizaciones", titulo: "Cotizaciones", modulo: true },
  { id: "taller", titulo: "Taller", modulo: true },
  { id: "proveedores", titulo: "Proveedores", modulo: true },
  { id: "seriales", titulo: "Seriales y Garantías", menu: "Garantías", modulo: true },
  { id: "estadisticas", titulo: "Estadísticas", modulo: true },
  { id: "historial", titulo: "Historial", modulo: true },
  { id: "perfil", titulo: "Perfil", modulo: true, enMenu: false } // solo en el menú de cuenta
];

// ---------- Estado de la vista ----------
const FILTROS_INICIALES = {
  texto: "", referencia: "", linea: "Todas", existencia: "todos",
  categoria: "", marca: "", proveedor: "", compat: "", estado: "", visibilidad: "", margen: ""
};
let filtros = { ...FILTROS_INICIALES };
let orden = "az";
let controlLista = null;
// El inventario se repinta al volver a él si otro módulo cambió los datos
let inventarioDesactualizado = false;

// =========================================================
// Arranque
// =========================================================

async function iniciar() {
  pintarCabecera();
  construirMenuYSecciones();
  configurarEventos();

  dom.inicio.replaceChildren(el("div", { class: "grilla-kpis" }, crearSkeletons(2)));
  dom.lista.replaceChildren(...crearSkeletons(5));

  try {
    const { origen, total, advertencias } = await inicializarDatos();
    if (origen === "excel") {
      toast(`Inventario cargado desde el Excel: ${formatoNumero(total)} productos.`, "exito");
      if (advertencias?.length) toast(`${advertencias.length} advertencias al leer el Excel (ver consola).`, "advertencia");
    }
  } catch (error) {
    mostrarErrorCarga(error);
    navegar(location.hash.replace("#", "") || "inicio", false);
    return;
  }

  iniciarCotizaciones({
    admin, seccion: seccionDe("cotizaciones"), navegar,
    alCambiarInventario: () => { inventarioDesactualizado = true; }
  });
  iniciarTaller({
    admin, seccion: seccionDe("taller"),
    alCambiarInventario: () => { inventarioDesactualizado = true; }
  });
  iniciarSeriales({
    admin, seccion: seccionDe("seriales"),
    alCrearOrden: () => {}
  });
  iniciarEstadisticas({ seccion: seccionDe("estadisticas") });
  iniciarProveedores({
    admin, seccion: seccionDe("proveedores"),
    alVerProductos: id => irAlInventario({ proveedor: id }),
    alCambiar: () => { inventarioDesactualizado = true; pintarOpcionesFiltros(); }
  });

  pintarOpcionesFiltros();
  pintarInventario();
  pintarEspacio();
  navegar(location.hash.replace("#", "") || "inicio", false);

  // Cambios hechos en otra pestaña
  window.addEventListener("storage", e => {
    if (e.key !== "cv_productos") return;
    sincronizarDesdeAlmacen();
    pintarInventario();
    if (!dom.inicio.hidden) pintarInicio();
  });
}

function pintarCabecera() {
  $("#logo").replaceWith(crearLogo({ enlace: "#inicio" }));
  iniciarTema();
  $("#ficha-usuario").replaceWith(crearFichaUsuario({
    nombre: sesion.nombre, nombreCorto: nombreCortoDe(sesion), usuario: sesion.usuario,
    opciones: [
      { icono: "usuario", texto: "Mi perfil", href: "#perfil", seccion: "perfil" },
      { tema: true },
      { separador: true },
      { icono: "salir", texto: "Cerrar sesión", peligro: true, alElegir: pedirCierreSesion }
    ]
  }));
  document.querySelectorAll(".lupa").forEach(b => b.append(icono("buscar")));
  $("#cerrar-filtros").append(icono("cerrar"));
  $("#recargar-excel").append(icono("recargar"), "Recargar desde Excel");
  $("#escanear-inventario").append(icono("escaner"), "Escanear");
  $("#escaneo-rapido").append(icono("caja"), "Escaneo rápido");
  $("#imprimir-etiquetas").append(icono("imprimir"), "Etiquetas QR");
  $("#exportar-publico").append(icono("descargar"), "Catálogo público");
  $("#boton-buscar").prepend(icono("buscar"));
  $("#exportar-excel").append(icono("descargar"), "Exportar a Excel");
}

const inicialesAdmin = () => sesion.nombre.split(" ").map(p => p[0]).join("").slice(0, 2);

async function pedirCierreSesion() {
  if (await confirmar({ titulo: "Cerrar sesión", mensaje: "¿Quieres salir del panel de administración?", aceptar: "Cerrar sesión" })) {
    cerrarSesion("index.html");
  }
}

/** Header que se acomoda al ancho: menú con "Más ▾" y panel lateral en pantallas pequeñas */
let header = null;

/** Menú de píldoras y secciones de las fases siguientes */
function construirMenuYSecciones() {
  $("#menu").replaceChildren(...SECCIONES.filter(s => s.enMenu !== false).map(s =>
    el("li", {}, el("a", { class: "nav-enlace", href: `#${s.id}`, dataset: { seccion: s.id } }, s.menu ?? s.titulo))));
  header = iniciarHeader({
    header: $("#header"), nav: $("#nav"), botonMenu: $("#boton-menu"),
    usuario: el("div", { class: "panel-menu-usuario" },
      el("span", { class: "avatar", "aria-hidden": "true" }, inicialesAdmin()),
      el("div", {}, el("strong", {}, sesion.nombre), el("small", {}, "Administrador"))),
    accion: el("button", { type: "button", class: "panel-menu-fila panel-menu-salir", onclick: pedirCierreSesion }, icono("salir"), "Cerrar sesión")
  });

  // Contenedores de los módulos (los llenan cotizaciones.js, proveedores.js y pintarPerfil)
  const modulos = SECCIONES.filter(s => s.modulo).map(s =>
    el("section", { class: "contenedor seccion", id: `seccion-${s.id}`, dataset: { seccion: s.id }, hidden: true, "aria-label": s.titulo }));

  const extra = SECCIONES.filter(s => s.fase).map(s =>
    el("section", { class: "contenedor seccion", dataset: { seccion: s.id }, hidden: true, "aria-label": s.titulo },
      el("div", { class: "cabecera-seccion" }, el("h1", { style: { fontSize: "clamp(24px,3.4vw,34px)" } }, s.titulo)),
      el("div", { class: "tarjeta proximamente" },
        icono(s.icono),
        el("strong", { class: "titulo" }, `Disponible en la Fase ${s.fase}`),
        el("p", { class: "texto-suave", style: { maxWidth: "52ch" } }, s.texto))));
  $("#secciones-extra").replaceWith(...modulos, ...extra);
}

const seccionDe = id => document.querySelector(`main section[data-seccion="${id}"]`);

function navegar(id, animar = true) {
  if (!SECCIONES.some(s => s.id === id)) id = "inicio";
  document.querySelectorAll("main [data-seccion]").forEach(s => {
    const activa = s.dataset.seccion === id;
    s.hidden = !activa;
    if (activa && animar) animarEntrada(s);
  });
  header.marcarActiva(id);
  if (location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
  if (!obtenerProductos().length) return;
  if (id === "inicio") pintarInicio();
  if (id === "catalogo" && inventarioDesactualizado) { inventarioDesactualizado = false; pintarOpcionesFiltros(); pintarInventario(); }
  if (id === "cotizaciones") pintarCotizaciones();
  if (id === "proveedores") pintarProveedores();
  if (id === "perfil") pintarPerfil();
  if (id === "taller") pintarTaller();
  if (id === "seriales") pintarSeriales();
  if (id === "estadisticas") pintarEstadisticas();
  if (id === "historial") pintarHistorial();
}

function mostrarErrorCarga(error) {
  console.error(error);
  const entrada = el("input", { type: "file", accept: ".xlsx,.xls", id: "subir-excel-error", class: "solo-lector" });
  entrada.addEventListener("change", async () => {
    if (!entrada.files[0]) return;
    try {
      await recargarDesdeExcel(admin, entrada.files[0]);
      location.reload();
    } catch (e) { toast(e.message, "error"); }
  });
  const panel = el("div", { class: "tarjeta tarjeta-relleno panel-error-excel", role: "alert" },
    el("h2", {}, "No se pudo cargar el inventario"),
    el("p", {}, error instanceof ErrorDatos ? error.message : "Error inesperado al leer los datos."),
    el("p", { class: "texto-suave" }, "Ruta esperada: ", el("code", {}, RUTA_EXCEL)),
    el("label", { for: "subir-excel-error", class: "boton boton-acento", tabindex: "0", role: "button" }, icono("subir"), "Subir Excel manualmente"),
    entrada);
  dom.inicio.replaceChildren(panel);
  dom.lista.replaceChildren(panel.cloneNode(true));
}

// =========================================================
// Inicio: KPIs, alertas, reabastecimiento y últimos movimientos
// =========================================================

/** Tarjeta KPI; el número sube desde 0 (contador animado) */
function kpi(titulo, valor, { ayuda = "", clase = "", dinero = false, formato = formatoNumero } = {}) {
  const numero = el("span", { class: `kpi-valor ${dinero ? "dinero" : ""}` });
  animarContador(numero, valor, formato);
  return el("div", { class: `tarjeta kpi ${clase}` },
    el("span", { class: "kpi-titulo" }, titulo),
    numero,
    ayuda ? el("span", { class: "kpi-ayuda" }, ayuda) : null);
}

function pintarInicio() {
  const productos = obtenerProductos();
  const unidades = productos.reduce((s, p) => s + p.stock, 0);
  const totalVenta = productos.reduce((s, p) => s + valorVenta(p), 0);
  const conCosto = productos.filter(p => p.costo !== null);
  const totalCosto = conCosto.reduce((s, p) => s + valorCosto(p), 0);
  // Utilidad sobre el precio final redondeado sin IVA: el IVA no es ganancia del negocio
  const utilidad = conCosto.reduce((s, p) => s + ((precioSinIva(p) || 0) - p.costo) * p.stock, 0);
  const bajos = productos.filter(p => estadoStock(p) === "bajo");
  const agotados = productos.filter(p => estadoStock(p) === "agotado");
  const sinCosto = productos.length - conCosto.length;
  const ordenesActivas = obtenerOrdenes().filter(o => !esEstadoFinal(o.estado));
  const ordenesAtrasadas = ordenesActivas.filter(o => ordenAtrasada(o));
  const garantiasPorVencer = obtenerGarantias().filter(g => estadoGarantia(g) === "Por vencer").length;

  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const primerNombre = sesion.nombre.split(" ")[0];
  const bienvenida = el("div", { class: "bienvenida" },
    el("h1", {}, `Bienvenido/a, ${primerNombre}`),
    el("p", {}, `${saludo}. Este es el estado del inventario de CicloVictoria.`));

  const kpis = el("div", { class: "grilla-kpis" },
    kpi("Productos", productos.length, { ayuda: `${formatoNumero(productos.filter(p => p.visibleCatalogo).length)} visibles en el catálogo` }),
    kpi("Unidades", unidades, { ayuda: "Suma del stock" }),
    kpi("Valor a precio de venta", totalVenta, { formato: formatoCOP, clase: "destacado", dinero: true, ayuda: `Precio final al público (repuestos con IVA ${PORCENTAJE_IVA} % incluido). Ganancia: bicicletas +${GANANCIAS.bicicleta.publico} %, repuestos +${GANANCIAS.repuesto.publico} %` }),
    kpi("Valor a costo", totalCosto, { formato: formatoCOP, dinero: true, ayuda: sinCosto ? `${sinCosto} productos sin costo` : "" }),
    kpi("Utilidad potencial", utilidad, { formato: formatoCOP, dinero: true, ayuda: "Si se vende todo el stock (sin IVA)" }),
    kpi("Stock bajo", bajos.length, { clase: bajos.length ? "alerta" : "", ayuda: "Por debajo del mínimo" }),
    kpi("Agotados", agotados.length, { clase: agotados.length ? "peligro" : "", ayuda: "Stock en 0" }),
    kpi("Órdenes de taller activas", ordenesActivas.length, {
      clase: ordenesAtrasadas.length ? "alerta" : "", ayuda: ordenesAtrasadas.length ? `${ordenesAtrasadas.length} atrasadas` : "En el taller ahora"
    }),
    kpi("Garantías por vencer", garantiasPorVencer, { clase: garantiasPorVencer ? "alerta" : "", ayuda: "En los próximos 30 días" }));

  const alertas = el("div", { class: "alertas-inicio" });
  if (agotados.length) {
    alertas.append(el("div", { class: "aviso aviso-peligro pulso", role: "status" }, icono("alerta"),
      el("div", { style: { flex: 1 } }, el("strong", {}, `${agotados.length} producto${agotados.length === 1 ? " está agotado" : "s están agotados"}. `),
        "Revisa el panel de reabastecimiento."),
      el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => irAlInventario({ estado: "agotado" }) }, "Ver agotados")));
  }
  const bajoMargen = productos.filter(tieneMargenBajo).length;
  if (bajoMargen) {
    alertas.append(el("div", { class: "aviso aviso-peligro", role: "status" }, icono("alerta"),
      el("div", { style: { flex: 1 } }, el("strong", {}, `${bajoMargen} producto${bajoMargen === 1 ? " se vende" : "s se venden"} por debajo del margen mínimo. `),
        `Margen mínimo general: ${formatoPorcentaje(obtenerConfiguracion().margenMinimo)}.`),
      el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => irAlInventario({ margen: "bajo" }, "margen-asc") }, "Ver productos")));
  }
  const sinPrecio = productos.filter(p => !p.precioPublicoBase).length;
  if (sinPrecio) {
    alertas.append(el("div", { class: "aviso aviso-alerta", role: "status" }, icono("info"),
      el("div", { style: { flex: 1 } }, `${sinPrecio} productos no tienen costo en el Excel, por eso no tienen precio de venta. Asígnalo desde el inventario.`),
      el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => irAlInventario({}, "precio-asc") }, "Revisar")));
  }

  if (ordenesAtrasadas.length) {
    alertas.append(el("div", { class: "aviso aviso-alerta", role: "status" }, icono("reloj"),
      el("div", { style: { flex: 1 } }, el("strong", {}, `${ordenesAtrasadas.length} orden${ordenesAtrasadas.length === 1 ? "" : "es"} de taller atrasada${ordenesAtrasadas.length === 1 ? "" : "s"}: `),
        ordenesAtrasadas.slice(0, 4).map(o => o.numero).join(", ")),
      el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => navegar("taller") }, "Ver taller")));
  }

  dom.inicio.replaceChildren(bienvenida, kpis, alertas,
    el("div", { class: "grilla-inicio" },
      el("div", { class: "columna-inicio" }, panelListasParaEntregar(), panelReabastecimiento(productos)),
      panelMovimientos()));
}

/** Órdenes de taller en estado "Lista", para avisar al cliente y entregar */
function panelListasParaEntregar() {
  const listas = obtenerOrdenes().filter(o => o.estado === "Lista");
  return el("div", { class: "tarjeta tarjeta-relleno" },
    el("div", { class: "panel-titulo" }, el("h2", { style: { fontSize: "16px" } }, "Listas para entregar"),
      el("span", { class: `chip ${listas.length ? "chip-ok" : ""}` }, `${listas.length} órdenes`)),
    listas.length
      ? el("div", { class: "lista-ordenes-inicio" }, listas.slice(0, 6).map(o =>
          el("button", { type: "button", class: "fila-orden-inicio", onclick: () => { navegar("taller"); abrirOrden(o.id); } },
            el("strong", {}, o.numero),
            el("span", {}, el("span", { style: { display: "block", fontWeight: 600 } }, o.cliente.nombre),
              el("span", { class: "texto-suave" }, [o.vehiculo.tipo, o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(" · "))),
            el("strong", { class: "numero" }, formatoCOP(totalesOrden(o).total)))))
      : el("p", { class: "texto-suave" }, "No hay órdenes listas para entregar."));
}

/** Productos bajos o agotados, agrupados por proveedor, con cantidad sugerida (minStock * 2) - stock */
function panelReabastecimiento(productos) {
  const pendientes = productos.filter(p => estadoStock(p) !== "normal");
  const grupos = pendientes.reduce((acc, p) => {
    (acc[p.proveedorId] ??= []).push(p);
    return acc;
  }, {});
  const contenido = Object.keys(grupos).length
    ? Object.entries(grupos)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([idProveedor, lista]) => {
          const ordenados = [...lista].sort((a, b) => (b.minStock * 2 - b.stock) - (a.minStock * 2 - a.stock));
          return el("div", { class: "grupo-proveedor" },
            el("h4", {}, el("span", {}, nombreProveedor(idProveedor)), el("span", { class: "texto-suave" }, `${lista.length} productos`)),
            el("table", { class: "tabla-simple" },
              el("thead", {}, el("tr", {}, el("th", {}, "Producto"), el("th", { class: "num" }, "Stock"), el("th", { class: "num" }, "Mín."), el("th", { class: "num" }, "Pedir"))),
              el("tbody", {}, ordenados.slice(0, 6).map(p => el("tr", {},
                el("td", {}, el("div", { style: { fontWeight: 600 } }, p.nombre), el("div", { class: "texto-suave", style: { fontSize: "11px" } }, p.referencia)),
                el("td", { class: "num" }, formatoNumero(p.stock)),
                el("td", { class: "num" }, formatoNumero(p.minStock)),
                el("td", { class: "num sugerido" }, formatoNumero(Math.max(1, p.minStock * 2 - p.stock))))))),
            lista.length > 6
              ? el("button", { type: "button", class: "boton boton-fantasma boton-pequeno", style: { marginTop: "6px" },
                  onclick: () => irAlInventario({ proveedor: idProveedor, estado: "reabastecer" }, "stock-asc") }, `Ver los ${lista.length}`)
              : null);
        })
    : [estadoVacio({ titulo: "Todo en orden", mensaje: "No hay productos por reabastecer." })];

  return el("div", { class: "tarjeta tarjeta-relleno" },
    el("div", { class: "panel-titulo" }, el("h2", { style: { fontSize: "16px" } }, "Requiere reabastecimiento"),
      el("span", { class: "chip chip-alerta" }, `${pendientes.length} productos`)),
    contenido);
}

function panelMovimientos() {
  const ultimos = obtenerHistorialGlobal().slice(0, 5);
  return el("div", { class: "tarjeta tarjeta-relleno" },
    el("div", { class: "panel-titulo" }, el("h2", { style: { fontSize: "16px" } }, "Últimos movimientos")),
    ultimos.length
      ? el("div", { class: "lista-movimientos" }, ultimos.map(e => {
          const fila = filaHistorial(e);
          if (e.nombreProducto && !e.descripcion.includes(e.nombreProducto)) {
            fila.lastChild.prepend(el("div", { class: "mayus-pequena texto-suave" }, `${e.referencia} · ${e.nombreProducto}`));
          }
          return fila;
        }))
      : el("p", { class: "texto-suave" }, "Aún no hay movimientos. Los cambios que hagas en el inventario aparecerán aquí."));
}

function irAlInventario(nuevosFiltros = {}, nuevoOrden = null) {
  filtros = { ...FILTROS_INICIALES, ...nuevosFiltros };
  if (nuevoOrden) orden = nuevoOrden;
  sincronizarControles();
  pintarOpcionesFiltros();
  pintarInventario();
  navegar("catalogo");
  window.scrollTo({ top: 0 });
}

// =========================================================
// Inventario
// =========================================================

const lista = crearListaPaginada({
  contenedor: dom.lista,
  botonMas: dom.cargarMas,
  crearTarjeta: (p, i) => crearTarjetaProducto(p, { rol: "admin", indice: i }),
  vacio: () => estadoVacio({
    titulo: "Sin resultados",
    mensaje: "Ningún producto coincide con la búsqueda o los filtros.",
    linea: filtros.linea === "Moto" ? "Moto" : "Bicicleta",
    accion: el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: limpiarFiltros }, "Limpiar filtros")
  })
});

function pintarInventario() {
  const resultado = ordenarProductos(filtrarProductos(obtenerProductos(), filtros), orden);
  dom.contador.textContent = `${formatoNumero(resultado.length)} de ${formatoNumero(obtenerProductos().length)} productos`;
  lista.mostrar(resultado);
  const meta = obtenerMeta();
  $("#resumen-origen").textContent = meta.fechaCarga
    ? `Cargado desde ${meta.archivo ?? "Excel"} · ${fechaLarga(meta.fechaCarga)} · Los cambios se guardan en este navegador.`
    : "Los cambios se guardan en este navegador.";
}

function pintarOpcionesFiltros() {
  const productos = obtenerProductos();
  const base = filtros.linea === "Todas" ? productos : productos.filter(p => p.linea === filtros.linea);
  const textos = { categoria: "Todas las categorías", marca: "Todas las marcas", compatibilidad: "Cualquiera" };
  document.querySelectorAll("[data-opciones]").forEach(select => {
    const campoDato = select.dataset.opciones;
    const campoFiltro = select.dataset.filtro;
    const valores = valoresUnicos(base, campoDato);
    if (filtros[campoFiltro] && !valores.includes(filtros[campoFiltro])) filtros[campoFiltro] = "";
    select.replaceChildren(el("option", { value: "" }, textos[campoDato]), ...valores.map(v => el("option", { value: v }, v)));
    select.value = filtros[campoFiltro];
  });
  const selectProveedor = $("#filtro-proveedor");
  selectProveedor.replaceChildren(el("option", { value: "" }, "Todos los proveedores"),
    ...obtenerProveedores().map(p => el("option", { value: p.id }, p.nombre)),
    el("option", { value: SIN_PROVEEDOR }, "Sin proveedor"));
  selectProveedor.value = filtros.proveedor;
}

function sincronizarControles() {
  dom.buscarTexto.value = filtros.texto;
  dom.buscarReferencia.value = filtros.referencia;
  dom.orden.value = orden;
  marcarSegmentado($("#filtro-linea"), filtros.linea);
  marcarSegmentado($("#filtro-existencia"), filtros.existencia);
  document.querySelectorAll("[data-filtro]").forEach(s => { s.value = filtros[s.dataset.filtro] ?? ""; });
}

function marcarSegmentado(grupo, valor) {
  grupo.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.valor === valor)));
}

function limpiarFiltros() {
  filtros = { ...FILTROS_INICIALES };
  sincronizarControles();
  pintarOpcionesFiltros();
  pintarInventario();
}

/** Indicador de espacio usado en localStorage */
function pintarEspacio() {
  const { usados, limite, porcentaje } = espacioUsado();
  const indicador = $("#indicador-espacio");
  indicador.querySelector(".barra-espacio span").style.width = `${porcentaje}%`;
  indicador.querySelector(".barra-espacio").setAttribute("aria-valuenow", Math.round(porcentaje));
  indicador.querySelector(".texto-espacio").textContent =
    `${(usados / 1024 / 1024).toFixed(1).replace(".", ",")} de ${(limite / 1024 / 1024).toFixed(0)} MB`;
  indicador.classList.toggle("alto", porcentaje >= 70 && porcentaje < 90);
  indicador.classList.toggle("critico", porcentaje >= 90);
  return porcentaje;
}

function avisarEspacio() {
  const porcentaje = pintarEspacio();
  if (porcentaje >= 85) toast(`El almacenamiento del navegador está al ${Math.round(porcentaje)} %. Usa imágenes más livianas o quita algunas.`, "advertencia", 6000);
}

/** Reemplaza una tarjeta por su versión actualizada, conservando si estaba abierta */
function refrescarTarjeta(id) {
  const vieja = dom.lista.querySelector(`.tarjeta-producto[data-id="${CSS.escape(id)}"]`);
  if (!vieja) return;
  const producto = obtenerProducto(id);
  if (!producto) { vieja.remove(); return; }
  const nueva = crearTarjetaProducto(producto, { rol: "admin" });
  nueva.classList.remove("aparecer");
  const estabaAbierta = vieja.classList.contains("abierta");
  vieja.replaceWith(nueva);
  if (estabaAbierta) {
    const panel = nueva.querySelector(".tp-detalle");
    panel.style.transition = "none";
    controlLista.alternar(nueva, true);
    requestAnimationFrame(() => { panel.style.transition = ""; });
  }
}

/** Ejecuta un cambio y avisa del error sin romper la página */
function intentar(accion, mensajeExito) {
  try {
    const resultado = accion();
    if (mensajeExito) toast(mensajeExito, "exito");
    return resultado ?? true;
  } catch (error) {
    console.error(error);
    toast(error.message || "No se pudo completar la acción.", "error");
    return null;
  }
}

// =========================================================
// Acciones de las tarjetas
// =========================================================

async function manejarAccion(accion, id, boton, tarjeta) {
  const producto = obtenerProducto(id);
  if (!producto) return;
  switch (accion) {
    case "editar": return abrirFormularioProducto(producto);
    case "qr": return abrirQRProducto(producto);
    case "stock": return abrirAjusteStock(producto);
    case "editar-precio": return editarPrecioEnLinea(producto, boton, tarjeta);
    case "destacar":
      if (intentar(() => actualizarProducto(id, { destacado: !producto.destacado }, admin),
        producto.destacado ? "Quitado de destacados." : "Marcado como destacado.")) refrescarTarjeta(id);
      return;
    case "visibilidad":
      if (intentar(() => actualizarProducto(id, { visibleCatalogo: !producto.visibleCatalogo }, admin),
        producto.visibleCatalogo ? "Oculto del catálogo público." : "Visible en el catálogo público.")) refrescarTarjeta(id);
      return;
    case "eliminar": {
      const ok = await confirmar({
        titulo: "Eliminar producto",
        mensaje: `Se eliminará "${producto.nombre}" (${producto.referencia}). Esta acción no se puede deshacer.`,
        aceptar: "Eliminar", peligro: true
      });
      if (ok && intentar(() => eliminarProducto(id, admin), "Producto eliminado.")) {
        tarjeta.remove();
        pintarEspacio();
        dom.contador.textContent = `${formatoNumero(filtrarProductos(obtenerProductos(), filtros).length)} de ${formatoNumero(obtenerProductos().length)} productos`;
      }
      return;
    }
    case "agregar": {
      const cantidad = Math.max(1, Math.round(Number(tarjeta.querySelector(".cantidad-valor")?.value) || 1));
      if (agregarAlCarrito(id, cantidad)) {
        const entrada = tarjeta.querySelector(".cantidad-valor");
        if (entrada) entrada.value = 1;
      }
      return;
    }
    case "ver-proveedor":
      return abrirFichaProveedor(boton.dataset.destino);
    case "ir-producto": {
      irAlInventario({ referencia: producto.referencia });
      requestAnimationFrame(() => { lista.asegurar(id); enfocarTarjeta(dom.lista, id, controlLista); });
      return;
    }
  }
}

/** Texto de la vista previa: "Precio final: $1.300 (IVA incluido, redondeado)" o "(sin IVA, redondeado)" */
function textoPrecioFinal(base, aplicaIva) {
  const final = precioFinal({ precioPublicoBase: base, aplicaIva }, "publico");
  return final ? `Precio final: ${formatoCOP(final)} (${aplicaIva ? TEXTO_IVA_INCLUIDO : "sin IVA"}, redondeado)` : "Precio final: —";
}

/** Margen que deja una base: sobre el precio final redondeado sin IVA */
const margenDeBase = (base, aplicaIva, costo) => calcularMargen(precioSinIva({ precioPublicoBase: base, aplicaIva }, "publico"), costo);

/**
 * Edición rápida del precio al público: se escribe el precio BASE (sin IVA) y se ve el final.
 * Enter guarda, Esc cancela, el margen (sobre el final redondeado sin IVA) se actualiza al instante.
 */
function editarPrecioEnLinea(producto, span, tarjeta) {
  const celda = span.closest(".precio-celda");
  const margenCelda = tarjeta.querySelector(".margen-celda");
  const entrada = el("input", {
    type: "number", min: 1, step: "any", class: "entrada precio-editor",
    value: producto.precioPublicoBase ?? precioSugerido(producto.costo, producto.categoria) ?? "",
    "aria-label": `Nuevo precio base al público (sin IVA) de ${producto.nombre}`
  });
  const vista = el("div", { class: "precio-editor-margen", "aria-live": "polite" });
  const ayuda = el("div", { class: "precio-editor-margen" }, "Precio base sin IVA · Enter guarda · Esc cancela");
  celda.replaceChildren(entrada, vista, ayuda);
  entrada.focus();
  entrada.select();

  const actualizarMargen = () => {
    const valor = aNumero(entrada.value);
    margenCelda.replaceChildren(chipMargen(margenDeBase(valor, producto.aplicaIva, producto.costo), margenMinimoPara(producto.categoria)));
    vista.textContent = textoPrecioFinal(valor, producto.aplicaIva);
  };
  actualizarMargen();

  let terminado = false;
  const cancelar = () => { if (terminado) return; terminado = true; refrescarTarjeta(producto.id); };
  const guardar = () => {
    const valor = aNumero(entrada.value);
    if (!valor || valor <= 0) { toast("El precio debe ser mayor que 0.", "error"); entrada.focus(); return; }
    terminado = true;
    if (valor === producto.precioPublicoBase) { refrescarTarjeta(producto.id); return; }
    if (producto.costo !== null && valor < producto.costo) toast("Ojo: el precio quedó por debajo del costo.", "advertencia");
    intentar(() => actualizarProducto(producto.id, { precioPublicoBase: valor }, admin),
      `Precio al público actualizado: ${formatoCOP(precioFinal({ ...producto, precioPublicoBase: valor }, "publico"))}${producto.aplicaIva ? ` (${TEXTO_IVA_INCLUIDO})` : ""}.`);
    refrescarTarjeta(producto.id);
  };
  entrada.addEventListener("input", actualizarMargen);
  entrada.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); guardar(); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelar(); }
  });
  entrada.addEventListener("blur", () => setTimeout(cancelar, 120));
}

// =========================================================
// Ajuste rápido de stock
// =========================================================

const MOTIVOS = {
  sumar: ["Entrada", "Ajuste"],
  restar: ["Venta", "Daño", "Uso en taller", "Ajuste"]
};

function abrirAjusteStock(producto) {
  const radio = (valor, texto, marcado) => el("label", {},
    el("input", { type: "radio", name: "direccion", value: valor, checked: marcado }), texto);
  const direccion = el("div", { class: "opciones-movimiento", role: "radiogroup", "aria-label": "Tipo de movimiento" },
    radio("sumar", "+ Sumar", true), radio("restar", "− Restar", false));
  const cantidad = el("input", { type: "number", id: "ajuste-cantidad", class: "entrada", min: 0.01, step: "any", value: 1, required: true });
  const motivo = el("select", { id: "ajuste-motivo", class: "entrada" });
  const nota = el("input", { type: "text", id: "ajuste-nota", class: "entrada", maxLength: 120, placeholder: "Opcional" });
  // Productos con serial: al ingresar unidades se piden sus seriales
  const serialesNuevos = el("textarea", { class: "entrada", id: "ajuste-seriales", rows: 3, placeholder: "Un serial por línea" });
  const campoSeriales = producto.manejaSerial
    ? el("div", { class: "campo ancho-completo" },
        el("label", { for: "ajuste-seriales" }, "Seriales de las unidades nuevas"), serialesNuevos,
        el("p", { class: "campo-ayuda" }, "Uno por unidad. Si los dejas vacíos, podrás registrarlos después en Seriales y Garantías."))
    : null;
  const vista = el("p", { class: "vista-previa-stock" });
  const error = el("p", { class: "campo-error", role: "alert" });

  const sentido = () => direccion.querySelector("input:checked").value;
  const pintarMotivos = () => {
    motivo.replaceChildren(...MOTIVOS[sentido()].map(m => el("option", { value: m }, m)));
  };
  const actualizarVista = () => {
    const n = Math.round((aNumero(cantidad.value) || 0) * 100) / 100;
    const nuevo = producto.stock + (sentido() === "sumar" ? n : -n);
    vista.replaceChildren("Stock: ", el("strong", {}, formatoNumero(producto.stock)), " → ",
      el("strong", { style: { color: nuevo < 0 ? "var(--peligro)" : "inherit" } }, formatoNumero(nuevo)), " und");
  };
  direccion.addEventListener("change", () => {
    pintarMotivos();
    actualizarVista();
    if (campoSeriales) campoSeriales.hidden = sentido() !== "sumar";
  });
  cantidad.addEventListener("input", actualizarVista);
  pintarMotivos();
  actualizarVista();

  const contenido = el("form", { novalidate: true, onsubmit: e => { e.preventDefault(); modal.pie.querySelector(".boton-acento").click(); } },
    el("p", { style: { fontWeight: 700, marginBottom: "14px" } }, `${producto.nombre} · ${producto.referencia}`),
    direccion,
    el("div", { class: "form-grilla", style: { marginTop: "14px" } },
      el("div", { class: "campo" }, el("label", { for: "ajuste-cantidad" }, "Cantidad"), cantidad),
      el("div", { class: "campo" }, el("label", { for: "ajuste-motivo" }, "Motivo"), motivo),
      el("div", { class: "campo ancho-completo" }, el("label", { for: "ajuste-nota" }, "Nota"), nota),
      campoSeriales),
    vista, error);

  const modal = abrirModal({
    titulo: "Ajustar stock",
    contenido,
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      {
        texto: "Guardar", clase: "boton-acento",
        alHacerClic: () => {
          const n = Math.round((aNumero(cantidad.value) || 0) * 100) / 100;
          if (n <= 0) { error.textContent = "La cantidad debe ser mayor que 0."; cantidad.focus(); return false; }
          const delta = sentido() === "sumar" ? n : -n;
          if (producto.stock + delta < 0) { error.textContent = `No puedes restar más de ${producto.stock} unidades.`; return false; }
          const listaSeriales = campoSeriales && delta > 0 ? serialesNuevos.value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean) : [];
          if (listaSeriales.length && listaSeriales.length !== n) {
            error.textContent = `Escribiste ${listaSeriales.length} seriales para ${formatoNumero(n)} unidades. Deben coincidir (o déjalos vacíos).`;
            return false;
          }
          if (listaSeriales.length) {
            // Primero se validan y registran los seriales (evita duplicados), luego se suma el stock
            try { registrarSeriales(producto.id, listaSeriales, admin); }
            catch (e) { error.textContent = e.message; return false; }
          }
          const ok = intentar(() => ajustarStock(producto.id, delta, motivo.value, admin, nota.value.trim()),
            `Stock actualizado: ${formatoNumero(producto.stock)} → ${formatoNumero(producto.stock + delta)} und.`);
          if (!ok) return false;
          if (campoSeriales && delta > 0 && !listaSeriales.length) {
            toast(`Quedaron ${formatoNumero(n)} unidades sin serial registrado.`, "advertencia", 5000);
          }
          refrescarTarjeta(producto.id);
        }
      }
    ]
  });
}

// =========================================================
// Formulario de producto (crear / editar)
// =========================================================

function abrirFormularioProducto(producto = null, inicial = {}) {
  const editandoId = producto?.id ?? null;
  const productos = obtenerProductos();
  const p = producto ?? {
    referencia: siguienteReferencia(), linea: "Bicicleta", minStock: VALORES_POR_DEFECTO.minStock,
    stock: 0, visibleCatalogo: true, compatibilidad: [], proveedorId: "", garantiaMeses: 0, ...inicial
  };
  let imagenActual = p.imagen ?? null;

  // Listas de sugerencias con valores ya usados
  const datalist = (id, campo) => el("datalist", { id }, valoresUnicos(productos, campo).map(v => el("option", { value: v })));
  const errores = {};
  const campo = (nombre, etiqueta, control, { ancho = false, ayuda = null } = {}) => {
    errores[nombre] = el("p", { class: "campo-error", id: `error-${nombre}` });
    control.id = `campo-${nombre}`;
    control.setAttribute("aria-describedby", `error-${nombre}`);
    return el("div", { class: `campo ${ancho ? "ancho-completo" : ""}` },
      el("label", { for: control.id }, etiqueta), control, ayuda, errores[nombre]);
  };
  const entrada = (props) => el("input", { class: "entrada", ...props });

  const c = {
    nombre: entrada({ type: "text", value: p.nombre ?? "", required: true, maxLength: 160 }),
    referencia: entrada({ type: "text", value: p.referencia ?? "", required: true, maxLength: 40 }),
    linea: el("select", { class: "entrada" }, ["Bicicleta", "Moto"].map(l => el("option", { value: l, selected: p.linea === l }, l))),
    categoria: entrada({ type: "text", value: p.categoria ?? "", list: "lista-categorias" }),
    marca: entrada({ type: "text", value: p.marca ?? "", list: "lista-marcas" }),
    proveedor: el("select", { class: "entrada", required: true },
      el("option", { value: "" }, "Elige un proveedor"),
      obtenerProveedores().map(pr => el("option", { value: pr.id, selected: p.proveedorId === pr.id }, pr.nombre))),
    color: entrada({ type: "text", value: p.color && p.color !== "Sin color" ? p.color : "", list: "lista-colores" }),
    talla: entrada({ type: "text", value: p.talla && p.talla !== "Sin talla" ? p.talla : "", list: "lista-tallas" }),
    descripcion: el("textarea", { class: "entrada", rows: 3, maxLength: 1000 }),
    costo: entrada({ type: "number", min: 0, step: 1, value: p.costo ?? "", inputMode: "numeric" }),
    // Se escriben los precios BASE (sin IVA); el final se ve al lado
    precioMayorBase: entrada({ type: "number", min: 1, step: "any", value: p.precioMayorBase ?? "", inputMode: "decimal" }),
    precioPublicoBase: entrada({ type: "number", min: 1, step: "any", value: p.precioPublicoBase ?? "", required: true, inputMode: "decimal" }),
    aplicaIva: el("input", { type: "checkbox", role: "switch", checked: typeof p.aplicaIva === "boolean" ? p.aplicaIva : ivaPorCategoria(p.categoria) }),
    stock: entrada({ type: "number", min: 0, step: "any", value: p.stock ?? 0 }),
    minStock: entrada({ type: "number", min: 0, step: 1, value: p.minStock ?? VALORES_POR_DEFECTO.minStock }),
    garantiaMeses: entrada({ type: "number", min: 0, step: 1, value: p.garantiaMeses ?? 0 }),
    manejaSerial: el("input", { type: "checkbox", checked: Boolean(p.manejaSerial) }),
    destacado: el("input", { type: "checkbox", checked: Boolean(p.destacado) }),
    visibleCatalogo: el("input", { type: "checkbox", checked: p.visibleCatalogo !== false })
  };
  c.descripcion.value = p.descripcion ?? "";
  // Si el producto tiene "Sin proveedor", se obliga a elegir uno
  if (!p.proveedorId || p.proveedorId === SIN_PROVEEDOR) c.proveedor.value = "";

  // Vista previa en vivo del precio final de cada campo según el interruptor de IVA
  const vistaMayor = el("p", { class: "precio-final-vista", "aria-live": "polite" });
  const vistaPublico = el("p", { class: "precio-final-vista", "aria-live": "polite" });
  const pintarVistas = () => {
    vistaMayor.textContent = textoPrecioFinal(aNumero(c.precioMayorBase.value), c.aplicaIva.checked);
    vistaPublico.textContent = textoPrecioFinal(aNumero(c.precioPublicoBase.value), c.aplicaIva.checked);
  };

  // El interruptor arranca según la categoría; si el administrador lo cambia a mano, la categoría ya no lo mueve
  let ivaTocado = Boolean(producto) && typeof p.aplicaIva === "boolean" && p.aplicaIva !== ivaPorCategoria(p.categoria);
  c.aplicaIva.addEventListener("change", () => { ivaTocado = true; pintarSugerencia(); pintarCalculadora(); });
  const interruptorIva = el("label", { class: "interruptor" },
    c.aplicaIva, el("span", { class: "pista", "aria-hidden": "true" }), `Lleva IVA ${PORCENTAJE_IVA} %`);

  // Los dos precios salen solos del costo; se muestra la regla aplicada y el margen en vivo
  const sugerencia = el("div", { class: "sugerencia-precio", "aria-live": "polite" });
  const aplicarPreciosDelCosto = () => {
    const { precioPublicoBase, precioMayorBase } = preciosDesdeCosto(aNumero(c.costo.value), c.categoria.value.trim());
    c.precioPublicoBase.value = precioPublicoBase ?? "";
    c.precioMayorBase.value = precioMayorBase ?? "";
  };
  const pintarSugerencia = () => {
    const costo = aNumero(c.costo.value);
    const precio = aNumero(c.precioPublicoBase.value);
    // Margen sobre el precio final redondeado sin IVA: el IVA no es ganancia del negocio
    const margen = margenDeBase(precio, c.aplicaIva.checked, costo);
    const ganancias = gananciasPara(c.categoria.value.trim());
    const calculados = preciosDesdeCosto(costo, c.categoria.value.trim());
    const partes = [];
    if (calculados.precioPublicoBase) {
      partes.push(el("span", {}, `Calculado sobre el costo: al por mayor +${ganancias.mayorista} % · al público +${ganancias.publico} %`));
      if (calculados.precioPublicoBase !== precio || calculados.precioMayorBase !== aNumero(c.precioMayorBase.value)) {
        partes.push(el("button", { type: "button", onclick: () => { aplicarPreciosDelCosto(); pintarSugerencia(); } }, "Recalcular"));
      }
    }
    if (margen !== null) partes.push(chipMargen(margen, margenMinimoPara(c.categoria.value.trim())));
    sugerencia.replaceChildren(...partes);
    pintarVistas();
  };

  // Calculadora: costo + margen deseado → precio base tal que el final (con IVA si aplica) quede en centena exacta
  const calcMargen = el("input", { type: "number", id: "calc-margen", class: "entrada", min: 0, max: 95, step: 0.5,
    value: margenMinimoPara(p.categoria), "aria-describedby": "calc-resultado" });
  const calcResultado = el("strong", { id: "calc-resultado", class: "numero" }, "—");
  const calcFinal = el("span", { class: "precio-final-vista", id: "calc-final" });
  const calcAplicar = el("button", { type: "button", class: "boton boton-secundario boton-pequeno", id: "calc-aplicar" }, "Usar este precio");
  function pintarCalculadora() {
    const sugerido = precioParaMargen(aNumero(c.costo.value), aNumero(calcMargen.value), c.aplicaIva.checked);
    calcResultado.textContent = sugerido ? formatoCOP(sugerido.base) : "Escribe el costo";
    calcFinal.textContent = sugerido ? textoPrecioFinal(sugerido.base, c.aplicaIva.checked) : "";
    calcAplicar.disabled = !sugerido;
    calcAplicar.dataset.precio = sugerido?.base ?? "";
  }
  calcAplicar.addEventListener("click", () => {
    c.precioPublicoBase.value = calcAplicar.dataset.precio;
    pintarSugerencia();
  });
  calcMargen.addEventListener("input", pintarCalculadora);
  c.costo.addEventListener("input", pintarCalculadora);
  const calculadora = el("div", { class: "calculadora ancho-completo" },
    el("div", {}, el("span", { class: "etiqueta" }, "Calculadora de precio"),
      el("p", { class: "campo-ayuda" }, "Para un precio al público distinto: precio sin IVA = costo ÷ (1 − margen). Se sugiere la base que deja el precio final en una centena exacta. El margen se calcula sin IVA.")),
    el("div", { class: "campo" }, el("label", { for: "calc-margen" }, "Margen deseado (%)"), calcMargen),
    el("div", { class: "calculadora-resultado" }, el("span", { class: "etiqueta" }, "Precio base sugerido (sin IVA)"), calcResultado, calcFinal),
    calcAplicar);
  pintarCalculadora();

  // Compatibilidad como etiquetas, con sugerencias de las ya usadas
  const etiquetasCompat = crearCampoEtiquetas({
    id: "campo-compatibilidad",
    valores: p.compatibilidad || [],
    sugerencias: valoresUnicos(productos, "compatibilidad"),
    placeholder: "Ej: Rin 29, Shimano 9V… y Enter"
  });
  // Al escribir el costo (o cambiar la categoría) la página calcula los dos precios
  c.costo.addEventListener("input", () => { aplicarPreciosDelCosto(); pintarSugerencia(); });
  c.categoria.addEventListener("change", () => {
    if (!ivaTocado) c.aplicaIva.checked = ivaPorCategoria(c.categoria.value.trim());
    if (aNumero(c.costo.value)) aplicarPreciosDelCosto();
    pintarSugerencia();
    pintarCalculadora();
  });
  c.precioPublicoBase.addEventListener("input", pintarSugerencia);
  c.precioMayorBase.addEventListener("input", pintarSugerencia);
  pintarSugerencia();

  // La línea Moto sugiere categoría "Repuestos moto" en productos nuevos
  const uploader = crearUploader({
    max: 1, iniciales: imagenActual ? [imagenActual] : [],
    onChange: lista => { imagenActual = lista[0] ?? null; }
  });

  const casilla = (control, texto) => el("label", { class: "casilla" }, control, texto);
  const formulario = el("form", { class: "form-grilla", novalidate: true, id: "form-producto" },
    el("p", { class: "form-grupo-titulo" }, "Datos del producto"),
    campo("nombre", "Nombre *", c.nombre, { ancho: true }),
    campo("referencia", "Referencia *", c.referencia),
    campo("proveedor", "Proveedor *", c.proveedor),
    campo("linea", "Línea", c.linea),
    campo("categoria", "Categoría", c.categoria),
    campo("marca", "Marca", c.marca),
    campo("color", "Color", c.color),
    campo("talla", "Talla", c.talla),
    campo("garantiaMeses", "Garantía (meses)", c.garantiaMeses),
    campo("descripcion", "Descripción", c.descripcion, { ancho: true }),

    el("p", { class: "form-grupo-titulo" }, "Precio e inventario"),
    campo("costo", "Costo unitario", c.costo, { ayuda: el("p", { class: "campo-ayuda" }, "Al escribirlo se calculan los dos precios base.") }),
    el("div", { class: "campo" }, el("span", { class: "etiqueta" }, "IVA"), interruptorIva,
      el("p", { class: "campo-ayuda" }, "Repuestos y accesorios sí; bicicletas completas no.")),
    campo("precioMayorBase", "Precio al por mayor (sin IVA)", c.precioMayorBase, { ayuda: vistaMayor }),
    campo("precioPublicoBase", "Precio al público (sin IVA) *", c.precioPublicoBase, { ayuda: vistaPublico }),
    el("div", { class: "ancho-completo" }, sugerencia),
    calculadora,
    campo("stock", "Stock", c.stock),
    campo("minStock", "Stock mínimo", c.minStock),

    el("p", { class: "form-grupo-titulo" }, "Compatibilidad y opciones"),
    el("div", { class: "campo ancho-completo" },
      el("label", { for: "campo-compatibilidad" }, "Compatibilidad"), etiquetasCompat.elemento,
      el("p", { class: "campo-ayuda" }, "Escribe una etiqueta y pulsa Enter o coma. Clic en × para quitarla.")),
    el("div", { class: "casillas-fila ancho-completo" },
      casilla(c.visibleCatalogo, "Visible en el catálogo"),
      casilla(c.destacado, "Destacado"),
      casilla(c.manejaSerial, "Maneja serial")),

    el("p", { class: "form-grupo-titulo" }, "Imagen"),
    el("div", { class: "ancho-completo" }, uploader.elemento),

    datalist("lista-categorias", "categoria"), datalist("lista-marcas", "marca"),
    datalist("lista-colores", "color"), datalist("lista-tallas", "talla"));

  formulario.addEventListener("submit", e => { e.preventDefault(); guardar(); });

  const modal = abrirModal({
    titulo: editandoId ? "Editar producto" : "Nuevo producto",
    contenido: formulario,
    ancho: true,
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      { texto: editandoId ? "Guardar cambios" : "Crear producto", clase: "boton-acento", alHacerClic: () => guardar() }
    ]
  });

  /** Valida, pide confirmación si el precio es menor que el costo y guarda */
  async function guardar() {
    Object.values(errores).forEach(e => { e.textContent = ""; });
    Object.values(c).forEach(control => control.removeAttribute?.("aria-invalid"));
    const marcarError = (nombre, texto) => {
      errores[nombre].textContent = texto;
      c[nombre].setAttribute("aria-invalid", "true");
    };

    const datos = {
      nombre: c.nombre.value.trim(),
      referencia: c.referencia.value.trim(),
      linea: c.linea.value,
      categoria: c.categoria.value.trim(),
      marca: c.marca.value.trim(),
      proveedorId: c.proveedor.value,
      color: c.color.value.trim(),
      talla: c.talla.value.trim(),
      descripcion: c.descripcion.value.trim(),
      costo: c.costo.value === "" ? null : aNumero(c.costo.value),
      precioMayorBase: c.precioMayorBase.value === "" ? null : aNumero(c.precioMayorBase.value),
      precioPublicoBase: aNumero(c.precioPublicoBase.value),
      aplicaIva: c.aplicaIva.checked,
      stock: c.stock.value === "" ? 0 : aNumero(c.stock.value),
      minStock: c.minStock.value === "" ? 0 : aNumero(c.minStock.value),
      compatibilidad: etiquetasCompat.obtener(),
      garantiaMeses: aNumero(c.garantiaMeses.value) ?? 0,
      manejaSerial: c.manejaSerial.checked,
      destacado: c.destacado.checked,
      visibleCatalogo: c.visibleCatalogo.checked,
      imagen: imagenActual
    };

    if (!datos.nombre) marcarError("nombre", "El nombre es obligatorio.");
    if (!datos.referencia) marcarError("referencia", "La referencia es obligatoria.");
    else if (existeReferencia(datos.referencia, editandoId)) marcarError("referencia", "Ya existe un producto con esta referencia.");
    if (!datos.proveedorId) marcarError("proveedor", "Elige un proveedor.");
    if (datos.precioMayorBase !== null && !(datos.precioMayorBase > 0)) marcarError("precioMayorBase", "El precio al por mayor debe ser mayor que 0.");
    if (!datos.precioPublicoBase || datos.precioPublicoBase <= 0) marcarError("precioPublicoBase", "El precio debe ser mayor que 0.");
    if (datos.costo !== null && (Number.isNaN(datos.costo) || datos.costo < 0)) marcarError("costo", "El costo no puede ser negativo.");
    if (datos.stock === null || datos.stock < 0) marcarError("stock", "El stock debe ser mayor o igual a 0.");
    if (datos.minStock === null || datos.minStock < 0 || !Number.isInteger(datos.minStock)) marcarError("minStock", "El stock mínimo debe ser un número entero mayor o igual a 0.");
    if (datos.garantiaMeses < 0) marcarError("garantiaMeses", "La garantía no puede ser negativa.");

    const primerError = Object.entries(errores).find(([, e]) => e.textContent);
    if (primerError) {
      c[primerError[0]].focus();
      toast("Revisa los campos marcados.", "error");
      return false;
    }

    // Aviso (no bloqueo) si el precio base es menor que el costo
    if (datos.costo !== null && datos.precioPublicoBase < datos.costo) {
      const seguir = await confirmar({
        titulo: "Precio por debajo del costo",
        mensaje: `El precio base al público (${formatoCOP(datos.precioPublicoBase)}, sin IVA) es menor que el costo (${formatoCOP(datos.costo)}). ¿Guardar de todas formas?`,
        aceptar: "Guardar igual"
      });
      if (!seguir) return false;
    }

    if (editandoId) {
      const ok = intentar(() => actualizarProducto(editandoId, datos, admin, { motivoStock: "Ajuste (edición)" }), "Producto actualizado.");
      if (!ok) return false;
      refrescarTarjeta(editandoId);
      pintarOpcionesFiltros();
    } else {
      const nuevo = intentar(() => crearProducto(datos, admin), `Producto "${datos.nombre}" creado.`);
      if (!nuevo) return false;
      // Se muestra el producto recién creado
      irAlInventario({ referencia: nuevo.referencia });
      requestAnimationFrame(() => enfocarTarjeta(dom.lista, nuevo.id, controlLista));
    }
    if (datos.imagen) avisarEspacio(); else pintarEspacio();
    modal.cerrar();
    return false;
  }
}

// =========================================================
// Catálogo público: archivo que se sube a data/catalogo.json en GitHub
// =========================================================

function exportarCatalogoPublico() {
  const catalogo = generarCatalogoPublico();
  // Doble verificación: el archivo público nunca lleva precios ni costos
  const texto = JSON.stringify(catalogo);
  if (/"(precioPublicoBase|precioMayorBase|aplicaIva|precio|precioMayorista|costo|proveedorId|stock|minStock|historial)"\s*:/.test(texto)) {
    toast("El catálogo público contiene datos internos; no se exportó.", "error");
    return;
  }
  const url = URL.createObjectURL(new Blob([texto], { type: "application/json" }));
  const enlace = el("a", { href: url, download: "catalogo.json" });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  abrirModal({
    titulo: "Catálogo público exportado",
    contenido: el("div", {},
      el("p", {}, `Se descargó catalogo.json con ${formatoNumero(catalogo.total)} productos visibles, sin precios, costos ni cantidades.`),
      el("ol", { class: "pasos-publicar" },
        el("li", {}, "Abre el repositorio del sitio en GitHub y entra a la carpeta data."),
        el("li", {}, "Pulsa “Add file” → “Upload files” y arrastra el catalogo.json descargado (reemplaza al anterior)."),
        el("li", {}, "Pulsa “Commit changes”. En uno o dos minutos los clientes verán el catálogo actualizado."))),
    acciones: [{ texto: "Entendido", clase: "boton-acento" }]
  });
}

// =========================================================
// Recargar y exportar Excel
// =========================================================

async function recargarExcel() {
  const entradaArchivo = el("input", { type: "file", accept: ".xlsx,.xls", class: "solo-lector", id: "archivo-recarga" });
  let archivoElegido = null;
  const nombreArchivo = el("p", { class: "texto-suave", style: { fontSize: "13px", marginTop: "8px" } }, `Se leerá ${RUTA_EXCEL}.`);
  entradaArchivo.addEventListener("change", () => {
    archivoElegido = entradaArchivo.files[0] ?? null;
    nombreArchivo.textContent = archivoElegido ? `Se leerá el archivo "${archivoElegido.name}".` : `Se leerá ${RUTA_EXCEL}.`;
  });
  abrirModal({
    titulo: "Recargar desde Excel",
    contenido: el("div", {},
      el("div", { class: "aviso aviso-alerta" }, icono("alerta"),
        el("p", {}, "Los productos se reemplazarán con los del Excel. Se conservan las imágenes y el historial de los productos con la misma referencia; los productos creados a mano que no estén en el Excel se perderán. Exporta primero si quieres una copia.")),
      el("div", { style: { marginTop: "14px" } },
        el("label", { for: "archivo-recarga", class: "boton boton-secundario boton-pequeno", tabindex: "0", role: "button" }, icono("subir"), "Usar otro archivo…"),
        entradaArchivo, nombreArchivo)),
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      {
        texto: "Recargar", clase: "boton-acento",
        alHacerClic: async () => {
          try {
            const { total, advertencias } = await recargarDesdeExcel(admin, archivoElegido);
            toast(`Inventario recargado: ${formatoNumero(total)} productos.`, "exito");
            if (advertencias.length) toast(`${advertencias.length} advertencias (ver consola).`, "advertencia");
            limpiarFiltros();
            pintarEspacio();
          } catch (error) {
            console.error(error);
            toast(error.message, "error", 7000);
            return false;
          }
        }
      }
    ]
  });
}

function exportar() {
  try {
    const total = exportarExcel();
    toast(`Excel exportado con ${formatoNumero(total)} productos.`, "exito");
  } catch (error) {
    console.error(error);
    toast(error.message, "error");
  }
}

// =========================================================
// Eventos
// =========================================================

function abrirPanelFiltros(abrir) {
  dom.sidebar.classList.toggle("abierto", abrir);
  dom.fondoPanel.classList.toggle("visible", abrir);
  $("#abrir-filtros").setAttribute("aria-expanded", String(abrir));
  if (abrir) $("#cerrar-filtros").focus();
}

function configurarEventos() {
  window.addEventListener("hashchange", () => navegar(location.hash.replace("#", "")));

  $("#nuevo-producto").addEventListener("click", () => abrirFormularioProducto());
  $("#recargar-excel").addEventListener("click", recargarExcel);
  $("#exportar-excel").addEventListener("click", exportar);
  $("#escanear-inventario").addEventListener("click", escanearInventario);
  $("#exportar-publico").addEventListener("click", exportarCatalogoPublico);
  $("#escaneo-rapido").addEventListener("click", escaneoRapido);
  $("#imprimir-etiquetas").addEventListener("click", () => {
    // Si hay un filtro activo con pocos productos, se proponen esos
    const filtrados = ordenarProductos(filtrarProductos(obtenerProductos(), filtros), orden);
    const hayFiltro = filtrados.length < obtenerProductos().length && filtrados.length <= 30;
    abrirImpresionEtiquetas({ productos: obtenerProductos(), seleccion: hayFiltro ? filtrados.map(producto => ({ producto, cantidad: 1 })) : [] });
  });
  iniciarBusquedaGlobal({
    buscar: buscarTodo, escanear: escanearInventario, boton: $("#boton-buscar"),
    placeholder: "Buscar productos, seriales, cotizaciones, órdenes, proveedores…"
  });

  const buscar = conRetraso(() => {
    filtros.texto = dom.buscarTexto.value;
    filtros.referencia = dom.buscarReferencia.value;
    pintarInventario();
  }, 220);
  dom.buscarTexto.addEventListener("input", buscar);
  dom.buscarReferencia.addEventListener("input", buscar);
  document.querySelectorAll(".buscadores-catalogo .lupa").forEach(b => b.addEventListener("click", buscar));

  $("#filtro-linea").addEventListener("click", e => {
    const b = e.target.closest("button[data-valor]");
    if (!b) return;
    filtros.linea = b.dataset.valor;
    marcarSegmentado($("#filtro-linea"), filtros.linea);
    pintarOpcionesFiltros();
    pintarInventario();
  });
  $("#filtro-existencia").addEventListener("click", e => {
    const b = e.target.closest("button[data-valor]");
    if (!b) return;
    filtros.existencia = b.dataset.valor;
    marcarSegmentado($("#filtro-existencia"), filtros.existencia);
    pintarInventario();
  });
  document.querySelectorAll("[data-filtro]").forEach(select =>
    select.addEventListener("change", () => { filtros[select.dataset.filtro] = select.value; pintarInventario(); }));
  dom.orden.addEventListener("change", () => { orden = dom.orden.value; pintarInventario(); });
  $("#limpiar-filtros").addEventListener("click", limpiarFiltros);

  $("#abrir-filtros").addEventListener("click", () => abrirPanelFiltros(true));
  $("#cerrar-filtros").addEventListener("click", () => abrirPanelFiltros(false));
  dom.fondoPanel.addEventListener("click", () => abrirPanelFiltros(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") abrirPanelFiltros(false); });

  controlLista = configurarListaProductos(dom.lista, {
    construirDetalle: id => construirDetalleProducto(obtenerProducto(id), {
      rol: "admin", lista: obtenerProductos(), nombreProveedor, extra: seccionQRProducto
    }),
    permitirVarias: () => dom.permitirVarias.checked,
    alAccion: manejarAccion
  });
}

// =========================================================
// Perfil: contraseña, márgenes, datos de la tienda y resumen
// =========================================================

function pintarPerfil() {
  const seccion = seccionDe("perfil");
  const config = obtenerConfiguracion();
  const tarjeta = (titulo, ...contenido) => el("section", { class: "tarjeta tarjeta-relleno perfil-bloque" }, el("h2", { style: { fontSize: "16px", marginBottom: "14px" } }, titulo), ...contenido);
  const campoTexto = (id, etiqueta, props = {}) => {
    const control = el("input", { class: "entrada", id, ...props });
    return [control, el("div", { class: "campo" }, el("label", { for: id }, etiqueta), control)];
  };

  // --- Cuenta y contraseña ---
  const [actual, campoActual] = campoTexto("perfil-actual", "Contraseña actual", { type: "password", autocomplete: "current-password" });
  const [nueva, campoNueva] = campoTexto("perfil-nueva", "Nueva contraseña", { type: "password", autocomplete: "new-password", minLength: 6 });
  const [repetir, campoRepetir] = campoTexto("perfil-repetir", "Repite la nueva contraseña", { type: "password", autocomplete: "new-password" });
  const errorClave = el("p", { class: "campo-error", role: "alert" });
  const formClave = el("form", { class: "form-grilla", novalidate: true },
    el("div", { class: "ancho-completo perfil-cuenta" },
      el("span", { class: "avatar" }, sesion.nombre.split(" ").map(x => x[0]).join("").slice(0, 2)),
      el("div", {}, el("strong", {}, sesion.nombre), el("p", { class: "texto-suave" }, `Usuario: ${sesion.usuario} · Administrador`))),
    el("div", { class: "ancho-completo" }, campoActual), campoNueva, campoRepetir,
    el("div", { class: "ancho-completo" }, errorClave,
      el("button", { type: "submit", class: "boton boton-primario" }, "Cambiar contraseña")));
  formClave.addEventListener("submit", async e => {
    e.preventDefault();
    errorClave.textContent = "";
    if (nueva.value !== repetir.value) { errorClave.textContent = "Las contraseñas nuevas no coinciden."; return; }
    const r = await cambiarContrasena(sesion.usuario, actual.value, nueva.value);
    if (!r.ok) { errorClave.textContent = r.error; return; }
    registrarMovimiento({ admin, tipo: "perfil", modulo: "perfil", descripcion: "Cambió su contraseña" });
    formClave.reset();
    toast("Contraseña actualizada.", "exito");
  });

  // --- Restablecer la contraseña de otro administrador ---
  const otros = USUARIOS.filter(u => u.usuario !== sesion.usuario);
  const elegido = el("select", { id: "reset-usuario", class: "entrada" }, otros.map(u => el("option", { value: u.usuario }, `${u.nombre} (${u.usuario})`)));
  const [nuevaOtro, campoNuevaOtro] = campoTexto("reset-nueva", "Nueva contraseña", { type: "password", autocomplete: "new-password", minLength: 6 });
  const [repetirOtro, campoRepetirOtro] = campoTexto("reset-repetir", "Repite la nueva contraseña", { type: "password", autocomplete: "new-password" });
  const errorOtro = el("p", { class: "campo-error", role: "alert" });
  const formOtro = el("form", { class: "form-grilla", novalidate: true },
    el("p", { class: "ancho-completo texto-suave" }, "Si otro administrador olvidó su contraseña, ponle una nueva aquí. No hace falta saber la anterior."),
    el("div", { class: "ancho-completo campo" }, el("label", { for: "reset-usuario" }, "Administrador"), elegido),
    campoNuevaOtro, campoRepetirOtro,
    el("div", { class: "ancho-completo" }, errorOtro,
      el("button", { type: "submit", class: "boton boton-primario" }, "Restablecer contraseña")));
  formOtro.addEventListener("submit", async e => {
    e.preventDefault();
    errorOtro.textContent = "";
    if (nuevaOtro.value !== repetirOtro.value) { errorOtro.textContent = "Las contraseñas nuevas no coinciden."; return; }
    const r = await restablecerContrasenaDe(elegido.value, nuevaOtro.value);
    if (!r.ok) { errorOtro.textContent = r.error; return; }
    const nombreOtro = otros.find(u => u.usuario === elegido.value)?.nombre ?? elegido.value;
    registrarMovimiento({ admin, tipo: "perfil", modulo: "perfil", descripcion: `Restableció la contraseña de ${nombreOtro}` });
    formOtro.reset();
    toast(`Contraseña de ${nombreOtro} restablecida.`, "exito");
  });

  // --- Márgenes mínimos ---
  const [general, campoGeneral] = campoTexto("margen-general", "Margen mínimo general (%)", { type: "number", min: 0, max: 95, step: 0.5, value: config.margenMinimo });
  const categorias = valoresUnicos(obtenerProductos(), "categoria");
  const entradasCategoria = new Map();
  const tablaCategorias = el("table", { class: "tabla-simple" },
    el("thead", {}, el("tr", {}, el("th", {}, "Categoría"), el("th", { class: "num" }, "Productos"), el("th", { class: "num" }, "Bajo el mínimo"), el("th", {}, "Margen mínimo (%)"))),
    el("tbody", {}, categorias.map(cat => {
      const productosCat = obtenerProductos().filter(p => p.categoria === cat);
      const entradaCat = el("input", {
        class: "entrada entrada-margen", type: "number", min: 0, max: 95, step: 0.5,
        value: config.margenPorCategoria[cat] ?? "", placeholder: `General (${config.margenMinimo})`, "aria-label": `Margen mínimo de ${cat}`
      });
      entradasCategoria.set(cat, entradaCat);
      return el("tr", {}, el("td", {}, cat), el("td", { class: "num" }, formatoNumero(productosCat.length)),
        el("td", { class: "num" }, formatoNumero(productosCat.filter(tieneMargenBajo).length)), el("td", {}, entradaCat));
    })));
  const guardarMargenes = el("button", { type: "button", class: "boton boton-acento", id: "guardar-margenes" }, "Guardar márgenes");
  guardarMargenes.addEventListener("click", () => {
    const valorGeneral = aNumero(general.value);
    if (valorGeneral === null || valorGeneral < 0 || valorGeneral >= 95) { toast("El margen general debe estar entre 0 y 95 %.", "error"); general.focus(); return; }
    const porCategoria = {};
    for (const [cat, entradaCat] of entradasCategoria) {
      if (entradaCat.value === "") continue;
      const v = aNumero(entradaCat.value);
      if (v === null || v < 0 || v >= 95) { toast(`El margen de "${cat}" debe estar entre 0 y 95 %.`, "error"); entradaCat.focus(); return; }
      porCategoria[cat] = v;
    }
    try {
      guardarConfiguracion({ margenMinimo: valorGeneral, margenPorCategoria: porCategoria });
      registrarMovimiento({ admin, tipo: "configuracion", modulo: "perfil", descripcion: "Cambió los márgenes mínimos",
        detalle: `General ${valorGeneral} %${Object.keys(porCategoria).length ? ` · ${Object.keys(porCategoria).length} categorías con margen propio` : ""}` });
      inventarioDesactualizado = true;
      toast("Márgenes guardados.", "exito");
      pintarPerfil();
    } catch (e) { toast(e.message, "error"); }
  });

  // --- Datos de la tienda (PDF) ---
  const camposTienda = [["nombre", "Nombre de la tienda"], ["nit", "NIT"], ["direccion", "Dirección"], ["ciudad", "Ciudad"], ["telefono", "Teléfono"], ["correo", "Correo"]];
  const entradasTienda = {};
  const formTienda = el("form", { class: "form-grilla", novalidate: true },
    camposTienda.map(([clave, etiqueta]) => {
      const [control, envoltura] = campoTexto(`tienda-${clave}`, etiqueta, { type: clave === "correo" ? "email" : "text", value: config.tienda[clave] ?? "", maxLength: 120 });
      entradasTienda[clave] = control;
      return envoltura;
    }),
    el("div", { class: "ancho-completo" }, el("button", { type: "submit", class: "boton boton-primario" }, "Guardar datos de la tienda")));
  formTienda.addEventListener("submit", e => {
    e.preventDefault();
    const tienda = Object.fromEntries(Object.entries(entradasTienda).map(([k, c]) => [k, c.value.trim()]));
    try {
      guardarConfiguracion({ tienda });
      registrarMovimiento({ admin, tipo: "configuracion", modulo: "perfil", descripcion: "Actualizó los datos de la tienda" });
      toast("Datos de la tienda guardados. Aparecerán en los PDF.", "exito");
    } catch (err) { toast(err.message, "error"); }
  });

  // --- Resumen de movimientos del administrador ---
  const mios = obtenerHistorialGlobal().filter(h => h.usuario === sesion.usuario);
  const porModulo = mios.reduce((acc, h) => { acc[h.modulo] = (acc[h.modulo] || 0) + 1; return acc; }, {});

  seccion.replaceChildren(
    el("div", { class: "cabecera-seccion" }, el("div", {},
      el("h1", { style: { fontSize: "clamp(24px,3.4vw,34px)" } }, "Perfil"),
      el("p", {}, "Tu cuenta, los márgenes mínimos y los datos que salen en los PDF."))),
    el("div", { class: "grilla-perfil" },
      tarjeta("Mi cuenta", formClave),
      otros.length ? tarjeta("Restablecer contraseña de otro administrador", formOtro) : null,
      tarjeta("Datos de la tienda", formTienda),
      tarjeta("Márgenes mínimos",
        el("p", { class: "texto-suave", style: { marginBottom: "12px" } }, "Un producto con margen por debajo del mínimo sale en rojo y en la alerta del Inicio. Deja una categoría vacía para usar el general."),
        campoGeneral,
        el("div", { class: "tabla-desplazable", style: { marginTop: "14px" } }, tablaCategorias),
        el("div", { style: { marginTop: "14px" } }, guardarMargenes)),
      tarjeta("Mis movimientos",
        el("div", { class: "tp-chips", style: { marginBottom: "12px" } },
          el("span", { class: "chip chip-negro" }, `${formatoNumero(mios.length)} en total`),
          Object.entries(porModulo).map(([m, n]) => el("span", { class: "chip" }, `${m}: ${formatoNumero(n)}`))),
        crearHistorial(mios, { visibles: 10, titulo: "Mis movimientos" }))));
}

// =========================================================
// Escáner en el inventario y escaneo rápido de stock
// =========================================================

/** Lleva al inventario, muestra la tarjeta del producto y la despliega */
function irAProductoInventario(producto) {
  irAlInventario({ referencia: producto.referencia });
  requestAnimationFrame(() => { lista.asegurar(producto.id); enfocarTarjeta(dom.lista, producto.id, controlLista); });
}

/** Si el código no existe, se ofrece crear el producto con la referencia precargada */
async function ofrecerCrear(codigo) {
  const serial = buscarSerial(codigo);
  if (serial) {
    navegar("seriales");
    mostrarSerial(serial.serial);
    return;
  }
  const crear = await confirmar({
    titulo: "Código no encontrado",
    mensaje: `No hay ningún producto con la referencia "${codigo}". ¿Quieres crearlo?`,
    aceptar: "Crear producto"
  });
  if (crear) {
    navegar("catalogo");
    abrirFormularioProducto(null, { referencia: codigo.toUpperCase() });
  }
}

function escanearInventario() {
  abrirEscaner({
    titulo: "Buscar por código",
    alLeer: codigo => {
      const producto = buscarPorReferencia(codigo);
      if (producto) irAProductoInventario(producto);
      else ofrecerCrear(codigo);
    }
  });
}

/** Modo escaneo rápido: cada código abre un mini panel para sumar o restar stock */
function escaneoRapido() {
  abrirEscaner({
    titulo: "Escaneo rápido de stock",
    ayuda: "Escanea un producto para sumar o restar unidades al instante.",
    alLeer: codigo => {
      const producto = buscarPorReferencia(codigo);
      if (!producto) { ofrecerCrear(codigo); return; }
      abrirAjusteRapido(producto);
    }
  });
}

function abrirAjusteRapido(producto) {
  const cantidad = el("input", { type: "number", id: "rapido-cantidad", class: "entrada", min: 1, step: 1, value: 1, inputMode: "numeric" });
  const motivo = el("select", { id: "rapido-motivo", class: "entrada" },
    ["Entrada", "Venta", "Daño", "Uso en taller", "Ajuste"].map(m => el("option", { value: m }, m)));
  const stock = el("strong", { class: "stock-rapido numero" }, formatoNumero(producto.stock));
  const error = el("p", { class: "campo-error", role: "alert" });
  const aplicar = signo => {
    const n = Math.round((aNumero(cantidad.value) || 0) * 100) / 100;
    if (n <= 0) { error.textContent = "La cantidad debe ser mayor que 0."; return false; }
    const actual = obtenerProducto(producto.id);
    if (signo < 0 && actual.stock < n) { error.textContent = `Solo hay ${formatoNumero(actual.stock)} unidades.`; return false; }
    const motivoFinal = signo > 0 && motivo.value !== "Entrada" && motivo.value !== "Ajuste" ? "Entrada" : motivo.value;
    const ok = intentar(() => ajustarStock(producto.id, signo * n, `${motivoFinal} (escaneo rápido)`, admin),
      `${producto.nombre}: ${formatoNumero(actual.stock)} → ${formatoNumero(actual.stock + signo * n)} und.`);
    if (!ok) return false;
    refrescarTarjeta(producto.id);
    inventarioDesactualizado = true;
    // Se vuelve a abrir el escáner para seguir con el siguiente producto
    setTimeout(escaneoRapido, 250);
  };
  abrirModal({
    titulo: "Ajuste rápido",
    contenido: el("div", { class: "ajuste-rapido" },
      el("div", { class: "ajuste-rapido-producto" },
        el("img", { src: imagenProducto(producto), alt: "", width: 64, height: 64 }),
        el("div", {}, el("strong", {}, producto.nombre), el("p", { class: "texto-suave" }, producto.referencia))),
      el("div", { class: "ajuste-rapido-stock" }, el("span", { class: "etiqueta" }, "Stock actual"), stock),
      el("div", { class: "form-grilla" },
        el("div", { class: "campo" }, el("label", { for: "rapido-cantidad" }, "Cantidad"), cantidad),
        el("div", { class: "campo" }, el("label", { for: "rapido-motivo" }, "Motivo"), motivo)),
      error),
    acciones: [
      { texto: "Cerrar", clase: "boton-secundario" },
      { texto: "− Restar", clase: "boton-secundario", alHacerClic: () => aplicar(-1) },
      { texto: "+ Sumar", clase: "boton-acento", alHacerClic: () => aplicar(1) }
    ]
  });
}

/** Sección "Código QR" en el panel desplegado del producto */
function seccionQRProducto(producto) {
  return el("section", {},
    el("h4", {}, "Código QR"),
    el("div", { class: "qr-producto" },
      el("button", { type: "button", class: "boton-qr", "aria-label": `Ver QR de ${producto.referencia}`, onclick: () => abrirQRProducto(producto) },
        imagenQR(producto.referencia, { tamano: 96 })),
      el("div", {},
        el("p", { class: "texto-suave" }, `Contiene la referencia ${producto.referencia}.`),
        el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => abrirImpresionEtiquetas({ productos: obtenerProductos(), seleccion: [{ producto, cantidad: 1 }] }) },
          icono("imprimir"), "Etiquetas"))));
}

function abrirQRProducto(producto) {
  mostrarQR({
    codigo: producto.referencia, titulo: producto.nombre, subtitulo: `${producto.marca} · ${producto.categoria}`,
    alImprimir: () => abrirImpresionEtiquetas({ productos: obtenerProductos(), seleccion: [{ producto, cantidad: 1 }] })
  });
}

// =========================================================
// Búsqueda global (Ctrl + K)
// =========================================================

function buscarTodo(consulta) {
  const palabras = normalizarTexto(consulta).split(" ").filter(Boolean);
  const coincide = texto => { const t = normalizarTexto(texto); return palabras.every(p => t.includes(p)); };
  const fecha = iso => new Date(iso).toLocaleDateString("es-CO");
  return [
    {
      grupo: "Productos",
      resultados: obtenerProductos().filter(p => coincide(`${p.nombre} ${p.referencia} ${p.marca} ${p.categoria}`)).slice(0, 6)
        .map(p => ({ titulo: p.nombre, subtitulo: `${p.referencia} · ${p.marca} · stock ${formatoNumero(p.stock)} · ${formatoCOP(precioFinal(p))}`, accion: () => irAProductoInventario(p) }))
    },
    {
      grupo: "Seriales",
      resultados: obtenerSeriales().filter(s => coincide(`${s.serial} ${s.nombreProducto} ${s.cliente?.nombre ?? ""}`)).slice(0, 4)
        .map(s => ({ titulo: s.serial, subtitulo: `${s.estado} · ${s.nombreProducto}${s.cliente ? ` · ${s.cliente.nombre}` : ""}`, accion: () => { navegar("seriales"); mostrarSerial(s.serial); } }))
    },
    {
      grupo: "Cotizaciones",
      resultados: obtenerCotizaciones().filter(c => coincide(`${c.numero} ${c.cliente.nombre} ${c.cliente.telefono} ${c.cliente.documento}`)).slice(0, 4)
        .map(c => ({ titulo: `${c.numero} · ${c.cliente.nombre}`, subtitulo: `${estadoCotizacion(c)} · ${fecha(c.fecha)} · ${formatoCOP(c.totales.total)}`, accion: () => { navegar("cotizaciones"); verCotizacion(c.id); } }))
    },
    {
      grupo: "Órdenes de taller",
      resultados: obtenerOrdenes().filter(o => coincide(`${o.numero} ${o.cliente.nombre} ${o.cliente.telefono} ${o.vehiculo.serial} ${o.vehiculo.marca} ${o.vehiculo.modelo}`)).slice(0, 4)
        .map(o => ({ titulo: `${o.numero} · ${o.cliente.nombre}`, subtitulo: `${o.estado} · ${[o.vehiculo.tipo, o.vehiculo.marca, o.vehiculo.modelo].filter(Boolean).join(" ")}`, accion: () => { navegar("taller"); abrirOrden(o.id); } }))
    },
    {
      grupo: "Proveedores",
      resultados: obtenerProveedores().filter(p => coincide(`${p.nombre} ${p.ciudad} ${p.contacto} ${p.nit}`)).slice(0, 3)
        .map(p => ({ titulo: p.nombre, subtitulo: [p.ciudad, p.telefono].filter(Boolean).join(" · ") || "Proveedor", accion: () => { navegar("proveedores"); abrirFichaProveedor(p.id); } }))
    },
    {
      grupo: "Garantías",
      resultados: obtenerGarantias().filter(g => coincide(`${g.nombreProducto} ${g.serial ?? ""} ${g.cliente.nombre} ${g.cotizacion}`)).slice(0, 4)
        .map(g => ({ titulo: `${g.nombreProducto}${g.serial ? ` · ${g.serial}` : ""}`, subtitulo: `${g.cliente.nombre} · ${estadoGarantia(g)} · vence ${fecha(g.vence)}`, accion: () => { navegar("seriales"); mostrarGarantia(g.id); } }))
    }
  ];
}

// =========================================================
// Historial global: línea de tiempo por día con filtros
// =========================================================

const filtrosHistorial = { texto: "", admin: "", tipo: "", modulo: "", desde: "", hasta: "" };
let diasHistorial = 7;
const NOMBRE_TIPO = {
  creado: "Producto creado", editado: "Producto editado", precio: "Cambio de precio", costo: "Cambio de costo", stock: "Movimiento de stock",
  imagen: "Imagen", visibilidad: "Visibilidad", destacado: "Destacado", eliminado: "Eliminado", importacion: "Importación de Excel",
  proveedor: "Proveedor", cotizacion: "Cotización", serial: "Serial", garantia: "Garantía", orden: "Orden de taller",
  alerta: "Alerta", perfil: "Perfil", configuracion: "Configuración"
};
const NOMBRE_MODULO = {
  inventario: "Inventario", proveedores: "Proveedores", cotizaciones: "Cotizaciones", seriales: "Seriales",
  garantias: "Garantías", taller: "Taller", perfil: "Perfil"
};

function pintarHistorial() {
  const seccion = seccionDe("historial");
  const todos = obtenerHistorialGlobal();
  const unicos = campo => [...new Set(todos.map(h => h[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const select = (id, etiqueta, valores, nombres = {}) => {
    const s = el("select", { class: "entrada", id, dataset: { filtroHistorial: id.replace("historial-", "") } },
      el("option", { value: "" }, "Todos"), valores.map(v => el("option", { value: v, selected: filtrosHistorial[id.replace("historial-", "")] === v }, nombres[v] ?? v)));
    return el("div", { class: "campo" }, el("label", { for: id }, etiqueta), s);
  };
  const buscador = el("input", { type: "search", class: "entrada", id: "historial-texto", placeholder: "Buscar en el historial", value: filtrosHistorial.texto, dataset: { filtroHistorial: "texto" } });
  const desde = el("input", { type: "date", class: "entrada", id: "historial-desde", value: filtrosHistorial.desde, dataset: { filtroHistorial: "desde" } });
  const hasta = el("input", { type: "date", class: "entrada", id: "historial-hasta", value: filtrosHistorial.hasta, dataset: { filtroHistorial: "hasta" } });
  const filtros = el("div", { class: "tarjeta bloque-filtro filtros-historial" },
    el("div", { class: "campo" }, el("label", { for: "historial-texto" }, "Buscar"), buscador),
    select("historial-admin", "Administrador", unicos("admin")),
    select("historial-tipo", "Tipo", unicos("tipo"), NOMBRE_TIPO),
    select("historial-modulo", "Módulo", unicos("modulo"), NOMBRE_MODULO),
    el("div", { class: "campo" }, el("label", { for: "historial-desde" }, "Desde"), desde),
    el("div", { class: "campo" }, el("label", { for: "historial-hasta" }, "Hasta"), hasta),
    el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: () => {
      Object.keys(filtrosHistorial).forEach(k => { filtrosHistorial[k] = ""; });
      diasHistorial = 7;
      pintarHistorial();
    } }, "Limpiar"));
  const linea = el("div", { class: "linea-tiempo" });
  const actualizar = () => {
    filtros.querySelectorAll("[data-filtro-historial]").forEach(c => { filtrosHistorial[c.dataset.filtroHistorial] = c.value; });
    diasHistorial = 7;
    pintarLineaTiempo(linea);
  };
  filtros.addEventListener("change", actualizar);
  buscador.addEventListener("input", conRetraso(actualizar, 200));

  seccion.replaceChildren(
    el("div", { class: "cabecera-seccion" }, el("div", {},
      el("h1", { style: { fontSize: "clamp(24px,3.4vw,34px)" } }, "Historial"),
      el("p", {}, `${formatoNumero(todos.length)} movimientos registrados por los administradores.`))),
    filtros, linea);
  pintarLineaTiempo(linea);
}

function pintarLineaTiempo(contenedor) {
  const f = filtrosHistorial;
  const palabras = normalizarTexto(f.texto).split(" ").filter(Boolean);
  const lista = obtenerHistorialGlobal().filter(h => {
    const dia = diaLocal(h.fecha);
    if (f.admin && h.admin !== f.admin) return false;
    if (f.tipo && h.tipo !== f.tipo) return false;
    if (f.modulo && h.modulo !== f.modulo) return false;
    if (f.desde && dia < f.desde) return false;
    if (f.hasta && dia > f.hasta) return false;
    if (palabras.length) {
      const t = normalizarTexto(`${h.descripcion} ${h.detalle} ${h.admin} ${h.referencia ?? ""} ${h.nombreProducto ?? ""}`);
      if (!palabras.every(p => t.includes(p))) return false;
    }
    return true;
  });
  if (!lista.length) {
    contenedor.replaceChildren(estadoVacio({ titulo: "Sin movimientos", mensaje: "No hay movimientos con esos filtros." }));
    return;
  }
  const porDia = agruparPorDia(lista);
  const dias = [...porDia.keys()];
  const hoy = diaLocal(new Date().toISOString());
  const ayer = diaLocal(new Date(Date.now() - 86400000).toISOString());
  const nombreDia = d => d === hoy ? "Hoy" : d === ayer ? "Ayer"
    : new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const bloques = dias.slice(0, diasHistorial).map(d => {
    const entradas = porDia.get(d);
    const filas = el("ol", { class: "entradas-dia" });
    const LIMITE = 8;
    const pintarFilas = n => filas.replaceChildren(...entradas.slice(0, n).map(filaLineaTiempo));
    pintarFilas(LIMITE);
    const verMas = entradas.length > LIMITE
      ? el("button", { type: "button", class: "boton boton-fantasma boton-pequeno", onclick: e => { pintarFilas(entradas.length); e.currentTarget.remove(); } },
          `Ver ${entradas.length - LIMITE} más`)
      : null;
    return el("section", { class: "dia-historial" },
      el("h3", {}, el("span", {}, nombreDia(d)), el("span", { class: "chip" }, `${entradas.length} movimiento${entradas.length === 1 ? "" : "s"}`)),
      filas, verMas);
  });
  const masDias = dias.length > diasHistorial
    ? el("div", { class: "cargar-mas" }, el("button", { type: "button", class: "boton boton-secundario", onclick: () => { diasHistorial += 7; pintarLineaTiempo(contenedor); } },
        `Ver días anteriores (${dias.length - diasHistorial})`))
    : null;
  contenedor.replaceChildren(el("p", { class: "contador-resultados" }, `${formatoNumero(lista.length)} movimientos en ${formatoNumero(dias.length)} días`), ...bloques, ...(masDias ? [masDias] : []));
}

const diaLocal = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function agruparPorDia(lista) {
  return lista.reduce((mapa, h) => {
    const d = diaLocal(h.fecha);
    if (!mapa.has(d)) mapa.set(d, []);
    mapa.get(d).push(h);
    return mapa;
  }, new Map());
}

function filaLineaTiempo(h) {
  const producto = h.productoId ? obtenerProducto(h.productoId) : null;
  return el("li", { class: `evento-historial tipo-${h.tipo}` },
    el("time", { datetime: h.fecha }, new Date(h.fecha).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })),
    el("span", { class: "punto-evento", "aria-hidden": "true" }),
    el("div", { class: "evento-cuerpo" },
      el("div", { class: "evento-titulo" }, el("strong", {}, h.descripcion),
        el("span", { class: "chip" }, NOMBRE_MODULO[h.modulo] ?? h.modulo ?? "—")),
      h.detalle ? el("p", { class: "texto-suave" }, h.detalle) : null,
      el("p", { class: "evento-meta" }, `${h.admin} · ${fechaRelativa(h.fecha)}`,
        h.referencia ? " · " : null,
        h.referencia ? (producto
          ? el("button", { type: "button", class: "enlace-simple", onclick: () => irAProductoInventario(producto) }, `${h.referencia} ${h.nombreProducto ?? ""}`.trim())
          : el("span", {}, `${h.referencia} (eliminado)`)) : null)));
}

if (sesion) iniciar();
