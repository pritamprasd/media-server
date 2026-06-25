import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { X } from "lucide-react";
import { listFilesWithGps } from "../services/api";
import "./Map.css";

const icon = L.divIcon({
  className: "map__marker-icon",
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--color-primary, #3498db)" width="28" height="28"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});

function FitBounds({ markers }) {
  const map = useMap();
  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map((m) => [m.latitude, m.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [markers, map]);
  return null;
}

function Map() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    listFilesWithGps()
      .then((d) => setFiles(d.files || []))
      .catch(() => setError("Failed to load GPS data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="map"><div className="home__spinner" /></div>;
  if (error) return <div className="map map--error"><p>{error}</p></div>;

  const markers = files.filter((f) => f.latitude != null && f.longitude != null);

  return (
    <div className="map">
      <div className="map__header">
        <h2 className="map__title">Photo Locations</h2>
        <span className="map__count">{markers.length} file{markers.length !== 1 ? "s" : ""} with GPS</span>
        <button className="map__close" onClick={() => navigate(-1)} title="Close"><X size={18} /></button>
      </div>
      <div className="map__container">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          className="map__leaflet"
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds markers={markers} />
          {markers.map((f) => (
            <Marker
              key={f.id}
              position={[f.latitude, f.longitude]}
              icon={icon}
              eventHandlers={{
                click: () => setSelected(f),
              }}
            >
              <Popup>
                <div className="map__popup">
                  {f.thumbnail && (
                    <img
                      className="map__popup-thumb"
                      src={`/api/files/${f.id}/serve`}
                      alt={f.filename}
                    />
                  )}
                  <p className="map__popup-name">{f.filename}</p>
                  <p className="map__popup-coords">{f.latitude.toFixed(4)}, {f.longitude.toFixed(4)}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

export default Map;
