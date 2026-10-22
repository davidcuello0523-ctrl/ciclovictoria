// =========================================================
// CicloVictoria · datos.js
// Carga del Excel, limpieza, localStorage, CRUD de productos e historial
// =========================================================

import {
  RUTA_EXCEL, RUTA_CATALOGO_PUBLICO, HOJA_EXCEL, FILA_ENCABEZADOS, MAPEO_COLUMNAS, VALORES_POR_DEFECTO,
  PREFIJO_REFERENCIA, CATEGORIAS_BICICLETA, GANANCIAS, VERSION_PRECIOS, REDONDEO_PRECIO, MARGEN_MINIMO,
  PROVEEDORES_INICIALES, SIN_PROVEEDOR, REGLAS_PROVEEDOR, MARCAS_CONOCIDAS, NOMBRES_MARCA,
  CATEGORIAS_MOTO, PATRON_MOTO, CATEGORIAS_CON_RIN, RINES_VALIDOS, COLORES_CONOCIDOS,
  CATEGORIAS_CON_SERIAL, GARANTIA_POR_CATEGORIA, CLAVES, LIMITE_ALMACENAMIENTO_MB,
  PREFIJO_COTIZACION, VALIDEZ_COTIZACION_DIAS, DATOS_TIENDA_INICIALES,
  DIAS_GARANTIA_POR_VENCER, PREFIJO_ORDEN, ESTADOS_TALLER, ESTADOS_TALLER_FINALES
} from "./config.js";
import {
  REGLA_IVA, PORCENTAJE_IVA, ivaPorCategoria, precioBase, precioFinal, precioSinIva, baseParaPrecioFinal,
  redondearArriba, quitarIva, ivaIncluidoEn, ivaAparteSobre
} from "./precios.js";
import { CLAVES_NUBE, CLAVE_CATALOGO_PUBLICO, nubeConfigurada, subir, bajarTodo, bajarCatalogoPublico } from "./nube.js";

// =========================================================
// Almacenamiento seguro (siempre con try/catch)
// =========================================================

/** Devuelve localStorage o sessionStorage, o null si el navegador lo bloquea */
function obtenerAlmacen(tipo = "local") {
  try {
    return tipo === "sesion" ? window.sessionStorage : window.localStorage;
  } catch (error) {
    console.warn("Almacenamiento no disponible:", error);
    return null;
  }
}

export function leerLocal(clave, porDefecto = null, tipo = "local") {
  try {
    const almacen = obtenerAlmacen(tipo);
    const texto = almacen ? almacen.getItem(clave) : null;
    return texto === null ? porDefecto : JSON.parse(texto);
  } catch (error) {
    console.warn(`No se pudo leer "${clave}":`, error);
    return porDefecto;
  }
}

export function guardarLocal(clave, valor, tipo = "local") {
  try {
    const almacen = obtenerAlmacen(tipo);
    if (!almacen) return false;
    almacen.setItem(clave, JSON.stringify(valor));
    if (tipo === "local" && CLAVES_NUBE.includes(clave) && hayAdminConectado()) {
      subir(clave, valor);
      if (clave === CLAVES.productos) subir(CLAVE_CATALOGO_PUBLICO, generarCatalogoPublico(valor));
    }
    return true;
  } catch (error) {
    console.error(`No se pudo guardar "${clave}":`, error);
    return false;
  }
}

/** Solo un administrador conectado sube a la nube (los visitantes únicamente leen) */
function hayAdminConectado() {
  return Boolean(leerLocal(CLAVES.sesion, null, "sesion") ?? leerLocal(CLAVES.sesion, null, "local"));
}

/**
 * Trae de Supabase lo último que guardó cualquier administrador y lo deja en este navegador.
 * Si la nube aún está vacía (primer uso), sube lo que haya aquí.
 */
async function sincronizarConNube() {
  if (!nubeConfigurada() || !hayAdminConectado()) return;
  const remotos = await bajarTodo();
  for (const clave of CLAVES_NUBE) {
    if (clave in remotos) {
      obtenerAlmacen()?.setItem(clave, JSON.stringify(remotos[clave]));
    } else {
      const local = leerLocal(clave, null);
      if (local !== null) subir(clave, local);
    }
  }
}

export function borrarLocal(clave, tipo = "local") {
  try {
    obtenerAlmacen(tipo)?.removeItem(clave);
  } catch (error) {
    console.warn(`No se pudo borrar "${clave}":`, error);
  }
}

/** Espacio aproximado usado en localStorage (en caracteres, que es como lo limita el navegador) */
export function espacioUsado() {
  let usados = 0;
  try {
    const almacen = obtenerAlmacen();
    for (let i = 0; i < almacen.length; i++) {
      const clave = almacen.key(i);
      usados += clave.length + (almacen.getItem(clave) || "").length;
    }
  } catch (error) {
    console.warn("No se pudo medir el almacenamiento:", error);
  }
  const limite = LIMITE_ALMACENAMIENTO_MB * 1024 * 1024;
  return { usados, limite, porcentaje: Math.min(100, (usados / limite) * 100) };
}

// =========================================================
// Utilidades de limpieza
// =========================================================

/** Texto sin tildes, en mayúsculas y con espacios simples (para comparar) */
export function normalizarTexto(texto) {
  return String(texto ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/\s+/g, " ").trim();
}

/** Quita espacios sobrantes de un texto; devuelve "" si no hay valor */
export function limpiarTexto(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\s+/g, " ").trim();
}

/**
 * Convierte a Number aceptando "$ 505.000", "505,000", "1.234,5", 505000…
 * Devuelve null si no hay un número válido.
 */
export function aNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let texto = String(valor).replace(/[^\d.,-]/g, "");
  if (!texto || texto === "-") return null;
  const puntos = (texto.match(/\./g) || []).length;
  const comas = (texto.match(/,/g) || []).length;
  if (puntos && comas) {
    // El último separador es el decimal
    const decimalEsComa = texto.lastIndexOf(",") > texto.lastIndexOf(".");
    texto = decimalEsComa ? texto.replace(/\./g, "").replace(",", ".") : texto.replace(/,/g, "");
  } else if (puntos || comas) {
    const sep = puntos ? "." : ",";
    const partes = texto.split(sep);
    // Varios separadores, o exactamente 3 dígitos después → separador de miles
    const esMiles = partes.length > 2 || partes[partes.length - 1].length === 3;
    texto = esMiles ? partes.join("") : partes.join(".");
  }
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

export function redondearA(valor, multiplo = REDONDEO_PRECIO) {
  return Math.round(valor / multiplo) * multiplo;
}

export function generarId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const ahora = () => new Date().toISOString();

// =========================================================
// Deducciones para columnas que no trae el Excel
// =========================================================

export function deducirLinea(nombre, categoria) {
  if (CATEGORIAS_MOTO.some(c => normalizarTexto(c) === normalizarTexto(categoria))) return "Moto";
  if (PATRON_MOTO.test(normalizarTexto(nombre))) return "Moto";
  return "Bicicleta";
}

const conjuntoMarcas = new Set(MARCAS_CONOCIDAS);
export function deducirMarca(nombre) {
  const palabras = normalizarTexto(nombre).split(/[\s/()]+/);
  const encontrada = palabras.find(p => conjuntoMarcas.has(p));
  if (!encontrada) return VALORES_POR_DEFECTO.marca;
  return NOMBRES_MARCA[encontrada] ?? encontrada;
}

export function deducirProveedor(nombre, categoria) {
  const palabras = new Set(normalizarTexto(nombre).split(/[\s/()]+/));
  for (const [id, claves] of Object.entries(REGLAS_PROVEEDOR.palabrasClave)) {
    if (claves.some(clave => palabras.has(clave))) return id;
  }
  return REGLAS_PROVEEDOR.porCategoria[categoria] ?? REGLAS_PROVEEDOR.porDefecto;
}

export function deducirColor(nombre) {
  const palabras = normalizarTexto(nombre).split(/[\s/()]+/);
  const encontrado = palabras.find(p => COLORES_CONOCIDOS[p]);
  return encontrado ? COLORES_CONOCIDOS[encontrado] : VALORES_POR_DEFECTO.color;
}

/** Busca un número de rin en el nombre (BIC 20…, ARO 16…, LLANTA 20X2.125…) */
export function deducirRin(nombre, categoria) {
  if (!CATEGORIAS_CON_RIN.includes(categoria)) return null;
  const texto = normalizarTexto(nombre);
  const coincidencias = texto.match(/(?<![\d.])\d{2,3}(?:\.5)?(?=[XC]|[^\dA-Z.]|$)/g) || [];
  return coincidencias.find(n => RINES_VALIDOS.includes(n)) ?? null;
}

export function deducirCompatibilidad(nombre, categoria, linea) {
  const etiquetas = [];
  const rin = deducirRin(nombre, categoria);
  if (rin) etiquetas.push(rin === "700" ? "Ruta 700C" : `Rin ${rin}`);
  const cc = normalizarTexto(nombre).match(/\b(\d{2,3})\s?CC\b/);
  if (cc) etiquetas.push(`Moto ${cc[1]}cc`);
  if (linea === "Moto" && !cc) etiquetas.push("Moto");
  return etiquetas;
}

// =========================================================
// Reglas de negocio (funciones puras)
// =========================================================

export const TEXTO_ESTADO = { normal: "Disponible", bajo: "Pocas unidades", agotado: "Agotado" };

/** "agotado" (0), "bajo" (≤ minStock) o "normal" */
export function estadoStock(producto) {
  const stock = Number(producto.stock) || 0;
  if (stock <= 0) return "agotado";
  if (stock <= (Number(producto.minStock) || 0)) return "bajo";
  return "normal";
}

/** Ganancias sobre el costo que aplican a una categoría: { publico, mayorista } */
export function gananciasPara(categoria) {
  const esBici = CATEGORIAS_BICICLETA.some(c => normalizarTexto(c) === normalizarTexto(categoria));
  return esBici ? GANANCIAS.bicicleta : GANANCIAS.repuesto;
}

/** Precio a partir del costo: costo × (1 + ganancia), a la centena más cercana. tipo = "publico" | "mayorista" */
export function precioSugerido(costo, categoria, tipo = "publico") {
  if (costo === null || costo === undefined || costo <= 0) return null;
  return redondearA(costo * (1 + gananciasPara(categoria)[tipo] / 100));
}

/** Los dos precios base (sin IVA) que salen del costo */
export function preciosDesdeCosto(costo, categoria) {
  return { precioPublicoBase: precioSugerido(costo, categoria, "publico"), precioMayorBase: precioSugerido(costo, categoria, "mayorista") };
}

/** margen = ((precio - costo) / precio) * 100; null si no hay costo. Se usa siempre con el precio BASE (el IVA no es ganancia) */
export function calcularMargen(precio, costo) {
  if (costo === null || costo === undefined || !precio || precio <= 0) return null;
  return ((precio - costo) / precio) * 100;
}

export function calcularUtilidad(precio, costo) {
  if (costo === null || costo === undefined || !precio) return null;
  return precio - costo;
}

// =========================================================
// Configuración: margen mínimo (general y por categoría) y datos de la tienda
// =========================================================

export function obtenerConfiguracion() {
  const guardada = leerLocal(CLAVES.configuracion, {});
  return {
    margenMinimo: guardada.margenMinimo ?? MARGEN_MINIMO,
    margenPorCategoria: guardada.margenPorCategoria ?? {},
    tienda: { ...DATOS_TIENDA_INICIALES, ...(guardada.tienda ?? {}) },
    consecutivoCotizacion: guardada.consecutivoCotizacion ?? 0,
    consecutivoOrden: guardada.consecutivoOrden ?? 0
  };
}

export function guardarConfiguracion(cambios) {
  const nueva = { ...obtenerConfiguracion(), ...cambios };
  if (!guardarLocal(CLAVES.configuracion, nueva)) throw new ErrorDatos("No se pudo guardar la configuración.", "almacenamiento");
  emitirCambio("configuracion");
  return nueva;
}

/** Margen mínimo que aplica a una categoría (el suyo o el general) */
export function margenMinimoPara(categoria) {
  const config = obtenerConfiguracion();
  const propio = config.margenPorCategoria[categoria];
  return propio === undefined || propio === null || propio === "" ? config.margenMinimo : Number(propio);
}

/**
 * Calculadora: precio sin IVA = costo / (1 - margen/100); el final (con IVA si aplica) se redondea
 * hacia arriba a la centena y la base sugerida es la que da exactamente ese final.
 * Devuelve { base, final } o null.
 */
