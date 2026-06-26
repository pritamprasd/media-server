import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { X, Grid3X3, BookmarkPlus } from "lucide-react";
import { listFilesWithGps, createLocation } from "../services/api";
import FileViewer from "../components/FileViewer";
import "./Map.css";

const NEARBY_KM = Number(import.meta.env.VITE_MAP_NEARBY_KM) || 10;
const NEARBY_THRESHOLD = NEARBY_KM / 111;
const ITEMS_PER_PAGE = Number(import.meta.env.VITE_MAP_THUMBS_PER_PAGE) || 32;

function roundCoord(v) {
  return Math.round(v * 1000) / 1000;
}

function makeLocationKey(lat, lng) {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

const icon = L.divIcon({
  className: "map__marker-icon",
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--color-primary, #3498db)" width="26" height="26"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
  iconSize: [26, 26],
  iconAnchor: [13, 26],
  popupAnchor: [0, -26],
});

const activeIcon = L.divIcon({
  className: "map__marker-icon map__marker-icon--active",
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="var(--color-accent, #e67e22)" width="34" height="34"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -34],
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

function MapController({ markers, activeMarkerId, onMapClick }) {
  const map = useMap();
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useMapEvents({
    click: (e) => {
      if (clickRef.current) clickRef.current(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    if (activeMarkerId != null) {
      const marker = markers.find((m) => m.id === activeMarkerId);
      if (marker) {
        map.flyTo([marker.latitude, marker.longitude], Math.max(map.getZoom(), 14), { duration: 0.5 });
      }
    }
  }, [activeMarkerId, markers, map]);
  return null;
}

function Map() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [activeMarkerId, setActiveMarkerId] = useState(null);
  const [filter, setFilter] = useState(null);
  const [showThumbs, setShowThumbs] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const navigate = useNavigate();
  const location_state = useLocation();

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      const all = [];
      let page = 1;
      let pages = 1;
      try {
        while (page <= pages) {
          const d = await listFilesWithGps(page, 500);
          if (cancelled) return;
          all.push(...(d.files || []));
          pages = d.pages || 1;
          page++;
        }
        setFiles(all);
      } catch {
        if (!cancelled) setError("Failed to load GPS data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const init = location_state?.state?.filter;
    if (init && !loading && markers.length > 0) {
      setFilter({ type: "click", lat: init.lat, lng: init.lng, label: init.label });
      setShowThumbs(true);
      setVisibleCount(ITEMS_PER_PAGE);
      window.history.replaceState({}, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const markers = files.filter((f) => f.latitude != null && f.longitude != null);

  const locations = useMemo(() => {
    const map = {};
    markers.forEach((f) => {
      const key = makeLocationKey(f.latitude, f.longitude);
      if (!map[key]) map[key] = [];
      map[key].push(f);
    });
    return map;
  }, [markers]);

  const filteredMarkers = useMemo(() => {
    if (!filter) return markers;
    if (filter.type === "marker") return locations[filter.key] || [];
    return markers.filter((m) => {
      const dlat = m.latitude - filter.lat;
      const dlng = m.longitude - filter.lng;
      return Math.sqrt(dlat * dlat + dlng * dlng) < NEARBY_THRESHOLD;
    });
  }, [filter, markers, locations]);

  const handleMarkerClick = useCallback((file) => {
    const key = makeLocationKey(file.latitude, file.longitude);
    setActiveMarkerId(file.id);
    setFilter({ type: "marker", key, lat: file.latitude, lng: file.longitude });
    setVisibleCount(ITEMS_PER_PAGE);
    setShowThumbs(true);
  }, []);

  const handleMapClick = useCallback((lat, lng) => {
    setActiveMarkerId(null);
    setFilter({ type: "click", lat, lng });
    setVisibleCount(ITEMS_PER_PAGE);
    setShowThumbs(true);
  }, []);

  const handleClearFilter = useCallback(() => {
    setFilter(null);
    setActiveMarkerId(null);
    setVisibleCount(ITEMS_PER_PAGE);
  }, []);

  const handleThumbnailClick = (file) => {
    setActiveMarkerId(file.id);
    setPreviewFile({ id: file.id, filename: file.filename });
  };

  const handleSaveLocation = useCallback(async () => {
    if (!filter || filter.type === "marker") return;
    const name = prompt("Name this location:");
    if (!name?.trim()) return;
    try {
      await createLocation({
        name: name.trim(),
        latitude: filter.lat,
        longitude: filter.lng,
        radius: NEARBY_KM / 111,
      });
    } catch {}
  }, [filter]);

  const visibleFiles = filteredMarkers.slice(0, visibleCount);
  const hasMore = visibleCount < filteredMarkers.length;
  const filterLabel = filter?.type === "marker"
    ? `${filteredMarkers.length} file${filteredMarkers.length !== 1 ? "s" : ""} at this location`
    : filter
      ? `${filteredMarkers.length} file${filteredMarkers.length !== 1 ? "s" : ""} near this location`
      : "";

  if (loading) return <div className="map"><div className="home__spinner" /></div>;
  if (error) return <div className="map map--error"><p>{error}</p></div>;

  return (
    <div className="map">
      <div className="map__header">
        <h2 className="map__title">Photo Locations</h2>
        <span className="map__count">{markers.length} file{markers.length !== 1 ? "s" : ""} with GPS</span>
        <button className="map__close" onClick={() => navigate(-1)} title="Close"><X size={18} /></button>
      </div>
      <div className="map__body">
        <div className="map__map-col">
          <MapContainer center={[20, 0]} zoom={2} className="map__leaflet" scrollWheelZoom={true}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds markers={markers} />
            <MapController markers={markers} activeMarkerId={activeMarkerId} onMapClick={handleMapClick} />
            {markers.map((f) => (
              <Marker
                key={f.id}
                position={[f.latitude, f.longitude]}
                icon={activeMarkerId === f.id ? activeIcon : icon}
              >
                <Popup>
                  <div className="map__popup">
                    {f.thumbnail ? (
                      <img className="map__popup-thumb" src={f.thumbnail} alt={f.filename} />
                    ) : (
                      <div className="map__popup-no-thumb" />
                    )}
                    <p className="map__popup-name">{f.filename}</p>
                    <button className="map__popup-view" onClick={() => setPreviewFile({ id: f.id, filename: f.filename })}>View</button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <button className="map__thumbs-toggle" onClick={() => setShowThumbs((v) => !v)} title="Toggle thumbnails">
            <Grid3X3 size={18} />
          </button>
        </div>
        <div className={`map__thumbs-col ${showThumbs ? "map__thumbs-col--open" : ""}`}>
          <div className="map__thumbs-inner">
            {filter && (
              <div className="map__thumbs-filter">
                <span>{filterLabel}</span>
                <div className="map__thumbs-filter-actions">
                  {filter.type === "click" && (
                    <button className="map__thumbs-save" onClick={handleSaveLocation} title="Save location">
                      <BookmarkPlus size={14} /> Save
                    </button>
                  )}
                  <button className="map__thumbs-clear" onClick={handleClearFilter}>Show all</button>
                </div>
              </div>
            )}
            <div className="map__thumbs-grid">
              {visibleFiles.map((f) => (
                <button
                  key={f.id}
                  className={`map__thumb-btn ${activeMarkerId === f.id ? "map__thumb-btn--active" : ""}`}
                  onClick={() => handleThumbnailClick(f)}
                  title={f.filename}
                >
                  {f.thumbnail ? (
                    <img src={f.thumbnail} alt={f.filename} className="map__thumb-img" loading="lazy" />
                  ) : (
                    <div className="map__thumb-placeholder" />
                  )}
                </button>
              ))}
            </div>
            {hasMore && (
              <button className="map__thumbs-more" onClick={() => setVisibleCount((v) => v + ITEMS_PER_PAGE)}>
                Show more ({filteredMarkers.length - visibleCount} remaining)
              </button>
            )}
            {filteredMarkers.length === 0 && (
              <div className="map__thumbs-empty">No photos near this location</div>
            )}
          </div>
        </div>
      </div>
      {previewFile && <FileViewer file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}

export default Map;
