import { useEffect, useRef, useState } from "react";
import { toggleFavorite as toggleFavApi, getFileMetadata } from "../services/api";
import "./FileViewer.css";

function FileViewer({ file, onClose, onToggleFavorite }) {
  const [isFav, setIsFav] = useState(file.is_favorite);
  const [meta, setMeta] = useState(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
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
  }, [file.id, onClose]);

  const fileUrl = `/api/files/${file.id}/serve`;

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
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

  return (
    <div className="viewer-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="viewer-modal">
        <div className="viewer-header">
          <span className="viewer-filename">{file.filename}</span>
          <div className="viewer-actions">
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
        </div>
        <div className="viewer-body">
          {isVideo ? (
            <video className="viewer-media" src={fileUrl} controls autoPlay />
          ) : (
            <img className="viewer-media" src={fileUrl} alt={file.filename} />
          )}
        </div>
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
  );
}

export default FileViewer;