export function precioParaMargen(costo, margen, aplicaIva = false) {
  if (costo === null || costo === undefined || costo < 0 || margen === null || margen === undefined || margen >= 100) return null;
  const sinIva = costo / (1 - margen / 100);
  if (!(sinIva > 0)) return null;
  const final = precioFinal({ precioPublicoBase: sinIva, aplicaIva }, "publico");
  return { base: baseParaPrecioFinal(final, aplicaIva), final };
}

/** Margen de un producto: sobre el precio final redondeado sin IVA (lo que realmente se cobra) */
export function margenProducto(p, tipo = "publico") {
  return calcularMargen(precioSinIva(p, tipo), p.costo);
}

/** ¿El producto está por debajo de su margen mínimo? (sin costo = no aplica) */
export function tieneMargenBajo(p) {
  const margen = margenProducto(p);
  return margen !== null && margen < margenMinimoPara(p.categoria);
}

export function estadoMargen(margen, minimo = obtenerConfiguracion().margenMinimo) {
  if (margen === null) return "sin-costo";
  if (margen < minimo) return "bajo";
  if (margen < minimo + 5) return "justo";
  return "ok";
}

/** Valor del inventario al precio final al público (con IVA en los productos que lo llevan) */
export function valorVenta(p) { return (precioFinal(p, "publico") || 0) * (p.stock || 0); }
export function valorCosto(p) { return (p.costo || 0) * (p.stock || 0); }

/**
 * Copia del producto apta para el catálogo público:
 * sin precio, costo, proveedor, seriales, historial ni cantidad exacta.
 */
export function productoPublico(producto) {
  const {
    precioPublicoBase, precioMayorBase, aplicaIva, precio, precioMayorista,
    costo, proveedorId, seriales, historial, stock, minStock, ...resto
  } = producto;
  return { ...resto, estado: estadoStock(producto) };
}

// =========================================================
// Estado en memoria
// =========================================================

const estado = {
  productos: [],
  proveedores: [],
  historial: [],
  meta: {}
};

function emitirCambio(motivo) {
  window.dispatchEvent(new CustomEvent("cv:datos", { detail: { motivo } }));
}

export class ErrorDatos extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

function persistirProductos() {
  if (!guardarLocal(CLAVES.productos, estado.productos)) {
    throw new ErrorDatos("No hay espacio suficiente en el navegador para guardar los cambios. Quita algunas imágenes.", "almacenamiento");
  }
}
function persistirHistorial() {
  guardarLocal(CLAVES.historial, estado.historial);
}
function persistirMeta() {
  guardarLocal(CLAVES.meta, estado.meta);
}

// =========================================================
// Normalización de productos
// =========================================================

/**
 * Completa y limpia un producto con todos los campos del modelo.
 * Los precios son BASE (sin IVA). Acepta los nombres anteriores `precio` / `precioMayorista`,
 * que también eran sin IVA. `aplicaIva` sale de la categoría si no viene.
 */
export function normalizarProducto(datos) {
  const categoria = limpiarTexto(datos.categoria) || VALORES_POR_DEFECTO.categoria;
  const costo = aNumero(datos.costo);
  const precioPublico = aNumero(datos.precioPublicoBase !== undefined ? datos.precioPublicoBase : datos.precio);
  const precioMayor = aNumero(datos.precioMayorBase !== undefined ? datos.precioMayorBase : datos.precioMayorista);
  const compat = Array.isArray(datos.compatibilidad)
    ? datos.compatibilidad
    : String(datos.compatibilidad ?? "").split(/[;,]/);
  return {
    id: datos.id || generarId(),
    referencia: limpiarTexto(datos.referencia),
    nombre: limpiarTexto(datos.nombre),
    linea: datos.linea === "Moto" ? "Moto" : "Bicicleta",
    categoria,
    marca: limpiarTexto(datos.marca) || VALORES_POR_DEFECTO.marca,
    proveedorId: datos.proveedorId || SIN_PROVEEDOR,
    costo: costo !== null && costo >= 0 ? costo : null,
    precioMayorBase: precioMayor !== null && precioMayor > 0 ? precioMayor : null,
    precioPublicoBase: precioPublico !== null && precioPublico > 0 ? precioPublico : null,
    aplicaIva: typeof datos.aplicaIva === "boolean" ? datos.aplicaIva : ivaPorCategoria(categoria),
    // Se aceptan hasta 2 decimales (hay productos por kilo o por metro)
    stock: Math.max(0, Math.round((aNumero(datos.stock) ?? 0) * 100) / 100),
    minStock: Math.max(0, Math.round(aNumero(datos.minStock) ?? VALORES_POR_DEFECTO.minStock)),
    color: limpiarTexto(datos.color) || VALORES_POR_DEFECTO.color,
    talla: limpiarTexto(datos.talla) || VALORES_POR_DEFECTO.talla,
    descripcion: limpiarTexto(datos.descripcion),
    compatibilidad: [...new Set(compat.map(limpiarTexto).filter(Boolean))],
    manejaSerial: Boolean(datos.manejaSerial),
    garantiaMeses: Math.max(0, Math.round(aNumero(datos.garantiaMeses) ?? 0)),
    imagen: datos.imagen || null,
    destacado: Boolean(datos.destacado),
    visibleCatalogo: datos.visibleCatalogo !== false,
    creado: datos.creado || ahora(),
    actualizado: datos.actualizado || ahora(),
    historial: Array.isArray(datos.historial) ? datos.historial : []
  };
}

// =========================================================
// Lectura del Excel
// =========================================================

function obtenerXLSX() {
  if (!window.XLSX) {
    throw new ErrorDatos("No se cargó la librería SheetJS. Revisa tu conexión a internet.", "sin-libreria");
  }
  return window.XLSX;
}

/** Busca en la fila el valor de una columna comparando encabezados sin tildes ni mayúsculas */
function crearLectorColumnas(fila, advertencias) {
  const indice = new Map(Object.keys(fila).map(k => [normalizarTexto(k), k]));
  const columnas = {};
  for (const [campo, encabezado] of Object.entries(MAPEO_COLUMNAS)) {
    if (!encabezado) {
      console.info(`[Excel] "${campo}" no tiene columna: se deduce o se usa el valor por defecto.`);
      continue;
    }
    const clave = indice.get(normalizarTexto(encabezado));
    if (clave) columnas[campo] = clave;
    else {
      const aviso = `La columna "${encabezado}" (${campo}) no existe en el Excel: se usa el valor por defecto.`;
      console.warn("[Excel]", aviso);
      advertencias.push(aviso);
    }
  }
  return (filaActual, campo) => (columnas[campo] ? filaActual[columnas[campo]] : null);
}

/** Convierte las filas del Excel original del local en productos */
function importarFormatoOriginal(filas) {
  const advertencias = [];
  if (!filas.length) return { productos: [], advertencias: ["La hoja está vacía."] };
  const valor = crearLectorColumnas(filas[0], advertencias);
  const productos = [];
  const referencias = new Map();
  let consecutivo = 0;
  let descartadas = 0;

  for (const fila of filas) {
    const nombre = limpiarTexto(valor(fila, "nombre"));
    const categoria = limpiarTexto(valor(fila, "categoria"));
    const stockBruto = aNumero(valor(fila, "stock"));
    // Filas vacías, la fila TOTAL y las notas del final se descartan
    if (!nombre || /^TOTAL$/i.test(nombre) || (!categoria && stockBruto === null)) {
      descartadas++;
      continue;
    }
    consecutivo++;

    let referencia = limpiarTexto(valor(fila, "referencia"))
      || `${PREFIJO_REFERENCIA}${String(consecutivo).padStart(4, "0")}`;
    const claveRef = normalizarTexto(referencia);
    if (referencias.has(claveRef)) {
      const veces = referencias.get(claveRef) + 1;
      referencias.set(claveRef, veces);
      advertencias.push(`Referencia duplicada "${referencia}" en "${nombre}": se renombró a "${referencia}-${veces}".`);
      referencia = `${referencia}-${veces}`;
    } else {
      referencias.set(claveRef, 1);
    }

    const lineaExcel = limpiarTexto(valor(fila, "linea"));
    const linea = /moto/i.test(lineaExcel) ? "Moto"
      : /bici/i.test(lineaExcel) ? "Bicicleta"
      : deducirLinea(nombre, categoria);

    // Costo 0 = el cuaderno no le puso valor → "Sin costo"
    let costo = aNumero(valor(fila, "costo"));
    if (!costo || costo <= 0) costo = null;

    const precioExcel = aNumero(valor(fila, "precio"));
    const rin = deducirRin(nombre, categoria);
    const esSerial = CATEGORIAS_CON_SERIAL.includes(categoria);
    const proveedorExcel = limpiarTexto(valor(fila, "proveedor"));

    productos.push(normalizarProducto({
      referencia,
      nombre,
      linea,
      categoria,
      marca: limpiarTexto(valor(fila, "marca")) || deducirMarca(nombre),
      proveedorId: proveedorExcel ? buscarProveedorPorNombre(proveedorExcel) : deducirProveedor(nombre, categoria),
      costo,
      // Los precios del Excel (o los calculados del costo) son SIN IVA
      precioPublicoBase: precioExcel && precioExcel > 0 ? precioExcel : precioSugerido(costo, categoria),
      precioMayorBase: precioSugerido(costo, categoria, "mayorista"),
      aplicaIva: ivaPorCategoria(categoria),
      stock: stockBruto ?? 0,
      minStock: aNumero(valor(fila, "minStock")) ?? VALORES_POR_DEFECTO.minStock,
      color: limpiarTexto(valor(fila, "color")) || deducirColor(nombre),
      talla: limpiarTexto(valor(fila, "talla")) || (esSerial && rin ? `Rin ${rin}` : VALORES_POR_DEFECTO.talla),
      compatibilidad: deducirCompatibilidad(nombre, categoria, linea),
      manejaSerial: esSerial,
      garantiaMeses: GARANTIA_POR_CATEGORIA[categoria] ?? 0
    }));
  }
  if (descartadas) console.info(`[Excel] ${descartadas} filas vacías o de totales descartadas.`);
  return { productos, advertencias };
}

// Columnas del Excel que genera "Exportar a Excel" (y que se puede volver a cargar).
// Al importar se leen solo los precios BASE y "Lleva IVA"; los finales son informativos.
const COLUMNAS_PRODUCTO = [
  ["id", "ID"], ["referencia", "Referencia"], ["nombre", "Nombre"], ["linea", "Línea"],
  ["categoria", "Categoría"], ["marca", "Marca"], ["proveedor", "Proveedor"], ["costo", "Costo"],
  ["precioMayorBase", "Precio al por mayor base (sin IVA)"], ["precioMayorFinal", "Precio al por mayor final"],
  ["precioPublicoBase", "Precio al público base (sin IVA)"], ["precioPublicoFinal", "Precio al público final"],
  ["aplicaIva", "Lleva IVA"], ["stock", "Stock"], ["minStock", "Stock mínimo"],
  ["color", "Color"], ["talla", "Talla"], ["descripcion", "Descripción"],
  ["compatibilidad", "Compatibilidad"], ["manejaSerial", "Maneja serial"],
  ["garantiaMeses", "Garantía (meses)"], ["destacado", "Destacado"],
  ["visibleCatalogo", "Visible en catálogo"], ["creado", "Creado"], ["actualizado", "Actualizado"]
];
const aBooleano = v => ["SI", "S", "TRUE", "1", "X", "VERDADERO"].includes(normalizarTexto(v));

