import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { getPref, setPref } from '../services/db.js';

export const icon = '📷';
export const name = 'Barcode Scanner';
export const description = 'Scan product barcodes and QR codes using your camera, with automatic product lookup from multiple sources';

const HISTORY_KEY = 'barcode_scanner_history';
const HISTORY_MAX = 50;

const PRODUCT_FORMATS = new Set([
  'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39',
  'CODE_93', 'CODABAR', 'ITF', 'RSS_14', 'RSS_EXPANDED',
]);

export function init(container) {
  let html5QrCode = null;
  let scanning = false;
  const formatsToSupport = Object.values(Html5QrcodeSupportedFormats)
    .filter(v => typeof v === 'number');
  const camConfig = { fps: 10, qrbox: { width: 280, height: 180 }, formatsToSupport };

  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'display:flex;flex-direction:column;height:100%;padding:1.25rem;gap:1rem;overflow-y:auto;';
  container.appendChild(wrapper);

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.75rem;flex-wrap:wrap;';

  const title = document.createElement('h2');
  title.textContent = 'Barcode Scanner';
  title.style.cssText = 'margin:0;font-size:1.1rem;font-weight:600;color:var(--color-text);';

  const headerBtns = document.createElement('div');
  headerBtns.style.cssText = 'display:flex;gap:0.4rem;';

  const scanBtn = document.createElement('button');
  scanBtn.textContent = 'Scan Camera';
  scanBtn.style.cssText =
    'padding:0.55rem 1rem;border:none;border-radius:8px;background:var(--color-primary);color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer;transition:opacity 0.15s;';

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload Image';
  uploadBtn.style.cssText =
    'padding:0.55rem 1rem;border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);font-size:0.82rem;font-weight:600;cursor:pointer;transition:opacity 0.15s;';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  headerBtns.appendChild(scanBtn);
  headerBtns.appendChild(uploadBtn);
  header.appendChild(title);
  header.appendChild(headerBtns);
  wrapper.appendChild(header);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:0.82rem;color:var(--color-text-muted);min-height:1.2em;';
  status.textContent = 'Press "Scan" to start the camera and detect codes.';
  wrapper.appendChild(status);

  const videoContainer = document.createElement('div');
  videoContainer.style.cssText =
    'display:none;position:relative;border-radius:8px;overflow:hidden;background:#000;aspect-ratio:4/3;max-height:300px;';

  const video = document.createElement('video');
  video.style.cssText = 'width:100%;height:100%;object-fit:contain;';
  video.setAttribute('playsinline', '');
  video.setAttribute('autoplay', '');
  video.muted = true;

  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:absolute;inset:0;border:3px solid var(--color-primary);border-radius:8px;pointer-events:none;opacity:0;transition:opacity 0.2s;';
  overlay.id = 'scan-overlay';

  videoContainer.appendChild(video);
  videoContainer.appendChild(overlay);
  wrapper.appendChild(videoContainer);

  const resultCard = document.createElement('div');
  resultCard.style.cssText =
    'display:none;border-radius:8px;border:1px solid var(--color-border);background:var(--color-surface);overflow:hidden;';
  wrapper.appendChild(resultCard);

  const resultMinimal = document.createElement('div');
  resultMinimal.style.cssText =
    'display:flex;align-items:center;gap:0.85rem;padding:0.85rem;cursor:pointer;';

  const resultThumb = document.createElement('img');
  resultThumb.style.cssText =
    'width:56px;height:56px;border-radius:6px;object-fit:cover;background:var(--color-bg);flex-shrink:0;display:none;';
  resultThumb.alt = '';

  const resultInfo = document.createElement('div');
  resultInfo.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';

  const resultTitle = document.createElement('div');
  resultTitle.style.cssText = 'font-size:0.88rem;font-weight:600;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

  const resultSub = document.createElement('div');
  resultSub.style.cssText = 'font-size:0.78rem;color:var(--color-text-muted);';

  const expandIcon = document.createElement('span');
  expandIcon.textContent = '▶';
  expandIcon.style.cssText = 'font-size:0.7rem;color:var(--color-text-muted);transition:transform 0.2s;flex-shrink:0;';

  resultInfo.appendChild(resultTitle);
  resultInfo.appendChild(resultSub);
  resultMinimal.appendChild(resultThumb);
  resultMinimal.appendChild(resultInfo);
  resultMinimal.appendChild(expandIcon);
  resultCard.appendChild(resultMinimal);

  const resultDetails = document.createElement('div');
  resultDetails.style.cssText =
    'display:none;padding:0 0.85rem 0.85rem;border-top:1px solid var(--color-border);font-size:0.82rem;color:var(--color-text);gap:0.5rem;flex-direction:column;';
  resultCard.appendChild(resultDetails);

  const historySection = document.createElement('div');
  historySection.style.cssText =
    'display:none;flex-direction:column;gap:0.5rem;';

  const historyHeader = document.createElement('div');
  historyHeader.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;';

  const historyTitle = document.createElement('div');
  historyTitle.textContent = 'Scan History';
  historyTitle.style.cssText = 'font-size:0.9rem;font-weight:600;color:var(--color-text);';

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Clear';
  clearBtn.style.cssText =
    'padding:0.25rem 0.6rem;border:1px solid var(--color-border);border-radius:6px;font-size:0.72rem;cursor:pointer;background:none;color:var(--color-text-muted);';

  historyHeader.appendChild(historyTitle);
  historyHeader.appendChild(clearBtn);

  const historyList = document.createElement('div');
  historyList.style.cssText =
    'display:flex;flex-direction:column;gap:0.4rem;max-height:200px;overflow-y:auto;';

  historySection.appendChild(historyHeader);
  historySection.appendChild(historyList);
  wrapper.appendChild(fileInput);

  const fileScanContainer = document.createElement('div');
  fileScanContainer.id = 'barcode-scanner-file';
  fileScanContainer.style.display = 'none';
  wrapper.appendChild(fileScanContainer);

  wrapper.appendChild(historySection);

  const CART_KEY = 'barcode_scanner_cart';
  let cart = [];

  const cartSection = document.createElement('div');
  cartSection.style.cssText = 'display:none;flex-direction:column;gap:0.5rem;';

  const cartHeader = document.createElement('div');
  cartHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;';

  const cartTitle = document.createElement('div');
  cartTitle.textContent = 'Cart';
  cartTitle.style.cssText = 'font-size:0.9rem;font-weight:600;color:var(--color-text);';

  const cartActions = document.createElement('div');
  cartActions.style.cssText = 'display:flex;gap:0.4rem;';

  const clearCartBtn = document.createElement('button');
  clearCartBtn.textContent = 'Clear Cart';
  clearCartBtn.style.cssText = 'padding:0.25rem 0.6rem;border:1px solid var(--color-border);border-radius:6px;font-size:0.72rem;cursor:pointer;background:none;color:var(--color-text-muted);';

  const cartCount = document.createElement('span');
  cartCount.textContent = '0 items';
  cartCount.style.cssText = 'font-size:0.72rem;color:var(--color-text-muted);';

  cartActions.appendChild(cartCount);
  cartActions.appendChild(clearCartBtn);
  cartHeader.appendChild(cartTitle);
  cartHeader.appendChild(cartActions);

  const cartList = document.createElement('div');
  cartList.style.cssText = 'display:flex;flex-direction:column;gap:0.35rem;';

  const cartSummary = document.createElement('div');
  cartSummary.style.cssText = 'display:none;flex-direction:column;gap:0.35rem;padding:0.5rem 0.65rem;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg);font-size:0.78rem;';

  cartSection.appendChild(cartHeader);
  cartSection.appendChild(cartList);
  cartSection.appendChild(cartSummary);
  wrapper.appendChild(cartSection);

  loadHistory();
  loadCart();

  let availableCameras = [];

  Html5Qrcode.getCameras().then(cameras => {
    availableCameras = cameras || [];
    if (availableCameras.length === 0) {
      status.textContent = 'No camera detected — use "Upload Image" to scan from a photo.';
    }
  }).catch(() => {});

  resultMinimal.addEventListener('click', () => {
    const expanded = resultDetails.style.display !== 'none';
    resultDetails.style.display = expanded ? 'none' : 'flex';
    expandIcon.style.transform = expanded ? 'rotate(0deg)' : 'rotate(90deg)';
  });

  scanBtn.addEventListener('click', startScan);
  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', onFileSelected);

  clearBtn.addEventListener('click', async () => {
    await setPref(HISTORY_KEY, []);
    historyList.innerHTML = '';
    historySection.style.display = 'none';
  });

  function startScan() {
    if (scanning) return;
    scanning = true;
    scanBtn.disabled = true;
    scanBtn.style.opacity = '0.6';
    scanBtn.textContent = 'Starting...';
    status.textContent = 'Requesting camera access...';
    videoContainer.style.display = 'block';
    videoContainer.innerHTML = '';
    resultCard.style.display = 'none';

    const scannerEl = document.createElement('div');
    scannerEl.id = 'barcode-scanner-inner';
    scannerEl.style.cssText = 'width:100%;height:100%;';
    videoContainer.appendChild(scannerEl);

    html5QrCode = new Html5Qrcode('barcode-scanner-inner');

    tryStart({ facingMode: 'environment' });
  }

  function tryStart(camIdOrConfig) {
    html5QrCode.start(camIdOrConfig, camConfig, onScanSuccess, onScanFailure)
      .then(() => {
        status.textContent = 'Point camera at a barcode or QR code...';
      })
      .catch(() => {
        if (typeof camIdOrConfig !== 'string' && availableCameras.length > 0) {
          tryNextCamera(0);
        } else {
          onCameraError();
        }
      });
  }

  function tryNextCamera(index) {
    if (index >= availableCameras.length) {
      onCameraError();
      return;
    }
    html5QrCode.stop().catch(() => {}).then(() => {
      html5QrCode.start(availableCameras[index].id, camConfig, onScanSuccess, onScanFailure)
        .then(() => {
          status.textContent = 'Point camera at a barcode or QR code...';
        })
        .catch(() => {
          tryNextCamera(index + 1);
        });
    });
  }

  function onCameraError() {
    scanning = false;
    const isHttps = location.protocol === 'https:' || location.hostname === 'localhost';
    const help = !isHttps
      ? 'Camera requires HTTPS. Serve over HTTPS or localhost.'
      : 'Grant camera permission in your browser settings, or use "Upload Image".';
    status.textContent = 'Camera unavailable. ' + help;
    scanBtn.disabled = false;
    scanBtn.style.opacity = '1';
    scanBtn.textContent = 'Scan Camera';
    videoContainer.style.display = 'none';
    stopCamera();
  }

  async function onFileSelected() {
    const file = fileInput.files?.[0];
    if (!file) return;
    fileInput.value = '';

    status.textContent = 'Scanning image for codes...';
    resultCard.style.display = 'none';

    const codeScanner = new Html5Qrcode('barcode-scanner-file');
    try {
      const result = await codeScanner.scanFileV2(file, false);
      status.textContent = 'Code found in image.';
      const formatName = result.result.format
        ? result.result.format.formatName : 'QR_CODE';
      sendPing({ rawValue: result.decodedText, format: formatName });
      onDetected(result.decodedText, formatName);
    } catch {
      status.textContent = 'No code detected in the selected image. Try another.';
    } finally {
      codeScanner.clear();
    }
  }

  function onScanSuccess(decodedText, result) {
    if (!scanning) return;
    scanning = false;
    videoContainer.style.display = 'none';
    const formatName = result.result.format
      ? result.result.format.formatName : 'QR_CODE';
    stopCamera();
    sendPing({ rawValue: decodedText, format: formatName });
    onDetected(decodedText, formatName);
  }

  function onScanFailure() {}

  function stopCamera() {
    if (html5QrCode) {
      const qr = html5QrCode;
      html5QrCode = null;
      qr.stop().catch(() => {}).then(() => qr.clear());
    }
    videoContainer.style.display = 'none';
    videoContainer.innerHTML = '';
    scanBtn.disabled = false;
    scanBtn.style.opacity = '1';
    scanBtn.textContent = 'Scan';
  }

  function onDetected(rawValue, format) {
    const isQR = format === 'QR_CODE';
    const isProduct = PRODUCT_FORMATS.has(format);

    if (isQR) {
      showQRResult(rawValue, format);
    } else if (isProduct) {
      status.textContent = `Found ${format}: ${rawValue}. Looking up product info...`;
      lookupProduct(rawValue, format);
    } else {
      showGenericBarcode(rawValue, format);
    }
  }

  function showQRResult(value, format) {
    const isUrl = value.startsWith('http://') || value.startsWith('https://');
    resultCard.style.display = 'block';

    resultThumb.style.display = 'none';
    resultTitle.textContent = isUrl ? new URL(value).hostname : 'QR Code';
    resultSub.textContent = `${format} · ${value.length} chars`;
    resultDetails.style.display = 'none';
    expandIcon.style.transform = 'rotate(0deg)';
    resultDetails.innerHTML = '';

    const contentEl = document.createElement('div');
    contentEl.style.cssText = 'word-break:break-all;line-height:1.5;';

    if (isUrl) {
      const link = document.createElement('a');
      link.href = value;
      link.textContent = value;
      link.target = '_blank';
      link.style.cssText = 'color:var(--color-primary);text-decoration:underline;';
      contentEl.appendChild(link);
    } else {
      contentEl.textContent = value;
    }
    resultDetails.appendChild(contentEl);

    status.textContent = 'QR code detected.';
    addToHistory({
      type: 'qr', format, value,
      product: null, productName: isUrl ? new URL(value).hostname : value,
    });
  }

  function showGenericBarcode(value, format) {
    resultCard.style.display = 'block';
    resultThumb.style.display = 'none';
    resultTitle.textContent = `${format.toUpperCase()}: ${value}`;
    resultSub.textContent = 'Unknown format — no product lookup available';
    resultDetails.style.display = 'none';
    expandIcon.style.transform = 'rotate(0deg)';
    resultDetails.innerHTML = '';

    status.textContent = `${format.toUpperCase()} code detected (${value}).`;
    addToHistory({
      type: 'barcode', format, value,
      product: null, productName: `${format.toUpperCase()}: ${value}`,
    });
  }

  function showProductResult(value, format, product, source) {
    resultCard.style.display = 'block';

    const imageUrl = product.image_url || product.image_front_url || (product.images && product.images.front?.display?.url) || null;
    if (imageUrl) {
      resultThumb.src = imageUrl;
      resultThumb.style.display = 'block';
      resultThumb.onerror = () => { resultThumb.style.display = 'none'; };
    } else {
      resultThumb.style.display = 'none';
    }

    const name = product.product_name || product.title || `Product ${value}`;
    const brand = product.brands || product.brand || '';
    resultTitle.textContent = name;
    resultSub.textContent = [brand, format.toUpperCase(), source].filter(Boolean).join(' · ');

    const barcodeRow = document.createElement('div');
    barcodeRow.style.cssText = 'display:flex;align-items:center;gap:0.35rem;padding:0 0.85rem 0.35rem;';
    const barcodeLabel = document.createElement('span');
    barcodeLabel.textContent = value;
    barcodeLabel.style.cssText = 'font-size:0.72rem;color:var(--color-text-muted);font-family:monospace;';
    const copyBarcode = makeCopyBtn(value, 'Copy barcode');
    barcodeRow.appendChild(barcodeLabel);
    barcodeRow.appendChild(copyBarcode);
    resultCard.insertBefore(barcodeRow, resultDetails);

    resultDetails.style.display = 'none';
    expandIcon.style.transform = 'rotate(0deg)';
    resultDetails.innerHTML = '';

    const detailFields = [];

    if (product.price) {
      detailFields.push({ label: 'Price', value: product.price });
    }
    if (product.rating) {
      detailFields.push({ label: 'Rating', value: product.rating });
    }

    if (product.description_html || product.description) {
      detailFields.push({ label: 'Description', value: product.description_html || product.description });
    }
    if (product.categories) {
      detailFields.push({ label: 'Categories', value: product.categories });
    }
    if (product.quantity) {
      detailFields.push({ label: 'Quantity', value: product.quantity });
    }
    if (product.packaging) {
      detailFields.push({ label: 'Packaging', value: product.packaging });
    }
    if (product.nutriscore_grade) {
      detailFields.push({ label: 'Nutri-Score', value: product.nutriscore_grade.toUpperCase() });
    }
    if (product.ecoscore_grade) {
      detailFields.push({ label: 'Eco-Score', value: product.ecoscore_grade.toUpperCase() });
    }
    if (product.nova_group) {
      detailFields.push({ label: 'NOVA Group', value: product.nova_group.toString() });
    }
    if (product.allergens) {
      detailFields.push({ label: 'Allergens', value: product.allergens });
    }
    if (product.traces) {
      detailFields.push({ label: 'Traces', value: product.traces });
    }

    if (detailFields.length === 0) {
      const noInfo = document.createElement('div');
      noInfo.textContent = 'No additional product details available.';
      noInfo.style.cssText = 'color:var(--color-text-muted);font-style:italic;';
      resultDetails.appendChild(noInfo);
    } else {
      for (const field of detailFields) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-direction:column;gap:2px;position:relative;';
        const labelRow = document.createElement('div');
        labelRow.style.cssText = 'display:flex;align-items:center;gap:0.35rem;';
        const label = document.createElement('div');
        label.textContent = field.label;
        label.style.cssText = 'font-size:0.72rem;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;';
        const copyField = makeCopyBtn(field.value, 'Copy ' + field.label);
        labelRow.appendChild(label);
        labelRow.appendChild(copyField);
        const value_el = document.createElement('div');
        value_el.textContent = field.value;
        value_el.style.cssText = 'font-size:0.82rem;color:var(--color-text);line-height:1.4;word-break:break-word;';
        row.appendChild(labelRow);
        row.appendChild(value_el);
        resultDetails.appendChild(row);
      }
    }

    if (product.image_nutrition_url || (product.images && product.images.nutrition)) {
      const nutritionBtn = document.createElement('button');
      nutritionBtn.textContent = 'View Nutrition Image';
      nutritionBtn.style.cssText =
        'padding:0.4rem 0.8rem;border:1px solid var(--color-border);border-radius:6px;font-size:0.78rem;cursor:pointer;background:none;color:var(--color-primary);margin-top:0.25rem;align-self:flex-start;';
      const nutritionImg = document.createElement('img');
      nutritionImg.style.cssText =
        'max-width:100%;border-radius:6px;margin-top:0.4rem;display:none;';
      const nutUrl = product.image_nutrition_url ||
        `https://images.openfoodfacts.org/images/products/${value.substring(0, 3)}/${value.substring(3, 6)}/${value.substring(6, 9)}/${value.substring(9)}/nutrition.${product.image_nutrition_url?.split('.').pop() || 'jpg'}`;
      nutritionBtn.addEventListener('click', () => {
        const shown = nutritionImg.style.display !== 'none';
        nutritionImg.style.display = shown ? 'none' : 'block';
        if (!shown) {
          nutritionImg.src = nutUrl;
        }
      });
      resultDetails.appendChild(nutritionBtn);
      resultDetails.appendChild(nutritionImg);
    }

    if (product.ingredients_text) {
      const ingredients = product.ingredients_text.split(',').map(s => {
        const trimmed = s.trim();
        const pctMatch = trimmed.match(/^(.+?)\s*\((\d+[\d.,]*\s*%)\)$/);
        if (pctMatch) return { name: pctMatch[1].trim(), pct: pctMatch[2].trim() };
        const pctAlt = trimmed.match(/^(.+?)\s+(\d+[\d.,]*%)$/);
        if (pctAlt) return { name: pctAlt[1].trim(), pct: pctAlt[2].trim() };
        return { name: trimmed, pct: '' };
      }).filter(i => i.name);

      const tableSection = document.createElement('div');
      tableSection.style.cssText = 'padding-top:0.4rem;border-top:1px solid var(--color-border);';

      const tableLabel = document.createElement('div');
      tableLabel.textContent = 'Ingredients';
      tableLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:0.25rem;';

      const table = document.createElement('table');
      table.style.cssText = 'width:100%;border-collapse:collapse;font-size:0.78rem;';

      const thead = document.createElement('thead');
      const hRow = document.createElement('tr');
      ['#', 'Ingredient', '%'].forEach((h, i) => {
        const th = document.createElement('th');
        th.textContent = h;
        th.style.cssText = `text-align:${i === 0 ? 'center' : i === 2 ? 'right' : 'left'};padding:0.3rem 0.4rem;border-bottom:1px solid var(--color-border);color:var(--color-text-muted);font-weight:600;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;`;
        hRow.appendChild(th);
      });
      thead.appendChild(hRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      ingredients.forEach((ing, idx) => {
        const r = document.createElement('tr');
        r.style.cssText = 'transition:background 0.1s;';
        r.onmouseenter = () => { r.style.background = 'var(--color-bg)'; };
        r.onmouseleave = () => { r.style.background = ''; };
        const cells = [
          { text: String(idx + 1), align: 'center' },
          { text: ing.name, align: 'left' },
          { text: ing.pct, align: 'right' },
        ];
        cells.forEach(c => {
          const td = document.createElement('td');
          td.textContent = c.text;
          td.style.cssText = `text-align:${c.align};padding:0.25rem 0.4rem;border-bottom:1px solid var(--color-border);color:var(--color-text);vertical-align:middle;white-space:${c.align === 'left' ? 'normal' : 'nowrap'};`;
          if (c.align === 'left') td.style.wordBreak = 'break-word';
          r.appendChild(td);
        });
        tbody.appendChild(r);
      });
      table.appendChild(tbody);
      tableSection.appendChild(tableLabel);
      tableSection.appendChild(table);
      resultDetails.appendChild(tableSection);
    }

    const addCartBtn = document.createElement('button');
    addCartBtn.textContent = 'Add to Cart';
    addCartBtn.style.cssText =
      'padding:0.45rem 0.9rem;border:none;border-radius:6px;font-size:0.78rem;font-weight:600;cursor:pointer;background:var(--color-primary);color:#fff;align-self:flex-start;margin-top:0.25rem;transition:opacity 0.15s;';
    addCartBtn.addEventListener('click', () => {
      addCartItem({
        barcode: value,
        productName: name,
        brand,
        priceText: product.price || '',
        imageUrl: imageUrl || '',
        source,
      });
    });
    resultDetails.appendChild(addCartBtn);

    marketplaceContainer = document.createElement('div');
    marketplaceContainer.style.cssText =
      'display:none;flex-direction:column;gap:0.4rem;padding-top:0.4rem;border-top:1px solid var(--color-border);';
    const marketplaceLabel = document.createElement('div');
    marketplaceLabel.textContent = 'Marketplace Listings';
    marketplaceLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:0.15rem;';
    marketplaceContainer.appendChild(marketplaceLabel);
    resultDetails.appendChild(marketplaceContainer);

    status.textContent = `Product found via ${source}. Tap card for details.`;
    addToHistory({
      type: 'barcode', format, value,
      product: { name, brand, imageUrl, source },
      productName: name,
    });
  }

  async function lookupProduct(code, format) {
    const normalized = code.replace(/^0+/, '');

    const results = await Promise.allSettled([
      lookupOpenFoodFacts(normalized, 'world'),
      lookupOpenFoodFacts(normalized, 'in'),
      lookupDatakick(normalized),
      lookupBarcodeLookup(normalized),
      lookupBuycott(normalized),
      lookupSaiSupermarket(normalized),
    ]);

    let found = false;
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { product, source } = result.value;
        showProductResult(code, format, product, source);
        found = true;
        break;
      }
    }

    if (!found) {
      showNoProductResult(code, format);
    }

    lookupBackendMarketplace(normalized).then(marketplace => {
      if (marketplace && (marketplace.amazon || marketplace.flipkart || marketplace.google_shopping || marketplace.buycott || marketplace.saisupermarket)) {
        addMarketplaceResults(marketplace);
      }
    });

    addExternalSearchLinks(code, format);
  }

  function showNoProductResult(code, format) {
    resultCard.style.display = 'block';
    resultThumb.style.display = 'none';
    resultTitle.textContent = `${format.toUpperCase()}: ${code}`;
    resultSub.textContent = 'No product information found in any source.';
    resultDetails.style.display = 'none';
    expandIcon.style.transform = 'rotate(0deg)';
    resultDetails.innerHTML = '';
    status.textContent = 'No product info found. Try a different barcode.';
    addToHistory({
      type: 'barcode', format, value: code,
      product: null, productName: `${format.toUpperCase()}: ${code}`,
    });
    marketplaceContainer = document.createElement('div');
    marketplaceContainer.style.cssText =
      'display:none;flex-direction:column;gap:0.4rem;padding-top:0.4rem;border-top:1px solid var(--color-border);';
    const marketplaceLabel = document.createElement('div');
    marketplaceLabel.textContent = 'Marketplace Listings';
    marketplaceLabel.style.cssText = 'font-size:0.7rem;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:0.15rem;';
    marketplaceContainer.appendChild(marketplaceLabel);
    resultDetails.appendChild(marketplaceContainer);
  }

  async function lookupOpenFoodFacts(code, region) {
    const domain = region === 'in' ? 'in.openfoodfacts.org' : 'world.openfoodfacts.net';
    const url = `https://${domain}/api/v2/product/${code}?fields=product_name,brands,categories,ingredients_text,quantity,packaging,nutriscore_grade,ecoscore_grade,nova_group,allergens,traces,image_url,image_front_url,image_nutrition_url,images`;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MediaServer-BarcodeScanner/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 1 && data.product) {
        return { product: data.product, source: region === 'in' ? 'Open Food Facts India' : 'Open Food Facts' };
      }
      return null;
    } catch { return null; }
  }

  async function lookupDatakick(code) {
    try {
      const res = await fetch(`https://www.gtinsearch.org/api/items/${code}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.title) {
        return {
          product: {
            product_name: data.title,
            brands: data.brand,
            categories: data.category,
            description: data.description,
            image_url: data.image,
          },
          source: 'Datakick',
        };
      }
      return null;
    } catch { return null; }
  }

  async function lookupBuycott(code) {
    const url = `https://www.buycott.com/upc/${encodeURIComponent(code)}`;
    const proxies = [
      u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
      u => `https://api.cors.syrins.tech/?url=${encodeURIComponent(u)}`,
    ];
    for (const proxy of proxies) {
      try {
        const res = await fetch(proxy(url), { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const titleEl = doc.querySelector('h1, .product-title, .product-name, .item-name');
        const brandEl = doc.querySelector('.brand, .product-brand, .brand-name, .manufacturer');
        const descEl = doc.querySelector('.description, .product-description, p.description, [class*="desc"]');
        const imgEl = doc.querySelector('img[src*="product"], img[src*="upc"], .product-image img, .main-image img');
        const priceEl = doc.querySelector('.price, .product-price, .item-price, span.price, [class*="price"]');
        const ratingEl = doc.querySelector('.rating, .product-rating, .star-rating, [class*="rating"], .average');
        if (titleEl) {
          return {
            product: {
              product_name: titleEl.textContent.trim(),
              brands: brandEl ? brandEl.textContent.trim() : '',
              description: descEl ? descEl.textContent.trim() : '',
              image_url: imgEl ? (imgEl.getAttribute('src') || '').replace(/^\/\//, 'https://') : '',
              price: priceEl ? priceEl.textContent.trim().substring(0, 100) : '',
              rating: ratingEl ? ratingEl.textContent.trim().substring(0, 50) : '',
            },
            source: 'Buycott',
          };
        }
      } catch { /* try next proxy */ }
    }
    return null;
  }

  async function lookupBarcodeLookup(code) {
    const proxies = [
      u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
      u => `https://api.cors.syrins.tech/?url=${encodeURIComponent(u)}`,
    ];
    for (const proxy of proxies) {
      try {
        const url = proxy(`https://www.barcodelookup.com/${code}`);
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const titleEl = doc.querySelector('.product-title, h1, .product-name, .item-name');
        const brandEl = doc.querySelector('.brand, .product-brand, .brand-name');
        const descEl = doc.querySelector('.product-description, .description, p.description');
        const imgEl = doc.querySelector('.product-image img, .main-image img, img.product-img');
        const priceEl = doc.querySelector('.product-price, .price, span.price, .product-offer-price');
        const ratingEl = doc.querySelector('.product-rating, .rating, .average-rating, [class*="rating"], .star-rating');
        if (titleEl) {
          return {
            product: {
              product_name: titleEl.textContent.trim(),
              brands: brandEl ? brandEl.textContent.trim() : '',
              description: descEl ? descEl.textContent.trim() : '',
              image_url: imgEl ? (imgEl.getAttribute('src') || '').replace(/^\/\//, 'https://') : '',
              price: priceEl ? priceEl.textContent.trim() : '',
              rating: ratingEl ? ratingEl.textContent.trim() : '',
            },
            source: 'BarcodeLookup',
          };
        }
      } catch { /* try next proxy */ }
    }
    return null;
  }

  async function lookupSaiSupermarket(code) {
    const proxies = [
      u => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
      u => `https://api.cors.syrins.tech/?url=${encodeURIComponent(u)}`,
    ];
    for (const proxy of proxies) {
      try {
        const url = proxy(`https://www.saisupermarket.in/search?q=${encodeURIComponent(code)}`);
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const card = doc.querySelector('.product-item, [class*="product"], .item, .product-card, .search-result-item');
        if (!card) {
          const link = doc.querySelector(`a[href*="/product/"], a[href*="/p/"], a[href*="/item/"]`);
          if (!link) continue;
          const title2 = link.getAttribute('title') || link.textContent.trim();
          if (title2) {
            return {
              product: {
                product_name: title2,
                price: '',
                rating: '',
              },
              source: 'SaiSuperMarket',
            };
          }
          continue;
        }
        const titleEl = card.querySelector('.product-title, .name, .title, h3, h4, a[href*="/product/"], a[href*="/p/"]');
        const priceEl = card.querySelector('.price, .product-price, .sale-price, .offer-price, .discounted-price');
        const ratingEl = card.querySelector('.rating, .star-rating, .stars, .product-rating');
        const imgEl = card.querySelector('img[src*="product"], img[src*="upload"], .product-image img');
        const title = titleEl ? (titleEl.textContent || titleEl.getAttribute('title') || '').trim() : '';
        if (title) {
          return {
            product: {
              product_name: title,
              price: priceEl ? priceEl.textContent.trim().substring(0, 100) : '',
              rating: ratingEl ? ratingEl.textContent.trim().substring(0, 50) : '',
              image_url: imgEl ? (imgEl.getAttribute('src') || '').replace(/^\/\//, 'https://') : '',
            },
            source: 'SaiSuperMarket',
          };
        }
      } catch { /* try next proxy */ }
    }
    return null;
  }

  async function lookupBackendMarketplace(code) {
    try {
      const res = await fetch(`/api/tools/barcode-scanner/lookup?barcode=${encodeURIComponent(code)}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  let marketplaceContainer = null;

  function addMarketplaceResults(marketplace) {
    if (!marketplaceContainer) return;
    marketplaceContainer.innerHTML = '';
    marketplaceContainer.style.display = 'flex';

    const sources = [
      { key: 'amazon', label: 'Amazon', icon: '🛒' },
      { key: 'flipkart', label: 'Flipkart', icon: '🛍️' },
      { key: 'google_shopping', label: 'Google Shopping', icon: '🔍' },
      { key: 'buycott', label: 'Buycott', icon: '📋' },
      { key: 'saisupermarket', label: 'SaiSuperMarket', icon: '🛒' },
      { key: 'barcodelookup', label: 'BarcodeLookup', icon: '🔎' },
    ];

    let hasAny = false;
    for (const src of sources) {
      const data = marketplace[src.key];
      if (!data || !data.title) continue;
      hasAny = true;

      const item = document.createElement('div');
      item.style.cssText =
        'display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0.65rem;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg);text-decoration:none;transition:background 0.15s;cursor:pointer;';
      item.onmouseenter = () => { item.style.background = 'var(--color-surface)'; };
      item.onmouseleave = () => { item.style.background = 'var(--color-bg)'; };

      if (data.image) {
        const img = document.createElement('img');
        img.src = data.image;
        img.alt = '';
        img.style.cssText = 'width:40px;height:40px;border-radius:4px;object-fit:cover;flex-shrink:0;background:var(--color-bg);';
        item.appendChild(img);
      }

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;';

      const title = document.createElement('div');
      title.textContent = data.title;
      title.style.cssText = 'font-size:0.78rem;font-weight:600;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

      const meta = document.createElement('div');
      const parts = [src.label];
      if (data.price) parts.push(data.price);
      if (data.rating) parts.push(data.rating);
      meta.textContent = parts.join(' · ');
      meta.style.cssText = 'font-size:0.7rem;color:var(--color-text-muted);';

      info.appendChild(title);
      info.appendChild(meta);
      item.appendChild(info);

      if (data.url) {
        const openBtn = document.createElement('a');
        openBtn.href = data.url;
        openBtn.target = '_blank';
        openBtn.rel = 'noopener';
        openBtn.textContent = 'Open';
        openBtn.style.cssText =
          'padding:0.25rem 0.55rem;border-radius:5px;border:none;font-size:0.7rem;font-weight:600;cursor:pointer;background:var(--color-primary);color:#fff;text-decoration:none;white-space:nowrap;flex-shrink:0;';
        item.appendChild(openBtn);
      }

      marketplaceContainer.appendChild(item);
    }

    if (!hasAny) {
      marketplaceContainer.style.display = 'none';
    }
  }

  function addExternalSearchLinks(code, format) {
    if (format === 'QR_CODE') return;

    const searchUrl = (url) => url.replace('{code}', encodeURIComponent(code));

    const links = [
      { label: 'Amazon', url: searchUrl('https://www.amazon.in/s?k={code}') },
      { label: 'Flipkart', url: searchUrl('https://www.flipkart.com/search?q={code}') },
      { label: 'Google Shopping', url: searchUrl('https://www.google.com/search?q={code}&tbm=shop') },
      { label: 'Buycott', url: searchUrl('https://www.buycott.com/upc/{code}') },
      { label: 'SaiSuperMarket', url: searchUrl('https://www.saisupermarket.in/search?q={code}') },
    ];

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.4rem;';

    for (const link of links) {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = link.label;
      a.style.cssText =
        'padding:0.3rem 0.6rem;border:1px solid var(--color-border);border-radius:6px;font-size:0.72rem;color:var(--color-primary);text-decoration:none;background:var(--color-bg);transition:background 0.15s;';
      a.onmouseenter = () => { a.style.background = 'var(--color-surface)'; };
      a.onmouseleave = () => { a.style.background = 'var(--color-bg)'; };
      row.appendChild(a);
    }

    resultDetails.appendChild(row);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }

  function makeCopyBtn(text, tooltip) {
    const btn = document.createElement('button');
    btn.textContent = '📋';
    btn.title = tooltip || 'Copy';
    btn.style.cssText =
      'padding:2px 5px;border:none;border-radius:4px;font-size:0.72rem;cursor:pointer;background:none;opacity:0.5;transition:opacity 0.15s;flex-shrink:0;';
    btn.onmouseenter = () => { btn.style.opacity = '1'; };
    btn.onmouseleave = () => { btn.style.opacity = '0.5'; };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(text);
      const orig = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = orig; }, 1200);
    });
    return btn;
  }

  async function addToHistory(entry) {
    entry.timestamp = Date.now();
    const history = (await getPref(HISTORY_KEY, [])).slice(0, HISTORY_MAX - 1);
    history.unshift(entry);
    await setPref(HISTORY_KEY, history);
    renderHistoryItem(entry);
    historySection.style.display = 'flex';
  }

  async function loadHistory() {
    const history = await getPref(HISTORY_KEY, []);
    if (history.length === 0) return;
    historySection.style.display = 'flex';
    for (const entry of history) {
      renderHistoryItem(entry);
    }
  }

  function renderHistoryItem(entry) {
    const item = document.createElement('div');
    item.style.cssText =
      'display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.6rem;border-radius:6px;background:var(--color-bg);cursor:pointer;font-size:0.78rem;transition:background 0.15s;';
    item.addEventListener('mouseenter', () => { item.style.background = 'var(--color-surface)'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'var(--color-bg)'; });

    const typeIcon = document.createElement('span');
    typeIcon.textContent = entry.type === 'qr' ? '◇' : '▨';
    typeIcon.style.cssText = 'font-size:0.7rem;opacity:0.6;flex-shrink:0;';

    const name = document.createElement('span');
    name.textContent = entry.productName || entry.value;
    name.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-text);';

    const date = document.createElement('span');
    const d = new Date(entry.timestamp || Date.now());
    date.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    date.style.cssText = 'font-size:0.7rem;color:var(--color-text-muted);flex-shrink:0;';

    item.appendChild(typeIcon);
    item.appendChild(name);
    item.appendChild(date);

    item.addEventListener('click', () => {
      const value = entry.value || '';
      const format = entry.format || '';
      if (entry.product) {
        showProductResult(value, format, entry.product, entry.product.source || 'History');
      } else if (entry.type === 'qr') {
        showQRResult(value, format);
      } else {
        resultThumb.style.display = 'none';
        resultTitle.textContent = `${(format || 'code').toUpperCase()}: ${value}`;
        resultSub.textContent = 'No product info available';
        resultCard.style.display = 'block';
        resultDetails.style.display = 'none';
        status.textContent = `Replaying: ${value}`;
      }
    });

    historyList.appendChild(item);
  }

  function sendPing(data) {
    try {
      navigator.sendBeacon('/api/tools/barcode-scanner/stats', JSON.stringify({
        value: data.rawValue,
        format: data.format,
        ts: Date.now(),
      }));
    } catch { void 0; }
  }

  function parsePrice(text) {
    if (!text) return 0;
    const cleaned = text.replace(/[^0-9.,]/g, '').replace(/,/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  function formatPrice(amt) {
    return '₹' + amt.toFixed(2);
  }

  function addCartItem({ barcode, productName, brand, priceText, imageUrl, source }) {
    const existing = cart.find(i => i.barcode === barcode);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({
        barcode,
        productName,
        brand,
        price: parsePrice(priceText),
        qty: 1,
        discount: 0,
        imageUrl,
        source,
        addedAt: Date.now(),
      });
    }
    saveCart();
    renderCart();
  }

  async function saveCart() {
    await setPref(CART_KEY, { items: cart, flatDiscount });
    updateCartCount();
  }

  async function loadCart() {
    const data = await getPref(CART_KEY, { items: [], flatDiscount: 0 });
    cart = data.items || [];
    flatDiscount = data.flatDiscount || 0;
    if (cart.length > 0) {
      renderCart();
    }
  }

  function updateCartCount() {
    const total = cart.reduce((s, i) => s + i.qty, 0);
    cartCount.textContent = total + ' item' + (total !== 1 ? 's' : '');
    cartSection.style.display = total > 0 ? 'flex' : 'none';
  }

  function renderCart() {
    cartList.innerHTML = '';
    updateCartCount();

    let subtotal = 0;
    let totalItemDiscount = 0;

    cart.forEach((item, idx) => {
      const itemTotal = item.price * item.qty;
      const itemDiscAmt = item.discount * item.qty;
      const lineTotal = itemTotal - itemDiscAmt;
      subtotal += itemTotal;
      totalItemDiscount += itemDiscAmt;

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;padding:0.4rem 0.5rem;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg);font-size:0.75rem;';

      const thumb = document.createElement('img');
      thumb.style.cssText = 'width:32px;height:32px;border-radius:4px;object-fit:cover;flex-shrink:0;background:var(--color-surface);';
      if (item.imageUrl) {
        thumb.src = item.imageUrl;
        thumb.onerror = () => { thumb.style.display = 'none'; };
      } else {
        thumb.style.display = 'none';
      }

      const info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;';

      const nameEl = document.createElement('div');
      nameEl.textContent = item.productName;
      nameEl.style.cssText = 'font-weight:600;color:var(--color-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:0.75rem;';

      const metaEl = document.createElement('div');
      const parts = [];
      if (item.brand) parts.push(item.brand);
      parts.push(formatPrice(item.price) + ' ea');
      metaEl.textContent = parts.join(' · ');
      metaEl.style.cssText = 'font-size:0.68rem;color:var(--color-text-muted);';

      info.appendChild(nameEl);
      info.appendChild(metaEl);

      const qtyControls = document.createElement('div');
      qtyControls.style.cssText = 'display:flex;align-items:center;gap:0.2rem;flex-shrink:0;';

      const decBtn = document.createElement('button');
      decBtn.textContent = '−';
      decBtn.style.cssText = 'width:22px;height:22px;border:1px solid var(--color-border);border-radius:4px;background:none;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;color:var(--color-text);padding:0;';
      decBtn.addEventListener('click', () => {
        if (item.qty > 1) { item.qty -= 1; saveCart(); renderCart(); }
        else { removeCartItem(idx); }
      });

      const qtyEl = document.createElement('span');
      qtyEl.textContent = item.qty;
      qtyEl.style.cssText = 'min-width:18px;text-align:center;font-weight:600;color:var(--color-text);font-size:0.78rem;';

      const incBtn = document.createElement('button');
      incBtn.textContent = '+';
      incBtn.style.cssText = 'width:22px;height:22px;border:1px solid var(--color-border);border-radius:4px;background:none;cursor:pointer;font-size:0.8rem;display:flex;align-items:center;justify-content:center;color:var(--color-text);padding:0;';
      incBtn.addEventListener('click', () => { item.qty += 1; saveCart(); renderCart(); });

      qtyControls.appendChild(decBtn);
      qtyControls.appendChild(qtyEl);
      qtyControls.appendChild(incBtn);

      const discInput = document.createElement('input');
      discInput.type = 'number';
      discInput.min = '0';
      discInput.step = '0.01';
      discInput.placeholder = 'Disc';
      discInput.value = item.discount || '';
      discInput.style.cssText = 'width:52px;padding:0.2rem 0.3rem;border:1px solid var(--color-border);border-radius:4px;font-size:0.68rem;background:var(--color-surface);color:var(--color-text);text-align:right;';
      discInput.addEventListener('change', () => {
        const v = parseFloat(discInput.value);
        item.discount = isNaN(v) || v < 0 ? 0 : v;
        saveCart();
        renderCart();
      });

      const lineTotalEl = document.createElement('span');
      lineTotalEl.textContent = formatPrice(lineTotal);
      lineTotalEl.style.cssText = 'font-weight:600;color:var(--color-text);min-width:50px;text-align:right;font-size:0.75rem;flex-shrink:0;';

      const removeBtn = document.createElement('button');
      removeBtn.textContent = '✕';
      removeBtn.style.cssText = 'width:20px;height:20px;border:none;border-radius:4px;background:none;cursor:pointer;font-size:0.7rem;color:var(--color-text-muted);display:flex;align-items:center;justify-content:center;padding:0;flex-shrink:0;';
      removeBtn.addEventListener('click', () => removeCartItem(idx));

      row.appendChild(thumb);
      row.appendChild(info);
      row.appendChild(qtyControls);
      row.appendChild(discInput);
      row.appendChild(lineTotalEl);
      row.appendChild(removeBtn);
      cartList.appendChild(row);
    });

    renderCartSummary(subtotal, totalItemDiscount);

    if (clearCartBtn._listener) {
      clearCartBtn.removeEventListener('click', clearCartBtn._listener);
    }
    const handler = () => { cart = []; flatDiscount = 0; if (flatDiscountInput) flatDiscountInput.value = ''; saveCart(); renderCart(); };
    clearCartBtn._listener = handler;
    clearCartBtn.addEventListener('click', handler);
  }

  let flatDiscount = 0;
  let flatDiscountInput = null;

  function renderCartSummary(subtotal, totalItemDiscount) {
    cartSummary.style.display = 'flex';
    cartSummary.innerHTML = '';

    const lines = [
      { label: 'Subtotal', value: formatPrice(subtotal) },
      { label: 'Item Discounts', value: '-' + formatPrice(totalItemDiscount) },
    ];

    lines.forEach(l => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;';
      const lbl = document.createElement('span');
      lbl.textContent = l.label;
      lbl.style.cssText = 'color:var(--color-text-muted);';
      const val = document.createElement('span');
      val.textContent = l.value;
      val.style.cssText = 'color:var(--color-text);font-weight:500;';
      row.appendChild(lbl);
      row.appendChild(val);
      cartSummary.appendChild(row);
    });

    const flatRow = document.createElement('div');
    flatRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding-top:0.2rem;border-top:1px solid var(--color-border);';
    const flatLbl = document.createElement('span');
    flatLbl.textContent = 'Flat Discount';
    flatLbl.style.cssText = 'color:var(--color-text-muted);';
    if (!flatDiscountInput) {
      flatDiscountInput = document.createElement('input');
      flatDiscountInput.type = 'number';
      flatDiscountInput.min = '0';
      flatDiscountInput.step = '0.01';
      flatDiscountInput.placeholder = '₹0';
      flatDiscountInput.style.cssText = 'width:72px;padding:0.2rem 0.3rem;border:1px solid var(--color-border);border-radius:4px;font-size:0.68rem;background:var(--color-surface);color:var(--color-text);text-align:right;';
      flatDiscountInput.addEventListener('change', () => {
        const v = parseFloat(flatDiscountInput.value);
        flatDiscount = isNaN(v) || v < 0 ? 0 : v;
        saveCart();
        renderCartTotal(subtotal, totalItemDiscount);
      });
    }
    flatDiscountInput.value = flatDiscount > 0 ? String(flatDiscount) : '';
    flatRow.appendChild(flatLbl);
    flatRow.appendChild(flatDiscountInput);
    cartSummary.appendChild(flatRow);

    renderCartTotal(subtotal, totalItemDiscount);
  }

  function renderCartTotal(subtotal, totalItemDiscount) {
    const existing = cartSummary.querySelector('.grand-total-row');
    if (existing) existing.remove();

    const afterDisc = subtotal - totalItemDiscount - flatDiscount;
    const grand = afterDisc > 0 ? afterDisc : 0;

    const grandRow = document.createElement('div');
    grandRow.className = 'grand-total-row';
    grandRow.style.cssText = 'display:flex;justify-content:space-between;padding-top:0.3rem;border-top:2px solid var(--color-primary);margin-top:0.1rem;';
    const grandLbl = document.createElement('span');
    grandLbl.textContent = 'Grand Total';
    grandLbl.style.cssText = 'font-weight:700;color:var(--color-text);';
    const grandVal = document.createElement('span');
    grandVal.textContent = formatPrice(grand);
    grandVal.style.cssText = 'font-weight:700;color:var(--color-primary);';
    grandRow.appendChild(grandLbl);
    grandRow.appendChild(grandVal);
    cartSummary.appendChild(grandRow);
  }

  function removeCartItem(idx) {
    cart.splice(idx, 1);
    saveCart();
    renderCart();
    if (cart.length === 0) {
      flatDiscount = 0;
      if (flatDiscountInput) flatDiscountInput.value = '';
    }
  }

  return () => {
    if (html5QrCode) {
      const qr = html5QrCode;
      html5QrCode = null;
      scanning = false;
      qr.stop().catch(() => {}).then(() => qr.clear());
    }
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = '';
}
