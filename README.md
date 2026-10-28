# Conforme — Auditoría de Facturas

App web (funciona en el celular y en el computador) para auditar la recepción de
mercadería contra la factura: foto → lectura automática (gratis) → checklist por
código → registro automático en una planilla compartida (Google Sheets o Excel en
SharePoint, lo que uses).

No requiere tienda de aplicaciones: se abre desde el navegador y se puede "instalar"
en la pantalla de inicio del celular como una app normal.

## Cómo está organizada

Tres pestañas, igual de simple en celular que en computador:

- **Auditoría** — sacas la foto, revisas los datos que se leyeron solos (hoja de
  ruta, N° factura, proveedor, fecha, ítems) y los corriges si hace falta.
- **Detalle** — el checklist: marcas cada código Correcto o Con diferencia, anotas
  cantidad real, sobrante y una observación.
- **Historial** — las auditorías guardadas en este celular/computador, su estado de
  envío, y dónde configurar el destino de los datos.

## 1. Elegir dónde se guardan los registros

La app manda cada auditoría por POST (JSON) a una URL que tú configuras en la
pestaña **Historial → Destino de los datos**. Dos opciones, elige una:

### Opción A — Google Sheets (gratis, más simple)
Ver `apps-script/README.md`... en realidad está más abajo en este mismo archivo:
pega el código de `apps-script/Code.gs` en un Google Apps Script conectado a una
Google Sheet. Detalle paso a paso en la sección "Google Sheets" más abajo.

### Opción B — Excel en SharePoint (Microsoft 365)
Ver `power-automate/README.md` — usa Power Automate como puente para ir agregando
filas a un Excel guardado en tu SharePoint o OneDrive de empresa.

Puedes tener ambas configuradas si quieres duplicar el registro, pero normalmente
basta con una.

---

## Google Sheets — paso a paso

1. Crea una Google Sheet nueva (o usa una que ya tengas), por ejemplo "Auditorías bodega".
2. Abre **Extensiones → Apps Script**.
3. Borra lo que haya en `Code.gs` y pega el contenido de `apps-script/Code.gs` (está en esta carpeta).
4. Guarda el proyecto.
5. Ve a **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario**.
6. Autoriza los permisos que pida Google.
7. Copia la URL que termina en `/exec`.
8. Pégala en la app, pestaña **Historial → Destino de los datos**.

Cada vez que cambies el código del script, crea una **nueva implementación** para
que los cambios queden activos en esa URL.

## Excel en SharePoint — resumen

Ver la guía completa en `power-automate/README.md`. En corto: Power Automate recibe
el mismo POST que mandaría a Google, y agrega una fila por ítem a una tabla de Excel
guardada en SharePoint. Necesitas acceso a Power Automate con tu cuenta del trabajo
(o que alguien de TI te ayude a armar el flujo una vez).

## 2. Publicar la app (gratis)

Es solo archivos estáticos (HTML/CSS/JS), así que cualquier hosting gratis sirve.
Importante: **tiene que ser un link con HTTPS** — abrirla como archivo local
(`file:///...`) hace que fallen la cámara y varios botones, porque el navegador
bloquea esas cosas fuera de un sitio real.

**Opción más simple — Netlify Drop**
1. Entra a https://app.netlify.com/drop (no hace falta cuenta).
2. Arrastra la carpeta completa (o directamente el .zip, Netlify lo descomprime solo).
3. Te da un link `https://algo.netlify.app` — ese es el que abres desde el celular.

**Alternativa — GitHub Pages**
1. Sube esta carpeta a un repositorio de GitHub.
2. Settings → Pages → Deploy from branch.
3. Te da un link `https://tuusuario.github.io/tu-repo/`.

## 3. Instalar en el celular

1. Abre el link (el de Netlify o GitHub Pages, **no** el archivo local) en Chrome o Safari.
2. Android: menú (⋮) → **Agregar a pantalla de inicio**.
   iPhone: botón compartir → **Agregar a pantalla de inicio**.
3. Queda como ícono normal, abre a pantalla completa.

Si en el momento de finalizar una auditoría no hay internet, queda guardada en el
celular como "Pendiente" (se ve en Historial) y se reintenta sola apenas vuelva la
conexión, o apretando "Sincronizar".

## Sobre la lectura automática (OCR)

Usa **Tesseract.js**, gratis, corre en el propio celular (no se cobra por imagen ni
se necesita cuenta). Después de sacar la foto, aparece un **recuadro de recorte**
que puedes ajustar arrastrando las esquinas — ahí defines exactamente la zona que
se va a leer. Esto es clave por dos motivos:

- **Velocidad**: el OCR demora según la cantidad de píxeles que tiene que analizar.
  Mientras más ajustado el recuadro a tu encabezado + tabla, más rápida la lectura
  (y el motor queda "precalentado" después de la primera foto, así que la segunda
  auditoría de la misma visita es más rápida todavía).
- **Precisión**: si el recuadro incluye el membrete con direcciones de sucursales
  (common en facturas chilenas), el OCR mezcla ese texto con los datos reales y la
  lectura sale peor. Ajustando el recuadro solo a encabezado + tabla, se evita ese
  ruido.

**Tip**: la primera vez que uses la app con un proveedor, prueba ajustando el
recuadro bien apretado a la zona de "N° Factura / Hoja de Ruta" y la tabla de
ítems, sin nada de membrete arriba. Una vez que veas qué recorte funciona mejor
para el formato de factura de ese proveedor, repite el mismo encuadre cada vez —
la lectura va a salir mucho más consistente.

Cuando algo no se lee bien, el campo queda **vacío**, nunca con un dato inventado:
así nunca vas a enviar un número equivocado sin darte cuenta — solo hay que
completarlo a mano antes de pasar al Detalle.

## Estructura del proyecto

```
auditoria-facturas/
├── index.html                  # Estructura de las 3 pestañas
├── manifest.json               # Configuración PWA (ícono, nombre, colores)
├── service-worker.js           # Cache para que abra rápido y funcione sin internet
├── css/style.css               # Estilos (tema oscuro + morado)
├── js/
│   ├── storage.js              # Historial local + cola de sincronización
│   ├── ocr.js                   # Lectura de la foto y extracción de campos
│   ├── backend.js               # Envío al backend configurado (Sheets o SharePoint)
│   └── app.js                    # Navegación por pestañas y lógica de cada una
├── icons/                      # Íconos de la app
├── apps-script/Code.gs         # Backend para Google Sheets
└── power-automate/             # Guía + payload de ejemplo para SharePoint
```

## Qué revisar si algo no funciona

- **Los botones no responden / la cámara no abre**: revisa que estés usando el link
  publicado (HTTPS), no el archivo local.
- **El envío a la planilla falla siempre**: revisa la URL pegada en Historial, y que
  el backend (Apps Script o Power Automate) esté bien desplegado/activado.
- **La lectura automática no reconoce nada**: prueba con mejor luz y foto más
  encuadrada, o usa "Prefiero llenarla a mano".
