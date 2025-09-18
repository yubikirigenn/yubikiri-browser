self.addEventListener("install", (e) => {
  console.log("✅ Service Worker installed");
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/proxy")) {
    event.respondWith(
      caches.open("proxy-cache").then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        const response = await fetch(event.request);
        cache.put(event.request, response.clone());
        return response;
      })
    );
  }
});
