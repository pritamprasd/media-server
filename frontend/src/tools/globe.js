import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { toolLog } from '../services/tool-logger.js';

export const icon = "🌍";
export const name = "3D Globe Explorer";
export const description = "Premium 3D Earth GIS tool with dynamic open-source map tiling, fly-to navigation, search autocomplete, and live weather integrations.";

export function init(container) {
  container.style.overflow = "hidden";
  
  const mainContainer = document.createElement("div");
  mainContainer.style.cssText = "display:flex;width:100%;height:100%;min-width:0;background:var(--color-bg);position:relative;font-family:system-ui,-apple-system,sans-serif;user-select:none;";
  container.appendChild(mainContainer);

  const sidebar = document.createElement("div");
  sidebar.style.cssText = "display:flex;flex-direction:column;width:320px;border-right:1px solid var(--color-border);background:var(--color-surface);overflow-y:auto;flex-shrink:0;padding:1.25rem;gap:1.25rem;box-shadow:var(--neu-raised-sm);z-index:10;position:relative;";
  sidebar.classList.add("globe-sidebar");
  mainContainer.appendChild(sidebar);

  const canvasContainer = document.createElement("div");
  canvasContainer.style.cssText = "flex:1;position:relative;min-width:0;height:100%;background:#040814;overflow:hidden;touch-action:none;";
  mainContainer.appendChild(canvasContainer);

  const header = document.createElement("div");
  header.style.cssText = "display:flex;flex-direction:column;gap:0.25rem;position:relative;";
  sidebar.appendChild(header);

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "✕";
  closeBtn.style.cssText = "display:none;position:absolute;top:0.25rem;right:0.25rem;width:30px;height:30px;border:none;border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:1rem;cursor:pointer;align-items:center;justify-content:center;";
  closeBtn.classList.add("globe-sidebar-close");
  header.appendChild(closeBtn);

  const titleText = document.createElement("div");
  titleText.textContent = "3D Globe Explorer";
  titleText.style.cssText = "font-size:1.1rem;font-weight:600;color:var(--color-text);";
  header.appendChild(titleText);

  const subText = document.createElement("div");
  subText.textContent = "Search, zoom, and inspect any location on Earth.";
  subText.style.cssText = "font-size:0.75rem;color:var(--color-text-muted);";
  header.appendChild(subText);

  const searchContainer = document.createElement("div");
  searchContainer.style.cssText = "display:flex;flex-direction:column;position:relative;gap:0.35rem;";
  sidebar.appendChild(searchContainer);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search cities, countries, landmarks...";
  searchInput.style.cssText = "width:100%;padding:0.55rem 0.75rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg);color:var(--color-text);font-size:0.82rem;outline:none;box-sizing:border-box;";
  searchContainer.appendChild(searchInput);

  const suggestionsBox = document.createElement("div");
  suggestionsBox.style.cssText = "display:none;position:absolute;top:100%;left:0;right:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;max-height:200px;overflow-y:auto;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.15);margin-top:0.25rem;";
  searchContainer.appendChild(suggestionsBox);

  const settingsSection = document.createElement("div");
  settingsSection.style.cssText = "display:flex;flex-direction:column;gap:0.75rem;border-top:1px solid var(--color-border);padding-top:1rem;";
  sidebar.appendChild(settingsSection);

  const styleLabel = document.createElement("div");
  styleLabel.textContent = "MAP STYLE";
  styleLabel.style.cssText = "font-size:0.72rem;font-weight:600;color:var(--color-text-muted);letter-spacing:0.05em;";
  settingsSection.appendChild(styleLabel);

  const styleSelect = document.createElement("select");
  styleSelect.style.cssText = "padding:0.45rem 0.6rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:0.82rem;outline:none;width:100%;cursor:pointer;";
  
  const styles = [
    { name: "Detailed Streets (CartoDB)", value: "streets" },
    { name: "Satellite Imagery (Esri)", value: "satellite" },
    { name: "Minimal Dark (CartoDB)", value: "dark" },
    { name: "Minimal Light (CartoDB)", value: "light" }
  ];
  
  styles.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.value;
    opt.textContent = s.name;
    styleSelect.appendChild(opt);
  });
  settingsSection.appendChild(styleSelect);

  const controlRow = document.createElement("div");
  controlRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-top:0.25rem;";
  settingsSection.appendChild(controlRow);

  const rotateLabel = document.createElement("div");
  rotateLabel.textContent = "Auto-Rotation";
  rotateLabel.style.cssText = "font-size:0.82rem;color:var(--color-text);";
  controlRow.appendChild(rotateLabel);

  const rotateToggle = document.createElement("input");
  rotateToggle.type = "checkbox";
  rotateToggle.checked = true;
  rotateToggle.style.cssText = "width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer;";
  controlRow.appendChild(rotateToggle);

  const detailsContainer = document.createElement("div");
  detailsContainer.style.cssText = "display:flex;flex-direction:column;gap:0.75rem;border-top:1px solid var(--color-border);padding-top:1rem;flex:1;";
  sidebar.appendChild(detailsContainer);

  const detailsHeader = document.createElement("div");
  detailsHeader.textContent = "INSPECTOR PANEL";
  detailsHeader.style.cssText = "font-size:0.72rem;font-weight:600;color:var(--color-text-muted);letter-spacing:0.05em;";
  detailsContainer.appendChild(detailsHeader);

  const detailsContent = document.createElement("div");
  detailsContent.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);padding:0.85rem;background:var(--color-bg);color:var(--color-text-muted);font-size:0.82rem;line-height:1.4;display:flex;flex-direction:column;gap:0.75rem;min-height:120px;justify-content:center;align-items:center;text-align:center;";
  detailsContent.textContent = "Click anywhere on the globe to inspect the location coordinates, retrieve local information, and check weather details.";
  detailsContainer.appendChild(detailsContent);

  const hud = document.createElement("div");
  hud.style.cssText = "position:absolute;bottom:1.25rem;right:1.25rem;display:flex;flex-direction:column;gap:0.5rem;z-index:20;";
  canvasContainer.appendChild(hud);

  const createHudButton = (text, titleStr) => {
    const btn = document.createElement("button");
    btn.textContent = text;
    btn.title = titleStr;
    btn.style.cssText = "width:36px;height:36px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:1.1rem;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:var(--neu-raised-sm);transition:all 0.15s ease;";
    btn.classList.add("globe-hud-btn");
    btn.onmouseenter = () => btn.style.background = "var(--color-bg)";
    btn.onmouseleave = () => btn.style.background = "var(--color-surface)";
    return btn;
  };

  const btnZoomIn = createHudButton("+", "Zoom In");
  const btnZoomOut = createHudButton("−", "Zoom Out");
  const btnReset = createHudButton("⌖", "Reset View");
  
  hud.appendChild(btnZoomIn);
  hud.appendChild(btnZoomOut);
  hud.appendChild(btnReset);

  const loadingIndicator = document.createElement("div");
  loadingIndicator.style.cssText = "position:absolute;top:1.25rem;right:1.25rem;padding:0.4rem 0.75rem;background:rgba(0,0,0,0.75);color:#fff;border-radius:6px;font-size:0.72rem;font-weight:600;display:none;align-items:center;gap:0.5rem;z-index:20;pointer-events:none;";
  loadingIndicator.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></span>Loading Tiles...`;
  canvasContainer.appendChild(loadingIndicator);

  const styleElement = document.createElement("style");
  styleElement.textContent = `@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 767px) {
  .globe-sidebar { position: fixed !important; left: -100% !important; top: 0 !important; bottom: 0 !important; height: 100% !important; width: 85% !important; max-width: 320px !important; z-index: 100 !important; transition: left 0.3s ease !important; border-right: 1px solid var(--color-border) !important; display: flex !important; }
  .globe-sidebar.open { left: 0 !important; }
  .globe-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99; }
  .globe-backdrop.open { display: block; }
  .globe-toggle-btn { display: flex !important; }
  .globe-hud-btn { width: 44px !important; height: 44px !important; font-size: 1.3rem !important; border-radius: 10px !important; }
  .globe-sidebar-close { display: flex !important; }
}
@media (min-width: 768px) {
  .globe-toggle-btn { display: none !important; }
  .globe-backdrop { display: none !important; }
  .globe-sidebar-close { display: none !important; }
}`;
  document.head.appendChild(styleElement);

  const backdrop = document.createElement("div");
  backdrop.classList.add("globe-backdrop");
  mainContainer.appendChild(backdrop);

  const toggleBtn = document.createElement("button");
  toggleBtn.innerHTML = "☰";
  toggleBtn.classList.add("globe-toggle-btn");
  toggleBtn.style.cssText = "display:none;position:absolute;top:0.75rem;left:0.75rem;width:40px;height:40px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:1.3rem;cursor:pointer;z-index:101;align-items:center;justify-content:center;box-shadow:var(--neu-raised-sm);";
  canvasContainer.appendChild(toggleBtn);

  closeBtn.addEventListener("click", () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
  });

  toggleBtn.addEventListener("click", () => {
    const isOpen = sidebar.classList.toggle("open");
    backdrop.classList.toggle("open");
    document.body.style.overflow = isOpen ? "hidden" : "";
  });

  backdrop.addEventListener("click", () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
  });

  let scene, camera, renderer, baseGlobe, controls, markerGroup;
  let activeTiles = new Map();
  let flyToTarget = null;
  let searchTimeout = null;
  let isRotating = true;

  const raycaster = new THREE.Raycaster();
  const mousePoint = new THREE.Vector2();
  const textureLoader = new THREE.TextureLoader();

  const tileServers = {
    streets: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    dark: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    light: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
  };

  let currentStyle = "streets";

  function initThree() {
    scene = new THREE.Scene();
    
    camera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.01, 100);
    camera.position.set(0, 0, 2.8);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    canvasContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.05;
    controls.maxDistance = 5.0;

    markerGroup = new THREE.Group();
    scene.add(markerGroup);

    const baseGeometry = new THREE.SphereGeometry(1, 64, 64);
    toolLog('globe', 'api_request', { source: 'nasa-texture', url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200407.3x5400x2700.jpg', summary: 'base globe texture' }).catch(() => {});
    const baseTexture = textureLoader.load("https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200407.3x5400x2700.jpg", () => {
      toolLog('globe', 'api_response', { source: 'nasa-texture', summary: 'base globe texture loaded' }).catch(() => {});
    }, undefined, () => {
      toolLog('globe', 'api_error', { source: 'nasa-texture', summary: 'base globe texture failed' }).catch(() => {});
    });
    const baseMaterial = new THREE.MeshStandardMaterial({
      map: baseTexture,
      roughness: 0.8,
      metalness: 0.1
    });
    baseGlobe = new THREE.Mesh(baseGeometry, baseMaterial);
    scene.add(baseGlobe);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.3);
    mainLight.position.set(5, 3, 5);
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, -3, -5);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);

    const glowGeometry = new THREE.SphereGeometry(1.025, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x51a1fc,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(glowMesh);

    window.addEventListener("resize", onWindowResize);

    animate();
  }

  function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  }

  function lonLatToVector3(lon, lat, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  function vector3ToLonLat(vector) {
    const norm = vector.clone().normalize();
    const lat = Math.asin(norm.y) * (180 / Math.PI);
    const lon = Math.atan2(norm.z, -norm.x) * (180 / Math.PI);
    return { lat, lon: lon < 0 ? lon + 180 : lon - 180 };
  }

  function getTileBoundaries(x, y, z) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    const latNorth = Math.atan(Math.sinh(n)) * (180 / Math.PI);
    const nNext = Math.PI - (2 * Math.PI * (y + 1)) / Math.pow(2, z);
    const latSouth = Math.atan(Math.sinh(nNext)) * (180 / Math.PI);
    const lonWest = (x / Math.pow(2, z)) * 360 - 180;
    const lonEast = ((x + 1) / Math.pow(2, z)) * 360 - 180;
    return { latNorth, latSouth, lonWest, lonEast };
  }

  function createTileSegment(x, y, z) {
    const bounds = getTileBoundaries(x, y, z);
    const phiStart = (bounds.lonWest + 180) * (Math.PI / 180);
    const phiLength = (bounds.lonEast - bounds.lonWest) * (Math.PI / 180);
    const thetaStart = (90 - bounds.latNorth) * (Math.PI / 180);
    const thetaLength = (bounds.latNorth - bounds.latSouth) * (Math.PI / 180);

    const geom = new THREE.SphereGeometry(1.002, 16, 16, phiStart, phiLength, thetaStart, thetaLength);
    const url = tileServers[currentStyle]
      .replace("{z}", z)
      .replace("{x}", x)
      .replace("{y}", y);

    toolLog('globe', 'api_request', { source: 'map-tiles', url: url.substring(0, 120), summary: `tile z${z}/${x}/${y}` }).catch(() => {});
    const tileTexture = textureLoader.load(url, () => {
      loadingIndicator.style.display = "none";
      toolLog('globe', 'api_response', { source: 'map-tiles', summary: `tile z${z}/${x}/${y} loaded` }).catch(() => {});
    }, undefined, () => {
      loadingIndicator.style.display = "none";
      toolLog('globe', 'api_error', { source: 'map-tiles', summary: `tile z${z}/${x}/${y} failed` }).catch(() => {});
    });

    const mat = new THREE.MeshBasicMaterial({
      map: tileTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });

    return new THREE.Mesh(geom, mat);
  }

  function updateDynamicTiles() {
    const dist = camera.position.distanceTo(new THREE.Vector3(0,0,0));
    let z = 2;
    if (dist < 1.15) z = 7;
    else if (dist < 1.3) z = 6;
    else if (dist < 1.6) z = 5;
    else if (dist < 2.0) z = 4;
    else if (dist < 2.5) z = 3;

    const targetLonLat = vector3ToLonLat(camera.position);
    const scale = Math.pow(2, z);
    const cx = Math.floor(((targetLonLat.lon + 180) / 360) * scale);
    const cy = Math.floor((1 - Math.log(Math.tan((targetLonLat.lat * Math.PI) / 180) + 1 / Math.cos((targetLonLat.lat * Math.PI) / 180)) / Math.PI) / 2 * scale);

    const neededKeys = new Set();
    const halfRange = z > 5 ? 2 : 1;

    for (let dx = -halfRange; dx <= halfRange; dx++) {
      for (let dy = -halfRange; dy <= halfRange; dy++) {
        let tx = (cx + dx + Math.pow(2, z)) % Math.pow(2, z);
        let ty = cy + dy;
        if (ty >= 0 && ty < Math.pow(2, z)) {
          const key = `${z}_${tx}_${ty}`;
          neededKeys.add(key);

          if (!activeTiles.has(key)) {
            loadingIndicator.style.display = "flex";
            const mesh = createTileSegment(tx, ty, z);
            scene.add(mesh);
            activeTiles.set(key, mesh);
          }
        }
      }
    }

    for (const [key, mesh] of activeTiles.entries()) {
      if (!neededKeys.has(key)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.map.dispose();
        mesh.material.dispose();
        activeTiles.delete(key);
      }
    }
  }

  function clearTiles() {
    for (const [key, mesh] of activeTiles.entries()) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.map.dispose();
      mesh.material.dispose();
    }
    activeTiles.clear();
  }

  function triggerFlyTo(lat, lon, zoomDistance = 1.25) {
    isRotating = false;
    rotateToggle.checked = false;
    const destVec = lonLatToVector3(lon, lat, zoomDistance);
    flyToTarget = {
      position: destVec,
      duration: 1.8,
      elapsed: 0
    };
    dropMarker(lat, lon);
  }

  function dropMarker(lat, lon) {
    markerGroup.clear();
    const position = lonLatToVector3(lon, lat, 1.01);
    
    const pinGeom = new THREE.ConeGeometry(0.015, 0.05, 16);
    pinGeom.translate(0, 0.025, 0);
    pinGeom.rotateX(Math.PI / 2);
    
    const pinMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const pin = new THREE.Mesh(pinGeom, pinMat);
    pin.position.copy(position);
    pin.lookAt(new THREE.Vector3(0,0,0));
    markerGroup.add(pin);

    const glowGeo = new THREE.SphereGeometry(0.012, 16, 16);
    const glowM = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const sphereGlow = new THREE.Mesh(glowGeo, glowM);
    sphereGlow.position.copy(position);
    markerGroup.add(sphereGlow);
  }

  async function fetchLocationData(lat, lon) {
    detailsContent.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:0.5rem;width:100%;"><span style="display:inline-block;width:18px;height:18px;border:2px solid var(--color-primary);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></span><span style="color:var(--color-text)">Geocoding location details...</span></div>`;
    
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12`;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
    toolLog('globe', 'api_request', { source: 'nominatim-reverse', url: geoUrl, summary: `reverse geocode ${lat},${lon}` }).catch(() => {});
    toolLog('globe', 'api_request', { source: 'open-meteo', url: weatherUrl, summary: `weather at ${lat},${lon}` }).catch(() => {});
    try {
      const geoStart = performance.now();
      const geoResponse = await fetch(geoUrl);
      const geoData = await geoResponse.json();
      toolLog('globe', 'api_response', { source: 'nominatim-reverse', duration: Math.round(performance.now() - geoStart), statusCode: geoResponse.status, summary: 'reverse geocode ok' }).catch(() => {});

      const weatherStart = performance.now();
      const weatherResponse = await fetch(weatherUrl);
      const weatherData = await weatherResponse.json();
      toolLog('globe', 'api_response', { source: 'open-meteo', duration: Math.round(performance.now() - weatherStart), statusCode: weatherResponse.status, summary: 'weather ok' }).catch(() => {});

      let placeName = "Inspected Coordinate";
      if (geoData.address) {
        placeName = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.state || geoData.address.country || "Selected Area";
      }

      let weatherHtml = "";
      if (weatherData && weatherData.current_weather) {
        const temp = weatherData.current_weather.temperature;
        const wind = weatherData.current_weather.windspeed;
        weatherHtml = `
          <div style="border-top:1px solid var(--color-border);margin-top:0.75rem;padding-top:0.75rem;display:flex;flex-direction:column;gap:0.35rem;text-align:left;">
            <div style="font-size:0.75rem;font-weight:600;color:var(--color-text-muted)">CURRENT WEATHER</div>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--color-text)">
              <span>Temperature</span>
              <span style="font-weight:600">${temp}°C</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--color-text)">
              <span>Wind Speed</span>
              <span>${wind} km/h</span>
            </div>
          </div>
        `;
      }

      detailsContent.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:0.5rem;text-align:left;width:100%;">
          <div style="font-size:0.9rem;font-weight:600;color:var(--color-text)">${placeName}</div>
          <div style="font-size:0.75rem;color:var(--color-text-muted);word-break:break-word;">${geoData.display_name || "Coordinates Identified"}</div>
          <div style="display:flex;gap:0.5rem;margin-top:0.25rem;">
            <span style="font-size:0.73rem;padding:0.2rem 0.45rem;border-radius:4px;background:var(--color-bg);color:var(--color-text);border:1px solid var(--color-border);font-family:monospace;">Lat: ${lat.toFixed(4)}</span>
            <span style="font-size:0.73rem;padding:0.2rem 0.45rem;border-radius:4px;background:var(--color-bg);color:var(--color-text);border:1px solid var(--color-border);font-family:monospace;">Lon: ${lon.toFixed(4)}</span>
          </div>
          ${weatherHtml}
          <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}" target="_blank" style="color:var(--color-primary);font-size:0.75rem;margin-top:0.5rem;display:inline-block;text-decoration:none;font-weight:600;">Open in External Map ↗</a>
        </div>
      `;
    } catch (err) {
      toolLog('globe', 'api_error', { source: 'fetchLocationData', summary: err.message || 'fetch failed' }).catch(() => {});
      detailsContent.innerHTML = `
        <div style="text-align:left;width:100%;">
          <div style="font-weight:600;color:var(--color-text)">Inspection Complete</div>
          <div style="font-size:0.75rem;color:var(--color-text-muted);margin-top:0.25rem;">Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}</div>
          <div style="font-size:0.75rem;color:var(--color-text-muted);margin-top:0.5rem;">Failed to fetch live database names/weather, but coordinates are active.</div>
        </div>
      `;
    }
  }

  styleSelect.addEventListener("change", (e) => {
    currentStyle = e.target.value;
    clearTiles();
    updateDynamicTiles();
  });

  rotateToggle.addEventListener("change", (e) => {
    isRotating = e.target.checked;
  });

  btnZoomIn.addEventListener("click", () => {
    isRotating = false;
    rotateToggle.checked = false;
    const dest = camera.position.length() - 0.25;
    flyToTarget = {
      position: camera.position.clone().normalize().multiplyScalar(Math.max(dest, 1.06)),
      duration: 0.5,
      elapsed: 0
    };
  });

  btnZoomOut.addEventListener("click", () => {
    isRotating = false;
    rotateToggle.checked = false;
    const dest = camera.position.length() + 0.25;
    flyToTarget = {
      position: camera.position.clone().normalize().multiplyScalar(Math.min(dest, 4.8)),
      duration: 0.5,
      elapsed: 0
    };
  });

  btnReset.addEventListener("click", () => {
    isRotating = true;
    rotateToggle.checked = true;
    markerGroup.clear();
    detailsContent.textContent = "Click anywhere on the globe to inspect the location coordinates, retrieve local information, and check weather details.";
    flyToTarget = {
      position: new THREE.Vector3(0, 0, 2.8),
      duration: 1.0,
      elapsed: 0
    };
  });

  let longPressTimer = null;

  function getGlobeIntersection(clientX, clientY) {
    const rect = canvasContainer.getBoundingClientRect();
    mousePoint.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mousePoint.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mousePoint, camera);
    const intersects = raycaster.intersectObject(baseGlobe);
    return intersects.length > 0 ? intersects[0] : null;
  }

  function handleFlyTo(clientX, clientY) {
    if (!camera) return;
    const intersect = getGlobeIntersection(clientX, clientY);
    if (intersect) {
      const geo = vector3ToLonLat(intersect.point);
      triggerFlyTo(geo.lat, geo.lon, 1.18);
      fetchLocationData(geo.lat, geo.lon);
    }
  }

  canvasContainer.addEventListener("dblclick", (event) => {
    event.preventDefault();
    handleFlyTo(event.clientX, event.clientY);
  });

  canvasContainer.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startY = touch.clientY;
    longPressTimer = setTimeout(() => {
      handleFlyTo(startX, startY);
    }, 600);
  }, { passive: true });

  canvasContainer.addEventListener("touchmove", () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: true });

  canvasContainer.addEventListener("touchend", () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }, { passive: true });

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim();
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (query.length < 3) {
      suggestionsBox.style.display = "none";
      return;
    }

    searchTimeout = setTimeout(async () => {
      const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
      toolLog('globe', 'api_request', { source: 'nominatim-search', url: searchUrl, summary: `search "${query}"` }).catch(() => {});
      const searchStart = performance.now();
      try {
        const response = await fetch(searchUrl);
        const data = await response.json();
        toolLog('globe', 'api_response', { source: 'nominatim-search', duration: Math.round(performance.now() - searchStart), statusCode: response.status, summary: `${data.length} results for "${query}"` }).catch(() => {});
        
        suggestionsBox.innerHTML = "";
        if (data.length === 0) {
          suggestionsBox.style.display = "none";
          return;
        }

        data.forEach(item => {
          const itemDiv = document.createElement("div");
          itemDiv.textContent = item.display_name;
          itemDiv.style.cssText = "padding:0.5rem 0.75rem;cursor:pointer;font-size:0.78rem;color:var(--color-text);border-bottom:1px solid var(--color-border);line-height:1.3;";
          itemDiv.onmouseenter = () => itemDiv.style.background = "var(--color-bg)";
          itemDiv.onmouseleave = () => itemDiv.style.background = "transparent";
          itemDiv.addEventListener("click", () => {
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);
            searchInput.value = item.display_name;
            suggestionsBox.style.display = "none";
            triggerFlyTo(lat, lon, 1.15);
            fetchLocationData(lat, lon);
          });
          suggestionsBox.appendChild(itemDiv);
        });
        suggestionsBox.style.display = "block";
      } catch (err) {
        toolLog('globe', 'api_error', { source: 'nominatim-search', duration: Math.round(performance.now() - searchStart), summary: err.message || 'search failed' }).catch(() => {});
        suggestionsBox.style.display = "none";
      }
    }, 450);
  });

  document.addEventListener("click", (e) => {
    if (!searchContainer.contains(e.target)) {
      suggestionsBox.style.display = "none";
    }
  });

  function animate() {
    requestAnimationFrame(animate);

    if (flyToTarget) {
      flyToTarget.elapsed += 0.016;
      const progress = Math.min(flyToTarget.elapsed / flyToTarget.duration, 1);
      const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      
      camera.position.lerpVectors(camera.position, flyToTarget.position, ease * 0.15);
      
      if (progress >= 1 || camera.position.distanceTo(flyToTarget.position) < 0.01) {
        flyToTarget = null;
      }
    } else if (isRotating) {
      baseGlobe.rotation.y += 0.001;
      markerGroup.rotation.y += 0.001;
      for (const [key, mesh] of activeTiles.entries()) {
        mesh.rotation.y += 0.001;
      }
    }

    controls.update();
    updateDynamicTiles();
    renderer.render(scene, camera);
  }

  initThree();

  return () => {
    document.body.style.overflow = "";
    window.removeEventListener("resize", onWindowResize);
    clearTiles();
    if (renderer) {
      renderer.dispose();
    }
    if (controls) {
      controls.dispose();
    }
    mainContainer.remove();
  };
}

export function destroy(container) {
  container.innerHTML = "";
}