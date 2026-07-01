import { toolLog } from '../services/tool-logger.js';

export const icon = '🤖';
export const name = 'AI Ingredient Scanner';
export const description = 'Send product label image to AI — extracts ingredients, nutrition facts, and health analysis using vision model';

const CATEGORY_COLORS = {
  sweetener: '#e74c3c', preservative: '#e67e22', emulsifier: '#f39c12',
  thickener: '#f1c40f', stabilizer: '#2ecc71', gelling_agent: '#27ae60',
  artificial_color: '#e74c3c', artificial_flavor: '#e74c3c', artificial_sweetener: '#e74c3c',
  fat_oil: '#e67e22', grain: '#f39c12', fruit_vegetable: '#2ecc71',
  nut_seed: '#27ae60', dairy: '#3498db', protein: '#9b59b6',
  salt_sodium: '#e67e22', leavening_agent: '#95a5a6', acidity_regulator: '#95a5a6',
  fortification_nutrient: '#3498db', allergen: '#e74c3c',
  whole_food: '#2ecc71', water: '#3498db', spice: '#9b59b6', other: '#95a5a6',
};

const CATEGORY_ICONS = {
  sweetener: '🍬', preservative: '🧪', emulsifier: '🫒', thickener: '🥣',
  stabilizer: '🔬', gelling_agent: '🍮', artificial_color: '🎨',
  artificial_flavor: '🧪', artificial_sweetener: '🍬', fat_oil: '🫒',
  grain: '🌾', fruit_vegetable: '🥦', nut_seed: '🥜', dairy: '🥛',
  protein: '🥩', salt_sodium: '🧂', leavening_agent: '🎈',
  acidity_regulator: '⚗️', fortification_nutrient: '💊', allergen: '⚠️',
  whole_food: '🌿', water: '💧', spice: '🌶️', other: '📦',
};

const ANALYSIS_ICONS = {
  sugar: '🍬', additives: '🧪', nova: '🏭', nutriscore: '🥗',
  calorie_density: '🔥', allergens: '⚠️', recognizability: '👨‍🍳',
  fat_quality: '🫒', whole_food: '🌾', sodium_risk: '🧂',
  preservatives: '🧫', list_length: '📋', plant_score: '🌱',
  artificial: '☣️', texture_additives: '🧴', fortification: '💊',
  nutrition_breakdown: '🍱', daily_values: '📊', nutrient_density: '🧬',
};

const INGREDIENT_FUNCTIONS = {
  sweetener: 'Sweetening', preservative: 'Preservation', emulsifier: 'Emulsification',
  thickener: 'Thickening', stabilizer: 'Stabilization', gelling_agent: 'Gelling',
  artificial_color: 'Coloring (Artificial)', artificial_flavor: 'Flavoring (Artificial)',
  artificial_sweetener: 'Sweetening (Artificial)', fat_oil: 'Fat/Oil Base',
  grain: 'Grain Base', fruit_vegetable: 'Fruit/Vegetable', nut_seed: 'Nut/Seed',
  dairy: 'Dairy', protein: 'Protein Source', salt_sodium: 'Salt/Sodium',
  leavening_agent: 'Leavening', acidity_regulator: 'Acidity Regulation',
  fortification_nutrient: 'Nutrient Fortification', allergen: 'Contains Allergen',
  whole_food: 'Whole Food', water: 'Liquid Base', spice: 'Spice/Herb', other: 'Other',
};

