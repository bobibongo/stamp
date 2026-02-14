import * as fabric from 'fabric';

// ── Stałe przelicznikowe ──────────────────────────────────
export const PX_PER_MM = 3.7795275591;

export interface StampSize {
  widthMm: number;
  heightMm: number;
  label: string;
}

export const STAMP_SIZES: StampSize[] = [
  { widthMm: 38, heightMm: 14, label: '38 x 14 mm' },
  { widthMm: 47, heightMm: 18, label: '47 x 18 mm' },
  { widthMm: 58, heightMm: 22, label: '58 x 22 mm' },
];

export const DEFAULT_SIZE = STAMP_SIZES[1]; // 47x18 mm

// Marginesy wokół pieczątki na canvas (miejsce na linijki)
export const RULER_SIZE = 24; // px – grubość linijki
export const CANVAS_PADDING = 40; // px – padding za linijką
export const WORK_AREA_LEFT = RULER_SIZE + CANVAS_PADDING;
export const WORK_AREA_TOP = RULER_SIZE + CANVAS_PADDING;

export function getCanvasDimensions(widthMm: number, heightMm: number) {
  const wPx = widthMm * PX_PER_MM;
  const hPx = heightMm * PX_PER_MM;
  return {
    widthPx: wPx,
    heightPx: hPx,
    totalW: wPx + WORK_AREA_LEFT + CANVAS_PADDING,
    totalH: hPx + WORK_AREA_TOP + CANVAS_PADDING
  };
}

// Margines bezpieczeństwa (1mm od krawędzi)
export const SAFETY_MARGIN_MM = 1;
export const SAFETY_MARGIN_PX = Math.round(SAFETY_MARGIN_MM * PX_PER_MM);

// Siatka
export const GRID_SIZE_MM = 1;
export const GRID_SIZE_PX = Math.round(GRID_SIZE_MM * PX_PER_MM);

// Snap rotation angles
export const SNAP_ANGLE = 15; // stopnie
export const SNAP_THRESHOLD = 5; // stopnie tolerancji

// Przeliczniki pt ↔ px (1pt = 1/72 cala = 0.3528mm)
export const PT_TO_PX = 0.3528 * PX_PER_MM; // ≈ 1.334

export function ptToPx(pt: number): number {
  return Math.round(pt * PT_TO_PX * 100) / 100;
}

export function pxToPt(px: number): number {
  return Math.round((px / PT_TO_PX) * 10) / 10;
}

// ── Licznik obiektów (do nazw) ────────────────────────────
let _textCounter = 0;
let _frameCounter = 0;

// ── Dostępne czcionki ─────────────────────────────────────
export const AVAILABLE_FONTS = [
  'Arial',
  'Arial Narrow',
  'Times New Roman',
  'Calibri',
  'Myriad Pro',
  'Myriad Pro Condensed',
  'Roboto',
  'Montserrat',
  'Inter',
] as const;

export type FontName = (typeof AVAILABLE_FONTS)[number];

// ── Inicjalizacja Canvas ──────────────────────────────────
export function initCanvas(canvasEl: HTMLCanvasElement, size: StampSize = DEFAULT_SIZE): fabric.Canvas {
  const { widthPx, heightPx, totalW, totalH } = getCanvasDimensions(size.widthMm, size.heightMm);

  const canvas = new fabric.Canvas(canvasEl, {
    width: totalW,
    height: totalH,
    backgroundColor: '#e5e5e5',
    selection: true,
    preserveObjectStacking: true,
    snapAngle: SNAP_ANGLE,
    snapThreshold: SNAP_THRESHOLD,
  });


  // Przechowujemy wymiary w canvasie dla funkcji pomocniczych
  (canvas as any).__stampWidthMm = size.widthMm;
  (canvas as any).__stampHeightMm = size.heightMm;

  // Biały prostokąt = obszar roboczy pieczątki
  const workArea = new fabric.Rect({
    left: WORK_AREA_LEFT,
    top: WORK_AREA_TOP,
    width: widthPx,
    height: heightPx,
    fill: '#ffffff',
    selectable: false,
    evented: false,
    strokeWidth: 0,
    hoverCursor: 'default',
  });
  (workArea as any).__systemObject = true;

  // Dashed border wokół obszaru roboczego
  const workAreaBorder = new fabric.Rect({
    left: WORK_AREA_LEFT,
    top: WORK_AREA_TOP,
    width: widthPx,
    height: heightPx,
    fill: 'transparent',
    stroke: '#d4d4d4',
    strokeWidth: 1,
    strokeDashArray: [4, 4],
    selectable: false,
    evented: false,
    hoverCursor: 'default',
  });
  (workAreaBorder as any).__systemObject = true;
  workAreaBorder.excludeFromExport = true;

  // Margines bezpieczeństwa – czerwona przerywana linia
  const safetyRect = new fabric.Rect({
    left: WORK_AREA_LEFT + SAFETY_MARGIN_PX,
    top: WORK_AREA_TOP + SAFETY_MARGIN_PX,
    width: widthPx - SAFETY_MARGIN_PX * 2,
    height: heightPx - SAFETY_MARGIN_PX * 2,
    fill: 'transparent',
    stroke: '#ef4444',
    strokeWidth: 0.5,
    strokeDashArray: [3, 3],
    selectable: false,
    evented: false,
    hoverCursor: 'default',
    opacity: 0.6,
  });
  (safetyRect as any).__systemObject = true;
  safetyRect.excludeFromExport = true;

  canvas.add(workArea);
  canvas.add(workAreaBorder);
  canvas.add(safetyRect);

  // ── Zdarzenia restrykcji ────────────────────────────────
  canvas.on('object:moving', (e) => clampPosition(e.target));
  canvas.on('object:scaling', (e) => clampScaling(e.target));
  canvas.on('object:rotating', (e) => snapRotation(e.target));
  canvas.on('text:changed', (e) => clampPosition((e as any).target));

  // ── Auto-fit tekstu po zakończeniu edycji ───────────────
  // Jeśli po wpisaniu tekst wychodzi poza safe zone,
  // automatycznie skaluj proporcjonalnie, żeby się zmieścił.
  canvas.on('text:editing:exited' as any, (e: any) => {
    const obj = e.target as fabric.IText | undefined;
    if (!obj || obj.type !== 'i-text') return;
    obj.setCoords();
    obj.setCoords();
    const b = obj.getBoundingRect();
    const sw = safeW(obj.canvas as fabric.Canvas);
    const sh = safeH(obj.canvas as fabric.Canvas);

    if (b.width > sw || b.height > sh) {
      const ratio = Math.min(sw / b.width, sh / b.height, 1);
      if (ratio < 1) {
        const s = (obj.scaleX || 1) * ratio;
        obj.set({ scaleX: s, scaleY: (obj.scaleY || 1) * ratio });
        obj.setCoords();
      }
    }
    clampPosition(obj);
    canvas.renderAll();
  });

  // ── Normalizer: scale → fontSize dla IText ──────────────
  canvas.on('object:modified', (e) => {
    const obj = e.target;
    if (!obj || obj.type !== 'i-text') return;
    const t = obj as fabric.IText;
    const sx = t.scaleX || 1;
    const sy = t.scaleY || 1;
    if (sx === 1 && sy === 1) return;

    // Przelicz skalę pionową na fontSize, zachowaj ratio rozciągnięcia
    const newFontSize = Math.max(ptToPx(4), Math.min(ptToPx(72), (t.fontSize || 14) * sy));
    const newScaleX = sx / sy; // zachowaj celowe rozciągnięcie poziome
    t.set({
      fontSize: newFontSize,
      scaleX: newScaleX,
      scaleY: 1,
    });
    t.setCoords();
    canvas.renderAll();
  });

  return canvas;
}

