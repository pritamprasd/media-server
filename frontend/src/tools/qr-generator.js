import QRCode from "qrcode";

export const name = "QR Code Generator";
export const description = "Generate and download QR codes from any text or URL";

export function init(container) {
  const wrapper = document.createElement("div");
  wrapper.className = "tool-qr-wrapper";
  wrapper.style.cssText =
    "display:flex;flex-direction:column;height:100%;padding:1.5rem;gap:1.25rem;align-items:center;overflow-y:auto;";
  container.appendChild(wrapper);

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Enter text or URL...";
  input.value = "https://example.com";
  input.style.cssText =
    "width:100%;max-width:400px;padding:0.65rem 0.85rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg);color:var(--color-text);font-size:0.95rem;outline:none;";

  const optionsRow = document.createElement("div");
  optionsRow.style.cssText =
    "display:flex;flex-wrap:wrap;gap:1rem;max-width:400px;width:100%;align-items:center;";

  const sizeGroup = createSelectGroup("Size", ["128", "256", "512", "1024"], "256");
  const errorGroup = createSelectGroup("Error Correction", [
    { value: "L", label: "Low (7%)" },
    { value: "M", label: "Medium (15%)" },
    { value: "Q", label: "Quartile (25%)" },
    { value: "H", label: "High (30%)" },
  ], "M");

  const errorInfo = document.createElement("div");
  errorInfo.style.cssText =
    "max-width:400px;width:100%;font-size:0.78rem;color:var(--color-text-muted);line-height:1.5;padding:0.5rem 0.65rem;background:var(--color-bg);border-radius:6px;border:1px solid var(--color-border);";
  errorInfo.innerHTML =
    "<strong>What's this?</strong> Error correction lets QR codes stay scannable even when partially damaged or covered. " +
    "<strong>Low (7%)</strong> &mdash; smallest QR, best for clean prints like flyers. " +
    "<strong>Medium (15%)</strong> &mdash; good all-rounder for most use cases. " +
    "<strong>Quartile (25%)</strong> &mdash; lets you place a logo or sticker over the code. " +
    "<strong>High (30%)</strong> &mdash; toughest, for harsh environments where the code may get scratched.";

  const colorRow = document.createElement("div");
  colorRow.style.cssText =
    "display:flex;flex-wrap:wrap;gap:1rem;max-width:400px;width:100%;align-items:center;";

  const fgColor = createColorPicker("Foreground", "#000000");
  const bgColor = createColorPicker("Background", "#ffffff");

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "max-width:100%;height:auto;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);";

  const btnRow = document.createElement("div");
  btnRow.style.cssText =
    "display:flex;gap:0.75rem;flex-wrap:wrap;justify-content:center;";

  const genBtn = document.createElement("button");
  genBtn.textContent = "Generate";
  genBtn.style.cssText = btnStyle("var(--color-primary)", "#fff");
  genBtn.addEventListener("click", generate);

  const dlBtn = document.createElement("button");
  dlBtn.textContent = "Download PNG";
  dlBtn.style.cssText = btnStyle("var(--color-surface)", "var(--color-text)");
  dlBtn.style.border = "1px solid var(--color-border)";
  dlBtn.addEventListener("click", download);

  wrapper.appendChild(input);
  optionsRow.appendChild(sizeGroup);
  optionsRow.appendChild(errorGroup);
  wrapper.appendChild(optionsRow);
  wrapper.appendChild(errorInfo);
  colorRow.appendChild(fgColor);
  colorRow.appendChild(bgColor);
  wrapper.appendChild(colorRow);
  wrapper.appendChild(canvas);
  btnRow.appendChild(genBtn);
  btnRow.appendChild(dlBtn);
  wrapper.appendChild(btnRow);

  let currentDataURL = null;

  function generate() {
    const text = input.value.trim();
    if (!text) return;

    const size = parseInt(sizeGroup.querySelector("select").value, 10);
    const errLevel = errorGroup.querySelector("select").value;
    const dark = fgColor.querySelector('input[type="color"]').value;
    const light = bgColor.querySelector('input[type="color"]').value;

    QRCode.toCanvas(
      canvas,
      text,
      {
        width: size,
        margin: 2,
        errorCorrectionLevel: errLevel,
        color: { dark, light },
      },
      (err) => {
        if (err) console.error(err);
      }
    );
  }

  function download() {
    if (!currentDataURL && canvas.toDataURL) {
      currentDataURL = canvas.toDataURL("image/png");
    }
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.download = "qrcode.png";
    a.href = url;
    a.click();
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") generate();
  });

  generate();

  return () => {
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = "";
}

function createSelectGroup(label, options, defaultValue) {
  const group = document.createElement("label");
  group.style.cssText =
    "display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--color-text-muted);";

  const span = document.createElement("span");
  span.textContent = label;
  group.appendChild(span);

  const select = document.createElement("select");
  select.style.cssText =
    "padding:0.35rem 0.5rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:0.82rem;outline:none;";

  for (const opt of options) {
    const el = document.createElement("option");
    if (typeof opt === "object") {
      el.value = opt.value;
      el.textContent = opt.label;
    } else {
      el.value = opt;
      el.textContent = opt;
    }
    if (el.value === defaultValue) el.selected = true;
    select.appendChild(el);
  }

  group.appendChild(select);
  return group;
}

function createColorPicker(label, defaultValue) {
  const group = document.createElement("label");
  group.style.cssText =
    "display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--color-text-muted);";

  const span = document.createElement("span");
  span.textContent = label;
  group.appendChild(span);

  const input = document.createElement("input");
  input.type = "color";
  input.value = defaultValue;
  input.style.cssText = "width:32px;height:32px;border:none;border-radius:4px;cursor:pointer;background:none;padding:0;";

  group.appendChild(input);
  return group;
}

function btnStyle(bg, color) {
  return (
    `padding:0.55rem 1.2rem;border:none;border-radius:8px;background:${bg};color:${color};font-size:0.88rem;font-weight:600;cursor:pointer;transition:opacity 0.15s;`
  );
}