/** Convierte las filas de un Excel exportado por esta misma aplicación */
function importarFormatoExportado(libro, XLSX) {
  const advertencias = [];
  const filas = XLSX.utils.sheet_to_json(libro.Sheets["Productos"], { defval: null });
  const hojaProv = libro.Sheets["Proveedores"];
  if (hojaProv) {
    const provs = XLSX.utils.sheet_to_json(hojaProv, { defval: null })
      .filter(f => f.ID && f.Nombre)
      .map(f => normalizarProveedor({
        id: String(f.ID), nombre: f.Nombre, nit: f.NIT, contacto: f.Contacto, telefono: f["Teléfono"],
        correo: f.Correo, ciudad: f.Ciudad, diasEntrega: f["Días de entrega"], notas: f.Notas
      }));
    if (provs.length) estado.proveedores = provs;
  }
  const vistas = new Set();
  const productos = [];
  for (const f of filas) {
    const dato = campo => f[COLUMNAS_PRODUCTO.find(c => c[0] === campo)[1]] ?? null;
    const nombre = limpiarTexto(dato("nombre"));
    if (!nombre) continue;
    let referencia = limpiarTexto(dato("referencia")) || `${PREFIJO_REFERENCIA}${productos.length + 1}`;
    if (vistas.has(normalizarTexto(referencia))) {
      advertencias.push(`Referencia duplicada "${referencia}": se agregó el sufijo "-B".`);
      referencia += "-B";
    }
    vistas.add(normalizarTexto(referencia));
    // Excel exportado antes del cambio de IVA: "Precio" y "Precio mayorista" ya eran sin IVA
    const publicoBase = dato("precioPublicoBase") ?? f["Precio"] ?? null;
    const mayorBase = dato("precioMayorBase") ?? f["Precio mayorista"]
      // Un Excel exportado antes de existir el precio al por mayor lo calcula del costo
      ?? precioSugerido(aNumero(dato("costo")), limpiarTexto(dato("categoria")), "mayorista");
    const llevaIvaExcel = dato("aplicaIva");
    productos.push(normalizarProducto({
      id: dato("id") ? String(dato("id")) : undefined,
      referencia, nombre,
      linea: /moto/i.test(dato("linea") || "") ? "Moto" : "Bicicleta",
      categoria: dato("categoria"), marca: dato("marca"),
      proveedorId: buscarProveedorPorNombre(dato("proveedor")),
      costo: dato("costo"),
      precioPublicoBase: publicoBase,
      precioMayorBase: mayorBase,
      // Sin la columna "Lleva IVA" se decide por la categoría
      aplicaIva: llevaIvaExcel === null || llevaIvaExcel === "" ? undefined : aBooleano(llevaIvaExcel),
      stock: dato("stock"), minStock: dato("minStock"),
      color: dato("color"), talla: dato("talla"), descripcion: dato("descripcion"),
      compatibilidad: String(dato("compatibilidad") ?? "").split(";"),
      manejaSerial: aBooleano(dato("manejaSerial")),
      garantiaMeses: dato("garantiaMeses"),
      destacado: aBooleano(dato("destacado")),
      visibleCatalogo: dato("visibleCatalogo") === null ? true : aBooleano(dato("visibleCatalogo")),
      creado: dato("creado") || undefined
    }));
  }
  return { productos, advertencias };
}

/** Lee un libro de Excel (ArrayBuffer) y devuelve los productos limpios */
export function leerLibroExcel(buffer) {
  const XLSX = obtenerXLSX();
  let libro;
  try {
    libro = XLSX.read(buffer, { type: "array" });
  } catch (error) {
    throw new ErrorDatos("El archivo no es un Excel válido.", "formato");
  }
  // ¿Es un Excel exportado por la propia aplicación?
  if (libro.SheetNames.includes("Productos")) {
    const encabezados = XLSX.utils.sheet_to_json(libro.Sheets["Productos"], { header: 1 })[0] || [];
    if (encabezados.includes("Referencia") && encabezados.includes("Nombre")) {
      return { ...importarFormatoExportado(libro, XLSX), formato: "exportado" };
    }
  }
  const nombreHoja = libro.SheetNames.find(n => normalizarTexto(n) === normalizarTexto(HOJA_EXCEL)) ?? libro.SheetNames[0];
  if (nombreHoja !== HOJA_EXCEL) console.warn(`[Excel] No se encontró la hoja "${HOJA_EXCEL}", se usa "${nombreHoja}".`);
  const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombreHoja], {
    range: FILA_ENCABEZADOS - 1, defval: null, raw: true
  });
  return { ...importarFormatoOriginal(filas), formato: "original" };
}

/** Descarga data/productos.xlsx con fetch */
export async function descargarExcel(ruta = RUTA_EXCEL) {
  let respuesta;
  try {
    respuesta = await fetch(ruta, { cache: "no-store" });
  } catch (error) {
    throw new ErrorDatos(`No se pudo leer "${ruta}". Abre el proyecto con Live Server.`, "no-encontrado");
  }
  if (!respuesta.ok) {
    throw new ErrorDatos(`No se encontró el archivo "${ruta}". Colócalo en la carpeta data/ o súbelo manualmente.`, "no-encontrado");
  }
  return respuesta.arrayBuffer();
}

// =========================================================
// Proveedores
// =========================================================

function normalizarProveedor(p) {
  return {
    id: p.id || generarId(),
    nombre: limpiarTexto(p.nombre),
    nit: limpiarTexto(p.nit), contacto: limpiarTexto(p.contacto), telefono: limpiarTexto(p.telefono),
    correo: limpiarTexto(p.correo), ciudad: limpiarTexto(p.ciudad), diasEntrega: limpiarTexto(p.diasEntrega),
    notas: limpiarTexto(p.notas), logo: p.logo || null
  };
}

export function obtenerProveedores() { return estado.proveedores; }

export function nombreProveedor(id) {
  if (!id || id === SIN_PROVEEDOR) return "Sin proveedor";
  return estado.proveedores.find(p => p.id === id)?.nombre ?? "Sin proveedor";
}

/** Relaciona un nombre del Excel con un proveedor (sin tildes ni mayúsculas) */
export function buscarProveedorPorNombre(nombre) {
  const buscado = normalizarTexto(nombre);
  if (!buscado) return SIN_PROVEEDOR;
  const encontrado = estado.proveedores.find(p =>
    normalizarTexto(p.nombre) === buscado || normalizarTexto(p.id) === buscado);
  return encontrado?.id ?? SIN_PROVEEDOR;
}

// =========================================================
// Inicialización
// =========================================================

/**
 * Carga los datos: si hay productos en localStorage se usan; si no, se lee el Excel.
 * Devuelve { origen: "local" | "excel", advertencias }
 */
export async function inicializarDatos() {
  await sincronizarConNube();
  estado.proveedores = leerLocal(CLAVES.proveedores, null)
    ?? PROVEEDORES_INICIALES.map(normalizarProveedor);
  guardarLocal(CLAVES.proveedores, estado.proveedores);
  estado.historial = leerLocal(CLAVES.historial, []);
  estado.meta = leerLocal(CLAVES.meta, {});

  const guardados = leerLocal(CLAVES.productos, null);
  if (Array.isArray(guardados) && guardados.length) {
    estado.productos = migrarProductos(guardados);
    if (estado.meta.versionPrecios !== VERSION_PRECIOS) recalcularPrecios();
    return { origen: "local", advertencias: [] };
  }
  const buffer = await descargarExcel();
  const resultado = aplicarImportacion(buffer, { archivo: RUTA_EXCEL });
  return { origen: "excel", ...resultado };
}

/**
 * Productos guardados antes del cambio de IVA: `precio` / `precioMayorista` (ya eran sin IVA)
 * pasan a `precioPublicoBase` / `precioMayorBase` y se agrega `aplicaIva` según la categoría.
 * Los valores no cambian. Si hubo cambios, se guardan.
 */
function migrarProductos(lista) {
  let migrados = 0;
  const resultado = lista.map(p => {
    if (typeof p.aplicaIva === "boolean" && !("precio" in p) && !("precioMayorista" in p)) return p;
    migrados++;
    return normalizarProducto(p);
  });
  if (migrados) {
    guardarLocal(CLAVES.productos, resultado);
    console.info(`[Precios] ${migrados} productos pasaron al modelo con precio base y "aplicaIva".`);
  }
  return resultado;
}

/**
 * Aplica las reglas de precios vigentes a todos los productos con costo
 * (también a los editados a mano). Se hace una sola vez por versión de las reglas.
 */
export function recalcularPrecios(admin = null) {
  let cambiados = 0;
  estado.productos = estado.productos.map(p => {
    if (!p.costo) return p;
    const nuevos = preciosDesdeCosto(p.costo, p.categoria);
    if (nuevos.precioPublicoBase === p.precioPublicoBase && nuevos.precioMayorBase === p.precioMayorBase) return p;
    cambiados++;
    return { ...p, ...nuevos };
  });
  persistirProductos();
  estado.meta = { ...estado.meta, versionPrecios: VERSION_PRECIOS };
  persistirMeta();
  const { bicicleta, repuesto } = GANANCIAS;
  registrarMovimiento({
    admin, tipo: "precio", modulo: "inventario",
    descripcion: `Recalculó los precios de ${cambiados} productos`,
    detalle: `Bicicletas: público +${bicicleta.publico} %, por mayor +${bicicleta.mayorista} % · Repuestos y accesorios: público +${repuesto.publico} %, por mayor +${repuesto.mayorista} % · a la centena más cercana`
  });
  return cambiados;
}

/** Reemplaza los productos con los del Excel, conservando imágenes e historial por referencia */
function aplicarImportacion(buffer, { archivo, admin } = {}) {
  const { productos, advertencias, formato } = leerLibroExcel(buffer);
  if (!productos.length) throw new ErrorDatos("El Excel no tiene productos válidos.", "vacio");

  const anteriores = new Map(estado.productos.map(p => [normalizarTexto(p.referencia), p]));
  for (const nuevo of productos) {
    const anterior = anteriores.get(normalizarTexto(nuevo.referencia));
    if (!anterior) continue;
    nuevo.imagen = nuevo.imagen || anterior.imagen;
    nuevo.historial = anterior.historial || [];
    if (formato === "original") {
      // El Excel original no trae estos datos: se conservan los editados en la app
      nuevo.id = anterior.id;
      nuevo.destacado = anterior.destacado;
      nuevo.visibleCatalogo = anterior.visibleCatalogo;
      nuevo.descripcion = anterior.descripcion;
    }
  }
  estado.productos = productos;
  persistirProductos();
  guardarLocal(CLAVES.proveedores, estado.proveedores);
  estado.meta = { ...estado.meta, origen: "excel", archivo, formato, fechaCarga: ahora(), total: productos.length, versionPrecios: VERSION_PRECIOS };
  persistirMeta();
  if (admin) {
    registrarMovimiento({
      admin, tipo: "importacion", modulo: "inventario",
      descripcion: `Recargó el inventario desde Excel (${productos.length} productos)`
    });
  }
  if (advertencias.length) console.warn("[Excel] Advertencias:", advertencias);
  emitirCambio("importacion");
  return { total: productos.length, advertencias, formato };
}

// =========================================================
// Catálogo público publicado (sin precios, costos, proveedor ni stock exacto)
// =========================================================

/** Arma el catálogo público a partir del inventario del administrador */
export function generarCatalogoPublico(lista = estado.productos) {
  const productos = lista.filter(p => p.visibleCatalogo).map(productoPublico);
  return { generado: ahora(), total: productos.length, productos };
}

/**
 * Datos para la vista pública, en este orden:
 * 1) el inventario guardado en este navegador (el administrador ve sus cambios al instante);
 * 2) data/catalogo.json (lo que ven los clientes en internet);
 * 3) el Excel local (solo en el PC de desarrollo, donde existe data/productos.xlsx).
 * Devuelve { origen, productos } con productos ya sin precios.
 */
export async function cargarCatalogoPublico() {
  const locales = leerLocal(CLAVES.productos, null);
  if (Array.isArray(locales) && locales.length) {
    estado.productos = migrarProductos(locales);
    return { origen: "local", productos: generarCatalogoPublico().productos };
  }
  const enNube = await bajarCatalogoPublico().catch(() => null);
  if (enNube?.productos?.length) {
    return { origen: "publicado", productos: enNube.productos, generado: enNube.generado };
  }
  try {
    const respuesta = await fetch(RUTA_CATALOGO_PUBLICO, { cache: "no-cache" });
    if (respuesta.ok) {
      const datos = await respuesta.json();
      if (Array.isArray(datos.productos) && datos.productos.length) {
        return { origen: "publicado", productos: datos.productos, generado: datos.generado };
      }
    }
  } catch (error) {
    console.info("[Catálogo] No hay catálogo publicado, se intenta con el Excel local.");
  }
  const { origen } = await inicializarDatos();
  return { origen, productos: generarCatalogoPublico().productos };
}

/** "Recargar desde Excel": desde data/productos.xlsx o desde un archivo subido */
export async function recargarDesdeExcel(admin, archivo = null) {
  const buffer = archivo ? await archivo.arrayBuffer() : await descargarExcel();
  return aplicarImportacion(buffer, { archivo: archivo ? archivo.name : RUTA_EXCEL, admin });
}

// =========================================================
// Consultas
// =========================================================

export function obtenerProductos() { return estado.productos; }
export function obtenerProducto(id) { return estado.productos.find(p => p.id === id) ?? null; }
export function buscarPorReferencia(ref) {
  const buscada = normalizarTexto(ref);
  return estado.productos.find(p => normalizarTexto(p.referencia) === buscada) ?? null;
}
export function obtenerHistorialGlobal() { return estado.historial; }
export function obtenerMeta() { return estado.meta; }

