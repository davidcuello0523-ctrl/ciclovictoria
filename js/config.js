// =========================================================
// CicloVictoria · config.js
// Marca, usuarios, proveedores, mapeo de columnas del Excel y reglas
// =========================================================

// ---------- Marca ----------
export const NOMBRE_MARCA = "CicloVictoria";
export const LEMA = "Rueda con confianza";
export const DESCRIPCION_TIENDA = "Bicicletas, repuestos, accesorios y taller";

// ---------- Excel ----------
export const RUTA_EXCEL = "data/productos.xlsx";
// Catálogo sin precios ni costos que se publica en internet (lo genera el panel admin).
// El Excel con costos NO se sube al repositorio: el administrador lo carga desde su PC.
export const RUTA_CATALOGO_PUBLICO = "data/catalogo.json";
// Hoja principal del inventario y fila (1 = primera) donde están los encabezados
export const HOJA_EXCEL = "Inventario consolidado";
export const FILA_ENCABEZADOS = 4;

// Columnas del Excel del usuario. null = la columna no existe y el dato se deduce.
// Los nombres se comparan sin tildes ni mayúsculas.
export const MAPEO_COLUMNAS = {
  referencia: null,                     // se genera CV-0001, CV-0002…
  nombre: "Producto",
  linea: null,                          // se deduce: "Bicicleta" | "Moto"
  categoria: "Categoría",
  marca: null,                          // se deduce del nombre con MARCAS_CONOCIDAS
  proveedor: null,                      // se deduce con REGLAS_PROVEEDOR
  costo: "Costo unitario promedio",
  precio: null,                         // se calcula con GANANCIAS (público y al por mayor), sin IVA
  stock: "Cantidad total",
  minStock: null,
  color: null,                          // se deduce del nombre (NEGRO, ROJO…)
  talla: null                           // se deduce del rin (BIC 20 → Rin 20)
};

// Valores por defecto cuando falta una columna
export const VALORES_POR_DEFECTO = {
  minStock: 2,
  color: "Sin color",
  talla: "Sin talla",
  costo: null,
  marca: "Sin marca",
  categoria: "Sin categoría"
};

// Prefijo de las referencias generadas automáticamente
export const PREFIJO_REFERENCIA = "CV-";

// ---------- Precios ----------
// Con solo escribir el costo salen los dos precios: costo × (1 + ganancia),
// redondeado a la centena más cercana (1.587 → 1.600, 1.534 → 1.500).
// Bicicletas por un lado; repuestos, accesorios y productos de moto por el otro.
export const CATEGORIAS_BICICLETA = ["Bicicletas"];
export const GANANCIAS = {
  bicicleta: { publico: 30, mayorista: 20 },
  repuesto: { publico: 60, mayorista: 45 }
};
export const TIPOS_PRECIO = { publico: "Público", mayorista: "Al por mayor" };
// Si cambian las reglas, subir este número recalcula una vez los precios guardados
export const VERSION_PRECIOS = 2;
export const REDONDEO_PRECIO = 100;
// IVA: los precios guardados (precioMayorBase / precioPublicoBase) son SIN IVA.
// Repuestos, accesorios y demás llevan el 19 % incluido en el precio que se muestra;
// las bicicletas completas no llevan IVA. Cada producto tiene `aplicaIva` (editable).
// El único cálculo de IVA está en js/precios.js.
export const IVA = 0.19;
export const CATEGORIAS_SIN_IVA = ["Bicicletas"];
// Todo precio final (ya con IVA) se redondea HACIA ARRIBA a este múltiplo: 1.234 → 1.300, 1.300 → 1.300.
// Las bases guardadas no se redondean; solo el precio que se muestra y se cobra.
export const REDONDEO = 100;
// Margen mínimo sobre el precio de venta (Fase 2 lo hace editable desde Perfil)
export const MARGEN_MINIMO = 20;

