import * as fabric from 'fabric';
import { PDFDocument, rgb, degrees, StandardFonts, pushGraphicsState, popGraphicsState, concatTransformationMatrix } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
    STAMP_W_MM,
    STAMP_H_MM,
    STAMP_W_PX,
    STAMP_H_PX,
    WORK_AREA_LEFT,
    WORK_AREA_TOP,
    pxToPt as canvasPxToPt
} from './canvas-logic';

// Helpery
const MM_TO_PT = 72 / 25.4;

function pxToMm(px: number): number {
    return px / 3.78; // 1mm = 3.78px (from canvas-logic defines)
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
const FONT_MAP: Record<string, { regular: string; bold?: string; italic?: string; boldItalic?: string }> = {
    'Arimo': { regular: '/fonts/arimo/Arimo-Regular.ttf' },
    'Tinos': { regular: '/fonts/tinos/Tinos-Regular.ttf', bold: '/fonts/tinos/Tinos-Bold.ttf' },
    'Roboto': { regular: '/fonts/roboto/Roboto-Regular.ttf' },
    'Montserrat': { regular: '/fonts/Inter,Montserrat/Montserrat/static/Montserrat-Regular.ttf' },
    'Inter': {
        regular: '/fonts/Inter,Montserrat/Inter/static/Inter_18pt-Regular.ttf',
        bold: '/fonts/Inter,Montserrat/Inter/static/Inter_18pt-Bold.ttf'
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

    const pageW = STAMP_W_MM * MM_TO_PT;
    const pageH = STAMP_H_MM * MM_TO_PT;
    const page = pdfDoc.addPage([pageW, pageH]);

    const objects = getUserObjects(canvas);
    const usedFontFamilies = new Set<string>();
    for (const obj of objects) {
        if (isTextObject(obj)) {
            const t = obj as fabric.IText;
            usedFontFamilies.add(t.fontFamily || 'Inter');
        }
    }

    const embeddedFonts: Record<string, any> = {};
    const fallbackFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const family of usedFontFamilies) {
        const mapping = FONT_MAP[family];
        if (!mapping) {
            console.warn(`Font "${family}" nie ma mapowania TTF, użyję Helvetica jako fallback`);
            embeddedFonts[family] = fallbackFont;
            continue;
        }
        try {
            const fontBytes = await fetchFontBytes(mapping.regular);
            // Wyłącz subsetting, aby uniknąć błędów brakujących glifów i problemów z mapowaniem (Bugfix #1)
            const embedded = await pdfDoc.embedFont(fontBytes, { subset: false });
            embeddedFonts[family] = embedded;
        } catch (e) {
            console.error(`Błąd osadzania fontu "${family}":`, e);
            embeddedFonts[family] = fallbackFont;
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

    const pageW = STAMP_W_MM * MM_TO_PT;
    const pageH = STAMP_H_MM * MM_TO_PT;
    const page = pdfDoc.addPage([pageW, pageH]);

    // 1. Zapisz stan widoku (viewport)
    const originalVpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const originalSelection = canvas.selection;
    const originalBg = canvas.backgroundColor; // Zapisz tło

    // 2. Ukryj obiekty systemowe (linie pomocnicze, safe zone, border)
    //    oraz zaznaczenie (selection)
    canvas.discardActiveObject();
    canvas.selection = false; // Blokada zaznaczania
    canvas.backgroundColor = ''; // Usuń tło (przezroczystość) na czas eksportu

    const objectsToHide: fabric.FabricObject[] = [];
    canvas.getObjects().forEach((obj) => {
        if ((obj as any).__systemObject || (obj as any).excludeFromExport) {
            if (obj.visible) {
                obj.visible = false;
                objectsToHide.push(obj);
            }
        }
    });

    // Wymuś odświeżenie przed zrzutem
    canvas.renderAll();

    // 3. Rasteryzacja canvas w SUPER wysokiej rozdzielczości (1000 DPI)
    // 1000 DPI: STAMP_W_MM * (1000/25.4) px ≈ 2362 px szerokości
    const targetDPI = 1000;
    const targetWidthPx = Math.round(STAMP_W_MM * (targetDPI / 25.4));
    const multiplier = targetWidthPx / STAMP_W_PX;

    // Ustaw viewport na 1:1, aby zrzut był poprawny (czasem multiplier wariuje przy zoomie)
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    const dataUrl = canvas.toDataURL({
        format: 'png',
        multiplier,
        left: WORK_AREA_LEFT,
        top: WORK_AREA_TOP,
        width: STAMP_W_PX,
        height: STAMP_H_PX,
    });

    // 4. Przywróć stan (widoczność i viewport)
    objectsToHide.forEach((obj) => {
        obj.visible = true;
    });

    // Przywróć viewport (ważne! naprawia "psucie się układu")
    try {
        // Przywracamy transformację
        canvas.setViewportTransform(originalVpt);
    } catch (e) {
        console.error('Błąd przywracania viewportu:', e);
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    }

    canvas.selection = originalSelection;
    canvas.backgroundColor = originalBg; // Przywróć tło
    canvas.requestRenderAll();

    // Konwersja dataURL → bytes
    const base64 = dataUrl.split(',')[1];
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

export async function downloadPDF(canvas: fabric.Canvas) {
    try {
        const blob = await exportPDF(canvas);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pieczatka.pdf';
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
        a.download = 'pieczatka_flat.pdf';
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

    // Pozycja
    // rect.left/top is origin.
    // bounding rect logic...
    // Fabric rect with stroke is drawn centered on path?
    // Assuming simple rect for now.

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
        color: undefined, // No fill for frames usually
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

    const fontFamily = textObj.fontFamily || 'Inter';
    const font = embeddedFonts[fontFamily] || fallbackFont;

    // Use unscaled font size for PDF (scaling handled by CTM)
    const fontSize = textObj.fontSize || 14;
    const fontSizePt = pxToPt(fontSize);

    // Color
    const fill = (textObj.fill as string) || '#000000';
    const color = hexToRgb(fill);

    // 1. Calculate Center Position in PDF coordinates
    const cxPx = textObj.left || 0;
    const cyPx = textObj.top || 0; // Fabric Y

    // Note: Fabric's left/top depend on origin.
    // If we assume origin is center, then left/top IS center.
    // If not, we should use getCenterPoint().
    // userObjects usually have originX/Y set? Step 208 logic used getBoundingRect.
    // But matrix transform works best with center.
    // Let's assume originX='center', originY='center' as per stamp app logic.
    // Even if not, converting anchor to PDF coords (bottom-left origin) matches.

    // Convert canvas coords to PDF page coords
    // Canvas (0,0) is top-left.
    // Our Work Area starts at WORK_AREA_LEFT, WORK_AREA_TOP.
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
