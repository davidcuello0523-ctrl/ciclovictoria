# CicloVictoria · Inventario, cotizaciones y taller

Aplicación web de **CicloVictoria**, un local de bicicletas, repuestos, accesorios y algunos productos de moto con taller de reparación.

- **Catálogo público** (`index.html`): los clientes ven qué productos hay y si hay existencia, **sin precios**.
- **Panel de administración** (`admin.html`): inventario con precios, costos y márgenes, proveedores, carrito y cotizaciones con PDF, taller con tablero kanban, seriales y garantías, códigos QR y escáner, estadísticas, historial global, búsqueda Ctrl + K y perfil.

Hecho con **HTML5, CSS3 y JavaScript ES6+ puro**, sin frameworks. Las únicas librerías se cargan por CDN con versión fija y solo en las páginas que las usan:

| Librería | Versión | Para qué | Dónde |
|---|---|---|---|
| SheetJS (xlsx) | 0.18.5 | Leer y exportar Excel | `index.html`, `admin.html` |
| jsPDF + jspdf-autotable | 2.5.2 / 3.8.4 | PDF de cotizaciones, órdenes y garantías | `admin.html` |
| qrcode | 1.5.1 | Generar códigos QR | `admin.html` |
| html5-qrcode | 2.3.8 | Escanear (respaldo de `BarcodeDetector`) | `index.html`, `admin.html` |
| Chart.js | 4.4.4 | Estadísticas | `admin.html` |

Las fuentes Montserrat e Inter se cargan desde Google Fonts.

> **Estado:** las 4 fases están terminadas y las 30 pruebas del checklist pasan. El detalle está en `PROGRESO.md`.

---

## Cómo ejecutarlo

1. Abre la carpeta `ciclovictoria/` en VS Code.
2. Instala la extensión **Live Server**.
3. Clic derecho sobre `index.html` → **Open with Live Server**.
4. Se abre `http://127.0.0.1:5500/index.html`.

Hace falta un servidor local (Live Server) por dos razones:
- `fetch` no puede leer `data/productos.xlsx` si abres el archivo con doble clic (`file://`).
- La cámara del escáner solo funciona en `localhost` o HTTPS (GitHub Pages ya es HTTPS).

## El Excel

- Va en **`data/productos.xlsx`**.
- La primera vez que se abre la página, se lee el Excel y los productos se guardan en el navegador (`localStorage`). Desde ahí se usan los datos guardados.
- En el panel admin:
  - **Recargar desde Excel** vuelve a leer el archivo (pide confirmación y permite subir otro). Conserva las imágenes y el historial de los productos con la misma referencia.
  - **Exportar a Excel** descarga todas las hojas: Productos, Proveedores, Cotizaciones, Órdenes de taller, Seriales y Garantías. Ese archivo se puede volver a cargar con "Recargar desde Excel".
  - En Productos van, en columnas separadas, el precio base (sin IVA) y el precio final de cada tipo, más "Lleva IVA" (Sí/No). Al volver a importarlo se leen solo los precios base y "Lleva IVA". Un Excel exportado antes del cambio ("Precio", "Precio mayorista") también se lee: esos precios ya eran sin IVA.
- Si el archivo no se encuentra, la página muestra la ruta esperada y un botón para subirlo a mano.

### Mapeo de columnas (`js/config.js`)

El Excel actual (`Inventario_Bicicletas_MYD.xlsx`) usa la hoja **"Inventario consolidado"**, con los encabezados en la **fila 4**:

