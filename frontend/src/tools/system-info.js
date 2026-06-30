export const name = "System Info";
export const description = "Comprehensive hardware, network, display, and environment diagnostics dashboard";

export function init(container) {
  container.style.overflow = "auto";

  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;flex-direction:column;padding:1.25rem;gap:1rem;min-width:0;";
  container.appendChild(wrapper);

  const title = document.createElement("h2");
  title.textContent = "System Information";
  title.style.cssText = "margin:0;font-size:1.1rem;font-weight:600;color:var(--color-text);";
  wrapper.appendChild(title);

  const subtitle = document.createElement("p");
  subtitle.style.cssText = "margin:0;font-size:0.82rem;color:var(--color-text-muted);";
  subtitle.textContent = "Comprehensive diagnostics about your device, browser, and environment.";
  wrapper.appendChild(subtitle);

  const sections = [
    { id: "hardware", label: "Hardware & Performance", init: initHardware },
    { id: "battery", label: "Battery & Power", init: initBattery },
    { id: "network", label: "Network & Connectivity", init: initNetwork },
    { id: "storage", label: "Storage & Filesystem", init: initStorage },
    { id: "display", label: "Display, Screen & Window", init: initDisplay },
    { id: "os", label: "Operating System & Environment", init: initOS },
    { id: "peripherals", label: "Connected Hardware", init: initPeripherals },
  ];

  for (const sec of sections) {
    const sectionEl = createSection(sec.id, sec.label);
    wrapper.appendChild(sectionEl.wrapper);
    sec.init(sectionEl.body);
  }

  return () => { wrapper.remove(); };
}

export function destroy(container) {
  container.innerHTML = "";
}

function createSection(id, label) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);overflow:hidden;";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;padding:0.65rem 0.85rem;cursor:pointer;user-select:none;";
  header.dataset.collapsed = "false";

  const title = document.createElement("span");
  title.textContent = label;
  title.style.cssText = "font-size:0.88rem;font-weight:600;color:var(--color-text);";

  const arrow = document.createElement("span");
  arrow.textContent = "▾";
  arrow.style.cssText = "font-size:0.75rem;color:var(--color-text-muted);transition:transform 0.2s;";

  header.appendChild(title);
  header.appendChild(arrow);

  const body = document.createElement("div");
  body.style.cssText =
    "padding:0.65rem 0.85rem;display:flex;flex-direction:column;gap:0.35rem;min-width:0;";

  header.addEventListener("click", () => {
    const collapsed = header.dataset.collapsed === "true";
    header.dataset.collapsed = collapsed ? "false" : "true";
    body.style.display = collapsed ? "flex" : "none";
    arrow.style.transform = collapsed ? "rotate(0deg)" : "rotate(-90deg)";
  });

  wrapper.appendChild(header);
  wrapper.appendChild(body);

  return { wrapper, body, header };
}

function addRow(container, label, value, monospace) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;padding:0.2rem 0;";

  const lbl = document.createElement("span");
  lbl.textContent = label;
  lbl.style.cssText = "font-size:0.82rem;color:var(--color-text-muted);white-space:nowrap;";

  const val = document.createElement("span");
  val.textContent = value ?? "N/A";
  val.style.cssText = `font-size:0.82rem;color:var(--color-text);text-align:right;overflow-wrap:break-word;max-width:55%;flex-shrink:1;${monospace ? "font-family:monospace;" : ""}`;

  row.appendChild(lbl);
  row.appendChild(val);
  container.appendChild(row);
  return val;
}

function drawBar(canvas, value, maxValue, color) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);
  const pct = Math.min(value / maxValue, 1);
  const barH = h;
  const r = 4;

  ctx.fillStyle = "var(--color-border)";
  roundRect(ctx, 0, 0, w, barH, [r]);
  ctx.fill();

  ctx.fillStyle = color;
  roundRect(ctx, 0, 0, w * pct, barH, [r]);
  ctx.fill();
}

