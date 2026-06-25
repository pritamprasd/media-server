import { useState, useEffect, useRef } from "react";
import { uploadFiles, listUploadDirs, createUploadDir, listNicknames } from "../services/api";
import "./Upload.css";

function Upload() {
  const [files, setFiles] = useState([]);
  const [nickname, setNickname] = useState("");
  const [nicknames, setNicknames] = useState([]);
  const [directory, setDirectory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [existingDirs, setExistingDirs] = useState([]);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const inputRef = useRef(null);
  const nicknameId = "upload-nickname-input";

  useEffect(() => {
    listUploadDirs()
      .then((d) => setExistingDirs(d.directories || []))
      .catch(() => {});
    listNicknames()
      .then((d) => setNicknames(d.nicknames || []))
      .catch(() => {});
  }, []);

  const refreshDirs = () => {
    listUploadDirs()
      .then((d) => setExistingDirs(d.directories || []))
      .catch(() => {});
  };

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files || []));
    setResult(null);
    setError("");
  };

  const handleCreateDir = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const target = directory ? `${directory}/${name}` : name;
    try {
      await createUploadDir(target);
      setDirectory(target);
      setNewFolderName("");
      setShowNewFolderInput(false);
      refreshDirs();
    } catch {
      setError("Failed to create directory");
    }
  };

  const handleUpload = async () => {
    if (!nickname.trim()) {
      setError("Nickname is required");
      return;
    }
    if (files.length === 0) {
      setError("Select at least one file");
      return;
    }
    setUploading(true);
    setProgress(0);
    setResult(null);
    setError("");
    try {
      const data = await uploadFiles(
        files,
        nickname.trim(),
        directory,
        (e) => {
          if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
        },
      );
      setResult(data);
      setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      refreshDirs();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="upload">
      <h2 className="upload__title">Upload Media</h2>

      <div className="upload__card">
        <label className="upload__label">
          Nickname <span className="upload__required">*</span>
        </label>
        <input
          id={nicknameId}
          className="upload__input"
          type="text"
          list="nickname-list"
          placeholder="Enter a nickname for these files"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          disabled={uploading}
          autoComplete="off"
        />
        <datalist id="nickname-list">
          {nicknames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <label className="upload__label">Target Directory</label>
        <div className="upload__dir-row">
          <select
            className="upload__input upload__input--select"
            value={directory}
            onChange={(e) => {
              setDirectory(e.target.value);
              setShowNewFolderInput(false);
            }}
            disabled={uploading}
          >
            <option value="">Root</option>
            {existingDirs.map((d) => (
              <option key={d.path} value={d.path}>{d.name}</option>
            ))}
          </select>
          <button
            className="upload__dir-btn"
            onClick={() => setShowNewFolderInput((p) => !p)}
            disabled={uploading}
            title="New folder"
          >
            + Folder
          </button>
        </div>

        {showNewFolderInput && (
          <div className="upload__new-folder">
            <input
              className="upload__input"
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              disabled={uploading}
            />
            <button
              className="upload__btn upload__btn--small"
              onClick={handleCreateDir}
              disabled={uploading || !newFolderName.trim()}
            >
              Create
            </button>
          </div>
        )}

        <label className="upload__label">
          Files {files.length > 0 && <span className="upload__count">({files.length}, {formatSize(totalSize)})</span>}
        </label>
        <input
          ref={inputRef}
          className="upload__file-input"
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleFileChange}
          disabled={uploading}
        />

        {files.length > 0 && (
          <div className="upload__file-list">
            {files.map((f, i) => (
              <div key={i} className="upload__file-row">
                <span className="upload__file-name">{f.name}</span>
                <span className="upload__file-size">{formatSize(f.size)}</span>
              </div>
            ))}
          </div>
        )}

        {uploading && (
          <div className="upload__progress-wrap">
            <div className="upload__progress-bar">
              <div className="upload__progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="upload__progress-text">{progress}%</span>
          </div>
        )}

        {error && <p className="upload__error">{error}</p>}

        {result && (
          <div className="upload__result">
            <p className="upload__result-ok">
              Uploaded {result.saved?.length || 0} file(s)
              {result.errors?.length > 0 && `, ${result.errors.length} error(s)`}
            </p>
            {result.errors?.length > 0 && (
              <ul className="upload__error-list">
                {result.errors.map((e, i) => (
                  <li key={i}>{e.filename}: {e.error}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          className="upload__btn upload__btn--primary"
          onClick={handleUpload}
          disabled={uploading || files.length === 0 || !nickname.trim()}
        >
          {uploading ? `Uploading ${progress}%` : "Upload"}
        </button>
      </div>
    </div>
  );
}

export default Upload;
