# PWA & Offline

The app is installable as a Progressive Web App.

| Platform | URL                                           |
| -------- | --------------------------------------------- |
| Dev      | `http://localhost:5173` (install prompt)      |
| Docker   | `https://homeserver.local:3443`                |

## Service Worker Caches

The service worker (`frontend/public/sw.js`) maintains separate cache stores, each with a distinct strategy:

| Cache | Strategy | Contents |
|-------|----------|----------|
| Shell (`media-server-shell-v1`) | Cache-first | App JS/CSS (precached), `/index.html` |
| API (`media-server-api-v1`) | Network-first | File listings, metadata, tags (with offline fallback) |
| Thumbnails (`media-server-thumbs-v1`) | Cache-first | Image thumbnails for fast grid browsing (`/api/files/<id>/thumbnail`) |
| Media (`media-server-media-v1`) | Custom (Range-aware) | Full images and videos (`/api/files/<id>/serve`); Range requests streamed, full file cached in background for offline |
| Map Tiles (`media-server-tiles-v1`) | Cache-first | OpenStreetMap tiles, CartoDB, ArcGIS, NASA imagery |
| MUI (`media-server-mui-v1`) | Cache-first | Lazy-loaded Material UI chunk (when Material theme is selected) |

## Behaviors

- **Offline API fallback** — Axios interceptor caches GET responses to IndexedDB; when offline or a network error occurs, cached responses are served transparently.
- **Registration** — `updateViaCache: "none"`, `CLAIM`/`SKIP_WAITING` message handlers, and a `controllerchange` listener with debounced reload; works reliably on Chrome mobile/PWA.
- **Cache clear** — broadcasts `CLEAR_CACHES` to all `{ type: "window" }` clients; all active tabs receive the clear signal. Each cache also has its own Clear button via `CLEAR_SINGLE_CACHE`, and a `GET_CACHE_STATUS` message returns per-cache entry counts and byte sizes. The shell cache is always preserved.
- **Loading animation** — animated gradient blobs, rotating rings, orbiting dots, pulsing icon, and blinking text in `index.html` until React mounts.
- **Airplane mode** — toggle in the app to disable all AI/network calls; sets `X-Airplane-Mode: 1` header; geocoding and AI regeneration skip when active.

See [docs/architecture.md](architecture.md#caching-strategy) for the caching overview and [docs/features.md](features.md) for the user-facing PWA feature list.
