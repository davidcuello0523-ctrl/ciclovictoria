// =========================================================
// CicloVictoria · header.js
// Header adaptable del panel y del catálogo público:
// menú con prioridad ("Más ▾"), desplegables y panel lateral (< 900 px)
// =========================================================

import { el, icono, alternarTema } from "./ui.js";

/** Debe coincidir con el @media (max-width: 899px) de componentes.css */
const CONSULTA_PANEL = "(max-width: 899px)";

/** Desplegable: abre con el botón y cierra con Esc, clic fuera o al elegir una opción */
export function crearDesplegable(boton, panel) {
  const alternar = abrir => {
    panel.hidden = !abrir;
    boton.setAttribute("aria-expanded", String(abrir));
  };
  boton.setAttribute("aria-expanded", "false");
  boton.setAttribute("aria-controls", panel.id);
  panel.hidden = true;
  boton.addEventListener("click", () => alternar(panel.hidden));
  panel.addEventListener("click", e => { if (e.target.closest("a, button")) alternar(false); });
  document.addEventListener("click", e => {
    if (!panel.hidden && !panel.contains(e.target) && !boton.contains(e.target)) alternar(false);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !panel.hidden) { alternar(false); boton.focus(); }
  });
  return { cerrar: () => alternar(false) };
}

/**
 * Ficha de usuario del header (píldora con avatar, nombre y rol) y su menú de cuenta.
 * opciones: [{ icono, texto, href?, alElegir?, peligro?, seccion? } | { tema: true } | { separador: true }]
 */
export function crearFichaUsuario({ nombre, nombreCorto, usuario, rol = "Administrador", opciones }) {
  const iniciales = nombre.split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  const boton = el("button", {
    type: "button", class: "ficha-boton", "aria-haspopup": "menu", "aria-expanded": "false",
    "aria-controls": "menu-cuenta", "aria-label": `Cuenta de ${nombreCorto}`, title: "Mi cuenta"
  },
    el("span", { class: "avatar", "aria-hidden": "true" }, iniciales),
    el("span", { class: "ficha-texto", "aria-hidden": "true" },
      el("span", { class: "ficha-nombre" }, nombreCorto),
      el("span", { class: "ficha-rol" }, rol)),
    icono("chevron", { class: "ficha-flecha" }));

  const pintarTema = [];
  const items = opciones.map(o => {
    if (o.separador) return el("div", { class: "menu-cuenta-separador", role: "separator" });
    if (o.tema) {
      const opcion = el("button", { type: "button", class: "menu-cuenta-opcion", role: "menuitemcheckbox", tabindex: "-1" },
        icono("luna"), el("span", {}, "Modo oscuro"), el("span", { class: "interruptor-mini", "aria-hidden": "true" }));
      opcion.addEventListener("click", alternarTema);
      pintarTema.push(() => opcion.setAttribute("aria-checked", String(document.documentElement.dataset.tema === "oscuro")));
      return opcion;
    }
    const props = { class: `menu-cuenta-opcion ${o.peligro ? "peligro" : ""}`.trim(), role: "menuitem", tabindex: "-1" };
    const opcion = o.href
      ? el("a", { ...props, href: o.href, dataset: o.seccion ? { seccion: o.seccion } : undefined }, icono(o.icono), el("span", {}, o.texto))
      : el("button", { ...props, type: "button" }, icono(o.icono), el("span", {}, o.texto));
    opcion.dataset.cierra = "";
    if (o.alElegir) opcion.addEventListener("click", o.alElegir);
    return opcion;
  });

  // Oculto desde el HTML generado: nunca se ve sin que el JS lo abra
  const menu = el("div", { class: "menu-cuenta", id: "menu-cuenta", role: "menu", "aria-label": "Mi cuenta", hidden: true },
    el("div", { class: "menu-cuenta-cabecera", role: "presentation" },
      el("span", { class: "avatar", "aria-hidden": "true" }, iniciales),
      el("div", {}, el("strong", {}, nombre), el("small", {}, `${rol} · ${usuario}`))),
    el("div", { class: "menu-cuenta-separador", role: "separator" }),
    ...items);
  const ficha = el("div", { class: "ficha-usuario" }, boton, menu);

  const opcionesMenu = () => [...menu.querySelectorAll('[role^="menuitem"]')];
  const enfocar = i => { const lista = opcionesMenu(); lista[(i + lista.length) % lista.length]?.focus(); };
  const alternar = (abrir, devolverFoco = false) => {
    menu.hidden = !abrir;
    boton.setAttribute("aria-expanded", String(abrir));
    if (abrir) { pintarTema.forEach(f => f()); enfocar(0); }
    else if (devolverFoco) boton.focus();
  };
  boton.addEventListener("click", () => alternar(menu.hidden));
  boton.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      alternar(true);
      if (e.key === "ArrowUp") enfocar(-1);
    }
  });
  menu.addEventListener("keydown", e => {
    const lista = opcionesMenu();
    const i = lista.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); enfocar(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); enfocar(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); enfocar(0); }
    else if (e.key === "End") { e.preventDefault(); enfocar(-1); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); alternar(false, true); }
    else if (e.key === "Tab") alternar(false);
  });
  menu.addEventListener("click", e => { if (e.target.closest("[data-cierra]")) alternar(false); });
  document.addEventListener("click", e => { if (!menu.hidden && !ficha.contains(e.target)) alternar(false); });
  new MutationObserver(() => pintarTema.forEach(f => f()))
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
  return ficha;
}

