import { useState, useEffect, useRef, useCallback } from "react";
import { FolderPlus, Plus } from "lucide-react";
import {
  listCollections, addFilesToCollection, removeFilesFromCollection, createCollection,
} from "../services/api";
import Spinner from "./Spinner";
import "./CollectionMenuButton.css";

function CollectionMenuButton({ fileId, className = "" }) {
  const [open, setOpen] = useState(false);
  const [collectionList, setCollectionList] = useState([]);
  const [fileCollections, setFileCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listCollections();
      setCollectionList(all);
      const memberIds = [];
      for (const c of all) {
        if (c.file_count > 0) {
          try {
            const detail = await import("../services/api").then((m) => m.getCollection(c.id));
            if ((detail.files || []).some((f) => f.id === fileId)) {
              memberIds.push(c.id);
            }
          } catch { /* ignored */ }
        }
      }
      setFileCollections(memberIds);
    } catch { /* ignored */ } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = async (collectionId) => {
    const isMember = fileCollections.includes(collectionId);
    try {
      if (isMember) {
        await removeFilesFromCollection(collectionId, [fileId]);
        setFileCollections((prev) => prev.filter((id) => id !== collectionId));
        setCollectionList((prev) => prev.map((c) => c.id === collectionId ? { ...c, file_count: Math.max(0, (c.file_count || 1) - 1) } : c));
      } else {
        await addFilesToCollection(collectionId, [fileId]);
        setFileCollections((prev) => [...prev, collectionId]);
        setCollectionList((prev) => prev.map((c) => c.id === collectionId ? { ...c, file_count: (c.file_count || 0) + 1 } : c));
      }
    } catch { /* ignored */ }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const c = await createCollection({ name });
      await addFilesToCollection(c.id, [fileId]);
      setCollectionList((prev) => [...prev, { ...c, file_count: 1 }]);
      setFileCollections((prev) => [...prev, c.id]);
      setNewName("");
    } catch { /* ignored */ } finally {
      setCreating(false);
    }
  };

  return (
    <div className={`cmb-wrap ${className}`} ref={wrapRef}>
      <button className="cmb-btn" onClick={(e) => { e.stopPropagation(); setOpen((p) => !p); }} title="Add to collection">
        <FolderPlus size={14} />
      </button>
      {open && (
        <div className="cmb-menu" onClick={(e) => e.stopPropagation()}>
          <div className="cmb-menu__title">Collections</div>
          {loading ? (
            <div className="cmb-menu__status"><Spinner size={12} /></div>
          ) : collectionList.length === 0 ? (
            <div className="cmb-menu__empty">No collections yet</div>
          ) : (
            collectionList.map((c) => (
              <button
                key={c.id}
                className={`cmb-item ${fileCollections.includes(c.id) ? "cmb-item--active" : ""}`}
                onClick={() => handleToggle(c.id)}
              >
                <span className="cmb-item__check">{fileCollections.includes(c.id) ? "\u2713" : ""}</span>
                <span className="cmb-item__name">{c.name}</span>
              </button>
            ))
          )}
          <div className="cmb-create">
            <input
              className="cmb-create__input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection name..."
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
            <button className="cmb-create__btn" onClick={handleCreate} disabled={creating || !newName.trim()} title="Create collection">
              {creating ? <Spinner size={10} /> : <Plus size={12} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectionMenuButton;
