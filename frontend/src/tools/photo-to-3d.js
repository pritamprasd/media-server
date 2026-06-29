import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export const name = "Photo to 3D";
export const description = "Take a photo with your camera and map it as a texture onto an animated 3D object";

export function init(container) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;flex-direction:column;height:100%;overflow-y:auto;";
  container.appendChild(wrapper);

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:0.75rem;padding:0.85rem 1rem;border-bottom:1px solid var(--color-border);flex-shrink:0;";
  wrapper.appendChild(header);

  const title = document.createElement("h2");
  title.textContent = "Photo to 3D";
  title.style.cssText = "margin:0;font-size:1rem;font-weight:600;color:var(--color-text);flex:1;";
  header.appendChild(title);

  const sourceToggle = document.createElement("button");
  sourceToggle.textContent = "Switch to Sample Image";
  sourceToggle.style.cssText = btnCSS("var(--color-surface)", "var(--color-text)") + ";border:1px solid var(--color-border);font-size:0.72rem;";

  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0;";
  wrapper.appendChild(body);

  const cameraSection = document.createElement("div");
  cameraSection.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:0.65rem;padding:1rem;";

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.style.cssText =
    "width:100%;max-width:360px;border-radius:8px;background:#000;aspect-ratio:4/3;object-fit:cover;display:none;";

  const cameraBtnRow = document.createElement("div");
  cameraBtnRow.style.cssText = "display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;";

  const startCameraBtn = document.createElement("button");
  startCameraBtn.textContent = "Start Camera";
  startCameraBtn.style.cssText = btnCSS("var(--color-primary)", "#fff");

  const captureBtn = document.createElement("button");
  captureBtn.textContent = "Capture Photo";
  captureBtn.style.cssText = btnCSS("var(--color-primary)", "#fff");
  captureBtn.disabled = true;
  captureBtn.style.opacity = "0.4";

  const retakeBtn = document.createElement("button");
  retakeBtn.textContent = "Retake";
  retakeBtn.style.cssText = btnCSS("var(--color-surface)", "var(--color-text)") + ";border:1px solid var(--color-border);";
  retakeBtn.style.display = "none";

  header.appendChild(sourceToggle);
  cameraBtnRow.appendChild(startCameraBtn);
  cameraBtnRow.appendChild(captureBtn);
  cameraBtnRow.appendChild(retakeBtn);
  cameraSection.appendChild(video);
  cameraSection.appendChild(cameraBtnRow);
  body.appendChild(cameraSection);

  const splitter = document.createElement("div");
  splitter.style.cssText =
    "height:1px;background:var(--color-border);margin:0 1rem;flex-shrink:0;";
  body.appendChild(splitter);

  const viewSection = document.createElement("div");
  viewSection.style.cssText =
    "display:flex;flex-direction:column;flex:1;min-height:280px;position:relative;";

  const canvasBox = document.createElement("div");
  canvasBox.style.cssText = "flex:1;min-height:0;position:relative;";
  viewSection.appendChild(canvasBox);

  const controlsPanel = document.createElement("div");
  controlsPanel.style.cssText =
    "display:flex;flex-wrap:wrap;gap:0.6rem;padding:0.6rem 1rem;align-items:center;border-top:1px solid var(--color-border);background:var(--color-surface);flex-shrink:0;";
  viewSection.appendChild(controlsPanel);

  body.appendChild(viewSection);

  let activeStream = null;
  let capturedTexture = null;
  let usingSample = false;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111122);

  const camera3d = new THREE.PerspectiveCamera(45, canvasBox.clientWidth / canvasBox.clientHeight || 1, 0.1, 100);
  camera3d.position.set(2.5, 1.8, 3.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(canvasBox.clientWidth, canvasBox.clientHeight);
  canvasBox.appendChild(renderer.domElement);

  const orbitControls = new OrbitControls(camera3d, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.target.set(0, 0, 0);
  orbitControls.minDistance = 1.2;
  orbitControls.maxDistance = 10;

  const ambientLight = new THREE.AmbientLight(0x404060);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(3, 5, 4);
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0x4488ff, 0.5);
  fillLight.position.set(-3, 1, -5);
  scene.add(fillLight);

  const gridHelper = new THREE.GridHelper(4, 8, 0x444488, 0x333366);
  scene.add(gridHelper);

  let meshGroup = new THREE.Group();
  scene.add(meshGroup);

  let currentShape = "sphere";
  let speedX = 0.008;
  let speedY = 0.015;
  let autoRotate = true;

  function createSampleTexture() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, "#ff6b6b");
    grad.addColorStop(0.25, "#feca57");
    grad.addColorStop(0.5, "#48dbfb");
    grad.addColorStop(0.75, "#ff9ff3");
    grad.addColorStop(1, "#54a0ff");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("📷", 256, 200);
    ctx.font = "28px sans-serif";
    ctx.fillText("Take a photo", 256, 340);
    ctx.fillText("to map it here", 256, 380);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  capturedTexture = createSampleTexture();
  rebuildMesh();

  function rebuildMesh() {
    while (meshGroup.children.length) {
      const c = meshGroup.children[0];
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
      meshGroup.remove(c);
    }

    let geometry;
    const s = 1;
    switch (currentShape) {
      case "sphere":
        geometry = new THREE.SphereGeometry(s * 0.9, 48, 32);
        break;
      case "cube":
        geometry = new THREE.BoxGeometry(s * 1.1, s * 1.1, s * 1.1);
        break;
      case "torus":
        geometry = new THREE.TorusGeometry(s * 0.8, 0.3, 32, 48);
        break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(s * 0.8, s * 0.8, 1.2, 32);
        break;
      case "torus-knot":
        geometry = new THREE.TorusKnotGeometry(s * 0.7, 0.28, 96, 16);
        break;
      case "cone":
        geometry = new THREE.ConeGeometry(s * 0.85, s * 1.3, 32);
        break;
      case "dodecahedron":
        geometry = new THREE.DodecahedronGeometry(s * 0.8);
        break;
      case "octahedron":
        geometry = new THREE.OctahedronGeometry(s * 0.9);
        break;
      case "icosahedron":
        geometry = new THREE.IcosahedronGeometry(s * 0.85);
        break;
      case "tetrahedron":
        geometry = new THREE.TetrahedronGeometry(s * 0.9);
        break;
      case "ring":
        geometry = new THREE.RingGeometry(0.35, s * 0.85, 48);
        break;
      case "disc":
        geometry = new THREE.CircleGeometry(s * 0.85, 32);
        break;
      case "capsule":
        geometry = new THREE.CapsuleGeometry(s * 0.55, s * 0.7, 16, 32);
        break;
      case "pyramid":
        geometry = new THREE.ConeGeometry(s * 0.85, s * 1.2, 4);
        break;
      case "tube":
        geometry = buildTubeGeometry();
        break;
      case "vase":
        geometry = buildVaseGeometry();
        break;
      case "helix":
        geometry = buildHelixGeometry();
        break;
      case "heart":
        geometry = buildHeartGeometry();
        break;
      case "star":
        geometry = buildStarGeometry();
        break;
      case "spring":
        geometry = buildSpringGeometry();
        break;
    }

    const material = new THREE.MeshStandardMaterial({
      map: capturedTexture,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    meshGroup.add(mesh);
  }

  const shapeSelect = createSelect("Shape", [
    "sphere", "torus-knot", "cube", "torus", "cylinder",
    "cone", "dodecahedron", "octahedron", "icosahedron", "tetrahedron",
    "ring", "disc", "capsule", "pyramid", "tube",
    "vase", "helix", "heart", "star", "spring",
  ], currentShape, (v) => { currentShape = v; rebuildMesh(); });

  const speedXSlider = createSlider("Rot X", 0, 0.04, speedX, 0.001, (v) => { speedX = v; });
  const speedYSlider = createSlider("Rot Y", 0, 0.04, speedY, 0.001, (v) => { speedY = v; });

  const autoBtn = document.createElement("button");
  autoBtn.textContent = "Auto-Rotate: ON";
  autoBtn.style.cssText = btnCSS("var(--color-primary)", "#fff");
  autoBtn.addEventListener("click", () => {
    autoRotate = !autoRotate;
    autoBtn.textContent = autoRotate ? "Auto-Rotate: ON" : "Auto-Rotate: OFF";
    autoBtn.style.background = autoRotate ? "var(--color-primary)" : "var(--color-surface)";
    autoBtn.style.color = autoRotate ? "#fff" : "var(--color-text)";
    autoBtn.style.border = autoRotate ? "none" : "1px solid var(--color-border)";
  });

  controlsPanel.appendChild(shapeSelect);
  controlsPanel.appendChild(speedXSlider);
  controlsPanel.appendChild(speedYSlider);
  controlsPanel.appendChild(autoBtn);

  let animId;

  function resizeRenderer() {
    const w = canvasBox.clientWidth;
    const h = canvasBox.clientHeight;
    if (w > 0 && h > 0) {
      camera3d.aspect = w / h;
      camera3d.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  }

  const ro = new ResizeObserver(resizeRenderer);
  ro.observe(canvasBox);

  function animate() {
    animId = requestAnimationFrame(animate);
    if (autoRotate) {
      meshGroup.rotation.x += speedX;
      meshGroup.rotation.y += speedY;
    }
    orbitControls.update();
    renderer.render(scene, camera3d);
  }
  animate();

  function takePhotoFromVideo() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 640;
    c.height = video.videoHeight || 480;
    const ctx = c.getContext("2d");
    ctx.drawImage(video, 0, 0);
    boostSaturation(ctx, c.width, c.height, 0.25);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    capturedTexture = tex;
    rebuildMesh();
    captureBtn.textContent = "Captured!";
    setTimeout(() => { captureBtn.textContent = "Capture Photo"; }, 1000);
  }

  function startCamera() {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } } })
      .then((stream) => {
        activeStream = stream;
        video.srcObject = stream;
        video.style.display = "block";
        startCameraBtn.style.display = "none";
        captureBtn.disabled = false;
        captureBtn.style.opacity = "1";
        sourceToggle.style.display = "inline-block";
      })
      .catch((err) => {
        startCameraBtn.textContent = "Camera unavailable";
        startCameraBtn.disabled = true;
        startCameraBtn.style.opacity = "0.5";
        if (usingSample) return;
        if (confirm("Camera not available. Use sample image instead?")) {
          usingSample = true;
          sourceToggle.textContent = "Using sample image";
          sourceToggle.disabled = true;
          sourceToggle.style.opacity = "0.4";
        }
      });
  }

  function stopCamera() {
    if (activeStream) {
      activeStream.getTracks().forEach((t) => t.stop());
      activeStream = null;
    }
    video.srcObject = null;
    video.style.display = "none";
    startCameraBtn.style.display = "inline-block";
    captureBtn.disabled = true;
    captureBtn.style.opacity = "0.4";
    sourceToggle.style.display = "none";
    retakeBtn.style.display = "none";
  }

  startCameraBtn.addEventListener("click", startCamera);
  captureBtn.addEventListener("click", () => {
    if (activeStream && video.readyState >= 2) {
      takePhotoFromVideo();
      retakeBtn.style.display = "inline-block";
    }
  });
  retakeBtn.addEventListener("click", () => {
    if (activeStream) {
      takePhotoFromVideo();
    }
  });

  sourceToggle.addEventListener("click", () => {
    if (usingSample) return;
    usingSample = true;
    stopCamera();
    sourceToggle.textContent = "Using Sample Image";
    sourceToggle.disabled = true;
    sourceToggle.style.opacity = "0.4";
    capturedTexture = createSampleTexture();
    rebuildMesh();
  });

  return () => {
    cancelAnimationFrame(animId);
    ro.disconnect();
    stopCamera();
    renderer.dispose();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = "";
}

