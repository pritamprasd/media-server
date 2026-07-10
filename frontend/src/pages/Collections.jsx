import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { FolderOpen, Plus, Trash2, Pencil, X } from "lucide-react";
import {
  listCollections, createCollection, deleteCollection, updateCollection,
  listFiles,
} from "../services/api";
import Spinner from "../components/Spinner";
import "./Collections.css";

function Collections() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCoverId, setFormCoverId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [coverSearch, setCoverSearch] = useState("");
  const [coverResults, setCoverResults] = useState([]);
  const [searchingCover, setSearchingCover] = useState(false);
  const [thumbnails, setThumbnails] = useState({});
  const searchTimer = useRef(null);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listCollections();
      setCollections(data);
      data.forEach((c) => {
        if (c.cover_thumbnail) {
          fetch(c.cover_thumbnail)
            .then((r) => r.json())
            .then((d) => setThumbnails((prev) => ({ ...prev, [`cover-${c.id}`]: d.thumbnail })))
            .catch(() => {});
        }
      });
    } catch { /* ignored */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCollections(); }, [fetchCollections]);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormDesc("");
    setFormCoverId(null);
    setCoverSearch("");
    setCoverResults([]);
    setShowCreate(true);
  };

  const openEdit = (c) => {
    setEditingId(c.id);
    setFormName(c.name);
    setFormDesc(c.description || "");
    setFormCoverId(c.cover_file_id);
    setCoverSearch("");
    setCoverResults([]);
    setShowCreate(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await updateCollection(editingId, {
          name: formName.trim(),
          description: formDesc.trim(),
          cover_file_id: formCoverId,
        });
      } else {
        await createCollection({
          name: formName.trim(),
          description: formDesc.trim(),
          cover_file_id: formCoverId,
        });
      }
      setShowCreate(false);
      fetchCollections();
    } catch (err) {
      alert(err.response?.data?.error || "Failed to save collection");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this collection? Files will not be deleted.")) return;
    await deleteCollection(id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
  };

  const handleCoverSearch = (val) => {
    setCoverSearch(val);
    clearTimeout(searchTimer.current);
    if (val.trim().length < 2) {
      setCoverResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearchingCover(true);
      try {
        const data = await listFiles(1, 20, { q: val.trim() });
        setCoverResults(data.files || []);
      } catch { /* ignored */ } finally {
        setSearchingCover(false);
      }
    }, 300);
  };

  return (
    <div className="collections">
      <div className="collections__header">
        <h2 className="collections__title">
          <FolderOpen size={20} /> Collections
        </h2>
        <button className="collections__create-btn" onClick={openCreate}>
          <Plus size={16} /> New Collection
        </button>
      </div>

      {loading && <div className="collections__empty"><Spinner size={22} color="var(--color-text-muted)" /></div>}

      {!loading && collections.length === 0 && (
        <p className="collections__empty">
          No collections yet. Create one to group your media files.
        </p>
      )}

      {!loading && collections.length > 0 && (
        <div className="collections__grid">
          {collections.map((c) => (
            <Link key={c.id} to={`/collections/${c.id}`} className="collections__card">
              <div className="collections__card-cover">
                {thumbnails[`cover-${c.id}`] ? (
                  <img src={thumbnails[`cover-${c.id}`]} alt={c.name} className="collections__card-img" />
                ) : (
                  <div className="collections__card-placeholder">
                    <FolderOpen size={32} />
                  </div>
                )}
                <span className="collections__card-count">{c.file_count} files</span>
              </div>
              <div className="collections__card-info">
                <span className="collections__card-name">{c.name}</span>
                <div className="collections__card-actions">
                  <button className="collections__card-action" onClick={(e) => { e.preventDefault(); openEdit(c); }} title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button className="collections__card-action collections__card-action--danger" onClick={(e) => handleDelete(c.id, e)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="collections__modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="collections__modal" onClick={(e) => e.stopPropagation()}>
            <div className="collections__modal-header">
              <h3>{editingId ? "Edit Collection" : "New Collection"}</h3>
              <button className="collections__modal-close" onClick={() => setShowCreate(false)}><X size={18} /></button>
            </div>
            <div className="collections__modal-body">
              <label className="collections__label">Name</label>
              <input
                className="collections__input"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Collection name"
                autoFocus
              />
              <label className="collections__label">Description</label>
              <textarea
                className="collections__textarea"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
              <label className="collections__label">Cover Image</label>
              <input
                className="collections__input"
                type="text"
                value={coverSearch}
                onChange={(e) => handleCoverSearch(e.target.value)}
                placeholder="Search for a cover image..."
              />
              {searchingCover && <div className="collections__cover-search-status"><Spinner size={14} /></div>}
              {coverResults.length > 0 && (
                <div className="collections__cover-results">
                  {coverResults.map((f) => (
                    <button
                      key={f.id}
                      className={`collections__cover-option ${formCoverId === f.id ? "collections__cover-option--active" : ""}`}
                      onClick={() => { setFormCoverId(f.id); setCoverResults([]); setCoverSearch(f.filename); }}
                    >
                      <img src={f.thumbnail || `/api/files/${f.id}/thumbnail`} alt={f.filename} className="collections__cover-thumb" />
                    </button>
                  ))}
                </div>
              )}
              {formCoverId && (
                <div className="collections__cover-selected">
                  <span>Cover selected</span>
                  <button className="collections__cover-clear" onClick={() => { setFormCoverId(null); setCoverSearch(""); }}>Clear</button>
                </div>
              )}
            </div>
            <div className="collections__modal-footer">
              <button className="collections__btn collections__btn--cancel" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="collections__btn collections__btn--save" onClick={handleSave} disabled={saving || !formName.trim()}>
                {saving ? <Spinner size={14} /> : null} {editingId ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Collections;
