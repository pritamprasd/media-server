# Writing a New Tool (LLM Prompt)

Copy and paste the following block into another LLM (ChatGPT, Gemini, Claude, etc.) to generate a new tool that automatically works with this codebase.

---

```
You are generating a tool for a media-server React app (Vite + React 19). The tool system uses imperative DOM construction (no JSX).

## How tools work

1. Drop a `.js` file into `frontend/src/tools/`.
2. The file is **auto-discovered** via `import.meta.glob` — no route, import, or config change needed.
3. The filename (minus `.js`) becomes the tool's URL `id` at `/tools/:toolId`.
4. The grid tile shows the `name` and `description` exports, plus a "JS" type badge.

## Required exports

```js
export const name = "Display Name";        // Shown on grid tile + viewer header
export const description = "Short description";  // Shown on grid tile
export function init(container) { /* ... */ }    // Called when tool mounts
export function destroy(container) { /* ... */ } // Called when tool unmounts
```

## `init(container)` rules

- `container` is a plain `<div>` already in the DOM. Append your UI to it.
- **Do NOT use JSX or React components.** Create elements with `document.createElement`, set styles via `.style.cssText` or classes.
- Return a **cleanup function** from `init` (called before `destroy`). Use it to remove event listeners, stop streams, cancel animation frames, dispose WebGL resources, etc.

## `destroy(container)` rules

- Always set `container.innerHTML = ""` at minimum.

## Styling

Use these CSS custom properties for theme support (they adapt to dark/light mode):

| Variable              | Purpose            |
|-----------------------|--------------------|
| `--color-bg`          | Page background    |
| `--color-surface`     | Card/surface bg    |
| `--color-text`        | Primary text       |
| `--color-text-muted`  | Muted/secondary    |
| `--color-border`      | Borders            |
| `--color-primary`     | Accent/action color|
| `--radius`            | Border radius      |
| `--neu-raised-sm`     | Raised shadow      |
| `--neu-flat`          | Flat shadow        |
| `--neu-inset-sm`      | Inset shadow       |

## npm dependencies

Install via `npm install <pkg>` in `frontend/`. Use bare ESM imports — Vite bundles them. Examples:
```js
import QRCode from "qrcode";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
```

## Three.js tools

- Import from `three` and `three/examples/jsm/controls/OrbitControls.js`.
- Use `ResizeObserver` on the container for responsive sizing.
- In the cleanup function: `cancelAnimationFrame`, `ro.disconnect()`, `renderer.dispose()`, dispose all geometries and materials, remove wrapper.

## HTML tools (alternative)

Instead of a `.js` file, drop a `.html` file into `frontend/src/tools/`. It renders in an iframe with `sandbox="allow-scripts allow-same-origin"`. The filename (minus `.html`) becomes the display name. No metadata exports needed.

## Example: minimum viable tool

Create `frontend/src/tools/hello.js`:

```js
export const name = "Hello World";
export const description = "A minimal sample tool";

export function init(container) {
  const el = document.createElement("div");
  el.style.cssText = "padding:2rem;color:var(--color-text);";
  el.textContent = "Hello from a tool!";
  container.appendChild(el);

  return () => { container.removeChild(el); };
}

export function destroy(container) {
  container.innerHTML = "";
}
```

## What to generate

Generate a tool that [DESCRIBE YOUR IDEA HERE]. Follow all the conventions above:
- Use `var(--color-*)` for theme support
- Use inline `.style.cssText` for styling
- No JSX, no React components
- Return a cleanup function from `init`
- Set `container.innerHTML = ""` in `destroy`
- If using Three.js, dispose all resources in cleanup
- File name will become the URL slug — use kebab-case
```

---

To use: copy the block above, replace `[DESCRIBE YOUR IDEA HERE]` with your tool idea, and paste the whole thing into another LLM. The generated `.js` file goes directly into `frontend/src/tools/` and will appear in the app on next build.

A reusable copy of this prompt also lives at the repo root as `new_tool_prompt.md`.
