// public/sw.js
self.addEventListener('install', (e) => {
  // activate immediately
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // take control of uncontrolled clients without reload
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const reqUrl = new URL(req.url);

  // If request is for our own control files (sw.js / proxy UI), let it pass
  if (reqUrl.pathname === '/sw.js' || reqUrl.pathname === '/proxy' || reqUrl.pathname === '/r' || reqUrl.pathname.startsWith('/public') || reqUrl.pathname === '/' ) {
    return; // do default fetch
  }

  // For all other requests coming from pages under our scope:
  // If the request origin is NOT our origin, or it's an absolute external URL,
  // route it through our server-side /r?url=... proxy.
  // Note: event.request.url can be cross-origin; the SW can still intercept it.
  // We'll proxy everything except same-origin assets under our domain.
  try {
    // if request is already to our origin and path starts with /r, just fetch normally
    if (reqUrl.origin === location.origin && reqUrl.pathname === '/r') {
      event.respondWith(fetch(event.request));
      return;
    }
  } catch (e) {
    // ignore URL parse errors
  }

  // Build proxied URL on our origin
  const proxied = `/r?url=${encodeURIComponent(event.request.url)}`;

  // Use fetch to /r with credentials included so cookies sent to our origin if any
  event.respondWith(fetch(proxied, {
    method: event.request.method,
    headers: event.request.headers,
    body: event.request.method === 'GET' || event.request.method === 'HEAD' ? undefined : event.request.body,
    credentials: 'include',
    redirect: 'follow'
  }).catch(err => {
    // fallback to network for safety if proxy fails
    return fetch(event.request).catch(()=> new Response('proxy fetch failed', { status: 502 }));
  }));
});