function drawDonut(canvas, pct, color, bgColor) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const size = Math.max(canvas.clientWidth, 1);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.scale(dpr, dpr);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = Math.max(size / 2 - 4, 1);
  const innerR = Math.max(outerR * 0.65, 1);

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fillStyle = bgColor;
  ctx.fill();

  const startAngle = -Math.PI / 2;
  const endAngle = startAngle + Math.PI * 2 * Math.min(pct, 1);

  ctx.beginPath();
  ctx.arc(cx, cy, outerR, startAngle, endAngle);
  ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/* ---------- Hardware ---------- */
function initHardware(body) {
  addRow(body, "CPU Cores", navigator.hardwareConcurrency ?? "N/A");
  addRow(body, "Device RAM", navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "N/A");

  const gpuEl = document.createElement("div");
  gpuEl.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;padding:0.25rem 0;";
  const gpuLbl = document.createElement("span");
  gpuLbl.textContent = "GPU";
  gpuLbl.style.cssText = "font-size:0.82rem;color:var(--color-text-muted);flex-shrink:0;";
  const gpuVal = document.createElement("span");
  gpuVal.style.cssText = "font-size:0.82rem;color:var(--color-text);text-align:right;word-break:break-all;";
  gpuVal.textContent = "Detecting...";
  gpuEl.appendChild(gpuLbl);
  gpuEl.appendChild(gpuVal);
  body.appendChild(gpuEl);

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
        const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        gpuVal.textContent = `${vendor} — ${renderer}`;
      } else {
        gpuVal.textContent = gl.getParameter(gl.RENDERER) || "N/A";
      }
    } else {
      gpuVal.textContent = "WebGL not available";
    }
  } catch { gpuVal.textContent = "WebGL not available"; }

  const thermalRow = document.createElement("div");
  thermalRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:0.5rem;padding:0.25rem 0;";
  const thermalLbl = document.createElement("span");
  thermalLbl.textContent = "Thermal State";
  thermalLbl.style.cssText = "font-size:0.82rem;color:var(--color-text-muted);";
  const thermalVal = document.createElement("span");
  thermalVal.textContent = "N/A";
  thermalVal.style.cssText = "font-size:0.82rem;color:var(--color-text);";
  thermalRow.appendChild(thermalLbl);
  thermalRow.appendChild(thermalVal);
  body.appendChild(thermalRow);

  if (typeof navigator.getThermal === "function") {
    navigator.getThermal().then((state) => {
      thermalVal.textContent = typeof state === "object" ? (state.thermalState || state.state || JSON.stringify(state)) : String(state);
    }).catch(() => {});
  }

  videoCodecSupport(body);

  const benchRow = document.createElement("div");
  benchRow.style.cssText = "display:flex;flex-direction:column;gap:0.35rem;padding:0.25rem 0;";
  const benchLbl = document.createElement("span");
  benchLbl.textContent = "Script Benchmarks";
  benchLbl.style.cssText = "font-size:0.82rem;color:var(--color-text-muted);";
  benchRow.appendChild(benchLbl);

  const benchCanvas = document.createElement("canvas");
  benchCanvas.style.cssText = "width:100%;height:120px;border-radius:6px;max-width:100%;";
  benchRow.appendChild(benchCanvas);
  body.appendChild(benchRow);

  setTimeout(() => runBenchmarks(benchCanvas), 100);

  webglTextureSize(body);

  addRow(body, "Physical Keyboard", navigator.keyboard ? "Yes (API available)" : "Unknown");
}