/**
 * Patrón priority+: las secciones que no caben (de la última hacia atrás)
 * pasan a un desplegable "Más ▾" al final de la navegación.
 */
function iniciarMenuPrioridad(header, nav) {
  const ul = nav.querySelector("ul");
  const items = [...ul.children];
  const enlaces = items.map(li => li.querySelector("a"));
  const opciones = enlaces.map(a => el("li", {},
    el("a", { class: "desplegable-opcion", href: a.getAttribute("href"), dataset: { seccion: a.dataset.seccion } }, a.textContent)));
  const lista = el("ul", { class: "desplegable menu-mas", id: "menu-mas", "aria-label": "Más secciones" }, ...opciones);
  const textoMas = el("span", {}, "Más");
  const botonMas = el("button", { type: "button", class: "nav-enlace nav-mas-boton", "aria-haspopup": "true" },
    textoMas, icono("chevron", { class: "flecha" }));
  const liMas = el("li", { class: "nav-mas" }, botonMas, lista);
  ul.append(liMas);
  const desplegable = crearDesplegable(botonMas, lista);
  let activa = null;

  function distribuir() {
    if (!nav.clientWidth) return; // navegación oculta (panel lateral)
    items.forEach(li => { li.hidden = false; });
    liMas.hidden = false;
    textoMas.textContent = "Más";
    botonMas.classList.remove("activo");

    const separacion = parseFloat(getComputedStyle(ul).columnGap) || 0;
    const anchos = items.map(li => Math.ceil(li.getBoundingClientRect().width));
    const disponible = nav.clientWidth;
    const caben = anchoMas => {
      let usado = anchoMas, n = 0;
      for (const ancho of anchos) {
        if (usado + separacion + ancho > disponible) break;
        usado += separacion + ancho;
        n++;
      }
      return n;
    };

    let visibles = items.length;
    const total = anchos.reduce((s, a) => s + a, 0) + separacion * (items.length - 1);
    const iActiva = enlaces.findIndex(a => a.dataset.seccion === activa);
    if (total > disponible) {
      visibles = caben(Math.ceil(liMas.getBoundingClientRect().width));
      // Si la sección activa queda en "Más", el botón lleva su nombre (y se vuelve a medir)
      if (iActiva >= visibles) {
        textoMas.textContent = enlaces[iActiva].textContent;
        botonMas.classList.add("activo");
        visibles = caben(Math.ceil(liMas.getBoundingClientRect().width));
      }
    }
    items.forEach((li, i) => { li.hidden = i >= visibles; });
    opciones.forEach((li, i) => { li.hidden = i < visibles; });
    liMas.hidden = visibles === items.length;
    if (liMas.hidden) desplegable.cerrar();
  }

  new ResizeObserver(() => distribuir()).observe(header);
  document.fonts?.ready.then(distribuir);
  return {
    marcarActiva(id) { activa = id; distribuir(); },
    distribuir
  };
}