export function updateStampSize(canvas: fabric.Canvas, size: StampSize) {
  const { widthPx, heightPx, totalW, totalH } = getCanvasDimensions(size.widthMm, size.heightMm);

  canvas.setDimensions({ width: totalW, height: totalH });

  (canvas as any).__stampWidthMm = size.widthMm;
  (canvas as any).__stampHeightMm = size.heightMm;
  (canvas as any).__stampLabel = size.label;

  const objects = canvas.getObjects();
  // Zakładamy kolejność dodawania w initCanvas: 0=workArea, 1=border, 2=safety
  // Dla pewności można szukać po cechach, ale initCanvas jest deterministyczny.
  // Użyjmy bezpieczniejszego wyszukiwania.

  const workArea = objects.find(o => (o as any).__systemObject && o.fill === '#ffffff') as fabric.Rect;
  const border = objects.find(o => (o as any).__systemObject && o.stroke === '#d4d4d4') as fabric.Rect;
  const safety = objects.find(o => (o as any).__systemObject && o.stroke === '#ef4444') as fabric.Rect;

  if (workArea) {
    workArea.set({ width: widthPx, height: heightPx });
    workArea.setCoords();
  }
  if (border) {
    border.set({ width: widthPx, height: heightPx });
    border.setCoords();
  }
  if (safety) {
    safety.set({
      width: widthPx - SAFETY_MARGIN_PX * 2,
      height: heightPx - SAFETY_MARGIN_PX * 2,
    });
    safety.setCoords();
  }

  canvas.requestRenderAll();
}

// ── Granice safety zone ───────────────────────────────────
// Pobieramy wymiary z obiektu canvas (jeśli dostępny)
const getDim = (canvas?: fabric.Canvas) => {
  const wMm = (canvas as any)?.__stampWidthMm || DEFAULT_SIZE.widthMm;
  const hMm = (canvas as any)?.__stampHeightMm || DEFAULT_SIZE.heightMm;
  return {
    wPx: Math.round(wMm * PX_PER_MM),
    hPx: Math.round(hMm * PX_PER_MM)
  };
};

// ── Granice z marginesem 1cm (zamiast sztywnego cięcia) ──
// Margines dodatkowy (poza obszar roboczy) na linijki itp.
const EXTRA_MARGIN_PX = Math.round(10 * PX_PER_MM); // 10mm = 1cm

// Tryby granic
export type BoundaryMode = 'safety' | 'print' | 'unlocked';

// Funkcja do ustawiania trybu w canvasie (przechowujemy w instancji)
export function setBoundaryMode(canvas: fabric.Canvas, mode: BoundaryMode) {
  (canvas as any).__boundaryMode = mode;
  // Przelicz pozycje wszystkich obiektów
  canvas.getObjects().forEach(obj => clampPosition(obj));
  canvas.renderAll();
}

const getBoundaryMode = (canvas?: fabric.Canvas): BoundaryMode => {
  return (canvas as any)?.__boundaryMode || 'safety';
};

const safeW = (canvas?: fabric.Canvas, modeOverride?: BoundaryMode) => {
  const { wPx } = getDim(canvas);
  const mode = modeOverride || getBoundaryMode(canvas);

  switch (mode) {
    case 'safety': return wPx - SAFETY_MARGIN_PX * 2;
    case 'print': return wPx;
    case 'unlocked': return wPx + EXTRA_MARGIN_PX * 2;
  }
};

const safeH = (canvas?: fabric.Canvas, modeOverride?: BoundaryMode) => {
  const { hPx } = getDim(canvas);
  const mode = modeOverride || getBoundaryMode(canvas);

  switch (mode) {
    case 'safety': return hPx - SAFETY_MARGIN_PX * 2;
    case 'print': return hPx;
    case 'unlocked': return hPx + EXTRA_MARGIN_PX * 2;
  }
};

const safeMinX = (canvas?: fabric.Canvas, modeOverride?: BoundaryMode) => {
  const mode = modeOverride || getBoundaryMode(canvas);
  switch (mode) {
    case 'safety': return WORK_AREA_LEFT + SAFETY_MARGIN_PX;
    case 'print': return WORK_AREA_LEFT;
    case 'unlocked': return WORK_AREA_LEFT - EXTRA_MARGIN_PX;
  }
};

const safeMinY = (canvas?: fabric.Canvas, modeOverride?: BoundaryMode) => {
  const mode = modeOverride || getBoundaryMode(canvas);
  switch (mode) {
    case 'safety': return WORK_AREA_TOP + SAFETY_MARGIN_PX;
    case 'print': return WORK_AREA_TOP;
    case 'unlocked': return WORK_AREA_TOP - EXTRA_MARGIN_PX;
  }
};

