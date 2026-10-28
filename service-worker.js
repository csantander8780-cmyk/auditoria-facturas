// service-worker.js — cachea el shell de la app para que abra rápido y
// funcione aunque no haya internet (el envío a la planilla sí necesita red).
const CACHE = "conforme-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/storage.js",
  "./js/ocr.js",
  "./js/backend.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // nunca cachear los POST a Sheets

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Cachea también lo que trae Tesseract.js (motor OCR y diccionario)
          // para que funcione sin internet después de la primera vez.
          if (res.ok && (req.url.includes("jsdelivr") || req.url.includes("tessdata") || ASSETS.some((a) => req.url.endsWith(a.replace("./", ""))))) {
            const resClone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
