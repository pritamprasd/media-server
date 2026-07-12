export const icon = '🎬';
export const name = 'Video Editor';
export const description = 'Upload, preview, trim and adjust videos with GPU-accelerated live editing';

const ADJUST_TABS = [
  { id: 'trim', label: 'Trim', icon: '✂️' },
  { id: 'adjust', label: 'Adjust', icon: '🔧' },
  { id: 'light', label: 'Light', icon: '☀️' },
  { id: 'effects', label: 'Effects', icon: '🎭' },
  { id: 'speed', label: 'Speed', icon: '⚡' },
  { id: 'rotate', label: 'Rotate', icon: '🔄' },
];

const BTN = 'padding:0.4rem 0.85rem;border:none;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;transition:all 0.15s;display:inline-flex;align-items:center;gap:0.35rem;';
const BTN_RAISED = BTN + 'background:var(--color-surface);color:var(--color-text);box-shadow:var(--neu-raised-sm);';
const BTN_PRIMARY = BTN + 'background:var(--color-primary);color:#fff;box-shadow:var(--neu-raised-sm);';
const BTN_ACTIVE = BTN + 'background:var(--color-primary);color:#fff;box-shadow:var(--neu-inset-sm);';

const VERT_SRC = `
  attribute vec2 a_pos;
  attribute vec2 a_uv;
  varying vec2 v_uv;
  void main() {
    v_uv = a_uv;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAG_SRC = `
  precision mediump float;
  varying vec2 v_uv;
  uniform sampler2D u_tex;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_vibrance;
  uniform float u_warmth;
  uniform float u_tint;
  uniform float u_exposure;
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;
  uniform float u_grayscale;
  uniform float u_sepia;
  uniform float u_rotAngle;
  uniform float u_flipH;
  uniform float u_flipV;

  vec3 rgb2hsl(vec3 c) {
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float l = (mx + mn) * 0.5;
    if (mx == mn) return vec3(0.0, 0.0, l);
    float d = mx - mn;
    float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    float h;
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
    return vec3(h, s, l);
  }

  float hue2rgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0/2.0) return q;
    if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
    return p;
  }

  vec3 hsl2rgb(vec3 c) {
    if (c.y == 0.0) return vec3(c.z);
    float q = c.z < 0.5 ? c.z * (1.0 + c.y) : c.z + c.y - c.z * c.y;
    float p = 2.0 * c.z - q;
    return vec3(
      hue2rgb(p, q, c.x + 1.0/3.0),
      hue2rgb(p, q, c.x),
      hue2rgb(p, q, c.x - 1.0/3.0)
    );
  }

  vec3 applyVibrance(vec3 c, float amount) {
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float sat = (mx - mn) / (mx + 0.001);
    float vig = sat * amount;
    float avg = (c.r + c.g + c.b) / 3.0;
    return mix(vec3(avg), c, 1.0 + vig);
  }

  void main() {
    vec2 uv = v_uv;

    float ca = cos(u_rotAngle);
    float sa = sin(u_rotAngle);
    vec2 center = vec2(0.5, 0.5);
    uv -= center;
    uv = vec2(ca * uv.x - sa * uv.y, sa * uv.x + ca * uv.y);
    uv += center;

    if (u_flipH > 0.5) uv.x = 1.0 - uv.x;
    if (u_flipV > 0.5) uv.y = 1.0 - uv.y;

    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    vec4 texColor = texture2D(u_tex, uv);
    vec3 c = texColor.rgb;

    c *= pow(2.0, u_exposure / 100.0);

    float b = u_brightness * (1.0 + u_exposure / 150.0);
    float shadowBright = 1.0 - u_shadows / 350.0;
    float hlBright = 1.0 + u_highlights / 350.0;
    float blacksBright = 1.0 - u_blacks / 350.0;
    float whitesBright = 1.0 + u_whites / 350.0;
    float combinedB = b * shadowBright * hlBright * blacksBright * whitesBright;

    c = (c - 0.5) * u_contrast + 0.5;
    c *= combinedB;

    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(lum), c, u_saturation);

    c = applyVibrance(c, u_vibrance - 1.0);

    if (u_warmth != 0.0) {
      float w = u_warmth / 100.0;
      vec3 warmColor = mix(vec3(0.85, 0.75, 0.65), vec3(0.65, 0.75, 0.9), w * 0.5 + 0.5);
      c = mix(c, c * warmColor, abs(w) * 0.3);
    }

    if (u_tint != 0.0) {
      float t = u_tint / 200.0;
      c.r += t * 0.1;
      c.b -= t * 0.1;
    }

    if (u_grayscale > 0.5) {
      c = vec3(lum);
    }

    if (u_sepia > 0.0) {
      float s = u_sepia / 100.0;
      vec3 sepia;
      sepia.r = dot(c, vec3(0.393, 0.769, 0.189));
      sepia.g = dot(c, vec3(0.349, 0.686, 0.168));
      sepia.b = dot(c, vec3(0.272, 0.534, 0.131));
      c = mix(c, sepia, s);
    }

    c = clamp(c, 0.0, 1.0);
    gl_FragColor = vec4(c, texColor.a);
  }