const safeMaxX = (canvas?: fabric.Canvas, modeOverride?: BoundaryMode) => {
  const { wPx } = getDim(canvas);
  const mode = modeOverride || getBoundaryMode(canvas);
  switch (mode) {
    case 'safety': return WORK_AREA_LEFT + wPx - SAFETY_MARGIN_PX;
    case 'print': return WORK_AREA_LEFT + wPx;
    case 'unlocked': return WORK_AREA_LEFT + wPx + EXTRA_MARGIN_PX;
  }
};

const safeMaxY = (canvas?: fabric.Canvas, modeOverride?: BoundaryMode) => {
  const { hPx } = getDim(canvas);
  const mode = modeOverride || getBoundaryMode(canvas);
  switch (mode) {
    case 'safety': return WORK_AREA_TOP + hPx - SAFETY_MARGIN_PX;
    case 'print': return WORK_AREA_TOP + hPx;
    case 'unlocked': return WORK_AREA_TOP + hPx + EXTRA_MARGIN_PX;
  }
};

// ── Hard boundary – pozycja ───────────────────────────────
// Jeśli obiekt mieści się w safe zone → clamp do granic.
// Jeśli obiekt jest WIĘKSZY niż safe zone → przypnij do minX/minY.
export function clampPosition(obj: fabric.FabricObject | undefined) {
  if (!obj || (obj as any).__systemObject || (obj as any).__locked) return;

  obj.setCoords();
  const b = obj.getBoundingRect();
  const dL = obj.left! - b.left;
  const dT = obj.top! - b.top;

  const canvas = obj.canvas as fabric.Canvas;
  const currentSafeW = safeW(canvas);
  const currentSafeH = safeH(canvas);
  const currentMinX = safeMinX(canvas);
  const currentMinY = safeMinY(canvas);
  const currentMaxX = safeMaxX(canvas);
  const currentMaxY = safeMaxY(canvas);

  let left: number;
  let top: number;

  if (b.width >= currentSafeW) {
    // Obiekt szerszy niż safe zone → przypnij do lewej
    left = currentMinX + dL;
  } else {
    // Clamp
    const minLeft = currentMinX + dL;
    const maxLeft = currentMaxX - b.width + dL;
    left = Math.max(minLeft, Math.min(maxLeft, obj.left!));
  }

  if (b.height >= currentSafeH) {
    top = currentMinY + dT;
  } else {
    const minTop = currentMinY + dT;
    const maxTop = currentMaxY - b.height + dT;
    top = Math.max(minTop, Math.min(maxTop, obj.top!));
  }

  obj.set({ left, top });
  obj.setCoords();
}

// ── Hard boundary – skalowanie ────────────────────────────
// Podczas skalowania ograniczamy scaleX/scaleY tak, by obiekt
// nie przekroczył granic safety zone.
export function clampScaling(obj: fabric.FabricObject | undefined) {
  if (!obj || (obj as any).__systemObject || (obj as any).__locked) return;

  obj.setCoords();
  const b = obj.getBoundingRect();
  const canvas = obj.canvas as fabric.Canvas;
  const currentSafeW = safeW(canvas);
  const currentSafeH = safeH(canvas);

  // IText: per-axis clamping – każda oś niezależnie
  if (obj.type === 'i-text') {
    let sx = obj.scaleX || 1;
    let sy = obj.scaleY || 1;

    if (b.width > currentSafeW) sx *= currentSafeW / b.width;
    if (b.height > currentSafeH) sy *= currentSafeH / b.height;
    obj.set({ scaleX: sx, scaleY: sy });
    obj.setCoords();
    clampPosition(obj);
    return;
  }

  // Inne obiekty (ramki itp.): uniform clamping
  if (b.width > currentSafeW || b.height > currentSafeH) {
    const ratioW = currentSafeW / b.width;
    const ratioH = currentSafeH / b.height;
    const ratio = Math.min(ratioW, ratioH, 1);
    if (ratio < 1) {
      obj.set({
        scaleX: (obj.scaleX || 1) * ratio,
        scaleY: (obj.scaleY || 1) * ratio,
      });
      obj.setCoords();
    }
  }

  // Po korekcji skali – dopasuj pozycję
  clampPosition(obj);
}

// ── Snap rotation ─────────────────────────────────────────
function snapRotation(obj: fabric.FabricObject | undefined) {
  if (!obj) return;
  const angle = obj.angle! % 360;
  const snapAngles = [0, 90, 180, 270, 360];
  for (const sa of snapAngles) {
    if (Math.abs(angle - sa) < SNAP_THRESHOLD) {
      obj.set('angle', sa === 360 ? 0 : sa);
      break;
    }
  }
}

