import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings as SettingsIcon, ArrowRight, Palette, Save, Trash2,
  ArrowUp, ArrowDown, RotateCcw, Check, Wifi, WifiOff,
  Eye, EyeOff, Lock, Unlock,
} from "lucide-react";
import { getPref, setPref, clearAllPrefs } from "../services/db";
import { setAirplaneMode } from "../services/api";
import "./Settings.css";

const TABS = [
  { path: "/", label: "Home" },
  { path: "/import", label: "Import" },
  { path: "/gallery", label: "Imported Media" },
  { path: "/explorer", label: "Explorer" },
  { path: "/favorites", label: "Favorites" },
  { path: "/upload", label: "Upload" },
  { path: "/map", label: "Map" },
  { path: "/locations", label: "Locations" },
  { path: "/faces", label: "Faces" },
  { path: "/duplicates", label: "Duplicates" },
  { path: "/statistics", label: "Statistics" },
  { path: "/tools", label: "Tools" },
  { path: "/about", label: "About" },
  { path: "/settings", label: "Settings" },
];

const DEFAULT_IMAGE_TABS = ["filters", "adjust", "light", "effects", "details", "colors", "info", "crop"];
const DEFAULT_VIDEO_TABS = ["trim", "adjust", "filters", "text", "effects", "crop"];
const TAB_LABELS = { trim: "Trim", adjust: "Adjust", filters: "Filters", text: "Text", effects: "Effects", crop: "Crop", light: "Light", details: "Details", info: "Info", colors: "Colors" };

const COLUMN_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "1", label: "1 column" },
  { value: "2", label: "2 columns" },
];

const ACCENT_COLORS = [
  { name: "Blue", value: "#3498db" },
  { name: "Green", value: "#2ecc71" },
  { name: "Purple", value: "#9b59b6" },
  { name: "Red", value: "#e74c3c" },
  { name: "Orange", value: "#f39c12" },
  { name: "Teal", value: "#1abc9c" },
  { name: "Pink", value: "#e84393" },
  { name: "Yellow", value: "#f1c40f" },
];

