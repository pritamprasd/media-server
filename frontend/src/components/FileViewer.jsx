import { useEffect, useRef, useState, useCallback } from "react";
import { toggleFavorite as toggleFavApi, getFileMetadata, editFile } from "../services/api";
import "./FileViewer.css";

function FileViewer({ file, onClose, onToggleFavorite, onEditSave }) {
  const [isFav, setIsFav] = useState(file.is_favorite);
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [operations, setOperations] = useState([]);
  const [saving, setSaving] = useState(false);
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
              <div className="viewer-actions">
                {!isVideo && (
                  <button className="viewer-btn viewer-btn--edit" onClick={() => setEditMode(true)} title="Edit image">
                    Edit
                  </button>
                )}
                <a className="viewer-btn viewer-btn--download" href={fileUrl} download title="Download file">⬇</a>
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
                {meta.tags && meta.tags.length > 0 && (
                  <div className="viewer-meta-row viewer-meta-row--block">
                    <span className="viewer-meta-label">Tags</span>
                    <span className="viewer-meta-value">{meta.tags.join(", ")}</span>
                  </div>
                )}
                {meta.search_words && (
                  <div className="viewer-meta-row viewer-meta-row--block">
                    <span className="viewer-meta-label">Search Words</span>
                    <span className="viewer-meta-value">{meta.search_words}</span>
                  </div>
                )}
                <div className="viewer-meta-row">
                  <span className="viewer-meta-label">Status</span>
                  <span className="viewer-meta-value">{meta.metadata_status}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FileViewer;
