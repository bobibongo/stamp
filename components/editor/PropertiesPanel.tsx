'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import * as fabric from 'fabric';
import {
    AVAILABLE_FONTS,
    PX_PER_MM,
    DEFAULT_SIZE,
    debounce,
    alignObject,
    resetProportions,
    bringToFront,
    sendToBack,
    deleteSelected,
    pxToPt,
    ptToPx,
    fitObjectToCanvas,
    fitObjectToWidth,
    fitObjectToHeight,
    splitTextByLines,
    addText,
    setTextAlignWithOrigin,
    centerObjectH,
    centerObjectV,
    alignObjectToEdge,
} from '@/lib/canvas-logic';
import { GusImport } from './GusImport';
import {
    Ruler,
    Type as TypeIcon,
    Square,
    AlertTriangle,
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Maximize,
    ArrowUpToLine,
    ArrowDownToLine,
    ArrowLeftToLine,
    ArrowRightToLine,
    MoveHorizontal,
    MoveVertical,
    Trash2,
    RotateCcw,
    X,
    Split,
    LayoutTemplate,
    StretchHorizontal,
    StretchVertical,
    Maximize2,
    Grid3X3,
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    AlignHorizontalJustifyCenter,
    AlignVerticalJustifyCenter,
} from 'lucide-react';

interface PropertiesPanelProps {
    selectedObject: fabric.FabricObject | null;
    canvas: fabric.Canvas | null;
    theme: 'light' | 'dark';
    refreshKey: number;
    isMobile: boolean;
    isOpen: boolean;
    onClose: () => void;
}

