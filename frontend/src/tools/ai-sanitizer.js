export const name = "AI Metadata Sanitizer";
export const description = "Inspect and strip AI provenance markers, C2PA Content Credentials, and generator footprints.";

export function init(container) {
  container.style.overflow = "auto";
  
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;padding:1.25rem;gap:1.25rem;min-width:0;color:var(--color-text);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  container.appendChild(wrapper);

  let activeImageData = null;
  let activeImageName = "image.png";
  let activeImageType = "image/png";

  const header = document.createElement("div");
  header.style.cssText = "display:flex;flex-direction:column;gap:0.35rem;";
  
  const title = document.createElement("h1");
  title.innerText = "AI Provenance & Metadata Sanitizer";
  title.style.cssText = "font-size:1.1rem;font-weight:600;margin:0;color:var(--color-text);";
  
  const sub = document.createElement("p");
  sub.innerText = "Audit and purge AI-generation signatures, C2PA JUMBF manifests, model metadata, and watermarking patterns.";
  sub.style.cssText = "font-size:0.78rem;color:var(--color-text-muted);margin:0;";
  
  header.appendChild(title);
  header.appendChild(sub);
  wrapper.appendChild(header);

  const mainGrid = document.createElement("div");
  mainGrid.style.cssText = "display:grid;grid-template-columns:1fr;gap:1.25rem;width:100%;";
  if (window.innerWidth > 768) {
    mainGrid.style.gridTemplateColumns = "1fr 1fr";
  }
  wrapper.appendChild(mainGrid);

  const leftCol = document.createElement("div");
  leftCol.style.cssText = "display:flex;flex-direction:column;gap:1rem;min-width:0;";
  
  const rightCol = document.createElement("div");
  rightCol.style.cssText = "display:flex;flex-direction:column;gap:1rem;min-width:0;";
  
  mainGrid.appendChild(leftCol);
  mainGrid.appendChild(rightCol);

  const uploadCard = document.createElement("div");
  uploadCard.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);padding:1.25rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.75rem;cursor:pointer;position:relative;transition:border-color 0.2s;";
  
  const uploadInput = document.createElement("input");
  uploadInput.type = "file";
  uploadInput.accept = "image/png, image/jpeg, image/jpg, image/webp";
  uploadInput.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer;";
  
  const uploadIcon = document.createElement("div");
  uploadIcon.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
  uploadIcon.style.cssText = "color:var(--color-primary);";
  
  const uploadText = document.createElement("div");
  uploadText.innerText = "Select or Drop Image (JPEG, PNG, WebP)";
  uploadText.style.cssText = "font-size:0.82rem;font-weight:600;color:var(--color-text);";
  
  const uploadHint = document.createElement("div");
  uploadHint.innerText = "Maximum resolution supported. Files are processed locally on your device.";
  uploadHint.style.cssText = "font-size:0.72rem;color:var(--color-text-muted);text-align:center;";
  
  uploadCard.appendChild(uploadInput);
  uploadCard.appendChild(uploadIcon);
  uploadCard.appendChild(uploadText);
  uploadCard.appendChild(uploadHint);
  leftCol.appendChild(uploadCard);

  const previewCard = document.createElement("div");
  previewCard.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);padding:1rem;display:none;flex-direction:column;gap:0.75rem;";
  
  const previewTitle = document.createElement("div");
  previewTitle.innerText = "Loaded Image";
  previewTitle.style.cssText = "font-size:0.82rem;font-weight:600;color:var(--color-text);";
  previewCard.appendChild(previewTitle);

  const previewImgContainer = document.createElement("div");
  previewImgContainer.style.cssText = "width:100%;max-height:280px;display:flex;align-items:center;justify-content:center;background:var(--color-bg);border-radius:6px;overflow:hidden;border:1px solid var(--color-border);";
  
  const previewImg = document.createElement("img");
  previewImg.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;";
  previewImgContainer.appendChild(previewImg);
  previewCard.appendChild(previewImgContainer);

  const fileMetaContainer = document.createElement("div");
  fileMetaContainer.style.cssText = "display:flex;flex-direction:column;gap:0.35rem;";
  previewCard.appendChild(fileMetaContainer);

  leftCol.appendChild(previewCard);

  const analysisCard = document.createElement("div");
  analysisCard.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);padding:1.25rem;display:none;flex-direction:column;gap:1rem;";
  
  const analysisTitle = document.createElement("div");
  analysisTitle.style.cssText = "display:flex;justify-content:between;align-items:center;width:100%;";
  analysisTitle.innerHTML = `<span style="font-size:0.88rem;font-weight:600;color:var(--color-text);">Provenance Scan Results</span>`;
  analysisCard.appendChild(analysisTitle);

  const analysisList = document.createElement("div");
  analysisList.style.cssText = "display:flex;flex-direction:column;gap:0.5rem;";
  analysisCard.appendChild(analysisList);
  rightCol.appendChild(analysisCard);

  const cleanSettingsCard = document.createElement("div");
  cleanSettingsCard.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);padding:1.25rem;display:none;flex-direction:column;gap:1rem;";
  
  const settingsTitle = document.createElement("div");
  settingsTitle.innerText = "Sanitization Settings";
  settingsTitle.style.cssText = "font-size:0.88rem;font-weight:600;color:var(--color-text);";
  cleanSettingsCard.appendChild(settingsTitle);

  const optionsContainer = document.createElement("div");
  optionsContainer.style.cssText = "display:flex;flex-direction:column;gap:0.75rem;";
  cleanSettingsCard.appendChild(optionsContainer);

  function createCheckbox(id, labelText, descText, checkedByDefault = true) {
    const container = document.createElement("label");
    container.style.cssText = "display:flex;align-items:flex-start;gap:0.65rem;cursor:pointer;padding:0.25rem 0;";
    
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = id;
    input.checked = checkedByDefault;
    input.style.cssText = "margin-top:0.15rem;accent-color:var(--color-primary);";
    
    const textGroup = document.createElement("div");
    textGroup.style.cssText = "display:flex;flex-direction:column;";
    
    const label = document.createElement("span");
    label.innerText = labelText;
    label.style.cssText = "font-size:0.82rem;font-weight:500;color:var(--color-text);";
    
    const desc = document.createElement("span");
    desc.innerText = descText;
    desc.style.cssText = "font-size:0.72rem;color:var(--color-text-muted);margin-top:0.1rem;";
    
    textGroup.appendChild(label);
    textGroup.appendChild(desc);
    container.appendChild(input);
    container.appendChild(textGroup);
    
    return { container, input };
  }

  const stripMetadata = createCheckbox("stripMetadata", "Strip Binary EXIF & Metadata", "Completely remove JUMBF, EXIF, XMP, IPTC, and private profile packets.");
  const clearChroma = createCheckbox("clearChroma", "Anti-AI Pixel Perturbation", "Inject imperceptible, randomized structural variations to corrupt frequency-domain watermarks (e.g. SynthID).");
  const injectCamera = createCheckbox("injectCamera", "Inject Organic Device Footprint", "Re-synthesize natural Exif tags (e.g. Apple iPhone/Canon EOS) to resemble authentic hardware captures.");
  const recompress = createCheckbox("recompress", "Lossy Double-Compression Pass", "Force canvas pixel resampling and format re-write to destroy high-frequency embedded patterns.");

  optionsContainer.appendChild(stripMetadata.container);
  optionsContainer.appendChild(clearChroma.container);
  optionsContainer.appendChild(injectCamera.container);
  optionsContainer.appendChild(recompress.container);

  const deviceSelectContainer = document.createElement("div");
  deviceSelectContainer.style.cssText = "display:flex;flex-direction:column;gap:0.35rem;padding-left:1.5rem;";
  
  const deviceSelectLabel = document.createElement("span");
  deviceSelectLabel.innerText = "Target Device Profile";
  deviceSelectLabel.style.cssText = "font-size:0.78rem;color:var(--color-text-muted);";
  
  const deviceSelect = document.createElement("select");
  deviceSelect.style.cssText = "padding:0.35rem 0.5rem;border:1px solid var(--color-border);border-radius:6px;background:var(--color-bg);color:var(--color-text);font-size:0.82rem;outline:none;";
  
  const devices = [
    { value: "iphone15", label: "Apple iPhone 15 Pro Max" },
    { value: "pixel8", label: "Google Pixel 8 Pro" },
    { value: "canon_eos", label: "Canon EOS 5D Mark IV" },
    { value: "sony_alpha", label: "Sony Alpha 7R V" }
  ];
  
  devices.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.value;
    opt.innerText = d.label;
    deviceSelect.appendChild(opt);
  });
  
  deviceSelectContainer.appendChild(deviceSelectLabel);
  deviceSelectContainer.appendChild(deviceSelect);
  optionsContainer.appendChild(deviceSelectContainer);

  injectCamera.input.addEventListener("change", () => {
    deviceSelect.disabled = !injectCamera.input.checked;
    deviceSelectContainer.style.opacity = injectCamera.input.checked ? "1" : "0.5";
  });

  const runBtn = document.createElement("button");
  runBtn.innerText = "Sanitize and Strip AI Signatures";
  runBtn.style.cssText = "width:100%;padding:0.55rem;border:none;border-radius:6px;background:var(--color-primary);color:#fff;font-size:0.82rem;font-weight:600;cursor:pointer;margin-top:0.5rem;";
  cleanSettingsCard.appendChild(runBtn);

  rightCol.appendChild(cleanSettingsCard);

  const processingCard = document.createElement("div");
  processingCard.style.cssText = "border:1px solid var(--color-border);border-radius:var(--radius);background:var(--color-surface);padding:1.25rem;display:none;flex-direction:column;gap:0.75rem;align-items:center;justify-content:center;";
  
  const spinner = document.createElement("div");
  spinner.style.cssText = "width:24px;height:24px;border:3px solid var(--color-border);border-top-color:var(--color-primary);border-radius:50%;animation:spinScrub 1s linear infinite;";
  
  const spinStyle = document.createElement("style");
  spinStyle.innerHTML = `
    @keyframes spinScrub {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(spinStyle);

  const processingText = document.createElement("div");
  processingText.innerText = "Analyzing file chunks and pixel space...";
  processingText.style.cssText = "font-size:0.82rem;font-weight:600;color:var(--color-text);";
  
  processingCard.appendChild(spinner);
  processingCard.appendChild(processingText);
  rightCol.appendChild(processingCard);

  function createScanRow(category, status, message) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-direction:column;gap:0.15rem;padding:0.5rem;border-radius:4px;background:var(--color-bg);border:1px solid var(--color-border);";
    
    const header = document.createElement("div");
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;";
    
    const catText = document.createElement("span");
    catText.innerText = category;
    catText.style.cssText = "font-size:0.82rem;font-weight:600;color:var(--color-text);";
    
    const badge = document.createElement("span");
    badge.innerText = status;
    
    if (status === "CRITICAL" || status === "DETECTED") {
      badge.style.cssText = "font-size:0.68rem;padding:0.15rem 0.4rem;border-radius:3px;background:#ef4444;color:#fff;font-weight:600;";
    } else if (status === "SUSPICIOUS") {
      badge.style.cssText = "font-size:0.68rem;padding:0.15rem 0.4rem;border-radius:3px;background:#f59e0b;color:#fff;font-weight:600;";
    } else {
      badge.style.cssText = "font-size:0.68rem;padding:0.15rem 0.4rem;border-radius:3px;background:#10b981;color:#fff;font-weight:600;";
    }
    
    const msgText = document.createElement("span");
    msgText.innerText = message;
    msgText.style.cssText = "font-size:0.74rem;color:var(--color-text-muted);";
    
    header.appendChild(catText);
    header.appendChild(badge);
    row.appendChild(header);
    row.appendChild(msgText);
    
    return row;
  }

  function renderMetadataValue(label, value) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:0.75rem;padding:0.2rem 0;";
    
    const lbl = document.createElement("span");
    lbl.innerText = label;
    lbl.style.cssText = "font-size:0.78rem;color:var(--color-text-muted);white-space:nowrap;";
    
    const val = document.createElement("span");
    val.innerText = value;
    val.style.cssText = "font-size:0.78rem;color:var(--color-text);text-align:right;overflow-wrap:break-word;max-width:60%;font-family:monospace;";
    
    row.appendChild(lbl);
    row.appendChild(val);
    return row;
  }

  uploadInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    activeImageName = file.name;
    activeImageType = file.type;

    processingCard.style.display = "flex";
    processingText.innerText = "Reading image binary headers...";
    analysisCard.style.display = "none";
    cleanSettingsCard.style.display = "none";
    previewCard.style.display = "none";

    const reader = new FileReader();
    reader.onload = function(event) {
      activeImageData = event.target.result;
      analyzeImage(activeImageData);
    };
    reader.readAsArrayBuffer(file);
  });

  function analyzeImage(arrayBuffer) {
    analysisList.innerHTML = "";
    fileMetaContainer.innerHTML = "";

    const uint8 = new Uint8Array(arrayBuffer);
    const textDecoder = new TextDecoder();
    
    const previewBlob = new Blob([uint8], { type: activeImageType });
    const previewUrl = URL.createObjectURL(previewBlob);
    previewImg.src = previewUrl;
    previewCard.style.display = "flex";

    fileMetaContainer.appendChild(renderMetadataValue("Filename", activeImageName));
    fileMetaContainer.appendChild(renderMetadataValue("Mime Type", activeImageType));
    fileMetaContainer.appendChild(renderMetadataValue("Size", `${(uint8.length / 1024).toFixed(1)} KB`));

    const binaryString = getBinaryString(uint8, 500000); 

    let c2paStatus = "CLEAN";
    let c2paMsg = "No Content Credentials metadata block detected.";
    if (binaryString.includes("C2PA") || binaryString.includes("c2pa") || binaryString.includes("jumbf") || binaryString.includes("manifest")) {
      c2paStatus = "DETECTED";
      c2paMsg = "Contains active JUMBF/C2PA digital manifest chains (Adobe Content Credentials).";
    }

    let modelStatus = "CLEAN";
    let modelMsg = "No visible generator parameters found in the file headers.";
    const matches = [];
    if (binaryString.includes("StableDiffusion") || binaryString.includes("sd-metadata") || binaryString.includes("parameters") || binaryString.includes("Sampler")) {
      matches.push("Stable Diffusion");
    }
    if (binaryString.includes("DALL-E") || binaryString.includes("dall-e") || binaryString.includes("Dalle")) {
      matches.push("DALL-E");
    }
    if (binaryString.includes("Midjourney") || binaryString.includes("midjourney")) {
      matches.push("Midjourney");
    }
    if (binaryString.includes("Adobe Firefly") || binaryString.includes("Adobe_Firefly")) {
      matches.push("Adobe Firefly");
    }

    if (matches.length > 0) {
      modelStatus = "CRITICAL";
      modelMsg = `Explicit model markers found: ${matches.join(", ")}. Containing text prompts or pipeline configuration.`;
    }

    let metadataStatus = "CLEAN";
    let metadataMsg = "Basic structure checks match regular photo patterns.";
    const metaMarkers = [];
    if (binaryString.includes("Software")) {
      metaMarkers.push("Software-signature");
    }
    if (binaryString.includes("XMP") || binaryString.includes("xml")) {
      metaMarkers.push("XML-Manifest");
    }
    if (binaryString.includes("ICC_PROFILE")) {
      metaMarkers.push("ICC-Color-Packet");
    }

    if (metaMarkers.length > 1) {
      metadataStatus = "SUSPICIOUS";
      metadataMsg = `Contains multiple synthetic descriptors (${metaMarkers.join(", ")}). Standard camera signatures missing.`;
    }

    let wmStatus = "CLEAN";
    let wmMsg = "No synthetic watermarking headers flagged.";
    if (binaryString.includes("SynthID") || binaryString.includes("Google-SynthID") || binaryString.includes("IMATAG") || binaryString.includes("Steg")) {
      wmStatus = "DETECTED";
      wmMsg = "Invisible spatial/frequency watermarking packets identified.";
    }

    analysisList.appendChild(createScanRow("C2PA / Content Credentials", c2paStatus, c2paMsg));
    analysisList.appendChild(createScanRow("AI Engine Signatures", modelStatus, modelMsg));
    analysisList.appendChild(createScanRow("Metadata Risk Profile", metadataStatus, metadataMsg));
    analysisList.appendChild(createScanRow("Digital Watermarks", wmStatus, wmMsg));

    processingCard.style.display = "none";
    analysisCard.style.display = "flex";
    cleanSettingsCard.style.display = "flex";
  }

  function getBinaryString(uint8, maxLen) {
    const len = Math.min(uint8.length, maxLen);
    let binary = "";
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    return binary;
  }

  runBtn.addEventListener("click", () => {
    if (!activeImageData) return;

    processingCard.style.display = "flex";
    processingText.innerText = "Purging digital signatures and re-writing pixel-buffers...";
    analysisCard.style.display = "none";
    cleanSettingsCard.style.display = "none";

    setTimeout(() => {
      processAndDownload();
    }, 800);
  });

  function processAndDownload() {
    const imgElement = new Image();
    const blob = new Blob([new Uint8Array(activeImageData)], { type: activeImageType });
    const objectUrl = URL.createObjectURL(blob);

    imgElement.onload = function() {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      canvas.width = imgElement.naturalWidth;
      canvas.height = imgElement.naturalHeight;
      
      ctx.drawImage(imgElement, 0, 0);

      if (clearChroma.input.checked) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const totalPixels = data.length;
        
        for (let i = 0; i < totalPixels; i += 16) {
          const shift = (Math.random() - 0.5) * 2; 
          data[i] = Math.max(0, Math.min(255, data[i] + shift));
          data[i+1] = Math.max(0, Math.min(255, data[i+1] - shift));
          data[i+2] = Math.max(0, Math.min(255, data[i+2] + shift));
        }
        ctx.putImageData(imgData, 0, 0);
      }

      let exportType = "image/jpeg";
      let quality = 0.95;

      if (activeImageType === "image/png" && !recompress.input.checked) {
        exportType = "image/png";
      } else if (activeImageType === "image/webp" && !recompress.input.checked) {
        exportType = "image/webp";
      } else {
        exportType = "image/jpeg";
        quality = 0.92; 
      }

      canvas.toBlob((cleanBlob) => {
        if (!cleanBlob) {
          restoreUI();
          return;
        }

        const fileReader = new FileReader();
        fileReader.onload = function(e) {
          let cleanBuffer = e.target.result;
          
          if (stripMetadata.input.checked) {
            cleanBuffer = purgeRawHeaders(cleanBuffer, exportType);
          }
          
          if (injectCamera.input.checked) {
            cleanBuffer = writeCameraFootprint(cleanBuffer, deviceSelect.value, exportType);
          }

          const finalBlob = new Blob([cleanBuffer], { type: exportType });
          const finalUrl = URL.createObjectURL(finalBlob);
          
          const a = document.createElement("a");
          const ext = exportType === "image/png" ? "png" : exportType === "image/webp" ? "webp" : "jpg";
          const baseName = activeImageName.substring(0, activeImageName.lastIndexOf('.')) || activeImageName;
          
          a.href = finalUrl;
          a.download = `${baseName}_sanitized.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          restoreUI();
        };
        fileReader.readAsArrayBuffer(cleanBlob);

      }, exportType, quality);
    };

    imgElement.src = objectUrl;
  }

  function purgeRawHeaders(buffer, mimeType) {
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      let i = 0;
      if (u8[0] === 0xFF && u8[1] === 0xD8) {
        const cleanSegments = [u8.slice(0, 2)]; 
        i = 2;
        while (i < u8.length) {
          if (u8[i] === 0xFF) {
            const marker = u8[i + 1];
            if (marker === 0xDA) { 
              cleanSegments.push(u8.slice(i));
              break;
            }
            
            const length = view.getUint16(i + 2, false);
            
            if (marker >= 0xE0 && marker <= 0xEF) {
              i += 2 + length;
              continue;
            }
            if (marker === 0xFE) {
              i += 2 + length;
              continue;
            }
            
            cleanSegments.push(u8.slice(i, i + 2 + length));
            i += 2 + length;
          } else {
            i++;
          }
        }
        
        let totalSize = 0;
        cleanSegments.forEach(s => totalSize += s.length);
        const result = new Uint8Array(totalSize);
        let offset = 0;
        cleanSegments.forEach(s => {
          result.set(s, offset);
          offset += s.length;
        });
        return result.buffer;
      }
    }
    
    return buffer;
  }

  function writeCameraFootprint(buffer, device, mimeType) {
    if (mimeType !== "image/jpeg" && mimeType !== "image/jpg") {
      return buffer; 
    }

    const u8 = new Uint8Array(buffer);
    const exifHeader = [0xFF, 0xE1]; 
    
    let makeStr = "Apple";
    let modelStr = "iPhone 15 Pro Max";
    let softwareStr = "iOS 17.5.1";

    if (device === "pixel8") {
      makeStr = "Google";
      modelStr = "Pixel 8 Pro";
      softwareStr = "Android 14";
    } else if (device === "canon_eos") {
      makeStr = "Canon";
      modelStr = "Canon EOS 5D Mark IV";
      softwareStr = "Firmware v1.4.0";
    } else if (device === "sony_alpha") {
      makeStr = "Sony";
      modelStr = "ILCE-7RM5";
      softwareStr = "Ver.1.00";
    }

    const exifPayload = [];
    
    const tiffHeader = [0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00];
    
    const ifdEntries = 4;
    const ifdOffset = 8 + 2 + (ifdEntries * 12) + 4; 
    
    const ifdBuffer = [
      ifdEntries & 0xFF, (ifdEntries >> 8) & 0xFF
    ];

    const stringData = [];
    let currentStringOffset = ifdOffset;

    function addIfdEntry(tag, type, count, dataArrayOrOffset) {
      ifdBuffer.push(tag & 0xFF, (tag >> 8) & 0xFF);
      ifdBuffer.push(type & 0xFF, (type >> 8) & 0xFF);
      ifdBuffer.push(count & 0xFF, (count >> 8) & 0xFF, (count >> 16) & 0xFF, (count >> 24) & 0xFF);
      
      if (typeof dataArrayOrOffset === "number") {
        ifdBuffer.push(dataArrayOrOffset & 0xFF, (dataArrayOrOffset >> 8) & 0xFF, (dataArrayOrOffset >> 16) & 0xFF, (dataArrayOrOffset >> 24) & 0xFF);
      } else {
        const val = dataArrayOrOffset;
        if (val.length <= 4) {
          const filled = [...val, 0, 0, 0, 0].slice(0, 4);
          ifdBuffer.push(...filled);
        } else {
          ifdBuffer.push(currentStringOffset & 0xFF, (currentStringOffset >> 8) & 0xFF, (currentStringOffset >> 16) & 0xFF, (currentStringOffset >> 24) & 0xFF);
          stringData.push(...val, 0); 
          currentStringOffset += val.length + 1;
        }
      }
    }

    const makeBytes = Array.from(makeStr).map(c => c.charCodeAt(0));
    const modelBytes = Array.from(modelStr).map(c => c.charCodeAt(0));
    const softwareBytes = Array.from(softwareStr).map(c => c.charCodeAt(0));

    addIfdEntry(0x010F, 2, makeBytes.length + 1, makeBytes);
    addIfdEntry(0x0110, 2, modelBytes.length + 1, modelBytes);
    addIfdEntry(0x0131, 2, softwareBytes.length + 1, softwareBytes);
    addIfdEntry(0x0112, 3, 1, [1, 0]); 

    ifdBuffer.push(0, 0, 0, 0);

    const totalPayload = [...tiffHeader, ...ifdBuffer, ...stringData];
    
    const exifSegmentLength = totalPayload.length + 2 + 6; 
    const exifSegment = [
      0xFF, 0xE1,
      (exifSegmentLength >> 8) & 0xFF, exifSegmentLength & 0xFF,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 
      ...totalPayload
    ];

    const result = new Uint8Array(u8.length + exifSegment.length);
    result.set(u8.subarray(0, 2), 0); 
    result.set(new Uint8Array(exifSegment), 2); 
    result.set(u8.subarray(2), 2 + exifSegment.length);

    return result.buffer;
  }

  function restoreUI() {
    processingCard.style.display = "none";
    analysisCard.style.display = "flex";
    cleanSettingsCard.style.display = "flex";
  }

  return () => {
    wrapper.remove();
  };
}

export function destroy(container) {
  container.innerHTML = "";
}