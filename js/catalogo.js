// =========================================================
// CicloVictoria · catalogo.js
// Catálogo público (clientes). NUNCA muestra precio ni costo:
// todo lo que se pinta pasa antes por productoPublico().
// =========================================================

import { RUTA_CATALOGO_PUBLICO } from "./config.js";
import {
  cargarCatalogoPublico, obtenerProductos, productoPublico, valoresUnicos, filtrarProductos,
  ordenarProductos, sincronizarDesdeAlmacen, normalizarTexto, TEXTO_ESTADO
} from "./datos.js";
import { abrirEscaner } from "./qr.js";
import { obtenerSesion, esAdmin, cerrarSesion, nombreCortoDe } from "./auth.js";
import { iniciarHeader, crearFichaUsuario } from "./header.js";
import {
  el, icono, crearLogo, crearIconoBici, iniciarTema, animarEntrada, toast, confirmar,
  crearSkeletons, estadoVacio, crearTarjetaProducto, construirDetalleProducto,
  configurarListaProductos, crearListaPaginada, enfocarTarjeta, conRetraso, formatoNumero, iniciarBusquedaGlobal
} from "./ui.js";

// ---------- Referencias al DOM ----------
const $ = selector => document.querySelector(selector);
const dom = {
  listaDestacados: $("#lista-destacados"),
  grillaCategorias: $("#grilla-categorias"),
  pistaMarcas: $("#pista-marcas"),
  listaCatalogo: $("#lista-catalogo"),
  cargarMas: $("#cargar-mas"),
  contador: $("#contador-resultados"),
  buscarTexto: $("#buscar-texto"),
  buscarReferencia: $("#buscar-referencia"),
  orden: $("#orden"),
  permitirVarias: $("#permitir-varias"),
  sidebar: $("#sidebar-filtros"),
  fondoPanel: $("#fondo-panel")
};

// ---------- Estado de la vista ----------
const FILTROS_INICIALES = {
  texto: "", referencia: "", linea: "Todas", existencia: "con",
  categoria: "", marca: "", color: "", talla: "", compat: ""
};
let filtros = { ...FILTROS_INICIALES };
let orden = "az";
/** Copias públicas (sin precios) de los productos visibles */
let productosPublicos = [];
/** De dónde vienen los datos: "local", "publicado" (catalogo.json) o "excel" */
let origenDatos = "publicado";
/** Header adaptable (menú con "Más ▾" y panel lateral) */
let header = null;

// =========================================================
// Arranque
// =========================================================

async function iniciar() {
  $("#logo").replaceWith(crearLogo({ enlace: "#inicio" }));
  $("#hero-ilustracion").append(crearIconoBici());
  $("#anio").textContent = new Date().getFullYear();
  iniciarTema($("#boton-tema"));
  document.querySelectorAll(".lupa").forEach(b => b.append(icono("buscar")));
  $("#cerrar-filtros").append(icono("cerrar"));
  $("#boton-buscar").prepend(icono("buscar"));
  $("#boton-ingresar").prepend(icono("usuario"));
  document.querySelectorAll(".boton-escanear").forEach(b => b.prepend(icono("escaner")));

  // Con un administrador conectado se ve su ficha (con el tema dentro) en lugar de "Ingresar"
  const sesion = obtenerSesion();
  if (esAdmin(sesion)) {
    const boton = $("#boton-ingresar");
    boton.querySelector(".texto-ingresar").textContent = "Panel admin";
    boton.href = "admin.html";
    boton.hidden = true;
    $("#boton-tema").hidden = true;
    $("#boton-menu").before(crearFichaUsuario({
      nombre: sesion.nombre, nombreCorto: nombreCortoDe(sesion), usuario: sesion.usuario,
      opciones: [
        { icono: "grafico", texto: "Ir al panel de administración", href: "admin.html" },
        { icono: "usuario", texto: "Mi perfil", href: "admin.html#perfil" },
        { tema: true },
        { separador: true },
        { icono: "salir", texto: "Cerrar sesión", peligro: true, alElegir: async () => {
          if (await confirmar({ titulo: "Cerrar sesión", mensaje: "¿Quieres cerrar la sesión de administrador?", aceptar: "Cerrar sesión" })) cerrarSesion("index.html");
        } }
      ]
    }));
  }
  const ingresar = $("#boton-ingresar");
  header = iniciarHeader({
    header: $("#header"), nav: $("#nav"), botonMenu: $("#boton-menu"),
    accion: el("a", { class: "panel-menu-fila", href: ingresar.getAttribute("href") },
      icono("usuario"), ingresar.querySelector(".texto-ingresar").textContent)
  });

  dom.listaDestacados.replaceChildren(...crearSkeletons(3));
  dom.listaCatalogo.replaceChildren(...crearSkeletons(5));

  try {
    const { origen, productos } = await cargarCatalogoPublico();
    origenDatos = origen;
    productosPublicos = productos;
    if (origen === "excel") toast("Inventario cargado desde el Excel.", "exito");
  } catch (error) {
    mostrarErrorCarga(error);
    return;
  }

  configurarEventos();
  pintarInicio();
  pintarOpcionesFiltros();
  pintarCatalogo();
  navegar(location.hash.replace("#", "") || "inicio", false);

  // Si un administrador cambia algo en otra pestaña, el catálogo se actualiza solo
  window.addEventListener("storage", evento => {
    if (evento.key !== "cv_productos" || origenDatos === "publicado") return;
    sincronizarDesdeAlmacen();
    prepararDatos();
    pintarInicio();
    pintarOpcionesFiltros();
    pintarCatalogo();
  });
}

