// backend.js — envío de la auditoría al backend configurado (Google Apps Script
// o un flujo de Power Automate: a este archivo le da lo mismo, ambos reciben el
// mismo POST con JSON y responden 200 si quedó guardado). Si no hay internet,
// el envío se reintenta después (la auditoría queda marcada "pendiente").

const Backend = (() => {
  const URL_KEY = "conforme.backend.url";

  function getUrl() {
    return localStorage.getItem(URL_KEY) || "";
  }

  function setUrl(url) {
    localStorage.setItem(URL_KEY, url.trim());
  }

  async function send(audit) {
    const url = getUrl();
    if (!url) {
      return { ok: false, reason: "no-url" };
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain" }, // evita preflight CORS en Apps Script / Power Automate
        body: JSON.stringify(audit),
      });
      if (!res.ok) return { ok: false, reason: "http-" + res.status };
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "network" };
    }
  }

  async function syncPending() {
    const pending = Storage.getPending();
    let okCount = 0;
    for (const audit of pending) {
      const result = await send(audit);
      if (result.ok) {
        Storage.markSynced(audit.id);
        okCount++;
      }
    }
    return { total: pending.length, synced: okCount };
  }

  return { getUrl, setUrl, send, syncPending };
})();