// ---------- Supabase (base de datos en la nube) ----------
// Pega aquí los datos de Supabase → Project Settings → API. La clave pública
// (anon / publishable) puede estar en el código: lo que protege los datos son
// las políticas de supabase.sql. NUNCA pegues aquí la clave "service_role".
export const SUPABASE_URL = "https://lwoqfdimpbboktdygukh.supabase.co";
export const SUPABASE_CLAVE_PUBLICA = "sb_publishable_LdxVx_j9mCYhQJ2f52LquQ_IiFtL5uz";
// Cada usuario entra con su nombre; en Supabase existe como <usuario>@<DOMINIO_USUARIOS>
export const DOMINIO_USUARIOS = "ciclovictoria.app";

// ---------- Usuarios ----------
// Las contraseñas viven en Supabase Auth (Authentication → Users), no en el código.
export const ROLES = { ADMIN: "admin", CLIENTE: "cliente" };
export const USUARIOS = [
  {
    usuario: "pacho",
    nombre: "Pacho",
    nombreCorto: "Pacho",          // el que se ve en la ficha del header
    rol: ROLES.ADMIN,
  },
  {
    usuario: "osney",
    nombre: "Osney",
    nombreCorto: "Osney",
    rol: ROLES.ADMIN
  },
  {
    usuario: "marleny",
    nombre: "Marleny",
    nombreCorto: "Marleny",
    rol: ROLES.ADMIN
  }
];
export const MAX_INTENTOS_LOGIN = 5;
export const SEGUNDOS_BLOQUEO = 30;

// ---------- Proveedores ----------
export const PROVEEDORES_INICIALES = [
  { id: "ha", nombre: "HA Bicicletas" },
  { id: "len", nombre: "Len Importaciones" }
];
export const SIN_PROVEEDOR = "sin";

// Cómo se asigna el proveedor al importar:
// 1) si el nombre contiene una palabra clave, 2) por categoría, 3) por defecto
export const REGLAS_PROVEEDOR = {
  palabrasClave: { len: ["LEN"], ha: ["HA"] },
  porCategoria: { "Bicicletas": "ha" },
  porDefecto: "len"
};

// ---------- Deducciones al importar ----------
export const MARCAS_CONOCIDAS = [
  "GW", "ONTRAIL", "SHIMANO", "KENDA", "CST", "GSA", "CHAOYANG", "LOUIT", "DTM",
  "OPTIMUS", "EVEREST", "RHINO", "PROFIT", "EASTMAN", "WANDA", "SUNRACE", "VELEN",
  "VENZO", "YASUKA", "YUANDA", "TRIDIAMOND", "TORRIOLI", "RUGGED", "QOOQER", "KMC",
  "VITTORIA", "SWALLOW", "FONTANA", "BETO", "RIGON", "KOBUSHI", "TREVO", "BIKEPART",
  "LYNX", "MILLAN", "PACHA", "ZUPRA", "LEN", "HA"
];
// Nombres que se muestran distinto a como aparecen en el Excel
export const NOMBRES_MARCA = { LEN: "Len", HA: "HA", MILLAN: "Millán" };

export const CATEGORIAS_MOTO = ["Repuestos moto"];
// Palabras en el nombre que indican producto de moto
export const PATRON_MOTO = /(^|\s)MOTO(\s|$)|MOTOCARRO|\b\d{2,3}\s?CC\b/i;

// Categorías cuyo número de rin se convierte en talla y etiqueta de compatibilidad
export const CATEGORIAS_CON_RIN = [
  "Bicicletas", "Aros", "Llantas", "Neumáticos", "Radios", "Marcos", "Ruedas auxiliares", "Tubos y parales"
];
export const RINES_VALIDOS = ["12", "14", "16", "18", "20", "24", "26", "27.5", "28", "29", "700"];

