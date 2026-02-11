import * as fabric from 'fabric';
import { PDFDocument, rgb, degrees, StandardFonts, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
    STAMP_SIZES,
    DEFAULT_SIZE,
    StampSize,
    WORK_AREA_LEFT,
    WORK_AREA_TOP,
    getCanvasDimensions,
    pxToPt as canvasPxToPt,
    PX_PER_MM
} from './canvas-logic';

// Helpery
// Helpery
const MM_TO_PT = 72 / 25.4;

function pxToMm(px: number): number {
    return px / PX_PER_MM;
}

function pxToPt(px: number): number {
    return canvasPxToPt(px);
}

function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? rgb(
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        )
        : rgb(0, 0, 0);
}

// Font Map
// Struktura: Family -> { regular, bold, italic, boldItalic }
const FONT_MAP: Record<string, { regular: string; bold?: string; italic?: string; boldItalic?: string }> = {
    'Arimo': {
        regular: '/fonts/arimo/Arimo-Regular.ttf'
    },
    'Tinos': {
        regular: '/fonts/tinos/Tinos-Regular.ttf',
        bold: '/fonts/tinos/Tinos-Bold.ttf'
    },
    'Roboto': {
        regular: '/fonts/roboto/Roboto-Regular.ttf'
    },
    'Montserrat': {
        regular: '/fonts/Inter,Montserrat/Montserrat/static/Montserrat-Regular.ttf',
        bold: '/fonts/Inter,Montserrat/Montserrat/static/Montserrat-Bold.ttf',
        italic: '/fonts/Inter,Montserrat/Montserrat/static/Montserrat-Italic.ttf',
        boldItalic: '/fonts/Inter,Montserrat/Montserrat/static/Montserrat-BoldItalic.ttf'
    },
    'Inter': {
        regular: '/fonts/Inter,Montserrat/Inter/static/Inter_18pt-Regular.ttf',
        bold: '/fonts/Inter,Montserrat/Inter/static/Inter_18pt-Bold.ttf',
        italic: '/fonts/Inter,Montserrat/Inter/static/Inter_18pt-Italic.ttf',
        boldItalic: '/fonts/Inter,Montserrat/Inter/static/Inter_18pt-BoldItalic.ttf'
    }
};