function Settings() {
  const [defaultTab, setDefaultTab] = useState("/");
  const [accentColor, setAccentColor] = useState("#3498db");
  const [columns, setColumnsState] = useState("auto");
  const [savedNickname, setSavedNickname] = useState("");
  const [cacheStatus, setCacheStatus] = useState("idle");
  const [imageTabs, setImageTabs] = useState(DEFAULT_IMAGE_TABS);
  const [videoTabs, setVideoTabs] = useState(DEFAULT_VIDEO_TABS);
  const [navTabs, setNavTabs] = useState(TABS.map((t) => t.path));
  const [airplaneModeState, setAirplaneModeState] = useState(false);
  const [mapZoomLevel, setMapZoomLevel] = useState(18);
  const [facesPerPage, setFacesPerPage] = useState(15);
  const [facesPerPageSaved, setFacesPerPageSaved] = useState(false);
  const [hiddenPinInput, setHiddenPinInput] = useState("");
  const [hiddenUnlocked, setHiddenUnlocked] = useState(false);
  const [hiddenPinError, setHiddenPinError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    getPref("defaultTab", "/").then(setDefaultTab);
    getPref("accentColor", "#3498db").then(setAccentColor);
    getPref("homeColumns", "auto").then(setColumnsState);
    getPref("nickname", "").then(setSavedNickname);
    getPref("imageEditTabs", null).then((s) => setImageTabs(s || DEFAULT_IMAGE_TABS));
    getPref("videoEditTabs", null).then((s) => setVideoTabs(s || DEFAULT_VIDEO_TABS));
    getPref("navbarTabOrder", null).then((order) => {
      if (order && Array.isArray(order) && order.length > 0) setNavTabs(order);
    });
    getPref("mapZoomLevel", 18).then(setMapZoomLevel);
    getPref("facesPerPage", 15).then(setFacesPerPage);
    getPref("airplaneMode", false).then((v) => {
      setAirplaneModeState(v);
      setAirplaneMode(v);
    });
    const saved = sessionStorage.getItem("hidden_pin_unlocked");
    setHiddenUnlocked(saved === "true");
  }, []);

  const handleMoveTab = (type, idx, dir) => {
    const setter = type === "image" ? setImageTabs : setVideoTabs;
    const key = type === "image" ? "imageEditTabs" : "videoEditTabs";
    setter((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      setPref(key, next);
      return next;
    });
  };

  const handleResetTabs = (type) => {
    const def = type === "image" ? DEFAULT_IMAGE_TABS : DEFAULT_VIDEO_TABS;
    const key = type === "image" ? "imageEditTabs" : "videoEditTabs";
    const setter = type === "image" ? setImageTabs : setVideoTabs;
    setter(def);
    setPref(key, def);
  };

  const handleMoveNavTab = (idx, dir) => {
    setNavTabs((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      setPref("navbarTabOrder", next);
      return next;
    });
  };

  const handleResetNavTabs = () => {
    const def = TABS.map((t) => t.path);
    setNavTabs(def);
    setPref("navbarTabOrder", def);
  };

  const [mapZoomSaved, setMapZoomSaved] = useState(false);

  const handleMapZoomChange = (e) => {
    setMapZoomLevel(Number(e.target.value));
    setMapZoomSaved(false);
  };

  const handleMapZoomSave = () => {
    setPref("mapZoomLevel", mapZoomLevel);
    setMapZoomSaved(true);
    setTimeout(() => setMapZoomSaved(false), 2000);
  };

  const handleFacesPerPageSave = () => {
    setPref("facesPerPage", facesPerPage);
    setFacesPerPageSaved(true);
    setTimeout(() => setFacesPerPageSaved(false), 2000);
  };

  const handleTabChange = (e) => {
    const val = e.target.value;
    setDefaultTab(val);
    setPref("defaultTab", val);
  };

  const handleAccentChange = (color) => {
    setAccentColor(color);
    setPref("accentColor", color);
    document.documentElement.style.setProperty("--color-primary", color);
  };

  const setColumns = (val) => {
    setColumnsState(val);
    setPref("homeColumns", val);
  };

  const handleNicknameSave = () => {
    setPref("nickname", savedNickname.trim());
  };

  const handleClearCache = async () => {
    if (!("serviceWorker" in navigator)) {
      setCacheStatus("no-sw");
      return;
    }
    setCacheStatus("clearing");
    try {
      await clearAllPrefs();
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({ type: "CLEAR_CACHES" });
      } else {
        setCacheStatus("no-sw");
      }
    } catch {
      setCacheStatus("no-sw");
    }
  };

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data.type === "CACHES_CLEARED") {
        setCacheStatus("done");
        setTimeout(() => setCacheStatus("idle"), 2000);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  const handleHiddenPinUnlock = async () => {
    const pin = hiddenPinInput.trim();
    if (pin.length !== 6) {
      setHiddenPinError(true);
      return;
    }
    try {
      const { verifyHiddenPin } = await import("../services/api");
      await verifyHiddenPin(pin);
      sessionStorage.setItem("hidden_pin", pin);
      sessionStorage.setItem("hidden_pin_unlocked", "true");
      setHiddenUnlocked(true);
      setHiddenPinError(false);
      setHiddenPinInput("");
      window.dispatchEvent(new Event("hidden-pin-changed"));
    } catch {
      setHiddenPinError(true);
    }
  };

  const handleHiddenPinLock = () => {
    sessionStorage.removeItem("hidden_pin");
    sessionStorage.removeItem("hidden_pin_unlocked");
    setHiddenUnlocked(false);
    setHiddenPinInput("");
    window.dispatchEvent(new Event("hidden-pin-changed"));
  };

  return (
    <div className="settings">
      <h2 className="settings__title"><SettingsIcon size={20} /> Settings</h2>

      <div className="settings__card">
        <h3 className="settings__label">Accent Color</h3>
        <p className="settings__desc">Choose the accent color used across the site.</p>
        <div className="settings__colors">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.value}
              className={`settings__color-btn ${accentColor === c.value ? "settings__color-btn--active" : ""}`}
              style={{ background: c.value }}
              onClick={() => handleAccentChange(c.value)}
              title={c.name}
            />
          ))}
          <label
            className={`settings__color-btn settings__color-picker ${!ACCENT_COLORS.some((c) => c.value === accentColor) ? "settings__color-btn--active" : ""}`}
            title="Custom color"
          >
            <input
              type="color"
              value={ACCENT_COLORS.some((c) => c.value === accentColor) ? "#3498db" : accentColor}
              onChange={(e) => handleAccentChange(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Airplane Mode</h3>
        <p className="settings__desc">
          When enabled, the app skips all external API calls (AI metadata generation, reverse geocoding).
          Local operations (import, browsing, face detection, thumbnail generation) continue to work.
        </p>
        <button
          className={`settings__airplane-btn ${airplaneModeState ? "settings__airplane-btn--on" : ""}`}
          onClick={() => {
            const next = !airplaneModeState;
            setAirplaneModeState(next);
            setPref("airplaneMode", next);
            setAirplaneMode(next);
          }}
        >
          {airplaneModeState ? <WifiOff size={16} /> : <Wifi size={16} />}
          {airplaneModeState ? "Airplane Mode ON" : "Airplane Mode OFF"}
        </button>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Hidden Files</h3>
        <p className="settings__desc">
          Enter the 6-digit PIN to unlock the Hidden Files tab. The PIN is set in the backend configuration.
        </p>
        <div className="settings__nickname-row">
          <input
            className="settings__input"
            type="password"
            maxLength={6}
            placeholder="Enter 6-digit PIN"
            value={hiddenPinInput}
            onChange={(e) => { setHiddenPinInput(e.target.value); setHiddenPinError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleHiddenPinUnlock(); }}
            style={{ width: "160px", letterSpacing: "0.25em", fontSize: "1.1rem" }}
          />
          {hiddenUnlocked ? (
            <button className="settings__btn" onClick={handleHiddenPinLock}>
              <Lock size={14} /> Lock
            </button>
          ) : (
            <button className="settings__btn" onClick={handleHiddenPinUnlock}>
              <Unlock size={14} /> Unlock
            </button>
          )}
        </div>
        {hiddenPinError && (
          <p style={{ color: "var(--color-danger, #e74c3c)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
            Invalid PIN. Check the backend HIDDEN_FILES_PIN setting.
          </p>
        )}
        {hiddenUnlocked && (
          <p style={{ color: "var(--color-success, #2ecc71)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
            <Check size={12} style={{ verticalAlign: "middle" }} /> Hidden Files tab is now visible in the navbar.
          </p>
        )}
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Home columns</h3>
        <p className="settings__desc">
          On mobile: choose 1 or 2 columns. On desktop: Auto fits 90% screen width with dynamic columns.
        </p>
        <div className="settings__column-btns">
          {COLUMN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`settings__column-btn ${columns === opt.value ? "settings__column-btn--active" : ""}`}
              onClick={() => setColumns(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Default Nickname</h3>
        <p className="settings__desc">
          Set a default nickname that will be pre-filled on the Upload page.
        </p>
        <div className="settings__nickname-row">
          <input
            className="settings__input"
            type="text"
            placeholder="Enter your nickname"
            value={savedNickname}
            onChange={(e) => setSavedNickname(e.target.value)}
          />
          <button className="settings__btn" onClick={handleNicknameSave}>
            <Save size={14} /> Save
          </button>
        </div>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Offline Cache</h3>
        <p className="settings__desc">
          Clear all cached files and data. The app will re-fetch everything from the server on next request.
        </p>
        <div className="settings__cache-row">
          <button className="settings__btn settings__btn--danger" onClick={handleClearCache} disabled={cacheStatus === "clearing"}>
            <Trash2 size={14} /> {cacheStatus === "clearing" ? "Clearing..." : "Clear Cache"}
          </button>
          {cacheStatus === "done" && <span className="settings__cache-ok">&checkmark; Cleared!</span>}
          {cacheStatus === "no-sw" && <span className="settings__cache-err">Service worker not available</span>}
        </div>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Map Zoom Level</h3>
        <p className="settings__desc">
          Zoom depth when clicking "Zoom In" on a map pin. Higher values zoom closer (10–19).
        </p>
        <div className="settings__map-zoom-row">
          <input type="range" className="settings__map-zoom-slider" min={10} max={19} value={mapZoomLevel} onChange={handleMapZoomChange} />
          <span className="settings__map-zoom-value">{mapZoomLevel}</span>
          <button className="settings__btn" onClick={handleMapZoomSave}>
            {mapZoomSaved ? <Check size={14} /> : <Save size={14} />} {mapZoomSaved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Faces Per Page</h3>
        <p className="settings__desc">
          Number of media thumbnails to load per page in the face dialog (3–50).
        </p>
        <div className="settings__nickname-row">
          <input
            className="settings__input"
            type="number"
            min={3}
            max={50}
            value={facesPerPage}
            onChange={(e) => setFacesPerPage(Number(e.target.value))}
          />
          <button className="settings__btn" onClick={handleFacesPerPageSave}>
            {facesPerPageSaved ? <Check size={14} /> : <Save size={14} />} {facesPerPageSaved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Image Editor Tab Order</h3>
        <p className="settings__desc">Reorder the tabs shown in the image editor.</p>
        <div className="settings__tabs-list">
          {imageTabs.map((tabId, i) => (
            <div key={tabId} className="settings__tab-row">
              <span className="settings__tab-name">{TAB_LABELS[tabId] || tabId}</span>
              <div className="settings__tab-arrows">
                <button className="settings__tab-btn" disabled={i === 0} onClick={() => handleMoveTab("image", i, -1)} title="Move up"><ArrowUp size={13} /></button>
                <button className="settings__tab-btn" disabled={i === imageTabs.length - 1} onClick={() => handleMoveTab("image", i, 1)} title="Move down"><ArrowDown size={13} /></button>
              </div>
            </div>
          ))}
        </div>
        <button className="settings__btn settings__btn--small" onClick={() => handleResetTabs("image")}>Reset to defaults</button>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Video Editor Tab Order</h3>
        <p className="settings__desc">Reorder the tabs shown in the video editor.</p>
        <div className="settings__tabs-list">
          {videoTabs.map((tabId, i) => (
            <div key={tabId} className="settings__tab-row">
              <span className="settings__tab-name">{TAB_LABELS[tabId] || tabId}</span>
              <div className="settings__tab-arrows">
                <button className="settings__tab-btn" disabled={i === 0} onClick={() => handleMoveTab("video", i, -1)} title="Move up"><ArrowUp size={13} /></button>
                <button className="settings__tab-btn" disabled={i === videoTabs.length - 1} onClick={() => handleMoveTab("video", i, 1)} title="Move down"><ArrowDown size={13} /></button>
              </div>
            </div>
          ))}
        </div>
        <button className="settings__btn settings__btn--small" onClick={() => handleResetTabs("video")}>Reset to defaults</button>
      </div>

      <div className="settings__card">
        <h3 className="settings__label">Navbar Tab Order</h3>
        <p className="settings__desc">Reorder the tabs shown in the navigation bar.</p>
        <div className="settings__tabs-list">
          {navTabs.map((path, i) => {
            const tab = TABS.find((t) => t.path === path);
            if (!tab) return null;
            return (
              <div key={path} className="settings__tab-row">
                <span className="settings__tab-name">{tab.label}</span>
                <div className="settings__tab-arrows">
                  <button className="settings__tab-btn" disabled={i === 0} onClick={() => handleMoveNavTab(i, -1)} title="Move left"><ArrowUp size={13} /></button>
                  <button className="settings__tab-btn" disabled={i === navTabs.length - 1} onClick={() => handleMoveNavTab(i, 1)} title="Move right"><ArrowDown size={13} /></button>
                </div>
              </div>
            );
          })}
        </div>
        <button className="settings__btn settings__btn--small" onClick={handleResetNavTabs}><RotateCcw size={13} /> Reset to defaults</button>
      </div>

      <div className="settings__card">
        <label className="settings__label">Default landing tab</label>
        <p className="settings__desc">
          Choose which page to show when you visit the site. The new tab will apply on your next visit.
        </p>
        <select
          className="settings__select"
          value={defaultTab}
          onChange={handleTabChange}
        >
          {TABS.map((t) => (
            <option key={t.path} value={t.path}>{t.label}</option>
          ))}
        </select>
        <button
          className="settings__btn"
          onClick={() => navigate(defaultTab)}
        >
          <ArrowRight size={14} /> Go to {TABS.find((t) => t.path === defaultTab)?.label}
        </button>
      </div>
    </div>
  );
}

export default Settings;