export const COLORES_CONOCIDOS = {
  NEGRO: "Negro", NEGRA: "Negro", NEG: "Negro",
  BLANCO: "Blanco", BLANCA: "Blanco",
  ROJO: "Rojo", ROJA: "Rojo",
  AZUL: "Azul", VERDE: "Verde",
  AMARILLO: "Amarillo", AMARILLA: "Amarillo",
  ROSADO: "Rosado", ROSADA: "Rosado", ROSA: "Rosado", FUCSIA: "Fucsia",
  GRIS: "Gris", PLATEADO: "Plateado", PLATEADA: "Plateado",
  DORADO: "Dorado", DORADA: "Dorado",
  MORADO: "Morado", MORADA: "Morado", LILA: "Lila",
  NARANJA: "Naranja",
  CROMADO: "Cromado", CROMADA: "Cromado", CROM: "Cromado",
  MULTICOLOR: "Multicolor", BICOLOR: "Bicolor"
};

// Productos que manejan serial y garantía por defecto
export const CATEGORIAS_CON_SERIAL = ["Bicicletas"];
export const GARANTIA_POR_CATEGORIA = { "Bicicletas": 12 };

// ---------- Interfaz ----------
export const PRODUCTOS_POR_PAGINA = 20;
export const MAX_ESCALONADAS = 12;
export const IMAGEN_MAX_MB = 3;
export const IMAGEN_MAX_PX = 600;
export const IMAGEN_CALIDAD = 0.7;
export const LIMITE_ALMACENAMIENTO_MB = 5;

// ---------- Claves de localStorage ----------
export const CLAVES = {
  productos: "cv_productos",
  proveedores: "cv_proveedores",
  historial: "cv_historial",
  meta: "cv_meta",
  sesion: "cv_sesion",
  bloqueo: "cv_bloqueo_login",
  tema: "cv_tema",
  preferencias: "cv_preferencias",
  configuracion: "cv_configuracion",
  carrito: "cv_carrito",
  cotizaciones: "cv_cotizaciones",
  seriales: "cv_seriales",
  garantias: "cv_garantias",
  ordenes: "cv_ordenes"
};

// ---------- Seriales, garantías y taller ----------
export const ESTADOS_SERIAL = ["Disponible", "Vendido", "En taller", "Reportado"];
export const DIAS_GARANTIA_POR_VENCER = 30;
export const PREFIJO_ORDEN = "OT-";
export const ESTADOS_TALLER = ["Recibida", "En diagnóstico", "En reparación", "Esperando repuesto", "Lista", "Entregada", "Cancelada"];
export const ESTADOS_TALLER_FINALES = ["Entregada", "Cancelada"];
export const DIAS_ENTREGA_ESTIMADA = 3;
// Servicios de mano de obra sugeridos (valores de referencia, se pueden cambiar en cada orden)
export const SERVICIOS_TALLER = [
  { descripcion: "Mantenimiento general", valor: 45000 },
  { descripcion: "Ajuste de cambios", valor: 15000 },
  { descripcion: "Ajuste de frenos", valor: 15000 },
  { descripcion: "Centrado de rueda", valor: 12000 },
  { descripcion: "Cambio de neumático", valor: 8000 },
  { descripcion: "Parchado", valor: 5000 },
  { descripcion: "Cambio de aceite", valor: 20000 },
  { descripcion: "Sincronización de motor", valor: 60000 }
];

// ---------- Cotizaciones ----------
export const PREFIJO_COTIZACION = "COT-";
export const VALIDEZ_COTIZACION_DIAS = 8;
export const ESTADOS_COTIZACION = ["Borrador", "Enviada", "Aprobada", "Rechazada", "Vencida"];

// Datos de la tienda para los PDF (editables desde Perfil)
export const DATOS_TIENDA_INICIALES = {
  nombre: "CicloVictoria",
  direccion: "",
  ciudad: "",
  telefono: "",
  nit: "",
  correo: ""
};