async function videoCodecSupport(body) {
  if (!navigator.mediaCapabilities) return;

  const codecs = [
    { type: "decode", codec: "video/mp4;codecs=avc1.42E01E", label: "H.264 Decode" },
    { type: "decode", codec: "video/webm;codecs=vp8", label: "VP8 Decode" },
    { type: "decode", codec: "video/webm;codecs=vp09.00.10.08", label: "VP9 Decode" },
    { type: "decode", codec: "video/mp4;codecs=av01.0.05M.08", label: "AV1 Decode" },
    { type: "decode", codec: "video/mp4;codecs=hev1.1.6.L120.90", label: "HEVC Decode" },
    { type: "encode", codec: "video/mp4;codecs=avc1.42E01E", label: "H.264 Encode" },
    { type: "encode", codec: "video/webm;codecs=vp8", label: "VP8 Encode" },
    { type: "encode", codec: "video/webm;codecs=vp09.00.10.08", label: "VP9 Encode" },
    { type: "encode", codec: "video/mp4;codecs=av01.0.05M.08", label: "AV1 Encode" },
    { type: "encode", codec: "video/mp4;codecs=hev1.1.6.L120.90", label: "HEVC Encode" },
  ];

  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;gap:0.35rem;padding:0.25rem 0;";
  const lbl = document.createElement("div");
  lbl.textContent = "Video Codec HW Support";
  lbl.style.cssText = "font-size:0.82rem;color:var(--color-text-muted);width:100%;margin-bottom:0.15rem;";
  row.appendChild(lbl);

  for (const c of codecs) {
    const cfg = {
      type: "media-source",
      video: {
        contentType: c.codec,
        width: 1920,
        height: 1080,
        bitrate: 5000000,
        framerate: 30,
      },
    };
    let support = "N/A";
    try {
      const infoFn = c.type === "decode" ? navigator.mediaCapabilities.decodingInfo : navigator.mediaCapabilities.encodingInfo;
      const result = await infoFn.call(navigator.mediaCapabilities, cfg);
      support = result.supported
        ? (result.powerEfficient ? "HW ✅" : "SW ⚠️")
        : "✗";
    } catch { support = "✗"; }
    const chip = document.createElement("span");
    chip.textContent = `${c.label}: ${support}`;
    chip.style.cssText = `font-size:0.73rem;padding:0.2rem 0.45rem;border-radius:4px;background:var(--color-bg);color:var(--color-text);border:1px solid var(--color-border);`;
    row.appendChild(chip);
  }
  body.appendChild(row);
}

function runBenchmarks(canvas) {
  const results = [];
  const labels = [];

  function mkBench(label, fn) { return { label, fn }; }
  const benchTests = [
    mkBench("1M Array Sort", () => { const a = []; for (let i = 0; i < 1e6; i++) a.push(Math.random()); a.sort(); }),
    mkBench("10M Loop", () => { let n = 0; for (let i = 0; i < 10e6; i++) n += i; return n; }),
    mkBench("JSON 10K", () => { const o = []; for (let i = 0; i < 1e4; i++) o.push({ a: i, b: "x".repeat(20) }); JSON.stringify(o); return JSON.parse(JSON.stringify(o)); }),
    mkBench("Fib(35)", () => { function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); } return fib(35); }),
    mkBench("1M Math", () => { let sum = 0; for (let i = 0; i < 1e6; i++) sum += Math.sin(i) * Math.cos(i) * Math.sqrt(i); return sum; }),
  ];

  for (const { label, fn } of benchTests) {
    const t0 = performance.now();
    fn();
    const dt = performance.now() - t0;
    results.push(dt);
    labels.push(label);
  }

  addRow(canvas.parentElement, "Benchmark Run", `${labels.length} tests completed`);

  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const maxVal = Math.max(...results, 1);
  const pad = { top: 20, right: 10, bottom: 40, left: 10 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;
  const barW = chartW / results.length * 0.7;
  const gap = chartW / results.length * 0.3;

  ctx.clearRect(0, 0, w, h);

  for (let i = 0; i < results.length; i++) {
    const x = pad.left + i * (barW + gap) + gap / 2;
    const barH = (results[i] / maxVal) * chartH;
    const y = pad.top + chartH - barH;

    const hue = (i / results.length) * 300;
    ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
    roundRect(ctx, x, y, barW, barH, [3, 3, 0, 0]);
    ctx.fill();

    ctx.fillStyle = "var(--color-text-muted)";
    ctx.font = "9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(results[i].toFixed(0) + "ms", x + barW / 2, y - 4);

    ctx.save();
    ctx.translate(x + barW / 2, h - 6);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = "var(--color-text-muted)";
    ctx.font = "8px sans-serif";
    ctx.textAlign = "right";
    const short = labels[i].replace(/[^A-Za-z0-9]/g, "").substring(0, 8);
    ctx.fillText(short, 0, 0);
    ctx.restore();
  }

  ctx.fillStyle = "var(--color-text-muted)";
  ctx.font = "9px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Lower is better", pad.left, 10);
}

