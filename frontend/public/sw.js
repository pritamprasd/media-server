const CACHES = {
  shell: "media-server-shell-v1",
  api: "media-server-api-v1",
  media: "media-server-media-v1",
  tiles: "media-server-tiles-v1",
};

const SHELL_URLS = ["/", "/index.html"];

// Don't cache files larger than this (50 MB for media)
const MEDIA_SIZE_LIMIT = 50 * 1024 * 1024;

// ── Install ──────────────────────────────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHES.shell).then((c) => c.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keep = new Set(Object.values(CACHES));
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// ── Helpers ──────────────────────────────────────────────────────────
function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function shouldCache(response) {
  return response.ok && response.type === "basic" && response.status === 200;
}

function putCache(cacheName, request, response) {
  if (shouldCache(response)) {
    const clone = response.clone();
    caches.open(cacheName).then((c) => c.put(request, clone).catch(() => {}));
  }
}

// ── Strategies ───────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  putCache(cacheName, request, res);
  return res;
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    putCache(cacheName, request, res);
    return res;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match("/index.html");
  }
}

// ── Media strategy ───────────────────────────────────────────────────
// Caches full (200) responses when no Range header is sent (typically images).
// For Range requests (videos), fetches the full file in background and caches it
// so offline range requests can be served from the cached full response.
async function mediaStrategy(request) {
  const hasRange = request.headers.has("Range");

  try {
    const res = await fetch(request);

    // Full response (no Range): cache directly
    if (!hasRange && res.status === 200) {
      putCache(CACHES.media, request, res);
      return res;
    }

    // Range request (video): cache full file in background for offline
    if (hasRange && res.status === 206) {
      const total = parseContentRange(res.headers.get("Content-Range"));
      if (total && total <= MEDIA_SIZE_LIMIT) {
        const fullReq = new Request(request.url, { method: "GET", headers: {} });
        fetch(fullReq)
          .then((fullRes) => {
            if (shouldCache(fullRes)) {
              const clone = fullRes.clone();
              caches.open(CACHES.media).then((c) => c.put(fullReq, clone).catch(() => {}));
            }
          })
          .catch(() => {});
      }
    }

    return res;
  } catch {
    // Offline
    const cached = await caches.match(request);
    if (cached) return cached;

    if (hasRange) {
      const fullReq = new Request(request.url, { method: "GET", headers: {} });
      const fullCached = await caches.match(fullReq);
      if (fullCached) {
        return serveRange(fullCached, request.headers.get("Range"));
      }
    }

    return new Response(null, { status: 503 });
  }
}

function parseContentRange(header) {
  if (!header) return null;
  const m = header.match(/^bytes\s+\d+-\d+\/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

async function serveRange(cachedResponse, rangeHeader) {
  const m = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return cachedResponse;

  const start = parseInt(m[1], 10);
  const endStr = m[2];
  const blob = await cachedResponse.blob();
  const total = blob.size;
  const end = endStr ? Math.min(parseInt(endStr, 10), total - 1) : total - 1;

  if (start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  const chunk = blob.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cachedResponse.headers.get("Content-Type") || "application/octet-stream",
      "Content-Length": String(chunk.size),
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
    },
  });
}

// ── Message handler ──────────────────────────────────────────────────
self.addEventListener("message", (e) => {
  if (e.data.type === "CLEAR_CACHES") {
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "CACHES_CLEARED" }));
    })();
  }
  if (e.data.type === "CLAIM") {
    self.skipWaiting().then(() => self.clients.claim());
  }
  if (e.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Fetch dispatch ───────────────────────────────────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Cache-first for map tiles (OpenStreetMap)
  if (url.hostname.endsWith(".tile.openstreetmap.org") && request.method === "GET") {
    e.respondWith(cacheFirst(request, CACHES.tiles));
    return;
  }

  if (!isSameOrigin(url)) return;

  const { pathname } = url;
  const { method, mode } = request;

  // Never cache the SW itself, manifest, or icon
  if (pathname === "/sw.js" || pathname === "/manifest.json" || pathname === "/icon.svg") {
    return;
  }

  // Cache-first for fingerprinted assets
  if (pathname.startsWith("/assets/")) {
    e.respondWith(cacheFirst(request, CACHES.shell));
    return;
  }

  // Cache-first for shell pages
  if (pathname === "/" || pathname === "/index.html") {
    e.respondWith(cacheFirst(request, CACHES.shell));
    return;
  }

  // Media serve endpoint: special strategy for offline playback
  if (method === "GET" && pathname.startsWith("/api/") && pathname.endsWith("/serve")) {
    e.respondWith(mediaStrategy(request));
    return;
  }

  // Other API GET requests: network-first with cache fallback
  if (method === "GET" && pathname.startsWith("/api/")) {
    e.respondWith(networkFirst(request, CACHES.api));
    return;
  }

  // Navigation: network-first with shell fallback
  if (mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() => caches.match("/index.html").then((r) => r || new Response(null, { status: 503 })))
    );
  }
});
