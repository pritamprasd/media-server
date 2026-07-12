import { useMemo, useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, Routes, Route } from "react-router-dom";
import { Puzzle, Pin } from "lucide-react";
import { getTools } from "../tools/index";
import { getPref, setPref } from "../services/db";
import ToolViewer from "../components/ToolViewer";
import "./Tools.css";

const PINNED_KEY = "pinnedTools";
const DISABLED_TOOLS_KEY = "disabledTools";

function ToolsGrid() {
  const navigate = useNavigate();
  const allTools = useMemo(() => getTools(), []);
  const [pinned, setPinned] = useState(() => new Set());
  const [disabled, setDisabled] = useState(() => new Set());

  useEffect(() => {
    getPref(PINNED_KEY, []).then((ids) => setPinned(new Set(ids)));
    getPref(DISABLED_TOOLS_KEY, []).then((ids) => setDisabled(new Set(ids)));
  }, []);

  const visibleTools = useMemo(
    () => allTools.filter((t) => !disabled.has(t.id)),
    [allTools, disabled]
  );

  const togglePin = useCallback((id, e) => {
    e.stopPropagation();
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setPref(PINNED_KEY, [...next]);
      return next;
    });
  }, []);

  const tools = useMemo(() => {
    const pinnedTools = [];
    const unpinnedTools = [];
    for (const t of visibleTools) {
      (pinned.has(t.id) ? pinnedTools : unpinnedTools).push(t);
    }
    pinnedTools.sort((a, b) => a.name.localeCompare(b.name));
    unpinnedTools.sort((a, b) => a.name.localeCompare(b.name));
    return [...pinnedTools, ...unpinnedTools];
  }, [visibleTools, pinned]);

  return (
    <div className="tools">
      <h2 className="tools__title"><Puzzle size={20} /> Tools</h2>
      {allTools.length === 0 && (
        <p className="tools__empty">
          No tools found. Drop a <code>.js</code> or <code>.html</code> file into{" "}
          <code>frontend/src/tools/</code> to add one.
        </p>
      )}
      {allTools.length > 0 && tools.length === 0 && (
        <p className="tools__empty">
          All tools are disabled. Enable them in Settings → Admin Tasks → Manage Tools.
        </p>
      )}
      <div className="tools__grid">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tools__tile${pinned.has(tool.id) ? " tools__tile--pinned" : ""}`}
            onClick={() => navigate(`/tools/${tool.id}`)}
          >
            <div className="tools__tile-thumb">
              {tool.icon ? (
                <span className="tools__tile-emoji">{tool.icon}</span>
              ) : tool.type === "html" ? (
                <span className="tools__tile-type" style={{ background: "#2d5a27" }}>&lt;/&gt;</span>
              ) : (
                <span className="tools__tile-type" style={{ background: "#3a1f6b" }}>JS</span>
              )}
              <button
                className={`tools__pin${pinned.has(tool.id) ? " tools__pin--active" : ""}`}
                onClick={(e) => togglePin(tool.id, e)}
                title={pinned.has(tool.id) ? "Unpin" : "Pin to top"}
              >
                <Pin size={14} />
              </button>
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
