import { useState, useEffect } from "react";
import "./TreeNode.css";

function TreeNode({ sessionId, path, name, loadDir, treeData, onFileClick }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const data = treeData[path];

  useEffect(() => {
    if (expanded && !data) {
      setLoading(true);
      loadDir(sessionId, path).finally(() => setLoading(false));
    }
  }, [expanded, path, sessionId, loadDir, data]);

  const hasContent = data && (data.directories.length > 0 || data.files.length > 0);
  const isEmpty = data && !hasContent;

  return (
    <div className="tree-node">
      <div
        className="tree-node__row"
        style={{ cursor: data && !hasContent ? "default" : "pointer" }}
        onClick={() => {
          if (hasContent !== false) setExpanded((prev) => !prev);
        }}
      >
        <span className="tree-node__arrow">
          {loading && <span className="tree-node__spinner" />}
          {!loading && data && hasContent && (expanded ? "▾" : "▸")}
          {!loading && (isEmpty || !data) && <span className="tree-node__spacer" />}
        </span>
        <span className="tree-node__icon">📁</span>
        <span className="tree-node__name">{name}</span>
      </div>

      {expanded && data && (
        <div className="tree-node__children">
          {data.directories.map((d) => (
            <TreeNode
              key={d.path}
              sessionId={sessionId}
              path={d.path}
              name={d.name}
              loadDir={loadDir}
              treeData={treeData}
              onFileClick={onFileClick}
            />
          ))}
          {data.files.map((f) => (
            <div
              key={f.id}
              className="tree-node__file"
              onClick={() => onFileClick(f)}
            >
              <span className="tree-node__icon">{isVideo(f.mime_type) ? "🎬" : "🖼️"}</span>
              <span className="tree-node__name tree-node__name--file">
                {f.filename}
              </span>
              <span className="tree-node__size">{formatSize(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function isVideo(mime) {
  return mime && mime.startsWith("video/");
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default TreeNode;
