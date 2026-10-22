// =========================================================
// CicloVictoria · precios.js
// Único lugar del proyecto donde se calcula el IVA y el redondeo del precio final (funciones puras).
// Los productos guardan SIEMPRE el precio base sin IVA y sin redondear (precioMayorBase / precioPublicoBase);
// el precio final (con IVA y redondeado hacia arriba a la centena) se calcula al mostrarlo y nunca se guarda.
// =========================================================

import { IVA, CATEGORIAS_SIN_IVA, REDONDEO } from "./config.js";

/** Regla de IVA de una cotización u orden de taller */
export const REGLA_IVA = {
  redondeado: "redondeado", // vigente: precios finales con IVA incluido y redondeados hacia arriba a la centena
  incluido: "incluido",     // guardadas con IVA incluido pero sin redondeo (01/10/2026)
  aparte: "aparte"          // anteriores: IVA sumado aparte sobre la base
};

export const PORCENTAJE_IVA = Math.round(IVA * 100);
export const TEXTO_IVA_INCLUIDO = "IVA incluido";

const normalizar = texto => String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

/** ¿Lleva IVA un producto de esta categoría? (las de CATEGORIAS_SIN_IVA no) */
export function ivaPorCategoria(categoria) {
  return !CATEGORIAS_SIN_IVA.some(c => normalizar(c) === normalizar(categoria));
}

/** ¿El producto lleva IVA? Usa su campo `aplicaIva`; si no lo tiene, lo decide la categoría */
export function llevaIva(producto) {
  return typeof producto?.aplicaIva === "boolean" ? producto.aplicaIva : ivaPorCategoria(producto?.categoria);
}

/** "mayor" y "mayorista" son lo mismo (las cotizaciones guardan "mayorista") */
const esMayor = tipo => tipo === "mayor" || tipo === "mayorista";

/**
 * Redondea HACIA ARRIBA al múltiplo de REDONDEO siguiente (a favor del negocio).
 * El Math.round interno evita que 119000.00000001 suba a 119.100.
 */
export function redondearArriba(valor) {
  return Math.ceil(Math.round(valor) / REDONDEO) * REDONDEO;
}

/** Precio base sin IVA. Sin precio al por mayor se usa el público. */
export function precioBase(producto, tipo = "publico") {
  if (!producto) return null;
  const publico = producto.precioPublicoBase ?? null;
  const base = esMayor(tipo) ? (producto.precioMayorBase ?? publico) : publico;
  return base > 0 ? base : null;
}

/**
 * Precio final que se muestra y se cobra. tipo: "mayor" | "publico".
 * redondearArriba(base × (1 + IVA)) si el producto lleva IVA; si no, redondearArriba(base).
 */
export function precioFinal(producto, tipo = "publico") {
  const base = precioBase(producto, tipo);
  if (base === null) return null;
  return redondearArriba(llevaIva(producto) ? base * (1 + IVA) : base);
}

/** Parte sin IVA de un valor que ya trae el IVA incluido */
export function quitarIva(valorFinal) {
  return valorFinal / (1 + IVA);
}

/** IVA contenido en un valor que ya lo incluye (desglose informativo hacia atrás) */
export function ivaIncluidoEn(valorFinal) {
  return valorFinal - quitarIva(valorFinal);
}

/** Lo que realmente queda para el negocio: el precio final redondeado sin el IVA. Sobre esto se calcula el margen */
export function precioSinIva(producto, tipo = "publico") {
  const final = precioFinal(producto, tipo);
  if (final === null) return null;
  return llevaIva(producto) ? quitarIva(final) : final;
}

/**
 * Precio base (con 2 decimales) cuyo precio final es exactamente `final` (una centena exacta).
 * Lo usa la calculadora de precio.
 */
export function baseParaPrecioFinal(final, aplicaIva) {
  return aplicaIva ? Math.round(quitarIva(final) * 100) / 100 : final;
}

/** Solo para documentos anteriores (REGLA_IVA.aparte): IVA sumado sobre la base */
export function ivaAparteSobre(base) {
  return base * IVA;
}
