// storage.js — persistencia local de auditorías (historial + cola de sincronización)
const Storage = (() => {
  const KEY = "conforme.auditorias.v1";

  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn("No se pudo leer el almacenamiento local", e);
      return [];
    }
  }

  function writeAll(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      console.warn("No se pudo guardar en el almacenamiento local", e);
    }
  }

  function save(audit) {
    const list = readAll();
    const idx = list.findIndex((a) => a.id === audit.id);
    if (idx >= 0) list[idx] = audit;
    else list.unshift(audit);
    writeAll(list);
    return audit;
  }

  function getPending() {
    return readAll().filter((a) => a.syncState !== "synced");
  }

  function markSynced(id) {
    const list = readAll();
    const idx = list.findIndex((a) => a.id === id);
    if (idx >= 0) {
      list[idx].syncState = "synced";
      list[idx].syncedAt = new Date().toISOString();
      writeAll(list);
    }
  }

  return { readAll, save, getPending, markSynced };
})();