export default function PropertiesPanel({
    selectedObject,
    canvas,
    theme,
    refreshKey,
    isMobile,
    isOpen,
    onClose,
}: PropertiesPanelProps) {
    // ── Stan tekstu ───────────────────────────────────────
    const [fontFamily, setFontFamily] = useState('Arial');
    const [fontSize, setFontSize] = useState(14);
    const [charSpacing, setCharSpacing] = useState(0);
    const [textContent, setTextContent] = useState('');
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [textAlign, setTextAlign] = useState<string>('center');
    const [fontSizeWarning, setFontSizeWarning] = useState(false);
    const [stampDim, setStampDim] = useState({ w: DEFAULT_SIZE.widthMm, h: DEFAULT_SIZE.heightMm });

    // ── Stan ramki ────────────────────────────────────────
    const [strokeWidth, setStrokeWidth] = useState(0.5);

    // ── Sync state from selected object ───────────────────
    useEffect(() => {
        if (!selectedObject) return;

        if (selectedObject.type === 'i-text') {
            const t = selectedObject as fabric.IText;
            setFontFamily(t.fontFamily || 'Arial');
            setFontSize(pxToPt(t.fontSize || 14));
            setCharSpacing(t.charSpacing || 0);
            setTextContent(t.text || '');
            setIsBold(t.fontWeight === 'bold' || t.fontWeight === 700);
            setIsItalic(t.fontStyle === 'italic');
            setIsUnderline(!!t.underline);
            setTextAlign(t.textAlign || 'center');
            setFontSizeWarning(pxToPt(t.fontSize || 14) < 7);
        }

        if ((selectedObject as any).__stampType === 'frame') {
            setStrokeWidth((selectedObject as any).__strokeWidth_mm || 0.5);
        }
        if ((selectedObject as any).__stampType === 'frame') {
            setStrokeWidth((selectedObject as any).__strokeWidth_mm || 0.5);
        }
    }, [selectedObject, refreshKey]);

    // ── Sync stamp dimensions from canvas ─────────────────
    useEffect(() => {
        if (canvas) {
            const w = (canvas as any).__stampWidthMm || DEFAULT_SIZE.widthMm;
            const h = (canvas as any).__stampHeightMm || DEFAULT_SIZE.heightMm;
            setStampDim({ w, h });
        }
    }, [canvas, refreshKey]);

    // ── Debounced canvas render ───────────────────────────
    const debouncedRender = useMemo(
        () =>
            debounce(() => {
                canvas?.renderAll();
            }, 80),
        [canvas]
    );

    // ── Helpers ───────────────────────────────────────────
    const isEditingText = (obj: any): boolean => {
        return obj && obj.type === 'i-text' && obj.isEditing;
    };

    const applyStyle = (key: string, value: any) => {
        if (!canvas || !selectedObject) return;

        if (selectedObject.type === 'i-text') {
            const textObj = selectedObject as fabric.IText;
            // Sprawdź czy jest aktywne zaznaczenie tekstu wewnątrz obiektu
            if (isEditingText(textObj) && textObj.selectionStart !== textObj.selectionEnd) {
                textObj.setSelectionStyles({ [key]: value });
            } else {
                // Jeśli nie ma zaznaczenia tekstu, aplikuj do całego obiektu
                textObj.set(key as any, value);

                // Jeśli zmieniamy font/rozmiar, warto wyczyścić style lokalne, aby całość była spójna
                if (textObj.styles && (key === 'fontFamily' || key === 'fontSize' || key === 'fill' || key === 'fontWeight' || key === 'fontStyle' || key === 'underline')) {
                    const styles = textObj.styles;
                    for (const row in styles) {
                        for (const char in styles[row]) {
                            delete styles[row][char][key];
                        }
                    }
                }
            }
        } else {
            selectedObject.set(key as any, value);
        }

        canvas.renderAll();
    };


    const handleFontFamily = (val: string) => applyStyle('fontFamily', val);

    const handleFontSize = (pt: number) => {
        const px = ptToPx(pt);
        applyStyle('fontSize', px);
    };

    const handleBold = () => {
        if (!selectedObject || selectedObject.type !== 'i-text') return;
        const textObj = selectedObject as fabric.IText;

        // Check current state (rough check based on whole object or selection)
        const current = isEditingText(textObj) && textObj.getSelectionStyles().find(s => s.fontWeight)
            ? (textObj.getSelectionStyles()[0] as any).fontWeight
            : textObj.fontWeight;

        const next = current === 'bold' ? 'normal' : 'bold';
        applyStyle('fontWeight', next);
    };

    const handleItalic = () => {
        if (!selectedObject || selectedObject.type !== 'i-text') return;
        const textObj = selectedObject as fabric.IText;

        // Check current state
        const current = isEditingText(textObj) && textObj.getSelectionStyles().find(s => s.fontStyle)
            ? (textObj.getSelectionStyles()[0] as any).fontStyle
            : textObj.fontStyle;

        const next = current === 'italic' ? 'normal' : 'italic';
        applyStyle('fontStyle', next);
    };

    const handleUnderline = () => {
        if (!selectedObject || selectedObject.type !== 'i-text') return;
        const textObj = selectedObject as fabric.IText;

        // Check current state (underline is boolean in fabric types usually, but let's check)
        // Actually setSelectionStyles works with object.
        const current = isEditingText(textObj) && textObj.getSelectionStyles().find(s => s.underline !== undefined)
            ? (textObj.getSelectionStyles()[0] as any).underline
            : textObj.underline;

        applyStyle('underline', !current);
    };

    // ── Alignment & Formatting ────────────────────────────
    const handleAlignEdge = (edge: 'left' | 'right' | 'top' | 'bottom') => {
        if (!canvas || !selectedObject) return;
        alignObjectToEdge(canvas, selectedObject, edge);
    };

    const handleFit = (mode: 'width' | 'height' | 'contain') => {
        if (!canvas || !selectedObject) return;
        if (mode === 'width') fitObjectToWidth(canvas, selectedObject);
        else if (mode === 'height') fitObjectToHeight(canvas, selectedObject);
        else fitObjectToCanvas(canvas, selectedObject);
    };

    const handleCenterH = () => {
        if (!canvas || !selectedObject) return;
        centerObjectH(canvas, selectedObject);
    };

    const handleCenterV = () => {
        if (!canvas || !selectedObject) return;
        centerObjectV(canvas, selectedObject);
    };

    const handleCenterBoth = () => {
        if (!canvas || !selectedObject) return;
        centerObjectH(canvas, selectedObject);
        centerObjectV(canvas, selectedObject);
    };

    const handleTextAlign = (align: string) => {
        if (!selectedObject || selectedObject.type !== 'i-text') return;
        setTextAlignWithOrigin(selectedObject as fabric.IText, align as any);
        canvas?.renderAll();
    };

    const handleSplit = () => {
        if (!canvas || !selectedObject) return;
        splitTextByLines(canvas, selectedObject);
    };

    const handleStrokeWidth = (width: number) => {
        if (!canvas || !selectedObject) return;
        (selectedObject as any).__strokeWidth_mm = width;
        selectedObject.set('strokeWidth', width * PX_PER_MM);
        setStrokeWidth(width);
        canvas.renderAll();
    };

    const handleBringToFront = () => {
        if (!canvas || !selectedObject) return;
        bringToFront(canvas, selectedObject);
    };

    const handleSendToBack = () => {
        if (!canvas || !selectedObject) return;
        sendToBack(canvas, selectedObject);
    };

    // ── Usuwanie ──────────────────────────────────────────
    const handleDelete = () => {
        if (!canvas) return;
        deleteSelected(canvas);
    };

    // ── GUS Integration ───────────────────────────────────
    const handleGusData = (data: any) => {
        if (!canvas) return;

        // Dekodowanie encji HTML
        const decodeHtml = (html: string) => {
            if (!html) return '';
            const txt = document.createElement('textarea');
            txt.innerHTML = html;
            return txt.value;
        };

        // 1. Nazwa firmy (łamanie > 30 znaków)
        let nazwaRaw = decodeHtml(data.nazwa);
        let nazwaLines = [nazwaRaw];

        if (nazwaRaw.length > 30) {
            // Szukamy spacji najbliżej 30 znaku (wstecz)
            const splitIndex = nazwaRaw.lastIndexOf(' ', 30);
            if (splitIndex !== -1) {
                nazwaLines = [
                    nazwaRaw.substring(0, splitIndex),
                    nazwaRaw.substring(splitIndex + 1)
                ];
            } else {
                // Jeśli brak spacji w pierwszych 30 znakach, szukamy pierwszej możliwej
                const nextSpace = nazwaRaw.indexOf(' ', 30);
                if (nextSpace !== -1) {
                    nazwaLines = [
                        nazwaRaw.substring(0, nextSpace),
                        nazwaRaw.substring(nextSpace + 1)
                    ];
                }
            }
        }

        // 2. Adres (formatowanie i warunkowe łamanie > 50 znaków)
        const ulica = decodeHtml(data.ulica || '');
        const nrDomu = data.nrNieruchomosci || '';
        const nrLok = data.nrLokalu ? '/' + data.nrLokalu : '';
        const kod = data.kodPocztowy || '';
        const miasto = decodeHtml(data.miejscowosc || '');

        const addrPart = `${ulica} ${nrDomu}${nrLok}`;
        const cityPart = `${kod} ${miasto}`;

        let adresLine = '';
        if (addrPart.length < 2 && cityPart.length > 1) {
            // Sam kod i miasto (brak ulicy)
            adresLine = cityPart;
        } else {
            // Pełny adres
            const fullAddr = `${addrPart}, ${cityPart}`;
            // Logika 50 znaków -> nowa linia dla miasta
            // Uwaga: "przecinek" w prompt. "ulica nr, kod miasto"
            if (fullAddr.length > 50) {
                adresLine = `${addrPart},\n${cityPart}`;
            } else {
                adresLine = fullAddr;
            }
        }

        // 3. NIP i REGON
        // Format: "NIP: [nip]   REGON: [regon]" (3 spacje)
        // Cyfry w NIP i REGON: Arial Narrow
        const nipVal = data.nip || '';
        const regonVal = data.regon || '';
        let idsLineRaw = '';
        if (nipVal) idsLineRaw += `NIP: ${nipVal}`;
        if (nipVal && regonVal) idsLineRaw += '   ';
        if (regonVal) idsLineRaw += `REGON: ${regonVal}`;

        // Złożenie wszystkiego
        const finalLines = [
            ...nazwaLines,
            adresLine,
            idsLineRaw
        ].filter(l => l && l.trim() !== '');

        const textObj = addText(canvas, {
            text: finalLines.join('\n'),
            fontFamily: 'Arial', // Domyślna czcionka
            fontSize: 7 // Domyślny rozmiar (zmniejszony, by zmieścić więcej)
        });

        // 4. Stylizacja cyfr w linii NIP/REGON
        const styles: any = {};
        const idsLineIndex = finalLines.findIndex(l => l === idsLineRaw);

        if (idsLineIndex !== -1 && idsLineRaw) {
            styles[idsLineIndex] = {};
            for (let i = 0; i < idsLineRaw.length; i++) {
                const char = idsLineRaw[i];
                if (/\d/.test(char)) {
                    styles[idsLineIndex][i] = { fontFamily: 'Arial Narrow' };
                }
            }
        }

        textObj.set('styles', styles);
        canvas.renderAll();
        canvas.setActiveObject(textObj);
        canvas.renderAll();
    };

    const isText = selectedObject?.type === 'i-text';
    const isFrame = (selectedObject as any)?.__stampType === 'frame';
    const hasSelection = !!selectedObject;

    // ── Styl ──────────────────────────────────────────────
    const dark = theme === 'dark';

    const labelClass = `text-xs font-medium uppercase tracking-wide mb-1.5 block ${dark ? 'text-zinc-500' : 'text-zinc-500'}`;

    const inputClass = `w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors ${dark
        ? 'bg-zinc-700 text-zinc-100 border border-zinc-600 focus:border-indigo-500'
        : 'bg-white text-zinc-800 border border-zinc-300 focus:border-indigo-500'
        }`;

    const toggleBtn = (active: boolean) =>
        `flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 cursor-pointer ${active
            ? 'bg-indigo-500 text-white shadow-md'
            : dark
                ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
        }`;

    const actionBtn = `flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 cursor-pointer ${dark
        ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
        }`;

    const dangerBtn = `flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${dark
        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
        : 'bg-red-50 text-red-500 hover:bg-red-100'
        }`;

    const sectionDivider = `border-t ${dark ? 'border-zinc-800' : 'border-zinc-100'} my-2`;

    const sectionCard = `p-5 rounded-2xl border transition-all ${dark
        ? 'bg-zinc-900 border-zinc-800 shadow-sm'
        : 'bg-white border-zinc-200/60 shadow-sm'
        }`;

    // ── Shared content ────────────────────────────────────
    const panelContent = (
        <div className={`p-5 flex flex-col gap-6 ${isMobile ? 'pb-8' : ''}`}>
            {!hasSelection && (
                <>
                    <div className={sectionCard}>
                        <div className="flex flex-col gap-5">
                            <div>
                                <p className={labelClass}>Wymiary pieczątki</p>
                                <p className={`text-xl font-bold ${dark ? 'text-zinc-100' : 'text-zinc-800'}`}>
                                    {stampDim.w} × {stampDim.h} mm
                                </p>
                            </div>
                            <div>
                                <p className={labelClass}>Typ</p>
                                <p className={`text-sm font-medium ${dark ? 'text-zinc-300' : 'text-zinc-600'}`}>
                                    Prostokąt
                                </p>
                            </div>
                            <div className={`rounded-xl p-4 text-xs leading-relaxed ${dark ? 'bg-zinc-800/50 text-zinc-400' : 'bg-zinc-50 text-zinc-500'}`}>
                                Kliknij &quot;Tekst&quot; lub &quot;Ramka&quot; na pasku narzędzi, aby dodać element do pieczątki.
                            </div>
                        </div>
                    </div>
                    {/* GUS Import */}
                    <GusImport onDataLoaded={handleGusData} dark={dark} />
                </>
            )}

            {/* ═══════════════════════════════════════════════
                JEST ZAZNACZENIE
             ═══════════════════════════════════════════════ */}
            {hasSelection && (
                <>
                    {/* ── Pozycjonowanie i Wyrównanie (New Section) ──────── */}
                    <div className={sectionCard}>
                        <p className={labelClass}>Rozmieszczenie</p>

                        {/* 1. Main Action: Fit & Center */}
                        <button
                            onClick={() => handleFit('contain')}
                            className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 mb-4 font-medium transition-colors shadow-sm"
                            title="Dopasuj rozmiar i wyśrodkuj (70% przypadków)"
                        >
                            <Maximize className="w-5 h-5" />
                            <span>Dopasuj i wyśrodkuj</span>
                        </button>

                        {/* 2. Wyrównanie (Alignment) - Neighbors only */}
                        <div className="mb-4">
                            <p className="text-[10px] uppercase text-zinc-400 font-semibold mb-2 ml-1">Wyrównanie</p>
                            <div className="flex gap-2">
                                <button onClick={() => handleAlignEdge('left')} className={`${actionBtn} flex-1`} title="Do lewej">
                                    <ArrowLeftToLine className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleAlignEdge('top')} className={`${actionBtn} flex-1`} title="Do góry">
                                    <ArrowUpToLine className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleAlignEdge('bottom')} className={`${actionBtn} flex-1`} title="Do dołu">
                                    <ArrowDownToLine className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleAlignEdge('right')} className={`${actionBtn} flex-1`} title="Do prawej">
                                    <ArrowRightToLine className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* 3. Środkowanie (Centering) */}
                        <div className="mb-4">
                            <p className="text-[10px] uppercase text-zinc-400 font-semibold mb-2 ml-1">Środkowanie</p>
                            <div className="flex gap-2">
                                <button onClick={handleCenterH} className={`${actionBtn} flex-1`} title="Centruj poziomo">
                                    <AlignHorizontalJustifyCenter className="w-4 h-4" />
                                </button>
                                <button onClick={handleCenterV} className={`${actionBtn} flex-1`} title="Centruj pionowo">
                                    <AlignVerticalJustifyCenter className="w-4 h-4 rotate-90" />
                                </button>
                                <button onClick={handleCenterBoth} className={`${actionBtn} flex-1 bg-zinc-200 dark:bg-zinc-700`} title="Centruj całkowicie">
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* 4. Dopasowanie (Fitting) */}
                        <div>
                            <p className="text-[10px] uppercase text-zinc-400 font-semibold mb-2 ml-1">Dopasowanie</p>
                            <div className="flex gap-2">
                                <button onClick={() => handleFit('width')} className={`${actionBtn} flex-1`} title="Dopasuj szerokość">
                                    <StretchHorizontal className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleFit('height')} className={`${actionBtn} flex-1`} title="Dopasuj wysokość">
                                    <StretchVertical className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── Formatowanie tekstu ────────────────────── */}
                    {isText && (
                        <div className={sectionCard}>
                            <p className={labelClass}>Formatowanie tekstu</p>
                            <div className="flex flex-col gap-4">
                                {/* Font Family */}
                                <div className="relative">
                                    <select
                                        className={inputClass}
                                        value={(selectedObject as fabric.IText).fontFamily}
                                        onChange={(e) => handleFontFamily(e.target.value)}
                                    >
                                        {AVAILABLE_FONTS.map((font) => (
                                            <option key={font} value={font} style={{ fontFamily: font }}>
                                                {font}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Font Size & Styles */}
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        className={`${inputClass} w-20 text-center`}
                                        value={Math.round(pxToPt((selectedObject as fabric.IText).fontSize || 10))}
                                        onChange={(e) => handleFontSize(Number(e.target.value))}
                                    />
                                    <div className="flex gap-1 flex-1 justify-end">
                                        <button onClick={handleBold} className={toggleBtn((selectedObject as fabric.IText).fontWeight === 'bold')}>
                                            <Bold className="w-4 h-4" />
                                        </button>
                                        <button onClick={handleItalic} className={toggleBtn((selectedObject as fabric.IText).fontStyle === 'italic')}>
                                            <Italic className="w-4 h-4" />
                                        </button>
                                        <button onClick={handleUnderline} className={toggleBtn(!!(selectedObject as fabric.IText).underline)}>
                                            <Underline className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Text Align */}
                                <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                                    <button onClick={() => handleTextAlign('left')} className={`${toggleBtn((selectedObject as fabric.IText).textAlign === 'left')} flex-1`}>
                                        <AlignLeft className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleTextAlign('center')} className={`${toggleBtn((selectedObject as fabric.IText).textAlign === 'center')} flex-1`}>
                                        <AlignCenter className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleTextAlign('right')} className={`${toggleBtn((selectedObject as fabric.IText).textAlign === 'right')} flex-1`}>
                                        <AlignRight className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleTextAlign('justify')} className={`${toggleBtn((selectedObject as fabric.IText).textAlign === 'justify')} flex-1`}>
                                        <AlignJustify className="w-4 h-4" />
                                    </button>
                                </div>

                                <button
                                    onClick={handleSplit}
                                    className={actionBtn + " w-full mt-2 gap-2"}
                                    title="Rozdziel linie na osobne obiekty"
                                >
                                    <Split className="w-4 h-4" />
                                    <span className="text-xs font-medium">Rozdziel linie</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Ramka ──────────────────────────────────── */}
                    {isFrame && (
                        <div className={sectionCard}>
                            <p className={labelClass}>Grubość ramki</p>
                            <div className="flex gap-2">
                                {[0.2, 0.5, 0.8, 1.0].map((mm) => (
                                    <button
                                        key={mm}
                                        onClick={() => handleStrokeWidth(mm)}
                                        className={`${toggleBtn((selectedObject as any).__strokeWidth_mm === mm)} flex-1 text-xs`}
                                    >
                                        {mm}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Warstwy i Akcje ────────────────────────── */}
                    <div className={sectionCard}>
                        <p className={labelClass}>Warstwy i akcje</p>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={handleBringToFront} className={actionBtn} title="Przesuń na wierzch">
                                <span className="text-xs">Na wierzch</span>
                            </button>
                            <button onClick={handleSendToBack} className={actionBtn} title="Przesuń na spód">
                                <span className="text-xs">Na spód</span>
                            </button>
                        </div>
                        <div className={sectionDivider} />
                        <button onClick={handleDelete} className={dangerBtn}>
                            <Trash2 className="w-4 h-4" />
                            <span>Usuń element</span>
                        </button>
                    </div>
                </>
            )}
        </div >
    );

    // ── Header content ────────────────────────────────────
    const headerTitle = isText ? (
        <span className="flex items-center gap-2">
            <TypeIcon size={14} /> Właściwości tekstu
        </span>
    ) : isFrame ? (
        <span className="flex items-center gap-2">
            <Square size={14} /> Właściwości ramki
        </span>
    ) : (
        <span className="flex items-center gap-2">
            <Ruler size={14} /> Obszar roboczy
        </span>
    );

    // ── Mobile: Bottom Sheet ────────────────────────────
    if (isMobile) {
        return (
            <div
                className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out rounded-t-3xl shadow-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'
                    } ${dark ? 'bg-zinc-950 border-t border-zinc-800' : 'bg-zinc-50 border-t border-zinc-200'
                    }`}
                style={{ maxHeight: '70vh' }}
            >
                {/* Handle bar + header + close */}
                <div className={`flex items-center justify-between px-4 py-3 border-b ${dark ? 'border-zinc-700' : 'border-zinc-200'}`}>
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-1 rounded-full ${dark ? 'bg-zinc-600' : 'bg-zinc-300'}`} />
                        <h2 className={`text-sm font-semibold ${dark ? 'text-zinc-200' : 'text-zinc-700'}`}>
                            {headerTitle}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg ${dark ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
                            }`}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 52px)' }}>
                    {panelContent}
                </div>
            </div>
        );
    }

    // ── Desktop: Sidebar ────────────────────────────────
    return (
        <div
            className={`w-96 border-l flex flex-col overflow-y-auto transition-colors duration-300 ${dark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                }`}
        >
            {/* ── Header ─────────────────────────────────────── */}
            <div
                className={`px-5 py-4 border-b ${dark ? 'border-zinc-700' : 'border-zinc-200'
                    }`}
            >
                <h2
                    className={`text-sm font-semibold ${dark ? 'text-zinc-200' : 'text-zinc-700'
                        }`}
                >
                    {headerTitle}
                </h2>
            </div>

            {panelContent}
        </div>
    );
}
