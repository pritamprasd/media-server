import { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import { House, FileUp, FolderOpen, Heart, Upload, CopyCheck, BarChart3, Settings, MapPin, MapPinned, Sun, Moon, Menu, X } from "lucide-react";
import "./Navbar.css";

const LINKS = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/import", label: "Import", icon: FileUp },
  { to: "/gallery", label: "Imported Media", icon: FolderOpen },
  { to: "/favorites", label: "Favorites", icon: Heart },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/map", label: "Map", icon: MapPin },
  { to: "/locations", label: "Locations", icon: MapPinned },
  { to: "/duplicates", label: "Duplicates", icon: CopyCheck },
  { to: "/statistics", label: "Statistics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <nav className="navbar" ref={menuRef}>
      <button
        className="navbar__hamburger"
        onClick={() => setMenuOpen((p) => !p)}
        aria-label="Toggle menu"
      >
        {menuOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <div className="navbar__desktop">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className="navbar__link" end={l.end}>
            <l.icon size={16} className="navbar__link-icon" />
            <span className="navbar__link-label">{l.label}</span>
          </NavLink>
        ))}
      </div>

      <button className="navbar__theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      {menuOpen && (
        <div className="navbar__dropdown">
          {LINKS.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) => `navbar__dropdown-link ${isActive ? "navbar__dropdown-link--active" : ""}`}
                end={l.end}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={16} className="navbar__dropdown-icon" />
                {l.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </nav>
  );
}

export default Navbar;