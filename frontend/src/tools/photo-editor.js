export const icon = '🎨';
export const name = 'Photo Editor';
export const description = 'Upload, edit and download images with filters, adjustments, crop and more';

const FILTERS = [
  { name: 'normal', label: 'Normal', css: '' },
  { name: 'vivid', label: 'Vivid', css: 'saturate(1.4) contrast(1.25)' },
  { name: 'dramatic', label: 'Dramatic', css: 'contrast(1.6) brightness(0.95)' },
  { name: 'vintage', label: 'Vintage', css: 'saturate(0.7) sepia(0.35) brightness(1.05)' },
  { name: 'noir', label: 'Noir', css: 'grayscale(1) contrast(1.3)' },
  { name: 'soft', label: 'Soft', css: 'brightness(1.1) contrast(0.9) saturate(0.85)' },
  { name: 'clarity', label: 'Clarity', css: 'contrast(1.15) saturate(1.1)' },
  { name: 'warm', label: 'Warm', css: 'sepia(0.15) saturate(1.2) hue-rotate(10deg)' },
  { name: 'cool', label: 'Cool', css: 'saturate(0.9) hue-rotate(200deg) brightness(1.05)' },
];

const ASPECT_RATIOS = [
  { label: 'Free', value: 'free' },
  { label: '1:1', value: '1:1' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
];

const TABS = [
  { id: 'filters', label: 'Filters', icon: '✨' },
  { id: 'adjust', label: 'Adjust', icon: '🔧' },
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'effects', label: 'Effects', icon: '🎭' },
  { id: 'details', label: 'Details', icon: '🔍' },
  { id: 'colors', label: 'Colors', icon: '🎨' },
  { id: 'crop', label: 'Crop', icon: '✂️' },
];

function defaultAdjust() {
  return {
    brightness: 1, contrast: 1, saturation: 1, warmth: 0, sharpness: 1,
    highlights: 0, shadows: 0, vignette: 0, tint: 0, vibrance: 1,
    clarity: 1, dehaze: 0, exposure: 0, blacks: 0, whites: 0,
    grain: 0, grayscale: 0, colorize: 0,
  };
}

function computePreviewFilter(adjust, activeFilter) {
  const filterData = FILTERS.find(f => f.name === activeFilter) || FILTERS[0];
  const b = adjust.brightness * (1 + adjust.exposure / 150);
  const cMod = adjust.contrast * adjust.clarity;
  const shadowBright = 1 - adjust.shadows / 350;
  const shadowContr = 1 + adjust.shadows / 250;
  const hlBright = 1 + adjust.highlights / 350;
  const hlContr = 1 - adjust.highlights / 250;
  const blacksBright = 1 - adjust.blacks / 350;
  const blacksContr = 1 + adjust.blacks / 250;
  const whitesBright = 1 + adjust.whites / 350;
  const whitesContr = 1 - adjust.whites / 250;
  const combinedB = b * shadowBright * hlBright * blacksBright * whitesBright;
  const combinedC = cMod * shadowContr * hlContr * blacksContr * whitesContr;
  const parts = [];
  parts.push(`brightness(${combinedB})`);
  parts.push(`contrast(${combinedC})`);
  parts.push(`saturate(${adjust.saturation * adjust.vibrance})`);
  if (adjust.dehaze) {
    parts.push(`contrast(${1 + adjust.dehaze / 60})`);
    parts.push(`brightness(${1 + adjust.dehaze / 120})`);
  }
  if (filterData.css) parts.push(filterData.css);
  parts.push(`hue-rotate(${adjust.tint * 0.3}deg)`);
  if (adjust.warmth) {
    const w = adjust.warmth / 100;
    parts.push(`hue-rotate(${w * 15}deg)`);
    if (w > 0) parts.push(`sepia(${w * 0.2})`);
  }
  if (adjust.grayscale) parts.push('grayscale(1)');
  if (adjust.colorize) {
    parts.push(`sepia(${Math.min(1, adjust.colorize / 60)})`);
    parts.push(`hue-rotate(${adjust.colorize * 1.2}deg)`);
    parts.push(`saturate(${Math.min(3, 1 + adjust.colorize / 40)})`);
  }
  return parts.join(' ');
}

function ce(tag, cssText, parent) {
  const e = document.createElement(tag);
  if (cssText) e.style.cssText = cssText;
  if (parent) parent.appendChild(e);
  return e;
}

