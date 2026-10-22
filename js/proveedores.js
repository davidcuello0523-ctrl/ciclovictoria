// =========================================================
// CicloVictoria · proveedores.js
// Proveedores: comparativo en tarjetas, ficha, crear, editar y
// eliminar (con reasignación de productos).
// =========================================================

import { SIN_PROVEEDOR } from "./config.js";
import {
  obtenerProveedores, obtenerProveedor, crearProveedor, actualizarProveedor, eliminarProveedor,
  estadisticasProveedor, productosDeProveedor, nombreProveedor
} from "./datos.js";
import {
  el, icono, botonIcono, toast, confirmar, abrirModal, crearUploader, estadoVacio,
  formatoCOP, formatoNumero, formatoPorcentaje
} from "./ui.js";

let admin = null;
let seccion = null;
let alVerProductos = () => {};
let alCambiar = () => {};
let contenedor = null;

export function iniciarProveedores(opciones) {
  ({ admin, seccion } = opciones);
  alVerProductos = opciones.alVerProductos ?? alVerProductos;
  alCambiar = opciones.alCambiar ?? alCambiar;
  contenedor = el("div", { class: "grilla-proveedores" });
  seccion.replaceChildren(
    el("div", { class: "cabecera-seccion" },
      el("div", {},
        el("h1", { style: { fontSize: "clamp(24px,3.4vw,34px)" } }, "Proveedores"),
        el("p", {}, "Comparativo de inventario, costos y márgenes por proveedor.")),
      el("button", { type: "button", class: "boton boton-acento", id: "nuevo-proveedor", onclick: () => abrirFormulario() }, "+ Nuevo proveedor")),
    contenedor);

  contenedor.addEventListener("click", e => {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    const id = boton.closest("[data-id]").dataset.id;
    const acciones = {
      ficha: () => abrirFichaProveedor(id),
      editar: () => abrirFormulario(obtenerProveedor(id)),
      eliminar: () => borrar(id),
      productos: () => alVerProductos(id)
    };
    acciones[boton.dataset.accion]?.();
  });
}

/** Inicial o logo del proveedor */
function marcaProveedor(proveedor, tamano = 48) {
  if (proveedor?.logo) return el("img", { class: "logo-proveedor", src: proveedor.logo, alt: `Logo de ${proveedor.nombre}`, width: tamano, height: tamano });
  const iniciales = (proveedor?.nombre ?? "?").split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
  return el("span", { class: "logo-proveedor inicial", style: { width: `${tamano}px`, height: `${tamano}px` }, "aria-hidden": "true" }, iniciales);
}

export function pintarProveedores() {
  if (!contenedor) return;
  const proveedores = obtenerProveedores();
  const tarjetas = proveedores.map(p => ({ p, e: estadisticasProveedor(p.id) }));
  const sinProveedor = estadisticasProveedor(SIN_PROVEEDOR);
  const totalVenta = tarjetas.reduce((s, t) => s + t.e.valorVenta, 0) + sinProveedor.valorVenta || 1;

  const lista = tarjetas.map(({ p, e }, i) => tarjetaProveedor(p, e, totalVenta, i));
  if (sinProveedor.productos) {
    lista.push(tarjetaProveedor({ id: SIN_PROVEEDOR, nombre: "Sin proveedor" }, sinProveedor, totalVenta, lista.length, true));
  }
  contenedor.replaceChildren(...(lista.length ? lista : [estadoVacio({ titulo: "Sin proveedores", mensaje: "Crea el primero con “+ Nuevo proveedor”." })]));
}