function createSlider(label, min, max, val, step, onChange) {
  const group = document.createElement("label");
  group.style.cssText = "display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;color:var(--color-text-muted);";
  const span = document.createElement("span");
  span.textContent = label;
  group.appendChild(span);
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = val;
  input.style.cssText = "width:60px;accent-color:var(--color-primary);";
  group.appendChild(input);
  const valSpan = document.createElement("span");
  valSpan.textContent = val.toFixed(3);
  valSpan.style.cssText = "min-width:1.8rem;text-align:right;";
  group.appendChild(valSpan);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    valSpan.textContent = v.toFixed(3);
    onChange(v);
  });
  return group;
}

function createSelect(label, options, defaultValue, onChange) {
  const group = document.createElement("label");
  group.style.cssText = "display:flex;align-items:center;gap:0.35rem;font-size:0.75rem;color:var(--color-text-muted);";
  const span = document.createElement("span");
  span.textContent = label;
  group.appendChild(span);
  const select = document.createElement("select");
  select.style.cssText =
    "padding:0.25rem 0.4rem;border:1px solid var(--color-border);border-radius:5px;background:var(--color-bg);color:var(--color-text);font-size:0.75rem;outline:none;";
  for (const opt of options) {
    const el = document.createElement("option");
    el.value = opt;
    el.textContent = opt.replace(/-/g, " ");
    if (opt === defaultValue) el.selected = true;
    select.appendChild(el);
  }
  select.addEventListener("change", () => onChange(select.value));
  group.appendChild(select);
  return group;
}

