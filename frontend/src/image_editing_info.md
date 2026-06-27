# Image Editing Reference

## Filters Tab

Apply creative preset filters that combine multiple adjustments:

| Filter | Description |
|--------|-------------|
| **Vivid** | Boosts saturation (+40%) and contrast (+25%) for punchy colors |
| **Dramatic** | High contrast (+60%) with slightly reduced brightness |
| **Vintage** | Warm sepia tone with reduced saturation (-30%) |
| **Noir** | Classic black & white with boosted contrast (+30%) |
| **Soft** | Gentle brightening (+10%) with reduced contrast (-10%) |
| **Clarity** | Mid-tone contrast boost (+15%) with slight saturation increase |
| **Warm** | Adds amber/yellow tone for a cozy feel |
| **Cool** | Adds blue tone for a crisp, clean look |

**Custom Presets**: Save your own filter combinations using *Preset* button.

---

## Adjust Tab

Fine-tune individual image properties:

| Property | Range | What it does |
|----------|-------|-------------|
| **Brightness** | 0–2 | Overall lightness. 1 = original. Lower darkens, higher brightens |
| **Contrast** | 0–2 | Difference between light & dark areas. 1 = original |
| **Saturation** | 0–2 | Color intensity. 1 = original. 0 = grayscale, 2 = oversaturated |
| **Vibrance** | 0–2 | Smart saturation — boosts muted colors more than already-vibrant ones. 1 = original |
| **Warmth** | -100–100 | Color temperature. Positive = warmer (amber), Negative = cooler (blue) |
| **Tint** | -100–100 | Green-magenta shift. Positive = magenta, Negative = green |
| **Sharpness** | 0–2 | Edge detail enhancement. 1 = original. >1 sharpens, <1 softens |

---

## Light Tab

Precise control over tonal range:

| Property | Range | What it does |
|----------|-------|-------------|
| **Exposure** | -100–100 | Overall brightness adjustment (like camera exposure compensation) |
| **Highlights** | -100–100 | Brightest areas only. Drag down to recover overexposed detail |
| **Shadows** | -100–100 | Darkest areas only. Drag up to reveal detail in shadows |
| **Whites** | -100–100 | White-point adjustment. Affects the brightest tones |
| **Blacks** | -100–100 | Black-point adjustment. Affects the darkest tones |

> **Tip**: Use *Highlights* and *Shadows* together to recover detail in high-contrast images.

---

## Effects Tab

Creative and stylistic effects:

| Effect | Range | Description |
|--------|-------|-------------|
| **Vignette** | 0–100 | Darkens edges to draw focus to the center |
| **Grain** | 0–100 | Adds film-like noise texture |
| **Colorize** | 0–100 | Applies a warm duotone tint |
| **Grayscale** | On/Off | Removes all color — true black & white |

> **Note**: Grain and Colorize use CSS overlay preview. Final rendering uses dedicated pixel-level processing on save.

---

## Details Tab

Advanced local adjustments:

| Property | Range | What it does |
|----------|-------|-------------|
| **Clarity** | 0–2 | Mid-tone contrast enhancement. Makes textures pop. 1 = original |
| **Dehaze** | 0–100 | Reduces atmospheric haze/fog. Higher = clearer, with increased contrast |

---

## Crop Tab

Crop and transform the image:

| Tool | Description |
|------|-------------|
| **Aspect Ratio** | Lock crop to preset ratios (1:1, 4:3, 3:2, 16:9, 21:9 + portrait variants) |
| **Drag crop** | Click and drag inside the crop rectangle to reposition |
| **Resize handles** | Drag corners to resize the crop area |
| **Apply** | Preview the crop without saving. Toggle on/off to compare |
| **Rotate** | Rotate 90° left/right |
| **Flip** | Flip horizontally or vertically |

> **Tip**: Enable *Free* aspect ratio for unrestricted resizing.

---

## Video Editing

| Feature | Description |
|---------|-------------|
| **Trim** | Set start/end points to cut segments |
| **Speed** | 0.25×–4×. 1× = normal, <1 = slow motion, >1 = time-lapse |
| **Volume** | 0%–200% audio level adjustment |
| **Warmth** | Color temperature via RGB channel balance |
| **Filters** | Same preset filters as images (preview via CSS) |
| **Reverse** | Play video backwards |
| **Mute** | Silence all audio tracks |
| **Text Overlay** | Add styled text at any position |
| **Rotate/Flip** | 90° rotation, horizontal/vertical flip |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Previous / Next image |
| `Esc` | Close viewer or exit edit mode |
| `Ctrl+Scroll` | Zoom in/out |

---

## Export Formats

| Format | Best for | Notes |
|--------|----------|-------|
| **JPEG** | Photos, web sharing | Lossy; adjust quality slider |
| **PNG** | Screenshots, graphics, text | Lossless; larger files |
| **WebP** | Web use | Modern format, good compression |
| **HEIC** | Apple ecosystem | Requires HEIC support |
| **PDF** | Documents, multi-page | Good for sharing as document |
| **ASCII Art** | Fun/text-based | Configurable character set & width |

> **Tip**: Export re-processes all operations from scratch — you can export without saving first.
