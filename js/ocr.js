// ocr.js — lectura de la foto con Tesseract.js (gratis, corre en el celular) y
// extracción heurística de encabezado + ítems a partir del texto reconocido.
//
// Importante: el OCR de una factura con tabla es difícil de leer perfecto de forma
// gratuita, sobre todo si el encabezado tiene muchas columnas (listado de sucursales,
// sellos, etc.) o si la foto queda angulada. Por eso esta función SIEMPRE entrega
// datos editables: el objetivo es ahorrar tipeo, no reemplazar la revisión humana.
// Probado contra fotos reales de facturas — ver notas en cada función.

const OCR = (() => {
  async function recognize(fileOrBlob, onProgress) {
    const { data } = await Tesseract.recognize(fileOrBlob, "spa", {
      logger: (m) => {
        if (onProgress) onProgress(m);
      },
    });
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

      if (!header.proveedor) {
        const m = line.match(/social\s*[:.]?\s*([A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ\s]{3,50}?)\s+(?:orio|CL\d|Hoja|Territorio|\d)/i);
        if (m) header.proveedor = m[1].trim();
      }
    }

    // El número de factura suele estar cerca de la palabra "FACTURA", pero en facturas
    // con membrete de varias columnas el OCR puede leer el resto de esa zona bastante
    // más adelante en el texto — por eso se busca en todo lo que sigue, no solo cerca.
    const idx = text.search(/factu/i);
    if (idx >= 0) {
      const collapsed = collapseDigitSpaces(text.slice(idx));
      const m = collapsed.match(/n[°ºo]?\.?\s*(\d{6,12})/i);
      if (m) header.factura = m[1];
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
