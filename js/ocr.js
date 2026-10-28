// ocr.js — lectura de la foto con Tesseract.js (gratis, corre en el celular) y
// extracción heurística de encabezado + ítems a partir del texto reconocido.
//
// Importante: el OCR de una factura con tabla es difícil de leer perfecto de forma
// gratuita, sobre todo si el encabezado tiene muchas columnas (listado de sucursales,
// sellos, etc.) o si la foto queda angulada. Por eso esta función SIEMPRE entrega
// datos editables: el objetivo es ahorrar tipeo, no reemplazar la revisión humana.
// Probado contra fotos reales de facturas — ver notas en cada función.

const OCR = (() => {
  // Mantiene un solo motor de lectura cargado durante toda la sesión: la primera
  // foto demora en "prender" el motor (descarga ~10-15MB de diccionario), pero las
  // siguientes auditorías de la misma visita son bastante más rápidas porque no
  // hay que volver a cargarlo.
  let workerPromise = null;
  let currentProgressCb = null;

  function getWorker() {
    if (!workerPromise) {
      workerPromise = Tesseract.createWorker("spa", 1, {
        logger: (m) => {
          if (currentProgressCb) currentProgressCb(m);
        },
      });
    }
    return workerPromise;
  }

  // Acepta un <canvas> (recomendado: ya recortado y achicado por Cropper, lo que
  // es la mayor parte de la ganancia de velocidad) o un File/Blob si se saltó el
  // recorte.
  async function recognize(imageSource, onProgress) {
    currentProgressCb = onProgress || null;
    const worker = await getWorker();
    const { data } = await worker.recognize(imageSource);
    currentProgressCb = null;
    return data.text || "";
  }

  // Quita espacios sueltos QUE EL OCR MISMO inserta entre dígitos de un mismo número
  // (pasa seguido con numeración estilizada o sellos: "43 3 1 2 51 3" → "43312513").
  // Solo se usa para buscar números de encabezado, nunca sobre la tabla de ítems.
  function collapseDigitSpaces(str) {
    return str.replace(/(\d)\s+(?=\d)/g, "$1");
  }

  function parseHeader(text) {
    const header = { hojaRuta: "", factura: "", proveedor: "", fecha: "" };
    const lines = text.split("\n");

    for (const rawLine of lines) {
      const line = collapseDigitSpaces(rawLine);

      if (!header.hojaRuta) {
        const m = line.match(/hoja\s*(?:de\s*)?ruta\D{0,6}(\d{4,15})/i);
        if (m) header.hojaRuta = m[1];
      }

      if (!header.fecha) {
        const m = line.match(/fecha\D{0,4}(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i);
        if (m) {
          let [, d, mo, y] = m;
          if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
            if (y.length === 2) y = "20" + y;
            header.fecha = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
          }
        }
      }

      // Más que buscar "razón social" seguido exacto del nombre (frágil: un membrete
      // con varias columnas hace que el OCR mezcle letras sueltas justo ahí), se toma
      // todo lo que sigue a "social" y se recorta al tramo en MAYÚSCULAS seguidas, que
      // es como vienen casi siempre los nombres de empresa/persona en estas facturas.
      if (!header.proveedor) {
        const m = line.match(/ocial\s*[:.,]?\s*([A-ZÀ-Ýa-zà-ÿ0-9.,&\s]{3,70})/i);
        if (m) {
          const capsRun = m[1].match(/^[A-ZÀ-Ý0-9.,&\s]+/);
          const candidate = (capsRun ? capsRun[0] : m[1]).trim();
          if (candidate.length >= 3) header.proveedor = candidate;
        }
      }
    }

    // El número de factura se busca por su propia marca ("N°", "Nº", "N*" — el OCR
    // suele leer el símbolo ° como asterisco o como "o") en cualquier parte del texto,
    // en vez de depender de encontrar la palabra "factura" primero: en un membrete de
    // varias columnas, esa palabra puede quedar lejos del número o cortada en pedazos
    // por la lectura en zigzag del OCR, mientras que "N° + número" casi siempre se
    // mantiene junto porque son dos palabras pegadas en el papel.
    const collapsedAll = collapseDigitSpaces(text);
    // Exige una separación real entre la "N" y el número (el símbolo °/º/* o al
    // menos un espacio) — si no, una palabra que termina en "n" pegada a un número
    // cualquiera de otra parte del membrete (ruido del OCR) podría confundirse con
    // la marca de factura.
    const factMatch = collapsedAll.match(/\bn(?:[°ºo*]\.?\s*|\.?\s+)(\d{7,9})\b/i);
    if (factMatch) {
      header.factura = factMatch[1];
    } else {
      // Respaldo: el método anterior, por si en otra factura "factura" sí queda pegada.
      const idx = text.search(/factu/i);
      if (idx >= 0) {
        const m = collapseDigitSpaces(text.slice(idx)).match(/n[°ºo]?\.?\s*(\d{6,12})/i);
        if (m) header.factura = m[1];
      }
    }

    return header;
  }

  const UNIT_RE =
    /\b(UNID|UNIDAD|UNIDADES|UND|UN|KG|KGS|GR|GRS|LT|LTS|LITRO|CAJA|CJA|CJ|PAQ|PACK|PZA|PZAS|PIEZA|DOC|DOCENA|MT|MTS|M2|M3|BULTO|SACO)\b/i;

  // Lee la tabla de ítems línea por línea. Funciona bien cuando el código queda solo
  // al inicio de la línea (lo más común). La cantidad se busca pegada a la palabra de
  // unidad (UNID, KG, etc.); si una fila viene con una marca a mano encima o quedó
  // cortada por el borde de la foto, puede fallar — por eso todo queda editable después.
  function parseItems(text) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const items = [];

    for (const line of lines) {
      const codeMatch = line.match(/^(\d{4,8})\s*\|?\s*(.*)$/);
      if (!codeMatch) continue;

      const codigo = codeMatch[1];
      const rest = codeMatch[2].replace(/\|/g, " ").replace(/\s+/g, " ").trim();
      if (rest.length < 3) continue;

      // Salta coincidencias que en realidad son encabezados de columnas, no un ítem
      if (/^(c[oó]digo|descripci[oó]n|cantidad|unidad)\b/i.test(rest)) continue;

      const unitMatch = rest.match(UNIT_RE);
      let descripcion = rest;
      let cantidad = "";
      let unidad = "UN";

      if (unitMatch) {
        descripcion = rest.slice(0, unitMatch.index).trim();
        unidad = unitMatch[0].toUpperCase();
        const afterUnit = rest.slice(unitMatch.index + unitMatch[0].length);
        const qtyMatch = afterUnit.match(/(\d{1,4})/);
        if (qtyMatch) cantidad = qtyMatch[1];
      } else {
        const tail = rest.match(/\s(\d{1,4})\s*$/);
        if (tail) {
          cantidad = tail[1];
          descripcion = rest.slice(0, tail.index).trim();
        }
      }

      if (descripcion.length < 2) continue;

      items.push({ codigo, descripcion, cantidad, unidad });
    }

    return items;
  }

  function extract(text) {
    return {
      header: parseHeader(text),
      items: parseItems(text),
      rawText: text,
    };
  }

  return { recognize, extract };
})();