function webglTextureSize(body) {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      addRow(body, "Max WebGL Texture Size", `${maxSize}×${maxSize} px`);

      const maxCube = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
      addRow(body, "Max Cube Map Size", `${maxCube}×${maxCube} px`);
    }
  } catch { /* WebGL not available */ }
}

/* ---------- Battery ---------- */
function initBattery(body) {
  if (!navigator.getBattery) {
    addRow(body, "Battery API", "Not supported");
    return;
  }

  const donutRow = document.createElement("div");
  donutRow.style.cssText = "display:flex;align-items:center;gap:1rem;padding:0.25rem 0;";

  const donutCanvas = document.createElement("canvas");
  donutCanvas.style.cssText = "width:80px;height:80px;flex-shrink:0;";
  donutCanvas.width = 80;
  donutCanvas.height = 80;
  donutRow.appendChild(donutCanvas);

  const infoCol = document.createElement("div");
  infoCol.style.cssText = "display:flex;flex-direction:column;gap:0.25rem;flex:1;";

  const levelVal = document.createElement("span");
  levelVal.style.cssText = "font-size:0.88rem;font-weight:600;color:var(--color-text);";
  const statusVal = document.createElement("span");
  statusVal.style.cssText = "font-size:0.78rem;color:var(--color-text-muted);";

  infoCol.appendChild(levelVal);
  infoCol.appendChild(statusVal);
  donutRow.appendChild(infoCol);
  body.appendChild(donutRow);

  const detailsRow = document.createElement("div");
  detailsRow.style.cssText = "display:flex;flex-direction:column;gap:0.25rem;";
  body.appendChild(detailsRow);

  navigator.getBattery().then((battery) => {
    function update() {
      const pct = battery.level;
      const charging = battery.charging;
      const dischargingTime = battery.dischargingTime;
      const chargingTime = battery.chargingTime;

      drawDonut(donutCanvas, pct, charging ? "#2ecc71" : "#e67e22", "#2a2a2a");

      levelVal.textContent = `${Math.round(pct * 100)}%`;
      statusVal.textContent = charging ? "⚡ Charging" : "🔋 Discharging";

      detailsRow.innerHTML = "";
      addRow(detailsRow, "Charging", charging ? "Yes" : "No");
      addRow(detailsRow, "Level", `${Math.round(pct * 100)}%`);
      addRow(detailsRow, "Time to Empty", dischargingTime === Infinity ? "Calculating..." : formatTime(dischargingTime));
      addRow(detailsRow, "Time to Full", chargingTime === Infinity ? "Calculating..." : formatTime(chargingTime));
    }

    update();
    battery.addEventListener("levelchange", update);
    battery.addEventListener("chargingchange", update);
    battery.addEventListener("chargingtimechange", update);
    battery.addEventListener("dischargingtimechange", update);
  });
}

/* ---------- Network ---------- */
function initNetwork(body) {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  if (conn) {
    addRow(body, "Connection Type", conn.type || "N/A");
    addRow(body, "Effective Type", conn.effectiveType || "N/A");

    const speedRow = document.createElement("div");
    speedRow.style.cssText = "display:flex;flex-direction:column;gap:0.25rem;padding:0.25rem 0;";

    const speedLbl = document.createElement("span");
    speedLbl.textContent = `Downlink Speed: ${conn.downlink ?? "N/A"} Mbps`;
    speedLbl.style.cssText = "font-size:0.82rem;color:var(--color-text-muted);";
    speedRow.appendChild(speedLbl);

    const speedBar = document.createElement("canvas");
    speedBar.style.cssText = "width:100%;height:16px;border-radius:4px;";
    speedRow.appendChild(speedBar);
    body.appendChild(speedRow);

    const maxDownlink = Math.max(conn.downlink || 0, 100);
    setTimeout(() => drawBar(speedBar, conn.downlink || 0, maxDownlink, "#3498db"), 50);

    addRow(body, "RTT Latency", conn.rtt ? `${conn.rtt} ms` : "N/A");
    addRow(body, "Save-Data Mode", navigator.connection?.saveData ? "Enabled" : "Disabled");
  } else {
    addRow(body, "Network Info API", "Not supported");
  }

  addRow(body, "Online Status", navigator.onLine ? "Online" : "Offline");
}

