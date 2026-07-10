import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FolderOpen, Download, Plus, ArrowLeft, X,
} from "lucide-react";
import {
  getCollection, removeFilesFromCollection, addFilesToCollection,
  listFiles, getFileThumbnail,
} from "../services/api";
import FileViewer from "../components/FileViewer";
import Spinner from "../components/Spinner";
import "./CollectionDetail.css";

function CollectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [thumbnails, setThumbnails] = useState({});
  const [viewerFile, setViewerFile] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(-1);
  const viewerOpenRef = useRef(false);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const searchTimer = useRef(null);
  const fetchedRef = useRef(new Set());

  const fetchCollection = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCollection(id);
      setCollection(data);
      (data.files || []).forEach((f) => {
        if (!fetchedRef.current.has(f.id)) {
          fetchedRef.current.add(f.id);
          getFileThumbnail(f.id)
            .then((t) => setThumbnails((prev) => ({ ...prev, [f.id]: t.thumbnail })))
            .catch(() => { fetchedRef.current.delete(f.id); });
        }
      });
    } catch { /* ignored */ } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchCollection(); }, [fetchCollection]);

  useEffect(() => {
    const handler = () => {
      if (viewerOpenRef.current) {
        viewerOpenRef.current = false;
        setViewerFile(null);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  const openViewer = useCallback((file) => {
    if (!viewerOpenRef.current) {
      viewerOpenRef.current = true;
      window.history.pushState({ viewer: true }, "");
    }
    setViewerFile(file);
    const idx = (collection?.files || []).findIndex((f) => f.id === file.id);
    setViewerIndex(idx);
  }, [collection]);

  const closeViewer = useCallback(() => {
    if (viewerOpenRef.current) {
      viewerOpenRef.current = false;
      setViewerFile(null);
      setViewerIndex(-1);
    }
  }, []);

  const navigatePrev = useCallback(() => {
    const files = collection?.files || [];
    if (viewerIndex > 0) {
      const prev = files[viewerIndex - 1];
      setViewerFile(prev);
      setViewerIndex(viewerIndex - 1);
    }
  }, [collection, viewerIndex]);

  const navigateNext = useCallback(() => {
    const files = collection?.files || [];
    if (viewerIndex < files.length - 1) {
      const next = files[viewerIndex + 1];
      setViewerFile(next);
      setViewerIndex(viewerIndex + 1);
    }
  }, [collection, viewerIndex]);

  const handleRemoveFiles = async (fileIds) => {
    await removeFilesFromCollection(id, fileIds);
    setCollection((prev) => ({
      ...prev,
      files: prev.files.filter((f) => !fileIds.includes(f.id)),
      file_count: prev.file_count - fileIds.length,
    }));
  };

  const handleRemoveSingle = async (fileId, e) => {
    e.stopPropagation();
    await handleRemoveFiles([fileId]);
  };

  const handleAddSearch = (val) => {
    setAddSearch(val);
    clearTimeout(searchTimer.current);
    if (val.trim().length < 2) {
      setAddResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await listFiles(1, 30, { q: val.trim() });
        const existingIds = new Set((collection.files || []).map((f) => f.id));
        setAddResults((data.files || []).filter((f) => !existingIds.has(f.id)));
      } catch { /* ignored */ } finally {
        setSearching(false);
      }
    }, 300);
  };

  const toggleSelect = (fileId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedIds.size === 0) return;
    await addFilesToCollection(id, Array.from(selectedIds));
    setSelectedIds(new Set());
    setAddSearch("");
    setAddResults([]);
    setShowAddMedia(false);
    fetchCollection();
  };

  if (loading) {
    return (
      <div className="cdetail">
        <Spinner size={28} color="var(--color-text-muted)" />
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="cdetail">
        <p className="cdetail__empty">Collection not found.</p>
      </div>
    );
  }

  const files = collection.files || [];

  return (
    <div className="cdetail">
      <div className="cdetail__header">
        <button className="cdetail__back" onClick={() => navigate("/collections")}>
          <ArrowLeft size={18} />
        </button>
        <div className="cdetail__info">
          <h2 className="cdetail__title">
            <FolderOpen size={20} /> {collection.name}
          </h2>
          {collection.description && (
            <p className="cdetail__desc">{collection.description}</p>
          )}
          <span className="cdetail__count">{files.length} files</span>
        </div>
        <div className="cdetail__header-actions">
          <button className="cdetail__action-btn" onClick={() => setShowAddMedia(true)}>
            <Plus size={16} /> Add Media
          </button>
          <a
            className="cdetail__action-btn cdetail__action-btn--download"
            href={`/api/collections/${id}/download`}
            download
          >
            <Download size={16} /> Download ZIP
          </a>
        </div>
      </div>

      {files.length === 0 && (
        <p className="cdetail__empty">
          This collection is empty. Click &quot;Add Media&quot; to add files.
        </p>
      )}

      {files.length > 0 && (
        <div className="cdetail__grid">
          {files.map((file) => (
            <div
              key={file.id}
              className="cdetail__card"
              onClick={() => openViewer(file)}
            >
              <div className="cdetail__thumb-wrap">
                <img
                  className="cdetail__thumb"
                  src={thumbnails[file.id] || `/api/files/${file.id}/serve`}
                  alt={file.filename}
                />
                {file.mime_type && file.mime_type.startsWith("video/") && (
                  <span className="cdetail__badge">Video</span>
                )}
              </div>
              <div className="cdetail__card-info">
                <span className="cdetail__card-name">{file.filename}</span>
                <button
                  className="cdetail__remove-btn"
                  onClick={(e) => handleRemoveSingle(file.id, e)}
                  title="Remove from collection"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddMedia && (
        <div className="cdetail__modal-overlay" onClick={() => setShowAddMedia(false)}>
          <div className="cdetail__modal" onClick={(e) => e.stopPropagation()}>
            <div className="cdetail__modal-header">
              <h3>Add Media to &quot;{collection.name}&quot;</h3>
              <button className="cdetail__modal-close" onClick={() => setShowAddMedia(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="cdetail__modal-body">
              <input
                className="cdetail__search-input"
                type="text"
                value={addSearch}
                onChange={(e) => handleAddSearch(e.target.value)}
                placeholder="Search files by name..."
                autoFocus
              />
              {searching && <div className="cdetail__search-status"><Spinner size={14} /></div>}
              {addResults.length > 0 && (
                <div className="cdetail__add-results">
                  {addResults.map((f) => (
                    <div
                      key={f.id}
                      className={`cdetail__add-item ${selectedIds.has(f.id) ? "cdetail__add-item--selected" : ""}`}
                      onClick={() => toggleSelect(f.id)}
                    >
                      <img
                        src={f.thumbnail || `/api/files/${f.id}/thumbnail`}
                        alt={f.filename}
                        className="cdetail__add-thumb"
                      />
                      <span className="cdetail__add-name">{f.filename}</span>
                      <span className="cdetail__add-check">{selectedIds.has(f.id) ? "\u2713" : ""}</span>
                    </div>
                  ))}
                </div>
              )}
              {addSearch.length >= 2 && !searching && addResults.length === 0 && (
                <p className="cdetail__no-results">No files found.</p>
              )}
            </div>
            <div className="cdetail__modal-footer">
              <button className="cdetail__btn cdetail__btn--cancel" onClick={() => setShowAddMedia(false)}>Cancel</button>
              <button
                className="cdetail__btn cdetail__btn--save"
                onClick={handleAddSelected}
                disabled={selectedIds.size === 0}
              >
                Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ""} Files
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerFile && (
        <FileViewer
          file={viewerFile}
          onClose={closeViewer}
          onDelete={(fileId) => {
            handleRemoveFiles([fileId]);
            closeViewer();
          }}
          onNavigatePrev={viewerIndex > 0 ? navigatePrev : undefined}
          onNavigateNext={collection && viewerIndex < (collection.files || []).length - 1 ? navigateNext : undefined}
        />
      )}
    </div>
  );
}

export default CollectionDetail;
