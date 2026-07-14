import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight, Save, Trash2, ArrowUp, ArrowDown, RotateCcw,
  Check, Wifi, WifiOff, Lock, Unlock, ExternalLink, Copy, GripVertical, Smartphone,
} from "lucide-react";
import { getPref, setPref, clearApiCache, getStorageEstimate } from "../services/db";
import Spinner from "../components/Spinner";
import { setAirplaneMode, adminBulkAi, adminBulkExif, adminBulkThumbnails, adminBulkFaces, adminRenameTag, adminDeleteTag, verifyAdminPin, changeAdminPin, listAdminTags } from "../services/api";
import { useTheme } from "../contexts/ThemeContext";
import { SETTINGS, ADMIN_TASKS, ADMIN_TASKS_MAP } from "../config/settings";
import shortcuts from "../data/shortcuts.yaml";
import { getTools } from "../tools/index";
import SettingsDialog from "../components/SettingsDialog";
import "./Settings.css";

const DISABLED_TOOLS_KEY = "disabledTools";

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
  const [hiddenPinMode, setHiddenPinMode] = useState("unlock");
  const [storageUsed, setStorageUsed] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [mapZoomSaved, setMapZoomSaved] = useState(false);
  const [settingsOrder, setSettingsOrder] = useState(SETTINGS.map((s) => s.id));
  const [settingsDragIdx, setSettingsDragIdx] = useState(null);
  const [settingsDropIdx, setSettingsDropIdx] = useState(null);
  const [cacheBreakdown, setCacheBreakdown] = useState(null);
  const [clearingCache, setClearingCache] = useState(null);
  const [orientationLock, setOrientationLock] = useState(false);
  const [adminBusy, setAdminBusy] = useState(null);
  const [adminResults, setAdminResults] = useState({});
  const [adminPinUnlocked, setAdminPinUnlocked] = useState(() => sessionStorage.getItem("admin_pin_unlocked") === "true");
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminPinError, setAdminPinError] = useState(false);
  const [adminPinMode, setAdminPinMode] = useState("unlock");
  const [adminTags, setAdminTags] = useState([]);
  const [adminTagsLoading, setAdminTagsLoading] = useState(false);
  const [renamingTagIdx, setRenamingTagIdx] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [adminTagsBusy, setAdminTagsBusy] = useState(false);
  const [adminTagsMessage, setAdminTagsMessage] = useState(null);
  const [adminTagsSearch, setAdminTagsSearch] = useState("");
  const [adminTagsPage, setAdminTagsPage] = useState(1);
  const [adminTagsHasMore, setAdminTagsHasMore] = useState(false);
  const [disabledTools, setDisabledTools] = useState(() => new Set());
  const [allTools, setAllTools] = useState([]);
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
    const onCacheMsg = (e) => {
      if (e.data.type === "CACHE_STATUS") setCacheBreakdown(e.data.data);
    };
    navigator.serviceWorker?.addEventListener("message", onCacheMsg);
    const saved = sessionStorage.getItem("hidden_pin_unlocked");
    setHiddenUnlocked(saved === "true");
    getPref("orientationLock", false).then(setOrientationLock);
    getPref(DISABLED_TOOLS_KEY, []).then((ids) => setDisabledTools(new Set(ids)));
    setAllTools(getTools());
    return () => navigator.serviceWorker?.removeEventListener("message", onCacheMsg);
  }, []);

  // Request per-cache SW status. Uses navigator.serviceWorker.ready so it works
  // even before the SW has taken control of the page (controller can be null on load).
  const requestCacheStatus = useCallback(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        if (reg.active) reg.active.postMessage({ type: "GET_CACHE_STATUS" });
      })
      .catch(() => {});
  }, []);

  const loadAdminTags = useCallback(async (page = 1, search = "") => {
    const pin = sessionStorage.getItem("admin_pin") || "";
    if (!pin) return;
    setAdminTagsLoading(true);
    try {
      const data = await listAdminTags(pin, page, 50, search);
      if (page === 1) {
        setAdminTags(data.tags || []);
      } else {
        setAdminTags((prev) => [...prev, ...(data.tags || [])]);
      }
      setAdminTagsPage(data.page || 1);
      setAdminTagsHasMore(data.has_more || false);
    } catch {
      if (page === 1) setAdminTags([]);
    } finally {
      setAdminTagsLoading(false);
    }
  }, []);

  // Refresh cache status every time the Offline Cache dialog is opened.
  useEffect(() => {
    if (openDialog === "offline-cache") requestCacheStatus();
    if (openDialog === "admin-tags") {
      setAdminTagsSearch("");
      loadAdminTags(1, "");
    }
  }, [openDialog, requestCacheStatus, loadAdminTags]);

  // Re-fetch once the service worker takes control of the page.
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !navigator.serviceWorker) return;
    const onCtrl = () => requestCacheStatus();
    navigator.serviceWorker.addEventListener("controllerchange", onCtrl);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onCtrl);
  }, [requestCacheStatus]);

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
    setHiddenPinMode("unlock");
    window.dispatchEvent(new Event("hidden-pin-changed"));
  };

  const handleHiddenPinChangeNext = async () => {
    const pin = hiddenPinInput.trim();
    if (pin.length !== 6) { setHiddenPinError(true); return; }
    try {
      const { verifyHiddenPin } = await import("../services/api");
      await verifyHiddenPin(pin);
      setHiddenPinMode("set-new");
      setHiddenPinInput("");
      setHiddenPinError(false);
    } catch {
      setHiddenPinError(true);
    }
  };

  const handleHiddenPinSaveNew = async () => {
    const newPin = hiddenPinInput.trim();
    if (newPin.length !== 6) { setHiddenPinError(true); return; }
    try {
      const { changeHiddenPin } = await import("../services/api");
      const oldPin = sessionStorage.getItem("hidden_pin") || "";
      await changeHiddenPin(oldPin, newPin);
      sessionStorage.setItem("hidden_pin", newPin);
      setHiddenPinMode("unlock");
      setHiddenPinInput("");
      setHiddenPinError(false);
    } catch {
      setHiddenPinError(true);
    }
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
    const isInternal = url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("edge://");
    if (isInternal) {
      try {
        await navigator.clipboard.writeText(url);
        setCopiedUrl(url);
        setTimeout(() => setCopiedUrl(null), 2000);
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const runAdminTask = async (action) => {
    const pin = sessionStorage.getItem("admin_pin") || "";
    if (!pin) return;
    setAdminBusy(action);
    try {
      let res;
      if (action === "ai") res = await adminBulkAi(pin);
      else if (action === "exif") res = await adminBulkExif(pin);
      else if (action === "thumbnails") res = await adminBulkThumbnails(pin);
      else if (action === "faces") res = await adminBulkFaces(pin);
      setAdminResults((prev) => ({ ...prev, [action]: res?.queued ?? 0 }));
    } catch {
      setAdminResults((prev) => ({ ...prev, [action]: "error" }));
    } finally {
      setAdminBusy(null);
    }
  };

  const handleAdminPinUnlock = async () => {
    const pin = adminPinInput.trim();
    if (pin.length !== 6) {
      setAdminPinError(true);
      return;
    }
    try {
      await verifyAdminPin(pin);
      sessionStorage.setItem("admin_pin", pin);
      sessionStorage.setItem("admin_pin_unlocked", "true");
      setAdminPinUnlocked(true);
      setAdminPinError(false);
      setAdminPinInput("");
      window.dispatchEvent(new Event("admin-pin-changed"));
    } catch {
      setAdminPinError(true);
    }
  };

  const handleAdminPinChange = async () => {
    const current = adminPinInput.trim();
    if (current.length !== 6) { setAdminPinError(true); return; }
    try {
      await verifyAdminPin(current);
      sessionStorage.setItem("admin_pin_current", current);
      setAdminPinMode("set-new");
      setAdminPinInput("");
      setAdminPinError(false);
    } catch {
      setAdminPinError(true);
    }
  };

  const handleAdminPinSaveNew = async () => {
    const newPin = adminPinInput.trim();
    if (newPin.length !== 6) {
      setAdminPinError(true);
      return;
    }
    try {
      const oldPin = sessionStorage.getItem("admin_pin_current") || "";
      await changeAdminPin(oldPin, newPin);
      sessionStorage.setItem("admin_pin", newPin);
      sessionStorage.removeItem("admin_pin_current");
      setAdminPinInput("");
      setAdminPinMode("unlock");
      setAdminPinError(false);
    } catch {
      setAdminPinError(true);
    }
  };

  const handleAdminPinLock = () => {
    sessionStorage.removeItem("admin_pin");
    sessionStorage.removeItem("admin_pin_unlocked");
    sessionStorage.removeItem("admin_pin_current");
    setAdminPinUnlocked(false);
    setAdminPinInput("");
    setAdminPinError(false);
    setAdminPinMode("unlock");
    window.dispatchEvent(new Event("admin-pin-changed"));
  };

  const handleRenameTag = async (oldTag) => {
    const newTag = renameValue.trim();
    if (!newTag || newTag === oldTag) { setRenamingTagIdx(null); return; }
    setAdminTagsBusy(true);
    setAdminTagsMessage(null);
    try {
      await adminRenameTag(oldTag, newTag, sessionStorage.getItem("admin_pin") || "");
      setAdminTags((prev) => prev.map((t) => t.tag === oldTag ? { tag: newTag, count: t.count } : t));
      setAdminTagsMessage({ type: "success", text: `Renamed "${oldTag}" to "${newTag}"` });
    } catch {
      setAdminTagsMessage({ type: "error", text: `Failed to rename "${oldTag}"` });
    } finally {
      setRenamingTagIdx(null);
      setRenameValue("");
      setAdminTagsBusy(false);
    }
  };

  const handleDeleteTag = async (tag) => {
    setAdminTagsBusy(true);
    setAdminTagsMessage(null);
    try {
      await adminDeleteTag(tag, sessionStorage.getItem("admin_pin") || "");
      setAdminTags((prev) => prev.filter((t) => t.tag !== tag));
      setAdminTagsMessage({ type: "success", text: `Deleted tag "${tag}" from all media` });
    } catch {
      setAdminTagsMessage({ type: "error", text: `Failed to delete "${tag}"` });
    } finally {
      setAdminTagsBusy(false);
    }
  };

  const toggleTool = (id) => {
    setDisabledTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setPref(DISABLED_TOOLS_KEY, [...next]);
      return next;
    });
  };

  const summaryFor = (id) => {
    switch (id) {
      case "appearance": return `${style === "material" ? "Material" : "Neumorphic"} / ${mode === "dark" ? "Dark" : "Light"}`;
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
            <div className="settings__appearance-section">
              <span className="settings__appearance-label">Accent Color</span>
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
        if (hiddenPinMode === "set-new") {
          return (
            <>
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem", margin: "0 0 0.5rem" }}>Enter new 6-digit PIN:</p>
              <div className="settings__nickname-row">
                <input
                  className="settings__input"
                  type="password"
                  maxLength={6}
                  placeholder="New 6-digit PIN"
                  value={hiddenPinInput}
                  onChange={(e) => { setHiddenPinInput(e.target.value); setHiddenPinError(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleHiddenPinSaveNew(); }}
                  autoFocus
                  style={{ width: "160px", letterSpacing: "0.25em", fontSize: "1.1rem" }}
                />
                <button className="settings__btn" onClick={handleHiddenPinSaveNew}>
                  <Check size={14} /> Save
                </button>
                <button className="settings__btn" onClick={() => { setHiddenPinMode("unlock"); setHiddenPinInput(""); setHiddenPinError(false); }}>
                  Cancel
                </button>
              </div>
              {hiddenPinError && (
                <p style={{ color: "var(--color-danger)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                  New PIN must be exactly 6 digits.
                </p>
              )}
            </>
          );
        }
        return (
          <>
            <div className="settings__nickname-row">
              <input
                className="settings__input"
                type="password"
                maxLength={6}
                placeholder={hiddenPinMode === "change" ? "Current PIN" : "Enter 6-digit PIN"}
                value={hiddenPinInput}
                onChange={(e) => { setHiddenPinInput(e.target.value); setHiddenPinError(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") hiddenPinMode === "change" ? handleHiddenPinChangeNext() : handleHiddenPinUnlock(); }}
                autoFocus
                style={{ width: "160px", letterSpacing: "0.25em", fontSize: "1.1rem" }}
              />
              {hiddenUnlocked ? (
                <button className="settings__btn" onClick={handleHiddenPinLock}>
                  <Lock size={14} /> Lock
                </button>
              ) : hiddenPinMode === "change" ? (
                <button className="settings__btn" onClick={handleHiddenPinChangeNext}>
                  <ChevronRight size={14} /> Next
                </button>
              ) : (
                <button className="settings__btn" onClick={handleHiddenPinUnlock}>
                  <Unlock size={14} /> Unlock
                </button>
              )}
            </div>
            {hiddenPinError && (
              <p style={{ color: "var(--color-danger)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                {hiddenPinMode === "change" ? "Current PIN is incorrect." : "Invalid PIN. Check the backend HIDDEN_FILES_PIN setting."}
              </p>
            )}
            {hiddenUnlocked && (
              <p style={{ color: "var(--color-success)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>
                <Check size={12} style={{ verticalAlign: "middle" }} /> Hidden Files tab is now visible in the navbar.
              </p>
            )}
            {hiddenUnlocked && (
              <button
                className="settings__btn settings__btn--small"
                style={{ marginTop: "0.5rem" }}
                onClick={() => { setHiddenPinMode("change"); setHiddenPinInput(""); setHiddenPinError(false); }}
              >
                Change PIN
              </button>
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
                    ["api", "API Calls", "Backend API responses cached for offline browsing", cacheBreakdown.api],
                    ["thumbs", "Thumbnails", "Small image thumbnails cached for fast grid browsing", cacheBreakdown.thumbs],
                    ["media", "Media", "Full-size photos and videos cached for offline viewing", cacheBreakdown.media],
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

      case "admin-ai":
      case "admin-exif":
      case "admin-thumbnails":
      case "admin-faces": {
        const action = ADMIN_TASKS_MAP[id].action;
        const busy = adminBusy === action;
        const result = adminResults[action];
        return (
          <div className="settings__admin-task">
            <p className="settings__admin-desc">
              {ADMIN_TASKS_MAP[id].description}. This runs in the background; clicking
              Run queues the matching files for processing.
            </p>
            <button
              className="settings__btn settings__btn--primary"
              onClick={() => runAdminTask(action)}
              disabled={busy}
            >
              {busy ? <Spinner size={14} /> : null}
              {busy ? "Queuing..." : "Run"}
            </button>
            {result !== undefined && result !== null && result !== "error" && (
              <p className="settings__admin-result">
                <Check size={14} /> {result} file{result === 1 ? "" : "s"} queued for processing.
              </p>
            )}
            {result === "error" && (
              <p className="settings__admin-error">Failed to queue task. Check the backend.</p>
            )}
          </div>
        );
      }

      case "admin-tools": {
        if (allTools.length === 0) {
          return <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>No tools found.</p>;
        }
        return (
          <div className="settings__tools-list">
            {allTools.map((tool) => {
              const disabled = disabledTools.has(tool.id);
              return (
                <div key={tool.id} className="settings__tool-row">
                  <div className="settings__tool-info">
                    <span className="settings__tool-name">{tool.name}</span>
                    <span className="settings__tool-desc">{tool.description || tool.id}</span>
                  </div>
                  <button
                    className={`settings__toggle ${disabled ? "" : "settings__toggle--on"}`}
                    onClick={() => toggleTool(tool.id)}
                    role="switch"
                    aria-checked={!disabled}
                    title={disabled ? "Disabled" : "Enabled"}
                  >
                    <span className="settings__toggle-knob" />
                  </button>
                </div>
              );
            })}
          </div>
        );
      }

      case "admin-tags": {
        const handleSearchTags = (val) => {
          setAdminTagsSearch(val);
          loadAdminTags(1, val);
        };
        return (
          <div className="settings__admin-tags">
            <div className="settings__tag-search">
              <input
                className="settings__input"
                type="text"
                placeholder="Search tags..."
                value={adminTagsSearch}
                onChange={(e) => handleSearchTags(e.target.value)}
                style={{ width: "100%", marginBottom: "0.5rem" }}
              />
            </div>
            {adminTagsLoading && adminTags.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}><Spinner size={14} /> Loading tags...</p>
            ) : adminTags.length === 0 ? (
              <p style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>No tags found.</p>
            ) : (
              <div className="settings__tag-list">
                {adminTags.map((t, idx) => (
                  <div key={t.tag} className="settings__tag-row">
                    {renamingTagIdx === idx ? (
                      <div className="settings__tag-rename">
                        <input
                          className="settings__input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRenameTag(t.tag); if (e.key === "Escape") setRenamingTagIdx(null); }}
                          autoFocus
                          style={{ flex: 1 }}
                        />
                        <button className="settings__btn settings__btn--small" disabled={adminTagsBusy} onClick={() => handleRenameTag(t.tag)}>
                          <Check size={13} /> Save
                        </button>
                        <button className="settings__btn settings__btn--small" onClick={() => setRenamingTagIdx(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="settings__tag-name">{t.tag}</span>
                        <span className="settings__tag-count">{t.count}</span>
                        <button
                          className="settings__btn settings__btn--small"
                          disabled={adminTagsBusy}
                          onClick={() => { setRenamingTagIdx(idx); setRenameValue(t.tag); }}
                          title="Rename tag"
                        >
                          <ArrowUp size={12} style={{ transform: "rotate(45deg)" }} />
                        </button>
                        <button
                          className="settings__btn settings__btn--small settings__btn--danger"
                          disabled={adminTagsBusy}
                          onClick={() => { if (window.confirm(`Remove tag "${t.tag}" from all media?`)) handleDeleteTag(t.tag); }}
                          title="Delete tag"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {adminTagsHasMore && (
                  <button
                    className="settings__btn settings__btn--small"
                    style={{ width: "100%", marginTop: "0.5rem" }}
                    disabled={adminTagsLoading}
                    onClick={() => loadAdminTags(adminTagsPage + 1, adminTagsSearch)}
                  >
                    {adminTagsLoading ? <><Spinner size={12} /> Loading...</> : "Load More"}
                  </button>
                )}
              </div>
            )}
            {adminTagsMessage && (
              <p style={{ color: adminTagsMessage.type === "success" ? "var(--color-success)" : "var(--color-danger)", fontSize: "0.8125rem", marginTop: "0.5rem" }}>
                {adminTagsMessage.type === "success" ? <Check size={12} style={{ verticalAlign: "middle" }} /> : null} {adminTagsMessage.text}
              </p>
            )}
          </div>
        );
      }

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

      <h2 className="settings__section-title">Admin Tasks</h2>
      {!adminPinUnlocked && adminPinMode === "unlock" && (
        <div className="settings__admin-pin-gate">
          <p className="settings__admin-pin-label">Enter PIN to access Admin Tasks</p>
          <div className="settings__nickname-row">
            <input
              className="settings__input"
              type="password"
              maxLength={6}
              placeholder="Enter 6-digit PIN"
              value={adminPinInput}
              onChange={(e) => { setAdminPinInput(e.target.value); setAdminPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdminPinUnlock(); }}
              style={{ width: "160px", letterSpacing: "0.25em", fontSize: "1.1rem" }}
            />
            <button className="settings__btn" onClick={handleAdminPinUnlock}>
              <Unlock size={14} /> Unlock
            </button>
          </div>
          {adminPinError && (
            <p style={{ color: "var(--color-danger)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>Invalid PIN.</p>
          )}
        </div>
      )}
      {adminPinUnlocked && (
        <div className="settings__admin-pin-bar">
          <button className="settings__btn settings__btn--small" onClick={handleAdminPinLock}>
            <Lock size={13} /> Lock
          </button>
          {adminPinMode === "unlock" && (
            <button className="settings__btn settings__btn--small" onClick={() => { setAdminPinMode("change"); setAdminPinInput(""); setAdminPinError(false); }}>
              Change PIN
            </button>
          )}
        </div>
      )}
      {adminPinMode === "change" && (
        <div className="settings__admin-pin-gate">
          <p className="settings__admin-pin-label">Change Admin PIN</p>
          <div className="settings__nickname-row">
            <input
              className="settings__input"
              type="password"
              maxLength={6}
              placeholder="Current PIN"
              value={adminPinInput}
              onChange={(e) => { setAdminPinInput(e.target.value); setAdminPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdminPinChange(); }}
              style={{ width: "160px", letterSpacing: "0.25em", fontSize: "1.1rem" }}
            />
            <button className="settings__btn" onClick={handleAdminPinChange}>
              <ChevronRight size={14} /> Next
            </button>
            <button className="settings__btn" onClick={() => { setAdminPinMode("unlock"); setAdminPinInput(""); }}>
              Cancel
            </button>
          </div>
          {adminPinError && (
            <p style={{ color: "var(--color-danger)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>Current PIN is incorrect.</p>
          )}
        </div>
      )}
      {adminPinMode === "set-new" && (
        <div className="settings__admin-pin-gate">
          <p className="settings__admin-pin-label">Enter new 6-digit PIN</p>
          <div className="settings__nickname-row">
            <input
              className="settings__input"
              type="password"
              maxLength={6}
              placeholder="New 6-digit PIN"
              value={adminPinInput}
              onChange={(e) => { setAdminPinInput(e.target.value); setAdminPinError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdminPinSaveNew(); }}
              style={{ width: "160px", letterSpacing: "0.25em", fontSize: "1.1rem" }}
            />
            <button className="settings__btn" onClick={handleAdminPinSaveNew}>
              <Check size={14} /> Save
            </button>
            <button className="settings__btn" onClick={() => { setAdminPinMode("unlock"); setAdminPinInput(""); }}>
              Cancel
            </button>
          </div>
          {adminPinError && (
            <p style={{ color: "var(--color-danger)", fontSize: "0.8125rem", marginTop: "0.25rem" }}>PIN must be 6 digits.</p>
          )}
        </div>
      )}
      <div className="settings__list">
        {ADMIN_TASKS.map((t) => {
          const Icon = t.icon;
          const locked = !adminPinUnlocked;
          return (
            <button
              key={t.id}
              className={`settings__row ${locked ? "settings__row--locked" : ""}`}
              onClick={() => { if (!locked) setOpenDialog(t.id); }}
              disabled={locked}
            >
              <Icon size={18} className="settings__row-icon" />
              <div className="settings__row-info">
                <span className="settings__row-label">{t.label}</span>
                <span className="settings__row-desc">{t.description}</span>
              </div>
              {!locked && <ChevronRight size={16} className="settings__row-chevron" />}
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

      {ADMIN_TASKS.map((t) => (
        <SettingsDialog
          key={t.id}
          open={openDialog === t.id}
          onClose={() => setOpenDialog(null)}
          title={t.label}
          description={t.description}
        >
          {renderDialogContent(t.id)}
        </SettingsDialog>
      ))}
    </div>
  );
}

export default Settings;
