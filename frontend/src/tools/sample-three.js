import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const name = '3D Demo';
export const description = 'Interactive 3D scene with a rotating torus knot and adjustable controls';

export function init(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'tool-three-wrapper';
  wrapper.style.cssText = 'display:flex;flex-direction:column;height:100%;';
  container.appendChild(wrapper);

  const canvasBox = document.createElement('div');
  canvasBox.style.cssText = 'flex:1;position:relative;min-height:0;';
  wrapper.appendChild(canvasBox);

  const controlsPanel = document.createElement('div');
  controlsPanel.className = 'tool-three-controls';
  controlsPanel.style.cssText =
    'padding:0.75rem 1rem;background:var(--color-surface);border-top:1px solid var(--color-border);display:flex;flex-wrap:wrap;gap:0.75rem;align-items:center;';
  wrapper.appendChild(controlsPanel);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const camera = new THREE.PerspectiveCamera(45, canvasBox.clientWidth / canvasBox.clientHeight || 1, 0.1, 100);
  camera.position.set(4, 3, 6);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvasBox.clientWidth, canvasBox.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  canvasBox.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0x404060);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const fillLight = new THREE.DirectionalLight(0x4488ff, 0.4);
  fillLight.position.set(-3, 1, -5);
  scene.add(fillLight);

  const geometry = new THREE.TorusKnotGeometry(1, 0.3, 128, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0x7b2ff7,
    roughness: 0.3,
    metalness: 0.6,
    emissive: 0x220066,
    emissiveIntensity: 0.15,
    wireframe: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const wireGeom = new THREE.TorusKnotGeometry(1.01, 0.3, 64, 8);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x00ccff,
    wireframe: true,
    transparent: true,
    opacity: 0.08,
  });
  const wireMesh = new THREE.Mesh(wireGeom, wireMat);
  scene.add(wireMesh);

  const gridHelper = new THREE.GridHelper(6, 12, 0x444488, 0x333366);
  scene.add(gridHelper);

  let speedX = 0.01;
  let speedY = 0.02;
  let autoRotate = true;
  let showWireframe = false;

  const speedXSlider = createSlider('Rot X Speed', 0, 0.05, speedX, 0.001, (v) => { speedX = v; });
  const speedYSlider = createSlider('Rot Y Speed', 0, 0.05, speedY, 0.001, (v) => { speedY = v; });

  const wireBtn = document.createElement('button');
  wireBtn.textContent = 'Toggle Wireframe';
  wireBtn.style.cssText =
    'padding:0.35rem 0.75rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);cursor:pointer;font-size:0.8rem;';
  wireBtn.addEventListener('click', () => {
    showWireframe = !showWireframe;
    material.wireframe = showWireframe;
    wireMesh.visible = !showWireframe;
  });

  const autoBtn = document.createElement('button');
  autoBtn.textContent = 'Auto-Rotate: ON';
  autoBtn.style.cssText = wireBtn.style.cssText + ';background:var(--color-primary);color:#fff;border-color:var(--color-primary);';
  autoBtn.addEventListener('click', () => {
    autoRotate = !autoRotate;
    autoBtn.textContent = autoRotate ? 'Auto-Rotate: ON' : 'Auto-Rotate: OFF';
    autoBtn.style.background = autoRotate ? 'var(--color-primary)' : 'var(--color-surface)';
    autoBtn.style.color = autoRotate ? '#fff' : 'var(--color-text)';
  });

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset View';
  resetBtn.style.cssText = wireBtn.style.cssText;
  resetBtn.addEventListener('click', () => {
    camera.position.set(4, 3, 6);
    controls.target.set(0, 0, 0);
    controls.update();
  });

  controlsPanel.appendChild(speedXSlider);
  controlsPanel.appendChild(speedYSlider);
  controlsPanel.appendChild(wireBtn);
  controlsPanel.appendChild(autoBtn);
  controlsPanel.appendChild(resetBtn);

  let animId;

  function resize() {
    const w = canvasBox.clientWidth;
    const h = canvasBox.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvasBox);

  function animate() {
    animId = requestAnimationFrame(animate);
    if (autoRotate) {
      mesh.rotation.x += speedX;
      mesh.rotation.y += speedY;
      wireMesh.rotation.x = mesh.rotation.x;
      wireMesh.rotation.y = mesh.rotation.y;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  return () => {
    cancelAnimationFrame(animId);
    ro.disconnect();
    renderer.dispose();
    geometry.dispose();
    material.dispose();
    wireGeom.dispose();
    wireMat.dispose();
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = '';
}

function createSlider(label, min, max, val, step, onChange) {
  const group = document.createElement('label');
  group.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:var(--color-text-muted);';

  const span = document.createElement('span');
  span.textContent = label;
  group.appendChild(span);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = val;
  input.style.cssText = 'width:70px;accent-color:var(--color-primary);';
  group.appendChild(input);

  const valSpan = document.createElement('span');
  valSpan.textContent = val.toFixed(3);
  valSpan.style.cssText = 'min-width:2.5rem;text-align:right;';
  group.appendChild(valSpan);

  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valSpan.textContent = v.toFixed(3);
    onChange(v);
  });

  return group;
}