function btnCSS(bg, color) {
  return `padding:0.45rem 1rem;border:none;border-radius:6px;background:${bg};color:${color};font-size:0.82rem;font-weight:600;cursor:pointer;transition:opacity 0.15s;white-space:nowrap;`;
}

function buildTubeGeometry() {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const angle = t * Math.PI * 1.5;
    pts.push(new THREE.Vector3(Math.cos(angle) * 0.8, (t - 0.5) * 1.6, Math.sin(angle) * 0.8));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 48, 0.2, 16, false);
}

function buildVaseGeometry() {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const r = 0.15 + Math.sin(t * Math.PI) * 0.7 + (t > 0.85 ? (t - 0.85) * 3 * 0.25 : 0);
    pts.push(new THREE.Vector2(r, t * 1.4 - 0.7));
  }
  return new THREE.LatheGeometry(pts, 32);
}

function buildHelixGeometry() {
  const pts = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const angle = t * Math.PI * 6;
    pts.push(new THREE.Vector3(Math.cos(angle) * 0.7, (t - 0.5) * 1.6, Math.sin(angle) * 0.7));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 80, 0.12, 12, false);
}

function buildHeartGeometry() {
  const shape = new THREE.Shape();
  const x = 0, y = 0;
  shape.moveTo(x, y + 0.5);
  shape.bezierCurveTo(x - 0.6, y + 0.9, x - 1, y + 0.3, x, y - 0.4);
  shape.bezierCurveTo(x + 1, y + 0.3, x + 0.6, y + 0.9, x, y + 0.5);
  const extrudeSettings = { depth: 0.35, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.05, bevelSegments: 8 };
  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

function buildStarGeometry() {
  const shape = new THREE.Shape();
  const spikes = 5;
  const outerR = 0.9;
  const innerR = 0.35;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const method = i === 0 ? "moveTo" : "lineTo";
    shape[method](Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const extrudeSettings = { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.04, bevelSegments: 6 };
  return new THREE.ExtrudeGeometry(shape, extrudeSettings);
}

function boostSaturation(ctx, w, h, amount) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) continue;
    const s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
    const boosted = Math.min(1, s + amount);
    const hue = rgbToHue(r, g, b, max);
    const [nr, ng, nb] = hslToRgb(hue, boosted, l);
    d[i] = clamp(nr * 255);
    d[i + 1] = clamp(ng * 255);
    d[i + 2] = clamp(nb * 255);
  }
  ctx.putImageData(imageData, 0, 0);
}

function rgbToHue(r, g, b, max) {
  if (max === r) return ((g - b) / (max - Math.min(r, g, b))) * 60;
  if (max === g) return ((b - r) / (max - Math.min(r, g, b))) * 60 + 120;
  return ((r - g) / (max - Math.min(r, g, b))) * 60 + 240;
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 1 / 6) { r = c; g = x; b = 0; }
  else if (h < 2 / 6) { r = x; g = c; b = 0; }
  else if (h < 3 / 6) { r = 0; g = c; b = x; }
  else if (h < 4 / 6) { r = 0; g = x; b = c; }
  else if (h < 5 / 6) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [r + m, g + m, b + m];
}

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function buildSpringGeometry() {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const angle = t * Math.PI * 10;
    const r = 0.65 + Math.sin(angle * 2) * 0.06;
    pts.push(new THREE.Vector3(Math.cos(angle) * r, (t - 0.5) * 1.8, Math.sin(angle) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, 100, 0.1, 10, false);
}