/** ¿Ya existe esa referencia en otro producto? */
export function existeReferencia(referencia, exceptoId = null) {
  const buscada = normalizarTexto(referencia);
  return estado.productos.some(p => p.id !== exceptoId && normalizarTexto(p.referencia) === buscada);
}

/** Siguiente referencia libre CV-XXXX para sugerir en el formulario */
export function siguienteReferencia() {
  const patron = new RegExp(`^${PREFIJO_REFERENCIA}(\\d+)$`);
  const maximo = estado.productos.reduce((max, p) => {
    const m = p.referencia.match(patron);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `${PREFIJO_REFERENCIA}${String(maximo + 1).padStart(4, "0")}`;
}

/** Valores únicos y ordenados de un campo (map + Set + sort) */
export function valoresUnicos(lista, campo) {
  const valores = lista.flatMap(p => (Array.isArray(p[campo]) ? p[campo] : [p[campo]]));
  return [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

/** Productos que comparten alguna etiqueta de compatibilidad */
export function productosCompatibles(producto, lista, maximo = 10) {
  if (!producto.compatibilidad?.length) return [];
  const etiquetas = new Set(producto.compatibilidad);
  return lista
    .filter(p => p.id !== producto.id && p.compatibilidad?.some(e => etiquetas.has(e)))
    .slice(0, maximo);
}

// =========================================================
// Historial
// =========================================================

const MAX_HISTORIAL_GLOBAL = 3000;

/**
 * Registra un movimiento en el historial global y, si aplica, en el del producto.
 * admin = { usuario, nombre }
 */
export function registrarMovimiento({ admin, tipo, modulo = "inventario", descripcion, detalle = "", producto = null }) {
  const entrada = {
    id: generarId(),
    fecha: ahora(),
    tipo, modulo, descripcion, detalle,
    admin: admin?.nombre ?? "Sistema",
    usuario: admin?.usuario ?? "",
    productoId: producto?.id ?? null,
    referencia: producto?.referencia ?? null,
    nombreProducto: producto?.nombre ?? null
  };
  if (producto) producto.historial = [entrada, ...(producto.historial || [])];
  estado.historial = [entrada, ...estado.historial].slice(0, MAX_HISTORIAL_GLOBAL);
  persistirHistorial();
  return entrada;
}

// =========================================================
// CRUD de productos
// =========================================================

const formatoPesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const pesos = v => (v === null || v === undefined ? "sin valor" : formatoPesos.format(v));

export function crearProducto(datos, admin) {
  const producto = normalizarProducto({ ...datos, id: undefined, historial: [] });
  if (!producto.nombre || !producto.referencia) throw new ErrorDatos("Nombre y referencia son obligatorios.", "validacion");
  if (existeReferencia(producto.referencia)) throw new ErrorDatos(`La referencia "${producto.referencia}" ya existe.`, "duplicado");
  estado.productos = [producto, ...estado.productos];
  registrarMovimiento({
    admin, tipo: "creado", producto,
    descripcion: `Creó el producto ${producto.nombre}`,
    detalle: `Al por mayor ${pesos(precioFinal(producto, "mayor"))} · Al público ${pesos(precioFinal(producto, "publico"))}${producto.aplicaIva ? " (IVA incluido)" : ""} · Stock ${producto.stock}`
  });
  try {
    persistirProductos();
  } catch (error) {
    estado.productos = estado.productos.filter(p => p.id !== producto.id);
    throw error;
  }
  emitirCambio("crear");
  return producto;
}

const NOMBRES_CAMPO = {
  referencia: "referencia", nombre: "nombre", linea: "línea", categoria: "categoría", marca: "marca",
  proveedorId: "proveedor", minStock: "stock mínimo", color: "color", talla: "talla",
  descripcion: "descripción", compatibilidad: "compatibilidad", manejaSerial: "maneja serial",
  garantiaMeses: "garantía"
};

/** Actualiza un producto y deja en el historial cada cambio importante */
export function actualizarProducto(id, cambios, admin, { motivoStock = "Ajuste" } = {}) {
  const indice = estado.productos.findIndex(p => p.id === id);
  if (indice === -1) throw new ErrorDatos("El producto ya no existe.", "no-existe");
  const anterior = estado.productos[indice];
  const actualizado = normalizarProducto({ ...anterior, ...cambios, id, historial: anterior.historial, actualizado: ahora() });

  if (!actualizado.nombre || !actualizado.referencia) throw new ErrorDatos("Nombre y referencia son obligatorios.", "validacion");
  if (existeReferencia(actualizado.referencia, id)) throw new ErrorDatos(`La referencia "${actualizado.referencia}" ya existe.`, "duplicado");

  const movimientos = [];
  // Las bicicletas (sin IVA) no llevan ninguna mención de IVA, tampoco en el historial
  const textoBase = actualizado.aplicaIva ? "Base sin IVA " : "";
  const textoFinal = (tipo) => (actualizado.aplicaIva ? ` · final ${pesos(precioFinal(actualizado, tipo))}` : "");
  if (anterior.precioPublicoBase !== actualizado.precioPublicoBase) {
    const margen = margenProducto(actualizado);
    movimientos.push({ tipo: "precio", descripcion: "Cambió el precio al público",
      detalle: `${textoBase}${pesos(anterior.precioPublicoBase)} → ${pesos(actualizado.precioPublicoBase)}${textoFinal("publico")}${margen !== null ? ` · margen ${margen.toFixed(1).replace(".", ",")} %` : ""}` });
  }
  if (anterior.precioMayorBase !== actualizado.precioMayorBase) {
    movimientos.push({ tipo: "precio", descripcion: "Cambió el precio al por mayor",
      detalle: `${textoBase}${pesos(anterior.precioMayorBase)} → ${pesos(actualizado.precioMayorBase)}${textoFinal("mayor")}` });
  }
  if (anterior.aplicaIva !== actualizado.aplicaIva) {
    movimientos.push({ tipo: "precio", descripcion: actualizado.aplicaIva ? `Marcó que lleva IVA ${PORCENTAJE_IVA} %` : "Marcó que no lleva IVA",
      detalle: `Al público ${pesos(precioFinal(anterior, "publico"))} → ${pesos(precioFinal(actualizado, "publico"))}` });
  }
  if (anterior.costo !== actualizado.costo) {
    movimientos.push({ tipo: "costo", descripcion: "Cambió el costo", detalle: `${pesos(anterior.costo)} → ${pesos(actualizado.costo)}` });
  }
  if (anterior.stock !== actualizado.stock) {
    const diferencia = actualizado.stock - anterior.stock;
    movimientos.push({ tipo: "stock", descripcion: `${motivoStock}: ${diferencia > 0 ? "+" : ""}${diferencia} und`,
      detalle: `${anterior.stock} → ${actualizado.stock}` });
  }
  if (anterior.imagen !== actualizado.imagen) {
    movimientos.push({ tipo: "imagen", descripcion: actualizado.imagen ? (anterior.imagen ? "Reemplazó la imagen" : "Agregó imagen") : "Quitó la imagen" });
  }
  if (anterior.visibleCatalogo !== actualizado.visibleCatalogo) {
    movimientos.push({ tipo: "visibilidad", descripcion: actualizado.visibleCatalogo ? "Mostró el producto en el catálogo" : "Ocultó el producto del catálogo" });
  }
  if (anterior.destacado !== actualizado.destacado) {
    movimientos.push({ tipo: "destacado", descripcion: actualizado.destacado ? "Marcó como destacado" : "Quitó de destacados" });
  }
  const otros = Object.keys(NOMBRES_CAMPO).filter(c =>
    JSON.stringify(anterior[c]) !== JSON.stringify(actualizado[c]));
  if (otros.length) {
    movimientos.push({ tipo: "editado", descripcion: "Editó el producto", detalle: `Cambió: ${otros.map(c => NOMBRES_CAMPO[c]).join(", ")}` });
  }
  if (!movimientos.length) return anterior;

  estado.productos[indice] = actualizado;
  try {
    persistirProductos();
  } catch (error) {
    estado.productos[indice] = anterior;
    throw error;
  }
  for (const m of movimientos) {
    registrarMovimiento({ admin, producto: actualizado, ...m, descripcion: m.descripcion });
  }
  persistirProductos();
  emitirCambio("actualizar");
  return actualizado;
}

export function eliminarProducto(id, admin) {
  const producto = obtenerProducto(id);
  if (!producto) return;
  estado.productos = estado.productos.filter(p => p.id !== id);
  persistirProductos();
  registrarMovimiento({
    admin, tipo: "eliminado",
    descripcion: `Eliminó el producto ${producto.nombre}`,
    detalle: `Referencia ${producto.referencia}`
  });
  emitirCambio("eliminar");
}

/** Ajuste rápido de stock: delta positivo (entrada) o negativo (salida) */
export function ajustarStock(id, delta, motivo, admin, nota = "") {
  const producto = obtenerProducto(id);
  if (!producto) throw new ErrorDatos("El producto ya no existe.", "no-existe");
  const nuevo = producto.stock + delta;
  if (nuevo < 0) throw new ErrorDatos(`No hay suficientes unidades: el stock actual es ${producto.stock}.`, "stock");
  return actualizarProducto(id, { stock: nuevo }, admin, { motivoStock: nota ? `${motivo} (${nota})` : motivo });
}

// =========================================================
// Exportar a Excel
// =========================================================

export function exportarExcel() {
  const XLSX = obtenerXLSX();
  const libro = XLSX.utils.book_new();

  const filasProductos = estado.productos.map(p => {
    const fila = {};
    for (const [campo, encabezado] of COLUMNAS_PRODUCTO) {
      let v = p[campo];
      if (campo === "proveedor") v = nombreProveedor(p.proveedorId);
      // Precios finales calculados al exportar (no se guardan); el al por mayor solo si tiene base propia
      if (campo === "precioPublicoFinal") v = precioFinal(p, "publico");
      if (campo === "precioMayorFinal") v = p.precioMayorBase ? precioFinal(p, "mayor") : null;
      if (campo === "compatibilidad") v = (p.compatibilidad || []).join("; ");
      if (typeof v === "boolean") v = v ? "Sí" : "No";
      fila[encabezado] = v ?? "";
    }
    return fila;
  });
  const hojaProductos = XLSX.utils.json_to_sheet(filasProductos, { header: COLUMNAS_PRODUCTO.map(c => c[1]) });
  hojaProductos["!cols"] = COLUMNAS_PRODUCTO.map(([c]) => ({ wch: c === "nombre" ? 48 : c === "id" ? 12 : /^precio/.test(c) ? 22 : 14 }));
  XLSX.utils.book_append_sheet(libro, hojaProductos, "Productos");

  const filasProveedores = estado.proveedores.map(p => ({
    ID: p.id, Nombre: p.nombre, NIT: p.nit, Contacto: p.contacto, "Teléfono": p.telefono,
    Correo: p.correo, Ciudad: p.ciudad, "Días de entrega": p.diasEntrega, Notas: p.notas
  }));
  XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasProveedores), "Proveedores");

  // Cotizaciones: una fila por ítem
  const filasCotizaciones = obtenerCotizaciones().flatMap(c => c.items.map(i => ({
    "Número": c.numero, Fecha: c.fecha.slice(0, 10), Cliente: c.cliente.nombre, "Teléfono": c.cliente.telefono,
    Estado: estadoCotizacion(c), Referencia: i.referencia, Producto: i.nombre, Cantidad: i.cantidad,
    "Precio und": i.precio, "Costo und": i.costo ?? "", "Desc. línea %": i.descuento,
    "Desc. general %": c.descuentoGeneral, "Total cotización": c.totales.total, Administrador: c.admin
  })));
  XLSX.utils.book_append_sheet(libro, filasCotizaciones.length
    ? XLSX.utils.json_to_sheet(filasCotizaciones)
    : XLSX.utils.aoa_to_sheet([["Número", "Fecha", "Cliente", "Estado", "Total cotización"]]), "Cotizaciones");

  // Hojas de módulos de las siguientes fases (vacías por ahora si no hay datos)
  const hojas = [
    ["Ordenes de taller", obtenerOrdenes().map(o => ({
      "Número": o.numero, Estado: o.estado, Ingreso: o.fechaIngreso, "Entrega estimada": o.fechaEstimada,
      Entregada: o.fechaEntrega ? o.fechaEntrega.slice(0, 10) : "", Cliente: o.cliente.nombre, "Teléfono": o.cliente.telefono,
      "Vehículo": `${o.vehiculo.tipo} ${o.vehiculo.marca} ${o.vehiculo.modelo}`.trim(), Serial: o.vehiculo.serial,
      Trabajo: o.trabajo, "Diagnóstico": o.diagnostico, Responsable: o.responsable,
      Repuestos: o.repuestos.map(r => `${r.cantidad} × ${r.referencia}`).join("; "),
      "Mano de obra": o.manoObra.map(m => `${m.descripcion} (${m.valor})`).join("; "),
      Total: totalesOrden(o).total
    })), ["Número", "Estado", "Cliente", "Vehículo", "Total"]],
    ["Seriales", obtenerSeriales().map(s => ({
      Serial: s.serial, Referencia: s.referencia, Producto: s.nombreProducto, Estado: s.estado,
      Cliente: s.cliente?.nombre ?? "", "Fecha venta": s.fechaVenta ? s.fechaVenta.slice(0, 10) : "", "Cotización": s.cotizacion ?? "", Nota: s.nota
    })), ["Serial", "Referencia", "Estado", "Cliente", "Fecha venta"]],
    ["Garantias", obtenerGarantias().map(g => ({
      Producto: g.nombreProducto, Referencia: g.referencia, Serial: g.serial ?? "", Cliente: g.cliente.nombre,
      "Teléfono": g.cliente.telefono, "Fecha venta": g.fechaVenta.slice(0, 10), Meses: g.meses, Vence: g.vence.slice(0, 10),
      Estado: estadoGarantia(g), "Cotización": g.cotizacion, Reclamos: (g.reclamos || []).length
    })), ["Producto", "Serial", "Cliente", "Vence", "Estado"]]
  ];
  for (const [nombre, filas, encabezados] of hojas) {
    const hoja = filas.length ? XLSX.utils.json_to_sheet(filas) : XLSX.utils.aoa_to_sheet([encabezados]);
    XLSX.utils.book_append_sheet(libro, hoja, nombre);
  }

  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `CicloVictoria_inventario_${fecha}.xlsx`);
  return filasProductos.length;
}

/** Recarga los datos si otra pestaña los cambió */
export function sincronizarDesdeAlmacen() {
  estado.productos = migrarProductos(leerLocal(CLAVES.productos, estado.productos));
  estado.proveedores = leerLocal(CLAVES.proveedores, estado.proveedores);
  estado.historial = leerLocal(CLAVES.historial, estado.historial);
}

// =========================================================
// Filtros y orden (compartidos por catálogo público y admin)
// =========================================================

const cacheBusqueda = new WeakMap();
function textoBusqueda(p) {
  if (!cacheBusqueda.has(p)) {
    cacheBusqueda.set(p, normalizarTexto([p.nombre, p.marca, p.categoria, p.referencia, p.color, p.talla, ...(p.compatibilidad || [])].join(" ")));
  }
  return cacheBusqueda.get(p);
}

/**
 * filtros: { texto, referencia, linea, categoria, marca, color, talla, compat,
 *            existencia: "con"|"todos", proveedor, estado, visibilidad: "visibles"|"ocultos"|"" }
 * Sirve para productos completos (admin) o públicos (usa p.estado).
 */
export function filtrarProductos(lista, f = {}) {
  const palabras = normalizarTexto(f.texto).split(" ").filter(Boolean);
  const referencia = normalizarTexto(f.referencia);
  return lista.filter(p => {
    const estadoP = p.estado ?? estadoStock(p);
    if (f.linea && f.linea !== "Todas" && p.linea !== f.linea) return false;
    if (f.existencia === "con" && estadoP === "agotado") return false;
    if (f.categoria && p.categoria !== f.categoria) return false;
    if (f.marca && p.marca !== f.marca) return false;
    if (f.color && p.color !== f.color) return false;
    if (f.talla && p.talla !== f.talla) return false;
    if (f.compat && !(p.compatibilidad || []).includes(f.compat)) return false;
    if (f.proveedor && p.proveedorId !== f.proveedor) return false;
    if (f.estado === "reabastecer") { if (estadoP === "normal") return false; }
    else if (f.estado && estadoP !== f.estado) return false;
    if (f.visibilidad === "visibles" && !p.visibleCatalogo) return false;
    if (f.visibilidad === "ocultos" && p.visibleCatalogo) return false;
    if (f.margen === "bajo" && !tieneMargenBajo(p)) return false;
    if (f.margen === "sin-costo" && p.costo !== null) return false;
    if (referencia && !normalizarTexto(p.referencia).includes(referencia)) return false;
    if (palabras.length) {
      const texto = textoBusqueda(p);
      if (!palabras.every(palabra => texto.includes(palabra))) return false;
    }
    return true;
  });
}

const PESO_ESTADO = { normal: 0, bajo: 1, agotado: 2 };
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true });