// ── Rysowanie linijek i siatki (after:render) ─────────────
export function drawRulersAndGrid(
  canvas: fabric.Canvas,
  showGrid: boolean,
  theme: 'light' | 'dark'
) {
  const ctx = canvas.getContext();
  const z = canvas.getZoom();

  const dark = theme === 'dark';
  const rulerBg = dark ? '#1e1e22' : '#f4f4f5';
  const rulerText = dark ? '#a1a1aa' : '#71717a';
  const rulerLine = dark ? '#3f3f46' : '#d4d4d8';
  const gridColor = dark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.1)';

  const wMm = (canvas as any).__stampWidthMm || DEFAULT_SIZE.widthMm;
  const hMm = (canvas as any).__stampHeightMm || DEFAULT_SIZE.heightMm;
  const { widthPx, heightPx, totalW: canvasTotalW, totalH: canvasTotalH } = getCanvasDimensions(wMm, hMm);

  // ── Siatka (w screen space – z jawnym zoom) ──────────────
  if (showGrid) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // reset do pikseli ekranu
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let mm = GRID_SIZE_MM; mm < wMm; mm += GRID_SIZE_MM) {
      const x = (WORK_AREA_LEFT + Math.round(mm * PX_PER_MM)) * z;
      ctx.beginPath();
      ctx.moveTo(x, WORK_AREA_TOP * z);
      ctx.lineTo(x, (WORK_AREA_TOP + heightPx) * z);
      ctx.stroke();
    }
    for (let mm = GRID_SIZE_MM; mm < hMm; mm += GRID_SIZE_MM) {
      const y = (WORK_AREA_TOP + Math.round(mm * PX_PER_MM)) * z;
      ctx.beginPath();
      ctx.moveTo(WORK_AREA_LEFT * z, y);
      ctx.lineTo((WORK_AREA_LEFT + widthPx) * z, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Linijki (w screen space – niezależne od zoom) ─────────
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset do pikseli ekranu

  const rSize = RULER_SIZE * z;
  const waLeft = WORK_AREA_LEFT * z;
  const waTop = WORK_AREA_TOP * z;
  const totalW = canvasTotalW * z;
  const totalH = canvasTotalH * z;

  // Tło linijek
  ctx.fillStyle = rulerBg;
  ctx.fillRect(rSize, 0, totalW - rSize, rSize);       // górna
  ctx.fillRect(0, rSize, rSize, totalH - rSize);        // lewa
  ctx.fillRect(0, 0, rSize, rSize);                      // narożnik

  // Kreślenie linijki górnej (mm)
  ctx.strokeStyle = rulerLine;
  ctx.fillStyle = rulerText;
  const fontSize = Math.max(7, Math.min(11, 9 * z));
  ctx.font = `${fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  for (let mm = 0; mm <= wMm; mm++) {
    const x = waLeft + Math.round(mm * PX_PER_MM * z);
    const isMajor = mm % 10 === 0;
    const isMid = mm % 5 === 0;
    const tickH = (isMajor ? 10 : isMid ? 6 : 3) * Math.min(z, 1.5);

    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, rSize);
    ctx.lineTo(x, rSize - tickH);
    ctx.stroke();

    if (isMajor && mm > 0) {
      ctx.fillText(`${mm}`, x, rSize - tickH - 1);
    }
  }

  // Kreślenie linijki lewej (mm)
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  for (let mm = 0; mm <= hMm; mm++) {
    const y = waTop + Math.round(mm * PX_PER_MM * z);
    const isMajor = mm % 10 === 0;
    const isMid = mm % 5 === 0;
    const tickW = (isMajor ? 10 : isMid ? 6 : 3) * Math.min(z, 1.5);

    ctx.lineWidth = isMajor ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(rSize, y);
    ctx.lineTo(rSize - tickW, y);
    ctx.stroke();

    if (isMajor && mm > 0) {
      ctx.fillText(`${mm}`, rSize - tickW - 2, y);
    }
  }

  // Krawędzie linijek
  ctx.strokeStyle = rulerLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rSize, rSize);
  ctx.lineTo(totalW, rSize);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rSize, rSize);
  ctx.lineTo(rSize, totalH);
  ctx.stroke();

  ctx.restore();
}



// ── Snap to grid helper ───────────────────────────────────
export function setupSnapToGrid(canvas: fabric.Canvas, enabled: boolean) {
  if (enabled) {
    canvas.on('object:moving', snapToGridHandler);
  } else {
    canvas.off('object:moving', snapToGridHandler);
  }
}

function snapToGridHandler(e: any) {
  const obj = e.target;
  if (!obj || (obj as any).__systemObject) return;

  const relLeft = obj.left! - WORK_AREA_LEFT;
  const relTop = obj.top! - WORK_AREA_TOP;

  const snappedLeft = Math.round(relLeft / GRID_SIZE_PX) * GRID_SIZE_PX + WORK_AREA_LEFT;
  const snappedTop = Math.round(relTop / GRID_SIZE_PX) * GRID_SIZE_PX + WORK_AREA_TOP;

  obj.set({ left: snappedLeft, top: snappedTop });
  obj.setCoords();
}

// ── Dodawanie tekstu (IText – edytowalny tekst) ──────────
export interface AddTextOptions {
  text?: string;
  fontFamily?: FontName;
  fontSize?: number; // pt (jak w Word)
  fill?: string;
  charSpacing?: number;
}

export function addText(canvas: fabric.Canvas, options: AddTextOptions = {}) {
  _textCounter++;
  const {
    text = 'Pieczątka',
    fontFamily = 'Myriad Pro',
    fontSize = 10,  // pt (domyślnie 10pt jak w Word)
    fill = '#000000',
    charSpacing = 0,
  } = options;

  /* OBLICZANIE ŚRODKA ZROBIONE DYNAMICZNIE */
  const wMm = (canvas as any)?.__stampWidthMm || DEFAULT_SIZE.widthMm;
  const hMm = (canvas as any)?.__stampHeightMm || DEFAULT_SIZE.heightMm;
  const { widthPx, heightPx } = getCanvasDimensions(wMm, hMm);

  // Position: Center Horizontal, Top Vertical (with Safety Margin)
  const left = WORK_AREA_LEFT + widthPx / 2;
  const top = WORK_AREA_TOP + SAFETY_MARGIN_PX + ptToPx(fontSize) / 1.5;

  const itext = new fabric.IText(text, {
    left,
    top,
    fontFamily,
    fontSize: ptToPx(fontSize),
    fill,
    charSpacing,
    originX: 'center',
    originY: 'center',
    editable: true,
    textAlign: 'center',
  });

  (itext as any).__stampName = `Tekst ${_textCounter}`;
  (itext as any).__uid = `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  canvas.add(itext);
  canvas.setActiveObject(itext);
  canvas.renderAll();

  return itext;
}

// ── Layer Operations ──────────────────────────────────────
export async function duplicateActive(canvas: fabric.Canvas) {
  const active = canvas.getActiveObject();
  if (!active) return;

  active.clone().then((cloned: fabric.FabricObject) => {
    canvas.discardActiveObject();

    // Offset new object
    cloned.set({
      left: (cloned.left || 0) + 10,
      top: (cloned.top || 0) + 10,
      evented: true,
    });

    if (active.type === 'activeSelection') {
      // If multiple, clone preserves relative positions
      cloned.canvas = canvas;
      (cloned as any).forEachObject((obj: any) => {
        canvas.add(obj);
        if (obj.type === 'i-text') _textCounter++;
        if ((obj as any).__stampType === 'frame') _frameCounter++;
        // Append Copy to name
        const name = (obj as any).__stampName || 'Obiekt';
        (obj as any).__stampName = `${name} (Kopia)`;
      });
      cloned.setCoords();
    } else {
      if ((cloned as any).__systemObject) return; // Don't clone system objects

      canvas.add(cloned);
      if (cloned.type === 'i-text') {
        _textCounter++;
        (cloned as any).__stampName = `${(active as any).__stampName || 'Tekst'} (Kopia)`;
      } else if ((cloned as any).__stampType === 'frame') {
        _frameCounter++;
        (cloned as any).__stampName = `${(active as any).__stampName || 'Ramka'} (Kopia)`;
      } else {
        (cloned as any).__stampName = `${(active as any).__stampName || 'Obiekt'} (Kopia)`;
      }
    }

    canvas.setActiveObject(cloned);
    canvas.renderAll();
    saveState(canvas);
  });
}

export function groupActive(canvas: fabric.Canvas) {
  const active = canvas.getActiveObject();
  if (!active || active.type !== 'activeSelection') return;

  (active as any).toGroup().then((group: any) => {
    if (group) {
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      saveState(canvas);
    }
  }).catch((err: any) => {
    console.error('Group error:', err);
  });
}

export function ungroupActive(canvas: fabric.Canvas) {
  const active = canvas.getActiveObject();
  if (!active || active.type !== 'group') return;

  (active as any).toActiveSelection().then((selection: any) => {
    if (selection) {
      canvas.setActiveObject(selection);
      canvas.requestRenderAll();
      saveState(canvas);
    }
  }).catch((err: any) => {
    console.error('Ungroup error:', err);
  });
}

// ── Dodawanie ramki prostokątnej ──────────────────────────
export interface AddFrameOptions {
  strokeWidth_mm?: number;
  stroke?: string;
  margin_mm?: number;
}

export function addRectFrame(canvas: fabric.Canvas, options: AddFrameOptions = {}) {
  _frameCounter++;
  const {
    strokeWidth_mm = 0.5,
    stroke = '#000000',
    margin_mm = 2,
  } = options;

  const wMm = (canvas as any)?.__stampWidthMm || DEFAULT_SIZE.widthMm;
  const hMm = (canvas as any)?.__stampHeightMm || DEFAULT_SIZE.heightMm;
  const { widthPx, heightPx } = getCanvasDimensions(wMm, hMm);

  const marginPx = margin_mm * PX_PER_MM;
  const strokePx = strokeWidth_mm * PX_PER_MM;

  const rect = new fabric.Rect({
    left: WORK_AREA_LEFT + marginPx,
    top: WORK_AREA_TOP + marginPx,
    width: widthPx - marginPx * 2 - strokePx,
    height: heightPx - marginPx * 2 - strokePx,
    fill: 'transparent',
    stroke,
    strokeWidth: strokePx,
    strokeUniform: true,
    selectable: true,
    evented: true,
  });

  (rect as any).__stampType = 'frame';
  (rect as any).__strokeWidth_mm = strokeWidth_mm;
  (rect as any).__stampName = `Ramka ${_frameCounter}`;
  (rect as any).__uid = `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  canvas.add(rect);
  canvas.setActiveObject(rect);
  canvas.renderAll();

  return rect;
}

// ── Helpers: pobieranie obiektów użytkownika ───────────────
export function getUserObjects(canvas: fabric.Canvas): fabric.FabricObject[] {
  return canvas.getObjects().filter((o) => !(o as any).__systemObject);
}

export function isSystemObject(obj: fabric.FabricObject): boolean {
  return !!(obj as any).__systemObject;
}

// ── Debounce helper ───────────────────────────────────────
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Undo / Redo ──────────────────────────────────────────
const MAX_HISTORY = 50;
let _undoStack: string[] = [];
let _redoStack: string[] = [];
let _ignoreStateChange = false;

function getSerializableObjects(canvas: fabric.Canvas) {
  return canvas.getObjects().filter((o) => !(o as any).__systemObject);
}

/** Zapisz aktualny stan canvas do historii (wywoływane po każdej modyfikacji) */
export function saveState(canvas: fabric.Canvas) {
  if (_ignoreStateChange) return;
  const objs = getSerializableObjects(canvas);
  const state = JSON.stringify(objs.map((o) => o.toObject(['__stampType', '__stampName', '__strokeWidth_mm', '__uid'])));
  _undoStack.push(state);
  if (_undoStack.length > MAX_HISTORY) _undoStack.shift();
  _redoStack = []; // nowa akcja czyści redo
}

/** Cofnij ostatnią akcję */
export async function undo(canvas: fabric.Canvas) {
  if (_undoStack.length < 2) return; // potrzebujemy co najmniej 2 stanów (obecny + poprzedni)
  const current = _undoStack.pop()!;
  _redoStack.push(current);
  const prev = _undoStack[_undoStack.length - 1];
  await _restoreState(canvas, prev);
}

/** Ponów cofniętą akcję */
export async function redo(canvas: fabric.Canvas) {
  if (_redoStack.length === 0) return;
  const state = _redoStack.pop()!;
  _undoStack.push(state);
  await _restoreState(canvas, state);
}

async function _restoreState(canvas: fabric.Canvas, stateJson: string) {
  _ignoreStateChange = true;
  // Usuń obiekty użytkownika
  const userObjs = getSerializableObjects(canvas);
  userObjs.forEach((o) => canvas.remove(o));

  // Przywróć obiekty ze stanu
  const parsed = JSON.parse(stateJson) as any[];
  for (const objData of parsed) {
    const enlivenedArr = await fabric.util.enlivenObjects([objData]);
    const obj = enlivenedArr[0] as fabric.FabricObject;
    // Przywróć niestandardowe atrybuty
    if (objData.__stampType) (obj as any).__stampType = objData.__stampType;
    if (objData.__stampName) (obj as any).__stampName = objData.__stampName;
    if (objData.__strokeWidth_mm) (obj as any).__strokeWidth_mm = objData.__strokeWidth_mm;
    if (objData.__uid) (obj as any).__uid = objData.__uid;
    canvas.add(obj);
  }

  canvas.discardActiveObject();
  canvas.renderAll();
  _ignoreStateChange = false;
}

export function canUndo() { return _undoStack.length >= 2; }
export function canRedo() { return _redoStack.length > 0; }

// ── Walidator produkcyjny ─────────────────────────────────
export function validateMinFontSize(canvas: fabric.Canvas): string[] {
  const warnings: string[] = [];
  const objects = canvas.getObjects();

  for (const obj of objects) {
    if (obj.type === 'i-text') {
      const textObj = obj as fabric.IText;
      const ptSize = pxToPt(textObj.fontSize || 14);
      if (ptSize < 7) {
        warnings.push(
          `Tekst "${textObj.text?.substring(0, 20)}..." ma rozmiar ${ptSize}pt – ryzyko nieczytelności na gumie.`
        );
      }
    }
  }

  return warnings;
}

// ── Pozycjonowanie na obszarze roboczym (9 punktów) ───────
// Uwzględnia bounding rect obiektu (origin, skalę, obrót)

type AlignV = 'top' | 'middle' | 'bottom';
type AlignH = 'left' | 'center' | 'right';

export function alignObject(
  canvas: fabric.Canvas,
  obj: fabric.FabricObject,
  vertical: AlignV,
  horizontal: AlignH
) {
  obj.setCoords();
  const b = obj.getBoundingRect();
  const dL = obj.left! - b.left;
  const dT = obj.top! - b.top;

  let left: number;
  let top: number;

  const wMm = (canvas as any)?.__stampWidthMm || DEFAULT_SIZE.widthMm;
  const hMm = (canvas as any)?.__stampHeightMm || DEFAULT_SIZE.heightMm;
  const { widthPx, heightPx } = getCanvasDimensions(wMm, hMm);

  // Horizontal
  // Zawsze używamy 'safety' mode dla automatycznego wyrównania/dopasowania
  const safeMode = 'safety';
  const cCanvas = canvas as fabric.Canvas;

  switch (horizontal) {
    case 'left':
      left = safeMinX(cCanvas, safeMode) + dL;
      break;
    case 'center':
      // Center relative to white area center is usually fine, but let's be strict about limits
      left = WORK_AREA_LEFT + widthPx / 2 - b.width / 2 + dL;
      break;
    case 'right':
      left = safeMaxX(cCanvas, safeMode) - b.width + dL;
      break;
  }

  // Vertical
  switch (vertical) {
    case 'top':
      top = safeMinY(cCanvas, safeMode) + dT;
      break;
    case 'middle':
      top = WORK_AREA_TOP + heightPx / 2 - b.height / 2 + dT;
      break;
    case 'bottom':
      top = safeMaxY(cCanvas, safeMode) - b.height + dT;
      break;
  }

  obj.set({ left, top });
  obj.setCoords();
  canvas.renderAll();
}

// Wygodne aliasy (zachowane dla kompatybilności - deleted to avoid conflict with new impl)
// export function centerObjectH(canvas: fabric.Canvas, obj: fabric.FabricObject) {
//   alignObject(canvas, obj, 'middle', 'center');
// }
// export function centerObjectV(canvas: fabric.Canvas, obj: fabric.FabricObject) {
//   alignObject(canvas, obj, 'middle', 'center');
// }
export function centerObjectBoth(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  // Use new helpers
  if (centerObjectH && centerObjectV) {
    centerObjectH(canvas, obj);
    centerObjectV(canvas, obj);
  } else {
    // Fallback if needed or just align logic
    // Actually we will redefine centerObjectBoth at bottom too or just implement it here using alignObject
    // user wants fit + center.
    // Let's just use alignObject for centerObjectBoth as it maps to center/middle
    alignObject(canvas, obj, 'middle', 'center');
  }
}

// ── Reset proporcji (scaleX → 1) ─────────────────────────
export function resetProportions(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  obj.set({ scaleX: 1 });
  obj.setCoords();
  canvas.renderAll();
}

// ── Zarządzanie warstwami ─────────────────────────────────
export function bringToFront(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  canvas.bringObjectToFront(obj);
  canvas.renderAll();
}

export function sendToBack(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  canvas.sendObjectToBack(obj);
  // Upewnij się, że obiekt jest NAD obiektami systemowymi
  const objects = canvas.getObjects();
  const systemCount = objects.filter((o) => (o as any).__systemObject).length;
  const idx = objects.indexOf(obj);
  if (idx < systemCount) {
    canvas.moveObjectTo(obj, systemCount);
  }
  canvas.renderAll();
}

// ── Dopasuj obiekt do rozmiaru pieczątki (contain) ────────
export function fitObjectToCanvas(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  obj.setCoords();
  const b = obj.getBoundingRect();

  // Reset scale first to calculate raw dimensions
  const initialScaleX = obj.scaleX || 1;
  const initialScaleY = obj.scaleY || 1;
  const rawW = b.width / initialScaleX;
  const rawH = b.height / initialScaleY;

  const wMm = (canvas as any)?.__stampWidthMm || DEFAULT_SIZE.widthMm;
  const hMm = (canvas as any)?.__stampHeightMm || DEFAULT_SIZE.heightMm;
  const { widthPx, heightPx } = getCanvasDimensions(wMm, hMm);

  // Fit to Safety Margin (always)
  const safeWVal = safeW(canvas, 'safety');
  const safeHVal = safeH(canvas, 'safety');

  const scaleX = safeWVal / rawW;
  const scaleY = safeHVal / rawH;

  // Użyj mniejszej skali, aby obiekt zmieścił się w całości (contain)
  const scale = Math.min(scaleX, scaleY);

  const centerX = WORK_AREA_LEFT + widthPx / 2;
  const centerY = WORK_AREA_TOP + heightPx / 2;

  obj.set({
    scaleX: scale,
    scaleY: scale,
    // Jeśli origin jest 'center', to left/top to jest środek.
    // Jeśli origin jest 'left'/'top', to trzeba przesunąć o połowę szerokości/wysokości.
    left: obj.originX === 'center' ? centerX : centerX - (rawW * scale) / 2,
    top: obj.originY === 'center' ? centerY : centerY - (rawH * scale) / 2,
  });

  obj.setCoords();
  canvas.renderAll();
}

// ── Rozdziel tekst na linie (każda linia jako osobny obiekt)
// ── Rozdziel tekst na linie (każda linia jako osobny obiekt)
export function splitTextByLines(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  if (obj.type !== 'i-text') return;
  const t = obj as fabric.IText;
  const textLines = t.text?.split('\n') || [];

  // Jeśli tylko jedna linia - nie ma co dzielić
  if (textLines.length <= 1) return;

  // Pobieramy właściwości oryginału
  const originalWidth = t.width || 0;
  const originalScaleX = t.scaleX || 1;
  const originalTextAlign = t.textAlign || 'left';
  const angleRad = fabric.util.degreesToRadians(t.angle || 0);

  // Obliczamy pozycję Top-Left oryginalnego obiektu
  const topLeft = t.getPointByOrigin('left', 'top');
  const rootTop = topLeft.y;
  const rootLeft = topLeft.x;

  // Przybliżona wysokość linii
  const computedLineHeight = t.fontSize! * (t.lineHeight ?? 1.16) * (t.scaleY || 1);
  const styles = t.styles || {};

  // Usuwamy oryginał
  canvas.remove(t);

  textLines.forEach((line, i) => {
    // Tworzymy nowy obiekt IText dla każdej linii
    const newStyles = styles[i] ? { 0: styles[i] } : {};

    // Kopiujemy opcje
    const options: any = (t as any).toObject(['__stampType', '__stampName', '__locked', '__strokeWidth_mm', '__boundaryMode']);
    delete options.type;
    delete options.version;
    delete options.top;
    delete options.left;
    delete options.angle;
    delete options.width; // Szerokość zostanie przeliczona automatycznie dla nowej linii
    delete options.height;

    // Tworzymy obiekt tymczasowo, by poznać jego wymiary
    // Ważne: musimy zachować te same parametry fontu, by szerokość była poprawna
    const tempObj = new fabric.IText(line, {
      ...options,
      text: line,
      styles: newStyles as any,
      fontFamily: t.fontFamily,
      fontSize: t.fontSize,
      charSpacing: t.charSpacing,
      fontWeight: t.fontWeight,
      fontStyle: t.fontStyle,
      scaleX: t.scaleX, // Skala wpływa na wizualny odbiór, ale width w fabric jest "unscaled".
    });

    // Obliczamy szerokość nowej linii (unscaled)
    const lineWidth = tempObj.width || 0;

    // Obliczamy przesunięcie poziome (offset) w zależności od textAlign
    // Offset jest w jednostkach lokalnych (przed skalowaniem)
    let alignOffset = 0;

    if (originalTextAlign === 'center') {
      alignOffset = (originalWidth - lineWidth) / 2;
    } else if (originalTextAlign === 'right') {
      alignOffset = originalWidth - lineWidth;
    }
    // Dla 'justify' traktujemy jak 'left' przy rozbijaniu na pojedyncze linie (lub można by próbować rozciągać, ale to skomplikowane)

    // Skalujemy offset
    const scaledAlignOffset = alignOffset * originalScaleX;

    // Obliczamy wektory przesunięcia
    // 1. Przesunięcie w dół (kolejne linie) - wzdłuż lokalnej osi Y
    const distY = i * computedLineHeight;
    const shiftY_X = -Math.sin(angleRad) * distY; // X component of Y-axis shift
    const shiftY_Y = Math.cos(angleRad) * distY;  // Y component of Y-axis shift

    // 2. Przesunięcie w poziomie (wyrównanie) - wzdłuż lokalnej osi X
    const shiftX_X = Math.cos(angleRad) * scaledAlignOffset; // X component of X-axis shift
    const shiftX_Y = Math.sin(angleRad) * scaledAlignOffset; // Y component of X-axis shift

    // Finalna pozycja
    const finalLeft = rootLeft + shiftY_X + shiftX_X;
    const finalTop = rootTop + shiftY_Y + shiftX_Y;

    // Finalny obiekt
    const newObj = new fabric.IText(line, {
      ...options,
      text: line,
      top: finalTop,
      left: finalLeft,
      originX: 'left',
      originY: 'top',
      styles: newStyles as any,
      scaleX: t.scaleX,
      scaleY: t.scaleY,
      fill: t.fill,
      fontFamily: t.fontFamily,
      fontSize: t.fontSize,
      charSpacing: t.charSpacing,
      textAlign: originalTextAlign, // Zachowujemy oryginalny align properties, choć dla jednej linii to ma małe znaczenie wizualne (chyba że edytujemy)
      fontWeight: t.fontWeight,
      fontStyle: t.fontStyle,
      underline: t.underline,
      angle: t.angle,
    });

    // Aktualizuj nazwę
    (newObj as any).__stampName = `${(t as any).__stampName || 'Tekst'} (linia ${i + 1})`;

    canvas.add(newObj);
  });

  canvas.discardActiveObject();
  canvas.renderAll();
}

export function moveLayerUp(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  const objects = canvas.getObjects();
  const idx = objects.indexOf(obj);
  if (idx < objects.length - 1) {
    canvas.moveObjectTo(obj, idx + 1);
    canvas.renderAll();
  }
}

export function moveLayerDown(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  const objects = canvas.getObjects();
  const systemCount = objects.filter((o) => (o as any).__systemObject).length;
  const idx = objects.indexOf(obj);
  if (idx > systemCount) {
    canvas.moveObjectTo(obj, idx - 1);
    canvas.renderAll();
  }
}

// ── Lock / Unlock obiektu ─────────────────────────────────
export function toggleLock(obj: fabric.FabricObject): boolean {
  const locked = !(obj as any).__locked;
  (obj as any).__locked = locked;
  obj.set({
    selectable: !locked,
    evented: !locked,
    lockMovementX: locked,
    lockMovementY: locked,
    lockRotation: locked,
    lockScalingX: locked,
    lockScalingY: locked,
    hasControls: !locked,
    hoverCursor: locked ? 'not-allowed' : 'move',
  });
  return locked;
}

// ── Visibility obiektu ────────────────────────────────────
export function toggleVisibility(canvas: fabric.Canvas, obj: fabric.FabricObject): boolean {
  const visible = !obj.visible;
  obj.set('visible', visible);
  if (!visible) {
    canvas.discardActiveObject();
  }
  canvas.renderAll();
  return visible;
}

// ── Usuwanie zaznaczonego obiektu ─────────────────────────
export function deleteSelected(canvas: fabric.Canvas): boolean {
  const active = canvas.getActiveObject();
  if (!active) return false;
  if ((active as any).__systemObject) return false;

  canvas.remove(active);
  canvas.discardActiveObject();
  canvas.renderAll();
  return true;
}

// ── Usuwanie konkretnego obiektu ──────────────────────────
export function deleteObject(canvas: fabric.Canvas, obj: fabric.FabricObject): boolean {
  if ((obj as any).__systemObject) return false;
  canvas.remove(obj);
  if (canvas.getActiveObject() === obj) {
    canvas.discardActiveObject();
  }
  canvas.renderAll();
  return true;
}

// ── Dopasowanie do szerokości/wysokości ───────────────────
// ── Dopasowanie do szerokości/wysokości ───────────────────
// ── Dopasowanie do szerokości/wysokości ───────────────────
export function fitObjectToWidth(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  const w = safeW(canvas, 'safety');
  const targetWidth = w;

  // Calculate current visual width
  obj.setCoords();
  const boundingRect = obj.getBoundingRect();

  // Sanity check: if object is tiny (e.g. empty text), don't explode it
  if (boundingRect.width < 1) return;

  // Oblicz skalę potrzebną, by bounding box miał szerokość targetWidth
  // scaleFactor * currentWidth = targetWidth
  // scaleFactor = targetWidth / currentWidth
  const currentScaleX = obj.scaleX || 1;
  const currentScaleY = obj.scaleY || 1;
  const scaleFactor = targetWidth / boundingRect.width;

  // Limit max scale to avoid explosion (e.g. max 500% larger than original 1.0 scale)
  // But wait, if user wants to fit a small text to full width, maybe they want it big?
  // Let's just prevent 'infinite' or absurd values.
  // User complained about "too huge". Maybe limiting MAX FONT SIZE equivalent?

  const newScaleX = currentScaleX * scaleFactor;
  const newScaleY = currentScaleY * scaleFactor;

  if (newScaleX > 0 && isFinite(newScaleX)) {
    obj.set('scaleX', newScaleX);
    obj.set('scaleY', newScaleY); // Maintain aspect ratio

    // Center horizontally
    centerObjectH(canvas, obj);
    obj.setCoords();
    canvas.renderAll();
  }
}

export function fitObjectToHeight(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  const h = safeH(canvas, 'safety');
  const targetHeight = h;

  obj.setCoords();
  const boundingRect = obj.getBoundingRect();
  if (boundingRect.height < 1) return;

  const currentScaleX = obj.scaleX || 1;
  const currentScaleY = obj.scaleY || 1;
  const scaleFactor = targetHeight / boundingRect.height;

  const newScaleX = currentScaleX * scaleFactor;
  const newScaleY = currentScaleY * scaleFactor;

  if (newScaleY > 0 && isFinite(newScaleY)) {
    obj.set('scaleX', newScaleX);
    obj.set('scaleY', newScaleY);

    // Center vertically
    centerObjectV(canvas, obj);
    obj.setCoords();
    canvas.renderAll();
  }
}

// ── Inteligentne ustawianie wyrównania tekstu ─────────────
export function setTextAlignWithOrigin(
  obj: fabric.IText,
  align: 'left' | 'center' | 'right' | 'justify'
) {
  if (!obj) return;
  const centerPoint = obj.getCenterPoint();
  obj.set('textAlign', align);
  if (align === 'left') {
    obj.set('originX', 'left');
  } else if (align === 'right') {
    obj.set('originX', 'right');
  } else {
    obj.set('originX', 'center');
  }
  obj.setPositionByOrigin(centerPoint, 'center', 'center');
  obj.setCoords();
}

// ── Alignment Helpers (New for Redesign) ──────────────────

export function centerObjectH(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  // Use safe zone center, not canvas center (which might include rulers/padding)
  const minX = safeMinX(canvas, 'safety');
  const w = safeW(canvas, 'safety');
  const centerX = minX + w / 2;

  obj.setCoords();
  const centerPoint = obj.getCenterPoint();
  const dx = centerX - centerPoint.x;

  obj.set('left', (obj.left || 0) + dx);
  obj.setCoords();
  canvas.renderAll();
}

export function centerObjectV(canvas: fabric.Canvas, obj: fabric.FabricObject) {
  const minY = safeMinY(canvas, 'safety');
  const h = safeH(canvas, 'safety');
  const centerY = minY + h / 2;

  obj.setCoords();
  const centerPoint = obj.getCenterPoint();
  const dy = centerY - centerPoint.y;

  obj.set('top', (obj.top || 0) + dy);
  obj.setCoords();
  canvas.renderAll();
}

export function alignObjectToEdge(
  canvas: fabric.Canvas,
  obj: fabric.FabricObject,
  edge: 'left' | 'right' | 'top' | 'bottom'
) {
  const minX = safeMinX(canvas, 'safety');
  const minY = safeMinY(canvas, 'safety');
  const maxX = safeMaxX(canvas, 'safety');
  const maxY = safeMaxY(canvas, 'safety');

  obj.setCoords();
  const b = obj.getBoundingRect();

  let dx = 0;
  let dy = 0;

  if (edge === 'left') {
    dx = minX - b.left;
  } else if (edge === 'right') {
    dx = maxX - (b.left + b.width);
  } else if (edge === 'top') {
    dy = minY - b.top;
  } else if (edge === 'bottom') {
    dy = maxY - (b.top + b.height);
  }

  obj.set('left', (obj.left || 0) + dx);
  obj.set('top', (obj.top || 0) + dy);
  obj.setCoords();
  canvas.renderAll();
}

