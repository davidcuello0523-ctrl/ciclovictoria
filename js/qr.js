// =========================================================
// CicloVictoria · qr.js
// Códigos QR (productos y seriales), hoja de etiquetas para imprimir
// y escáner con la cámara: BarcodeDetector nativo si el navegador lo
// tiene y html5-qrcode como respaldo. Siempre queda la opción de
// escribir el código a mano o leerlo desde una foto.
// =========================================================

import { el, icono, botonIcono, toast, abrirModal, formatoCOP, notaIva } from "./ui.js";
import { precioFinal } from "./precios.js";

// =========================================================
// Generación de QR (librería qrcode, global window.QRCode)
// =========================================================

const cacheQR = new Map();

/** Devuelve un data URL PNG con el QR del texto */
export async function generarQR(texto, { tamano = 220 } = {}) {
  const clave = `${tamano}|${texto}`;
  if (cacheQR.has(clave)) return cacheQR.get(clave);
  if (!window.QRCode?.toDataURL) throw new Error("No se cargó la librería de códigos QR. Revisa tu conexión a internet.");
  const url = await window.QRCode.toDataURL(String(texto), {
    width: tamano, margin: 1, errorCorrectionLevel: "M",
    color: { dark: "#0E0E0E", light: "#FFFFFF" }
  });
  cacheQR.set(clave, url);
  return url;
}

/** <img> que se llena cuando el QR está listo */
export function imagenQR(texto, { tamano = 160, alt = `Código QR de ${texto}` } = {}) {
  const img = el("img", { class: "imagen-qr", width: tamano, height: tamano, alt });
  generarQR(texto, { tamano: tamano * 2 })
    .then(url => { img.src = url; })
    .catch(e => { img.replaceWith(el("p", { class: "campo-error" }, e.message)); });
  return img;
}

/** Modal con el QR grande de un producto o un serial */
export function mostrarQR({ codigo, titulo, subtitulo = "", alImprimir = null }) {
  const img = imagenQR(codigo, { tamano: 240 });
  const descargar = el("a", { class: "boton boton-secundario", download: `QR_${codigo}.png`, href: "#" }, icono("descargar"), "Descargar PNG");
  generarQR(codigo, { tamano: 480 }).then(url => { descargar.href = url; }).catch(() => { descargar.hidden = true; });
  abrirModal({
    titulo: "Código QR",
    contenido: el("div", { class: "qr-grande" },
      img,
      el("strong", { class: "serial-grande" }, codigo),
      el("p", {}, titulo),
      subtitulo ? el("p", { class: "texto-suave" }, subtitulo) : null,
      descargar),
    acciones: alImprimir ? [{ texto: "Imprimir etiquetas", clase: "boton-acento", alHacerClic: () => { alImprimir(); } }] : []
  });
}

// =========================================================
// Hoja de etiquetas para imprimir (grilla tipo adhesivo 3 × 10)
// =========================================================

/**
 * abrirImpresionEtiquetas({ productos, seleccion: [{ producto, cantidad }] })
 * productos = lista para buscar y agregar; seleccion = lo que ya viene elegido.
 */