/** Solo productos visibles, convertidos a su versión pública (sin precio, costo, proveedor ni stock) */
function prepararDatos() {
  productosPublicos = obtenerProductos()
    .filter(p => p.visibleCatalogo)
    .map(productoPublico);
}

/** Mensaje cuando no hay catálogo publicado ni Excel local */
function mostrarErrorCarga(error) {
  console.error(error);
  const panel = el("div", { class: "tarjeta tarjeta-relleno panel-error-excel", role: "alert" },
    el("h2", {}, "El catálogo no está disponible"),
    el("p", {}, "Estamos actualizando el inventario. Intenta de nuevo en unos minutos."),
    el("p", { class: "texto-suave" }, `Administrador: publica ${RUTA_CATALOGO_PUBLICO} desde el panel (botón “Catálogo público”).`),
    el("a", { class: "boton boton-secundario", href: "login.html" }, "Ir al panel"));
  dom.listaDestacados.replaceChildren(panel);
  dom.listaCatalogo.replaceChildren(panel.cloneNode(true));
  dom.grillaCategorias.replaceChildren();
}

// =========================================================
// Navegación Inicio / Catálogo
// =========================================================

function navegar(seccion, animar = true) {
  if (!["inicio", "catalogo"].includes(seccion)) seccion = "inicio";
  document.querySelectorAll("main > section[data-seccion]").forEach(s => {
    const activa = s.dataset.seccion === seccion;
    s.hidden = !activa;
    if (activa && animar) animarEntrada(s);
  });
  header.marcarActiva(seccion);
  if (location.hash !== `#${seccion}`) history.replaceState(null, "", `#${seccion}`);
}

/** Va al catálogo aplicando filtros */
function irAlCatalogo(nuevosFiltros = {}) {
  filtros = { ...FILTROS_INICIALES, existencia: filtros.existencia, ...nuevosFiltros };
  sincronizarControles();
  pintarOpcionesFiltros();
  pintarCatalogo();
  navegar("catalogo");
  window.scrollTo({ top: 0, behavior: "auto" });
}

// =========================================================
// Inicio
// =========================================================

let controlDestacados = null;

function pintarInicio() {
  // Carrusel de marcas (map + Set + sort por cantidad de productos)
  const conteoMarcas = productosPublicos.reduce((acc, p) => {
    if (p.marca && p.marca !== "Sin marca") acc[p.marca] = (acc[p.marca] || 0) + 1;
    return acc;
  }, {});
  const marcas = Object.keys(conteoMarcas).sort((a, b) => conteoMarcas[b] - conteoMarcas[a]).slice(0, 18);
  const botonesMarca = lista => lista.map(m => el("button", { type: "button", dataset: { marca: m }, "aria-label": `Ver productos ${m}` }, m));
  // Se duplica la lista para que el desplazamiento sea infinito
  dom.pistaMarcas.replaceChildren(...botonesMarca(marcas), ...botonesMarca(marcas).map(b => { b.tabIndex = -1; b.setAttribute("aria-hidden", "true"); return b; }));
  dom.pistaMarcas.style.setProperty("--duracion", `${Math.max(20, marcas.length * 3)}s`);

  // Destacados con existencia (si no hay marcados, las bicicletas con más disponibilidad)
  let destacados = productosPublicos.filter(p => p.destacado && p.estado !== "agotado");
  if (!destacados.length) {
    destacados = productosPublicos.filter(p => p.categoria === "Bicicletas" && p.estado === "normal");
  }
  destacados = destacados.slice(0, 4);
  dom.listaDestacados.replaceChildren(...(destacados.length
    ? destacados.map((p, i) => crearTarjetaProducto(p, { rol: "cliente", indice: i }))
    : [estadoVacio({ titulo: "Pronto tendremos destacados" })]));

  // Accesos por categoría
  const categorias = [...new Set(productosPublicos.map(p => p.categoria))].sort((a, b) => a.localeCompare(b, "es"));
  dom.grillaCategorias.replaceChildren(...categorias.map(categoria => {
    const cantidad = productosPublicos.filter(p => p.categoria === categoria).length;
    return el("button", { type: "button", class: "acceso-categoria", dataset: { categoria } },
      el("div", {}, el("strong", {}, categoria), el("span", { style: { display: "block" } }, `${formatoNumero(cantidad)} productos`)),
      icono("flechaDerecha"));
  }));
}