`;

function defaultAdjust() {
  return {
    brightness: 1, contrast: 1, saturation: 1, warmth: 0,
    highlights: 0, shadows: 0, tint: 0, vibrance: 1,
    exposure: 0, blacks: 0, whites: 0,
    grayscale: 0, sepia: 0,
  };
}

function el(tag, css, parent) {
  const e = document.createElement(tag);
  if (css) e.style.cssText = css;
  if (parent) parent.appendChild(e);
  return e;
}

function formatTime(sec) {
  if (!isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function initWebGL(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true })
    || canvas.getContext('experimental-webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;

  function compileShader(src, type) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vs = compileShader(VERT_SRC, gl.VERTEX_SHADER);
  const fs = compileShader(FRAG_SRC, gl.FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('Program error:', gl.getProgramInfoLog(prog));
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 0, 1,
     1, -1, 1, 1,
    -1,  1, 0, 0,
     1,  1, 1, 0,
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'a_pos');
  const aUV = gl.getAttribLocation(prog, 'a_uv');
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aUV);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 16, 8);

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const uniforms = {};
  ['u_brightness', 'u_contrast', 'u_saturation', 'u_vibrance', 'u_warmth',
   'u_tint', 'u_exposure', 'u_highlights', 'u_shadows', 'u_whites', 'u_blacks',
   'u_grayscale', 'u_sepia', 'u_rotAngle', 'u_flipH', 'u_flipV',
  ].forEach(name => { uniforms[name] = gl.getUniformLocation(prog, name); });

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return { gl, tex, uniforms };
}

function getRotFlip(operations) {
  let rot = 0, flipH = false, flipV = false;
  for (const op of operations) {
    if (op.type === 'rotate') rot += op.degrees;
    if (op.type === 'flip' && op.direction === 'horizontal') flipH = !flipH;
    if (op.type === 'flip' && op.direction === 'vertical') flipV = !flipV;
  }
  return { rot: rot * Math.PI / 180, flipH, flipV };
}

export function init(container) {
  const S = {
    adjust: defaultAdjust(),
    operations: [],
    speed: 1,
    volume: 1,
    trimStart: 0,
    trimEnd: 0,
    trimApplied: false,
    showOriginal: false,
    exportFormat: 'webm',
    currentTab: 'trim',
  };

  let videoEl = null;
  let videoSrc = null;
  let videoDuration = 0;
  let seekDragging = false;
  let trimDragging = null;
  let animFrame = null;
  let webgl = null;

  const style = document.createElement('style');
  style.textContent = `
    .ve-wrap{display:flex;flex-direction:column;height:100%;overflow:hidden}
    .ve-upload{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:1.2rem;border:2px dashed var(--color-border);border-radius:16px;margin:1.5rem;cursor:pointer;transition:all 0.25s;background:var(--color-surface)}
    .ve-upload:hover,.ve-upload.dragover{border-color:var(--color-primary);box-shadow:var(--neu-inset);background:var(--color-bg)}
    .ve-upload-icon{font-size:3.5rem;filter:grayscale(0.3)}
    .ve-upload-text{font-size:1rem;color:var(--color-text);font-weight:500}
    .ve-upload-hint{font-size:0.78rem;color:var(--color-text-muted)}
    .ve-editor{display:none;flex-direction:column;height:100%;overflow:hidden}
    .ve-toolbar{display:flex;align-items:center;gap:0.5rem;padding:0.55rem 0.85rem;background:var(--color-surface);border-bottom:1px solid var(--color-border);flex-shrink:0;flex-wrap:wrap}
    .ve-sep{width:1px;height:1.6rem;background:var(--color-border);flex-shrink:0;opacity:0.5}
    .ve-main{display:flex;flex:1;min-height:0;overflow:hidden}
    .ve-preview{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;overflow:hidden;position:relative;background:#000;padding:0.5rem}
    .ve-gpu-badge{position:absolute;top:8px;right:8px;padding:0.2rem 0.5rem;border-radius:4px;font-size:0.62rem;font-weight:600;pointer-events:none;z-index:10;letter-spacing:0.03em}
    .ve-gpu-badge--ok{background:rgba(46,204,113,0.15);color:#2ecc71;border:1px solid rgba(46,204,113,0.3)}
    .ve-gpu-badge--fail{background:rgba(231,76,60,0.15);color:#e74c3c;border:1px solid rgba(231,76,60,0.3)}
    .ve-canvas{display:block;max-width:100%;max-height:calc(100vh - 230px);border-radius:4px;object-fit:contain}
    .ve-timeline{width:100%;max-width:600px;margin-top:0.5rem}
    .ve-progress-wrap{position:relative;height:28px;cursor:pointer;background:var(--color-surface);border-radius:6px;overflow:hidden;box-shadow:var(--neu-inset-sm)}
    .ve-progress-played{position:absolute;top:0;left:0;height:100%;background:var(--color-primary);border-radius:6px;pointer-events:none}
    .ve-progress-handle{position:absolute;top:50%;width:12px;height:12px;background:#fff;border:2px solid var(--color-primary);border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,0.3);z-index:3}
    .ve-trim-region{position:absolute;top:0;height:100%;background:rgba(0,122,255,0.15);pointer-events:none;z-index:1}
    .ve-trim-handle{position:absolute;top:0;width:8px;height:100%;background:var(--color-primary);cursor:ew-resize;z-index:4;border-radius:2px;opacity:0.8}
    .ve-trim-handle:hover{opacity:1}
    .ve-trim-label{position:absolute;top:-18px;font-size:0.62rem;color:var(--color-text-muted);white-space:nowrap;transform:translateX(-50%);pointer-events:none}
    .ve-controls{display:flex;align-items:center;gap:0.5rem;margin-top:0.35rem;width:100%;max-width:600px}
    .ve-play-btn{background:none;border:none;color:var(--color-text);font-size:1.3rem;cursor:pointer;padding:0.2rem;line-height:1}
    .ve-time{font-size:0.72rem;color:var(--color-text-muted);font-variant-numeric:tabular-nums;min-width:80px}
    .ve-volume-wrap{display:flex;align-items:center;gap:0.3rem;margin-left:auto}
    .ve-volume-icon{font-size:0.85rem;cursor:pointer;user-select:none}
    .ve-volume-slider{width:60px;accent-color:var(--color-primary);height:3px}
    .ve-panel{width:280px;flex-shrink:0;display:flex;flex-direction:column;border-left:1px solid var(--color-border);background:var(--color-surface);overflow:hidden}
    .ve-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--color-border);flex-shrink:0;scrollbar-width:none}
    .ve-tabs::-webkit-scrollbar{display:none}
    .ve-tab{flex:0 0 auto;padding:0.55rem 0.45rem;border:none;background:none;color:var(--color-text-muted);cursor:pointer;font-size:0.68rem;display:flex;flex-direction:column;align-items:center;gap:0.15rem;transition:color 0.15s;border-bottom:2px solid transparent;min-width:0}
    .ve-tab:hover{color:var(--color-text)}
    .ve-tab--active{color:var(--color-primary);border-bottom-color:var(--color-primary)}
    .ve-tab-icon{font-size:0.95rem}
    .ve-tab-content{flex:1;overflow-y:auto;padding:0.75rem;scrollbar-width:thin}
    .ve-sliders{display:flex;flex-direction:column;gap:0.65rem}
    .ve-slider-row{display:flex;align-items:center;gap:0.5rem}
    .ve-slider-label{font-size:0.78rem;color:var(--color-text-muted);min-width:72px;user-select:none}
    .ve-slider-val{font-size:0.72rem;color:var(--color-text-muted);min-width:36px;text-align:right;font-variant-numeric:tabular-nums}
    .ve-slider{flex:1;accent-color:var(--color-primary);height:4px}
    .ve-hint{font-size:0.68rem;color:var(--color-text-muted);opacity:0.55;text-align:center;margin-top:0.4rem;font-style:italic}
    .ve-trim-tools{display:flex;flex-direction:column;gap:0.65rem}
    .ve-trim-inputs{display:flex;gap:0.5rem;align-items:center}
    .ve-trim-input{width:70px;padding:0.3rem 0.45rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:0.78rem;text-align:center;font-variant-numeric:tabular-nums}
    .ve-trim-sep{color:var(--color-text-muted);font-size:0.78rem}
    .ve-rotate-grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem}
    .ve-rotate-btn{padding:0.6rem;border:none;border-radius:8px;background:var(--color-bg);color:var(--color-text);cursor:pointer;font-size:0.78rem;font-weight:500;box-shadow:var(--neu-flat);transition:all 0.15s;display:flex;flex-direction:column;align-items:center;gap:0.25rem}
    .ve-rotate-btn:hover{box-shadow:var(--neu-raised-sm);border-color:var(--color-border)}
    .ve-rotate-icon{font-size:1.4rem}
    .ve-speed-display{text-align:center;font-size:2rem;font-weight:700;color:var(--color-primary);margin:0.5rem 0}
    .ve-speed-presets{display:flex;flex-wrap:wrap;gap:0.35rem;justify-content:center}
    .ve-speed-preset{padding:0.3rem 0.6rem;border:none;border-radius:6px;background:var(--color-bg);color:var(--color-text-muted);cursor:pointer;font-size:0.72rem;font-weight:500;box-shadow:var(--neu-flat);transition:all 0.15s}
    .ve-speed-preset:hover{box-shadow:var(--neu-raised-sm);color:var(--color-text)}
    .ve-speed-preset--active{background:var(--color-primary);color:#fff;box-shadow:var(--neu-inset-sm)}
    .ve-info{display:flex;flex-direction:column;gap:0.3rem;padding:0.5rem;background:var(--color-bg);border-radius:8px;margin-bottom:0.5rem}
    .ve-info-row{display:flex;justify-content:space-between;font-size:0.72rem}
    .ve-info-label{color:var(--color-text-muted)}
    .ve-info-val{color:var(--color-text);font-weight:500;font-variant-numeric:tabular-nums}
    .ve-orig-btn{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);padding:0.3rem 0.9rem;border-radius:20px;background:rgba(0,0,0,0.65);color:#fff;border:none;cursor:pointer;font-size:0.72rem;font-weight:500;z-index:10;user-select:none;backdrop-filter:blur(4px);transition:background 0.15s;letter-spacing:0.02em}
    .ve-orig-btn:hover{background:rgba(0,0,0,0.8)}
    .ve-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:0.5rem 1.1rem;border-radius:10px;background:var(--color-surface);color:var(--color-text);box-shadow:var(--neu-raised-sm);font-size:0.8rem;font-weight:500;z-index:9999;opacity:0;transition:opacity 0.25s;pointer-events:none}
    .ve-toast--visible{opacity:1}
    @media(max-width:700px){
      .ve-panel{width:100%;border-left:none;border-top:1px solid var(--color-border);max-height:45vh}
      .ve-main{flex-direction:column}
      .ve-canvas{max-height:calc(50vh - 120px)}
    }
  `;
  container.appendChild(style);

  const wrapper = el('div', 'display:flex;flex-direction:column;height:100%;overflow:hidden', container);
  wrapper.className = 've-wrap';

  const uploadZone = el('div', '', wrapper);
  uploadZone.className = 've-upload';
  uploadZone.innerHTML = '<div class="ve-upload-icon">🎬</div><div class="ve-upload-text">Drop a video here or click to upload</div><div class="ve-upload-hint">MP4, WebM, MOV, AVI</div>';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'video/*';
  fileInput.style.display = 'none';
  uploadZone.appendChild(fileInput);

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', onDrop);
  fileInput.addEventListener('change', onFileChange);

  function onDrop(e) { e.preventDefault(); uploadZone.classList.remove('dragover'); const f = e.dataTransfer.files[0]; if (f && f.type.startsWith('video/')) handleFile(f); }
  function onFileChange(e) { const f = e.target.files[0]; if (f) handleFile(f); fileInput.value = ''; }

  const editor = el('div', 'display:none;flex-direction:column;height:100%;overflow:hidden', wrapper);
  editor.className = 've-editor';

  const toolbar = el('div', '', editor);
  toolbar.className = 've-toolbar';
  const uploadBtn = el('button', BTN_RAISED, toolbar);
  uploadBtn.innerHTML = '🎬 Upload';
  uploadBtn.addEventListener('click', () => fileInput.click());
  const resetBtn = el('button', BTN_RAISED, toolbar);
  resetBtn.innerHTML = '↺ Reset';
  resetBtn.style.color = '#e74c3c';
  resetBtn.addEventListener('click', resetAll);
  el('div', '', toolbar).className = 've-sep';
  const formatSelect = document.createElement('select');
  formatSelect.style.cssText = 'padding:0.35rem 0.55rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:0.78rem;cursor:pointer;';
  [['webm', 'WebM'], ['mp4', 'MP4']].forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = l; formatSelect.appendChild(o); });
  formatSelect.addEventListener('change', () => { S.exportFormat = formatSelect.value; });
  toolbar.appendChild(formatSelect);
  el('div', '', toolbar).className = 've-sep';
  const dlBtn = el('button', BTN_PRIMARY, toolbar);
  dlBtn.innerHTML = '⬇ Download';
  dlBtn.addEventListener('click', download);
  el('div', '', toolbar).className = 've-sep';
  const extractBtn = el('button', BTN_RAISED, toolbar);
  extractBtn.innerHTML = '📸 Frame';
  extractBtn.addEventListener('click', extractFrame);

  const mainArea = el('div', '', editor);
  mainArea.className = 've-main';

  const previewArea = el('div', '', mainArea);
  previewArea.className = 've-preview';

  const gpuBadge = el('span', '', previewArea);
  gpuBadge.className = 've-gpu-badge';
  gpuBadge.style.display = 'none';

  const renderCanvas = el('canvas', 'display:block;max-width:100%;max-height:calc(100vh - 230px);border-radius:4px;object-fit:contain', previewArea);
  renderCanvas.className = 've-canvas';
  renderCanvas.style.display = 'none';

  videoEl = document.createElement('video');
  videoEl.style.display = 'none';
  videoEl.playsInline = true;
  videoEl.muted = true;
  previewArea.appendChild(videoEl);

  const origBtn = el('button', '', previewArea);
  origBtn.className = 've-orig-btn';
  origBtn.textContent = 'Hold for original';
  origBtn.style.display = 'none';
  origBtn.addEventListener('mousedown', () => { S.showOriginal = true; });
  origBtn.addEventListener('mouseup', () => { S.showOriginal = false; });
  origBtn.addEventListener('mouseleave', () => { S.showOriginal = false; });
  origBtn.addEventListener('touchstart', (e) => { e.preventDefault(); S.showOriginal = true; }, { passive: false });
  origBtn.addEventListener('touchend', () => { S.showOriginal = false; });

  const timeline = el('div', '', previewArea);
  timeline.className = 've-timeline';
  const progressWrap = el('div', '', timeline);
  progressWrap.className = 've-progress-wrap';
  const trimRegion = el('div', '', progressWrap);
  trimRegion.className = 've-trim-region';
  trimRegion.style.display = 'none';
  const trimStartHandle = el('div', '', progressWrap);
  trimStartHandle.className = 've-trim-handle';
  trimStartHandle.style.display = 'none';
  const trimStartLabel = el('span', '', trimStartHandle);
  trimStartLabel.className = 've-trim-label';
  const trimEndHandle = el('div', '', progressWrap);
  trimEndHandle.className = 've-trim-handle';
  trimEndHandle.style.display = 'none';
  const trimEndLabel = el('span', '', trimEndHandle);
  trimEndLabel.className = 've-trim-label';
  const progressPlayed = el('div', '', progressWrap);
  progressPlayed.className = 've-progress-played';
  const progressHandle = el('div', '', progressWrap);
  progressHandle.className = 've-progress-handle';

  const controls = el('div', '', timeline);
  controls.className = 've-controls';
  const playBtn = el('button', '', controls);
  playBtn.className = 've-play-btn';
  playBtn.textContent = '▶';
  playBtn.addEventListener('click', togglePlay);
  const timeDisplay = el('span', '', controls);
  timeDisplay.className = 've-time';
  timeDisplay.textContent = '0:00 / 0:00';
  const volumeWrap = el('div', '', controls);
  volumeWrap.className = 've-volume-wrap';
  const volumeIcon = el('span', '', volumeWrap);
  volumeIcon.className = 've-volume-icon';
  volumeIcon.textContent = '🔊';
  volumeIcon.addEventListener('click', () => {
    S.volume = S.volume > 0 ? 0 : 1;
    videoEl.volume = S.volume;
    volumeIcon.textContent = S.volume > 0 ? '🔊' : '🔇';
    volumeSlider.value = S.volume;
  });
  const volumeSlider = el('input', '', volumeWrap);
  volumeSlider.className = 've-volume-slider';
  volumeSlider.type = 'range'; volumeSlider.min = 0; volumeSlider.max = 1; volumeSlider.step = 0.05; volumeSlider.value = S.volume;
  volumeSlider.addEventListener('input', () => {
    S.volume = parseFloat(volumeSlider.value);
    videoEl.volume = S.volume;
    volumeIcon.textContent = S.volume > 0 ? '🔊' : '🔇';
  });

  const panel = el('div', '', mainArea);
  panel.className = 've-panel';
  const tabBar = el('div', '', panel);
  tabBar.className = 've-tabs';
  const tabContent = el('div', '', panel);
  tabContent.className = 've-tab-content';

  const tabBtns = [];
  ADJUST_TABS.forEach(tab => {
    const btn = el('button', '', tabBar);
    btn.className = 've-tab';
    btn.dataset.tab = tab.id;
    btn.innerHTML = '<span class="ve-tab-icon">' + tab.icon + '</span><span>' + tab.label + '</span>';
    btn.addEventListener('click', () => switchTab(tab.id));
    tabBtns.push(btn);
  });

  function handleFile(file) {
    resetAll();
    const url = URL.createObjectURL(file);
    loadVideo(url, file.name);
  }

  function loadVideo(src, name) {
    videoSrc = src;
    videoEl.src = src;
    videoEl.load();
    videoEl.addEventListener('loadedmetadata', function onMeta() {
      videoEl.removeEventListener('loadedmetadata', onMeta);
      videoDuration = videoEl.duration;
      S.trimStart = 0;
      S.trimEnd = videoDuration;

      renderCanvas.width = videoEl.videoWidth;
      renderCanvas.height = videoEl.videoHeight;
      renderCanvas.style.display = '';
      origBtn.style.display = '';
      uploadZone.style.display = 'none';
      editor.style.display = 'flex';

      const ctx = initWebGL(renderCanvas);
      if (ctx) {
        webgl = ctx;
        gpuBadge.textContent = '⚡ GPU';
        gpuBadge.className = 've-gpu-badge ve-gpu-badge--ok';
      } else {
        gpuBadge.textContent = '⚠ CPU';
        gpuBadge.className = 've-gpu-badge ve-gpu-badge--fail';
      }
      gpuBadge.style.display = '';

      updateTimeline();
      updateTrimUI();
      switchTab(S.currentTab);
      showToast('Loaded: ' + (name || 'video'));
      renderFrame();
    }, { once: true });
  }

  function renderFrame() {
    if (!videoEl || videoEl.readyState < 2) return;

    if (webgl) {
      const gl = webgl.gl;
      const u = webgl.uniforms;
      gl.viewport(0, 0, renderCanvas.width, renderCanvas.height);
      gl.bindTexture(gl.TEXTURE_2D, webgl.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
      const a = S.showOriginal ? defaultAdjust() : S.adjust;
      const { rot, flipH, flipV } = getRotFlip(S.operations);
      gl.uniform1f(u.u_brightness, a.brightness);
      gl.uniform1f(u.u_contrast, a.contrast);
      gl.uniform1f(u.u_saturation, a.saturation);
      gl.uniform1f(u.u_vibrance, a.vibrance);
      gl.uniform1f(u.u_warmth, a.warmth);
      gl.uniform1f(u.u_tint, a.tint);
      gl.uniform1f(u.u_exposure, a.exposure);
      gl.uniform1f(u.u_highlights, a.highlights);
      gl.uniform1f(u.u_shadows, a.shadows);
      gl.uniform1f(u.u_whites, a.whites);
      gl.uniform1f(u.u_blacks, a.blacks);
      gl.uniform1f(u.u_grayscale, a.grayscale);
      gl.uniform1f(u.u_sepia, a.sepia);
      gl.uniform1f(u.u_rotAngle, rot);
      gl.uniform1f(u.u_flipH, flipH ? 1.0 : 0.0);
      gl.uniform1f(u.u_flipV, flipV ? 1.0 : 0.0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      const ctx = renderCanvas.getContext('2d');
      if (ctx) ctx.drawImage(videoEl, 0, 0, renderCanvas.width, renderCanvas.height);
    }
  }

  function switchTab(tabId) {
    S.currentTab = tabId;
    tabBtns.forEach(btn => btn.classList.toggle('ve-tab--active', btn.dataset.tab === tabId));
    renderTabContent(tabId);
    updateTrimUI();
  }

  function renderTabContent(tabId) {
    tabContent.innerHTML = '';
    switch (tabId) {
      case 'trim': renderTrimTab(); break;
      case 'adjust': renderAdjustTab(); break;
      case 'light': renderLightTab(); break;
      case 'effects': renderEffectsTab(); break;
      case 'speed': renderSpeedTab(); break;
      case 'rotate': renderRotateTab(); break;
    }
  }

  function renderTrimTab() {
    const s = el('div', '', tabContent);
    s.className = 've-trim-tools';
    const info = el('div', '', s);
    info.className = 've-info';
    [['Duration', formatTime(videoDuration)], ['Start', formatTime(S.trimStart)], ['End', formatTime(S.trimEnd)], ['Length', formatTime(S.trimEnd - S.trimStart)]].forEach(([l, v]) => {
      const row = el('div', '', info);
      row.className = 've-info-row';
      el('span', '', row).className = 've-info-label';
      row.lastChild.textContent = l;
      el('span', '', row).className = 've-info-val';
      row.lastChild.textContent = v;
    });
    const inputs = el('div', '', s);
    inputs.className = 've-trim-inputs';
    el('input', '', inputs).className = 've-trim-input';
    inputs.lastChild.type = 'text';
    inputs.lastChild.value = formatTime(S.trimStart);
    el('span', '', inputs).className = 've-trim-sep';
    inputs.lastChild.textContent = '→';
    el('input', '', inputs).className = 've-trim-input';
    inputs.lastChild.type = 'text';
    inputs.lastChild.value = formatTime(S.trimEnd);
    const setStartBtn = el('button', BTN_RAISED, s);
    setStartBtn.innerHTML = '⬅ Set Start to Current';
    setStartBtn.addEventListener('click', () => {
      S.trimStart = videoEl.currentTime;
      if (S.trimStart >= S.trimEnd) S.trimEnd = videoDuration;
      updateTrimUI();
      renderTrimTab();
    });
    const setEndBtn = el('button', BTN_RAISED, s);
    setEndBtn.innerHTML = '➡ Set End to Current';
    setEndBtn.addEventListener('click', () => {
      S.trimEnd = videoEl.currentTime;
      if (S.trimEnd <= S.trimStart) S.trimStart = 0;
      updateTrimUI();
      renderTrimTab();
    });
    const playTrimBtn = el('button', BTN_RAISED, s);
    playTrimBtn.innerHTML = '▶ Preview Trim';
    playTrimBtn.addEventListener('click', previewTrim);
    el('div', '', s).className = 've-hint';
    s.lastChild.textContent = 'Drag handles on timeline or set times above';
  }

  function renderAdjustTab() {
    const s = el('div', '', tabContent);
    s.className = 've-sliders';
    addSlider(s, 'brightness', 'Brightness', 0, 2, 0.01);
    addSlider(s, 'contrast', 'Contrast', 0, 2, 0.01);
    addSlider(s, 'saturation', 'Saturation', 0, 2, 0.01);
    addSlider(s, 'vibrance', 'Vibrance', 0, 2, 0.01);
    addSlider(s, 'warmth', 'Warmth', -100, 100, 1);
    addSlider(s, 'tint', 'Tint', -100, 100, 1);
    addSlider(s, 'exposure', 'Exposure', -100, 100, 1);
    el('div', '', s).className = 've-hint';
    s.lastChild.textContent = 'GPU-accelerated — edits apply live during playback';
  }

  function renderLightTab() {
    const s = el('div', '', tabContent);
    s.className = 've-sliders';
    addSlider(s, 'highlights', 'Highlights', -100, 100, 1);
    addSlider(s, 'shadows', 'Shadows', -100, 100, 1);
    addSlider(s, 'whites', 'Whites', -100, 100, 1);
    addSlider(s, 'blacks', 'Blacks', -100, 100, 1);
    el('div', '', s).className = 've-hint';
    s.lastChild.textContent = 'GPU-accelerated — edits apply live during playback';
  }

  function renderEffectsTab() {
    const s = el('div', '', tabContent);
    s.className = 've-sliders';
    const gsRow = el('div', '', s);
    gsRow.className = 've-slider-row';
    const gsLbl = el('span', '', gsRow); gsLbl.className = 've-slider-label'; gsLbl.textContent = 'Grayscale';
    const gsToggle = el('button', '', gsRow);
    gsToggle.style.cssText = S.adjust.grayscale ? BTN_ACTIVE : BTN_RAISED;
    gsToggle.style.padding = '0.25rem 0.65rem';
    gsToggle.style.fontSize = '0.72rem';
    gsToggle.textContent = S.adjust.grayscale ? 'On' : 'Off';
    gsToggle.addEventListener('click', () => {
      S.adjust.grayscale = S.adjust.grayscale ? 0 : 1;
      gsToggle.style.cssText = S.adjust.grayscale ? BTN_ACTIVE : BTN_RAISED;
      gsToggle.style.padding = '0.25rem 0.65rem';
      gsToggle.style.fontSize = '0.72rem';
      gsToggle.textContent = S.adjust.grayscale ? 'On' : 'Off';
    });
    addSlider(s, 'sepia', 'Sepia', 0, 100, 1);
    el('div', '', s).className = 've-hint';
    s.lastChild.textContent = 'GPU-accelerated — edits apply live during playback';
  }

  function renderSpeedTab() {
    const s = el('div', '', tabContent);
    s.className = 've-sliders';
    const display = el('div', '', s);
    display.className = 've-speed-display';
    display.textContent = S.speed + 'x';
    addSlider(s, '_speed', 'Speed', 0.25, 4, 0.05);
    const presets = el('div', '', s);
    presets.className = 've-speed-presets';
    [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].forEach(p => {
      const btn = el('button', '', presets);
      btn.className = 've-speed-preset' + (S.speed === p ? ' ve-speed-preset--active' : '');
      btn.textContent = p + 'x';
      btn.addEventListener('click', () => {
        S.speed = p;
        videoEl.playbackRate = p;
        renderSpeedTab();
      });
    });
    el('div', '', s).className = 've-hint';
    s.lastChild.textContent = 'Playback speed affects preview and export';
  }

  function renderRotateTab() {
    const grid = el('div', '', tabContent);
    grid.className = 've-rotate-grid';
    [
      { icon: '↺', label: 'Rotate Left', action: () => { S.operations.push({ type: 'rotate', degrees: -90 }); } },
      { icon: '↻', label: 'Rotate Right', action: () => { S.operations.push({ type: 'rotate', degrees: 90 }); } },
      { icon: '↔', label: 'Flip Horizontal', action: () => { S.operations.push({ type: 'flip', direction: 'horizontal' }); } },
      { icon: '↕', label: 'Flip Vertical', action: () => { S.operations.push({ type: 'flip', direction: 'vertical' }); } },
    ].forEach(({ icon, label, action }) => {
      const btn = el('button', '', grid);
      btn.className = 've-rotate-btn';
      btn.innerHTML = '<span class="ve-rotate-icon">' + icon + '</span><span>' + label + '</span>';
      btn.addEventListener('click', action);
    });
    if (S.operations.length > 0) {
      const hint = el('div', '', tabContent);
      hint.className = 've-hint';
      hint.textContent = S.operations.length + ' operation(s) pending';
      const resetOpsBtn = el('button', BTN_RAISED, tabContent);
      resetOpsBtn.innerHTML = '↩ Clear Operations';
      resetOpsBtn.style.marginTop = '0.5rem';
      resetOpsBtn.addEventListener('click', () => { S.operations = []; renderRotateTab(); });
    }
  }

  function addSlider(parent, key, label, min, max, step) {
    const isInt = step >= 1;
    const val = key === '_speed' ? S.speed : S.adjust[key];
    const row = el('div', '', parent);
    row.className = 've-slider-row';
    const lbl = el('span', '', row); lbl.className = 've-slider-label'; lbl.textContent = label;
    const slider = el('input', '', row);
    slider.className = 've-slider';
    slider.type = 'range'; slider.min = min; slider.max = max; slider.step = step; slider.value = val;
    const valSpan = el('span', '', row);
    valSpan.className = 've-slider-val';
    valSpan.textContent = isInt ? val : parseFloat(val).toFixed(2);
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      if (key === '_speed') {
        S.speed = v;
        videoEl.playbackRate = v;
        const speedDisplay = tabContent.querySelector('.ve-speed-display');
        if (speedDisplay) speedDisplay.textContent = v + 'x';
        const presets = tabContent.querySelectorAll('.ve-speed-preset');
        presets.forEach(p => p.classList.toggle('ve-speed-preset--active', parseFloat(p.textContent) === v));
      } else {
        S.adjust[key] = v;
      }
      valSpan.textContent = isInt ? v : v.toFixed(2);
    });
  }

  function togglePlay() {
    if (!videoEl.src) return;
    if (videoEl.paused) {
      if (S.trimApplied && videoEl.currentTime >= S.trimEnd) {
        videoEl.currentTime = S.trimStart;
      }
      videoEl.play();
      playBtn.textContent = '⏸';
      startRenderLoop();
    } else {
      videoEl.pause();
      playBtn.textContent = '▶';
      stopRenderLoop();
      renderFrame();
    }
  }

  function previewTrim() {
    if (!videoEl.src) return;
    videoEl.currentTime = S.trimStart;
    videoEl.play();
    S.trimApplied = true;
    playBtn.textContent = '⏸';
    startRenderLoop();
  }

  function startRenderLoop() {
    stopRenderLoop();
    function tick() {
      renderFrame();
      updateTimeline();
      if (S.trimApplied && videoEl.currentTime >= S.trimEnd && !videoEl.paused) {
        videoEl.pause();
        videoEl.currentTime = S.trimEnd;
        playBtn.textContent = '▶';
        S.trimApplied = false;
        renderFrame();
      }
      if (!videoEl.paused) animFrame = requestAnimationFrame(tick);
    }
    animFrame = requestAnimationFrame(tick);
  }

  function stopRenderLoop() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  }

  function updateTimeline() {
    if (!videoDuration) return;
    const pct = (videoEl.currentTime / videoDuration) * 100;
    progressPlayed.style.width = pct + '%';
    progressHandle.style.left = pct + '%';
    timeDisplay.textContent = formatTime(videoEl.currentTime) + ' / ' + formatTime(videoDuration);
  }

  function updateTrimUI() {
    if (!videoDuration) return;
    const startPct = (S.trimStart / videoDuration) * 100;
    const endPct = (S.trimEnd / videoDuration) * 100;
    trimRegion.style.display = '';
    trimRegion.style.left = startPct + '%';
    trimRegion.style.width = (endPct - startPct) + '%';
    trimStartHandle.style.display = '';
    trimStartHandle.style.left = startPct + '%';
    trimStartLabel.textContent = formatTime(S.trimStart);
    trimEndHandle.style.display = '';
    trimEndHandle.style.left = endPct + '%';
    trimEndLabel.textContent = formatTime(S.trimEnd);
  }

  progressWrap.addEventListener('mousedown', (e) => {
    if (e.target === trimStartHandle || e.target === trimEndHandle || e.target.closest('.ve-trim-handle')) return;
    seekDragging = true;
    seekTo(e);
  });
  document.addEventListener('mousemove', (e) => { if (seekDragging) seekTo(e); });
  document.addEventListener('mouseup', onSeekMouseUp);

  function onSeekMouseUp() { seekDragging = false; }

  function seekTo(e) {
    const rect = progressWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    videoEl.currentTime = pct * videoDuration;
    updateTimeline();
    renderFrame();
  }

  trimStartHandle.addEventListener('mousedown', (e) => { e.stopPropagation(); trimDragging = 'start'; document.addEventListener('mousemove', onTrimDrag); document.addEventListener('mouseup', onTrimDragEnd); });
  trimEndHandle.addEventListener('mousedown', (e) => { e.stopPropagation(); trimDragging = 'end'; document.addEventListener('mousemove', onTrimDrag); document.addEventListener('mouseup', onTrimDragEnd); });

  function onTrimDrag(e) {
    const rect = progressWrap.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pct * videoDuration;
    if (trimDragging === 'start') {
      S.trimStart = Math.min(time, S.trimEnd - 0.1);
      if (S.trimStart < 0) S.trimStart = 0;
    } else {
      S.trimEnd = Math.max(time, S.trimStart + 0.1);
      if (S.trimEnd > videoDuration) S.trimEnd = videoDuration;
    }
    updateTrimUI();
  }

  function onTrimDragEnd() {
    trimDragging = null;
    document.removeEventListener('mousemove', onTrimDrag);
    document.removeEventListener('mouseup', onTrimDragEnd);
    if (S.currentTab === 'trim') renderTrimTab();
  }

  videoEl.addEventListener('ended', () => {
    playBtn.textContent = '▶';
    stopRenderLoop();
    S.trimApplied = false;
    renderFrame();
  });

  videoEl.addEventListener('click', togglePlay);

  renderCanvas.addEventListener('click', togglePlay);

  const toast = el('div', '', null);
  toast.className = 've-toast';
  toast.textContent = '';

  function showToast(msg) {
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('ve-toast--visible'));
    setTimeout(() => {
      toast.classList.remove('ve-toast--visible');
      setTimeout(() => toast.remove(), 300);
    }, 1500);
  }

  function extractFrame() {
    if (!videoEl.src || !videoEl.videoWidth) return;

    if (webgl) {
      renderFrame();
      renderCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'frame_' + formatTime(videoEl.currentTime).replace(':', '-') + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Frame extracted');
      }, 'image/png');
    } else {
      const c2d = document.createElement('canvas');
      c2d.width = videoEl.videoWidth;
      c2d.height = videoEl.videoHeight;
      const ctx = c2d.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, c2d.width, c2d.height);
      c2d.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'frame_' + formatTime(videoEl.currentTime).replace(':', '-') + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Frame extracted');
      }, 'image/png');
    }
  }

  function download() {
    if (!videoSrc) return;
    const a = document.createElement('a');
    a.href = videoSrc;
    a.download = 'video.' + S.exportFormat;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Downloaded');
  }

  function resetAll() {
    S.adjust = defaultAdjust();
    S.operations = [];
    S.speed = 1;
    S.volume = 1;
    S.trimStart = 0;
    S.trimEnd = 0;
    S.trimApplied = false;
    S.showOriginal = false;
    if (videoEl) {
      videoEl.pause();
      videoEl.playbackRate = 1;
      videoEl.volume = 1;
    }
    if (playBtn) playBtn.textContent = '▶';
    stopRenderLoop();
    trimRegion.style.display = 'none';
    trimStartHandle.style.display = 'none';
    trimEndHandle.style.display = 'none';
    if (webgl) renderFrame();
    if (S.currentTab === 'trim') renderTrimTab();
  }

  switchTab('trim');

  return () => {
    stopRenderLoop();
    document.removeEventListener('mousemove', onTrimDrag);
    document.removeEventListener('mouseup', onTrimDragEnd);
    document.removeEventListener('mousemove', seekTo);
    document.removeEventListener('mouseup', onSeekMouseUp);
    if (videoEl) { videoEl.pause(); videoEl.src = ''; }
    if (webgl) {
      webgl.gl.deleteTexture(webgl.tex);
      webgl = null;
    }
    toast.remove();
    wrapper.remove();
    style.remove();
  };
}

export function destroy(container) {
  container.innerHTML = '';
}
