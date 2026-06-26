import { useEffect, useRef, useState, useCallback } from "react";
import {
  Heart, Download, Trash2, X, RotateCcw, RotateCw, ArrowLeftRight,
  ArrowUpDown, Contrast, Edit3, Image, FileJson, MapPin,
  Hash, Tag, AlignLeft, Clock, Maximize2, Camera,
  ZoomIn, ZoomOut,
} from "lucide-react";
import { toggleFavorite as toggleFavApi, getFileMetadata, editFile, deleteFile, updateTags } from "../services/api";
import Spinner from "./Spinner";
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
  const [zoom, setZoom] = useState(1);
  const pinchRef = useRef(null);
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

  const handleZoomIn = () => setZoom((p) => Math.min(5, +(p * 1.25).toFixed(2)));
  const handleZoomOut = () => setZoom((p) => Math.max(0.25, +(p / 1.25).toFixed(2)));
  const handleZoomReset = () => setZoom(1);

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((p) => {
        const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
        return Math.max(0.25, Math.min(5, +(p * factor).toFixed(2)));
      });
    }
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchRef.current = dist;
    }
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / pinchRef.current;
      setZoom((p) => Math.max(0.25, Math.min(5, +(p * factor).toFixed(2))));
      pinchRef.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => { pinchRef.current = null; }, []);

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
    const transforms = [];
    if (zoom !== 1) transforms.push(`scale(${zoom})`);
    if (rot) transforms.push(`rotate(${rot}deg)`);
    if (sx !== 1 || sy !== 1) transforms.push(`scale(${sx}, ${sy})`);
    return {
      transform: transforms.join(" "),
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
                    <Edit3 size={14} /> Edit
                  </button>
                )}
                <a className="viewer-btn viewer-btn--download" href={fileUrl} download title="Download file"><Download size={15} /></a>
                <button className="viewer-btn viewer-btn--delete" onClick={handleDeleteClick} title="Delete file"><Trash2 size={15} /></button>
                <button
                  className={`viewer-fav ${isFav ? "viewer-fav--active" : ""}`}
                  onClick={handleToggleFav}
                  title={isFav ? "Remove from favorites" : "Add to favorites"}
                >
                  <Heart size={15} fill={isFav ? "currentColor" : "none"} />
                </button>
                <button className="viewer-close" onClick={onClose}>
                  <X size={18} />
                </button>
              </div>
            </>
          )}
        </div>

        {editMode && (
          <div className="viewer-toolbar">
            <button className="viewer-tool" onClick={handleZoomOut} title="Zoom out"><ZoomOut size={16} /></button>
            <span className="viewer-zoom-pct">{Math.round(zoom * 100)}%</span>
            <button className="viewer-tool" onClick={handleZoomIn} title="Zoom in"><ZoomIn size={16} /></button>
            <button className="viewer-tool viewer-tool--sm" onClick={handleZoomReset} title="Reset zoom">1:1</button>
            <span className="viewer-tool-sep" />
            <button className="viewer-tool" onClick={() => addOp({ type: "rotate", degrees: -90 })} title="Rotate left"><RotateCcw size={16} /></button>
            <button className="viewer-tool" onClick={() => addOp({ type: "rotate", degrees: 90 })} title="Rotate right"><RotateCw size={16} /></button>
            <button className="viewer-tool" onClick={() => addOp({ type: "flip", direction: "horizontal" })} title="Flip horizontal"><ArrowLeftRight size={16} /></button>
            <button className="viewer-tool" onClick={() => addOp({ type: "flip", direction: "vertical" })} title="Flip vertical"><ArrowUpDown size={16} /></button>
            <button className="viewer-tool" onClick={() => addOp({ type: "grayscale" })} title="Grayscale"><Contrast size={16} /></button>
            <span className="viewer-tool-count">{operations.length} op(s)</span>
          </div>
        )}

        <div className="viewer-content">
          <div
            className="viewer-body"
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {isVideo ? (
              <video className="viewer-media" src={fileUrl} controls autoPlay />
            ) : (
              <img className="viewer-media" src={fileUrl} alt={file.filename} style={previewStyle} />
            )}
            {!editMode && (
              <div className="viewer-float-actions">
                {!isVideo && (
                  <button className="viewer-float-btn" onClick={() => setEditMode(true)} title="Edit image">
                    <Edit3 size={16} />
                  </button>
                )}
                <div className="viewer-float-zoom">
                  <button className="viewer-float-btn viewer-float-btn--zoom" onClick={handleZoomOut} title="Zoom out"><ZoomOut size={15} /></button>
                  <span className="viewer-float-pct">{Math.round(zoom * 100)}%</span>
                  <button className="viewer-float-btn viewer-float-btn--zoom" onClick={handleZoomIn} title="Zoom in"><ZoomIn size={15} /></button>
                </div>
                <a className="viewer-float-btn" href={fileUrl} download title="Download"><Download size={16} /></a>
                <button className="viewer-float-btn" onClick={handleDeleteClick} title="Delete"><Trash2 size={16} /></button>
                <button
                  className={`viewer-float-btn ${isFav ? "viewer-float-btn--active" : ""}`}
                  onClick={handleToggleFav}
                  title={isFav ? "Remove from favorites" : "Add to favorites"}
                >
                  <Heart size={16} fill={isFav ? "currentColor" : "none"} />
                </button>
                <button className="viewer-float-btn viewer-float-btn--close" onClick={onClose} title="Close">
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
          <div className="viewer-sidebar">
            {metaLoading && <div className="viewer-meta-loading"><Spinner size={20} color="var(--color-text-muted)" /><span>Loading metadata...</span></div>}
            {meta && (
              <div className="viewer-meta">
                <h3 className="viewer-meta-title">Metadata</h3>
                {meta.width && meta.height && (
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label"><Maximize2 size={12} /> Dimensions</span>
                    <span className="viewer-meta-value">{meta.width} × {meta.height}</span>
                  </div>
                )}
                {meta.duration != null && (
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label"><Clock size={12} /> Duration</span>
                    <span className="viewer-meta-value">{meta.duration.toFixed(1)}s</span>
                  </div>
                )}
                {meta.date_taken && (
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label"><Camera size={12} /> Date Taken</span>
                    <span className="viewer-meta-value">{new Date(meta.date_taken).toLocaleString()}</span>
                  </div>
                )}
                {meta.latitude != null && meta.longitude != null && (
                  <div className="viewer-meta-row">
                    <span className="viewer-meta-label"><MapPin size={12} /> GPS</span>
                    <span className="viewer-meta-value">{meta.latitude}, {meta.longitude}</span>
                  </div>
                )}
                {meta.description && (
                  <div className="viewer-meta-row viewer-meta-row--block">
                    <span className="viewer-meta-label"><AlignLeft size={12} /> Description</span>
                    <span className="viewer-meta-value">{meta.description}</span>
                  </div>
                )}
                <div className="viewer-meta-row viewer-meta-row--block">
                  <span className="viewer-meta-label"><Hash size={12} /> Tags</span>
                  <div className="viewer-tags">
                    {(meta.tags || []).map((t) => (
                      <span key={t} className="viewer-tag">
                        {t}
                        <button
                          className="viewer-tag-remove"
                          onClick={() => handleRemoveTag(t)}
                          disabled={tagSaving}
                        >
                          <X size={12} />
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