/** Ordena siempre sobre una copia ([...lista]) */
export function ordenarProductos(lista, orden = "az") {
  const copia = [...lista];
  const nulosAlFinal = (va, vb, asc) => {
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return asc ? va - vb : vb - va;
  };
  const comparadores = {
    az: porNombre,
    za: (a, b) => porNombre(b, a),
    disponibilidad: (a, b) => PESO_ESTADO[a.estado ?? estadoStock(a)] - PESO_ESTADO[b.estado ?? estadoStock(b)] || porNombre(a, b),
    "precio-asc": (a, b) => nulosAlFinal(precioFinal(a), precioFinal(b), true),
    "precio-desc": (a, b) => nulosAlFinal(precioFinal(a), precioFinal(b), false),
    "stock-asc": (a, b) => a.stock - b.stock || porNombre(a, b),
    "stock-desc": (a, b) => b.stock - a.stock || porNombre(a, b),
    "valor-desc": (a, b) => valorVenta(b) - valorVenta(a),
    "margen-asc": (a, b) => nulosAlFinal(margenProducto(a), margenProducto(b), true),
    "margen-desc": (a, b) => nulosAlFinal(margenProducto(a), margenProducto(b), false),
    recientes: (a, b) => (b.actualizado || "").localeCompare(a.actualizado || "")
  };
  return copia.sort(comparadores[orden] ?? porNombre);
}

// =========================================================
// Proveedores: CRUD y estadísticas
// =========================================================

function persistirProveedores() {
  if (!guardarLocal(CLAVES.proveedores, estado.proveedores)) {
    throw new ErrorDatos("No se pudo guardar el proveedor (almacenamiento lleno).", "almacenamiento");
  }
}

export function obtenerProveedor(id) { return estado.proveedores.find(p => p.id === id) ?? null; }

export function crearProveedor(datos, admin) {
  const proveedor = normalizarProveedor({ ...datos, id: undefined });
  if (!proveedor.nombre) throw new ErrorDatos("El nombre del proveedor es obligatorio.", "validacion");
  if (estado.proveedores.some(p => normalizarTexto(p.nombre) === normalizarTexto(proveedor.nombre))) {
    throw new ErrorDatos(`Ya existe un proveedor llamado "${proveedor.nombre}".`, "duplicado");
  }
  estado.proveedores = [...estado.proveedores, proveedor];
  persistirProveedores();
  registrarMovimiento({ admin, tipo: "proveedor", modulo: "proveedores", descripcion: `Creó el proveedor ${proveedor.nombre}` });
  emitirCambio("proveedores");
  return proveedor;
}

export function actualizarProveedor(id, cambios, admin) {
  const indice = estado.proveedores.findIndex(p => p.id === id);
  if (indice === -1) throw new ErrorDatos("El proveedor ya no existe.", "no-existe");
  const actualizado = normalizarProveedor({ ...estado.proveedores[indice], ...cambios, id });
  if (!actualizado.nombre) throw new ErrorDatos("El nombre del proveedor es obligatorio.", "validacion");
  if (estado.proveedores.some(p => p.id !== id && normalizarTexto(p.nombre) === normalizarTexto(actualizado.nombre))) {
    throw new ErrorDatos(`Ya existe un proveedor llamado "${actualizado.nombre}".`, "duplicado");
  }
  const anterior = estado.proveedores[indice];
  estado.proveedores[indice] = actualizado;
  try { persistirProveedores(); } catch (e) { estado.proveedores[indice] = anterior; throw e; }
  registrarMovimiento({ admin, tipo: "proveedor", modulo: "proveedores", descripcion: `Editó el proveedor ${actualizado.nombre}` });
  emitirCambio("proveedores");
  return actualizado;
}

export function productosDeProveedor(id) {
  return estado.productos.filter(p => p.proveedorId === id);
}

/**
 * Elimina un proveedor. Si tiene productos hay que indicar a quién se reasignan
 * (otro id o SIN_PROVEEDOR); si no se indica, no se permite eliminar.
 */
export function eliminarProveedor(id, admin, reasignarA = null) {
  const proveedor = obtenerProveedor(id);
  if (!proveedor) return;
  const asociados = productosDeProveedor(id);
  if (asociados.length && !reasignarA) {
    throw new ErrorDatos(`${proveedor.nombre} tiene ${asociados.length} productos asociados. Reasígnalos antes de eliminarlo.`, "asociados");
  }
  if (asociados.length) {
    const fecha = ahora();
    estado.productos = estado.productos.map(p => p.proveedorId === id ? { ...p, proveedorId: reasignarA, actualizado: fecha } : p);
    persistirProductos();
  }
  estado.proveedores = estado.proveedores.filter(p => p.id !== id);
  persistirProveedores();
  registrarMovimiento({
    admin, tipo: "proveedor", modulo: "proveedores",
    descripcion: `Eliminó el proveedor ${proveedor.nombre}`,
    detalle: asociados.length ? `${asociados.length} productos pasaron a ${nombreProveedor(reasignarA)}` : ""
  });
  emitirCambio("proveedores");
}

/** Números de un proveedor: productos, unidades, valores, margen promedio y stock bajo */
export function estadisticasProveedor(id) {
  const lista = productosDeProveedor(id);
  const margenes = lista.map(p => margenProducto(p)).filter(m => m !== null);
  return {
    productos: lista.length,
    unidades: lista.reduce((s, p) => s + p.stock, 0),
    valorCosto: lista.reduce((s, p) => s + valorCosto(p), 0),
    valorVenta: lista.reduce((s, p) => s + valorVenta(p), 0),
    margenPromedio: margenes.length ? margenes.reduce((a, b) => a + b, 0) / margenes.length : null,
    stockBajo: lista.filter(p => estadoStock(p) !== "normal"),
    margenBajo: lista.filter(tieneMargenBajo).length
  };
}

// =========================================================
// Totales de cotización (función pura)
// =========================================================

/**
 * items: [{ precio, aplicaIva, costo, cantidad, descuento }]  (descuento de línea en %)
 * descuentoGeneral: % aplicado sobre el subtotal ya descontado por línea.
 * regla:
 *  - REGLA_IVA.redondeado (vigente): `precio` es el precio final ya redondeado; NO se suma IVA.
 *    Cada valor de línea (cantidad × precio, con descuento de línea y con descuento general)
 *    se redondea hacia arriba a la centena, así que el total también queda en centenas.
 *    `ivaIncluido` es el desglose informativo hacia atrás, solo de los ítems con aplicaIva.
 *  - REGLA_IVA.incluido: igual pero sin redondeo (cotizaciones guardadas el 01/10/2026).
 *  - REGLA_IVA.aparte: cotizaciones y órdenes anteriores, con el IVA sumado sobre la base.
 * `base` es siempre el valor sin IVA, contra el que se calculan la utilidad y el margen.
 * Todo redondeado a pesos.
 */
