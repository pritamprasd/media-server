import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./SettingsDialog.css";

export default function SettingsDialog({ open, onClose, title, description, children }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div className="sd-overlay" onClick={onClose}>
      <div className="sd-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="sd-header">
          <div>
            <h3 className="sd-title">{title}</h3>
            {description && <p className="sd-desc">{description}</p>}
          </div>
          <button className="sd-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="sd-body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