// ---------- Imágenes de referencia ----------
// Mientras un producto no tenga foto propia (subida desde Editar) se muestra, en este orden:
// 1) la foto del modelo, solo para bicicletas cuyo nombre coincide con un patrón;
// 2) la foto ilustrativa de su categoría. Ambas llevan la etiqueta "Foto de referencia".
// Fuentes y licencias en creditos.html.
export const IMAGENES_CATEGORIA = {
  "Accesorios": "img/categorias/accesorios.jpg",
  "Aros": "img/categorias/aros.jpg",
  "Balineras": "img/categorias/balineras.jpg",
  "Bicicletas": "img/categorias/bicicletas.jpg",
  "Bielas y platos": "img/categorias/bielas-y-platos.jpg",
  "Bujes y ejes": "img/categorias/bujes-y-ejes.jpg",
  "Cadenas": "img/categorias/cadenas.jpg",
  "Direcciones": "img/categorias/direcciones.jpg",
  "Frenos": "img/categorias/frenos.jpg",
  "Llantas": "img/categorias/llantas.jpg",
  "Manubrios y manilares": "img/categorias/manubrios-y-manilares.jpg",
  "Marcos": "img/categorias/marcos.jpg",
  "Neumáticos": "img/categorias/neumaticos.jpg",
  "Otros": "img/categorias/otros.jpg",
  "Pedales": "img/categorias/pedales.jpg",
  "Radios": "img/categorias/radios.jpg",
  "Repuestos moto": "img/categorias/repuestos-moto.jpg",
  "Ruedas auxiliares": "img/categorias/ruedas-auxiliares.jpg",
  "Sillas": "img/categorias/sillas.jpg",
  "Transmisión": "img/categorias/transmision.jpg",
  "Tubos y parales": "img/categorias/tubos-y-parales.jpg"
};

// Bicicletas infantiles (rin 12 a 16) sin modelo reconocido: foto de una bicicleta infantil
export const IMAGEN_BICICLETA_INFANTIL = "img/categorias/ruedas-auxiliares.jpg";
export const RINES_INFANTILES = ["Rin 12", "Rin 14", "Rin 16"];

// Fotos por modelo de bicicleta. El patrón se prueba sobre el nombre en mayúsculas y sin tildes.
export const IMAGENES_MODELO = [
  { modelo: "GW Lightning", patron: /LIGHTNING/, imagen: "img/modelos/gw-lightning.jpg" },
  { modelo: "GW Lancer", patron: /LANCER/, imagen: "img/modelos/gw-lancer.jpg" },
  { modelo: "GW Jaguar", patron: /JAGUAR/, imagen: "img/modelos/gw-jaguar.jpg" },
  { modelo: "GW Scorpion", patron: /SCORPION/, imagen: "img/modelos/gw-scorpion.jpg" },
  { modelo: "GW Lynx", patron: /LYNX/, imagen: "img/modelos/gw-lynx.jpg" },
  { modelo: "GW Malibu", patron: /MALIBU/, imagen: "img/modelos/gw-malibu.jpg" },
  { modelo: "GW de impulso", patron: /IMPULSO/, imagen: "img/modelos/gw-impulso.jpg" },
  { modelo: "Ontrail Speed Racer", patron: /SPEED RACER/, imagen: "img/modelos/ontrail-speed-racer.jpg" },
  { modelo: "Ontrail Blaster", patron: /BLASTER/, imagen: "img/modelos/ontrail-blaster.jpg" },
  { modelo: "Venzo Venture", patron: /VENTURE/, imagen: "img/modelos/venzo-venture.jpg" },
  { modelo: "Venzo Thorn", patron: /\bTHORN\b/, imagen: "img/modelos/venzo-thorn.jpg" },
  { modelo: "Optimus Aquila", patron: /AQUILA|AGUILA/, imagen: "img/modelos/optimus-aquila.jpg" },
  { modelo: "Profit Montana X20", patron: /MONTANA/, imagen: "img/modelos/profit-montana-x20.jpg" },
  { modelo: "Profit Boston X30", patron: /BOSTON/, imagen: "img/modelos/profit-boston-x30.jpg" },
  { modelo: "Profit Aspen", patron: /^(?!.*ONTRAIL).*ASPEN/, imagen: "img/modelos/profit-aspen.jpg" }
];

// ---------- Futuro (NO implementado todavía) ----------
export const WHATSAPP_ASESOR = "";
export const PEDIDOS_HABILITADOS = false;
