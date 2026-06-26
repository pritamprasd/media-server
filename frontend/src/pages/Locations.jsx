import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MapPinned, Trash2, Plus } from "lucide-react";
import { listLocations, createLocation, deleteLocation } from "../services/api";
import Spinner from "../components/Spinner";
import "./Locations.css";

const NEARBY_KM = Number(import.meta.env.VITE_MAP_NEARBY_KM) || 10;

function Locations() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", latitude: "", longitude: "" });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    listLocations()
      .then(setLocations)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await createLocation({
        name: form.name.trim(),
        latitude: parseFloat(form.latitude),
        longitude: parseFloat(form.longitude),
        radius: NEARBY_KM / 111,
      });
      setForm({ name: "", latitude: "", longitude: "" });
      setShowForm(false);
      load();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteLocation(id);
    load();
  };

  const handleCardClick = (loc) => {
    navigate("/map", {
      state: { filter: { type: "click", lat: loc.latitude, lng: loc.longitude, label: loc.name } },
    });
  };

  if (loading) {
    return (
      <div className="locations">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="locations">
      <div className="locations__header">
        <h2 className="locations__title">Locations</h2>
        <button className="locations__add-btn" onClick={() => setShowForm((v) => !v)}>
          <Plus size={16} /> {showForm ? "Cancel" : "Add Location"}
        </button>
      </div>

      {showForm && (
        <form className="locations__form" onSubmit={handleCreate}>
          <input
            className="locations__input"
            placeholder="Location name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="locations__input"
            type="number"
            step="any"
            placeholder="Latitude"
            value={form.latitude}
            onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
            required
          />
          <input
            className="locations__input"
            type="number"
            step="any"
            placeholder="Longitude"
            value={form.longitude}
            onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
            required
          />
          <button className="locations__submit-btn" type="submit" disabled={saving}>
            {saving ? <Spinner size={14} color="currentColor" /> : <MapPinned size={14} />}
            Save
          </button>
        </form>
      )}

      {locations.length === 0 ? (
        <div className="locations__empty">
          <MapPinned size={40} />
          <p>No saved locations yet</p>
          <span>Save a location from the Map tab or add one manually</span>
        </div>
      ) : (
        <div className="locations__grid">
          {locations.map((loc) => (
            <div key={loc.id} className="locations__card" onClick={() => handleCardClick(loc)}>
              <div className="locations__card-icon">
                <MapPinned size={22} />
              </div>
              <div className="locations__card-body">
                <h3 className="locations__card-name">{loc.name}</h3>
                <p className="locations__card-coords">
                  {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                </p>
                <span className="locations__card-count">
                  {loc.file_count} file{loc.file_count !== 1 ? "s" : ""} within {NEARBY_KM} km
                </span>
              </div>
              <button
                className="locations__card-delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Locations;
