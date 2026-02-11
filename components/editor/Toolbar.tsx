'use client';

import { useState } from 'react';
import { Type, Square, Sun, Moon, Download, Grid3x3, Magnet, Menu, X, Undo2, Redo2, FileText, Image, ChevronDown } from 'lucide-react';
import * as fabric from 'fabric';
import { addText, addRectFrame, saveState, STAMP_SIZES, StampSize } from '@/lib/canvas-logic';
import { downloadPDF, downloadPDFFlattened } from '@/lib/export-logic';

interface ToolbarProps {
    canvas: fabric.Canvas | null;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    showGrid: boolean;
    onToggleGrid: () => void;
    snapToGrid: boolean;
    onToggleSnap: () => void;
    isMobile: boolean;
    onUndo: () => void;
    onRedo: () => void;
    activeSize: StampSize;
    onSizeChange: (size: StampSize) => void;
}

export default function Toolbar({
    canvas,
    theme,
    onToggleTheme,
    showGrid,
    onToggleGrid,
    snapToGrid,
    onToggleSnap,
    isMobile,
    onUndo,
    onRedo,
    activeSize,
    onSizeChange,
}: ToolbarProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [sizeMenuOpen, setSizeMenuOpen] = useState(false);

    const handleAddText = () => {
        if (!canvas) return;
        addText(canvas);
        saveState(canvas);
        setMenuOpen(false);
    };

    const handleAddFrame = () => {
        if (!canvas) return;
        addRectFrame(canvas);
        saveState(canvas);
        setMenuOpen(false);
    };

    const handleExportPDF = async () => {
        if (!canvas) return;
        setMenuOpen(false);
        await downloadPDF(canvas, activeSize);
    };

    const handleExportPDFFlattened = async () => {
        if (!canvas) return;
        setMenuOpen(false);
        // Do flattened też przekazujemy rozmiar, jeśli funkcja tego wymaga (zaktualizowaliśmy ją)
        // Sprawdźmy export-logic.ts - tak, canvas ma wymiary, ale warto być spójnym.
        // Wg mojej zmiany exportPDFFlattened bierze wymiary z canvasa (.__stampWidthMm),
        // które są aktualizowane przez updateStampSize. Więc argument size w funkcji download...
        // W export-logic.ts: exportPDFFlattened(canvas).
        // A downloadPDFFlattened wywołuje exportPDFFlattened.
        // Więc jest OK.
        await downloadPDFFlattened(canvas);
    };

    const dark = theme === 'dark';
    const bgClass = dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200';
    const btnBase = "flex items-center justify-center p-2 rounded-lg transition-all duration-200";
    const btnIcon = dark ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100";
    const btnActive = "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30";
    const btnPrimary = dark ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700" : "bg-zinc-100 text-zinc-900 hover:bg-zinc-200";
    const divider = `w-px h-6 mx-1 ${dark ? 'bg-zinc-800' : 'bg-zinc-200'}`;

    // Mobile layout
    if (isMobile) {
        return (
            <>
                <div className={`fixed bottom-0 left-0 right-0 p-4 border-t z-50 ${bgClass} pb-safe`}>
                    <div className="flex justify-between items-center max-w-lg mx-auto">
                        <button onClick={onUndo} className={btnIcon}>
                            <Undo2 size={24} />
                        </button>
                        <button onClick={onRedo} className={btnIcon}>
                            <Redo2 size={24} />
                        </button>

                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className={`${btnBase} ${btnActive} w-12 h-12 rounded-full !p-0`}
                        >
                            {menuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>

                        <button
                            onClick={onToggleGrid}
                            className={`${btnBase} ${showGrid ? "text-indigo-500 bg-indigo-500/10" : btnIcon}`}
                        >
                            <Grid3x3 size={24} />
                        </button>

                        <button onClick={handleExportPDF} className={btnIcon}>
                            <Download size={24} />
                        </button>
                    </div>
                </div>

                {/* Mobile Menu Overlay */}
                {menuOpen && (
                    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
                        <div
                            className={`absolute bottom-[80px] left-4 right-4 rounded-xl p-2 shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-200 border ${dark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                                }`}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Mobile Size Selector */}
                            <div className="flex flex-col gap-1 mb-2">
                                <span className={`text-xs font-medium px-2 py-1 ${dark ? 'text-zinc-500' : 'text-zinc-400'}`}>Rozmiar</span>
                                <div className="grid grid-cols-1 gap-1">
                                    {STAMP_SIZES.map((s) => (
                                        <button
                                            key={s.label}
                                            onClick={() => { onSizeChange(s); setMenuOpen(false); }}
                                            className={`${btnBase} ${activeSize.label === s.label
                                                ? (dark ? 'bg-zinc-800 text-zinc-100' : 'bg-zinc-100 text-zinc-900')
                                                : btnIcon
                                                } justify-start text-sm py-1.5`}
                                        >
                                            <span className="w-4 h-4 mr-2 border rounded-sm flex items-center justify-center">
                                                {activeSize.label === s.label && <div className="w-2 h-2 bg-current rounded-[1px]" />}
                                            </span>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={`h-px my-1 ${dark ? 'bg-zinc-800' : 'bg-zinc-200'}`} />

                            <div className="grid grid-cols-1 gap-1">
                                <button onClick={handleAddText} className={`${btnBase} ${btnPrimary} w-full justify-start`}>
                                    <Type size={16} className="mr-2" />
                                    <span>Dodaj tekst</span>
                                </button>
                                <button onClick={handleAddFrame} className={`${btnBase} ${btnPrimary} w-full justify-start`}>
                                    <Square size={16} className="mr-2" />
                                    <span>Dodaj ramkę</span>
                                </button>
                            </div>

                            <div className={`h-px my-2 ${dark ? 'bg-zinc-800' : 'bg-zinc-200'}`} />

                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={onToggleSnap} className={`${btnBase} ${snapToGrid ? btnActive : btnPrimary} justify-center`}>
                                    <Magnet size={16} className="mr-2" />
                                    <span>Przyciąganie</span>
                                </button>
                                <button onClick={onToggleTheme} className={`${btnBase} ${btnPrimary} justify-center`}>
                                    {dark ? <Sun size={16} className="mr-2" /> : <Moon size={16} className="mr-2" />}
                                    <span>{dark ? 'Jasny' : 'Ciemny'}</span>
                                </button>
                            </div>

                            <div className={`h-px my-2 ${dark ? 'bg-zinc-800' : 'bg-zinc-200'}`} />

                            <button onClick={handleExportPDFFlattened} className={`${btnBase} ${btnPrimary} w-full justify-start`}>
                                <Image size={16} className="mr-2" />
                                <span>Eksportuj jako obraz (PNG/PDF)</span>
                            </button>
                        </div>
                    </div>
                )}
            </>
        );
    }

    // Desktop Layout
    return (
        <div className={`h-14 border-b flex items-center justify-between px-4 sticky top-0 z-30 ${bgClass}`}>
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 mr-4">
                    <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
                        <FileText className="text-white" size={20} />
                    </div>
                    <h1 className={`font-bold text-lg tracking-tight ${dark ? 'text-zinc-100' : 'text-zinc-900'}`}>
                        StampMaster
                    </h1>
                </div>

                <div className={divider} />

                <button onClick={onUndo} className={btnIcon} title="Cofnij (Ctrl+Z)">
                    <Undo2 size={20} />
                </button>
                <button onClick={onRedo} className={btnIcon} title="Ponów (Ctrl+Y)">
                    <Redo2 size={20} />
                </button>
            </div>

            {/* Narzędzia */}
            <div className="flex items-center gap-2">

                {/* Size Selector Desktop */}
                <div className="relative">
                    <button
                        onClick={() => setSizeMenuOpen(!sizeMenuOpen)}
                        className={`${btnBase} ${btnPrimary} min-w-[140px] justify-between text-sm px-3`}
                    >
                        <span>{activeSize.label}</span>
                        <ChevronDown size={14} className="opacity-50 ml-2" />
                    </button>

                    {sizeMenuOpen && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setSizeMenuOpen(false)} />
                            <div className={`absolute top-full left-0 mt-1 w-full min-w-[140px] rounded-lg shadow-xl overflow-hidden z-20 border py-1 ${dark ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'
                                }`}>
                                {STAMP_SIZES.map((s) => (
                                    <button
                                        key={s.label}
                                        onClick={() => { onSizeChange(s); setSizeMenuOpen(false); }}
                                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center ${activeSize.label === s.label
                                                ? (dark ? 'bg-zinc-700 text-white' : 'bg-zinc-100 text-zinc-900')
                                                : (dark ? 'text-zinc-300 hover:bg-zinc-700' : 'text-zinc-700 hover:bg-zinc-50')
                                            }`}
                                    >
                                        <span className={`w-1.5 h-1.5 rounded-full mr-2 ${activeSize.label === s.label ? 'bg-indigo-500' : 'bg-transparent'}`} />
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                <div className={divider} />

                <button onClick={handleAddText} className={`${btnBase} ${btnPrimary}`}>
                    <Type size={18} className="mr-2" />
                    <span className="text-sm font-medium">Tekst</span>
                </button>
                <button onClick={handleAddFrame} className={`${btnBase} ${btnPrimary}`}>
                    <Square size={18} className="mr-2" />
                    <span className="text-sm font-medium">Ramka</span>
                </button>

                <div className={divider} />

                <button
                    onClick={onToggleGrid}
                    className={`${btnBase} ${showGrid ? (dark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-50 text-indigo-600") : btnIcon}`}
                    title="Pokaż/ukryj siatkę"
                >
                    <Grid3x3 size={20} />
                </button>
                <button
                    onClick={onToggleSnap}
                    className={`${btnBase} ${snapToGrid ? (dark ? "bg-indigo-500/20 text-indigo-400" : "bg-indigo-50 text-indigo-600") : btnIcon}`}
                    title="Przyciągaj do siatki"
                >
                    <Magnet size={20} />
                </button>
                <button onClick={onToggleTheme} className={btnIcon} title="Zmień motyw">
                    {dark ? <Sun size={20} /> : <Moon size={20} />}
                </button>

                <div className={divider} />

                <button onClick={handleExportPDF} className={`${btnBase} ${btnActive}`}>
                    <Download size={18} className="mr-2" />
                    <span className="text-sm font-medium">Eksport PDF</span>
                </button>
            </div>
        </div>
    );
}
