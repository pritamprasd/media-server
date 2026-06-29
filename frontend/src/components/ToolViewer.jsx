import { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { getTool } from "../tools/index";
import "./ToolViewer.css";

function ToolViewer({ toolId }) {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const cleanupRef = useRef(null);

  const tool = getTool(toolId);

  const handleBack = useCallback(() => {
    navigate("/tools");
  }, [navigate]);

  useEffect(() => {
    const container = containerRef.current;
    if (!tool || !container) return;

    if (tool.type === "js" && tool.module.init) {
      const cleanup = tool.module.init(container);
      if (typeof cleanup === "function") {
        cleanupRef.current = cleanup;
      }
    }

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (tool && tool.type === "js" && tool.module.destroy) {
        tool.module.destroy(container);
      }
    };
  }, [tool]);

  if (!tool) {
    return (
      <div className="tool-viewer">
        <div className="tool-viewer__header">
          <button className="tool-viewer__back" onClick={handleBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <span className="tool-viewer__title">Tool not found</span>
        </div>
        <div className="tool-viewer__body tool-viewer__body--empty">
          <p>The requested tool could not be found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tool-viewer">
      <div className="tool-viewer__header">
        <button className="tool-viewer__back" onClick={handleBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span className="tool-viewer__title">{tool.name}</span>
      </div>
      <div className="tool-viewer__body" ref={containerRef}>
        {tool.type === "html" && (
          <iframe
            className="tool-viewer__iframe"
            src={tool.url}
            title={tool.name}
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </div>
    </div>
  );
}

export default ToolViewer;
