import { NavLink } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar__link" end>Home</NavLink>
      <NavLink to="/import" className="navbar__link">Import</NavLink>
      <NavLink to="/gallery" className="navbar__link">Imported Media</NavLink>
      <NavLink to="/favorites" className="navbar__link">Favorites</NavLink>
    </nav>
  );
}

export default Navbar;
