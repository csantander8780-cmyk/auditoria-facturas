/**
 * Code.gs — Backend gratuito para "Conforme" (auditoría de facturas).
 *
 * Qué hace:
 *  - Recibe un POST con el JSON de una auditoría completa (encabezado + ítems).
 *  - Agrega una fila por cada ítem a la hoja "Auditorias" de esta planilla.
 *  - Si la hoja no existe, la crea con encabezados.
 *
 * Cómo instalarlo (una sola vez):
 *  1. Crea (o abre) una Google Sheet donde quieras guardar los registros.
 *  2. Menú Extensiones → Apps Script.
 *  3. Borra el contenido de Code.gs y pega TODO este archivo.
 *  4. Guarda (ícono de disco) y ponle un nombre al proyecto, ej: "Conforme backend".
 *  5. Implementar → Nueva implementación → tipo "Aplicación web".
 *       - Ejecutar como: Yo (tu cuenta)
 *       - Quién tiene acceso: Cualquier usuario
 *  6. Autoriza los permisos cuando te los pida Google.
 *  7. Copia la URL que termina en /exec — esa es la que pegas en la app
 *     (pestaña Historial → "Destino de los datos").
 */

const SHEET_NAME = "Auditorias";

const HEADERS = [
  "Fecha envío",
  "ID auditoría",
  "Hoja de ruta",
  "N° Factura",
  "Proveedor",
  "Fecha factura",
  "Auditor",
  "Turno",
  "Código",
  "Descripción",
  "Cantidad factura",
  "Unidad",
  "Cantidad real",
  "Estado",
  "Sobrante",
  "Observación",
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet();
    const rows = buildRows(payload);
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS.length).setValues(rows);
    }
    return jsonResponse({ ok: true, filas: rows.length });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  // Útil para probar que la URL quedó bien desplegada: ábrela en el navegador.
  return ContentService.createTextOutput("Backend de Conforme funcionando. Usa POST para enviar auditorías.");
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function buildRows(audit) {
  const now = new Date();
  const header = audit.header || {};
  const items = audit.items || [];

  return items.map((it) => [
    now,
    audit.id || "",
    header.hojaRuta || "",
    header.factura || "",
    header.proveedor || "",
    header.fecha || "",
    header.auditor || "",
    header.turno || "",
    it.codigo || "",
    it.descripcion || "",
    it.cantidadFactura || "",
    it.unidad || "",
    it.cantidadReal || "",
    it.estado === "diferencia" ? "Con diferencia" : it.estado === "ok" ? "Conforme" : "Sin marcar",
    it.sobrante ? "Sí" : "No",
    it.observacion || "",
  ]);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