/** Panel lateral negro (< 900 px): secciones, usuario, tema y la acción principal abajo */
function crearPanelMenu({ enlaces, botonMenu, usuario, accion }) {
  const cerrarBoton = el("button", { type: "button", class: "boton-icono", "aria-label": "Cerrar menú", title: "Cerrar menú" }, icono("cerrar"));
  const temaTexto = el("span");
  const temaIcono = el("span", { class: "panel-menu-tema-icono" });
  const botonTemaPanel = el("button", { type: "button", class: "panel-menu-fila" }, temaIcono, temaTexto);
  const lista = el("ul", {}, ...enlaces.map(a => el("li", {},
    el("a", { class: "panel-menu-enlace", href: a.getAttribute("href"), dataset: { seccion: a.dataset.seccion } }, a.textContent))));
  const panel = el("aside", { class: "panel-menu", id: "panel-menu", "aria-label": "Menú" },
    el("div", { class: "panel-menu-cabecera" }, el("strong", {}, "Menú"), cerrarBoton),
    el("nav", { class: "panel-menu-secciones", "aria-label": "Secciones" }, lista),
    el("div", { class: "panel-menu-pie" }, usuario, botonTemaPanel, accion));
  const fondo = el("div", { class: "panel-menu-fondo", "aria-hidden": "true" });
  document.body.append(fondo, panel);

  const pintarTema = () => {
    const oscuro = document.documentElement.dataset.tema === "oscuro";
    temaIcono.replaceChildren(icono(oscuro ? "sol" : "luna"));
    temaTexto.textContent = oscuro ? "Modo claro" : "Modo oscuro";
  };
  pintarTema();
  new MutationObserver(pintarTema).observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
  botonTemaPanel.addEventListener("click", alternarTema);

  const alternar = (abrir, devolverFoco = false) => {
    panel.classList.toggle("abierto", abrir);
    fondo.classList.toggle("abierto", abrir);
    botonMenu.setAttribute("aria-expanded", String(abrir));
    if (abrir) lista.querySelector("a")?.focus();
    else if (devolverFoco) botonMenu.focus();
  };
  botonMenu.replaceChildren(icono("menu"));
  botonMenu.setAttribute("aria-controls", panel.id);
  botonMenu.setAttribute("aria-expanded", "false");
  botonMenu.addEventListener("click", () => alternar(!panel.classList.contains("abierto")));
  cerrarBoton.addEventListener("click", () => alternar(false, true));
  fondo.addEventListener("click", () => alternar(false, true));
  panel.addEventListener("click", e => { if (e.target.closest("a, .panel-menu-pie button:not(.panel-menu-fila)")) alternar(false); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && panel.classList.contains("abierto")) alternar(false, true);
  });
  // Al pasar a pantalla ancha el panel se cierra solo
  window.matchMedia(CONSULTA_PANEL).addEventListener("change", e => { if (!e.matches) alternar(false); });
  return panel;
}

/**
 * Arma el header: menú con prioridad y panel lateral.
 * usuario y accion son nodos opcionales para el pie del panel lateral.
 * Devuelve marcarActiva(id) para resaltar la sección en todos los menús.
 */
export function iniciarHeader({ header, nav, botonMenu, usuario = null, accion = null }) {
  const enlaces = [...nav.querySelectorAll("a[data-seccion]")];
  const prioridad = iniciarMenuPrioridad(header, nav);
  const panel = crearPanelMenu({ enlaces, botonMenu, usuario, accion });
  return {
    marcarActiva(id) {
      [header, panel].forEach(zona => zona.querySelectorAll("a[data-seccion]").forEach(a => {
        if (a.dataset.seccion === id) a.setAttribute("aria-current", "page");
        else a.removeAttribute("aria-current");
      }));
      prioridad.marcarActiva(id);
    }
  };
}
