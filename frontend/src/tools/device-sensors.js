import L from "leaflet";

export const icon = "📡";
export const name = "Device Sensors";
export const description = "Read live data from your device's available sensors with permission prompts";

export function init(container) {
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;flex-direction:column;height:100%;padding:1.25rem;gap:1rem;overflow-y:auto;";
  container.appendChild(wrapper);

  const title = document.createElement("h2");
  title.textContent = "Device Sensors";
  title.style.cssText = "margin:0;font-size:1.1rem;font-weight:600;color:var(--color-text);";
  wrapper.appendChild(title);

  const status = document.createElement("div");
  status.style.cssText = "font-size:0.82rem;color:var(--color-text-muted);";
  wrapper.appendChild(status);

  const list = document.createElement("div");
  list.style.cssText = "display:flex;flex-direction:column;gap:0.75rem;";
  wrapper.appendChild(list);

  const sensors = [
    {
      id: "accelerometer",
      label: "Accelerometer",
      desc: "Device motion in m/s² on X, Y, Z axes",
      permissionName: "accelerometer",
      SensorClass: window.Accelerometer,
      unit: "m/s²",
      readingKeys: ["x", "y", "z"],
    },
    {
      id: "gyroscope",
      label: "Gyroscope",
      desc: "Angular velocity in rad/s around X, Y, Z axes",
      permissionName: "gyroscope",
      SensorClass: window.Gyroscope,
      unit: "rad/s",
      readingKeys: ["x", "y", "z"],
    },
    {
      id: "magnetometer",
      label: "Magnetometer",
      desc: "Magnetic field in µT (compass direction)",
      permissionName: "magnetometer",
      SensorClass: window.Magnetometer,
      unit: "µT",
      readingKeys: ["x", "y", "z"],
    },
    {
      id: "ambient-light",
      label: "Ambient Light",
      desc: "Ambient light level in lux",
      permissionName: "ambient-light-sensor",
      SensorClass: window.AmbientLightSensor,
      unit: "lux",
      readingKeys: ["illuminance"],
    },
    {
      id: "orientation",
      label: "Device Orientation",
      desc: "Physical orientation (alpha/beta/gamma) in degrees",
      permissionName: "device-orientation",
      SensorClass: null,
      unit: "°",
      readingKeys: ["alpha", "beta", "gamma"],
    },
    {
      id: "motion",
      label: "Device Motion",
      desc: "Acceleration including gravity in m/s²",
      permissionName: "device-motion",
      SensorClass: null,
      unit: "m/s²",
      readingKeys: ["x", "y", "z"],
    },
    {
      id: "geolocation",
      label: "Geolocation",
      desc: "GPS position — latitude, longitude, altitude",
      permissionName: "geolocation",
      SensorClass: null,
      unit: "",
      readingKeys: ["latitude", "longitude", "altitude"],
    },
  ];

  const activeSensors = {};
  const activeWatchers = {};
  const cards = {};

  for (const sensor of sensors) {
    const card = createSensorCard(sensor);
    list.appendChild(card.card);
    cards[sensor.id] = card;
  }

  function createSensorCard(sensor) {
    const card = document.createElement("div");
    card.style.cssText =
      "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);overflow:hidden;";

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;padding:0.65rem 0.85rem;gap:0.5rem;";

    const info = document.createElement("div");
    info.style.cssText = "display:flex;flex-direction:column;flex:1;min-width:0;";

    const name = document.createElement("span");
    name.textContent = sensor.label;
    name.style.cssText = "font-size:0.88rem;font-weight:600;color:var(--color-text);";

    const desc = document.createElement("span");
    desc.textContent = sensor.desc;
    desc.style.cssText = "font-size:0.73rem;color:var(--color-text-muted);margin-top:1px;";

    info.appendChild(name);
    info.appendChild(desc);

    const btn = document.createElement("button");
    btn.textContent = "Request Permission";
    btn.style.cssText =
      "flex-shrink:0;padding:0.35rem 0.7rem;border:none;border-radius:6px;font-size:0.75rem;font-weight:600;cursor:pointer;background:var(--color-primary);color:#fff;white-space:nowrap;transition:opacity 0.15s;";
    btn.addEventListener("click", () => requestSensor(sensor, btn, body));

    header.appendChild(info);
    header.appendChild(btn);

    const body = document.createElement("div");
    body.style.cssText =
      "padding:0.65rem 0.85rem;border-top:1px solid var(--color-border);font-size:0.82rem;color:var(--color-text-muted);display:none;";

    const notAvailable = document.createElement("div");
    notAvailable.style.cssText = "display:none;padding:0.65rem 0.85rem;border-top:1px solid var(--color-border);font-size:0.78rem;color:#e74c3c;";
    notAvailable.textContent = "This sensor is not available on your device or browser.";

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(notAvailable);

    return { card, body, btn, notAvailable, sensor };
  }

  async function requestSensor(sensor, btn, body) {
    btn.disabled = true;
    btn.style.opacity = "0.5";
    btn.textContent = "Requesting...";

    try {
      if (sensor.id === "orientation" || sensor.id === "motion") {
        await requestDeviceMotion(sensor, btn, body);
        return;
      }
      if (sensor.id === "geolocation") {
        await requestGeolocation(sensor, btn, body);
        return;
      }

      if (!sensor.SensorClass) {
        showUnavailable(sensor);
        return;
      }

      const perm = await navigator.permissions.query({ name: sensor.permissionName }).catch(() => null);
      if (perm && perm.state === "denied") {
        btn.textContent = "Permission Denied";
        btn.style.background = "#e74c3c";
        return;
      }

      if (perm && perm.state === "prompt") {
        const sensorInstance = new sensor.SensorClass({ frequency: 30 });
        sensorInstance.addEventListener("activate", () => {
          btn.textContent = "Active";
          btn.style.background = "#2ecc71";
          body.style.display = "block";
          activeSensors[sensor.id] = sensorInstance;
          sensorInstance.addEventListener("reading", () => {
            body.textContent = formatReading(sensor, sensorInstance);
          });
        });
        sensorInstance.addEventListener("error", (err) => {
          if (err.error.name === "SecurityError") {
            btn.textContent = "Permission Denied";
            btn.style.background = "#e74c3c";
          } else {
            showUnavailable(sensor);
          }
        });
        sensorInstance.start();
        setTimeout(() => {
          if (!activeSensors[sensor.id]) {
            showUnavailable(sensor);
          }
        }, 2000);
        return;
      }

      if (perm && perm.state === "granted") {
        const sensorInstance = new sensor.SensorClass({ frequency: 30 });
        sensorInstance.addEventListener("activate", () => {
          btn.textContent = "Active";
          btn.style.background = "#2ecc71";
          body.style.display = "block";
          activeSensors[sensor.id] = sensorInstance;
          sensorInstance.addEventListener("reading", () => {
            body.textContent = formatReading(sensor, sensorInstance);
          });
        });
        sensorInstance.addEventListener("error", () => showUnavailable(sensor));
        sensorInstance.start();
        return;
      }

      showUnavailable(sensor);
    } catch (e) {
      showUnavailable(sensor);
    } finally {
      btn.disabled = false;
    }
  }

  async function requestDeviceMotion(sensor, btn, body) {
    try {
      if (sensor.id === "orientation" && DeviceOrientationEvent.requestPermission) {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state !== "granted") {
          btn.textContent = "Permission Denied";
          btn.style.background = "#e74c3c";
          return;
        }
      }
      if (sensor.id === "motion" && DeviceMotionEvent.requestPermission) {
        const state = await DeviceMotionEvent.requestPermission();
        if (state !== "granted") {
          btn.textContent = "Permission Denied";
          btn.style.background = "#e74c3c";
          return;
        }
      }

      const eventName = sensor.id === "orientation" ? "deviceorientation" : "devicemotion";
      const handler = (e) => {
        btn.textContent = "Active";
        btn.style.background = "#2ecc71";
        body.style.display = "block";
        if (sensor.id === "orientation") {
          body.textContent =
            `alpha: ${(e.alpha || 0).toFixed(1)}°\nbeta:  ${(e.beta || 0).toFixed(1)}°\ngamma: ${(e.gamma || 0).toFixed(1)}°`;
        } else {
          const acc = e.accelerationIncludingGravity || e.acceleration || {};
          body.textContent =
            `x: ${(acc.x || 0).toFixed(2)} m/s²\ny: ${(acc.y || 0).toFixed(2)} m/s²\nz: ${(acc.z || 0).toFixed(2)} m/s²`;
        }
      };

      window.addEventListener(eventName, handler);
      activeWatchers[sensor.id] = () => window.removeEventListener(eventName, handler);

      btn.textContent = "Active";
      btn.style.background = "#2ecc71";
      body.style.display = "block";
    } catch {
      showUnavailable(sensor);
    }
  }

  function requestGeolocation(sensor, btn, body) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.textContent = "Active";
        btn.style.background = "#2ecc71";
        body.style.display = "block";
        body.innerHTML = "";

        const c = pos.coords;
        const coordsEl = document.createElement("div");
        coordsEl.style.cssText = "font-family:monospace;white-space:pre-wrap;line-height:1.6;font-size:0.82rem;color:var(--color-text-muted);";
        coordsEl.textContent =
          `latitude:  ${c.latitude}\nlongitude: ${c.longitude}\naltitude:  ${c.altitude ?? "N/A"} m\naccuracy:  ${c.accuracy} m`;
        body.appendChild(coordsEl);

        const mapEl = document.createElement("div");
        mapEl.style.cssText = "height:200px;margin-top:0.65rem;border-radius:6px;overflow:hidden;";
        body.appendChild(mapEl);

        setTimeout(() => {
          const map = L.map(mapEl, {
            center: [c.latitude, c.longitude],
            zoom: 5,
            attributionControl: false,
            zoomControl: true,
          });
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
          }).addTo(map);
          L.marker([c.latitude, c.longitude]).addTo(map)
            .bindPopup(`<b>You are here</b><br>${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)}`);
          activeWatchers.geolocation = () => { map.remove(); };
        }, 100);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          btn.textContent = "Permission Denied";
          btn.style.background = "#e74c3c";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          showUnavailable(sensor);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function showUnavailable(sensor) {
    const card = cards[sensor.id];
    if (!card) return;
    card.notAvailable.style.display = "block";
    card.body.style.display = "none";
    card.btn.style.display = "none";
  }

  updateStatus();

  function updateStatus() {
    const total = sensors.length;
    const available = sensors.filter((s) => {
      if (s.id === "orientation") return true;
      if (s.id === "motion") return true;
      if (s.id === "geolocation") return true;
      return !!s.SensorClass;
    }).length;
    status.textContent = `${available} of ${total} sensors available on this device`;
  }

  return () => {
    for (const id of Object.keys(activeSensors)) {
      try { activeSensors[id].stop(); } catch {}
    }
    for (const id of Object.keys(activeWatchers)) {
      try { activeWatchers[id](); } catch {}
    }
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = "";
}

function formatReading(sensor, instance) {
  return sensor.readingKeys
    .map((k) => {
      const val = instance[k];
      if (val == null) return `${k}: N/A`;
      return `${k}: ${typeof val === "number" ? val.toFixed(2) : val}${sensor.unit ? " " + sensor.unit : ""}`;
    })
    .join("\n");
}
