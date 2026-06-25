import { useEffect, useRef, useState, useCallback } from "react";
import { toggleFavorite as toggleFavApi, getFileMetadata, editFile, deleteFile, updateTags } from "../services/api";
import "./FileViewer.css";

function FileViewer({ file, onClose, onToggleFavorite, onEditSave, onDelete }) {
  const [isFav, setIsFav] = useState(file.is_favorite);
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [operations, setOperations] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exifExpanded, setExifExpanded] = useState(window.innerWidth > 768);
  const [tagInput, setTagInput] = useState("");
  const [tagSaving, setTagSaving] = useState(false);
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") {
        if (editMode) {
          setEditMode(false);
          setOperations([]);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    getFileMetadata(file.id)
      .then(setMeta)
      .catch(() => setMeta(null))
      .finally(() => setMetaLoading(false));
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [file.id, onClose, editMode]);

  const fileUrl = `/api/files/${file.id}/serve`;

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) {
      if (editMode) {
        setEditMode(false);
        setOperations([]);
      } else {
        onClose();
      }
    }
  };

  const isVideo = file.mime_type && file.mime_type.startsWith("video/");

  const handleToggleFav = async () => {
    try {
      const updated = await toggleFavApi(file.id);
      setIsFav(updated.is_favorite);
      if (onToggleFavorite) onToggleFavorite(file.id, updated.is_favorite);
    } catch {
    }
  };

  const addOp = useCallback((op) => {
    setOperations((prev) => [...prev, op]);
  }, []);

  const handleSave = async () => {
    if (operations.length === 0) return;
    setSaving(true);
    try {
      const newFile = await editFile(file.id, operations);
      setEditMode(false);
      setOperations([]);
      if (onEditSave) {
        onEditSave(newFile);
      } else {
        onClose();
      }
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setOperations([]);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async (deleteStorage) => {
    setDeleting(true);
    try {
      await deleteFile(file.id, deleteStorage);
      setShowDeleteConfirm(false);
      if (onDelete) onDelete(file.id);
      onClose();
    } catch {
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    if (!deleting) setShowDeleteConfirm(false);
  };

  const handleAddTag = async () => {
    const t = tagInput.trim();
    if (!t || !meta) return;
    const updated = [...(meta.tags || []), t.toLowerCase()];
    setTagSaving(true);
    try {
      const result = await updateTags(file.id, updated);
      setMeta((prev) => ({ ...prev, tags: result.tags }));
      setTagInput("");
    } catch {
    } finally {
      setTagSaving(false);
    }
  };

  const handleRemoveTag = async (tag) => {
    if (!meta) return;
    const updated = (meta.tags || []).filter((t) => t !== tag);
    setTagSaving(true);
    try {
      const result = await updateTags(file.id, updated);
      setMeta((prev) => ({ ...prev, tags: result.tags }));
    } catch {
    } finally {
      setTagSaving(false);
    }
  };

  const handleTagKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const previewStyle = (() => {
    if (!editMode || operations.length === 0) return {};
    let rot = 0;
    let sx = 1;
    let sy = 1;
    let gray = false;
    for (const op of operations) {
      if (op.type === "rotate") rot += op.degrees;
      if (op.type === "flip" && op.direction === "horizontal") sx *= -1;
      if (op.type === "flip" && op.direction === "vertical") sy *= -1;
      if (op.type === "grayscale") gray = true;
    }
    return {
      transform: `rotate(${rot}deg) scale(${sx}, ${sy})`,
      filter: gray ? "grayscale(1)" : "none",
    };
  })();

  return (
    <div className="viewer-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="viewer-modal">
        <div className="viewer-header">
          {editMode ? (
            <>
              <span className="viewer-filename">Editing: {file.filename}</span>
              <div className="viewer-actions">
                <button className="viewer-btn viewer-btn--save" onClick={handleSave} disabled={saving || operations.length === 0}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button className="viewer-btn viewer-btn--cancel" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="viewer-filename">{file.filename}</span>
              {file.relative_path && file.relative_path !== file.filename && (
                <span className="viewer-filepath">{file.relative_path}</span>
              )}
              <div className="viewer-actions">
                {!isVideo && (
                  <button className="viewer-btn viewer-btn--edit" onClick={() => setEditMode(true)} title="Edit image">
                    Edit
                  </button>
                )}
                <a className="viewer-btn viewer-btn--download" href={fileUrl} download title="Download file">⬇</a>
                <button className="viewer-btn viewer-btn--delete" onClick={handleDeleteClick} title="Delete file">🗑</button>
                <button
                  className={`viewer-fav ${isFav ? "viewer-fav--active" : ""}`}
                  onClick={handleToggleFav}
                  title={isFav ? "Remove from favorites" : "Add to favorites"}
                >
                  {isFav ? "★" : "☆"}
                </button>
                <button className="viewer-close" onClick={onClose}>
                  ✕
                </button>
              </div>
            </>
          )}
        </div>

        {editMode && (
          <div className="viewer-toolbar">
            <button className="viewer-tool" onClick={() => addOp({ type: "rotate", degrees: -90 })} title="Rotate left">⟲</button>
            <button className="viewer-tool" onClick={() => addOp({ type: "rotate", degrees: 90 })} title="Rotate right">⟳</button>
            <button className="viewer-tool" onClick={() => addOp({ type: "flip", direction: "horizontal" })} title="Flip horizontal">↔</button>
            <button className="viewer-tool" onClick={() => addOp({ type: "flip", direction: "vertical" })} title="Flip vertical">↕</button>
            <button className="viewer-tool" onClick={() => addOp({ type: "grayscale" })} title="Grayscale">◐</button>
            <span className="viewer-tool-count">{operations.length} op(s)</span>
          </div>
        )}

        <div className="viewer-content">
          <div className="viewer-body">
            {isVideo ? (
              <video className="viewer-media" src={fileUrl} controls autoPlay />
            ) : (
              <img className="viewer-media" src={fileUrl} alt={file.filename} style={previewStyle} />
            )}
            {!editMode && (
              <div className="viewer-float-actions">
                {!isVideo && (
                  <button className="viewer-float-btn" onClick={() => setEditMode(true)} title="Edit image">
                    ✏
                  </button>
                )}
                <a className="viewer-float-btn" href={fileUrl} download title="Download">⬇</a>
                <button className="viewer-float-btn" onClick={handleDeleteClick} title="Delete">🗑</button>
                <button
                  className={`viewer-float-btn ${isFav ? "viewer-float-btn--active" : ""}`}
                  onClick={handleToggleFav}
                  title={isFav ? "Remove from favorites" : "Add to favorites"}
                >
                  {isFav ? "★" : "☆"}
                </button>
                <button className="viewer-float-btn viewer-float-btn--close" onClick={onClose} title="Close">
                  ✕
                </button>
              </div>
            )}
          </div>
          <div className="viewer-sidebar">
            {metaLoading && <div className="viewer-meta-loading">Loading metadata...</div>}
            {meta && (
              <div className="viewer-meta">
                <h3 className="viewer-meta-title">Metadata</h3>
                {meta.width && meta.height && (
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label">Dimensions</span>
                    <span className="viewer-meta-value">{meta.width} × {meta.height}</span>
                  </div>
                )}
                {meta.duration != null && (
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label">Duration</span>
                    <span className="viewer-meta-value">{meta.duration.toFixed(1)}s</span>
                  </div>
                )}
                {meta.date_taken && (
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label">Date Taken</span>
                    <span className="viewer-meta-value">{new Date(meta.date_taken).toLocaleString()}</span>
                  </div>
                )}
                {meta.latitude != null && meta.longitude != null && (
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label">GPS</span>
                    <span className="viewer-meta-value">{meta.latitude}, {meta.longitude}</span>
                  </div>
                )}
                {meta.description && (
                  <div className="viewer-meta-row viewer-meta-row--block">
                    <span className="viewer-meta-label">Description</span>
                    <span className="viewer-meta-value">{meta.description}</span>
                  </div>
                )}
                <div className="viewer-meta-row viewer-meta-row--block">
                  <span className="viewer-meta-label">Tags</span>
                  <div className="viewer-tags">
                    {(meta.tags || []).map((t) => (
                      <span key={t} className="viewer-tag">
                        {t}
                        <button
                          className="viewer-tag-remove"
                          onClick={() => handleRemoveTag(t)}
                          disabled={tagSaving}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <span className="viewer-tag-input-wrap">
                      <input
                        className="viewer-tag-input"
                        type="text"
                        placeholder="Add tag..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        disabled={tagSaving}
                      />
                      <button
                        className="viewer-tag-add"
                        onClick={handleAddTag}
                        disabled={tagSaving || !tagInput.trim()}
                      >
                        +
                      </button>
                    </span>
                  </div>
                </div>
                {meta.search_words && (
                  <div className="viewer-meta-row viewer-meta-row--block">
                    <span className="viewer-meta-label">Search Words</span>
                    <span className="viewer-meta-value">{meta.search_words}</span>
                  </div>
                )}
                {meta.exif && (
                  <>
                    <div className="viewer-exif-toggle" onClick={() => setExifExpanded((p) => !p)}>
                      <h3 className="viewer-meta-title viewer-meta-title--sub">Exif Data</h3>
                      <span className={`viewer-exif-arrow ${exifExpanded ? "viewer-exif-arrow--open" : ""}`}>&#9654;</span>
                    </div>
                    <div className={`viewer-exif-content ${exifExpanded ? "viewer-exif-content--expanded" : ""}`}>
                      {Object.entries(meta.exif)
                        .filter(([, v]) => {
                          if (v == null || v === "") return false;
                          const s = String(v);
                          if (s.startsWith("b'") || s.startsWith('b"')) return false;
                          if (s.length > 60) return false;
                          return true;
                        })
                        .map(([k, v]) => (
                          <div className="viewer-meta-row" key={k}>
                            <span className="viewer-meta-label">{k}</span>
                            <span className="viewer-meta-value">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  </>
                )}
                <div className="viewer-meta-row">
                  <span className="viewer-meta-label">Status</span>
                  <span className="viewer-meta-value">{meta.metadata_status}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {showDeleteConfirm && (
          <div className="viewer-delete-overlay" onClick={handleDeleteCancel}>
            <div className="viewer-delete-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="viewer-delete-title">Delete file</h3>
              <p className="viewer-delete-path">{file.filename}</p>
              <div className="viewer-delete-actions">
                <button
                  className="viewer-delete-btn viewer-delete-btn--library"
                  onClick={() => handleDeleteConfirm(false)}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Remove from library"}
                </button>
                <button
                  className="viewer-delete-btn viewer-delete-btn--storage"
                  onClick={() => handleDeleteConfirm(true)}
                  disabled={deleting}
                >
                  {deleting ? "Deleting..." : "Delete from library & disk"}
                </button>
                <button
                  className="viewer-delete-btn viewer-delete-btn--cancel"
                  onClick={handleDeleteCancel}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FileViewer;