export function calcularTotales(items = [], descuentoGeneral = 0, regla = REGLA_IVA.redondeado) {
  const incluido = regla !== REGLA_IVA.aparte;
  const conRedondeo = regla === REGLA_IVA.redondeado;
  const redondear = valor => (conRedondeo ? redondearArriba(valor) : valor);
  const dg = Math.min(100, Math.max(0, Number(descuentoGeneral) || 0));
  const lineas = items.map(item => {
    const cantidad = Number(item.cantidad) || 0;
    const precio = Number(item.precio) || 0;
    const descuento = Math.min(100, Math.max(0, Number(item.descuento) || 0));
    const bruto = redondear(precio * cantidad);
    const neto = redondear(bruto * (1 - descuento / 100));
    const descuentoLinea = bruto - neto;
    const conIva = incluido && item.aplicaIva === true;
    // Lo que paga el cliente por la línea con los dos descuentos (el general también se redondea por línea)
    const cobrado = redondear(neto * (1 - dg / 100));
    const descuentoGeneralLinea = neto - cobrado;
    const ivaLinea = conIva ? ivaIncluidoEn(cobrado) : 0;
    // Precio unitario final sin IVA con los dos descuentos, para compararlo con el costo
    const unitarioFinal = conRedondeo ? (cantidad ? cobrado / cantidad : 0) : precio * (1 - descuento / 100) * (1 - dg / 100);
    const unitarioSinIva = conIva ? quitarIva(unitarioFinal) : unitarioFinal;
    const bajoCosto = item.costo !== null && item.costo !== undefined && unitarioSinIva < item.costo;
    return { bruto, descuentoLinea, neto, cobrado, descuentoGeneralLinea, unitarioFinal, ivaLinea, bajoCosto };
  });
  const subtotal = lineas.reduce((s, l) => s + l.bruto, 0);
  const descuentoLineas = lineas.reduce((s, l) => s + l.descuentoLinea, 0);
  const descuentoGeneralValor = lineas.reduce((s, l) => s + l.descuentoGeneralLinea, 0);
  const descuentos = descuentoLineas + descuentoGeneralValor;
  const conCosto = items.every(i => i.costo !== null && i.costo !== undefined);
  const costo = items.reduce((s, i) => s + (Number(i.costo) || 0) * (Number(i.cantidad) || 0), 0);
  const r = v => Math.round(v);
  const comunes = {
    lineas,
    subtotal: r(subtotal),
    descuentoLineas: r(descuentoLineas),
    descuentoGeneral: r(descuentoGeneralValor),
    descuentos: r(descuentos),
    costo: r(costo),
    utilidadCompleta: conCosto,
    unidades: items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0)
  };
  if (incluido) {
    const total = r(subtotal - descuentos);
    const ivaIncluido = r(lineas.reduce((s, l) => s + l.ivaLinea, 0));
    const base = total - ivaIncluido;
    return { ...comunes, regla, total, ivaIncluido, base, utilidad: base - r(costo) };
  }
  const base = subtotal - descuentos;
  const iva = ivaAparteSobre(base);
  return { ...comunes, regla: REGLA_IVA.aparte, base: r(base), iva: r(iva), total: r(base) + r(iva), utilidad: r(base - costo) };
}

// =========================================================
// Cotizaciones
// =========================================================

export function obtenerCotizaciones() { return leerLocal(CLAVES.cotizaciones, []); }
export function obtenerCotizacion(id) { return obtenerCotizaciones().find(c => c.id === id) ?? null; }

function persistirCotizaciones(lista) {
  if (!guardarLocal(CLAVES.cotizaciones, lista)) throw new ErrorDatos("No se pudo guardar la cotización (almacenamiento lleno).", "almacenamiento");
  emitirCambio("cotizaciones");
}

/** Estado efectivo: Borrador o Enviada pasan solas a "Vencida" cuando se cumple la fecha */
export function estadoCotizacion(cotizacion, hoy = new Date()) {
  if (["Borrador", "Enviada"].includes(cotizacion.estado) && cotizacion.venceEl) {
    const vence = new Date(cotizacion.venceEl);
    vence.setHours(23, 59, 59, 999);
    if (hoy > vence) return "Vencida";
  }
  return cotizacion.estado;
}

function fechaVencimiento(desde, dias) {
  const fecha = new Date(desde);
  fecha.setDate(fecha.getDate() + Number(dias || 0));
  return fecha.toISOString();
}

/** Copia de los ítems con el precio y el costo del momento */
function copiarItems(items) {
  return items.map(i => ({
    productoId: i.productoId, referencia: i.referencia, nombre: i.nombre,
    precio: Number(i.precio) || 0, aplicaIva: i.aplicaIva === true, costo: i.costo ?? null,
    cantidad: Number(i.cantidad) || 0, descuento: Number(i.descuento) || 0
  }));
}

/** Regla de IVA de una cotización u orden: las guardadas antes del cambio no la tienen y conservan la anterior */
export const reglaIvaDe = documento => documento?.reglaIva ?? REGLA_IVA.aparte;

/** Totales sin el detalle por línea (lo que se guarda en la cotización) */
function resumenTotales(items, descuentoGeneral, regla) {
  const { lineas, ...resto } = calcularTotales(items, descuentoGeneral, regla);
  return resto;
}

function entradaCotizacion(admin, descripcion, detalle = "") {
  return { id: generarId(), fecha: ahora(), descripcion, detalle, admin: admin?.nombre ?? "Sistema" };
}

export function crearCotizacion({ cliente, validezDias = VALIDEZ_COTIZACION_DIAS, observaciones = "", items, descuentoGeneral = 0, tipoPrecio = "publico" }, admin) {
  if (!items?.length) throw new ErrorDatos("El carrito está vacío.", "validacion");
  if (!limpiarTexto(cliente?.nombre)) throw new ErrorDatos("El nombre del cliente es obligatorio.", "validacion");
  const consecutivo = obtenerConfiguracion().consecutivoCotizacion + 1;
  const numero = `${PREFIJO_COTIZACION}${String(consecutivo).padStart(4, "0")}`;
  const fecha = ahora();
  const copia = copiarItems(items);
  const cotizacion = {
    id: generarId(), numero, fecha,
    cliente: { nombre: limpiarTexto(cliente.nombre), telefono: limpiarTexto(cliente.telefono), documento: limpiarTexto(cliente.documento) },
    validezDias: Number(validezDias) || VALIDEZ_COTIZACION_DIAS,
    venceEl: fechaVencimiento(fecha, Number(validezDias) || VALIDEZ_COTIZACION_DIAS),
    observaciones: limpiarTexto(observaciones),
    tipoPrecio: tipoPrecio === "mayorista" ? "mayorista" : "publico",
    // Las cotizaciones nuevas usan precios finales con el IVA incluido y redondeados a la centena
    reglaIva: REGLA_IVA.redondeado,
    items: copia,
    descuentoGeneral: Number(descuentoGeneral) || 0,
    totales: resumenTotales(copia, descuentoGeneral, REGLA_IVA.redondeado),
    estado: "Borrador",
    stockDescontado: false,
    admin: admin?.nombre ?? "", usuario: admin?.usuario ?? "",
    creado: fecha, actualizado: fecha,
    historial: [entradaCotizacion(admin, "Creó la cotización", `${copia.length} ítem${copia.length === 1 ? "" : "s"}`)]
  };
  persistirCotizaciones([cotizacion, ...obtenerCotizaciones()]);
  // El consecutivo nunca se reutiliza aunque se elimine una cotización
  guardarConfiguracion({ consecutivoCotizacion: consecutivo });
  registrarMovimiento({ admin, tipo: "cotizacion", modulo: "cotizaciones", descripcion: `Creó la cotización ${numero}`, detalle: `Cliente ${cotizacion.cliente.nombre}` });
  return cotizacion;
}

/** Actualiza una cotización (ítems, cliente, validez o estado) y deja historial */
export function actualizarCotizacion(id, cambios, admin, descripcion = "Editó la cotización", detalle = "") {
  const lista = obtenerCotizaciones();
  const indice = lista.findIndex(c => c.id === id);
  if (indice === -1) throw new ErrorDatos("La cotización ya no existe.", "no-existe");
  const anterior = lista[indice];
  const actualizada = { ...anterior, ...cambios, actualizado: ahora() };
  if (cambios.cliente) {
    actualizada.cliente = {
      nombre: limpiarTexto(cambios.cliente.nombre), telefono: limpiarTexto(cambios.cliente.telefono), documento: limpiarTexto(cambios.cliente.documento)
    };
    if (!actualizada.cliente.nombre) throw new ErrorDatos("El nombre del cliente es obligatorio.", "validacion");
  }
  if (cambios.observaciones !== undefined) actualizada.observaciones = limpiarTexto(cambios.observaciones);
  if (cambios.items) {
    if (!cambios.items.length) throw new ErrorDatos("La cotización debe tener al menos un producto.", "validacion");
    actualizada.items = copiarItems(cambios.items);
  }
  if (cambios.items || cambios.descuentoGeneral !== undefined) {
    actualizada.descuentoGeneral = Number(actualizada.descuentoGeneral) || 0;
    actualizada.totales = resumenTotales(actualizada.items, actualizada.descuentoGeneral, reglaIvaDe(anterior));
  }
  if (cambios.validezDias !== undefined) {
    actualizada.validezDias = Number(cambios.validezDias) || VALIDEZ_COTIZACION_DIAS;
    actualizada.venceEl = fechaVencimiento(anterior.fecha, actualizada.validezDias);
  }
  actualizada.historial = [entradaCotizacion(admin, descripcion, detalle), ...(anterior.historial || [])];
  lista[indice] = actualizada;
  persistirCotizaciones(lista);
  registrarMovimiento({ admin, tipo: "cotizacion", modulo: "cotizaciones", descripcion: `${descripcion} ${actualizada.numero}`, detalle });
  return actualizada;
}

export function eliminarCotizacion(id, admin) {
  const cotizacion = obtenerCotizacion(id);
  if (!cotizacion) return;
  persistirCotizaciones(obtenerCotizaciones().filter(c => c.id !== id));
  registrarMovimiento({ admin, tipo: "cotizacion", modulo: "cotizaciones", descripcion: `Eliminó la cotización ${cotizacion.numero}`, detalle: `Cliente ${cotizacion.cliente.nombre}` });
}

/** Revisa que haya existencias para todos los ítems. Devuelve los faltantes */
export function faltantesCotizacion(cotizacion) {
  return cotizacion.items
    .map(item => ({ item, producto: obtenerProducto(item.productoId) }))
    .filter(({ item, producto }) => !producto || producto.stock < item.cantidad)
    .map(({ item, producto }) => ({ ...item, disponible: producto?.stock ?? 0, existe: Boolean(producto) }));
}

/**
 * Aprueba una cotización.
 * - Si algún producto maneja serial, `seriales` debe traer uno por unidad: { productoId: ["SERIAL", …] }.
 * - Con descontarStock valida existencias y descuenta con el motivo "Venta – COT-XXXX".
 * - Marca los seriales como vendidos y crea las garantías de los productos que la tienen.
 */
export function aprobarCotizacion(id, admin, { descontarStock = true, seriales = {} } = {}) {
  const cotizacion = obtenerCotizacion(id);
  if (!cotizacion) throw new ErrorDatos("La cotización ya no existe.", "no-existe");
  const erroresSerial = validarSerialesVenta(cotizacion, seriales);
  if (erroresSerial.length) throw new ErrorDatos(erroresSerial.join(" "), "seriales");
  if (descontarStock) {
    const faltantes = faltantesCotizacion(cotizacion);
    if (faltantes.length) {
      throw new ErrorDatos(`No hay existencias suficientes: ${faltantes.map(f => `${f.nombre} (pide ${f.cantidad}, hay ${f.disponible})`).join("; ")}.`, "stock");
    }
    for (const item of cotizacion.items) {
      ajustarStock(item.productoId, -item.cantidad, `Venta – ${cotizacion.numero}`, admin);
    }
  }
  const asignados = Object.fromEntries(Object.entries(seriales).map(([pid, lista]) => [pid, lista.map(normalizarSerial)]));
  venderSeriales(cotizacion, asignados, admin);
  const garantias = crearGarantiasDeVenta(cotizacion, asignados, admin);
  const totalSeriales = Object.values(asignados).flat().length;
  return actualizarCotizacion(id, { estado: "Aprobada", stockDescontado: descontarStock, seriales: asignados, garantias: garantias.map(g => g.id) }, admin,
    "Aprobó la cotización",
    [descontarStock ? "Se descontó el stock" : "Sin descontar stock", totalSeriales && `${totalSeriales} serial(es) vendido(s)`, garantias.length && `${garantias.length} garantía(s)`].filter(Boolean).join(" · "));
}

/** Devuelve al inventario las unidades de una cotización aprobada, libera sus seriales y anula sus garantías */
export function devolverStockCotizacion(id, admin) {
  const cotizacion = obtenerCotizacion(id);
  if (!cotizacion?.stockDescontado) return;
  for (const item of cotizacion.items) {
    if (obtenerProducto(item.productoId)) ajustarStock(item.productoId, item.cantidad, `Devolución – ${cotizacion.numero}`, admin);
  }
  // Los seriales vendidos en esta cotización vuelven a estar disponibles
  const seriales = obtenerSeriales();
  let cambiados = 0;
  for (const s of seriales) {
    if (s.cotizacion === cotizacion.numero && s.estado === "Vendido") {
      Object.assign(s, { estado: "Disponible", cliente: null, fechaVenta: null, cotizacion: null, actualizado: ahora() });
      s.historial = [entradaCotizacion(admin, `Devuelto al inventario (${cotizacion.numero})`), ...(s.historial || [])];
      cambiados++;
    }
  }
  if (cambiados) persistirSeriales(seriales);
  const garantias = obtenerGarantias().map(g => g.cotizacion === cotizacion.numero ? { ...g, anulada: true } : g);
  persistirGarantias(garantias);
  actualizarCotizacion(id, { stockDescontado: false }, admin, "Devolvió el stock", "Las unidades volvieron al inventario; seriales liberados y garantías anuladas");
}

