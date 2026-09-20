const CACHE_NAME = "glhf-v6-shell";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/site.css",
  "./assets/js/site.js",
  "./assets/js/bootstrap.js",
  "./assets/Logo_GgWp.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("glhf-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const isNavigation = request.mode === "navigate";
  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async response => {
      if (response && (response.ok || response.type === "opaque")) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    }).catch(() => null);
    if (cached) { network.catch(() => {}); return cached; }
    const response = await network;
    if (response) return response;
    if (isNavigation) return (await caches.match("./index.html")) || Response.error();
    return Response.error();
  })());
});
