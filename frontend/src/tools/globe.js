import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export const name = "3D Globe Explorer";
export const description = "Interactive 3D Earth viewer with detailed map textures, orbit controls, and reverse geocoding.";

export function init(container) {
  container.style.overflow = "auto";
  const mainContainer = document.createElement("div");
  mainContainer.style.cssText = "display:flex;width:100%;height:100%;min-width:0;background:var(--color-bg);position:relative;font-family:system-ui,-apple-system,sans-serif;";
  container.appendChild(mainContainer);

  const sidebar = document.createElement("div");
  sidebar.style.cssText = "display:flex;flex-direction:column;width:300px;border-right:1px solid var(--color-border);background:var(--color-surface);overflow-y:auto;flex-shrink:0;padding:1rem;gap:1rem;";
  mainContainer.appendChild(sidebar);

  const canvasContainer = document.createElement("div");
  canvasContainer.style.cssText = "flex:1;position:relative;min-width:0;";
  mainContainer.appendChild(canvasContainer);

  const detailsContainer = document.createElement("div");
  detailsContainer.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);padding:0.75rem;background:var(--color-bg);color:var(--color-text-muted);font-size:0.82rem;";
  detailsContainer.textContent = "Click on the globe to inspect a location.";
  sidebar.appendChild(detailsContainer);

  let scene, camera, renderer, globeMesh, controls;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function initThree() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 100);
    camera.position.z = 2.5;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    canvasContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);

    const textureLoader = new THREE.TextureLoader();
    // Using a more detailed OpenStreetMap-style base map texture
    const texture = textureLoader.load('https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/world.topo.bathy.200407.3x5400x2700.jpg');

    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const material = new THREE.MeshStandardMaterial({ map: texture, bumpScale: 0.05 });
    globeMesh = new THREE.Mesh(geometry, material);
    scene.add(globeMesh);

    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5, 3, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
  }

  async function fetchLocationDetails(lat, lng) {
    detailsContainer.textContent = "Loading...";
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10`);
      const data = await response.json();
      if (data.error) {
        detailsContainer.textContent = "No location found here.";
        return;
      }
      detailsContainer.innerHTML = `
        <div style="font-weight:600;margin-bottom:0.5rem;color:var(--color-text)">${data.display_name}</div>
        <div style="font-size:0.75rem; margin-top: 0.5rem">Lat: ${lat.toFixed(3)}, Lng: ${lng.toFixed(3)}</div>
        <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=10/${lat}/${lng}" target="_blank" style="color:var(--color-primary);font-size:0.75rem;margin-top:0.5rem;display:block;">View on OpenStreetMap</a>
      `;
    } catch (e) {
      detailsContainer.textContent = "Error fetching details.";
    }
  }

  canvasContainer.addEventListener("click", (event) => {
    const rect = canvasContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(globeMesh);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      // Convert Cartesian to spherical coordinates
      const lat = THREE.MathUtils.radToDeg(Math.asin(point.y));
      const lng = THREE.MathUtils.radToDeg(Math.atan2(point.z, point.x));
      fetchLocationDetails(lat, lng);
    }
  });

  initThree();
  return () => { 
    renderer.dispose(); 
    controls.dispose();
  };
}

export function destroy(container) {
  container.innerHTML = "";
}