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
    splitTextByLines,
} from '@/lib/canvas-logic';
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
    Trash2,
    RotateCcw,
    X,
    Split,
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

    const updateProp = useCallback(
        (prop: string, value: any) => {
            if (!selectedObject || !canvas) return;

            // Obsługa mieszanego formatowania dla IText (jeśli jest zaznaczenie tekstu)
            if (selectedObject.type === 'i-text') {
                const t = selectedObject as fabric.IText;
                if (t.selectionStart !== undefined && t.selectionEnd !== undefined && t.selectionStart !== t.selectionEnd) {
                    t.setSelectionStyles({ [prop]: value });
                } else {
                    t.set(prop, value);
                }
            } else {
                (selectedObject as any).set(prop, value);
            }

            debouncedRender();
        },
        [selectedObject, canvas, debouncedRender]
    );

    // ── Handlery tekstu ───────────────────────────────────
    const handleFontChange = (val: string) => {
        setFontFamily(val);
        updateProp('fontFamily', val);
    };

    const handleFontSizeChange = (val: number) => {
        setFontSize(val);
        setFontSizeWarning(val < 7);
        updateProp('fontSize', ptToPx(val));
    };

    const handleCharSpacingChange = (val: number) => {
        setCharSpacing(val);
        updateProp('charSpacing', val);
    };

    const handleTextContentChange = (val: string) => {
        setTextContent(val);
        updateProp('text', val);
    };

    const toggleBold = () => {
        const next = !isBold;
        setIsBold(next);
        updateProp('fontWeight', next ? 'bold' : 'normal');
    };

    const toggleItalic = () => {
        const next = !isItalic;
        setIsItalic(next);
        updateProp('fontStyle', next ? 'italic' : 'normal');
    };

    const toggleUnderline = () => {
        const next = !isUnderline;
        setIsUnderline(next);
        updateProp('underline', next);
    };

    const handleTextAlignChange = (align: string) => {
        setTextAlign(align);
        updateProp('textAlign', align);
    };

    // ── Handler ramki ─────────────────────────────────────
    const handleStrokeWidthChange = (val: number) => {
        setStrokeWidth(val);
        if (selectedObject && canvas) {
            const pxVal = val * PX_PER_MM;
            selectedObject.set('strokeWidth', pxVal);
            (selectedObject as any).__strokeWidth_mm = val;
            debouncedRender();
        }
    };

    // ── Pozycjonowanie ────────────────────────────────────
    const handleAlign = (v: 'top' | 'middle' | 'bottom', h: 'left' | 'center' | 'right') => {
        if (canvas && selectedObject) alignObject(canvas, selectedObject, v, h);
    };

    const handleResetProportions = () => {
        if (canvas && selectedObject) resetProportions(canvas, selectedObject);
    };

    const handleFitToCanvas = () => {
        if (canvas && selectedObject) fitObjectToCanvas(canvas, selectedObject);
    };

    const handleSplitLines = () => {
        if (canvas && selectedObject) splitTextByLines(canvas, selectedObject);
    };

    // ── Warstwy ───────────────────────────────────────────
    const handleBringToFront = () => {
        if (canvas && selectedObject) bringToFront(canvas, selectedObject);
    };
    const handleSendToBack = () => {
        if (canvas && selectedObject) sendToBack(canvas, selectedObject);
    };

    // ── Usuwanie ──────────────────────────────────────────
    const handleDelete = () => {
        if (!canvas) return;
        deleteSelected(canvas);
    };

    const isText = selectedObject?.type === 'i-text';
    const isFrame = (selectedObject as any)?.__stampType === 'frame';
    const hasSelection = !!selectedObject;

    // ── Styl ──────────────────────────────────────────────
    const dark = theme === 'dark';

    const labelClass = `text-xs font-medium uppercase tracking-wide mb-1.5 block ${dark ? 'text-zinc-400' : 'text-zinc-500'
        }`;

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
            {/* ── Brak zaznaczenia ─────────────────────────── */}
            {!hasSelection && (
                <div className={sectionCard}>
                    <div className="flex flex-col gap-5">
                        <div>
                            <p className={labelClass}>Wymiary pieczątki</p>
                            <p
                                className={`text-xl font-bold ${dark ? 'text-zinc-100' : 'text-zinc-800'
                                    }`}
                            >
                                {stampDim.w} × {stampDim.h} mm
                            </p>
                        </div>
                        <div>
                            <p className={labelClass}>Typ</p>
                            <p
                                className={`text-sm font-medium ${dark ? 'text-zinc-300' : 'text-zinc-600'
                                    }`}
                            >
                                Prostokąt
                            </p>
                        </div>
                        <div
                            className={`rounded-xl p-4 text-xs leading-relaxed ${dark ? 'bg-zinc-800/50 text-zinc-400' : 'bg-zinc-50 text-zinc-500'
                                }`}
                        >
                            Kliknij &quot;Tekst&quot; lub &quot;Ramka&quot; na pasku narzędzi, aby
                            dodać element do pieczątki.
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════
                PANEL TEKSTU
               ═══════════════════════════════════════════════ */}
            {isText && (
                <div className={sectionCard}>
                    <div className="flex flex-col gap-6">
                        {/* Treść */}
                        <div>
                            <label className={labelClass}>Treść</label>
                            <textarea
                                className={`${inputClass} resize-none h-24 text-base`}
                                value={textContent}
                                onChange={(e) => handleTextContentChange(e.target.value)}
                            />
                            {/* Split Lines Button */}
                            <button
                                onClick={handleSplitLines}
                                className={`mt-2 flex items-center justify-center gap-2 w-full py-1.5 rounded-lg text-xs font-medium transition-colors ${dark ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'}`}
                                title="Rozdziel każdą linię tekstu na osobny obiekt"
                            >
                                <Split size={14} /> Rozdziel linie (Enter)
                            </button>
                        </div>

                        {/* Czcionka i Rozmiar */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className={labelClass}>Czcionka</label>
                                <select
                                    className={inputClass}
                                    value={fontFamily}
                                    onChange={(e) => handleFontChange(e.target.value)}
                                >
                                    {AVAILABLE_FONTS.map((f) => (
                                        <option key={f} value={f} style={{ fontFamily: f }}>
                                            {f}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Rozmiar (pt)</label>
                                <input
                                    type="number"
                                    className={inputClass}
                                    value={fontSize}
                                    min={4}
                                    max={72}
                                    step={1}
                                    onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Kerning</label>
                                <input
                                    type="number"
                                    className={inputClass}
                                    value={charSpacing}
                                    step={10}
                                    onChange={(e) => handleCharSpacingChange(Number(e.target.value))}
                                />
                            </div>
                        </div>

                        {fontSizeWarning && (
                            <div className="flex items-center gap-2 text-xs font-medium text-amber-500 bg-amber-500/10 p-2 rounded-lg">
                                <AlertTriangle size={14} />
                                <span>Tekst &lt;7pt – ryzyko nieczytelności</span>
                            </div>
                        )}

                        <div className={sectionDivider} />

                        {/* Style i Wyrównanie w jednej linii */}
                        <div className="flex items-center justify-between">
                            <div>
                                <label className={labelClass}>Styl</label>
                                <div className="flex items-center gap-1">
                                    <button onClick={toggleBold} className={toggleBtn(isBold)} title="Pogrubienie">
                                        <Bold size={16} />
                                    </button>
                                    <button onClick={toggleItalic} className={toggleBtn(isItalic)} title="Pochylenie">
                                        <Italic size={16} />
                                    </button>
                                    <button onClick={toggleUnderline} className={toggleBtn(isUnderline)} title="Podkreślenie">
                                        <Underline size={16} />
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Wyrównanie</label>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => handleTextAlignChange('left')} className={toggleBtn(textAlign === 'left')} title="Do lewej"><AlignLeft size={16} /></button>
                                    <button onClick={() => handleTextAlignChange('center')} className={toggleBtn(textAlign === 'center')} title="Wyśrodkuj"><AlignCenter size={16} /></button>
                                    <button onClick={() => handleTextAlignChange('right')} className={toggleBtn(textAlign === 'right')} title="Do prawej"><AlignRight size={16} /></button>
                                    <button onClick={() => handleTextAlignChange('justify')} className={toggleBtn(textAlign === 'justify')} title="Wyjustuj"><AlignJustify size={16} /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════
                PANEL RAMKI
               ═══════════════════════════════════════════════ */}
            {isFrame && (
                <div className={sectionCard}>
                    <label className={labelClass}>Grubość linii (mm)</label>
                    <input
                        type="number"
                        className={inputClass}
                        value={strokeWidth}
                        min={0.1}
                        max={5}
                        step={0.1}
                        onChange={(e) => handleStrokeWidthChange(Number(e.target.value))}
                    />
                </div>
            )}

            {/* ═══════════════════════════════════════════════
                WSPÓLNE: POZYCJONOWANIE + WARSTWY + USUWANIE
               ═══════════════════════════════════════════════ */}
            {hasSelection && (
                <>
                    <div className={sectionCard}>
                        {/* Pozycjonowanie – siatka 3×3 */}
                        <div>
                            <label className={labelClass}>Pozycjonowanie</label>
                            <div className="flex gap-4">
                                <div className="grid grid-cols-3 gap-1.5 w-fit">
                                    {(['top', 'middle', 'bottom'] as const).map((v) =>
                                        (['left', 'center', 'right'] as const).map((h) => {
                                            const posX = h === 'left' ? 4 : h === 'center' ? 12 : 20;
                                            const posY = v === 'top' ? 4 : v === 'middle' ? 12 : 20;
                                            const label = `${v === 'top' ? 'Góra' : v === 'middle' ? 'Środek' : 'Dół'} ${h === 'left' ? 'lewo' : h === 'center' ? 'środek' : 'prawo'}`;
                                            return (
                                                <button
                                                    key={`${v}-${h}`}
                                                    onClick={() => handleAlign(v, h)}
                                                    className={actionBtn}
                                                    title={label}
                                                >
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                        <rect x="2" y="2" width="20" height="20" rx="2" opacity="0.3" />
                                                        <circle cx={posX} cy={posY} r="3" fill="currentColor" stroke="none" />
                                                    </svg>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 flex-1">
                                    <button
                                        onClick={handleFitToCanvas}
                                        className={`flex items-center gap-2 w-full py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${dark
                                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                            }`}
                                    >
                                        <Maximize size={14} />
                                        Dopasuj i centruj
                                    </button>

                                    {isText && (selectedObject as any)?.scaleX !== 1 && (
                                        <button
                                            onClick={handleResetProportions}
                                            className={`flex items-center gap-2 w-full py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${dark
                                                ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                                }`}
                                        >
                                            <RotateCcw size={14} />
                                            Reset proporcji
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className={sectionDivider} />

                    </div>

                    <div className={sectionCard}>
                        {/* Usuwanie */}
                        <button onClick={handleDelete} className={dangerBtn}>
                            <Trash2 size={16} />
                            Usuń zaznaczony element
                        </button>
                    </div>
                </>
            )}
        </div>
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
