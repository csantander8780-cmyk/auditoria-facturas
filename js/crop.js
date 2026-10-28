// crop.js — recorte interactivo sobre la foto capturada, para que el OCR solo
// procese la zona que realmente importa (encabezado + tabla de ítems). Esto
// acelera bastante la lectura (menos píxeles que analizar) y mejora la precisión
// (menos ruido de membrete/direcciones alrededor).

const Cropper = (() => {
  let canvas, ctx, img;
  let displayW, displayH, scale; // escala: px de pantalla → px reales de la foto
  let rect; // {x,y,w,h} en coordenadas de PANTALLA (sobre el canvas)
  let dragMode = null; // 'move' | 'nw' | 'ne' | 'sw' | 'se' | null
  let dragStart = null;
  const HANDLE_R = 14;

  function init(canvasEl, imageEl) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    img = imageEl;

    const maxW = canvas.parentElement.clientWidth || 360;
    const ratio = img.naturalWidth / img.naturalHeight;
    displayW = Math.round(maxW);
    displayH = Math.round(maxW / ratio);
    canvas.width = displayW;
    canvas.height = displayH;
    scale = img.naturalWidth / displayW;

    // Recuadro inicial: recorta solo el borde de la foto (lo que casi siempre
    // sobra al encuadrar). El usuario ajusta desde acá hacia adentro para dejar
    // solo el encabezado + tabla de su factura — y una vez que sabe dónde caen
    // esos datos en SU formato, repite el mismo recorte cada vez.
    rect = {
      x: displayW * 0.03,
      y: displayH * 0.03,
      w: displayW * 0.94,
      h: displayH * 0.94,
    };
    clampRect();
    draw();
    bindEvents();
  }

  function clampRect() {
    rect.w = Math.max(40, Math.min(rect.w, displayW));
    rect.h = Math.max(40, Math.min(rect.h, displayH));
    rect.x = Math.max(0, Math.min(rect.x, displayW - rect.w));
    rect.y = Math.max(0, Math.min(rect.y, displayH - rect.h));
  }

  function draw() {
    ctx.clearRect(0, 0, displayW, displayH);
    ctx.drawImage(img, 0, 0, displayW, displayH);

    ctx.fillStyle = "rgba(10, 8, 16, 0.6)";
    ctx.fillRect(0, 0, displayW, rect.y);
    ctx.fillRect(0, rect.y + rect.h, displayW, displayH - rect.y - rect.h);
    ctx.fillRect(0, rect.y, rect.x, rect.h);
    ctx.fillRect(rect.x + rect.w, rect.y, displayW - rect.x - rect.w, rect.h);

    ctx.strokeStyle = "#8B5CF6";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    ctx.fillStyle = "#8B5CF6";
    [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x, rect.y + rect.h],
      [rect.x + rect.w, rect.y + rect.h],
    ].forEach(([hx, hy]) => {
      ctx.beginPath();
      ctx.arc(hx, hy, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0F0D15";
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function pointerPos(e) {
    const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    const sx = canvas.width / r.width;
    const sy = canvas.height / r.height;
    return { x: cx * sx, y: cy * sy };
  }

  function hitTest(pos) {
    const corners = {
      nw: { x: rect.x, y: rect.y },
      ne: { x: rect.x + rect.w, y: rect.y },
      sw: { x: rect.x, y: rect.y + rect.h },
      se: { x: rect.x + rect.w, y: rect.y + rect.h },
    };
    for (const [key, c] of Object.entries(corners)) {
      if (Math.hypot(pos.x - c.x, pos.y - c.y) <= HANDLE_R * 1.6) return key;
    }
    if (pos.x >= rect.x && pos.x <= rect.x + rect.w && pos.y >= rect.y && pos.y <= rect.y + rect.h) {
      return "move";
    }
    return null;
  }

  function bindEvents() {
    canvas.style.touchAction = "none";

    canvas.onpointerdown = (e) => {
      const pos = pointerPos(e);
      dragMode = hitTest(pos);
      if (dragMode) {
        dragStart = { pos, rect: { ...rect } };
        canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
      }
    };
    canvas.onpointermove = (e) => {
      if (!dragMode) return;
      e.preventDefault();
      const pos = pointerPos(e);
      const dx = pos.x - dragStart.pos.x;
      const dy = pos.y - dragStart.pos.y;
      const r0 = dragStart.rect;
      const MIN = 50;

      if (dragMode === "move") {
        rect.x = r0.x + dx;
        rect.y = r0.y + dy;
      } else if (dragMode === "nw") {
        rect.x = Math.min(r0.x + dx, r0.x + r0.w - MIN);
        rect.y = Math.min(r0.y + dy, r0.y + r0.h - MIN);
        rect.w = r0.w - (rect.x - r0.x);
        rect.h = r0.h - (rect.y - r0.y);
      } else if (dragMode === "ne") {
        rect.y = Math.min(r0.y + dy, r0.y + r0.h - MIN);
        rect.w = Math.max(MIN, r0.w + dx);
        rect.h = r0.h - (rect.y - r0.y);
      } else if (dragMode === "sw") {
        rect.x = Math.min(r0.x + dx, r0.x + r0.w - MIN);
        rect.w = r0.w - (rect.x - r0.x);
        rect.h = Math.max(MIN, r0.h + dy);
      } else if (dragMode === "se") {
        rect.w = Math.max(MIN, r0.w + dx);
        rect.h = Math.max(MIN, r0.h + dy);
      }
      clampRect();
      draw();
    };
    const end = () => { dragMode = null; };
    canvas.onpointerup = end;
    canvas.onpointercancel = end;
  }

  // Devuelve un canvas nuevo con la zona recortada, ya a un tamaño razonable
  // para el OCR (recortar + achicar la imagen es lo que más acelera la lectura).
  function getCroppedCanvas(maxOutputWidth = 1500) {
    const sx = rect.x * scale;
    const sy = rect.y * scale;
    const sw = rect.w * scale;
    const sh = rect.h * scale;

    const outW = Math.min(maxOutputWidth, sw);
    const outH = Math.round((sh / sw) * outW);

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    out.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    return out;
  }

  function getFullCanvas(maxOutputWidth = 1500) {
    const outW = Math.min(maxOutputWidth, img.naturalWidth);
    const outH = Math.round((img.naturalHeight / img.naturalWidth) * outW);
    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    out.getContext("2d").drawImage(img, 0, 0, outW, outH);
    return out;
  }

  return { init, getCroppedCanvas, getFullCanvas };
})();
