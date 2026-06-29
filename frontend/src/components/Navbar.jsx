import { useState, useEffect, useRef, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import {
  House, FileUp, FolderOpen, Heart, Upload, Compass,
  CopyCheck, BarChart3, Settings, MapPin, MapPinned,
  Scan, Info, Puzzle, Sun, Moon, Menu, X, GripVertical,
} from "lucide-react";
import { getPref, setPref } from "../services/db";
import "./Navbar.css";

const DEFAULT_LINKS = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/import", label: "Import", icon: FileUp },
  { to: "/gallery", label: "Imported Media", icon: FolderOpen },
  { to: "/favorites", label: "Favorites", icon: Heart },
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/explorer", label: "Explorer", icon: Compass },
  { to: "/map", label: "Map", icon: MapPin },
  { to: "/locations", label: "Locations", icon: MapPinned },
  { to: "/faces", label: "Faces", icon: Scan },
  { to: "/duplicates", label: "Duplicates", icon: CopyCheck },
  { to: "/statistics", label: "Statistics", icon: BarChart3 },
  { to: "/tools", label: "Tools", icon: Puzzle },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/about", label: "About", icon: Info },
];

function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [links, setLinks] = useState(DEFAULT_LINKS);
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    getPref("navbarTabOrder", null).then((order) => {
      if (order && Array.isArray(order) && order.length > 0) {
        const orderMap = {};
        DEFAULT_LINKS.forEach((l, i) => { orderMap[l.to] = i; });
        const sorted = [...DEFAULT_LINKS].sort((a, b) => {
          const ai = order.indexOf(a.to);
          const bi = order.indexOf(b.to);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
        setLinks(sorted);
      } else {
        setLinks(DEFAULT_LINKS);
      }
    });
  }, []);

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

  const persistOrder = useCallback((ordered) => {
    setPref("navbarTabOrder", ordered.map((l) => l.to));
  }, []);

  const handleDragStart = (e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", idx);
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIdx(idx);
  };

  const handleDragLeave = () => {
    setDropIdx(null);
  };

  const handleDrop = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const next = [...links];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setLinks(next);
    persistOrder(next);
    setDragIdx(null);
    setDropIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDropIdx(null);
  };

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
        {links.map((l, i) => (
          <NavLink
            key={l.to}
            to={l.to}
            className={({ isActive }) =>
              `navbar__link${isActive ? " active" : ""}${dragIdx === i ? " navbar__link--dragging" : ""}${dropIdx === i && dragIdx !== null && dragIdx !== i ? " navbar__link--drop-before" : ""}`
            }
            end={l.end}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
          >
            <GripVertical size={12} className="navbar__drag-handle" />
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
          {links.map((l) => {
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