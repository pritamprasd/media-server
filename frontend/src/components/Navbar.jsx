import { NavLink } from "react-router-dom";
import { useTheme } from "../contexts/ThemeContext";
import "./Navbar.css";

function Navbar() {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar__link" end>Home</NavLink>
      <NavLink to="/import" className="navbar__link">Import</NavLink>
      <NavLink to="/gallery" className="navbar__link">Imported Media</NavLink>
      <NavLink to="/favorites" className="navbar__link">Favorites</NavLink>
      <NavLink to="/upload" className="navbar__link">Upload</NavLink>
      <NavLink to="/duplicates" className="navbar__link">Duplicates</NavLink>
      <NavLink to="/statistics" className="navbar__link">Statistics</NavLink>

      <button className="navbar__theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === "dark" ? "☀️" : "🌙"}
      </button>
    </nav>
  );
}

export default Navbar;