async function fetchFontBytes(url: string): Promise<ArrayBuffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load font: ${url}`);
    return await res.arrayBuffer();
}

// --- Main Export Functions ---

export async function exportPDF(canvas: fabric.Canvas): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const wMm = (canvas as any).__stampWidthMm || DEFAULT_SIZE.widthMm;
    const hMm = (canvas as any).__stampHeightMm || DEFAULT_SIZE.heightMm;

    const pageW = wMm * MM_TO_PT;
    const pageH = hMm * MM_TO_PT;
    const page = pdfDoc.addPage([pageW, pageH]);

    const objects = getUserObjects(canvas);

    // Zbieramy potrzebne fonty (rodzina + wariant)
    // Klucz w embeddedFonts to "Family-Variant" np. "Inter-bold"
    const fontsToLoad = new Set<string>();

    for (const obj of objects) {
        if (isTextObject(obj)) {
            const t = obj as fabric.IText;
            const family = t.fontFamily || 'Inter';
            const isBold = (t.fontWeight === 'bold' || t.fontWeight === 700);
            const isItalic = (t.fontStyle === 'italic');

            let variant = 'regular';
            if (isBold && isItalic) variant = 'boldItalic';
            else if (isBold) variant = 'bold';
            else if (isItalic) variant = 'italic';

            fontsToLoad.add(`${family}|${variant}`);
        }
    }

    const embeddedFonts: Record<string, any> = {};
    const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const fontKey of fontsToLoad) {
        const [family, variant] = fontKey.split('|');
        const mapping = FONT_MAP[family];

        if (!mapping) {
            console.warn(`Font "${family}" nieznany, fallback do Helvetica`);
            embeddedFonts[fontKey] = fallbackFont;
            continue;
        }

        // Próba znalezienia pliku dla wariantu
        // Jeśli brak wariantu (np. brak bold), spróbuj regular
        // Uwaga: PDF-lib nie robi "fake bold", więc jeśli brak pliku, będzie regular.
        let fontUrl = (mapping as any)[variant];
        if (!fontUrl) {
            // Fallback logic
            if (variant === 'boldItalic') fontUrl = mapping.bold || mapping.italic || mapping.regular;
            else if (variant === 'bold') fontUrl = mapping.regular;
            else if (variant === 'italic') fontUrl = mapping.regular;
        }

        if (!fontUrl) fontUrl = mapping.regular;

        try {
            const fontBytes = await fetchFontBytes(fontUrl);
            const embedded = await pdfDoc.embedFont(fontBytes, { subset: false });
            embeddedFonts[fontKey] = embedded;
        } catch (e) {
            console.error(`Błąd osadzania fontu "${fontKey}":`, e);
            embeddedFonts[fontKey] = fallbackFont;
        }
    }

    for (const obj of objects) {
        if (!obj.visible) continue;

        if (isTextObject(obj)) {
            renderText(page, obj as fabric.IText, embeddedFonts, fallbackFont, pageH, MM_TO_PT);
        } else if (obj.type === 'rect') {
            renderRect(page, obj as fabric.Rect, pageH, MM_TO_PT);
        }
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

export async function exportPDFFlattened(canvas: fabric.Canvas): Promise<Blob> {
    const pdfDoc = await PDFDocument.create();

    const wMm = (canvas as any).__stampWidthMm || DEFAULT_SIZE.widthMm;
    const hMm = (canvas as any).__stampHeightMm || DEFAULT_SIZE.heightMm;
    const { widthPx, heightPx } = getCanvasDimensions(wMm, hMm);

    const pageW = wMm * MM_TO_PT;
    const pageH = hMm * MM_TO_PT;
    const page = pdfDoc.addPage([pageW, pageH]);

    // 1. Zapisz stan
    const originalVpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const originalSelection = canvas.selection;
    const originalBg = canvas.backgroundColor;

    // 2. Przygotuj canvas
    canvas.discardActiveObject();
    canvas.selection = false;
    canvas.backgroundColor = '#ffffff'; // Białe tło dla poprawnej binaryzacji (brak przezroczystości)

    const objectsToHide: fabric.FabricObject[] = [];
    canvas.getObjects().forEach((obj) => {
        if ((obj as any).__systemObject || (obj as any).excludeFromExport) {
            if (obj.visible) {
                obj.visible = false;
                objectsToHide.push(obj);
            }
        }
    });

    canvas.renderAll();

    // 3. Rasteryzacja 2000 DPI
    const targetDPI = 2000;
    const multiplier = (targetDPI / 25.4) * (25.4 / 96); // aprox factor 
    // Prościej: widthPx to 96DPI (domyślnie). Chcemy 2000DPI.
    // Factor = 2000 / 96 ≈ 20.8
    const scaleFactor = 2000 / 96;

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    // Generujemy duży obraz w formacie PNG
    const dataUrl = canvas.toDataURL({
        format: 'png',
        multiplier: scaleFactor,
        left: WORK_AREA_LEFT,
        top: WORK_AREA_TOP,
        width: widthPx,
        height: heightPx,
        enableRetinaScaling: true
    });

    // 4. Binaryzacja (1-bit Black & White)
    // Musimy załadować obraz do tymczasowego Canvas API
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
    });

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    const ctx = tempCanvas.getContext('2d');

    if (!ctx) throw new Error('Cannot get 2d context for binarization');

    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    // Progowanie (Thresholding)
    // Zamieniamy każdy piksel na czarny (0,0,0,255) lub biały (255,255,255,255)
    // Ignorujemy alpha (przyjmujemy że tło jest białe, co ustawiliśmy wcześniej)
    const threshold = 120; // 0-255

    for (let i = 0; i < data.length; i += 4) {
        // Średnia jasność RGB
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;

        if (brightness < threshold) {
            // Czarny
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
        } else {
            // Biały
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
        }
        // Alpha zawsze pełna
        data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
    const processedDataUrl = tempCanvas.toDataURL('image/png');

    // 5. Przywróć stan
    objectsToHide.forEach(obj => obj.visible = true);
    try { canvas.setViewportTransform(originalVpt); } catch { }
    canvas.selection = originalSelection;
    canvas.backgroundColor = originalBg;
    canvas.requestRenderAll();

    // 6. Osadź w PDF
    const base64 = processedDataUrl.split(',')[1];
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const pngImage = await pdfDoc.embedPng(bytes);
    page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pageW,
        height: pageH,
    });

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

// --- UI Wrappers (Download) ---

export async function downloadPDF(canvas: fabric.Canvas, size: StampSize) {
    try {
        const blob = await exportPDF(canvas);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pieczatka_${size.widthMm}x${size.heightMm}_wektor.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Download PDF error:', e);
        alert('Błąd generowania PDF. Sprawdź konsolę.');
    }
}

export async function downloadPDFFlattened(canvas: fabric.Canvas) {
    try {
        const blob = await exportPDFFlattened(canvas);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pieczatka_1bit_2000dpi.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Download flatten PDF error:', e);
        alert('Błąd generowania PDF (flatten). Sprawdź konsolę.');
    }
}

// --- Render Helpers ---

function getUserObjects(canvas: fabric.Canvas) {
    return canvas.getObjects().filter(o =>
        !((o as any).__systemObject) &&
        !((o as any).excludeFromExport)
    );
}

function isTextObject(obj: fabric.FabricObject) {
    return obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox';
}

function renderRect(
    page: any,
    rect: fabric.Rect,
    pageH: number,
    MM_TO_PT: number
) {
    // Prosta implementacja dla ramek
    if (!rect.width || !rect.height) return;

    // Kolor stroke
    const stroke = (rect.stroke as string) || '#000000';
    const strokeColor = hexToRgb(stroke);
    const strokeWidthPx = rect.strokeWidth || 1;
    const strokeWidthPt = pxToPt(strokeWidthPx);

    rect.setCoords();
    const bounds = rect.getBoundingRect();
    const boundsLeft = bounds.left - WORK_AREA_LEFT;
    const boundsTop = bounds.top - WORK_AREA_TOP;

    // Convert to PDF coords
    const xMm = pxToMm(boundsLeft);
    const yMm = pxToMm(boundsTop);
    const wMm = pxToMm(bounds.width);
    const hMm = pxToMm(bounds.height);

    const xPt = xMm * MM_TO_PT;
    const yPt = pageH - (yMm * MM_TO_PT) - (hMm * MM_TO_PT); // Bottom-left Y
    const wPt = wMm * MM_TO_PT;
    const hPt = hMm * MM_TO_PT;

    page.drawRectangle({
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
        borderColor: strokeColor,
        borderWidth: strokeWidthPt,
        color: undefined,
    });
}

function renderText(
    page: any,
    textObj: fabric.IText,
    embeddedFonts: Record<string, any>,
    fallbackFont: any,
    pageH: number,
    MM_TO_PT: number
) {
    const text = textObj.text || '';
    if (!text.trim()) return;

    const family = textObj.fontFamily || 'Inter';
    const isBold = (textObj.fontWeight === 'bold' || textObj.fontWeight === 700);
    const isItalic = (textObj.fontStyle === 'italic');

    let variant = 'regular';
    if (isBold && isItalic) variant = 'boldItalic';
    else if (isBold) variant = 'bold';
    else if (isItalic) variant = 'italic';

    const fontKey = `${family}|${variant}`;
    const font = embeddedFonts[fontKey] || fallbackFont;

    // Use unscaled font size for PDF (scaling handled by CTM)
    const fontSize = textObj.fontSize || 14;
    const fontSizePt = pxToPt(fontSize);

    // Color
    const fill = (textObj.fill as string) || '#000000';
    const color = hexToRgb(fill);

    // 1. Calculate Center Position in PDF coordinates
    const cxPx = textObj.left || 0;
    const cyPx = textObj.top || 0; // Fabric Y

    // Convert canvas coords to PDF page coords
    const relX = cxPx - WORK_AREA_LEFT;
    const relY = cyPx - WORK_AREA_TOP;

    const xMm = pxToMm(relX);
    const yMm = pxToMm(relY);

    const cx = xMm * MM_TO_PT;
    const cy = pageH - (yMm * MM_TO_PT);

    // 2. Transform parameters
    const angle = textObj.angle || 0;
    const rad = -angle * (Math.PI / 180); // PDF uses counter-clockwise
    const c = Math.cos(rad);
    const s = Math.sin(rad);

    const sx = textObj.scaleX || 1;
    const sy = textObj.scaleY || 1;

    // 3. Save Graphics State
    page.pushOperators(pushGraphicsState());

    // 4. Apply Transformations (Order: Translate -> Rotate -> Scale)
    page.pushOperators(concatTransformationMatrix(1, 0, 0, 1, cx, cy));
    page.pushOperators(concatTransformationMatrix(c, s, -s, c, 0, 0));
    page.pushOperators(concatTransformationMatrix(sx, 0, 0, sy, 0, 0));

    // 5. Draw Text relative to center (0,0)
    const lines = text.split('\n');
    const lineHeightFactor = textObj.lineHeight || 1.16;
    const lineHeightPt = fontSizePt * lineHeightFactor;

    const objHeightPt = pxToPt(textObj.height || 0);
    const objWidthPt = pxToPt(textObj.width || 0);

    let currentY = (objHeightPt / 2) - (fontSizePt * 0.75);

    const textAlign = textObj.textAlign || 'center';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        let lineWidthPt = 0;
        try {
            lineWidthPt = font.widthOfTextAtSize(line, fontSizePt);
        } catch { }

        let currentX = 0;
        if (textAlign === 'center') {
            currentX = -lineWidthPt / 2;
        } else if (textAlign === 'right') {
            currentX = (objWidthPt / 2) - lineWidthPt;
        } else { // left
            currentX = -objWidthPt / 2;
        }

        const charSpacing = textObj.charSpacing || 0;

        if (charSpacing !== 0) {
            const extraSpacePt = (charSpacing / 1000) * fontSizePt;
            const totalSpacing = extraSpacePt * Math.max(0, line.length - 1);
            const spacedWidth = lineWidthPt + totalSpacing;

            if (textAlign === 'center') currentX = -spacedWidth / 2;
            else if (textAlign === 'right') currentX = (objWidthPt / 2) - spacedWidth;
            else currentX = -objWidthPt / 2;

            for (const char of line) {
                try {
                    page.drawText(char, {
                        x: currentX,
                        y: currentY,
                        size: fontSizePt,
                        font,
                        color,
                        rotate: degrees(0)
                    });
                    const cw = font.widthOfTextAtSize(char, fontSizePt);
                    currentX += cw + extraSpacePt;
                } catch {
                    currentX += fontSizePt * 0.5;
                }
            }

        } else {
            try {
                page.drawText(line, {
                    x: currentX,
                    y: currentY,
                    size: fontSizePt,
                    font,
                    color,
                    rotate: degrees(0)
                });
            } catch (e) { console.warn(e); }
        }

        currentY -= lineHeightPt;
    }

    // 6. Restore Graphics State
    page.pushOperators(popGraphicsState());
}