/* ---------- Storage ---------- */
function initStorage(body) {
  if (!navigator.storage || !navigator.storage.estimate) {
    addRow(body, "Storage Manager API", "Not supported");
    return;
  }

  navigator.storage.estimate().then((est) => {
    const quota = est.quota;
    const usage = est.usage;

    if (quota) {
      addRow(body, "Total Quota", formatBytes(quota));
      addRow(body, "Used", formatBytes(usage));
      addRow(body, "Available", formatBytes(quota - usage));

      const pct = usage / quota;

      const barRow = document.createElement("div");
      barRow.style.cssText = "display:flex;flex-direction:column;gap:0.2rem;padding:0.25rem 0;";

      const barLbl = document.createElement("span");
      barLbl.textContent = `Usage: ${(pct * 100).toFixed(1)}%`;
      barLbl.style.cssText = "font-size:0.78rem;color:var(--color-text-muted);";
      barRow.appendChild(barLbl);

      const barCanvas = document.createElement("canvas");
      barCanvas.style.cssText = "width:100%;height:16px;border-radius:4px;";
      barRow.appendChild(barCanvas);
      body.appendChild(barRow);

      const hue = pct > 0.8 ? 0 : pct > 0.5 ? 30 : 140;
      setTimeout(() => drawBar(barCanvas, usage, quota, `hsl(${hue}, 70%, 50%)`), 50);
    }
  });

  if (navigator.storage && navigator.storage.persisted) {
    navigator.storage.persisted().then((persisted) => {
      addRow(body, "Storage Persistence", persisted ? "Persistent ✅" : "Not persistent");
    });
  }
}

/* ---------- Display ---------- */
function initDisplay(body) {
  const scr = window.screen;

  addRow(body, "Screen Width", `${scr.width} px`);
  addRow(body, "Screen Height", `${scr.height} px`);
  addRow(body, "Available Width", `${scr.availWidth} px`);
  addRow(body, "Available Height", `${scr.availHeight} px`);
  addRow(body, "Device Pixel Ratio", window.devicePixelRatio?.toFixed(2) ?? "N/A");
  addRow(body, "Color Depth", scr.colorDepth ? `${scr.colorDepth}-bit` : "N/A");

  if (scr.orientation) {
    addRow(body, "Orientation", scr.orientation.type || "N/A");
    addRow(body, "Orientation Angle", scr.orientation.angle != null ? `${scr.orientation.angle}°` : "N/A");
  }

  if ("getScreenDetails" in window) {
    window.getScreenDetails().then((details) => {
      addRow(body, "Screens Detected", details.screens.length);
    }).catch(() => {});
  }

  if (navigator.devicePosture && typeof navigator.devicePosture.then === "function") {
    navigator.devicePosture.then((posture) => {
      addRow(body, "Device Posture", posture?.type || "N/A");
    }).catch(() => {});
  }
}

/* ---------- OS & Environment ---------- */
function initOS(body) {
  const uaData = navigator.userAgentData;

  if (uaData && uaData.getHighEntropyValues) {
    uaData.getHighEntropyValues([
      "platform", "platformVersion", "architecture", "model", "uaFullVersion",
    ]).then((h) => {
      addRow(body, "OS", h.platform || "N/A");
      addRow(body, "OS Version", h.platformVersion || "N/A");
      addRow(body, "CPU Architecture", h.architecture || "N/A");
      addRow(body, "Device Model", h.model || "N/A");
      addRow(body, "Browser Version", h.uaFullVersion || "N/A");
    }).catch(() => {});
  } else {
    const plat = navigator.platform || "N/A";
    addRow(body, "Platform", plat);

    const osMatch = navigator.userAgent.match(/\((.*?)\)/);
    if (osMatch) addRow(body, "OS (UA)", osMatch[1]);
  }

  addRow(body, "Language", navigator.language || "N/A");
  addRow(body, "Languages", navigator.languages?.join(", ") || "N/A");
  addRow(body, "Time Zone", Intl.DateTimeFormat().resolvedOptions().timeZone || "N/A");

  const now = new Date();
  addRow(body, "Local Time", now.toLocaleString());
  addRow(body, "UTC Time", now.toUTCString());

  const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
  addRow(body, "Color Scheme", darkMode ? "Dark" : "Light");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  addRow(body, "Reduced Motion", reducedMotion ? "Yes" : "No");

  const highContrast = window.matchMedia("(prefers-contrast: more)").matches;
  const lowContrast = window.matchMedia("(prefers-contrast: less)").matches;
  addRow(body, "Contrast Preference", highContrast ? "High" : lowContrast ? "Low" : "Default");
}

