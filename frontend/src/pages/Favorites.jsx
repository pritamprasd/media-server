import { useState, useEffect, useCallback, useRef } from "react";
import { Heart } from "lucide-react";
import { listFavorites, toggleFavorite, getFileThumbnail } from "../services/api";
import FileViewer from "../components/FileViewer";
import CollectionMenuButton from "../components/CollectionMenuButton";
import Spinner from "../components/Spinner";
import "./Favorites.css";

function Favorites() {
  const [files, setFiles] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState(null);
  const viewerOpenRef = useRef(false);

  const closeViewer = useCallback(() => {
    if (viewerOpenRef.current) {
      viewerOpenRef.current = false;
      setViewerFile(null);
    }
  }, []);

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
  }, []);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listFavorites();
      setFiles(data);
      data.forEach(async (f) => {
        try {
          const t = await getFileThumbnail(f.id);
          setThumbnails((prev) => ({ ...prev, [f.id]: t.thumbnail }));
        } catch {
        }
      });
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const handleToggleFav = async (fileId) => {
    await toggleFavorite(fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handleViewerToggleFav = (fileId, isFav) => {
    if (!isFav) {
      closeViewer();
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
  };

  const handleFileClick = (file) => {
    openViewer(file);
  };

  return (
    <div className="favorites">
      <h2 className="favorites__title">Favorites</h2>

      {loading && <div className="favorites__empty"><Spinner size={22} color="var(--color-text-muted)" /></div>}

      {!loading && files.length === 0 && (
        <p className="favorites__empty">
          No favorites yet. Open a file in the Gallery and click the Heart icon to add it.
        </p>
      )}

      {!loading && files.length > 0 && (
        <div className="favorites__grid">
          {files.map((file) => (
            <div
              key={file.id}
              className="favorites__card"
              onClick={() => handleFileClick(file)}
            >
              <img
                className="favorites__thumb"
                src={thumbnails[file.id] || `/api/files/${file.id}/serve`}
                alt={file.filename}
              />
              <div className="favorites__info">
                <span className="favorites__name">{file.filename}</span>
                <button
                  className="favorites__unfav"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFav(file.id);
                  }}
                  title="Remove from favorites"
                >
                  <Heart size={16} fill="currentColor" />
                </button>
                <CollectionMenuButton fileId={file.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {viewerFile && (
        <FileViewer
          file={viewerFile}
          onClose={closeViewer}
          onToggleFavorite={handleViewerToggleFav}
          onDelete={(fileId) => {
            setFiles((prev) => prev.filter((f) => f.id !== fileId));
            closeViewer();
          }}
        />
      )}
    </div>
  );
}

export default Favorites;