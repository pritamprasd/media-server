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
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listCollections(fileId);
      setCollectionList(all);
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
    const c = collectionList.find((x) => x.id === collectionId);
    const isMember = c?.is_member;
    try {
      if (isMember) {
        await removeFilesFromCollection(collectionId, [fileId]);
        setCollectionList((prev) => prev.map((x) => x.id === collectionId ? { ...x, is_member: false, file_count: Math.max(0, (x.file_count || 1) - 1) } : x));
      } else {
        await addFilesToCollection(collectionId, [fileId]);
        setCollectionList((prev) => prev.map((x) => x.id === collectionId ? { ...x, is_member: true, file_count: (x.file_count || 0) + 1 } : x));
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
      setCollectionList((prev) => [...prev, { ...c, file_count: 1, is_member: true }]);
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
                className={`cmb-item ${c.is_member ? "cmb-item--active" : ""}`}
                onClick={() => handleToggle(c.id)}
              >
                <span className="cmb-item__check">{c.is_member ? "\u2713" : ""}</span>
                <span className="cmb-item__name">{c.name}</span>
                <span className="cmb-item__count">{c.file_count || 0}</span>
              </button>
            ))
          )}
          <div className="cmb-create">
            <input
              className="cmb-create__input"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New collection..."
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
            <button className="cmb-create__btn" onClick={handleCreate} disabled={creating || !newName.trim()} title="Create and add">
              {creating ? <Spinner size={10} /> : <Plus size={12} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectionMenuButton;
