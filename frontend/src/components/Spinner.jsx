import { useRef } from "react";
import "./Spinner.css";

const VARIANTS = ["plane", "pulse", "bounce", "wave", "flow", "swing", "grid", "fold", "chase", "circle"];

const DOT_VARIANTS = new Set(["bounce", "chase", "circle", "flow", "swing"]);

function Spinner({ size = 28, color, className = "" }) {
  const variant = useRef(VARIANTS[Math.floor(Math.random() * VARIANTS.length)]).current;

  const style = {
    "--sk-size": `${size}px`,
    ...(color ? { "--sk-color": color } : {}),
  };

  const cls = `sk-${variant}${className ? ` ${className}` : ""}`;

  if (variant === "plane") {
    return <div className={cls} style={style} />;
  }
  if (variant === "pulse") {
    return <div className={cls} style={style} />;
  }
  if (variant === "bounce") {
    return (
      <div className={cls} style={style}>
        <div className="sk-bounce-dot" />
        <div className="sk-bounce-dot" />
      </div>
    );
  }
  if (variant === "chase") {
    return (
      <div className={cls} style={style}>
        <div className="sk-chase-dot" />
        <div className="sk-chase-dot" />
        <div className="sk-chase-dot" />
        <div className="sk-chase-dot" />
        <div className="sk-chase-dot" />
        <div className="sk-chase-dot" />
      </div>
    );
  }
  if (variant === "wave") {
    return (
      <div className={cls} style={style}>
        <div className="sk-wave-rect" />
        <div className="sk-wave-rect" />
        <div className="sk-wave-rect" />
        <div className="sk-wave-rect" />
        <div className="sk-wave-rect" />
      </div>
    );
  }
  if (variant === "flow") {
    return (
      <div className={cls} style={style}>
        <div className="sk-flow-dot" />
        <div className="sk-flow-dot" />
        <div className="sk-flow-dot" />
      </div>
    );
  }
  if (variant === "swing") {
    return (
      <div className={cls} style={style}>
        <div className="sk-swing-dot" />
        <div className="sk-swing-dot" />
      </div>
    );
  }
  if (variant === "grid") {
    return (
      <div className={cls} style={style}>
        <div className="sk-grid-cube" />
        <div className="sk-grid-cube" />
        <div className="sk-grid-cube" />
        <div className="sk-grid-cube" />
        <div className="sk-grid-cube" />
        <div className="sk-grid-cube" />
        <div className="sk-grid-cube" />
        <div className="sk-grid-cube" />
        <div className="sk-grid-cube" />
      </div>
    );
  }
  if (variant === "fold") {
    return (
      <div className={cls} style={style}>
        <div className="sk-fold-cube" />
        <div className="sk-fold-cube" />
        <div className="sk-fold-cube" />
        <div className="sk-fold-cube" />
      </div>
    );
  }
  if (variant === "circle") {
    return (
      <div className={cls} style={style}>
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
        <div className="sk-circle-dot" />
      </div>
    );
  }
  return null;
}

export { VARIANTS, DOT_VARIANTS };
export default Spinner;
