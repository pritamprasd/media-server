import { useMemo } from "react";
import { useNavigate, useParams, Routes, Route } from "react-router-dom";
import { Puzzle } from "lucide-react";
import { getTools } from "../tools/index";
import ToolViewer from "../components/ToolViewer";
import "./Tools.css";

function ToolsGrid() {
  const navigate = useNavigate();
  const tools = useMemo(() => getTools(), []);

  return (
    <div className="tools">
      <h2 className="tools__title"><Puzzle size={20} /> Tools</h2>
      {tools.length === 0 && (
        <p className="tools__empty">
          No tools found. Drop a <code>.js</code> or <code>.html</code> file into{" "}
          <code>frontend/src/tools/</code> to add one.
        </p>
      )}
      <div className="tools__grid">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className="tools__tile"
            onClick={() => navigate(`/tools/${tool.id}`)}
          >
            <div className="tools__tile-thumb">
              {tool.type === "html" ? (
                <span className="tools__tile-type" style={{ background: "#2d5a27" }}>&lt;/&gt;</span>
              ) : (
                <span className="tools__tile-type" style={{ background: "#3a1f6b" }}>JS</span>
              )}
            </div>
            <div className="tools__tile-info">
              <span className="tools__tile-name">{tool.name}</span>
              {tool.description && (
                <span className="tools__tile-desc">{tool.description}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolViewerWrapper() {
  const { toolId } = useParams();
  return <ToolViewer toolId={toolId} />;
}

function Tools() {
  return (
    <Routes>
      <Route index element={<ToolsGrid />} />
      <Route path=":toolId" element={<ToolViewerWrapper />} />
    </Routes>
  );
}

export default Tools;