export function abrirImpresionEtiquetas({ productos = [], seleccion = [], seriales = [] } = {}) {
  const elegidos = new Map(seleccion.map(s => [s.producto.id, { producto: s.producto, cantidad: s.cantidad ?? 1 }]));
  const etiqueta = p => `${p.referencia} · ${p.nombre}`;
  const buscador = el("input", { class: "entrada", id: "etiquetas-buscar", list: "etiquetas-productos", placeholder: "Referencia o nombre del producto", autocomplete: "off" });
  const lista = el("datalist", { id: "etiquetas-productos" }, productos.slice(0, 3000).map(p => el("option", { value: etiqueta(p) })));
  const tabla = el("div", { class: "lista-etiquetas" });
  const incluirPrecio = el("input", { type: "checkbox", id: "etiquetas-precio" });
  const resumen = el("p", { class: "campo-ayuda", "aria-live": "polite" });

  const agregar = () => {
    const texto = buscador.value.trim();
    const p = productos.find(x => etiqueta(x) === texto) ?? productos.find(x => x.referencia.toUpperCase() === texto.toUpperCase());
    if (!p) { toast("Elige un producto de la lista.", "advertencia"); return; }
    const actual = elegidos.get(p.id);
    elegidos.set(p.id, { producto: p, cantidad: (actual?.cantidad ?? 0) + 1 });
    buscador.value = "";
    pintar();
  };
  buscador.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); agregar(); } });
  buscador.addEventListener("input", e => { if ((e.inputType === undefined || e.inputType === "insertReplacementText") && productos.some(x => etiqueta(x) === buscador.value)) agregar(); });

  function pintar() {
    const total = [...elegidos.values()].reduce((s, x) => s + x.cantidad, 0) + seriales.length;
    resumen.textContent = `${total} etiqueta${total === 1 ? "" : "s"} · ${Math.max(1, Math.ceil(total / 30))} hoja${total > 30 ? "s" : ""} de 30.`;
    tabla.replaceChildren(...[...elegidos.values()].map(({ producto, cantidad }) => {
      const entrada = el("input", { type: "number", class: "entrada", min: 1, max: 300, value: cantidad, "aria-label": `Etiquetas de ${producto.nombre}` });
      entrada.addEventListener("change", () => {
        elegidos.get(producto.id).cantidad = Math.max(1, Math.min(300, Math.round(Number(entrada.value) || 1)));
        pintar();
      });
      return el("div", { class: "fila-etiqueta" },
        el("div", { style: { minWidth: 0 } }, el("strong", {}, producto.nombre), el("div", { class: "texto-suave" }, producto.referencia)),
        entrada,
        botonIcono("eliminar", `Quitar ${producto.nombre}`, { class: "pequeno", onclick: () => { elegidos.delete(producto.id); pintar(); } }));
    }), ...seriales.map(s => el("div", { class: "fila-etiqueta" },
      el("div", {}, el("strong", {}, `Serial ${s.serial}`), el("div", { class: "texto-suave" }, s.nombreProducto)), el("span", {}, "1"), el("span", {}))));
    if (!elegidos.size && !seriales.length) tabla.append(el("p", { class: "texto-suave" }, "Agrega productos con el buscador."));
  }
  pintar();

  abrirModal({
    titulo: "Imprimir etiquetas QR",
    ancho: true,
    contenido: el("div", { class: "form-grilla" },
      el("div", { class: "campo ancho-completo" }, el("label", { for: "etiquetas-buscar" }, "Agregar producto"), buscador, lista),
      el("div", { class: "ancho-completo" }, tabla),
      el("label", { class: "casilla ancho-completo" }, incluirPrecio, "Incluir precio en la etiqueta"),
      el("div", { class: "ancho-completo" }, resumen)),
    acciones: [
      { texto: "Cancelar", clase: "boton-secundario" },
      { texto: "Generar e imprimir", clase: "boton-acento", alHacerClic: async () => {
          const items = [...elegidos.values()];
          if (!items.length && !seriales.length) { toast("Agrega al menos un producto.", "advertencia"); return false; }
          await imprimirEtiquetas({ items, seriales, incluirPrecio: incluirPrecio.checked });
        } }
    ]
  });
}