// =========================================================
// Seriales
// =========================================================

/** Serial en mayúsculas y sin espacios, para comparar sin errores de digitación */
export const normalizarSerial = texto => String(texto ?? "").toUpperCase().replace(/\s+/g, "").trim();

export function obtenerSeriales() { return leerLocal(CLAVES.seriales, []); }

function persistirSeriales(lista) {
  if (!guardarLocal(CLAVES.seriales, lista)) throw new ErrorDatos("No se pudieron guardar los seriales (almacenamiento lleno).", "almacenamiento");
  emitirCambio("seriales");
}

export function buscarSerial(texto) {
  const buscado = normalizarSerial(texto);
  return buscado ? obtenerSeriales().find(s => s.serial === buscado) ?? null : null;
}

export function serialesDeProducto(productoId, estado = null) {
  return obtenerSeriales().filter(s => s.productoId === productoId && (!estado || s.estado === estado));
}

/** Registra seriales nuevos (Disponible) de un producto. No permite repetidos */
export function registrarSeriales(productoId, textos, admin) {
  const producto = obtenerProducto(productoId);
  if (!producto) throw new ErrorDatos("El producto ya no existe.", "no-existe");
  const limpios = textos.map(normalizarSerial).filter(Boolean);
  if (!limpios.length) throw new ErrorDatos("Escribe al menos un serial.", "validacion");
  const repetidos = [...new Set(limpios.filter((s, i) => limpios.indexOf(s) !== i))];
  if (repetidos.length) throw new ErrorDatos(`Serial repetido en la lista: ${repetidos.join(", ")}.`, "duplicado");
  const existentes = obtenerSeriales();
  const ya = new Set(existentes.map(s => s.serial));
  const duplicados = limpios.filter(s => ya.has(s));
  if (duplicados.length) throw new ErrorDatos(`El serial ${duplicados.join(", ")} ya está registrado.`, "duplicado");

  const fecha = ahora();
  const nuevos = limpios.map(serial => ({
    id: generarId(), serial, productoId, referencia: producto.referencia, nombreProducto: producto.nombre,
    estado: "Disponible", estadoPrevio: null, cliente: null, fechaVenta: null, cotizacion: null, ordenId: null,
    nota: "", creado: fecha, actualizado: fecha,
    historial: [entradaCotizacion(admin, "Registró el serial")]
  }));
  persistirSeriales([...nuevos, ...existentes]);
  registrarMovimiento({
    admin, tipo: "serial", modulo: "seriales", producto,
    descripcion: `Registró ${nuevos.length} serial${nuevos.length === 1 ? "" : "es"}`, detalle: limpios.join(", ")
  });
  persistirProductos();
  return nuevos;
}

function modificarSerial(id, cambios, admin, descripcion, detalle = "") {
  const lista = obtenerSeriales();
  const i = lista.findIndex(s => s.id === id);
  if (i === -1) throw new ErrorDatos("El serial ya no existe.", "no-existe");
  lista[i] = {
    ...lista[i], ...cambios, actualizado: ahora(),
    historial: [entradaCotizacion(admin, descripcion, detalle), ...(lista[i].historial || [])]
  };
  persistirSeriales(lista);
  return lista[i];
}

/** Marca un serial como "Reportado" (p. ej. robado), guardando el estado anterior */
export function reportarSerial(id, nota, admin) {
  const s = obtenerSeriales().find(x => x.id === id);
  if (!s) throw new ErrorDatos("El serial ya no existe.", "no-existe");
  if (!limpiarTexto(nota)) throw new ErrorDatos("Escribe el motivo del reporte.", "validacion");
  const actualizado = modificarSerial(id, { estado: "Reportado", estadoPrevio: s.estado === "Reportado" ? s.estadoPrevio : s.estado, nota: limpiarTexto(nota) },
    admin, "Marcó el serial como reportado", nota);
  registrarMovimiento({ admin, tipo: "serial", modulo: "seriales", descripcion: `Reportó el serial ${s.serial}`, detalle: limpiarTexto(nota) });
  return actualizado;
}

export function quitarReporteSerial(id, admin) {
  const s = obtenerSeriales().find(x => x.id === id);
  if (!s || s.estado !== "Reportado") return s;
  const actualizado = modificarSerial(id, { estado: s.estadoPrevio || "Disponible", estadoPrevio: null }, admin, "Quitó el reporte");
  registrarMovimiento({ admin, tipo: "serial", modulo: "seriales", descripcion: `Quitó el reporte del serial ${s.serial}` });
  return actualizado;
}

export function eliminarSerial(id, admin) {
  const s = obtenerSeriales().find(x => x.id === id);
  if (!s) return;
  if (s.estado !== "Disponible") throw new ErrorDatos(`Solo se pueden eliminar seriales disponibles (este está ${s.estado.toLowerCase()}).`, "estado");
  persistirSeriales(obtenerSeriales().filter(x => x.id !== id));
  registrarMovimiento({ admin, tipo: "serial", modulo: "seriales", descripcion: `Eliminó el serial ${s.serial}`, detalle: s.referencia });
}

/** Ítems de una cotización cuyo producto maneja serial */
export function itemsConSerial(cotizacion) {
  return cotizacion.items.filter(i => obtenerProducto(i.productoId)?.manejaSerial);
}

/**
 * Revisa los seriales que se van a vender: uno por unidad, sin repetir, del mismo producto
 * y disponibles (si ya estaban registrados). Devuelve la lista de errores.
 */
export function validarSerialesVenta(cotizacion, asignaciones = {}) {
  const errores = [];
  const usados = new Set();
  const registro = new Map(obtenerSeriales().map(s => [s.serial, s]));
  for (const item of itemsConSerial(cotizacion)) {
    const lista = (asignaciones[item.productoId] || []).map(normalizarSerial);
    if (lista.length !== item.cantidad || lista.some(s => !s)) {
      errores.push(`Falta el serial de ${item.cantidad === 1 ? "la unidad" : `las ${item.cantidad} unidades`} de "${item.nombre}".`);
      continue;
    }
    for (const serial of lista) {
      if (usados.has(serial)) errores.push(`El serial ${serial} está repetido.`);
      usados.add(serial);
      const registrado = registro.get(serial);
      if (registrado && registrado.productoId !== item.productoId) errores.push(`El serial ${serial} pertenece a otro producto (${registrado.referencia}).`);
      else if (registrado && registrado.estado !== "Disponible") errores.push(`El serial ${serial} no está disponible (${registrado.estado.toLowerCase()}).`);
    }
  }
  return errores;
}

/** Pasa a "Vendido" los seriales asignados; los que no estaban registrados se crean ya vendidos */
function venderSeriales(cotizacion, asignaciones, admin) {
  const lista = obtenerSeriales();
  const fecha = ahora();
  let total = 0;
  for (const [productoId, seriales] of Object.entries(asignaciones)) {
    const producto = obtenerProducto(productoId);
    for (const serial of seriales) {
      const entrada = entradaCotizacion(admin, `Vendido en ${cotizacion.numero}`, cotizacion.cliente.nombre);
      const venta = { estado: "Vendido", cliente: { ...cotizacion.cliente }, fechaVenta: fecha, cotizacion: cotizacion.numero, actualizado: fecha };
      const existente = lista.find(s => s.serial === serial);
      if (existente) {
        Object.assign(existente, venta);
        existente.historial = [entrada, ...(existente.historial || [])];
      } else {
        lista.unshift({
          id: generarId(), serial, productoId, referencia: producto?.referencia ?? "", nombreProducto: producto?.nombre ?? "",
          estadoPrevio: null, ordenId: null, nota: "", creado: fecha, ...venta, historial: [entrada]
        });
      }
      total++;
    }
  }
  if (total) persistirSeriales(lista);
}

// =========================================================
// Garantías
// =========================================================

export function obtenerGarantias() { return leerLocal(CLAVES.garantias, []); }
export function obtenerGarantia(id) { return obtenerGarantias().find(g => g.id === id) ?? null; }

function persistirGarantias(lista) {
  if (!guardarLocal(CLAVES.garantias, lista)) throw new ErrorDatos("No se pudieron guardar las garantías (almacenamiento lleno).", "almacenamiento");
  emitirCambio("garantias");
}

function sumarMeses(fechaISO, meses) {
  const fecha = new Date(fechaISO);
  fecha.setMonth(fecha.getMonth() + Number(meses));
  return fecha.toISOString();
}

/** Vigente, Por vencer (30 días o menos), Vencida o Anulada */
export function estadoGarantia(garantia, hoy = new Date()) {
  if (garantia.anulada) return "Anulada";
  const vence = new Date(garantia.vence);
  vence.setHours(23, 59, 59, 999);
  if (hoy > vence) return "Vencida";
  const dias = Math.ceil((vence - hoy) / 86400000);
  if (dias <= DIAS_GARANTIA_POR_VENCER) return "Por vencer";
  return "Vigente";
}

/** Crea una garantía por unidad con serial (o una por línea si no maneja serial) */
function crearGarantiasDeVenta(cotizacion, asignaciones, admin) {
  const fecha = ahora();
  const nuevas = [];
  for (const item of cotizacion.items) {
    const producto = obtenerProducto(item.productoId);
    const meses = producto?.garantiaMeses || 0;
    if (!meses) continue;
    const unidades = producto.manejaSerial ? (asignaciones[item.productoId] || []) : [null];
    for (const serial of unidades) {
      nuevas.push({
        id: generarId(), productoId: item.productoId, referencia: item.referencia, nombreProducto: item.nombre,
        serial, cantidad: serial ? 1 : item.cantidad, cliente: { ...cotizacion.cliente },
        fechaVenta: fecha, meses, vence: sumarMeses(fecha, meses),
        cotizacion: cotizacion.numero, cotizacionId: cotizacion.id, anulada: false,
        reclamos: [], creado: fecha,
        historial: [entradaCotizacion(admin, `Garantía de ${meses} meses`, `Venta ${cotizacion.numero}`)]
      });
    }
  }
  if (nuevas.length) {
    persistirGarantias([...nuevas, ...obtenerGarantias()]);
    registrarMovimiento({ admin, tipo: "garantia", modulo: "garantias", descripcion: `Generó ${nuevas.length} garantía${nuevas.length === 1 ? "" : "s"}`, detalle: cotizacion.numero });
  }
  return nuevas;
}

/** Busca por cliente, teléfono, documento, serial, producto o número de cotización */
export function buscarGarantias(texto) {
  const buscado = normalizarTexto(texto);
  if (!buscado) return obtenerGarantias();
  return obtenerGarantias().filter(g => normalizarTexto(
    `${g.cliente.nombre} ${g.cliente.telefono} ${g.cliente.documento} ${g.serial ?? ""} ${g.cotizacion} ${g.referencia} ${g.nombreProducto}`
  ).includes(buscado));
}

function modificarGarantia(id, fn, admin, descripcion, detalle = "") {
  const lista = obtenerGarantias();
  const i = lista.findIndex(g => g.id === id);
  if (i === -1) throw new ErrorDatos("La garantía ya no existe.", "no-existe");
  const copia = structuredClone(lista[i]);
  fn(copia);
  copia.historial = [entradaCotizacion(admin, descripcion, detalle), ...(copia.historial || [])];
  lista[i] = copia;
  persistirGarantias(lista);
  return copia;
}

export const RESOLUCIONES_RECLAMO = ["Pendiente", "Reparado", "Cambiado", "Rechazado"];

/** Registra un reclamo de garantía (descripción, fotos y resolución) */
export function agregarReclamo(garantiaId, { descripcion, fotos = [], resolucion = "Pendiente", ordenId = null }, admin) {
  if (!limpiarTexto(descripcion)) throw new ErrorDatos("Describe el reclamo.", "validacion");
  const reclamo = {
    id: generarId(), fecha: ahora(), descripcion: limpiarTexto(descripcion), fotos,
    resolucion: RESOLUCIONES_RECLAMO.includes(resolucion) ? resolucion : "Pendiente", ordenId, admin: admin?.nombre ?? ""
  };
  const g = modificarGarantia(garantiaId, x => { x.reclamos = [reclamo, ...(x.reclamos || [])]; }, admin, "Registró un reclamo", reclamo.descripcion);
  registrarMovimiento({ admin, tipo: "garantia", modulo: "garantias", descripcion: `Reclamo de garantía de ${g.nombreProducto}`, detalle: `${g.cliente.nombre} · ${reclamo.resolucion}` });
  return { garantia: g, reclamo };
}