export function init(container) {
  let mediaStream = null;
  let currentResult = null;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'display:flex;flex-direction:column;height:100%;padding:1.5rem;gap:1.25rem;overflow-y:auto;';
  container.appendChild(wrapper);

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;';

  const title = document.createElement('h2');
  title.textContent = '🤖 AI Ingredient Scanner';
  title.style.cssText = 'margin:0;font-size:1.15rem;font-weight:700;color:var(--color-text);';

  const headerBtns = document.createElement('div');
  headerBtns.style.cssText = 'display:flex;gap:0.5rem;';

  const cameraBtn = document.createElement('button');
  cameraBtn.innerHTML = '📷&nbsp; Camera';
  cameraBtn.style.cssText = 'padding:0.5rem 1rem;border:none;border-radius:8px;background:var(--color-primary);color:#fff;font-size:0.8rem;font-weight:600;cursor:pointer;transition:opacity 0.15s;display:flex;align-items:center;gap:0.3rem;';

  const uploadBtn = document.createElement('button');
  uploadBtn.innerHTML = '📁&nbsp; Upload';
  uploadBtn.style.cssText = 'padding:0.5rem 1rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:0.8rem;font-weight:600;cursor:pointer;transition:opacity 0.15s;display:flex;align-items:center;gap:0.3rem;';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  headerBtns.appendChild(cameraBtn);
  headerBtns.appendChild(uploadBtn);
  header.appendChild(title);
  header.appendChild(headerBtns);
  wrapper.appendChild(header);

  const status = document.createElement('div');
  status.style.cssText = 'display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;color:var(--color-text-muted);padding:0.5rem 0.75rem;background:var(--color-bg);border-radius:8px;border:1px solid var(--color-border);min-height:1.2em;';
  const statusIcon = document.createElement('span');
  statusIcon.textContent = '💡';
  const statusText = document.createElement('span');
  statusText.textContent = 'Capture or upload a product label image. AI will analyze it.';
  status.appendChild(statusIcon);
  status.appendChild(statusText);
  wrapper.appendChild(status);

  const videoContainer = document.createElement('div');
  videoContainer.style.cssText = 'display:none;position:relative;border-radius:8px;overflow:hidden;background:#000;min-height:200px;max-height:320px;';
  wrapper.appendChild(videoContainer);

  const video = document.createElement('video');
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;
  videoContainer.appendChild(video);

  const captureBtn = document.createElement('button');
  captureBtn.textContent = '📸 Capture & Analyze';
  captureBtn.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);padding:0.5rem 1.2rem;border:none;border-radius:24px;background:var(--color-primary);color:#fff;font-size:0.85rem;font-weight:600;cursor:pointer;z-index:10;opacity:0.9;transition:opacity 0.15s;display:none;';
  captureBtn.onmouseenter = () => { captureBtn.style.opacity = '1'; };
  captureBtn.onmouseleave = () => { captureBtn.style.opacity = '0.9'; };
  videoContainer.appendChild(captureBtn);

  const previewContainer = document.createElement('div');
  previewContainer.style.cssText = 'display:none;position:relative;border-radius:8px;overflow:hidden;background:var(--color-bg);border:1px solid var(--color-border);min-height:120px;';
  wrapper.appendChild(previewContainer);

  const previewImg = document.createElement('img');
  previewImg.style.cssText = 'width:100%;max-height:260px;object-fit:contain;display:block;cursor:zoom-in;';
  previewImg.addEventListener('click', () => {
    if (!previewImg.src) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
    const fullImg = document.createElement('img');
    fullImg.src = previewImg.src;
    fullImg.style.cssText = 'max-width:95vw;max-height:95vh;object-fit:contain;border-radius:4px;';
    overlay.appendChild(fullImg);
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  });
  previewContainer.appendChild(previewImg);

  const processingOverlay = document.createElement('div');
  processingOverlay.style.cssText = 'display:none;position:absolute;inset:0;background:rgba(0,0,0,0.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;z-index:5;';
  const spinner = document.createElement('div');
  spinner.style.cssText = 'width:36px;height:36px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;';
  const spinStyle = document.createElement('style');
  spinStyle.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(spinStyle);
  const procStatus = document.createElement('div');
  procStatus.style.cssText = 'color:#fff;font-size:0.85rem;font-weight:500;text-align:center;padding:0 1rem;';
  procStatus.textContent = 'Processing...';
  processingOverlay.appendChild(spinner);
  processingOverlay.appendChild(procStatus);
  previewContainer.appendChild(processingOverlay);
  processingOverlay.style.display = 'none';

  const resultsSection = document.createElement('div');
  resultsSection.style.cssText = 'display:none;flex-direction:column;gap:1rem;';
  wrapper.appendChild(resultsSection);

  const ingredientTableContainer = document.createElement('div');
  ingredientTableContainer.style.cssText = 'border:1px solid var(--color-border);border-radius:8px;overflow:hidden;';
  resultsSection.appendChild(ingredientTableContainer);

  const nutritionPanel = document.createElement('div');
  nutritionPanel.style.cssText = 'display:none;border:1px solid var(--color-border);border-radius:8px;overflow:hidden;';
  resultsSection.appendChild(nutritionPanel);

  const rawTextContainer = document.createElement('details');
  rawTextContainer.style.cssText = 'border:1px solid var(--color-border);border-radius:8px;overflow:hidden;font-size:0.78rem;';
  const rawTextSummary = document.createElement('summary');
  rawTextSummary.textContent = '📝 Raw OCR Text';
  rawTextSummary.style.cssText = 'padding:0.6rem 0.85rem;background:var(--color-surface);cursor:pointer;font-weight:600;color:var(--color-text);font-size:0.82rem;';
  const rawTextBody = document.createElement('pre');
  rawTextBody.style.cssText = 'padding:0.75rem;margin:0;white-space:pre-wrap;word-break:break-word;color:var(--color-text-muted);background:var(--color-bg);font-size:0.7rem;line-height:1.4;max-height:200px;overflow-y:auto;';
  rawTextContainer.appendChild(rawTextSummary);
  rawTextContainer.appendChild(rawTextBody);
  resultsSection.appendChild(rawTextContainer);

  const analysisCards = document.createElement('div');
  analysisCards.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:0.75rem;';
  resultsSection.appendChild(analysisCards);

  wrapper.appendChild(fileInput);

  cameraBtn.addEventListener('click', async () => {
    if (mediaStream) { stopCamera(); return; }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      video.srcObject = mediaStream;
      videoContainer.style.display = 'block';
      captureBtn.style.display = 'block';
      cameraBtn.textContent = 'Close Camera';
      previewContainer.style.display = 'none';
      resultsSection.style.display = 'none';
      statusText.textContent = 'Camera active. Point at label and tap Capture & Analyze.';
    } catch {
      statusText.textContent = 'Camera unavailable. Grant permission or use Upload.';
    }
  });

  captureBtn.addEventListener('click', () => {
    if (!mediaStream) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopCamera();
    processImage(dataUrl);
  });

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    videoContainer.style.display = 'none';
    captureBtn.style.display = 'none';
    cameraBtn.textContent = '📷 Camera';
  }

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = '';
    const reader = new FileReader();
    reader.onload = (e) => processImage(e.target.result);
    reader.readAsDataURL(file);
  });

  async function processImage(dataUrl) {
    previewImg.src = dataUrl;
    previewContainer.style.display = 'block';
    processingOverlay.style.display = 'flex';
    procStatus.textContent = 'Sending to AI...';
    statusText.textContent = 'AI analyzing label image...';
    resultsSection.style.display = 'none';

    try {
      const blob = await (await fetch(dataUrl)).blob();
      const formData = new FormData();
      formData.append('image', blob, 'label.jpg');

      const res = await fetch('/api/tools/ingredient-scanner-ai/analyze', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Backend returned ' + res.status);
      const { task_id } = await res.json();

      procStatus.textContent = 'AI reading label...';
      let attempts = 0;
      let taskResult = null;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
        const pollRes = await fetch(`/api/tools/ingredient-scanner-ai/result/${task_id}`);
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();
        if (pollData.status === 'done') {
          taskResult = pollData.result;
          break;
        } else if (pollData.status === 'text_processing') {
          procStatus.textContent = 'AI parsing ingredients...';
        } else if (pollData.status === 'error') {
          throw new Error(pollData.error || 'AI analysis failed');
        }
      }

      if (!taskResult) throw new Error('AI analysis timed out');

      currentResult = taskResult;
      renderResults(taskResult);
      statusText.textContent = `Found ${taskResult.ingredients?.length || 0} ingredients with AI.`;
    } catch (err) {
      toolLog('ingredient-scanner-ai', 'api_error', { summary: err.message }).catch(() => {});
      procStatus.textContent = 'Analysis failed. Try a clearer image.';
      statusText.textContent = `Error: ${err.message}`;
    } finally {
      processingOverlay.style.display = 'none';
    }
  }

  function renderResults(result) {
    const ingredients = result.ingredients || [];
    const nutrition = result.nutrition || {};
    const rawText = result.raw_label_text || '';

    ingredientTableContainer.innerHTML = '';
    nutritionPanel.style.display = 'none';
    rawTextBody.textContent = rawText;
    analysisCards.innerHTML = '';
    resultsSection.style.display = 'flex';

    // ── Ingredient List ──
    const listHeader = document.createElement('div');
    listHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.75rem 1rem;background:var(--color-surface);border-bottom:1px solid var(--color-border);border-radius:8px 8px 0 0;';

    const leftGroup = document.createElement('div');
    leftGroup.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '▼';
    toggleBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:0.6rem;color:var(--color-text-muted);padding:0;width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:3px;';
    toggleBtn.onmouseenter = () => { toggleBtn.style.background = 'var(--color-bg)'; };
    toggleBtn.onmouseleave = () => { toggleBtn.style.background = 'none'; };
    let expanded = true;

    const listTitle = document.createElement('span');
    listTitle.style.cssText = 'font-size:0.85rem;font-weight:600;color:var(--color-text);display:flex;align-items:center;gap:0.5rem;';
    listTitle.innerHTML = `<span style="font-size:1rem;">📋</span> Ingredients (${ingredients.length})`;

    const badge = document.createElement('span');
    badge.textContent = 'AI Powered';
    badge.style.cssText = 'font-size:0.65rem;padding:0.2rem 0.5rem;border-radius:4px;background:var(--color-primary);color:#fff;font-weight:500;white-space:nowrap;';

    leftGroup.appendChild(toggleBtn);
    leftGroup.appendChild(listTitle);
    leftGroup.appendChild(badge);
    listHeader.appendChild(leftGroup);
    ingredientTableContainer.appendChild(listHeader);

    const listBody = document.createElement('div');
    listBody.style.cssText = 'display:flex;flex-direction:column;';

    const hdrRow = document.createElement('div');
    hdrRow.style.cssText = 'display:grid;grid-template-columns:2rem auto 1fr auto 0.75rem;gap:0.5rem;align-items:center;padding:0.35rem 0.85rem;border-bottom:1px solid var(--color-border);font-size:0.6rem;color:var(--color-text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.3px;background:var(--color-bg);';
    hdrRow.innerHTML = '<span style="text-align:center;">#</span><span style="text-align:right;">Qty</span><span>Ingredient</span><span>Category</span><span></span>';
    listBody.appendChild(hdrRow);

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      const catColor = CATEGORY_COLORS[ing.category] || 'var(--color-text-muted)';
      let healthDot, healthTitle;
      if (ing.is_whole_food) { healthDot = '#2ecc71'; healthTitle = 'Good'; }
      else if (ing.is_additive) { healthDot = '#f39c12'; healthTitle = 'Info'; }
      else { healthDot = 'var(--color-text-muted)'; healthTitle = 'Neutral'; }

      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:2rem auto 1fr auto 0.75rem;gap:0.5rem;align-items:center;padding:0.45rem 0.85rem;border-bottom:1px solid var(--color-border);font-size:0.78rem;';
      const isEven = i % 2 === 0;
      if (isEven) row.style.background = 'var(--color-bg)';
      row.onmouseenter = () => { row.style.background = 'var(--color-surface)'; };
      row.onmouseleave = () => { row.style.background = isEven ? 'var(--color-bg)' : ''; };

      const numEl = document.createElement('span');
      numEl.textContent = i + 1;
      numEl.style.cssText = 'color:var(--color-text-muted);font-size:0.7rem;text-align:center;font-weight:500;min-width:1.2rem;';

      const qtyEl = document.createElement('span');
      qtyEl.textContent = ing.quantity || '—';
      qtyEl.style.cssText = 'color:var(--color-text-muted);font-size:0.68rem;text-align:right;font-weight:500;min-width:2.2rem;white-space:nowrap;';

      const nameEl = document.createElement('div');
      nameEl.style.cssText = 'display:flex;flex-direction:column;gap:1px;min-width:0;';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = ing.name;
      nameSpan.style.cssText = 'color:var(--color-text);font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameEl.appendChild(nameSpan);
      if (ing.e_number) {
        const metaSpan = document.createElement('span');
        metaSpan.textContent = `E-number: ${ing.e_number}`;
        metaSpan.style.cssText = 'font-size:0.65rem;color:var(--color-text-muted);';
        nameEl.appendChild(metaSpan);
      }

      const catEl = document.createElement('span');
      catEl.textContent = `${CATEGORY_ICONS[ing.category] || ''} ${ing.category.replace(/_/g, ' ')}`;
      catEl.style.cssText = `font-size:0.65rem;padding:0.15rem 0.45rem;border-radius:4px;background:${catColor}18;color:${catColor};font-weight:500;white-space:nowrap;`;

      const healthEl = document.createElement('span');
      healthEl.style.cssText = `width:0.6rem;height:0.6rem;border-radius:50%;background:${healthDot};justify-self:center;flex-shrink:0;`;
      healthEl.title = healthTitle;

      row.appendChild(numEl);
      row.appendChild(qtyEl);
      row.appendChild(nameEl);
      row.appendChild(catEl);
      row.appendChild(healthEl);
      listBody.appendChild(row);
    }

    const listBodyWrapper = document.createElement('div');
    listBodyWrapper.style.cssText = 'overflow:hidden;';
    listBodyWrapper.appendChild(listBody);
    ingredientTableContainer.appendChild(listBodyWrapper);
    toggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      toggleBtn.textContent = expanded ? '▼' : '▶';
      listBodyWrapper.style.display = expanded ? '' : 'none';
    });

    // ── Nutrition Facts panel ──
    const p100 = nutrition.per_100g || {};
    const pSrv = nutrition.per_serving || {};
    const hasNutrition = Object.keys(p100).length > 0 || Object.keys(pSrv).length > 0;

    if (hasNutrition) {
      nutritionPanel.style.display = 'block';
      nutritionPanel.innerHTML = '';

      const nutHeader = document.createElement('div');
      nutHeader.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.75rem 1rem;background:var(--color-surface);border-bottom:1px solid var(--color-border);font-size:0.85rem;font-weight:600;color:var(--color-text);';
      nutHeader.innerHTML = '<span style="font-size:1rem;">📊</span> Nutrition Facts';
      if (nutrition.serving_size) {
        const ss = document.createElement('span');
        ss.textContent = `Serving: ${nutrition.serving_size}`;
        ss.style.cssText = 'font-size:0.65rem;padding:0.15rem 0.4rem;border-radius:4px;background:var(--color-bg);color:var(--color-text-muted);font-weight:500;margin-left:auto;';
        nutHeader.appendChild(ss);
      }
      nutritionPanel.appendChild(nutHeader);

      const fields = [
        ['Energy', 'energy_kcal', 'kcal'], ['Protein', 'protein_g', 'g'],
        ['Carbohydrate', 'carbohydrate_g', 'g'], ['Sugars', 'sugars_g', 'g'],
        ['Total Fat', 'total_fat_g', 'g'], ['Saturated Fat', 'saturated_fat_g', 'g'],
        ['Trans Fat', 'trans_fat_g', 'g'], ['Cholesterol', 'cholesterol_mg', 'mg'],
        ['Sodium', 'sodium_mg', 'mg'], ['Dietary Fiber', 'dietary_fiber_g', 'g'],
      ];

      const rows = fields.filter(([, key]) => p100[key] !== undefined || pSrv[key] !== undefined);

      if (rows.length > 0) {
        const table = document.createElement('div');
        table.style.cssText = 'display:grid;grid-template-columns:1fr auto auto;font-size:0.75rem;';

        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:contents;font-weight:600;color:var(--color-text-muted);font-size:0.68rem;text-transform:uppercase;letter-spacing:0.3px;';
        hdr.innerHTML = '<div style="padding:0.4rem 0.75rem;border-bottom:1px solid var(--color-border);">Nutrient</div>'
          + '<div style="padding:0.4rem 0.75rem;border-bottom:1px solid var(--color-border);text-align:right;">Per serving</div>'
          + '<div style="padding:0.4rem 0.75rem;border-bottom:1px solid var(--color-border);text-align:right;">Per 100g</div>';
        table.appendChild(hdr);

        for (const [label, key, unit] of rows) {
          const rowDiv = document.createElement('div');
          rowDiv.style.cssText = 'display:contents;';
          rowDiv.innerHTML = `<div style="padding:0.35rem 0.75rem;border-bottom:1px solid var(--color-border);color:var(--color-text);">${label}</div>`
            + `<div style="padding:0.35rem 0.75rem;border-bottom:1px solid var(--color-border);text-align:right;color:var(--color-text);font-weight:500;">${pSrv[key] !== undefined ? `${pSrv[key]} ${unit}` : '—'}</div>`
            + `<div style="padding:0.35rem 0.75rem;border-bottom:1px solid var(--color-border);text-align:right;color:var(--color-text-muted);">${p100[key] !== undefined ? `${p100[key]} ${unit}` : '—'}</div>`;
          table.appendChild(rowDiv);
        }
        nutritionPanel.appendChild(table);
      } else {
        const empty = document.createElement('div');
        empty.textContent = 'Nutrition data extracted but values could not be structured. Check raw text below.';
        empty.style.cssText = 'padding:0.75rem;font-size:0.75rem;color:var(--color-text-muted);text-align:center;';
        nutritionPanel.appendChild(empty);
      }
    }

    // ── Health Analysis cards ──
    const analysisEntries = computeAnalysis(ingredients, nutrition);
    if (analysisEntries.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No analysis metrics available.';
      empty.style.cssText = 'font-size:0.82rem;color:var(--color-text-muted);font-style:italic;padding:1rem;text-align:center;';
      analysisCards.appendChild(empty);
    } else {
      for (const result of analysisEntries) {
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid var(--color-border);border-radius:10px;padding:0.85rem;background:var(--color-surface);display:flex;flex-direction:column;gap:0.55rem;';

        const hdr = document.createElement('div');
        hdr.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';
        const iconEl = document.createElement('span');
        iconEl.textContent = result.icon;
        iconEl.style.cssText = 'font-size:1.15rem;flex-shrink:0;line-height:1;';
        const labelEl = document.createElement('span');
        labelEl.textContent = result.label;
        labelEl.style.cssText = 'font-size:0.82rem;font-weight:600;color:var(--color-text);flex:1;';
        const gradeEl = document.createElement('span');
        gradeEl.textContent = result.grade;
        gradeEl.style.cssText = `font-size:0.7rem;font-weight:700;padding:0.2rem 0.5rem;border-radius:5px;background:${result.color};color:#fff;white-space:nowrap;`;

        hdr.appendChild(iconEl);
        hdr.appendChild(labelEl);
        hdr.appendChild(gradeEl);
        card.appendChild(hdr);

        if (result.maxScore > 0) {
          const barOuter = document.createElement('div');
          barOuter.style.cssText = 'height:6px;border-radius:3px;background:var(--color-bg);overflow:hidden;';
          const barInner = document.createElement('div');
          barInner.style.cssText = `height:100%;width:${Math.min(100, result.percent || 0)}%;background:${result.color};border-radius:3px;transition:width 0.5s ease;`;
          barOuter.appendChild(barInner);
          card.appendChild(barOuter);
        }

        const detEl = document.createElement('div');
        detEl.textContent = result.details;
        detEl.style.cssText = 'font-size:0.7rem;color:var(--color-text-muted);line-height:1.45;';
        card.appendChild(detEl);
        analysisCards.appendChild(card);
      }
    }

    resultsSection.style.display = 'flex';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function computeAnalysis(ingredients, nutrition) {
    const total = ingredients.length;
    const results = [];
    const cats = {};
    for (const ing of ingredients) {
      const c = ing.category || 'other';
      cats[c] = (cats[c] || 0) + 1;
    }

    const addMetric = (id, label, compute) => {
      const r = compute(label);
      if (r) results.push({ icon: ANALYSIS_ICONS[id] || '📊', ...r });
    };

    addMetric('sugar', 'Sugar Analysis', (label) => {
      const count = (cats.sweetener || 0) + (cats.artificial_sweetener || 0);
      const pct = total > 0 ? (count / total) * 100 : 0;
      if (count === 0) return { label, grade: 'A', color: 'var(--color-green, #2ecc71)', score: 0, maxScore: total, percent: 0, details: 'No sweeteners detected.' };
      return { label, grade: pct > 12 ? 'F' : pct > 6 ? 'C' : 'B', color: pct > 12 ? 'var(--color-red, #e74c3c)' : pct > 6 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)', score: count, maxScore: total, percent: Math.round(pct), details: `${count} sweetener${count > 1 ? 's' : ''} (${Math.round(pct)}% of ingredients).` };
    });

    addMetric('additives', 'Additive Count', (label) => {
      const addCount = ingredients.filter(i => i.is_additive).length;
      const eCount = ingredients.filter(i => i.e_number).length;
      if (addCount === 0) return { label, grade: 'A', color: 'var(--color-green, #2ecc71)', score: 0, maxScore: total, percent: 0, details: 'No additives detected.' };
      return { label, grade: eCount > 5 ? 'F' : eCount > 2 ? 'C' : 'B', color: eCount > 5 ? 'var(--color-red, #e74c3c)' : eCount > 2 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)', score: addCount, maxScore: total, percent: Math.round((addCount / total) * 100), details: `${addCount} additive${addCount > 1 ? 's' : ''} (${eCount} with E-numbers).` };
    });

    addMetric('nova', 'NOVA Processing Level', (label) => {
      const ultra = ingredients.filter(i => ['artificial_color', 'artificial_flavor', 'artificial_sweetener'].includes(i.category)).length;
      const processed = ingredients.filter(i => i.is_additive).length;
      const ultraRatio = total > 0 ? ultra / total : 0;
      const procRatio = total > 0 ? processed / total : 0;
      if (ultraRatio > 0.15) return { label, grade: 'NOVA 4', color: 'var(--color-red, #e74c3c)', score: 4, maxScore: 4, percent: 100, details: 'Ultra-processed.' };
      if (procRatio > 0.4) return { label, grade: 'NOVA 3', color: 'var(--color-orange, #e67e22)', score: 3, maxScore: 4, percent: 75, details: 'Processed.' };
      if (processed > 0) return { label, grade: 'NOVA 2', color: 'var(--color-yellow, #f1c40f)', score: 2, maxScore: 4, percent: 50, details: 'Processed culinary ingredients.' };
      return { label, grade: 'NOVA 1', color: 'var(--color-green, #2ecc71)', score: 1, maxScore: 4, percent: 25, details: 'Unprocessed / Minimally processed.' };
    });

    addMetric('nutriscore', 'Nutri-Score Estimate', (label) => {
      const good = (cats.fruit_vegetable || 0) + (cats.nut_seed || 0) + (cats.whole_food || 0) + (cats.water || 0);
      const bad = (cats.sweetener || 0) + (cats.artificial_sweetener || 0) + (cats.salt_sodium || 0) + (cats.fat_oil || 0);
      const ratio = bad > 0 ? good / bad : good > 0 ? 5 : 0;
      const grade = ratio > 3 ? 'A' : ratio > 2 ? 'B' : ratio > 1 ? 'C' : ratio > 0.5 ? 'D' : 'E';
      const color = grade === 'A' ? 'var(--color-green, #2ecc71)' : grade === 'B' ? '#8bc34a' : grade === 'C' ? 'var(--color-yellow, #f1c40f)' : grade === 'D' ? 'var(--color-orange, #e67e22)' : 'var(--color-red, #e74c3c)';
      return { label, grade, color, score: Math.min(5, ratio), maxScore: 5, percent: Math.min(100, Math.round((ratio / 5) * 100)), details: `Ratio: ${ratio.toFixed(1)}:1 beneficial vs concerning.` };
    });

    addMetric('list_length', 'Ingredient List Length', (label) => {
      let grade, gradeColor;
      if (total <= 5) { grade = 'A (Minimal)'; gradeColor = 'var(--color-green, #2ecc71)'; }
      else if (total <= 10) { grade = 'B (Short)'; gradeColor = '#8bc34a'; }
      else if (total <= 15) { grade = 'C (Moderate)'; gradeColor = 'var(--color-yellow, #f1c40f)'; }
      else { grade = 'D (Long)'; gradeColor = 'var(--color-orange, #e67e22)'; }
      return { label, grade, color: gradeColor, score: total, maxScore: 25, percent: Math.min(100, Math.round((total / 25) * 100)), details: `${total} ingredient${total > 1 ? 's' : ''}.` };
    });

    addMetric('allergens', 'Allergen Detection', (label) => {
      const allergenCount = cats.allergen || 0;
      return { label, grade: allergenCount > 0 ? `${allergenCount} detected` : 'None', color: allergenCount > 0 ? 'var(--color-orange, #e67e22)' : 'var(--color-green, #2ecc71)', score: allergenCount, maxScore: total, percent: allergenCount > 0 ? Math.round((allergenCount / total) * 100) : 0, details: allergenCount > 0 ? `${allergenCount} allergen ingredient${allergenCount > 1 ? 's' : ''} flagged.` : 'No common allergens flagged by AI.' };
    });

    addMetric('recognizability', 'Ingredient Recognizability', (label) => {
      const recog = ingredients.filter(i => i.is_recognizable).length;
      const pct = total > 0 ? Math.round((recog / total) * 100) : 0;
      return { label, grade: pct >= 70 ? 'A' : pct >= 40 ? 'B' : 'C', color: pct >= 70 ? 'var(--color-green, #2ecc71)' : pct >= 40 ? 'var(--color-orange, #e67e22)' : 'var(--color-red, #e74c3c)', score: recog, maxScore: total, percent: pct, details: `${recog} of ${total} ingredients (${pct}%) are recognizable.` };
    });

    addMetric('whole_food', 'Whole Food Density', (label) => {
      const whole = ingredients.filter(i => i.is_whole_food).length;
      const pct = total > 0 ? Math.round((whole / total) * 100) : 0;
      return { label, grade: pct >= 60 ? 'A' : pct >= 35 ? 'B' : 'C', color: pct >= 60 ? 'var(--color-green, #2ecc71)' : pct >= 35 ? 'var(--color-yellow, #f1c40f)' : 'var(--color-red, #e74c3c)', score: whole, maxScore: total, percent: pct, details: `${whole} of ${total} ingredients (${pct}%) are whole foods.` };
    });

    addMetric('artificial', 'Artificial Additive Index', (label) => {
      const art = (cats.artificial_color || 0) + (cats.artificial_flavor || 0) + (cats.artificial_sweetener || 0);
      return { label, grade: art > 0 ? `${art} detected` : 'None', color: art > 0 ? 'var(--color-red, #e74c3c)' : 'var(--color-green, #2ecc71)', score: art, maxScore: Math.max(art, 1), percent: Math.min(100, art * 25), details: art > 0 ? `${art} artificial additive${art > 1 ? 's' : ''}.` : 'No artificial additives detected.' };
    });

    addMetric('plant_score', 'Beneficial Plant Food Score', (label) => {
      const plants = (cats.fruit_vegetable || 0) + (cats.nut_seed || 0) + (cats.spice || 0);
      const score = Math.min(5, plants);
      return { label, grade: '★'.repeat(score) + '☆'.repeat(5 - score), color: score >= 4 ? 'var(--color-green, #2ecc71)' : score >= 2 ? 'var(--color-orange, #e67e22)' : 'var(--color-text-muted)', score, maxScore: 5, percent: Math.round((score / 5) * 100), details: plants > 0 ? `${plants} beneficial plant-based ingredients.` : 'No beneficial plant foods detected.' };
    });

    // ── Nutrition-based analyses ──
    const p100 = nutrition.per_100g || {};
    const pSrv = nutrition.per_serving || {};
    const cal = p100.energy_kcal || 0;

    if (cal > 0) {
      addMetric('nutrition_breakdown', 'Nutrition Breakdown', (label) => {
        const color = cal > 400 ? 'var(--color-orange, #e67e22)' : cal > 275 ? 'var(--color-yellow, #f1c40f)' : cal > 100 ? '#8bc34a' : 'var(--color-green, #2ecc71)';
        const grade = cal > 400 ? 'D (High cal)' : cal > 275 ? 'C (Moderate cal)' : cal > 100 ? 'B (Low cal)' : 'A (Very low cal)';
        return { label, grade, color, score: cal, maxScore: 500, percent: Math.min(100, Math.round((cal / 500) * 100)), details: `Energy: ${cal} kcal/100g. ${pSrv.energy_kcal ? `Per serving: ${pSrv.energy_kcal} kcal.` : ''}` };
      });

      addMetric('nutrient_density', 'Nutrient Density Index', (label) => {
        const protein = p100.protein_g || 0;
        const fiber = p100.dietary_fiber_g || 0;
        const satFat = p100.saturated_fat_g || 0;
        const sodium = p100.sodium_mg || 0;
        let score = 0, maxScore = 0;
        if (cal > 0) {
          if (protein > 0) { score += Math.min(25, protein / (cal / 100) * 5); maxScore += 25; }
          if (fiber > 0) { score += Math.min(25, fiber / (cal / 100) * 10); maxScore += 25; }
          if (satFat > 0) { score += Math.max(0, 25 - satFat / (cal / 100) * 5); maxScore += 25; }
          if (sodium > 0) { score += Math.max(0, 25 - sodium / (cal / 100) * 2); maxScore += 25; }
        }
        const pct = maxScore > 0 ? Math.round(score / maxScore * 100) : 50;
        const grade = pct >= 75 ? 'A (Nutrient-dense)' : pct >= 55 ? 'B (Good)' : pct >= 40 ? 'C (Average)' : 'D (Low)';
        const color = pct >= 75 ? 'var(--color-green, #2ecc71)' : pct >= 55 ? '#8bc34a' : pct >= 40 ? 'var(--color-yellow, #f1c40f)' : 'var(--color-orange, #e67e22)';
        return { label, grade, color, score: pct, maxScore: 100, percent: pct, details: `Score: ${pct}/100. Protein: ${protein}g, Fiber: ${fiber}g (per 100g).` };
      });
    }

    return results;
  }

  return () => {
    stopCamera();
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = '';
}
