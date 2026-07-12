import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight, Save, Trash2, ArrowUp, ArrowDown, RotateCcw,
  Check, Wifi, WifiOff, Lock, Unlock, ExternalLink, Copy, GripVertical, Smartphone,
} from "lucide-react";
import { getPref, setPref, clearApiCache, getStorageEstimate } from "../services/db";
import Spinner from "../components/Spinner";
import { setAirplaneMode } from "../services/api";
import { useTheme } from "../contexts/ThemeContext";
import { SETTINGS } from "../config/settings";
import shortcuts from "../data/shortcuts.yaml";
import SettingsDialog from "../components/SettingsDialog";
import "./Settings.css";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

const TABS = [
  { path: "/", label: "Home" },
  { path: "/import", label: "Import Media" },
  { path: "/explorer", label: "Explorer" },
  { path: "/favorites", label: "Favorites" },
  { path: "/upload", label: "Upload" },
  { path: "/map", label: "Map" },
  { path: "/locations", label: "Locations" },
  { path: "/faces", label: "Faces" },
  { path: "/collections", label: "Collections" },
  { path: "/timeline", label: "Timeline" },
  { path: "/duplicates", label: "Duplicates" },
  { path: "/statistics", label: "Statistics" },
  { path: "/tools", label: "Tools" },
  { path: "/settings", label: "Settings" },
  { path: "/about", label: "About" },
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
  const { style, mode, setStyle, setMode } = useTheme();
  const [openDialog, setOpenDialog] = useState(null);

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
  const [storageUsed, setStorageUsed] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [mapZoomSaved, setMapZoomSaved] = useState(false);
  const [settingsOrder, setSettingsOrder] = useState(SETTINGS.map((s) => s.id));
  const [settingsDragIdx, setSettingsDragIdx] = useState(null);
  const [settingsDropIdx, setSettingsDropIdx] = useState(null);
  const [cacheBreakdown, setCacheBreakdown] = useState(null);
  const [clearingCache, setClearingCache] = useState(null);
  const [orientationLock, setOrientationLock] = useState(false);
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
    getStorageEstimate().then(setStorageUsed);
    getPref("settingsOrder", null).then((order) => {
      if (order && Array.isArray(order) && order.length > 0) setSettingsOrder(order);
    });
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "GET_CACHE_STATUS" });
    }
    const onCacheMsg = (e) => {
      if (e.data.type === "CACHE_STATUS") setCacheBreakdown(e.data.data);
    };
    navigator.serviceWorker?.addEventListener("message", onCacheMsg);
    const saved = sessionStorage.getItem("hidden_pin_unlocked");
    setHiddenUnlocked(saved === "true");
    getPref("orientationLock", false).then(setOrientationLock);
    return () => navigator.serviceWorker?.removeEventListener("message", onCacheMsg);
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

  const handleSettingsDragStart = (e, idx) => {
    setSettingsDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const handleSettingsDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setSettingsDropIdx(idx);
  };

  const handleSettingsDrop = (e, idx) => {
    e.preventDefault();
    if (settingsDragIdx === null || settingsDragIdx === idx) { setSettingsDragIdx(null); setSettingsDropIdx(null); return; }
    const next = [...settingsOrder];
    const [moved] = next.splice(settingsDragIdx, 1);
    next.splice(idx, 0, moved);
    setSettingsOrder(next);
    setPref("settingsOrder", next);
    setSettingsDragIdx(null);
    setSettingsDropIdx(null);
  };

  const handleSettingsDragEnd = () => { setSettingsDragIdx(null); setSettingsDropIdx(null); };

  const handleMapZoomChange = (e) => {
    setMapZoomLevel(Number(e.target.value));
    setMapZoomSaved(false);
  };

  const handleMapZoomSave = () => {
    setPref("mapZoomLevel", mapZoomLevel);
    setMapZoomSaved(true);
    setOpenDialog(null);
    setTimeout(() => setMapZoomSaved(false), 2000);
  };

  const handleFacesPerPageSave = () => {
    setPref("facesPerPage", facesPerPage);
    setFacesPerPageSaved(true);
    setOpenDialog(null);
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
    setOpenDialog(null);
  };

  const handleClearCache = async () => {
    if (!("serviceWorker" in navigator)) {
      setCacheStatus("no-sw");
      return;
    }
    setCacheStatus("clearing");
    try {
      // Clear only the cached API data, never the user's saved preferences.
      await clearApiCache();
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

  const handleClearSingleCache = async (cacheName) => {
    if (!("serviceWorker" in navigator)) return;
    setClearingCache(cacheName);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg.active) {
        reg.active.postMessage({ type: "CLEAR_SINGLE_CACHE", cacheName });
      }
    } catch {
      setClearingCache(null);
    }
  };

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data.type === "CACHES_CLEARED") {
        setCacheStatus("done");
        setTimeout(() => setCacheStatus("idle"), 2000);
        // Refresh usage only AFTER the SW finished deleting, so the
        // storage estimate call never races the deletion (mobile hang).
        getStorageEstimate().then(setStorageUsed);
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "GET_CACHE_STATUS" });
        }
      }
      if (e.data.type === "SINGLE_CACHE_CLEARED") {
        setClearingCache(null);
        getStorageEstimate().then(setStorageUsed);
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "GET_CACHE_STATUS" });
        }
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

  const handleOrientationToggle = async () => {
    const next = !orientationLock;
    setOrientationLock(next);
    setPref("orientationLock", next);
    try {
      if (next && screen.orientation?.lock) {
        await screen.orientation.lock("portrait");
      } else if (screen.orientation?.unlock) {
        screen.orientation.unlock();
      }
    } catch {
      // screen.orientation.lock() may not be supported or allowed
    }
  };

  const handleCopyShortcut = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const summaryFor = (id) => {
    switch (id) {
      case "appearance": return `${style === "material" ? "Material" : "Neumorphic"} / ${mode === "dark" ? "Dark" : "Light"}`;
      case "accent-color": return null;
      case "airplane-mode": return airplaneModeState ? "ON" : "OFF";
      case "hidden-files": return hiddenUnlocked ? "Unlocked" : "Locked";
      case "home-columns": return COLUMN_OPTIONS.find((o) => o.value === columns)?.label || "Auto";
      case "nickname": return savedNickname || "Not set";
      case "offline-cache": return storageUsed ? `${(storageUsed.used / (1024 * 1024)).toFixed(1)} MB` : "—";
      case "map-zoom": return `${mapZoomLevel}`;
      case "faces-per-page": return `${facesPerPage}`;
      case "image-editor-tabs": return `${imageTabs.length} tabs`;
      case "video-editor-tabs": return `${videoTabs.length} tabs`;
      case "navbar-tab-order": return `${navTabs.length} links`;
      case "default-landing": return TABS.find((t) => t.path === defaultTab)?.label || "Home";
      case "shortcuts": return shortcuts.length > 0 ? `${shortcuts.length} links` : null;
      case "orientation": return orientationLock ? "Portrait" : "Auto";
      default: return null;
    }
  };

  const renderDialogContent = (id) => {
    switch (id) {
      case "appearance":
        return (
          <div className="settings__appearance">
            <div className="settings__appearance-section">
              <span className="settings__appearance-label">Style</span>
              <div className="settings__appearance-options">
                {[{ id: "neumorphic", label: "Neumorphic", desc: "Soft shadows with depth" }, { id: "material", label: "Material", desc: "Flat design with elevation" }].map((s) => (
                  <button
                    key={s.id}
                    className={`settings__appearance-card ${style === s.id ? "settings__appearance-card--active" : ""}`}
                    onClick={() => setStyle(s.id)}
                  >
                    <span className="settings__appearance-card-label">{s.label}</span>
                    <span className="settings__appearance-card-desc">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="settings__appearance-section">
              <span className="settings__appearance-label">Mode</span>
              <div className="settings__appearance-options">
                {[{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }].map((m) => (
                  <button
                    key={m.id}
                    className={`settings__appearance-card ${mode === m.id ? "settings__appearance-card--active" : ""}`}
                    onClick={() => setMode(m.id)}
                  >
                    <span className="settings__appearance-card-label">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case "accent-color":
        return (
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
        );

      case "airplane-mode":
        return (
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
        );

      case "orientation":
        return (
          <button
            className={`settings__airplane-btn ${orientationLock ? "settings__airplane-btn--on" : ""}`}
            onClick={handleOrientationToggle}
          >
            <Smartphone size={16} />
            {orientationLock ? "Portrait Mode ON" : "Portrait Mode OFF"}
          </button>
        );

      case "hidden-files":
        return (
          <>
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
              <p style={{ color: "var(--color-danger)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                Invalid PIN. Check the backend HIDDEN_FILES_PIN setting.
              </p>
            )}
            {hiddenUnlocked && (
              <p style={{ color: "var(--color-success)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                <Check size={12} style={{ verticalAlign: "middle" }} /> Hidden Files tab is now visible in the navbar.
              </p>
            )}
          </>
        );

      case "home-columns":
        return (
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
        );

      case "nickname":
        return (
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
        );

      case "offline-cache":
        return (
          <>
            {storageUsed && (
              <div className="settings__cache-usage">
                <div className="settings__cache-bar">
                  <div className="settings__cache-bar-fill" style={{ width: `${Math.min(storageUsed.percent, 100)}%` }} />
                </div>
                <span className="settings__cache-text">
                  {formatBytes(storageUsed.used)} used ({storageUsed.percent}%)
                </span>
              </div>
            )}
            {cacheBreakdown && (
              <div className="settings__cache-breakdown">
                <span className="settings__cache-breakdown-title">Cache Breakdown</span>
                <div className="settings__cache-breakdown-list">
                  {[
                    ["shell", "App Shell", "HTML, CSS, JS, and icons loaded by the app", cacheBreakdown.shell],
                    ["api", "API Responses", "Saved backend API data for offline use", cacheBreakdown.api],
                    ["media", "Media", "Viewed photos and video thumbnails cached locally", cacheBreakdown.media],
                    ["tiles", "Map Tiles", "OpenStreetMap map tiles for the Map tab", cacheBreakdown.tiles],
                    ["mui", "MUI Fonts", "Roboto/Noto font files for Material UI theme", cacheBreakdown.mui],
                  ].map(([key, label, desc, info]) => {
                    const count = info?.count ?? 0;
                    const size = info?.size ?? 0;
                    return (
                      <div key={key} className="settings__cache-breakdown-row">
                        <div className="settings__cache-breakdown-info">
                          <span className="settings__cache-breakdown-label">
                            {label} <span className="settings__cache-breakdown-count">{count} · {formatBytes(size)}</span>
                          </span>
                          <span className="settings__cache-breakdown-desc">{desc}</span>
                        </div>
                        <button
                          className="settings__cache-breakdown-clear"
                          onClick={() => handleClearSingleCache(key)}
                          disabled={clearingCache === key || count === 0}
                          aria-label={`Clear ${label} cache`}
                          title={`Clear ${label} cache`}
                        >
                          {clearingCache === key ? <Spinner size={14} /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="settings__cache-row">
              <button className="settings__btn settings__btn--danger" onClick={handleClearCache} disabled={cacheStatus === "clearing"}>
                <Trash2 size={14} /> {cacheStatus === "clearing" ? "Clearing..." : "Clear All Caches"}
              </button>
              {cacheStatus === "done" && <span className="settings__cache-ok">&checkmark; Cleared!</span>}
              {cacheStatus === "no-sw" && <span className="settings__cache-err">Service worker not available</span>}
            </div>
          </>
        );

      case "map-zoom":
        return (
          <div className="settings__map-zoom-row">
            <input type="range" className="settings__map-zoom-slider" min={10} max={19} value={mapZoomLevel} onChange={handleMapZoomChange} />
            <span className="settings__map-zoom-value">{mapZoomLevel}</span>
            <button className="settings__btn" onClick={handleMapZoomSave}>
              {mapZoomSaved ? <Check size={14} /> : <Save size={14} />} {mapZoomSaved ? "Saved!" : "Save"}
            </button>
          </div>
        );

      case "faces-per-page":
        return (
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
        );

      case "image-editor-tabs":
        return (
          <>
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
          </>
        );

      case "video-editor-tabs":
        return (
          <>
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
          </>
        );

      case "navbar-tab-order":
        return (
          <>
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
          </>
        );

      case "default-landing":
        return (
          <>
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
              <ChevronRight size={14} /> Go to {TABS.find((t) => t.path === defaultTab)?.label}
            </button>
          </>
        );

      case "shortcuts":
        if (shortcuts.length === 0) return <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>No shortcuts configured.</p>;
        return (
          <div className="settings__shortcuts-list">
            {shortcuts.map((s) => (
              <button
                key={s.url}
                className="settings__shortcut-btn"
                onClick={() => handleCopyShortcut(s.url)}
                title={`Copy: ${s.url}`}
              >
                <ExternalLink size={14} className="settings__shortcut-icon" />
                <div className="settings__shortcut-info">
                  <span className="settings__shortcut-label">{s.label}</span>
                  <span className="settings__shortcut-desc">{s.description}</span>
                </div>
                {copiedUrl === s.url ? (
                  <Check size={14} className="settings__shortcut-check" />
                ) : (
                  <Copy size={14} className="settings__shortcut-copy" />
                )}
              </button>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="settings">
      <h2 className="settings__title">Settings</h2>

      <div className="settings__list">
        {settingsOrder
          .map((id) => SETTINGS.find((s) => s.id === id))
          .filter((s) => s && (summaryFor(s.id) !== null || s.id === "appearance"))
          .map((s, idx) => {
            const Icon = s.icon;
            const summary = summaryFor(s.id);
            const isDragTarget = settingsDropIdx === idx && settingsDragIdx !== null && settingsDragIdx !== idx;
            return (
              <button
                key={s.id}
                className={`settings__row ${settingsDragIdx === idx ? "settings__row--dragging" : ""} ${isDragTarget ? "settings__row--drop" : ""}`}
                onClick={() => setOpenDialog(s.id)}
                draggable
                onDragStart={(e) => handleSettingsDragStart(e, idx)}
                onDragOver={(e) => handleSettingsDragOver(e, idx)}
                onDrop={(e) => handleSettingsDrop(e, idx)}
                onDragEnd={handleSettingsDragEnd}
              >
                <GripVertical size={14} className="settings__row-grip" />
                <Icon size={18} className="settings__row-icon" />
                <div className="settings__row-info">
                  <span className="settings__row-label">{s.label}</span>
                  <span className="settings__row-desc">{s.description}</span>
                </div>
                <span className="settings__row-summary">{summary}</span>
                <ChevronRight size={16} className="settings__row-chevron" />
              </button>
            );
          })}
      </div>

      {settingsOrder
        .map((id) => SETTINGS.find((s) => s.id === id))
        .filter((s) => s && (summaryFor(s.id) !== null || s.id === "appearance"))
        .map((s) => (
        <SettingsDialog
          key={s.id}
          open={openDialog === s.id}
          onClose={() => setOpenDialog(null)}
          title={s.label}
          description={s.description}
        >
          {renderDialogContent(s.id)}
        </SettingsDialog>
      ))}
    </div>
  );
}

export default Settings;