// =========================================================
// Catálogo
// =========================================================

const lista = crearListaPaginada({
  contenedor: dom.listaCatalogo,
  botonMas: dom.cargarMas,
  crearTarjeta: (p, i) => crearTarjetaProducto(p, { rol: "cliente", indice: i }),
  vacio: () => estadoVacio({
    titulo: "No encontramos productos",
    mensaje: "Prueba con otras palabras o quita algunos filtros.",
    linea: filtros.linea === "Moto" ? "Moto" : "Bicicleta",
    accion: el("button", { type: "button", class: "boton boton-secundario boton-pequeno", onclick: limpiarFiltros }, "Limpiar filtros")
  })
});

function pintarCatalogo() {
  const resultado = ordenarProductos(filtrarProductos(productosPublicos, filtros), orden);
  dom.contador.textContent = `${formatoNumero(resultado.length)} producto${resultado.length === 1 ? "" : "s"}`;
  lista.mostrar(resultado);
}

/** Opciones de los selects según la línea elegida */
function pintarOpcionesFiltros() {
  const base = filtros.linea === "Todas" ? productosPublicos : productosPublicos.filter(p => p.linea === filtros.linea);
  const opciones = {
    categoria: ["Todas las categorías", valoresUnicos(base, "categoria")],
    marca: ["Todas las marcas", valoresUnicos(base, "marca")],
    color: ["Todos los colores", valoresUnicos(base, "color")],
    talla: ["Todas las tallas", valoresUnicos(base, "talla")],
    compat: ["Cualquiera", valoresUnicos(base, "compatibilidad")]
  };
  for (const [campo, [textoTodos, valores]] of Object.entries(opciones)) {
    const select = document.querySelector(`[data-filtro="${campo}"]`);
    // Si el valor elegido ya no existe en esta línea, se limpia
    if (filtros[campo] && !valores.includes(filtros[campo])) filtros[campo] = "";
    select.replaceChildren(el("option", { value: "" }, textoTodos), ...valores.map(v => el("option", { value: v }, v)));
    select.value = filtros[campo];
  }
}

/** Refleja el estado de los filtros en los controles */
function sincronizarControles() {
  dom.buscarTexto.value = filtros.texto;
  dom.buscarReferencia.value = filtros.referencia;
  dom.orden.value = orden;
  marcarSegmentado($("#filtro-linea"), filtros.linea);
  marcarSegmentado($("#filtro-existencia"), filtros.existencia);
  document.querySelectorAll("[data-filtro]").forEach(s => { s.value = filtros[s.dataset.filtro]; });
}

function marcarSegmentado(grupo, valor) {
  grupo.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.valor === valor)));
}

function limpiarFiltros() {
  filtros = { ...FILTROS_INICIALES };
  sincronizarControles();
  pintarOpcionesFiltros();
  pintarCatalogo();
}

function abrirPanelFiltros(abrir) {
  dom.sidebar.classList.toggle("abierto", abrir);
  dom.fondoPanel.classList.toggle("visible", abrir);
  $("#abrir-filtros").setAttribute("aria-expanded", String(abrir));
  if (abrir) $("#cerrar-filtros").focus();
}

// =========================================================
// Eventos
// =========================================================