/** Arma la hoja (#hoja-etiquetas) y abre el diálogo de impresión */
export async function imprimirEtiquetas({ items = [], seriales = [], incluirPrecio = false, imprimir = true } = {}) {
  document.getElementById("hoja-etiquetas")?.remove();
  const etiquetas = [];
  for (const { producto, cantidad } of items) {
    const qr = await generarQR(producto.referencia, { tamano: 240 });
    for (let i = 0; i < cantidad; i++) {
      etiquetas.push(el("div", { class: "etiqueta-qr" },
        el("img", { src: qr, alt: `QR ${producto.referencia}` }),
        el("div", { class: "etiqueta-texto" },
          el("strong", {}, producto.nombre.length > 48 ? `${producto.nombre.slice(0, 46)}…` : producto.nombre),
          el("span", { class: "etiqueta-ref" }, producto.referencia),
          incluirPrecio && precioFinal(producto) ? el("span", { class: "etiqueta-precio" }, formatoCOP(precioFinal(producto)), notaIva(producto)) : null,
          el("span", { class: "etiqueta-marca" }, "CicloVictoria"))));
    }
  }
  for (const s of seriales) {
    const qr = await generarQR(s.serial, { tamano: 240 });
    etiquetas.push(el("div", { class: "etiqueta-qr" },
      el("img", { src: qr, alt: `QR serial ${s.serial}` }),
      el("div", { class: "etiqueta-texto" },
        el("strong", {}, s.nombreProducto.slice(0, 46)),
        el("span", { class: "etiqueta-ref" }, `Serial ${s.serial}`),
        el("span", { class: "etiqueta-marca" }, "CicloVictoria"))));
  }
  const hoja = el("div", { id: "hoja-etiquetas", "aria-hidden": "true" }, etiquetas);
  document.body.append(hoja);
  if (!imprimir) return hoja;
  document.body.classList.add("imprimiendo-etiquetas");
  const limpiar = () => {
    document.body.classList.remove("imprimiendo-etiquetas");
    window.removeEventListener("afterprint", limpiar);
  };
  window.addEventListener("afterprint", limpiar);
  // Se espera a que carguen las imágenes antes de imprimir
  await Promise.all([...hoja.querySelectorAll("img")].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
  window.print();
  setTimeout(limpiar, 1000);
  return hoja;
}

// =========================================================
// Escáner
// =========================================================

let contadorLectores = 0;

/** ¿Hay BarcodeDetector con soporte para QR? */
async function detectorNativo() {
  if (!("BarcodeDetector" in window)) return null;
  try {
    const formatos = await window.BarcodeDetector.getSupportedFormats();
    if (!formatos.includes("qr_code")) return null;
    return new window.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13", "code_39"] });
  } catch {
    return null;
  }
}

/** Lee un código desde una imagen (foto de la etiqueta) */
export async function leerCodigoDeImagen(archivo) {
  const nativo = await detectorNativo();
  if (nativo) {
    const imagen = await createImageBitmap(archivo);
    const codigos = await nativo.detect(imagen);
    if (codigos.length) return codigos[0].rawValue;
  }
  if (window.Html5Qrcode) {
    const id = `lector-archivo-${++contadorLectores}`;
    const contenedor = el("div", { id, hidden: true });
    document.body.append(contenedor);
    try {
      return await new window.Html5Qrcode(id).scanFile(archivo, false);
    } finally {
      contenedor.remove();
    }
  }
  throw new Error("Este navegador no puede leer códigos desde imágenes.");
}

/**
 * Abre el escáner. alLeer(codigo) recibe el texto leído (con la cámara, a mano o desde una foto).
 * Devuelve { cerrar }.
 */
export function abrirEscaner({ titulo = "Escanear código", ayuda = "Apunta la cámara al código QR de la etiqueta.", alLeer }) {
  const idCamara = `lector-camara-${++contadorLectores}`;
  const zonaCamara = el("div", { class: "zona-camara", id: idCamara });
  const estado = el("p", { class: "estado-escaner", role: "status", "aria-live": "polite" }, "Iniciando la cámara…");
  const manual = el("input", { type: "text", class: "entrada", id: "codigo-manual", placeholder: "Ej: CV-0001 o el serial", autocomplete: "off", autocapitalize: "characters" });
  const foto = el("input", { type: "file", accept: "image/*", capture: "environment", id: "foto-codigo", class: "solo-lector" });
  let detener = () => {};
  let terminado = false;

  const entregar = codigo => {
    const limpio = String(codigo ?? "").trim();
    if (!limpio || terminado) return;
    terminado = true;
    if (navigator.vibrate) navigator.vibrate(60);
    modal.cerrar();
    alLeer(limpio);
  };

  const enviarManual = () => {
    if (!manual.value.trim()) { manual.focus(); return; }
    entregar(manual.value);
  };
  manual.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); enviarManual(); } });
  foto.addEventListener("change", async () => {
    if (!foto.files[0]) return;
    estado.textContent = "Leyendo la foto…";
    try {
      entregar(await leerCodigoDeImagen(foto.files[0]));
    } catch (e) {
      estado.textContent = "No se encontró un código en la foto. Intenta con otra más nítida o escríbelo a mano.";
    }
    foto.value = "";
  });

  const modal = abrirModal({
    titulo,
    contenido: el("div", { class: "escaner" },
      zonaCamara, estado,
      el("p", { class: "campo-ayuda" }, ayuda),
      el("div", { class: "escaner-alternativas" },
        el("div", { class: "campo" }, el("label", { for: "codigo-manual" }, "O escribe el código"),
          el("div", { class: "fila-manual" }, manual, el("button", { type: "button", class: "boton boton-primario", onclick: enviarManual }, "Buscar"))),
        el("label", { for: "foto-codigo", class: "boton boton-secundario boton-pequeno", tabindex: "0", role: "button" }, icono("imagen"), "Leer desde una foto"),
        foto)),
    alCerrar: () => detener()
  });

  iniciarCamara();

  async function iniciarCamara() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      sinCamara("La cámara solo funciona en localhost o con HTTPS. Escribe el código a mano.");
      return;
    }
    const nativo = await detectorNativo();
    if (nativo) {
      try {
        const flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const video = el("video", { autoplay: true, playsInline: true, muted: true, "aria-label": "Vista de la cámara" });
        video.srcObject = flujo;
        zonaCamara.replaceChildren(video, el("div", { class: "marco-escaner", "aria-hidden": "true" }));
        estado.textContent = "Buscando un código…";
        let activo = true;
        detener = () => { activo = false; flujo.getTracks().forEach(t => t.stop()); };
        const buscar = async () => {
          if (!activo) return;
          try {
            if (video.readyState >= 2) {
              const codigos = await nativo.detect(video);
              if (codigos.length) { entregar(codigos[0].rawValue); return; }
            }
          } catch { /* se sigue intentando */ }
          setTimeout(buscar, 250);
        };
        buscar();
        return;
      } catch (e) {
        sinCamara(mensajeCamara(e));
        return;
      }
    }
    if (window.Html5Qrcode) {
      try {
        const lector = new window.Html5Qrcode(idCamara);
        await lector.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 220, height: 220 } },
          texto => entregar(texto), () => {});
        estado.textContent = "Buscando un código…";
        detener = () => { lector.stop().then(() => lector.clear()).catch(() => {}); };
        return;
      } catch (e) {
        sinCamara(mensajeCamara(e));
        return;
      }
    }
    sinCamara("Este navegador no permite escanear con la cámara. Escribe el código a mano.");
  }

  function sinCamara(texto) {
    zonaCamara.replaceChildren(el("div", { class: "sin-camara" }, icono("escaner"), el("p", {}, texto)));
    estado.textContent = "";
    requestAnimationFrame(() => manual.focus());
  }

  return { cerrar: () => modal.cerrar() };
}

function mensajeCamara(error) {
  const nombre = error?.name ?? String(error);
  if (/NotAllowed|Permission/i.test(nombre) || /permission/i.test(String(error))) return "No diste permiso para usar la cámara. Puedes escribir el código a mano o leerlo desde una foto.";
  if (/NotFound|Overconstrained|DevicesNotFound/i.test(nombre) || /not found|no camera/i.test(String(error))) return "No se encontró una cámara en este equipo. Escribe el código a mano o usa una foto.";
  if (/NotReadable|TrackStart/i.test(nombre)) return "La cámara está siendo usada por otra aplicación.";
  return "No se pudo abrir la cámara. Escribe el código a mano o usa una foto.";
}