export function init(container) {
  const S = {
    adjust: defaultAdjust(),
    activeFilter: 'normal',
    operations: [],
    crop: null,
    cropApplied: false,
    cropAspect: 'free',
    selectedColors: [],
    colorTolerance: 30,
    exportFormat: 'jpeg',
    exportQuality: 90,
    showOriginal: false,
    currentTab: 'filters',
  };

  let imgEl = null;
  let imgSrc = null;
  let prominentColors = [];
  let selectiveColorSrc = null;
  let cropDrag = null;
  let cropAspectRef = 'free';
  let cleanupFns = [];

  const style = document.createElement('style');
  style.textContent = `
    .pe-upload{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.5rem;border:2px dashed var(--color-border);border-radius:12px;margin:1rem;cursor:pointer;transition:border-color .2s,background .2s}
    .pe-upload:hover,.pe-upload.dragover{border-color:var(--color-primary);background:var(--color-surface)}
    .pe-upload-icon{font-size:3rem;opacity:.5}
    .pe-upload-text{font-size:1.1rem;color:var(--color-text-muted)}
    .pe-upload-hint{font-size:.8rem;color:var(--color-text-muted);opacity:.7}
    .pe-editor{display:none;flex-direction:column;height:100%}
    .pe-toolbar{display:flex;align-items:center;gap:.5rem;padding:.5rem .75rem;background:var(--color-surface);border-bottom:1px solid var(--color-border);flex-shrink:0;flex-wrap:wrap}
    .pe-btn{padding:.35rem .7rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-surface);color:var(--color-text);cursor:pointer;font-size:.8rem;display:flex;align-items:center;gap:.3rem;transition:background .15s;white-space:nowrap}
    .pe-btn:hover{background:var(--color-bg)}
    .pe-btn--primary{background:var(--color-primary);color:#fff;border-color:var(--color-primary)}
    .pe-btn--primary:hover{opacity:.9}
    .pe-btn--danger{color:#e74c3c}
    .pe-sep{width:1px;height:1.5rem;background:var(--color-border);flex-shrink:0}
    .pe-main{display:flex;flex:1;min-height:0;overflow:hidden}
    .pe-preview{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;overflow:hidden;position:relative;background:var(--color-bg)}
    .pe-img-wrap{position:relative;display:inline-block;line-height:0}
    .pe-img{display:block;max-width:100%;max-height:calc(100vh - 180px);object-fit:contain}
    .pe-orig-btn{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:.3rem .8rem;border-radius:20px;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:.75rem;z-index:10;user-select:none}
    .pe-orig-btn:active{background:rgba(0,0,0,.8)}
    .pe-histogram{width:200px;height:60px;margin-top:4px;border-radius:4px}
    .pe-panel{width:280px;flex-shrink:0;display:flex;flex-direction:column;border-left:1px solid var(--color-border);background:var(--color-surface);overflow:hidden}
    .pe-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--color-border);flex-shrink:0}
    .pe-tab{flex:1;min-width:0;padding:.5rem .25rem;border:none;background:none;color:var(--color-text-muted);cursor:pointer;font-size:.7rem;display:flex;flex-direction:column;align-items:center;gap:.15rem;transition:color .15s;border-bottom:2px solid transparent}
    .pe-tab:hover{color:var(--color-text)}
    .pe-tab--active{color:var(--color-primary);border-bottom-color:var(--color-primary)}
    .pe-tab-icon{font-size:1rem}
    .pe-tab-content{flex:1;overflow-y:auto;padding:.75rem}
    .pe-sliders{display:flex;flex-direction:column;gap:.6rem}
    .pe-slider-row{display:flex;align-items:center;gap:.5rem}
    .pe-slider-label{font-size:.78rem;color:var(--color-text-muted);min-width:70px}
    .pe-slider-val{font-size:.75rem;color:var(--color-text-muted);min-width:35px;text-align:right}
    .pe-slider{flex:1;accent-color:var(--color-primary)}
    .pe-hint{font-size:.7rem;color:var(--color-text-muted);opacity:.6;text-align:center;margin-top:.5rem}
    .pe-filters-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}
    .pe-filter-btn{padding:.3rem;border:2px solid transparent;border-radius:8px;background:var(--color-bg);cursor:pointer;text-align:center;transition:border-color .15s}
    .pe-filter-btn:hover{border-color:var(--color-border)}
    .pe-filter-btn--active{border-color:var(--color-primary)}
    .pe-filter-thumb{width:100%;aspect-ratio:1;border-radius:4px;overflow:hidden}
    .pe-filter-thumb img{width:100%;height:100%;object-fit:cover}
    .pe-filter-label{font-size:.7rem;color:var(--color-text-muted);margin-top:.2rem;display:block}
    .pe-crop-tools{display:flex;flex-direction:column;gap:.6rem}
    .pe-crop-aspects{display:flex;flex-wrap:wrap;gap:.35rem}
    .pe-crop-asp{padding:.3rem .5rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text-muted);cursor:pointer;font-size:.75rem}
    .pe-crop-asp:hover{color:var(--color-text)}
    .pe-crop-asp--active{background:var(--color-primary);color:#fff;border-color:var(--color-primary)}
    .pe-crop-ops{display:flex;gap:.5rem;flex-wrap:wrap}
    .pe-crop-op{padding:.4rem .6rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);cursor:pointer;font-size:.85rem}
    .pe-crop-op:hover{color:var(--color-primary)}
    .pe-crop-overlay{position:absolute;inset:0;z-index:5}
    .pe-crop-rect{position:absolute;border:2px solid rgba(255,255,255,.8);box-shadow:0 0 0 9999px rgba(0,0,0,.45)}
    .pe-crop-handle{position:absolute;width:12px;height:12px;background:#fff;border:2px solid var(--color-primary);border-radius:50%}
    .pe-crop-handle--nw{top:-6px;left:-6px;cursor:nwse-resize}
    .pe-crop-handle--ne{top:-6px;right:-6px;cursor:nesw-resize}
    .pe-crop-handle--sw{bottom:-6px;left:-6px;cursor:nesw-resize}
    .pe-crop-handle--se{bottom:-6px;right:-6px;cursor:nwse-resize}
    .pe-crop-move{position:absolute;inset:0;cursor:move}
    .pe-colors-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:.4rem}
    .pe-colors-swatch{display:flex;flex-direction:column;border:2px solid transparent;border-radius:6px;overflow:hidden;cursor:pointer;background:var(--color-bg)}
    .pe-colors-swatch:hover{border-color:var(--color-border)}
    .pe-colors-swatch--active{border-color:var(--color-primary)}
    .pe-colors-swatch-color{height:32px}
    .pe-colors-swatch-label{font-size:.65rem;padding:.15rem .3rem;color:var(--color-text-muted);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pe-colors-clear{font-size:.75rem;color:var(--color-primary);cursor:pointer;background:none;border:none;padding:.25rem 0}
    .pe-colors-hint{font-size:.75rem;color:var(--color-text-muted);margin-bottom:.5rem}
    .pe-select{padding:.3rem .5rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:.8rem}
    .pe-quality-row{display:flex;align-items:center;gap:.4rem}
    .pe-quality-label{font-size:.78rem;color:var(--color-text-muted)}
    .pe-quality-val{font-size:.75rem;color:var(--color-text-muted);min-width:28px;text-align:right}
    .pe-overlay-vignette{position:absolute;inset:0;pointer-events:none;border-radius:inherit}
    .pe-overlay-grain{position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay}
    .pe-overlay-colorize{position:absolute;inset:0;pointer-events:none;mix-blend-mode:color}
    @media(max-width:700px){
      .pe-panel{width:100%;border-left:none;border-top:1px solid var(--color-border);max-height:40vh}
      .pe-main{flex-direction:column}
      .pe-img{max-height:calc(50vh - 80px)}
    }
  `;
  container.appendChild(style);

  const wrapper = ce('div', 'display:flex;flex-direction:column;height:100%;', container);

  const uploadZone = ce('div', '', wrapper);
  uploadZone.className = 'pe-upload';
  uploadZone.innerHTML = '<div class="pe-upload-icon">📷</div><div class="pe-upload-text">Drop an image here or click to upload</div><div class="pe-upload-hint">Supports JPEG, PNG, WebP, GIF, BMP</div>';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  uploadZone.appendChild(fileInput);

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  const onDrop = (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('image/')) handleFile(f); };
  uploadZone.addEventListener('drop', onDrop);
  cleanupFns.push(() => uploadZone.removeEventListener('drop', onDrop));
  fileInput.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) handleFile(f); fileInput.value = ''; });

  const editor = ce('div', '', wrapper);
  editor.className = 'pe-editor';

  const toolbar = ce('div', '', editor);
  toolbar.className = 'pe-toolbar';
  const uploadBtn = ce('button', '', toolbar);
  uploadBtn.className = 'pe-btn';
  uploadBtn.textContent = '📷 Upload';
  uploadBtn.addEventListener('click', () => fileInput.click());
  const resetBtn = ce('button', '', toolbar);
  resetBtn.className = 'pe-btn pe-btn--danger';
  resetBtn.textContent = '↺ Reset';
  resetBtn.addEventListener('click', resetAll);
  ce('div', '', toolbar).className = 'pe-sep';
  const formatSelect = document.createElement('select');
  formatSelect.className = 'pe-select';
  [['jpeg', 'JPEG'], ['png', 'PNG'], ['webp', 'WebP']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; formatSelect.appendChild(o); });
  formatSelect.addEventListener('change', () => { S.exportFormat = formatSelect.value; });
  toolbar.appendChild(formatSelect);
  const qualityRow = ce('div', '', toolbar);
  qualityRow.className = 'pe-quality-row';
  ce('span', '', qualityRow).textContent = 'Q:';
  qualityRow.lastChild.className = 'pe-quality-label';
  const qualitySlider = ce('input', 'width:60px;accent-color:var(--color-primary);', qualityRow);
  qualitySlider.type = 'range'; qualitySlider.min = 10; qualitySlider.max = 100; qualitySlider.value = 90;
  const qualityVal = ce('span', '', qualityRow);
  qualityVal.className = 'pe-quality-val';
  qualityVal.textContent = '90%';
  qualitySlider.addEventListener('input', () => { S.exportQuality = parseInt(qualitySlider.value); qualityVal.textContent = S.exportQuality + '%'; });
  ce('div', '', toolbar).className = 'pe-sep';
  const dlBtn = ce('button', '', toolbar);
  dlBtn.className = 'pe-btn pe-btn--primary';
  dlBtn.textContent = '⬇ Download';
  dlBtn.addEventListener('click', download);

  const mainArea = ce('div', '', editor);
  mainArea.className = 'pe-main';

  const previewArea = ce('div', '', mainArea);
  previewArea.className = 'pe-preview';
  const imgWrap = ce('div', '', previewArea);
  imgWrap.className = 'pe-img-wrap';
  imgEl = document.createElement('img');
  imgEl.className = 'pe-img';
  imgEl.style.display = 'none';
  imgWrap.appendChild(imgEl);

  const origBtn = ce('button', '', imgWrap);
  origBtn.className = 'pe-orig-btn';
  origBtn.textContent = 'Hold for original';
  const origDown = () => { S.showOriginal = true; updatePreview(); };
  const origUp = () => { S.showOriginal = false; updatePreview(); };
  origBtn.addEventListener('mousedown', origDown);
  origBtn.addEventListener('mouseup', origUp);
  origBtn.addEventListener('mouseleave', origUp);
  origBtn.addEventListener('touchstart', (e) => { e.preventDefault(); origDown(); });
  origBtn.addEventListener('touchend', origUp);
  cleanupFns.push(() => { origBtn.removeEventListener('mousedown', origDown); origBtn.removeEventListener('mouseup', origUp); origBtn.removeEventListener('mouseleave', origUp); });

  const histCanvas = document.createElement('canvas');
  histCanvas.className = 'pe-histogram';
  histCanvas.width = 200;
  histCanvas.height = 60;
  previewArea.appendChild(histCanvas);

  const cropOverlay = ce('div', '', imgWrap);
  cropOverlay.className = 'pe-crop-overlay';
  cropOverlay.style.display = 'none';
  const cropRect = ce('div', '', cropOverlay);
  cropRect.className = 'pe-crop-rect';
  const cropMove = ce('div', '', cropRect);
  cropMove.className = 'pe-crop-move';
  ['nw', 'ne', 'sw', 'se'].forEach(pos => {
    const h = ce('div', '', cropRect);
    h.className = 'pe-crop-handle pe-crop-handle--' + pos;
    const handler = (e) => onCropMouseDown(e, pos);
    h.addEventListener('mousedown', handler);
    cleanupFns.push(() => h.removeEventListener('mousedown', handler));
  });
  const moveHandler = (e) => onCropMouseDown(e, 'move');
  cropMove.addEventListener('mousedown', moveHandler);
  cleanupFns.push(() => cropMove.removeEventListener('mousedown', moveHandler));

  const panel = ce('div', '', mainArea);
  panel.className = 'pe-panel';
  const tabBar = ce('div', '', panel);
  tabBar.className = 'pe-tabs';
  const tabContent = ce('div', '', panel);
  tabContent.className = 'pe-tab-content';

  const tabBtns = [];
  TABS.forEach(tab => {
    const btn = ce('button', '', tabBar);
    btn.className = 'pe-tab';
    btn.dataset.tab = tab.id;
    btn.innerHTML = '<span class="pe-tab-icon">' + tab.icon + '</span><span>' + tab.label + '</span>';
    btn.addEventListener('click', () => switchTab(tab.id));
    tabBtns.push(btn);
  });

  function handleFile(file) {
    resetAll();
    const reader = new FileReader();
    reader.onload = (e) => loadImage(e.target.result);
    reader.readAsDataURL(file);
  }

  function loadImage(src) {
    imgSrc = src;
    const tmp = new Image();
    tmp.onload = () => {
      imgEl.src = src;
      imgEl.style.display = '';
      uploadZone.style.display = 'none';
      editor.style.display = 'flex';
      prominentColors = [];
      selectiveColorSrc = null;
      S.selectedColors = [];
      updatePreview();
      switchTab(S.currentTab);
      setTimeout(() => { extractColors(); drawHistogram(); }, 100);
    };
    tmp.onerror = () => { alert('Failed to load image. Try a different format.'); };
    tmp.src = src;
  }

  function switchTab(tabId) {
    S.currentTab = tabId;
    if (tabId === 'crop' && !S.crop && !S.cropApplied) {
      S.crop = { x: 0, y: 0, w: 1, h: 1 };
    }
    tabBtns.forEach(btn => btn.classList.toggle('pe-tab--active', btn.dataset.tab === tabId));
    renderTabContent(tabId);
    updateCropOverlay();
  }

  function renderTabContent(tabId) {
    tabContent.innerHTML = '';
    switch (tabId) {
      case 'filters': renderFiltersTab(); break;
      case 'adjust': renderAdjustTab(); break;
      case 'light': renderLightTab(); break;
      case 'effects': renderEffectsTab(); break;
      case 'details': renderDetailsTab(); break;
      case 'colors': renderColorsTab(); break;
      case 'crop': renderCropTab(); break;
    }
  }

  function renderFiltersTab() {
    const grid = ce('div', '', tabContent);
    grid.className = 'pe-filters-grid';
    FILTERS.forEach(f => {
      const btn = ce('button', '', grid);
      btn.className = 'pe-filter-btn' + (S.activeFilter === f.name ? ' pe-filter-btn--active' : '');
      const thumb = ce('div', '', btn);
      thumb.className = 'pe-filter-thumb';
      if (imgSrc) {
        const thumbImg = document.createElement('img');
        thumbImg.src = imgSrc;
        thumbImg.style.filter = f.css || 'none';
        thumb.appendChild(thumbImg);
      }
      const lbl = ce('span', '', btn);
      lbl.className = 'pe-filter-label';
      lbl.textContent = f.label;
      btn.addEventListener('click', () => { S.activeFilter = f.name; renderFiltersTab(); updatePreview(); });
    });
  }

  function renderAdjustTab() {
    const s = ce('div', '', tabContent);
    s.className = 'pe-sliders';
    addSlider(s, 'brightness', 'Brightness', 0, 2, 0.01);
    addSlider(s, 'contrast', 'Contrast', 0, 2, 0.01);
    addSlider(s, 'saturation', 'Saturation', 0, 2, 0.01);
    addSlider(s, 'vibrance', 'Vibrance', 0, 2, 0.01);
    addSlider(s, 'warmth', 'Warmth', -100, 100, 1);
    addSlider(s, 'tint', 'Tint', -100, 100, 1);
    addSlider(s, 'sharpness', 'Sharpness', 0, 2, 0.01);
    const h = ce('div', '', s); h.className = 'pe-hint'; h.textContent = 'Changes applied on download';
  }

  function renderLightTab() {
    const s = ce('div', '', tabContent);
    s.className = 'pe-sliders';
    addSlider(s, 'exposure', 'Exposure', -100, 100, 1);
    addSlider(s, 'highlights', 'Highlights', -100, 100, 1);
    addSlider(s, 'shadows', 'Shadows', -100, 100, 1);
    addSlider(s, 'whites', 'Whites', -100, 100, 1);
    addSlider(s, 'blacks', 'Blacks', -100, 100, 1);
    const h = ce('div', '', s); h.className = 'pe-hint'; h.textContent = 'Changes applied on download';
  }

  function renderEffectsTab() {
    const s = ce('div', '', tabContent);
    s.className = 'pe-sliders';
    addSlider(s, 'vignette', 'Vignette', 0, 100, 1);
    addSlider(s, 'grain', 'Grain', 0, 100, 1);
    addSlider(s, 'colorize', 'Colorize', 0, 100, 1);
    const row = ce('div', '', s);
    row.className = 'pe-slider-row';
    ce('span', '', row).className = 'pe-slider-label';
    row.querySelector('.pe-slider-label').textContent = 'Grayscale';
    const toggle = ce('button', '', row);
    toggle.className = 'pe-btn' + (S.adjust.grayscale ? ' pe-btn--primary' : '');
    toggle.textContent = S.adjust.grayscale ? 'On' : 'Off';
    toggle.style.cssText = 'padding:.25rem .6rem;font-size:.75rem;';
    toggle.addEventListener('click', () => { S.adjust.grayscale = S.adjust.grayscale ? 0 : 1; renderEffectsTab(); updatePreview(); });
  }

  function renderDetailsTab() {
    const s = ce('div', '', tabContent);
    s.className = 'pe-sliders';
    addSlider(s, 'clarity', 'Clarity', 0, 2, 0.01);
    addSlider(s, 'dehaze', 'Dehaze', 0, 100, 1);
    const h = ce('div', '', s); h.className = 'pe-hint'; h.textContent = 'Changes applied on download';
  }

  function renderColorsTab() {
    const s = ce('div', '', tabContent);
    s.className = 'pe-sliders';
    addSlider(s, '_tolerance', 'Tolerance', 1, 100, 1);
    const hint = ce('div', '', tabContent);
    hint.className = 'pe-colors-hint';
    hint.textContent = S.selectedColors.length > 0
      ? 'Selected colors remain; everything else turns grayscale.'
      : 'Pick colors to keep; other areas become grayscale.';
    if (S.selectedColors.length > 0) {
      const clearBtn = ce('button', '', tabContent);
      clearBtn.className = 'pe-colors-clear';
      clearBtn.textContent = 'Clear all (' + S.selectedColors.length + ')';
      clearBtn.addEventListener('click', () => { S.selectedColors = []; updateSelectiveColor(); renderColorsTab(); });
    }
    const grid = ce('div', '', tabContent);
    grid.className = 'pe-colors-grid';
    if (prominentColors.length === 0) {
      ce('div', 'grid-column:1/-1;text-align:center;padding:1rem;color:var(--color-text-muted);font-size:.8rem;', grid).textContent = 'Analyzing colors...';
    }
    prominentColors.forEach((c) => {
      const isActive = S.selectedColors.some(sc => sc.r === c.r && sc.g === c.g && sc.b === c.b);
      const swatch = ce('button', '', grid);
      swatch.className = 'pe-colors-swatch' + (isActive ? ' pe-colors-swatch--active' : '');
      const colorDiv = ce('div', '', swatch);
      colorDiv.className = 'pe-colors-swatch-color';
      colorDiv.style.background = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      const lbl = ce('span', '', swatch);
      lbl.className = 'pe-colors-swatch-label';
      lbl.textContent = '#' + c.r.toString(16).padStart(2, '0') + c.g.toString(16).padStart(2, '0') + c.b.toString(16).padStart(2, '0') + (c.pct != null ? ' ' + c.pct + '%' : '');
      swatch.addEventListener('click', () => {
        if (isActive) { S.selectedColors = S.selectedColors.filter(sc => sc.r !== c.r || sc.g !== c.g || sc.b !== c.b); }
        else { S.selectedColors.push(c); }
        updateSelectiveColor();
        renderColorsTab();
      });
    });
  }

  function renderCropTab() {
    const tools = ce('div', '', tabContent);
    tools.className = 'pe-crop-tools';
    const aspects = ce('div', '', tools);
    aspects.className = 'pe-crop-aspects';
    ASPECT_RATIOS.forEach(ar => {
      const btn = ce('button', '', aspects);
      btn.className = 'pe-crop-asp' + (S.cropAspect === ar.value ? ' pe-crop-asp--active' : '');
      btn.textContent = ar.label;
      btn.addEventListener('click', () => setCropAspect(ar.value));
    });
    if (!S.cropApplied) {
      const applyBtn = ce('button', '', tools);
      applyBtn.className = 'pe-btn';
      applyBtn.textContent = '✂ Apply Crop';
      applyBtn.addEventListener('click', () => { if (S.crop) { S.cropApplied = true; updateCropOverlay(); renderCropTab(); } });
    } else {
      const resetCropBtn = ce('button', '', tools);
      resetCropBtn.className = 'pe-btn';
      resetCropBtn.textContent = '↩ Reset Crop';
      resetCropBtn.addEventListener('click', () => { S.cropApplied = false; updateCropOverlay(); renderCropTab(); });
    }
    const ops = ce('div', '', tools);
    ops.className = 'pe-crop-ops';
    [
      { label: '↺ Left', op: { type: 'rotate', degrees: -90 } },
      { label: '↻ Right', op: { type: 'rotate', degrees: 90 } },
      { label: '↔ Flip H', op: { type: 'flip', direction: 'horizontal' } },
      { label: '↕ Flip V', op: { type: 'flip', direction: 'vertical' } },
    ].forEach(({ label, op }) => {
      const btn = ce('button', '', ops);
      btn.className = 'pe-crop-op';
      btn.textContent = label;
      btn.addEventListener('click', () => { S.operations.push(op); updatePreview(); updateCropOverlay(); });
    });
    if (S.operations.length > 0) {
      const h = ce('div', '', tools); h.className = 'pe-hint'; h.textContent = S.operations.length + ' operation(s) pending';
    }
  }

  function addSlider(parent, key, label, min, max, step) {
    const isInt = step >= 1;
    const val = key === '_tolerance' ? S.colorTolerance : S.adjust[key];
    const row = ce('div', '', parent);
    row.className = 'pe-slider-row';
    const lbl = ce('span', '', row); lbl.className = 'pe-slider-label'; lbl.textContent = label;
    const slider = ce('input', '', row);
    slider.className = 'pe-slider';
    slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = val;
    const valSpan = ce('span', '', row);
    valSpan.className = 'pe-slider-val';
    valSpan.textContent = isInt ? val : val.toFixed(2);
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      if (key === '_tolerance') { S.colorTolerance = v; updateSelectiveColor(); }
      else { S.adjust[key] = v; }
      valSpan.textContent = isInt ? v : v.toFixed(2);
      updatePreview();
    });
  }

  function updatePreview() {
    if (!imgEl || !imgSrc) return;
    const filter = S.showOriginal ? 'none' : computePreviewFilter(S.adjust, S.activeFilter);
    let rot = 0, sx = 1, sy = 1;
    for (const op of S.operations) {
      if (op.type === 'rotate') rot += op.degrees;
      if (op.type === 'flip' && op.direction === 'horizontal') sx *= -1;
      if (op.type === 'flip' && op.direction === 'vertical') sy *= -1;
    }
    const transforms = [];
    if (rot) transforms.push('rotate(' + rot + 'deg)');
    if (sx !== 1 || sy !== 1) transforms.push('scale(' + sx + ',' + sy + ')');
    let clipPath;
    if (S.cropApplied && S.crop) {
      const top = S.crop.y * 100;
      const right = (1 - S.crop.x - S.crop.w) * 100;
      const bottom = (1 - S.crop.y - S.crop.h) * 100;
      const left = S.crop.x * 100;
      clipPath = 'inset(' + top + '% ' + right + '% ' + bottom + '% ' + left + '%)';
    }
    const src = selectiveColorSrc || imgSrc;
    if (imgEl.src !== src) imgEl.src = src;
    imgEl.style.filter = filter;
    imgEl.style.transform = transforms.join(' ') || 'none';
    imgEl.style.clipPath = clipPath || 'none';

    let vEl = imgWrap.querySelector('.pe-overlay-vignette');
    if (S.adjust.vignette > 0 && !S.showOriginal) {
      if (!vEl) { vEl = ce('div', 'position:absolute;inset:0;pointer-events:none;border-radius:inherit;', imgWrap); vEl.className = 'pe-overlay-vignette'; }
      vEl.style.background = 'radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,' + (S.adjust.vignette / 100) + ') 100%)';
    } else if (vEl) vEl.remove();

    let gEl = imgWrap.querySelector('.pe-overlay-grain');
    if (S.adjust.grain > 0 && !S.showOriginal) {
      if (!gEl) { gEl = ce('div', 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:overlay;', imgWrap); gEl.className = 'pe-overlay-grain'; }
      gEl.style.opacity = S.adjust.grain / 100;
      gEl.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
    } else if (gEl) gEl.remove();

    let cEl = imgWrap.querySelector('.pe-overlay-colorize');
    if (S.adjust.colorize > 0 && !S.showOriginal) {
      if (!cEl) { cEl = ce('div', 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:color;', imgWrap); cEl.className = 'pe-overlay-colorize'; }
      cEl.style.opacity = S.adjust.colorize / 100;
      cEl.style.background = 'linear-gradient(135deg,#d4a574,#c48b5c)';
    } else if (cEl) cEl.remove();

    drawHistogram();
  }

  function updateCropOverlay() {
    if (S.currentTab === 'crop' && S.crop && !S.cropApplied) {
      cropOverlay.style.display = '';
      cropRect.style.left = (S.crop.x * 100) + '%';
      cropRect.style.top = (S.crop.y * 100) + '%';
      cropRect.style.width = (S.crop.w * 100) + '%';
      cropRect.style.height = (S.crop.h * 100) + '%';
    } else {
      cropOverlay.style.display = 'none';
    }
  }

  function setCropAspect(ratio) {
    S.cropAspect = ratio;
    cropAspectRef = ratio;
    if (ratio === 'free') return;
    const [wr, hr] = ratio.split(':').map(Number);
    const target = wr / hr;
    let w = 1, h = 1;
    if (1 > target) { h = 1; w = h * target; } else { w = 1; h = w / target; }
    S.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
    updateCropOverlay();
    renderCropTab();
  }

  function onCropMouseDown(e, handle) {
    e.preventDefault();
    e.stopPropagation();
    if (!S.crop) S.crop = { x: 0, y: 0, w: 1, h: 1 };
    cropDrag = { handle, startX: e.clientX, startY: e.clientY, origCrop: { ...S.crop } };
    document.addEventListener('mousemove', onCropMouseMove);
    document.addEventListener('mouseup', onCropMouseUp);
  }

  function onCropMouseMove(e) {
    if (!cropDrag || !imgEl) return;
    const rect = imgEl.getBoundingClientRect();
    const dx = (e.clientX - cropDrag.startX) / rect.width;
    const dy = (e.clientY - cropDrag.startY) / rect.height;
    const orig = cropDrag.origCrop;
    let { x, y, w, h } = orig;
    if (cropDrag.handle === 'move') {
      x = orig.x + dx; y = orig.y + dy;
      if (x < 0) x = 0; if (y < 0) y = 0;
      if (x + w > 1) x = 1 - w; if (y + h > 1) y = 1 - h;
      S.crop = { x, y, w, h }; updateCropOverlay(); return;
    }
    switch (cropDrag.handle) {
      case 'se': w = orig.w + dx; h = orig.h + dy; break;
      case 'ne': w = orig.w + dx; y = orig.y + dy; h = orig.h - dy; break;
      case 'sw': x = orig.x + dx; w = orig.w - dx; h = orig.h + dy; break;
      case 'nw': x = orig.x + dx; y = orig.y + dy; w = orig.w - dx; h = orig.h - dy; break;
    }
    if (cropAspectRef !== 'free') {
      const [wr, hr] = cropAspectRef.split(':').map(Number);
      const target = wr / hr;
      if (cropDrag.handle === 'se' || cropDrag.handle === 'ne') { h = w / target; } else { w = h * target; }
    }
    if (x < 0) { w += x; x = 0; } if (y < 0) { h += y; y = 0; }
    if (x + w > 1) { w = 1 - x; } if (y + h > 1) { h = 1 - y; }
    if (w < 0.01) w = 0.01; if (h < 0.01) h = 0.01;
    S.crop = { x, y, w, h }; updateCropOverlay();
  }

  function onCropMouseUp() {
    cropDrag = null;
    document.removeEventListener('mousemove', onCropMouseMove);
    document.removeEventListener('mouseup', onCropMouseUp);
  }

  function drawHistogram() {
    const canvas = histCanvas;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) { ctx.clearRect(0, 0, W, H); return; }
    const offscreen = document.createElement('canvas');
    offscreen.width = imgEl.naturalWidth;
    offscreen.height = imgEl.naturalHeight;
    const octx = offscreen.getContext('2d');
    if (!S.showOriginal) octx.filter = computePreviewFilter(S.adjust, S.activeFilter);
    octx.drawImage(imgEl, 0, 0, offscreen.width, offscreen.height);
    const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
    const data = imageData.data;
    const bins = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      bins[Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2])]++;
    }
    const maxBin = Math.max(...bins, 1);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, W, H);
    const barW = W / 256;
    for (let i = 0; i < 256; i++) {
      const bh = (bins[i] / maxBin) * H;
      ctx.fillStyle = 'hsl(' + ((1 - i / 255) * 240) + ',70%,60%)';
      ctx.fillRect(i * barW, H - bh, Math.max(1, barW), bh);
    }
  }

  function extractColors() {
    if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) return;
    const canvas = document.createElement('canvas');
    const scale = 100 / Math.max(imgEl.naturalWidth, imgEl.naturalHeight);
    canvas.width = Math.max(1, Math.round(imgEl.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(imgEl.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const totalPixels = data.length / 4;
    const colorMap = {};
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] >> 3, g = data[i + 1] >> 3, b = data[i + 2] >> 3;
      const key = (r << 10) | (g << 5) | b;
      if (!colorMap[key]) colorMap[key] = { r: 0, g: 0, b: 0, count: 0 };
      colorMap[key].r += data[i]; colorMap[key].g += data[i + 1]; colorMap[key].b += data[i + 2]; colorMap[key].count += 1;
    }
    const sorted = Object.values(colorMap)
      .sort((a, b) => b.count - a.count)
      .map(c => ({ r: Math.round(c.r / c.count), g: Math.round(c.g / c.count), b: Math.round(c.b / c.count), count: c.count }))
      .filter(c => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) > 15);
    const merged = [];
    const threshold = 30;
    for (const c of sorted) {
      let found = false;
      for (const m of merged) {
        const dr = c.r - m.r, dg = c.g - m.g, db = c.b - m.b;
        if (dr * dr + dg * dg + db * db <= threshold * threshold) {
          const tc = m.count + c.count;
          m.r = Math.round((m.r * m.count + c.r * c.count) / tc);
          m.g = Math.round((m.g * m.count + c.g * c.count) / tc);
          m.b = Math.round((m.b * m.count + c.b * c.count) / tc);
          m.count = tc; found = true; break;
        }
      }
      if (!found) merged.push({ ...c });
    }
    merged.sort((a, b) => b.count - a.count);
    prominentColors = merged.slice(0, 20).map(c => ({ r: c.r, g: c.g, b: c.b, pct: Math.round(c.count / totalPixels * 100) }));
  }

  function updateSelectiveColor() {
    if (!imgEl || !imgEl.complete || S.selectedColors.length === 0) {
      selectiveColorSrc = null; updatePreview(); return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = imgEl.naturalWidth; canvas.height = imgEl.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    const tolSq = S.colorTolerance * S.colorTolerance;
    for (let i = 0; i < d.length; i += 4) {
      let keep = false;
      for (const sc of S.selectedColors) {
        const dr = d[i] - sc.r, dg = d[i + 1] - sc.g, db = d[i + 2] - sc.b;
        if (dr * dr + dg * dg + db * db <= tolSq) { keep = true; break; }
      }
      if (!keep) {
        const gray = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
        d[i] = d[i + 1] = d[i + 2] = gray;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    selectiveColorSrc = canvas.toDataURL('image/jpeg', 0.9);
    updatePreview();
  }

  function exportToCanvas() {
    if (!imgEl || !imgEl.complete || imgEl.naturalWidth === 0) return null;
    const filter = computePreviewFilter(S.adjust, S.activeFilter);
    let dispW = imgEl.naturalWidth, dispH = imgEl.naturalHeight;
    let totalRot = 0, flipH = false, flipV = false;
    for (const op of S.operations) {
      if (op.type === 'rotate') totalRot += op.degrees;
      if (op.type === 'flip' && op.direction === 'horizontal') flipH = !flipH;
      if (op.type === 'flip' && op.direction === 'vertical') flipV = !flipV;
    }
    if (totalRot % 180 !== 0) { const tmp = dispW; dispW = dispH; dispH = tmp; }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = dispW; tempCanvas.height = dispH;
    const tctx = tempCanvas.getContext('2d');
    tctx.filter = filter;
    tctx.translate(dispW / 2, dispH / 2);
    tctx.rotate(totalRot * Math.PI / 180);
    if (flipH) tctx.scale(-1, 1);
    if (flipV) tctx.scale(1, -1);
    tctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2);
    tctx.filter = 'none';

    let sx = 0, sy = 0, sw = dispW, sh = dispH;
    if (S.cropApplied && S.crop) {
      sx = Math.round(S.crop.x * dispW); sy = Math.round(S.crop.y * dispH);
      sw = Math.round(S.crop.w * dispW); sh = Math.round(S.crop.h * dispH);
    }
    if (sw < 1 || sh < 1) return null;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = sw; outCanvas.height = sh;
    const octx = outCanvas.getContext('2d');
    octx.drawImage(tempCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    if (S.selectedColors.length > 0) {
      const imgData = octx.getImageData(0, 0, sw, sh);
      const d = imgData.data;
      const tolSq = S.colorTolerance * S.colorTolerance;
      for (let i = 0; i < d.length; i += 4) {
        let keep = false;
        for (const sc of S.selectedColors) {
          const dr = d[i] - sc.r, dg = d[i + 1] - sc.g, db = d[i + 2] - sc.b;
          if (dr * dr + dg * dg + db * db <= tolSq) { keep = true; break; }
        }
        if (!keep) {
          const gray = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          d[i] = d[i + 1] = d[i + 2] = gray;
        }
      }
      octx.putImageData(imgData, 0, 0);
    }

    if (S.adjust.grain > 0) {
      const imgData = octx.getImageData(0, 0, sw, sh);
      const d = imgData.data;
      const amount = S.adjust.grain * 2.55;
      for (let i = 0; i < d.length; i += 4) {
        const noise = (Math.random() - 0.5) * amount;
        d[i] = Math.max(0, Math.min(255, d[i] + noise));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + noise));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + noise));
      }
      octx.putImageData(imgData, 0, 0);
    }

    if (S.adjust.vignette > 0) {
      const grad = octx.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.3, sw / 2, sh / 2, Math.max(sw, sh) * 0.7);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, 'rgba(0,0,0,' + (S.adjust.vignette / 100) + ')');
      octx.fillStyle = grad;
      octx.fillRect(0, 0, sw, sh);
    }

    if (S.adjust.colorize > 0) {
      octx.globalCompositeOperation = 'color';
      octx.fillStyle = '#c99568';
      octx.globalAlpha = S.adjust.colorize / 200;
      octx.fillRect(0, 0, sw, sh);
      octx.globalCompositeOperation = 'source-over';
      octx.globalAlpha = 1;
    }

    return outCanvas;
  }

  function download() {
    const canvas = exportToCanvas();
    if (!canvas) return;
    const mimeMap = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    const extMap = { jpeg: 'jpg', png: 'png', webp: 'webp' };
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'edited_image.' + (extMap[S.exportFormat] || 'jpg');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, mimeMap[S.exportFormat] || 'image/jpeg', S.exportQuality / 100);
  }

  function resetAll() {
    S.adjust = defaultAdjust();
    S.activeFilter = 'normal';
    S.operations = [];
    S.crop = null;
    S.cropApplied = false;
    S.cropAspect = 'free';
    cropAspectRef = 'free';
    S.selectedColors = [];
    S.colorTolerance = 30;
    S.showOriginal = false;
    selectiveColorSrc = null;
    prominentColors = [];
    cropOverlay.style.display = 'none';
    imgWrap.querySelector('.pe-overlay-vignette')?.remove();
    imgWrap.querySelector('.pe-overlay-grain')?.remove();
    imgWrap.querySelector('.pe-overlay-colorize')?.remove();
    updatePreview();
    switchTab(S.currentTab);
  }

  switchTab('filters');

  return () => {
    cleanupFns.forEach(fn => fn());
    document.removeEventListener('mousemove', onCropMouseMove);
    document.removeEventListener('mouseup', onCropMouseUp);
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = '';
}
