You are creating a new tool for a React Vite website. The tool system uses imperative JavaScript (no JSX), auto-discovered via import.meta.glob in frontend/src/tools/index.js. Dropping a .js file in frontend/src/tools/ is all that's needed — no route registration or config changes.

## Tool file structure (required exports)
```js
export const name = "Display Name";          // Required: shown on tile + header
export const description = "Short description"; // Required: shown on tile

export function init(container) {
  // container is a plain <div class="tool-viewer__body"> DOM element
  // It has overflow:hidden by default — set container.style.overflow = "auto" if your content scrolls
  // Append UI elements to a wrapper div created here
  // Return a cleanup function if needed (called before destroy)
  return () => { /* cleanup */ };
}

export function destroy(container) {
  container.innerHTML = "";
}
Critical Layout Constraints
1. The parent .tool-viewer__body has CSS: flex:1; min-height:0; overflow:hidden; position:relative;
— You MUST override overflow in init: container.style.overflow = "auto"
— Do NOT set height:100% on your wrapper, use natural flow
— Add min-width:0 to wrapper to prevent flex overflow
2. All tools render inside a fullscreen overlay (position:fixed, inset:0) with a back button header. Your tool fills the remaining space.
3. For scrollable content, use pattern:
container.style.overflow = "auto";
const wrapper = document.createElement("div");
wrapper.style.cssText = "display:flex;flex-direction:column;padding:1.25rem;gap:1rem;min-width:0;";
container.appendChild(wrapper);
CSS Variables Available (theme-aware, dark/light mode)
--color-bg           (page background)
--color-surface      (card/section background)
--color-text         (primary text)
--color-text-muted   (secondary/label text)
--color-border       (border color)
--color-primary      (accent/action color)
--radius             (border-radius value)
--neu-raised-sm      (raised shadow)
--neu-flat           (flat shadow)
--neu-inset-sm       (inset shadow)
Design System & Conventions
Buttons
// Primary action
btn.style.cssText = "padding:0.35rem 0.75rem;border:none;border-radius:6px;background:var(--color-primary);color:#fff;font-size:0.78rem;font-weight:600;cursor:pointer;";

// Secondary/outline
btn.style.cssText = "padding:0.35rem 0.75rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);font-size:0.78rem;cursor:pointer;";
Input fields
input.style.cssText = "width:100%;max-width:400px;padding:0.55rem 0.75rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg);color:var(--color-text);font-size:0.88rem;outline:none;";
Select dropdowns
select.style.cssText = "padding:0.35rem 0.5rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:0.82rem;outline:none;";
Color pickers
input.type = "color";
input.style.cssText = "width:32px;height:32px;border:none;border-radius:4px;cursor:pointer;background:none;padding:0;";
Sliders (range inputs)
input.type = "range";
input.style.cssText = "width:80px;accent-color:var(--color-primary);";
Cards/section containers
card.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);overflow:hidden;";
Key-value rows (like system-info.js)
row.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;padding:0.2rem 0;";
// Label:
lbl.style.cssText = "font-size:0.82rem;color:var(--color-text-muted);white-space:nowrap;";
// Value:
val.style.cssText = "font-size:0.82rem;color:var(--color-text);text-align:right;overflow-wrap:break-word;max-width:55%;flex-shrink:1;";
Permission request cards (like device-sensors.js, system-info.js)
card.style.cssText = "border:1px solid var(--color-border);border-radius:6px;padding:0.5rem 0.65rem;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;";
// Title inside card:
title.style.cssText = "font-size:0.82rem;font-weight:600;color:var(--color-text);";
// Description inside card:
desc.style.cssText = "font-size:0.72rem;color:var(--color-text-muted);margin-top:1px;";
// Request button:
btn.style.cssText = "flex-shrink:0;padding:0.3rem 0.6rem;border:none;border-radius:6px;font-size:0.72rem;font-weight:600;cursor:pointer;background:var(--color-primary);color:#fff;white-space:nowrap;";
Chips/tags
chip.style.cssText = "font-size:0.73rem;padding:0.2rem 0.45rem;border-radius:4px;background:var(--color-bg);color:var(--color-text);border:1px solid var(--color-border);";
Example: Simple tool (QR Generator pattern)
export const name = "My Tool";
export const description = "What it does";

export function init(container) {
  container.style.overflow = "auto";
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;padding:1.5rem;gap:1rem;align-items:center;min-width:0;";
  container.appendChild(wrapper);

  // ... build UI imperatively ...

  return () => { wrapper.remove(); };
}

export function destroy(container) {
  container.innerHTML = "";
}
Font sizes used across tools
- Page title: 1.1rem, font-weight:600
- Section headers: 0.88rem, font-weight:600
- Card titles: 0.82rem-0.88rem
- Body/labels: 0.82rem
- Secondary/descriptions: 0.72-0.78rem
- Muted hints: 0.73rem
Important Rules
- NO comments in the code
- Use inline cssText (not stylesheets, not className)
- All text color must use var(--color-text) or var(--color-text-muted)
- Backgrounds use var(--color-bg), var(--color-surface)
- Use monospace font via "font-family:monospace" only for data/code values
- Canvas charts should use devicePixelRatio scaling for sharp rendering
- For closures/cleanup: return a cleanup function from init() that removes all listeners, stops sensors, cancels animation frames, disposes Three.js resources, etc.
- If the tool needs permissions (geolocation, camera, mic, sensors, motion, orientation), show a "Request" button (not auto-request) that the user clicks to trigger the browser permission prompt
- For mediaDevices.enumerateDevices(), calling it prompts for permission — wrap in user-initiated click handler
- Do NOT use external dependencies unless already in package.json (react, leaflet, three, recharts, qrcode, mermaid)
- File must pass ESLint ('npm run lint' from project root — no unused vars, no empty blocks, no async promise executors)