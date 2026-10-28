// app.js — navegación por pestañas (Auditoría / Detalle / Historial) y lógica de cada una.
(() => {
  "use strict";

  let photoDataUrl = null;
  let audit = null; // auditoría en curso
  let openItemId = null;

  const $ = (sel) => document.querySelector(sel);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escapeAttr = (str) => String(str || "").replace(/"/g, "&quot;");

  // ---------- Pestañas ----------
  const TABS = ["auditoria", "detalle", "historial"];

  function setTab(name) {
    TABS.forEach((t) => {
      $("#tab-" + t).hidden = t !== name;
      $("#tab-btn-" + t).setAttribute("aria-selected", String(t === name));
    });
    window.scrollTo(0, 0);
  }

  TABS.forEach((t) => {
    $("#tab-btn-" + t).addEventListener("click", () => setTab(t));
  });

  function refreshBadges() {
    const detBadge = $("#detalle-badge");
    if (audit) {
      const sinVerificar = audit.items.filter((it) => !it.estado).length;
      detBadge.hidden = sinVerificar === 0;
      detBadge.textContent = sinVerificar;
    } else {
      detBadge.hidden = true;
    }

    const pending = Storage.getPending().length;
    const histBadge = $("#historial-badge");
    histBadge.hidden = pending === 0;
    histBadge.textContent = pending;
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(text, kind = "ok") {
    const toast = $("#toast");
    $("#toast-icon").textContent = kind === "warn" ? "⏳" : "✓";
    toast.dataset.kind = kind;
    $("#toast-text").textContent = text;
    toast.dataset.show = "true";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.dataset.show = "false"), 4200);
  }

  // ---------- Estado online/offline ----------
  function refreshNetStatus() {
    const pill = $("#net-status");
    pill.dataset.online = navigator.onLine;
    pill.textContent = navigator.onLine ? "En línea" : "Sin conexión";
  }
  window.addEventListener("online", () => {
    refreshNetStatus();
    trySyncPending();
  });
  window.addEventListener("offline", refreshNetStatus);
  refreshNetStatus();

  // ---------- HISTORIAL ----------
  function renderHistorial() {
    const list = Storage.readAll();
    const ul = $("#historial-list");
    ul.innerHTML = "";
    $("#historial-empty").hidden = list.length > 0;

    list.slice(0, 30).forEach((a) => {
      const li = document.createElement("li");
      li.className = "historial-item";
      const fecha = new Date(a.timestamp).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
      const dif = a.items.filter((it) => it.estado === "diferencia").length;
      li.innerHTML = `
        <div class="hi-main">
          <div class="hi-title">Factura ${escapeHtml(a.header.factura || "s/n")} · HR ${escapeHtml(a.header.hojaRuta || "s/n")}</div>
          <div class="hi-sub">${fecha} · ${a.items.length} ítems · ${dif} con diferencia</div>
        </div>
        <span class="hi-badge" data-state="${a.syncState === "synced" ? "synced" : "pending"}">
          ${a.syncState === "synced" ? "Sincronizado" : "Pendiente"}
        </span>`;
      ul.appendChild(li);
    });

    const pending = Storage.getPending();
    $("#pending-banner").hidden = pending.length === 0;
    $("#pending-count").textContent = pending.length;
    refreshBadges();
  }

  async function trySyncPending() {
    if (!navigator.onLine) return;
    const { total } = await Backend.syncPending();
    if (total > 0) renderHistorial();
  }

  $("#btn-sync-now").addEventListener("click", async () => {
    $("#btn-sync-now").textContent = "Sincronizando…";
    await trySyncPending();
    $("#btn-sync-now").textContent = "Sincronizar";
  });

  function renderConfigStatus() {
    const url = Backend.getUrl();
    $("#f-backend-url").value = url;
    $("#config-status").dataset.set = String(!!url);
    $("#config-status-text").textContent = url ? "Configurado — las auditorías se envían automático" : "Todavía no está configurado";
  }

  $("#f-backend-url").addEventListener("change", (e) => {
    Backend.setUrl(e.target.value);
    renderConfigStatus();
  });

  // ---------- AUDITORÍA: captura ----------
  function resetCapturaScreen() {
    $("#capture-preview").hidden = true;
    $("#capture-placeholder").hidden = false;
    $("#capture-actions").hidden = true;
    $("#crop-stage").hidden = true;
    $("#ocr-progress").hidden = true;
    $("#auditoria-form").hidden = true;
    $("#input-foto").value = "";
  }

  $("#input-foto").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      photoDataUrl = reader.result;
      $("#capture-preview").src = photoDataUrl;
      $("#capture-preview").hidden = false;
      $("#capture-placeholder").hidden = true;
      $("#capture-actions").hidden = false;
    };
    reader.readAsDataURL(file);
  });

  $("#btn-retomar").addEventListener("click", resetCapturaScreen);

  function startManual() {
    startAuditFromExtraction({ header: { hojaRuta: "", factura: "", proveedor: "", fecha: "" }, items: [], rawText: "" });
  }
  $("#btn-skip-ocr").addEventListener("click", startManual);

  // Paso 1: el usuario confirma la foto → se muestra el recuadro de recorte
  $("#btn-procesar").addEventListener("click", () => {
    const img = new Image();
    img.onload = () => {
      $("#capture-actions").hidden = true;
      $("#crop-stage").hidden = false;
      Cropper.init($("#crop-canvas"), img);
    };
    img.onerror = () => {
      showToast("No se pudo abrir la foto. Intenta tomarla de nuevo.", "warn");
    };
    img.src = photoDataUrl;
  });

  // Paso 2: el usuario ajusta el recuadro y elige qué zona leer
  $("#btn-usar-recorte").addEventListener("click", () => runOcr(Cropper.getCroppedCanvas()));
  $("#btn-usar-foto-completa").addEventListener("click", () => runOcr(Cropper.getFullCanvas()));

  async function runOcr(canvasSource) {
    $("#crop-stage").hidden = true;
    $("#ocr-progress").hidden = false;
    $("#ocr-progress-text").textContent = "Preparando lectura…";
    $("#ocr-progress-bar").style.width = "0%";

    try {
      const text = await OCR.recognize(canvasSource, (m) => {
        if (m.status === "recognizing text") {
          $("#ocr-progress-text").textContent = "Leyendo la factura…";
          $("#ocr-progress-bar").style.width = Math.round(m.progress * 100) + "%";
        } else if (m.status) {
          $("#ocr-progress-text").textContent = capitalize(translateStatus(m.status));
        }
      });
      startAuditFromExtraction(OCR.extract(text));
    } catch (err) {
      console.warn("OCR falló", err);
      showToast("No se pudo leer la factura sola. Completa los datos a mano.", "warn");
      startManual();
    }
  }

  function translateStatus(status) {
    const map = {
      "loading tesseract core": "cargando motor de lectura…",
      "initializing tesseract": "iniciando…",
      "loading language traineddata": "descargando diccionario en español…",
      "initializing api": "preparando…",
      "recognizing text": "leyendo la factura…",
    };
    return map[status] || status;
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- AUDITORÍA: encabezado + ítems ----------
  function startAuditFromExtraction(extracted) {
    audit = {
      id: uid(),
      timestamp: new Date().toISOString(),
      syncState: "pending",
      header: {
        hojaRuta: extracted.header.hojaRuta || "",
        factura: extracted.header.factura || "",
        proveedor: extracted.header.proveedor || "",
        fecha: extracted.header.fecha || new Date().toISOString().slice(0, 10),
        auditor: "",
        turno: "",
      },
      rawText: extracted.rawText || "",
      items: extracted.items.map((it) => ({
        id: uid(),
        codigo: it.codigo,
        descripcion: it.descripcion,
        cantidadFactura: it.cantidad,
        unidad: it.unidad,
        estado: null,
        cantidadReal: it.cantidad,
        sobrante: false,
        observacion: "",
      })),
    };
    openItemId = null;
    renderAuditoriaForm();
    $("#auditoria-form").hidden = false;
    $("#ocr-progress").hidden = true;
    renderDetalle();
    refreshBadges();
  }

  function renderAuditoriaForm() {
    $("#f-hoja-ruta").value = audit.header.hojaRuta;
    $("#f-factura").value = audit.header.factura;
    $("#f-proveedor").value = audit.header.proveedor;
    $("#f-fecha").value = audit.header.fecha;
    $("#f-auditor").value = audit.header.auditor;
    $("#f-turno").value = audit.header.turno;
    $("#raw-ocr-text").textContent = audit.rawText || "(sin texto reconocido)";
    $("#raw-ocr-details").hidden = !audit.rawText;
    renderItemsEdit();
  }

  function renderItemsEdit() {
    const wrap = $("#items-edit-list");
    wrap.innerHTML = "";
    $("#items-empty-note").hidden = audit.items.length > 0;

    audit.items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "item-edit-row";
      row.innerHTML = `
        <div class="item-edit-grid">
          <div class="span-2">
            <label>Código</label>
            <input class="mono f-codigo" value="${escapeAttr(item.codigo)}">
          </div>
          <div class="span-2">
            <label>Descripción</label>
            <input class="f-descripcion" value="${escapeAttr(item.descripcion)}">
          </div>
          <div>
            <label>Cantidad factura</label>
            <input class="mono f-cantidad" inputmode="decimal" value="${escapeAttr(item.cantidadFactura)}">
          </div>
          <div>
            <label>Unidad</label>
            <input class="mono f-unidad" value="${escapeAttr(item.unidad)}">
          </div>
        </div>
        <button type="button" class="btn-remove-item">Quitar línea</button>
      `;
      row.querySelector(".f-codigo").addEventListener("input", (e) => (item.codigo = e.target.value));
      row.querySelector(".f-descripcion").addEventListener("input", (e) => (item.descripcion = e.target.value));
      row.querySelector(".f-cantidad").addEventListener("input", (e) => {
        item.cantidadFactura = e.target.value;
        item.cantidadReal = e.target.value;
      });
      row.querySelector(".f-unidad").addEventListener("input", (e) => (item.unidad = e.target.value));
      row.querySelector(".btn-remove-item").addEventListener("click", () => {
        audit.items = audit.items.filter((it) => it.id !== item.id);
        renderItemsEdit();
      });
      wrap.appendChild(row);
    });
  }

  $("#btn-add-item").addEventListener("click", () => {
    audit.items.push({
      id: uid(), codigo: "", descripcion: "", cantidadFactura: "", unidad: "UN",
      estado: null, cantidadReal: "", sobrante: false, observacion: "",
    });
    renderItemsEdit();
  });

  const HEADER_FIELD_MAP = { "f-hoja-ruta": "hojaRuta", "f-factura": "factura", "f-proveedor": "proveedor", "f-fecha": "fecha", "f-auditor": "auditor", "f-turno": "turno" };
  Object.keys(HEADER_FIELD_MAP).forEach((id) => {
    $("#" + id).addEventListener("input", (e) => (audit.header[HEADER_FIELD_MAP[id]] = e.target.value));
    $("#" + id).addEventListener("change", (e) => (audit.header[HEADER_FIELD_MAP[id]] = e.target.value));
  });

  $("#btn-iniciar-checklist").addEventListener("click", () => {
    if (audit.items.length === 0) {
      showToast("Agrega al menos un ítem antes de pasar al detalle.", "warn");
      return;
    }
    renderDetalle();
    setTab("detalle");
  });

  // ---------- DETALLE: checklist ----------
  function renderDetalle() {
    const has = !!audit;
    $("#detalle-empty").hidden = has;
    $("#detalle-content").hidden = !has;
    if (!has) return;

    const ul = $("#checklist-list");
    ul.innerHTML = "";

    audit.items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "check-item";
      li.dataset.estado = item.estado || "";

      const head = document.createElement("button");
      head.type = "button";
      head.className = "check-item-head";
      head.innerHTML = `
        <span class="state-dot">✓</span>
        <span class="check-item-main">
          <span class="check-item-code">${escapeHtml(item.codigo || "SIN CÓDIGO")}</span>
          <div class="check-item-desc">${escapeHtml(item.descripcion || "(sin descripción)")}</div>
          <div class="check-item-qty">Factura: ${escapeHtml(item.cantidadFactura)} ${escapeHtml(item.unidad)}</div>
        </span>
      `;
      head.addEventListener("click", () => {
        openItemId = openItemId === item.id ? null : item.id;
        renderDetalle();
      });
      li.appendChild(head);

      if (openItemId === item.id) {
        const body = document.createElement("div");
        body.className = "check-item-body";
        body.innerHTML = `
          <div class="verdict-toggle">
            <button type="button" class="verdict-btn" data-kind="ok" data-active="${item.estado === "ok"}">Correcto</button>
            <button type="button" class="verdict-btn" data-kind="diferencia" data-active="${item.estado === "diferencia"}">Con diferencia</button>
          </div>
          <div class="diff-fields" hidden>
            <div class="field">
              <label>Cantidad real contada</label>
              <input class="mono f-real" inputmode="decimal" value="${escapeAttr(item.cantidadReal)}">
            </div>
            <label class="sobrante-toggle">
              <input type="checkbox" class="f-sobrante" ${item.sobrante ? "checked" : ""}>
              Hay sobrante dentro de la caja
            </label>
            <div class="field">
              <label>Observación</label>
              <textarea class="f-obs" rows="2" placeholder="Ej: faltaron 2 unidades, caja abierta, producto cambiado…">${escapeHtml(item.observacion)}</textarea>
            </div>
          </div>
        `;
        const diffFields = body.querySelector(".diff-fields");
        diffFields.hidden = item.estado !== "diferencia";

        body.querySelectorAll(".verdict-btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            item.estado = btn.dataset.kind;
            if (item.estado === "ok") {
              item.cantidadReal = item.cantidadFactura;
              item.sobrante = false;
              item.observacion = "";
            }
            renderDetalle();
            refreshBadges();
          });
        });
        body.querySelector(".f-real").addEventListener("input", (e) => (item.cantidadReal = e.target.value));
        body.querySelector(".f-sobrante").addEventListener("change", (e) => (item.sobrante = e.target.checked));
        body.querySelector(".f-obs").addEventListener("input", (e) => (item.observacion = e.target.value));

        li.appendChild(body);
      }

      ul.appendChild(li);
    });

    const total = audit.items.length;
    const verificados = audit.items.filter((it) => it.estado).length;
    $("#checklist-progress-bar").style.width = total ? Math.round((verificados / total) * 100) + "%" : "0%";
    $("#checklist-progress-text").textContent = `${verificados} de ${total} verificados`;

    const statsBox = $("#summary-stats");
    if (verificados > 0) {
      statsBox.hidden = false;
      $("#stat-ok").textContent = audit.items.filter((it) => it.estado === "ok").length;
      $("#stat-dif").textContent = audit.items.filter((it) => it.estado === "diferencia").length;
      $("#stat-sobrante").textContent = audit.items.filter((it) => it.sobrante).length;
    } else {
      statsBox.hidden = true;
    }
  }

  $("#btn-finalizar").addEventListener("click", async () => {
    const sinVerificar = audit.items.filter((it) => !it.estado).length;
    if (sinVerificar > 0 && !confirm(`Quedan ${sinVerificar} ítem(s) sin marcar. ¿Finalizar de todas formas?`)) {
      return;
    }

    Storage.save(audit);
    const result = await Backend.send(audit);

    if (result.ok) {
      Storage.markSynced(audit.id);
      showToast("Auditoría enviada a la planilla compartida.");
    } else if (result.reason === "no-url") {
      showToast("Guardada en el celular. Configura el destino en Historial para que se envíe sola.", "warn");
    } else {
      showToast("Sin conexión por ahora. Quedó guardada y se reintentará solo.", "warn");
    }

    audit = null;
    openItemId = null;
    resetCapturaScreen();
    renderDetalle();
    renderHistorial();
    setTab("historial");
  });

  // ---------- Arranque ----------
  renderConfigStatus();
  renderHistorial();
  renderDetalle();
  setTab("auditoria");
  trySyncPending();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
})();
