import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, ArrowRight, Palette } from "lucide-react";
import { getPref, setPref } from "../services/db";
import "./Settings.css";

const TABS = [
  { path: "/", label: "Home" },
  { path: "/import", label: "Import" },
  { path: "/gallery", label: "Imported Media" },
  { path: "/favorites", label: "Favorites" },
  { path: "/upload", label: "Upload" },
  { path: "/map", label: "Map" },
  { path: "/duplicates", label: "Duplicates" },
  { path: "/statistics", label: "Statistics" },
];

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
  const navigate = useNavigate();

  useEffect(() => {
    getPref("defaultTab", "/").then(setDefaultTab);
    getPref("accentColor", "#3498db").then(setAccentColor);
    getPref("homeColumns", "auto").then(setColumnsState);
  }, []);

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
        </div>
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