/* ---------- Peripherals (Permission Required) ---------- */
function initPeripherals(body) {
  body.style.gap = "0.5rem";

  const geoCard = createPermissionCard("GPS Location", "High-accuracy latitude, longitude, altitude", requestGeolocation);
  body.appendChild(geoCard);

  const motionCard = createPermissionCard("Device Motion", "Acceleration vectors (DeviceMotionEvent)", requestDeviceMotion);
  body.appendChild(motionCard);

  const orientCard = createPermissionCard("Device Orientation", "Gyroscope rotation angles (DeviceOrientationEvent)", requestDeviceOrientation);
  body.appendChild(orientCard);

  const audioCard = createPermissionCard("Audio Output Devices", "Speakers and headphones", requestAudioDevices);
  body.appendChild(audioCard);

  const videoCard = createPermissionCard("Camera / Microphone", "Video and audio input hardware", requestMediaDevices);
  body.appendChild(videoCard);
}

function createPermissionCard(label, desc, onClick) {
  const card = document.createElement("div");
  card.style.cssText =
    "border:1px solid var(--color-border);border-radius:6px;padding:0.5rem 0.65rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;";

  const info = document.createElement("div");
  info.style.cssText = "display:flex;flex-direction:column;flex:1;min-width:0;";

  const title = document.createElement("span");
  title.textContent = label;
  title.style.cssText = "font-size:0.82rem;font-weight:600;color:var(--color-text);";

  const descEl = document.createElement("span");
  descEl.textContent = desc;
  descEl.style.cssText = "font-size:0.72rem;color:var(--color-text-muted);margin-top:1px;";

  info.appendChild(title);
  info.appendChild(descEl);

  const btn = document.createElement("button");
  btn.textContent = "Request";
  btn.style.cssText =
    "flex-shrink:0;padding:0.3rem 0.6rem;border:none;border-radius:6px;font-size:0.72rem;font-weight:600;cursor:pointer;background:var(--color-primary);color:#fff;white-space:nowrap;transition:opacity 0.15s;";

  const result = document.createElement("div");
  result.style.cssText = "display:none;padding:0.35rem 0.65rem;font-size:0.78rem;color:var(--color-text);line-height:1.5;font-family:monospace;white-space:pre-wrap;";

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.textContent = "Requesting...";
    try {
      await onClick(result, btn);
      btn.style.display = "none";
      result.style.display = "block";
    } catch {
      btn.style.background = "#e74c3c";
      btn.textContent = "Denied / Error";
      btn.style.opacity = "1";
      btn.disabled = false;
    }
  });

  card.appendChild(info);
  card.appendChild(btn);
  card.appendChild(result);

  return card;
}

function requestGeolocation(resultEl) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = pos.coords;
        resultEl.textContent =
          `Latitude:  ${c.latitude}\n` +
          `Longitude: ${c.longitude}\n` +
          `Altitude:  ${c.altitude ?? "N/A"} m\n` +
          `Accuracy:  ${c.accuracy} m\n` +
          `Speed:     ${c.speed ?? "N/A"} m/s\n` +
          `Heading:   ${c.heading ?? "N/A"}°`;
        resolve();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) reject(new Error("Denied"));
        else reject(err);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function requestDeviceMotion(resultEl) {
  return new Promise((resolve, reject) => {
    try {
      const dmPerm = DeviceMotionEvent.requestPermission;
      (dmPerm ? dmPerm.call(DeviceMotionEvent).then((state) => {
        if (state !== "granted") { reject(new Error("Denied")); return; }
        attachMotionHandler(resolve, reject, resultEl);
      }) : attachMotionHandler(resolve, reject, resultEl));
    } catch { reject(new Error("Error")); }
  });
}