function tarjetaProveedor(p, e, totalVenta, indice, esSinProveedor = false) {
  const participacion = (e.valorVenta / totalVenta) * 100;
  const dato = (titulo, valor, clase = "") => el("div", { class: "dato-proveedor" }, el("dt", {}, titulo), el("dd", { class: `numero ${clase}` }, valor));
  return el("article", { class: "tarjeta tarjeta-proveedor aparecer", dataset: { id: p.id }, style: { "--i": indice } },
    el("header", {},
      marcaProveedor(p),
      el("div", { style: { minWidth: 0 } },
        el("h2", {}, p.nombre),
        el("p", { class: "texto-suave" }, esSinProveedor ? "Productos por asignar" : [p.ciudad, p.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"))),
    el("dl", { class: "datos-proveedor" },
      dato("Productos", formatoNumero(e.productos)),
      dato("Unidades", formatoNumero(e.unidades)),
      dato("Valor a costo", formatoCOP(e.valorCosto)),
      dato("Valor a venta", formatoCOP(e.valorVenta)),
      dato("Margen promedio", formatoPorcentaje(e.margenPromedio)),
      dato("Stock bajo", formatoNumero(e.stockBajo.length), e.stockBajo.length ? "texto-alerta" : "")),
    el("div", { class: "participacion", title: `${formatoPorcentaje(participacion)} del valor del inventario` },
      el("div", { class: "participacion-barra" }, el("span", { style: { width: `${participacion}%` } })),
      el("span", { class: "texto-suave" }, `${formatoPorcentaje(participacion)} del inventario a precio de venta`)),
    el("footer", {},
      el("button", { type: "button", class: "boton boton-secundario boton-pequeno", dataset: { accion: "productos" } }, "Ver productos"),
      esSinProveedor ? null : el("div", { class: "tp-acciones" },
        botonIcono("info", `Ficha de ${p.nombre}`, { dataset: { accion: "ficha" } }),
        botonIcono("editar", `Editar ${p.nombre}`, { dataset: { accion: "editar" } }),
        botonIcono("eliminar", `Eliminar ${p.nombre}`, { class: "peligro", dataset: { accion: "eliminar" } }))));
}

/** Ficha completa del proveedor en un modal */
export function abrirFichaProveedor(id) {
  const p = obtenerProveedor(id);
  if (!p) { toast("El proveedor ya no existe.", "error"); return; }
  const e = estadisticasProveedor(id);
  const fila = (titulo, valor) => el("tr", {}, el("th", { scope: "row" }, titulo), el("td", {}, valor || "—"));
  const bajos = [...e.stockBajo].sort((a, b) => a.stock - b.stock).slice(0, 5);
  abrirModal({
    titulo: p.nombre,
    ancho: true,
    contenido: el("div", { class: "ficha-proveedor" },
      el("div", { class: "ficha-proveedor-cabecera" }, marcaProveedor(p, 64),
        el("div", {}, el("strong", { style: { fontSize: "18px" } }, p.nombre), el("p", { class: "texto-suave" }, p.notas || "Sin notas"))),
      el("div", { class: "ficha-proveedor-columnas" },
        el("section", {}, el("h4", {}, "Contacto"),
          el("table", { class: "ficha" }, el("tbody", {},
            fila("NIT", p.nit), fila("Contacto", p.contacto), fila("Teléfono", p.telefono), fila("Correo", p.correo),
            fila("Ciudad", p.ciudad), fila("Días de entrega", p.diasEntrega)))),
        el("section", {}, el("h4", {}, "Inventario"),
          el("table", { class: "ficha" }, el("tbody", {},
            fila("Productos", formatoNumero(e.productos)), fila("Unidades", formatoNumero(e.unidades)),
            fila("Valor a costo", formatoCOP(e.valorCosto)), fila("Valor a venta", formatoCOP(e.valorVenta)),
            fila("Margen promedio", formatoPorcentaje(e.margenPromedio)), fila("Bajo margen mínimo", formatoNumero(e.margenBajo)))))),
      el("section", { style: { marginTop: "16px" } }, el("h4", {}, `Stock bajo (${e.stockBajo.length})`),
        bajos.length
          ? el("table", { class: "tabla-simple" },
              el("thead", {}, el("tr", {}, el("th", {}, "Producto"), el("th", { class: "num" }, "Stock"), el("th", { class: "num" }, "Pedir"))),
              el("tbody", {}, bajos.map(b => el("tr", {}, el("td", {}, `${b.referencia} · ${b.nombre}`),
                el("td", { class: "num" }, formatoNumero(b.stock)), el("td", { class: "num" }, formatoNumero(Math.max(1, b.minStock * 2 - b.stock)))))))
          : el("p", { class: "texto-suave" }, "Todo en orden."))),
    acciones: [
      { texto: "Editar", clase: "boton-secundario", alHacerClic: () => { abrirFormulario(p); } },
      { texto: "Ver productos", clase: "boton-acento", alHacerClic: () => { alVerProductos(id); } }
    ]
  });
}

function abrirFormulario(proveedor = null) {
  let logo = proveedor?.logo ?? null;
  const campos = [
    ["nombre", "Nombre *", "text"], ["nit", "NIT (opcional)", "text"], ["contacto", "Persona de contacto", "text"],
    ["telefono", "Teléfono", "tel"], ["correo", "Correo", "email"], ["ciudad", "Ciudad", "text"],
    ["diasEntrega", "Días de entrega habituales", "text"]
  ];
  const controles = {};
  const error = el("p", { class: "campo-error", role: "alert" });
  const uploader = crearUploader({ max: 1, maxMB: 2, iniciales: logo ? [logo] : [], etiqueta: "Logo (opcional)", onChange: l => { logo = l[0] ?? null; } });
  controles.notas = el("textarea", { class: "entrada", id: "prov-notas", rows: 3, maxLength: 500 });
  controles.notas.value = proveedor?.notas ?? "";
  const formulario = el("form", { class: "form-grilla", novalidate: true, onsubmit: e => e.preventDefault() },
    campos.map(([clave, etiqueta, tipo]) => {
      controles[clave] = el("input", { class: "entrada", id: `prov-${clave}`, type: tipo, value: proveedor?.[clave] ?? "", maxLength: 120 });
      return el("div", { class: `campo ${clave === "nombre" ? "ancho-completo" : ""}` }, el("label", { for: `prov-${clave}` }, etiqueta), controles[clave]);
    }),
    el("div", { class: "campo ancho-completo" }, el("label", { for: "prov-notas" }, "Notas"), controles.notas),
    el("div", { class: "ancho-completo" }, uploader.elemento),
    el("div", { class: "ancho-completo" }, error));

  abrirModal({
    titulo: proveedor ? `Editar ${proveedor.nombre}` : "Nuevo proveedor",
    contenido: formulario,
    ancho: true,
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      {
        texto: proveedor ? "Guardar cambios" : "Crear proveedor", clase: "boton-acento",
        alHacerClic: () => {
          const datos = Object.fromEntries(Object.entries(controles).map(([k, c]) => [k, c.value.trim()]));
          datos.logo = logo;
          if (!datos.nombre) { error.textContent = "El nombre es obligatorio."; controles.nombre.focus(); return false; }
          if (datos.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo)) { error.textContent = "El correo no es válido."; controles.correo.focus(); return false; }
          try {
            if (proveedor) actualizarProveedor(proveedor.id, datos, admin);
            else crearProveedor(datos, admin);
            toast(proveedor ? "Proveedor actualizado." : `Proveedor "${datos.nombre}" creado.`, "exito");
            pintarProveedores();
            alCambiar();
          } catch (e) {
            error.textContent = e.message;
            return false;
          }
        }
      }
    ]
  });
}

/** No se elimina si tiene productos: se ofrece reasignarlos */
async function borrar(id) {
  const p = obtenerProveedor(id);
  if (!p) return;
  const asociados = productosDeProveedor(id);
  if (!asociados.length) {
    const ok = await confirmar({ titulo: "Eliminar proveedor", mensaje: `¿Eliminar "${p.nombre}"?`, aceptar: "Eliminar", peligro: true });
    if (!ok) return;
    try { eliminarProveedor(id, admin); toast("Proveedor eliminado.", "exito"); } catch (e) { toast(e.message, "error"); }
    pintarProveedores();
    alCambiar();
    return;
  }
  const destino = el("select", { class: "entrada", id: "reasignar-a" },
    obtenerProveedores().filter(x => x.id !== id).map(x => el("option", { value: x.id }, x.nombre)),
    el("option", { value: SIN_PROVEEDOR }, "Sin proveedor"));
  abrirModal({
    titulo: `Eliminar ${p.nombre}`,
    contenido: el("div", {},
      el("div", { class: "aviso aviso-alerta" }, icono("alerta"),
        el("p", {}, `${p.nombre} tiene ${formatoNumero(asociados.length)} productos asociados. Para eliminarlo, elige a qué proveedor pasan.`)),
      el("div", { class: "campo", style: { marginTop: "14px" } }, el("label", { for: "reasignar-a" }, "Reasignar productos a"), destino)),
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      {
        texto: "Reasignar y eliminar", clase: "boton-peligro",
        alHacerClic: () => {
          try {
            eliminarProveedor(id, admin, destino.value);
            toast(`${formatoNumero(asociados.length)} productos pasaron a ${nombreProveedor(destino.value)}. Proveedor eliminado.`, "exito");
            pintarProveedores();
            alCambiar();
          } catch (e) {
            toast(e.message, "error");
            return false;
          }
        }
      }
    ]
  });
}