| Campo | Columna del Excel | Si no existe… |
|---|---|---|
| nombre | `Producto` | — |
| categoria | `Categoría` | "Sin categoría" |
| stock | `Cantidad total` | 0 |
| costo | `Costo unitario promedio` | "Sin costo" (el costo 0 también cuenta como "Sin costo") |
| referencia | — | Se genera `CV-0001`, `CV-0002`… |
| precioPublicoBase | — | Precio al público **sin IVA**. Sale del costo: **bicicletas +30 %**, **repuestos, accesorios y moto +60 %**, redondeado a la **centena más cercana** (1.587 → 1.600, 1.534 → 1.500) |
| precioMayorBase | — | Precio al por mayor **sin IVA**. Sale del costo: **bicicletas +20 %**, **repuestos, accesorios y moto +45 %**, con el mismo redondeo |
| aplicaIva | — | `false` para las categorías de `CATEGORIAS_SIN_IVA` (hoy solo "Bicicletas"); `true` para todo lo demás. Se puede cambiar por producto |
| linea | — | "Moto" si la categoría es "Repuestos moto" o el nombre dice MOTO / MOTOCARRO / 125CC; si no, "Bicicleta" |
| marca | — | Se busca en el nombre con `MARCAS_CONOCIDAS` (GW, ONTRAIL, KENDA…) |
| proveedor | — | Si el nombre dice LEN → Len Importaciones; si dice HA → HA Bicicletas; bicicletas → HA Bicicletas; repuestos y accesorios → Len Importaciones |
| color | — | Se busca en el nombre (NEGRO, ROJO, CROMADO…) |
| talla | — | "Rin N" para bicicletas ("BIC 20…" → "Rin 20") |
| minStock | — | 2 |

Además:
- Se genera la **compatibilidad** "Rin N" para aros, llantas, neumáticos, radios, marcos y otros productos con número de rin.
- Las bicicletas quedan con `manejaSerial` activo y 12 meses de garantía.

Para usar otro Excel, cambia en `js/config.js` los valores de `HOJA_EXCEL`, `FILA_ENCABEZADOS` y `MAPEO_COLUMNAS`. Los nombres de columna se comparan sin tildes ni mayúsculas. Si una columna no existe, se usa el valor por defecto y se avisa en la consola.

La limpieza de datos hace esto:
- Quita espacios.
- Convierte `"$ 505.000"`, `"505,000"` y similares a número.
- Descarta filas vacías, la fila `TOTAL` y las notas.
- Detecta referencias duplicadas.

## Usuarios

| Nombre | Usuario |
|---|---|
| Pacho | `pacho` |
| Osney | `osney` |
| Marleny | `marleny` |

- Las cuentas y contraseñas viven en **Supabase Auth**; el código no guarda ninguna contraseña ni hash.
  En Supabase cada usuario existe como `usuario@ciclovictoria.app` (ej. `pacho@ciclovictoria.app`).
- Tras 5 intentos fallidos, el login se bloquea 30 segundos.
- **"Recordarme"** mantiene la sesión al cerrar el navegador. Sin esa opción, la sesión dura mientras la pestaña esté abierta.
- **¿Olvidaste tu contraseña?** (en `login.html`): se cambia con el usuario y su **código de recuperación**. Supabase guarda solo el hash del código (`supabase-codigos.sql`, archivo privado que no está en GitHub).
- **Perfil → Cambiar contraseña** y **Perfil → Restablecer contraseña de otro administrador** cambian la contraseña en Supabase: vale en todos los equipos.

## Guardado en la nube (Supabase)

Todo lo que se modifica en el panel (productos, proveedores, cotizaciones, seriales, garantías,
órdenes del taller, historial y configuración) se guarda en la tabla `datos` de Supabase.
Al entrar como administrador se baja lo último, así que cualquier PC ve lo mismo.
El catálogo público (sin precios, costos ni stock) se actualiza solo con cada cambio.

**Configuración (una sola vez):**

