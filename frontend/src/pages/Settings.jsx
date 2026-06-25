import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, ArrowRight } from "lucide-react";
import { getPref, setPref } from "../services/db";
import "./Settings.css";

const TABS = [
  { path: "/", label: "Home" },
  { path: "/import", label: "Import" },
  { path: "/gallery", label: "Imported Media" },
  { path: "/favorites", label: "Favorites" },
  { path: "/upload", label: "Upload" },
  { path: "/duplicates", label: "Duplicates" },
  { path: "/statistics", label: "Statistics" },
];

function Settings() {
  const [defaultTab, setDefaultTab] = useState("/");
  const navigate = useNavigate();

  useEffect(() => {
    getPref("defaultTab", "/").then(setDefaultTab);
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setDefaultTab(val);
    setPref("defaultTab", val);
  };

  return (
    <div className="settings">
      <h2 className="settings__title"><SettingsIcon size={20} /> Settings</h2>

      <div className="settings__card">
        <label className="settings__label">Default landing tab</label>
        <p className="settings__desc">
          Choose which page to show when you visit the site. The new tab will apply on your next visit.
        </p>
        <select
          className="settings__select"
          value={defaultTab}
          onChange={handleChange}
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