function attachMotionHandler(resolve, reject, resultEl) {
  const handler = (e) => {
    const acc = e.accelerationIncludingGravity || e.acceleration || {};
    const rot = e.rotationRate || {};
    resultEl.textContent =
      `Accel X:  ${(acc.x || 0).toFixed(2)} m/s²\n` +
      `Accel Y:  ${(acc.y || 0).toFixed(2)} m/s²\n` +
      `Accel Z:  ${(acc.z || 0).toFixed(2)} m/s²\n` +
      `Alpha:    ${(rot.alpha || 0).toFixed(2)}°/s\n` +
      `Beta:     ${(rot.beta || 0).toFixed(2)}°/s\n` +
      `Gamma:    ${(rot.gamma || 0).toFixed(2)}°/s\n` +
      `Interval: ${e.interval || "N/A"} ms`;
    resolve();
  };
  window.addEventListener("devicemotion", handler, { once: true });
  setTimeout(() => {
    window.removeEventListener("devicemotion", handler);
    if (!resultEl.textContent) reject(new Error("Timeout"));
  }, 5000);
}

function requestDeviceOrientation(resultEl) {
  return new Promise((resolve, reject) => {
    try {
      const doPerm = DeviceOrientationEvent.requestPermission;
      (doPerm ? doPerm.call(DeviceOrientationEvent).then((state) => {
        if (state !== "granted") { reject(new Error("Denied")); return; }
        attachOrientationHandler(resolve, reject, resultEl);
      }) : attachOrientationHandler(resolve, reject, resultEl));
    } catch { reject(new Error("Error")); }
  });
}

function attachOrientationHandler(resolve, reject, resultEl) {
  const handler = (e) => {
    resultEl.textContent =
      `Alpha: ${(e.alpha || 0).toFixed(1)}°\n` +
      `Beta:  ${(e.beta || 0).toFixed(1)}°\n` +
      `Gamma: ${(e.gamma || 0).toFixed(1)}°\n` +
      `Absolute: ${e.absolute ? "Yes" : "No"}`;
    resolve();
  };
  window.addEventListener("deviceorientation", handler, { once: true });
  setTimeout(() => {
    window.removeEventListener("deviceorientation", handler);
    if (!resultEl.textContent) reject(new Error("Timeout"));
  }, 5000);
}

function requestAudioDevices(resultEl) {
  return new Promise((resolve, reject) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      reject(new Error("Not supported"));
      return;
    }
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
      if (audioOutputs.length === 0) {
        resultEl.textContent = "No audio output devices detected.";
      } else {
        resultEl.textContent = audioOutputs
          .map((d, i) => `${i + 1}. ${d.label || "Unnamed"}${d.deviceId === "default" ? " (default)" : ""}`)
          .join("\n");
      }
      resolve();
    }).catch(() => reject(new Error("Permission denied")));
  });
}

function requestMediaDevices(resultEl) {
  return new Promise((resolve, reject) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      reject(new Error("Not supported"));
      return;
    }
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const audioInputs = devices.filter((d) => d.kind === "audioinput");
      const videoInputs = devices.filter((d) => d.kind === "videoinput");
      const parts = [];
      if (audioInputs.length) {
        parts.push("— Microphones —");
        parts.push(...audioInputs.map((d, i) => `${i + 1}. ${d.label || "Unnamed"}`));
      }
      if (videoInputs.length) {
        parts.push("— Cameras —");
        parts.push(...videoInputs.map((d, i) => `${i + 1}. ${d.label || "Unnamed"}`));
      }
      if (!parts.length) parts.push("No media devices detected.");
      resultEl.textContent = parts.join("\n");
      resolve();
    }).catch(() => reject(new Error("Permission denied")));
  });
}

function roundRect(ctx, x, y, w, h, radii) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radii);
    return;
  }
  const [tl, tr, br, bl] = radii.map((r) => Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}

/* ---------- Helpers ---------- */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatTime(seconds) {
  if (!seconds || seconds === Infinity || isNaN(seconds)) return "N/A";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