export function actualizarReclamo(garantiaId, reclamoId, cambios, admin) {
  return modificarGarantia(garantiaId, g => {
    const r = g.reclamos.find(x => x.id === reclamoId);
    if (r) Object.assign(r, cambios);
  }, admin, cambios.resolucion ? `Reclamo: ${cambios.resolucion}` : "Actualizó un reclamo");
}

// =========================================================
// Órdenes de taller
// =========================================================

export function obtenerOrdenes() { return leerLocal(CLAVES.ordenes, []); }
export function obtenerOrden(id) { return obtenerOrdenes().find(o => o.id === id) ?? null; }

function persistirOrdenes(lista) {
  if (!guardarLocal(CLAVES.ordenes, lista)) throw new ErrorDatos("No se pudo guardar la orden (almacenamiento lleno; revisa las fotos).", "almacenamiento");
  emitirCambio("ordenes");
}

export const esEstadoFinal = estado => ESTADOS_TALLER_FINALES.includes(estado);

/**
 * Repuestos + mano de obra con la misma lógica de calcularTotales.
 * En las órdenes nuevas el valor de la mano de obra ya trae el IVA incluido.
 */
export function totalesOrden(orden) {
  const manoObra = (orden.manoObra || []).map(m => ({ precio: Number(m.valor) || 0, aplicaIva: true, costo: 0, cantidad: 1, descuento: 0 }));
  return calcularTotales([...(orden.repuestos || []), ...manoObra], 0, reglaIvaDe(orden));
}

const inicioDelDia = fecha => new Date(`${fecha}T00:00:00`);

export function diasEnTaller(orden, hoy = new Date()) {
  const fin = orden.fechaEntrega ? new Date(orden.fechaEntrega) : hoy;
  return Math.max(0, Math.floor((fin - inicioDelDia(orden.fechaIngreso)) / 86400000));
}

export function ordenAtrasada(orden, hoy = new Date()) {
  if (esEstadoFinal(orden.estado) || !orden.fechaEstimada) return false;
  return hoy > new Date(`${orden.fechaEstimada}T23:59:59`);
}

function datosOrden(datos) {
  return {
    cliente: { nombre: limpiarTexto(datos.cliente?.nombre), telefono: limpiarTexto(datos.cliente?.telefono) },
    vehiculo: {
      tipo: datos.vehiculo?.tipo === "Moto" ? "Moto" : "Bicicleta",
      marca: limpiarTexto(datos.vehiculo?.marca), modelo: limpiarTexto(datos.vehiculo?.modelo),
      color: limpiarTexto(datos.vehiculo?.color), serial: normalizarSerial(datos.vehiculo?.serial)
    },
    trabajo: limpiarTexto(datos.trabajo),
    diagnostico: limpiarTexto(datos.diagnostico),
    responsable: limpiarTexto(datos.responsable),
    fechaIngreso: datos.fechaIngreso || new Date().toISOString().slice(0, 10),
    fechaEstimada: datos.fechaEstimada || "",
    fotos: (datos.fotos || []).slice(0, 3),
    repuestos: (datos.repuestos || []).filter(r => Number(r.cantidad) > 0).map(r => ({
      productoId: r.productoId, referencia: r.referencia, nombre: r.nombre,
      precio: Number(r.precio) || 0, aplicaIva: r.aplicaIva === true, costo: r.costo ?? null, cantidad: Number(r.cantidad) || 0, descuento: 0
    })),
    manoObra: (datos.manoObra || []).filter(m => limpiarTexto(m.descripcion)).map(m => ({
      id: m.id || generarId(), descripcion: limpiarTexto(m.descripcion), valor: Math.max(0, Number(m.valor) || 0)
    })),
    garantiaId: datos.garantiaId ?? null
  };
}

function validarOrden(orden) {
  if (!orden.cliente.nombre) throw new ErrorDatos("El nombre del cliente es obligatorio.", "validacion");
  if (!orden.trabajo) throw new ErrorDatos("Describe el trabajo solicitado.", "validacion");
  if (orden.fechaEstimada && orden.fechaEstimada < orden.fechaIngreso) throw new ErrorDatos("La fecha estimada no puede ser anterior al ingreso.", "validacion");
}

/** Si el vehículo tiene un serial registrado, pasa a "En taller" (los reportados no cambian de estado) */
function marcarSerialEnTaller(orden, admin) {
  const s = buscarSerial(orden.vehiculo.serial);
  if (!s) return null;
  if (s.estado === "Reportado") {
    registrarMovimiento({ admin, tipo: "alerta", modulo: "taller", descripcion: `⚠ Serial reportado ${s.serial} ingresó al taller`, detalle: `${orden.numero} · ${s.nota}` });
    return s;
  }
  return modificarSerial(s.id, { estado: "En taller", estadoPrevio: s.estado === "En taller" ? s.estadoPrevio : s.estado, ordenId: orden.id }, admin, `Ingresó al taller (${orden.numero})`);
}

function liberarSerial(orden, admin) {
  const s = buscarSerial(orden.vehiculo?.serial);
  if (s && s.estado === "En taller" && s.ordenId === orden.id) {
    modificarSerial(s.id, { estado: s.estadoPrevio || "Vendido", estadoPrevio: null, ordenId: null }, admin, `Salió del taller (${orden.numero})`);
  }
}

export function crearOrden(datos, admin) {
  const base = datosOrden(datos);
  validarOrden(base);
  const consecutivo = obtenerConfiguracion().consecutivoOrden + 1;
  const fecha = ahora();
  const orden = {
    id: generarId(), numero: `${PREFIJO_ORDEN}${String(consecutivo).padStart(4, "0")}`, ...base,
    reglaIva: REGLA_IVA.redondeado,
    estado: "Recibida", stockDescontado: false, fechaEntrega: null,
    admin: admin?.nombre ?? "", creado: fecha, actualizado: fecha,
    historial: [entradaCotizacion(admin, "Recibió el vehículo", `${base.vehiculo.tipo} ${base.vehiculo.marca} ${base.vehiculo.modelo}`.trim())]
  };
  persistirOrdenes([orden, ...obtenerOrdenes()]);
  guardarConfiguracion({ consecutivoOrden: consecutivo });
  marcarSerialEnTaller(orden, admin);
  registrarMovimiento({ admin, tipo: "orden", modulo: "taller", descripcion: `Creó la orden ${orden.numero}`, detalle: `${orden.cliente.nombre} · ${orden.trabajo}` });
  return orden;
}

export function actualizarOrden(id, datos, admin) {
  const lista = obtenerOrdenes();
  const i = lista.findIndex(o => o.id === id);
  if (i === -1) throw new ErrorDatos("La orden ya no existe.", "no-existe");
  const anterior = lista[i];
  if (esEstadoFinal(anterior.estado)) throw new ErrorDatos(`La orden está ${anterior.estado.toLowerCase()} y ya no se puede editar.`, "estado");
  const base = datosOrden({ ...anterior, ...datos });
  validarOrden(base);
  const actualizada = {
    ...anterior, ...base, actualizado: ahora(),
    historial: [entradaCotizacion(admin, "Editó la orden", `${base.repuestos.length} repuestos · ${base.manoObra.length} servicios`), ...(anterior.historial || [])]
  };
  lista[i] = actualizada;
  persistirOrdenes(lista);
  if (anterior.vehiculo.serial !== actualizada.vehiculo.serial) {
    liberarSerial(anterior, admin);
    marcarSerialEnTaller(actualizada, admin);
  }
  registrarMovimiento({ admin, tipo: "orden", modulo: "taller", descripcion: `Editó la orden ${actualizada.numero}` });
  return actualizada;
}

/** Faltantes de stock para entregar una orden */
export function faltantesOrden(orden) {
  return orden.repuestos
    .map(r => ({ r, p: obtenerProducto(r.productoId) }))
    .filter(({ r, p }) => !p || p.stock < r.cantidad)
    .map(({ r, p }) => ({ ...r, disponible: p?.stock ?? 0 }));
}

/**
 * Cambia el estado. Al pasar a "Entregada" descuenta los repuestos con el motivo
 * "Uso en taller – OT-XXXX". "Entregada" y "Cancelada" son finales.
 */
export function cambiarEstadoOrden(id, nuevo, admin) {
  if (!ESTADOS_TALLER.includes(nuevo)) throw new ErrorDatos("Estado no válido.", "validacion");
  const orden = obtenerOrden(id);
  if (!orden) throw new ErrorDatos("La orden ya no existe.", "no-existe");
  if (orden.estado === nuevo) return orden;
  if (esEstadoFinal(orden.estado)) throw new ErrorDatos(`${orden.numero} ya está ${orden.estado.toLowerCase()}; no se puede mover.`, "estado");
  const cambios = { estado: nuevo, actualizado: ahora() };
  if (nuevo === "Entregada") {
    const faltantes = faltantesOrden(orden);
    if (faltantes.length) {
      throw new ErrorDatos(`No hay stock para entregar: ${faltantes.map(f => `${f.nombre} (usa ${f.cantidad}, hay ${f.disponible})`).join("; ")}.`, "stock");
    }
    for (const r of orden.repuestos) ajustarStock(r.productoId, -r.cantidad, `Uso en taller – ${orden.numero}`, admin);
    cambios.stockDescontado = orden.repuestos.length > 0;
    cambios.fechaEntrega = ahora();
  }
  const lista = obtenerOrdenes();
  const i = lista.findIndex(o => o.id === id);
  lista[i] = { ...lista[i], ...cambios, historial: [entradaCotizacion(admin, `Cambió el estado a ${nuevo}`, `${orden.estado} → ${nuevo}`), ...(lista[i].historial || [])] };
  persistirOrdenes(lista);
  if (esEstadoFinal(nuevo)) liberarSerial(orden, admin);
  registrarMovimiento({ admin, tipo: "orden", modulo: "taller", descripcion: `${orden.numero}: ${orden.estado} → ${nuevo}`, detalle: orden.cliente.nombre });
  return lista[i];
}

export function eliminarOrden(id, admin) {
  const orden = obtenerOrden(id);
  if (!orden) return;
  if (orden.estado === "Entregada") throw new ErrorDatos("Una orden entregada no se puede eliminar.", "estado");
  liberarSerial(orden, admin);
  persistirOrdenes(obtenerOrdenes().filter(o => o.id !== id));
  registrarMovimiento({ admin, tipo: "orden", modulo: "taller", descripcion: `Eliminó la orden ${orden.numero}`, detalle: orden.cliente.nombre });
}

/**
 * Repuestos sugeridos para un vehículo: primero los que comparten etiquetas de compatibilidad
 * (las del producto vendido con ese serial, el rin escrito en el modelo y "Moto" si es moto).
 */
export function etiquetasVehiculo(vehiculo) {
  const etiquetas = new Set();
  const s = buscarSerial(vehiculo?.serial);
  const producto = s ? obtenerProducto(s.productoId) : null;
  (producto?.compatibilidad || []).forEach(e => etiquetas.add(e));
  if (producto?.talla?.startsWith("Rin ")) etiquetas.add(producto.talla);
  const texto = normalizarTexto(`${vehiculo?.marca} ${vehiculo?.modelo}`);
  const rin = texto.match(/(?:RIN|R|ARO)?\s?(12|14|16|18|20|24|26|27\.5|28|29)\b/);
  if (rin) etiquetas.add(`Rin ${rin[1]}`);
  const cc = texto.match(/\b(\d{2,3})\s?CC\b/);
  if (cc) etiquetas.add(`Moto ${cc[1]}cc`);
  if (vehiculo?.tipo === "Moto") etiquetas.add("Moto");
  return [...etiquetas];
}

export function repuestosSugeridos(vehiculo, maximo = 8) {
  const etiquetas = new Set(etiquetasVehiculo(vehiculo));
  const linea = vehiculo?.tipo === "Moto" ? "Moto" : "Bicicleta";
  return estado.productos
    .filter(p => p.stock > 0 && precioBase(p) && p.categoria !== "Bicicletas" && p.linea === linea && (p.compatibilidad || []).some(e => etiquetas.has(e)))
    .slice(0, maximo);
}
