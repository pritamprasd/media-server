export const icon = "📄";
export const name = "PDF Tools";
export const description = "All-in-one PDF editor, converter, compressor and more";

export function init(container) {
  const url = "http://homeserver.local:15010";

  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;flex-direction:column;height:100%;padding:2rem;gap:1.5rem;align-items:center;justify-content:center;overflow-y:auto;";

  const icon = document.createElement("div");
  icon.textContent = "📄";
  icon.style.cssText = "font-size:4rem;line-height:1;";

  const heading = document.createElement("h2");
  heading.textContent = "PDF Tools";
  heading.style.cssText =
    "margin:0;font-size:1.4rem;font-weight:700;color:var(--color-text);text-align:center;";

  const desc = document.createElement("p");
  desc.textContent = "Merge, split, compress, convert, edit, and sign PDFs.";
  desc.style.cssText =
    "margin:0;font-size:0.9rem;color:var(--color-text-muted);text-align:center;max-width:360px;line-height:1.5;";

  const btn = document.createElement("a");
  btn.href = url;
  btn.target = "_blank";
  btn.rel = "noopener noreferrer";
  btn.textContent = "Open PDF Tools";
  btn.style.cssText =
    "display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.75rem;border:none;border-radius:10px;background:var(--color-primary);color:#fff;font-size:1rem;font-weight:600;cursor:pointer;text-decoration:none;transition:opacity 0.15s;";
  btn.onmouseenter = () => { btn.style.opacity = "0.85"; };
  btn.onmouseleave = () => { btn.style.opacity = "1"; };

  wrapper.appendChild(icon);
  wrapper.appendChild(heading);
  wrapper.appendChild(desc);
  wrapper.appendChild(btn);

  container.appendChild(wrapper);

  return () => { wrapper.remove(); };
}

export function destroy(container) {
  container.innerHTML = "";
}