1. Crea un proyecto gratis en [supabase.com](https://supabase.com).
2. **SQL Editor** → pega y ejecuta `supabase.sql`; luego `supabase-codigos.sql` (archivo privado).
3. **Authentication → Users → Add user** por cada admin: correo `pacho@ciclovictoria.app`
   (igual `osney@…`, `marleny@…`), su contraseña y marca *Auto Confirm User*.
4. **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up*.
5. **Project Settings → API**: copia *Project URL* y la clave *anon / publishable* en
   `SUPABASE_URL` y `SUPABASE_CLAVE_PUBLICA` de `js/config.js`. Nunca uses la clave `service_role`.
6. Entra al panel como admin: la primera vez sube a la nube lo que había en ese navegador.

> Seguridad: la clave pública puede estar en el código. Lo que protege los datos son las políticas
> RLS de `supabase.sql`: solo los correos de la tabla `administradores` leen o escriben; los
> visitantes solo pueden leer `catalogo_publico`. Si dos admins editan lo mismo a la vez, gana el último en guardar.

## Publicación en internet (GitHub Pages)

El sitio se publica **sin el Excel**, para que los costos nunca queden en internet:

- **`data/productos.xlsx` no se sube** (está en `.gitignore`). Tampoco `PROGRESO.md`, que tiene cifras internas.
- **Catálogo público:** lee `data/catalogo.json`, que no tiene precios, costos, proveedores ni cantidades exactas; solo "Disponible", "Pocas unidades" o "Agotado".
- **Panel admin:** también está en línea. La primera vez en cada computador muestra **"Subir Excel manualmente"**: el administrador carga su Excel y los datos quedan **solo en su navegador**.

**Para actualizar lo que ven los clientes:**
1. En el panel, pulsa **Catálogo público**. Se descarga `catalogo.json`, verificado para que no lleve precios.
2. En GitHub, entra a la carpeta `data` → **Add file → Upload files**, arrastra el archivo y pulsa **Commit changes**.
3. En uno o dos minutos el sitio muestra el catálogo nuevo.

> Los datos del panel (cotizaciones, taller, seriales, cambios de inventario) **no se comparten entre computadores**: cada navegador tiene los suyos. Para compartirlos hace falta un backend (ver "Mejoras futuras").

**Dominio propio (.com):** GitHub Pages acepta dominios propios. Se agrega un archivo `CNAME` con el dominio y se configuran los DNS del proveedor. Para proteger además el panel con inicio de sesión por correo, conviene migrar a Cloudflare Pages + Cloudflare Access.

## Estructura

```
ciclovictoria/
├── index.html          catálogo público (sin precios)
├── login.html          inicio de sesión
├── admin.html          panel de administración
├── css/
│   ├── base.css        variables de marca, tipografía, reset, modo oscuro
│   ├── componentes.css botones, header, chips, formularios, tarjeta de producto, modales, toasts
│   ├── animaciones.css keyframes; todo se apaga con prefers-reduced-motion
│   └── paginas.css     estilos del catálogo, login y panel admin
├── js/
│   ├── config.js       marca, usuarios, proveedores, mapeo del Excel y reglas
│   ├── datos.js        lectura del Excel, limpieza, localStorage, CRUD, historial, filtros
│   ├── precios.js      precioFinal(): único cálculo de IVA del proyecto
│   ├── auth.js         sesión, roles, bloqueo por intentos
│   ├── ui.js           tarjeta de producto, modal, toast, historial, uploader, logo, íconos
│   ├── header.js       header adaptable: menú "Más ▾", desplegables y panel lateral (< 900 px)
│   ├── catalogo.js     catálogo público
│   ├── login.js        página de login
│   ├── admin.js        Inicio, inventario, perfil, historial global, Ctrl + K y escaneo rápido
│   ├── cotizaciones.js  carrito flotante, cotizaciones, aprobación y PDF
│   ├── proveedores.js   proveedores: comparativo, ficha, crear/editar/eliminar
│   ├── taller.js        órdenes OT, kanban con arrastrar y soltar, repuestos, mano de obra, PDF
│   ├── seriales.js      seriales, garantías, reclamos y certificado PDF
│   ├── qr.js            QR, hoja de etiquetas y escáner (BarcodeDetector / html5-qrcode)
│   └── graficos.js      estadísticas con Chart.js
├── data/productos.xlsx
├── img/
│   ├── logo.svg, favicon.svg
│   ├── categorias/     21 fotos ilustrativas, una por categoría (dominio público / Creative Commons)
│   └── modelos/        15 fotos de modelos de bicicleta (fabricante o distribuidor)
├── creditos.html       fuente y licencia de cada imagen
├── PROGRESO.md
└── README.md
```

## Módulos (Fase 1)

- **Catálogo público:**
  - Inicio con buscadores, carrusel de marcas, destacados y accesos por categoría.
  - Catálogo con filtros de línea, categoría, marca, color, talla y compatibilidad, más búsqueda por texto y por referencia.
  - Orden, "Con existencia | Todos" y páginas de 20 en 20.
  - Todo lo que se pinta pasa por `productoPublico()`, que quita precio, costo, proveedor, stock exacto e historial.
- **Tarjeta de producto horizontal** (`crearTarjetaProducto`):
  - "Ver detalles" despliega la ficha dentro de la misma tarjeta.
  - Solo hay una tarjeta abierta a la vez, salvo que se active "Permitir varias abiertas".
  - El contenido del panel se genera la primera vez que se abre.
  - Un solo listener por lista maneja todos los botones.
- **Login:** bicicleta que se dibuja trazo a trazo, etiquetas flotantes, mostrar contraseña, "Recordarme" y bloqueo tras 5 intentos.
- **Inicio admin:**
  - KPIs: productos, unidades, valor a precio de venta, valor a costo, utilidad potencial, stock bajo y agotados.
  - Alertas de agotados y de productos sin costo.
  - Reabastecimiento agrupado por proveedor, con cantidad sugerida `(minStock × 2) − stock`.
  - Últimos 5 movimientos.
- **Inventario admin:**
  - Crear, editar y eliminar productos. Al escribir el costo se calculan solos el precio al público y el precio al por mayor (reglas en `GANANCIAS`, config.js). Se pueden cambiar a mano.
  - En el carrito se elige **Público** o **Al por mayor**; la cotización guarda el tipo y el PDF lo indica cuando es al por mayor.
  - Ajuste rápido de stock con motivo, edición del precio en línea (Enter guarda, Esc cancela), destacar y mostrar/ocultar.
  - Imágenes con arrastrar y soltar, comprimidas a 600 px y calidad 0,7.
  - Indicador de espacio usado en el navegador e historial desplegable por producto.
  - Filtros: línea, existencia, estado de stock, visibilidad, categoría, marca, proveedor y compatibilidad.

## Módulos (Fase 2)

- **Proveedores:**
  - Tarjetas comparativas con productos, unidades, valor a costo y a venta, margen promedio, stock bajo y participación en el inventario.
  - Ficha con los datos de contacto y el logo o la inicial.
  - Crear y editar proveedores. No se puede eliminar uno que tenga productos: primero hay que reasignarlos a otro.
  - Al importar, el proveedor se relaciona sin tildes ni mayúsculas.
- **IVA (19 %):**
  - Los precios se guardan **sin IVA** (`precioMayorBase`, `precioPublicoBase`). Nunca se guarda el precio con IVA, así que recargar o exportar no lo aplica dos veces.
  - Repuestos, accesorios y demás productos muestran el precio **con el IVA incluido** y la nota gris "IVA incluido". Las bicicletas completas (`CATEGORIAS_SIN_IVA`) muestran su precio tal cual, sin ninguna mención de IVA.
  - El único cálculo de IVA y de redondeo está en `js/precios.js`: `precioFinal(producto, "mayor" | "publico")` = `redondearArriba(base × 1,19)` si `aplicaIva`, si no `redondearArriba(base)`.
  - **Redondeo hacia arriba a la centena** (`REDONDEO = 100` en config.js), a favor del negocio y después de sumar el IVA: 1.234 → 1.300, 1.201 → 1.300, 1.300 → 1.300. Las bases guardadas no se redondean.
  - En el formulario se escriben los precios base y al lado se ve el precio final en vivo. El interruptor **"Lleva IVA 19 %"** lo cambia por producto.
- **Costo y margen:**
  - `margen = (precio sin IVA − costo) / precio sin IVA × 100`, donde el precio sin IVA es el precio final redondeado ÷ 1,19 (o el final, si no lleva IVA). Refleja lo que realmente se cobra; el margen y la utilidad nunca incluyen el IVA.
  - El margen mínimo es 20 % por defecto y se puede cambiar desde Perfil, en general y por categoría.
  - Chip verde, naranja o rojo; filtro "Margen bajo" y alerta en el Inicio.
  - **Calculadora** en el formulario: precio sin IVA = `costo ÷ (1 − margen)`. Sugiere la base (con decimales) que deja el precio final en una centena exacta y lo muestra al lado.
- **Compatibilidad:** campo de etiquetas (Enter o coma agrega, × quita) con sugerencias de las ya usadas. Filtro en ambas vistas y carrusel de "Productos compatibles" en la ficha.
- **Carrito flotante:**
  - Pestaña negra con contador amarillo.
  - Cada línea tiene − / +, cantidad editable y descuento; hay además un descuento general.
  - Las líneas llevan el precio final (con IVA en los repuestos). Totales en vivo con `calcularTotales(items, descuentoGeneral)`: subtotal, descuentos y total, **sin sumar IVA**. Debajo, en pequeño, "Incluye IVA: $X", calculado hacia atrás solo sobre los ítems con IVA (no aparece si todo son bicicletas).
  - Cada línea (precio × cantidad, con descuento de línea y con descuento general) se redondea hacia arriba a la centena; el total es la suma de esos valores (3 × $1.300 con 10 % → 3.510 → $3.600).
  - Avisa si un descuento deja un ítem bajo el costo y no deja pasar del stock. El mismo producto suma en la misma línea.
  - Se guarda en el navegador.
- **Cotizaciones:**
  - Consecutivo `COT-0001`, que nunca se reutiliza.
  - Cada cotización guarda el precio y el costo del momento.
  - Las cotizaciones guardadas antes del cambio de IVA (sin `reglaIva`) conservan sus valores originales con el IVA aparte, también si se editan.
  - Estados: Borrador, Enviada, Aprobada, Rechazada y Vencida (automática por fecha).
  - Buscador y filtros por estado y fechas.
  - Acciones: ver, editar (vuelve al carrito y guarda sobre la misma), duplicar y eliminar.
  - **Aprobar** puede descontar el stock ("Venta – COT-0001" en el historial). Si luego se cambia el estado, ofrece devolver las unidades.
  - **PDF para el cliente sin costos ni márgenes**, vista imprimible e historial desplegable.
- **Perfil:** cambio de contraseña, márgenes mínimos (general y por categoría), datos de la tienda para el PDF y resumen de los movimientos del administrador.

## Módulos (Fase 3)

- **Seriales:**
  - Cada bicicleta o moto (`manejaSerial`) puede tener registrado su número de serie o de marco.
  - Estados: Disponible, Vendido, En taller y Reportado.
  - No se permiten seriales repetidos.
  - El buscador responde al instante, por ejemplo "Vendido a Ana Gómez el 24/09/2026 (COT-0001)".
  - Un serial se puede marcar como **Reportado** (por ejemplo, robado) con una nota. Si aparece en una orden de taller, se resalta en rojo.
  - Al **ingresar stock** de un producto con serial, se piden los seriales nuevos.
  - Un panel avisa qué productos tienen más stock que seriales registrados.
- **Venta con serial:** al aprobar una cotización se pide el serial de cada unidad. Se puede elegir uno disponible o escribir uno nuevo. El serial pasa a "Vendido" con cliente, fecha y cotización.
- **Garantías:**
  - Se crean solas al aprobar una venta de productos con `garantiaMeses > 0`: una por unidad con serial, o una por línea si no tiene serial.
  - Estados automáticos: Vigente, Por vencer (30 días o menos), Vencida y Anulada (si se devolvió el stock).
  - Buscador con respuesta rápida ("Esta garantía está vigente hasta el 24/09/2027").
  - **Reclamos** con descripción, fotos y resolución (Pendiente, Reparado, Cambiado o Rechazado), que pueden crear una orden de taller vinculada.
  - **Certificado PDF** para el cliente.
- **Taller:**
  - Órdenes `OT-0001` con cliente, vehículo (tipo, marca, modelo, color y serial), trabajo, diagnóstico, responsable, fechas y hasta 3 fotos.
  - **Repuestos** del inventario, sugiriendo primero los compatibles con el vehículo. La compatibilidad sale del producto vendido con ese serial, del rin escrito en el modelo y de si es moto.
  - **Mano de obra** con servicios sugeridos. El valor que se escribe es el final, con el IVA incluido; el total muestra "Incluye IVA" como en las cotizaciones. Las órdenes anteriores al cambio conservan el IVA aparte.
  - **Tablero kanban con arrastrar y soltar** (Recibida → En diagnóstico → En reparación → Esperando repuesto → Lista → Entregada, y Cancelada) y vista de lista con filtros.
  - Al pasar a **Entregada** se descuentan los repuestos ("Uso en taller – OT-0001"). "Entregada" y "Cancelada" son estados finales.
  - Días en el taller, alerta de retraso, historial y **PDF** de ingreso o de entrega.
- **Inicio:** indicadores de órdenes activas y garantías por vencer, panel "Listas para entregar" y alerta de órdenes atrasadas.

## Módulos (Fase 4)

- **Códigos QR:**
  - Cada producto tiene un QR con su **referencia**, y cada serial uno con su **serial**.
  - El QR se ve en la ficha desplegada, con el botón QR de la tarjeta y en la ficha del serial, y se descarga en PNG.
- **Imprimir etiquetas:**
  - Eliges los productos y cuántas etiquetas de cada uno, y sale una hoja carta tipo adhesivo de 3 × 10 con QR, nombre corto y referencia.
  - La casilla **"Incluir precio"** viene apagada.
  - Si el inventario está filtrado con pocos productos, se proponen esos.
- **Escáner:**
  - Usa `BarcodeDetector` si el navegador lo tiene y, si no, **html5-qrcode**.
  - Si no hay cámara o permiso, muestra un mensaje claro y deja **escribir el código a mano** o **leerlo desde una foto**.
  - Está en:
    - El catálogo público (Inicio y Catálogo).
    - El inventario admin.
    - El carrito (agrega el producto).
    - Los repuestos de la orden de taller.
    - El buscador de seriales.
    - La paleta Ctrl + K.
- **Escaneo rápido de stock:** cada código abre un mini panel para sumar o restar unidades con motivo y vuelve a abrir el escáner para seguir. Si el código no existe, ofrece **crear el producto con la referencia ya escrita**. Si es un serial, abre su ficha.
- **Estadísticas** (Chart.js, en negro, grises y amarillo; con el selector Todas / Bicicletas / Motos):
  - **Inventario:**
    - Valor por categoría (costo y venta).
    - Unidades por marca.
    - Bicicletas vs Motos.
    - Estados de stock (dona).
    - Top 10 por valor en inventario.
    - Margen promedio por categoría (en rojo si está bajo el mínimo) y por proveedor.
    - Valor por proveedor.
  - **Cotizaciones:** por estado y valor cotizado y aprobado por mes.
  - **Taller y garantías:**
    - Órdenes por estado y tiempo promedio en el taller.
    - Garantías vigentes, por vencer y vencidas.
    - Reclamos por producto.
  - **Movimientos:** entradas vs salidas de stock por día (últimos 30 días).
  - **Tarjetas:** producto más caro, mayor margen, productos bajo el margen mínimo, % de stock crítico, top 5 más cotizados (con `reduce()`) y repuesto más usado en el taller.
  - Una serie vacía muestra "Sin datos". Los gráficos se animan al cargar, salvo con movimiento reducido.
- **Historial global:**
  - Línea de tiempo agrupada por día ("Hoy", "Ayer", fecha), con 8 movimientos por día y "Ver más", y 7 días a la vez con "Ver días anteriores".
  - Filtros por administrador, tipo, módulo y fechas, más buscador. Cada movimiento con producto lleva a su tarjeta.
- **Búsqueda global (Ctrl + K o el botón de la lupa):**
  - En el panel busca productos, seriales, cotizaciones, órdenes de taller, proveedores y garantías, agrupados por tipo.
  - En el catálogo público busca solo productos visibles y **sin precios**.
  - Se maneja con ↑ ↓, Enter y Esc, resalta las coincidencias (creadas con DOM) y trae un botón de escáner.
- **Animaciones:**
  - Contadores de los KPIs que suben desde 0.
  - Rebote del carrito y salto del contador.
  - Carrusel de marcas infinito que se pausa con el mouse.
  - Bicicleta del login que se dibuja trazo a trazo con las ruedas girando.
  - Entrada de secciones, aparición escalonada, skeletons, toasts y modales.
  - **Todo se apaga con `prefers-reduced-motion`**.
- **Accesibilidad:**
  - Todos los campos tienen `label` o `aria-label`, y los botones de ícono tienen `aria-label` (revisado automáticamente en todas las vistas).
  - Foco visible amarillo de 3 px y foco atrapado en los modales.
  - `aria-expanded` y `aria-controls` en "Ver detalles", y `role` de lista en la paleta.
  - Contraste AA.

## Imágenes de los productos

Mientras un producto no tenga **foto propia** (subida desde Editar en el panel), la app muestra una imagen de referencia, en este orden:

1. **Foto del modelo**, solo para bicicletas cuyo nombre coincide con un modelo conocido. Son 15 modelos (GW Lightning, Lancer, Jaguar, Lynx, Scorpion, Malibu y la de impulso; Ontrail Speed Racer y Blaster; Venzo Venture y Thorn; Optimus Aquila; Profit Montana X20, Boston X30 y Aspen), que cubren **73 de las 269 bicicletas**. Las fotos son del fabricante o de distribuidores de la marca.
2. **Bicicleta infantil** (rin 12 a 16) sin modelo reconocido: foto de una bicicleta infantil con rueditas.
3. **Foto de la categoría**: 21 fotos de dominio público o Creative Commons (Openverse y Wikimedia Commons).
4. El dibujo de bicicleta o moto, si alguna imagen no carga.

Las imágenes que no son del producto exacto llevan la etiqueta **"Foto de referencia"**. El detalle del producto aclara si es "del modelo" o "ilustrativa de la categoría".

Las imágenes son archivos en `img/` y no ocupan espacio del navegador. Las reglas están en `js/config.js`:
- `IMAGENES_CATEGORIA`
- `IMAGENES_MODELO`, con un patrón sobre el nombre.
- `IMAGEN_BICICLETA_INFANTIL`

Para agregar un modelo: pon la foto en `img/modelos/` y añade una línea a `IMAGENES_MODELO`.

La fuente y la licencia de cada imagen están en **`creditos.html`** (enlace "Créditos de imágenes" en el pie del catálogo). La foto de "Ruedas auxiliares" tiene licencia CC BY-SA 4.0, que exige atribuir al autor; por eso esa página debe quedarse publicada.

⚠️ **Sobre las fotos de modelos:** son de fabricantes y tiendas, y tienen derechos de autor. Se usan como referencia del producto que el local vende, pero lo más seguro es **reemplazarlas por fotos propias** a medida que se tomen, o pedir permiso a los distribuidores (GW, Ontrail, Profit/Optimus, Venzo).

## Cómo usar el escáner

1. La cámara solo funciona en **`localhost`** (Live Server) o **HTTPS**. Desde el celular hace falta HTTPS; por ejemplo, publicando la carpeta en un hosting estático o usando un túnel.
2. La primera vez, el navegador pide permiso para la cámara: acepta.
3. Apunta al QR de la etiqueta; al leerlo, el teléfono vibra y se abre el producto.
4. Sin cámara (por ejemplo, en un computador sin webcam): escribe el código en "O escribe el código" o usa **"Leer desde una foto"**.
5. Chrome y Edge en Android y macOS traen `BarcodeDetector`. En Windows y Firefox se usa html5-qrcode.

## Checklist de pruebas

| # | Prueba | Fase | Estado |
|---|---|---|---|
| 1 | El Excel se carga y el número de productos coincide con las filas válidas (2004) | 1 | ✅ |
| 2 | Un cliente sin sesión NO ve precios ni costos (código fuente y consola) | 1 | ✅ |
| 3 | Login correcto de Marleny y David; incorrecto muestra error; bloqueo tras 5 intentos | 1 | ✅ |
| 4 | `admin.html` sin sesión redirige a `login.html` | 1 | ✅ |
| 5 | Crear producto válido → aparece en admin y, si es visible, en el catálogo público | 1 | ✅ |
| 6 | Referencia duplicada → error | 1 | ✅ |
| 7 | Stock 0 → "Agotado" en ambas vistas | 1 | ✅ |
| 8 | Cambio de precio → historial con el nombre del administrador y margen recalculado | 1 | ✅ |
| 9 | Subir imagen → se ve en ambas vistas y persiste al recargar | 1 | ✅ |
| 10 | Filtros combinados, "Con existencia", compatibilidad y estado vacío | 1 | ✅ |
| 11 | Exportar a Excel y volver a cargarlo sin errores | 1 | ✅ |
| 12 | Cerrar sesión vuelve al catálogo público | 1 | ✅ |
| 13 | Carrito: sumar y restar unidades recalcula los totales y el IVA incluido | 2 | ✅ |
| 14 | No se puede agregar más que el stock disponible | 2 | ✅ |
| 15 | El mismo producto dos veces suma en la misma línea | 2 | ✅ |
| 16 | Generar cotización → COT-0001 en el listado y carrito vacío | 2 | ✅ |
| 17 | Editar una cotización y guardar → se actualiza la misma | 2 | ✅ |
| 18 | Aprobar cotización con producto con serial → pide serial, descuenta stock, marca el serial vendido y crea la garantía | 3 | ✅ |
| 19 | PDF de cotización correcto y sin costos ni márgenes | 2 | ✅ |
| 20 | Filtro "Motos" muestra solo productos de moto | 1 | ✅ |
| 21 | Producto con "Rin 29" aparece al filtrar y en "Productos compatibles" | 2 | ✅ |
| 22 | Orden de taller con repuestos movida en el kanban hasta "Entregada" → descuenta stock | 3 | ✅ |
| 23 | Los proveedores iniciales (HA Bicicletas y Len Importaciones, según lo decidido) existen y el Excel se relaciona con ellos | 2 | ✅ |
| 24 | Precio por debajo del margen mínimo → chip rojo y alerta | 2 | ✅ |
| 25 | La calculadora sugiere el precio correcto a partir de costo y margen | 2 | ✅ |
| 26 | Serial duplicado → error; buscar un serial vendido muestra cliente y fecha | 3 | ✅ |
| 27 | La garantía cambia a "Por vencer" y "Vencida" según la fecha | 3 | ✅ |
| 28 | Imprimir etiquetas QR y escanear una etiqueta → abre el producto correcto | 4 | ✅ |
| 29 | Con `prefers-reduced-motion` activado no hay animaciones | 4 | ✅ |
| 30 | Tarjetas horizontales; "Ver detalles" despliega y oculta sin precio para el cliente | 1 | ✅ |

Las pruebas se ejecutaron automatizadas en Microsoft Edge (Chromium) sin interfaz, con 0 errores en la consola. Ver el detalle en `PROGRESO.md`.

## Mejoras futuras

- **Backend real** (por ejemplo, Node + PostgreSQL o Supabase) con autenticación segura, para que el catálogo público no reciba los datos internos y varios equipos compartan el inventario.
- **Pedidos de clientes** desde el catálogo. Ya están preparados `PEDIDOS_HABILITADOS` y los comentarios `FUTURO`.
- Botón **"Hablar con un asesor" por WhatsApp** (`WHATSAPP_ASESOR`) y envío de cotizaciones por WhatsApp.
- Imágenes en un almacenamiento externo, para no llenar los ~5 MB de `localStorage`.
- Carga masiva de seriales desde Excel y lector de códigos de barras USB para agilizar el ingreso.
- Copia de seguridad automática (exportación programada) y control de caja o ventas de mostrador.
