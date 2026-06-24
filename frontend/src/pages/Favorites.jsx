import { useState, useEffect, useCallback } from "react";
import { listFavorites, toggleFavorite, getFileThumbnail } from "../services/api";
import FileViewer from "../components/FileViewer";
import "./Favorites.css";

function Favorites() {
  const [files, setFiles] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [loading, setLoading] = useState(true);
  const [viewerFile, setViewerFile] = useState(null);

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
      setViewerFile(null);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
  };

  const handleFileClick = (file) => {
    setViewerFile(file);
  };

  return (
    <div className="favorites">
      <h2 className="favorites__title">Favorites</h2>

      {loading && <p className="favorites__empty">Loading...</p>}

      {!loading && files.length === 0 && (
        <p className="favorites__empty">
          No favorites yet. Open a file in the Gallery and click ☆ to add it.
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
                  ★
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewerFile && (
        <FileViewer
          file={viewerFile}
          onClose={() => setViewerFile(null)}
          onToggleFavorite={handleViewerToggleFav}
          onDelete={(fileId) => {
            setFavorites((prev) => prev.filter((f) => f.id !== fileId));
          }}
        />
      )}
    </div>
  );
}

export default Favorites;