function configurarEventos() {
  window.addEventListener("hashchange", () => navegar(location.hash.replace("#", "")));

  // Buscadores del hero
  $("#form-hero").addEventListener("submit", evento => {
    evento.preventDefault();
    const tipo = evento.submitter?.dataset.tipo;
    const texto = $("#hero-descripcion").value.trim();
    const referencia = $("#hero-referencia").value.trim();
    if (tipo === "referencia") irAlCatalogo({ referencia, existencia: "todos" });
    else if (tipo === "texto") irAlCatalogo({ texto, existencia: "todos" });
    else irAlCatalogo({ texto, referencia, existencia: "todos" });
  });
  document.querySelectorAll("[data-ir-linea]").forEach(b =>
    b.addEventListener("click", () => irAlCatalogo({ linea: b.dataset.irLinea })));
  dom.pistaMarcas.addEventListener("click", e => {
    const boton = e.target.closest("[data-marca]");
    if (boton) irAlCatalogo({ marca: boton.dataset.marca, existencia: "todos" });
  });
  dom.grillaCategorias.addEventListener("click", e => {
    const boton = e.target.closest("[data-categoria]");
    if (boton) irAlCatalogo({ categoria: boton.dataset.categoria });
  });

  // Buscadores del catálogo (en vivo con retraso)
  const buscar = conRetraso(() => {
    filtros.texto = dom.buscarTexto.value;
    filtros.referencia = dom.buscarReferencia.value;
    pintarCatalogo();
  }, 220);
  dom.buscarTexto.addEventListener("input", buscar);
  dom.buscarReferencia.addEventListener("input", buscar);
  document.querySelectorAll(".buscadores-catalogo .lupa").forEach(b => b.addEventListener("click", buscar));

  // Segmentados
  $("#filtro-linea").addEventListener("click", e => {
    const b = e.target.closest("button[data-valor]");
    if (!b) return;
    filtros.linea = b.dataset.valor;
    marcarSegmentado($("#filtro-linea"), filtros.linea);
    pintarOpcionesFiltros();
    pintarCatalogo();
  });
  $("#filtro-existencia").addEventListener("click", e => {
    const b = e.target.closest("button[data-valor]");
    if (!b) return;
    filtros.existencia = b.dataset.valor;
    marcarSegmentado($("#filtro-existencia"), filtros.existencia);
    pintarCatalogo();
  });

  // Selects de filtros y orden
  document.querySelectorAll("[data-filtro]").forEach(select =>
    select.addEventListener("change", () => { filtros[select.dataset.filtro] = select.value; pintarCatalogo(); }));
  dom.orden.addEventListener("change", () => { orden = dom.orden.value; pintarCatalogo(); });
  $("#limpiar-filtros").addEventListener("click", limpiarFiltros);

  // Panel de filtros en móvil
  $("#abrir-filtros").addEventListener("click", () => abrirPanelFiltros(true));
  $("#cerrar-filtros").addEventListener("click", () => abrirPanelFiltros(false));
  dom.fondoPanel.addEventListener("click", () => abrirPanelFiltros(false));
  document.addEventListener("keydown", e => { if (e.key === "Escape") abrirPanelFiltros(false); });

  // Escáner (etiqueta QR) y búsqueda global Ctrl + K: solo productos visibles, sin precios
  document.querySelectorAll(".boton-escanear").forEach(b => b.addEventListener("click", escanearPublico));
  iniciarBusquedaGlobal({
    boton: $("#boton-buscar"),
    escanear: escanearPublico,
    placeholder: "Buscar productos por nombre, marca o referencia…",
    buscar: consulta => [{
      grupo: "Productos",
      resultados: filtrarProductos(productosPublicos, { texto: consulta }).slice(0, 8).map(p => ({
        titulo: p.nombre,
        subtitulo: `${p.referencia} · ${p.marca} · ${TEXTO_ESTADO[p.estado]}`,
        accion: () => irAProducto(p.id)
      }))
    }]
  });

  // Tarjetas: un solo listener por lista (delegación)
  const opcionesLista = {
    construirDetalle: id => {
      const producto = productosPublicos.find(p => p.id === id);
      return construirDetalleProducto(producto, { rol: "cliente", lista: productosPublicos });
    },
    permitirVarias: () => dom.permitirVarias.checked,
    alAccion: (accion, id) => {
      if (accion === "ir-producto") irAProducto(id);
    }
  };
  controlCatalogo = configurarListaProductos(dom.listaCatalogo, opcionesLista);
  controlDestacados = configurarListaProductos(dom.listaDestacados, opcionesLista);
}

let controlCatalogo = null;

/** Escanea la etiqueta QR (contiene la referencia) y abre el producto */
function escanearPublico() {
  abrirEscaner({
    titulo: "Escanear etiqueta",
    ayuda: "Apunta la cámara al código QR de la etiqueta del producto.",
    alLeer: codigo => {
      const producto = productosPublicos.find(p => normalizarTexto(p.referencia) === normalizarTexto(codigo));
      if (producto) irAProducto(producto.id);
      else toast(`No encontramos un producto con el código ${codigo}.`, "advertencia");
    }
  });
}

/** Clic en un producto compatible: lo busca en el catálogo y lo despliega */
function irAProducto(id) {
  const producto = productosPublicos.find(p => p.id === id);
  if (!producto) return;
  irAlCatalogo({ referencia: producto.referencia, existencia: "todos" });
  requestAnimationFrame(() => {
    lista.asegurar(id);
    enfocarTarjeta(dom.listaCatalogo, id, controlCatalogo);
  });
}

iniciar();
