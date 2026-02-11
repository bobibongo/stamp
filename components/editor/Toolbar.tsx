'use client';

import { useState } from 'react';
import { Type, Square, Sun, Moon, Download, Grid3x3, Magnet, Menu, X, Undo2, Redo2, FileText, Image } from 'lucide-react';
import * as fabric from 'fabric';
import { addText, addRectFrame, saveState } from '@/lib/canvas-logic';
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
}: ToolbarProps) {
    const [menuOpen, setMenuOpen] = useState(false);

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

    const handleExportSVG = () => {
        if (!canvas) return;
        const svg = canvas.toSVG();
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'pieczatka.svg';
        a.click();
        URL.revokeObjectURL(url);
        setMenuOpen(false);
    };

    const handleExportPDF = async () => {
        if (!canvas) return;
        await downloadPDF(canvas);
        setMenuOpen(false);
    };

    const handleExportPDFFlat = async () => {
        if (!canvas) return;
        await downloadPDFFlattened(canvas);
        setMenuOpen(false);
    };

    const dark = theme === 'dark';

    const btnBase =
        'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer select-none';
    const btnPrimary = dark
        ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100'
        : 'bg-white hover:bg-zinc-100 text-zinc-800 shadow-sm';
    const btnIcon = dark
        ? 'bg-zinc-700/50 hover:bg-zinc-600 text-zinc-300'
        : 'bg-white/60 hover:bg-white text-zinc-600 shadow-sm';

    const btnToggle = (active: boolean) =>
        `${btnBase} ${active
            ? 'bg-indigo-500 text-white shadow-md'
            : dark
                ? 'bg-zinc-700/50 hover:bg-zinc-600 text-zinc-300'
                : 'bg-white/60 hover:bg-white text-zinc-600 shadow-sm'
        }`;

    const divider = `w-px h-6 mx-2 ${dark ? 'bg-zinc-700' : 'bg-zinc-300'}`;

    // ── Mobile Toolbar ─────────────────────────────────────
    if (isMobile) {
        return (
            <div
                className={`relative border-b transition-colors duration-300 ${dark
                    ? 'bg-zinc-900 border-zinc-700'
                    : 'bg-zinc-50 border-zinc-200'
                    }`}
            >
                {/* Compact bar */}
                <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-bold text-[10px]">SF</span>
                        </div>
                        <h1
                            className={`text-base font-semibold tracking-tight ${dark ? 'text-zinc-100' : 'text-zinc-800'
                                }`}
                        >
                            StampFlow
                        </h1>
                    </div>

                    <button
                        onClick={() => setMenuOpen((v) => !v)}
                        className={`flex items-center justify-center w-9 h-9 rounded-xl transition-colors ${dark
                            ? 'hover:bg-zinc-700 text-zinc-300'
                            : 'hover:bg-zinc-200 text-zinc-600'
                            }`}
                    >
                        {menuOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>

                {/* Dropdown menu */}
                {menuOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setMenuOpen(false)}
                        />
                        <div
                            className={`absolute top-full left-0 right-0 z-50 border-b shadow-xl p-3 flex flex-col gap-1.5 ${dark
                                ? 'bg-zinc-800 border-zinc-700'
                                : 'bg-white border-zinc-200'
                                }`}
                        >
                            <button onClick={handleAddText} className={`${btnBase} ${btnPrimary} w-full justify-start`}>
                                <Type size={16} />
                                <span>Tekst</span>
                            </button>
                            <button onClick={handleAddFrame} className={`${btnBase} ${btnPrimary} w-full justify-start`}>
                                <Square size={16} />
                                <span>Ramka</span>
                            </button>

                            <div className={`h-px my-1 ${dark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />

                            <div className="flex gap-1.5">
                                <button onClick={() => { onUndo(); setMenuOpen(false); }} className={`${btnBase} ${btnIcon} flex-1 justify-center`} title="Cofnij (Ctrl+Z)">
                                    <Undo2 size={16} />
                                    <span>Cofnij</span>
                                </button>
                                <button onClick={() => { onRedo(); setMenuOpen(false); }} className={`${btnBase} ${btnIcon} flex-1 justify-center`} title="Dalej (Ctrl+Shift+Z)">
                                    <Redo2 size={16} />
                                    <span>Dalej</span>
                                </button>
                            </div>

                            <div className={`h-px my-1 ${dark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />

                            <button
                                onClick={() => { onToggleGrid(); setMenuOpen(false); }}
                                className={`${btnToggle(showGrid)} w-full justify-start`}
                            >
                                <Grid3x3 size={16} />
                                <span>Siatka 5mm</span>
                            </button>
                            <button
                                onClick={() => { onToggleSnap(); setMenuOpen(false); }}
                                className={`${btnToggle(snapToGrid)} w-full justify-start`}
                            >
                                <Magnet size={16} />
                                <span>Przyciągaj do siatki</span>
                            </button>

                            <div className={`h-px my-1 ${dark ? 'bg-zinc-700' : 'bg-zinc-200'}`} />

                            <button onClick={handleExportSVG} className={`${btnBase} ${btnPrimary} w-full justify-start`}>
                                <Download size={16} />
                                <span>Eksport SVG</span>
                            </button>
                            <button onClick={handleExportPDF} className={`${btnBase} ${btnPrimary} w-full justify-start`}>
                                <FileText size={16} />
                                <span>PDF (fonty osadzone)</span>
                            </button>
                            <button onClick={handleExportPDFFlat} className={`${btnBase} ${btnPrimary} w-full justify-start`}>
                                <Image size={16} />
                                <span>PDF (spłaszczony 300 DPI)</span>
                            </button>

                            <button
                                onClick={() => { onToggleTheme(); setMenuOpen(false); }}
                                className={`${btnBase} ${btnIcon} w-full justify-start`}
                            >
                                {dark ? <Sun size={16} /> : <Moon size={16} />}
                                <span>{dark ? 'Jasny motyw' : 'Ciemny motyw'}</span>
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    // ── Desktop Toolbar ────────────────────────────────────
    return (
        <div
            className={`flex items-center justify-between px-6 py-3 border-b transition-colors duration-300 ${dark
                ? 'bg-zinc-900 border-zinc-700'
                : 'bg-zinc-50 border-zinc-200'
                }`}
        >
            {/* Logo */}
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <span className="text-white font-bold text-xs">SF</span>
                </div>
                <h1
                    className={`text-lg font-semibold tracking-tight ${dark ? 'text-zinc-100' : 'text-zinc-800'
                        }`}
                >
                    StampFlow
                </h1>
            </div>

            {/* Narzędzia */}
            <div className="flex items-center gap-2">
                <button onClick={handleAddText} className={`${btnBase} ${btnPrimary}`}>
                    <Type size={16} />
                    <span>Tekst</span>
                </button>
                <button onClick={handleAddFrame} className={`${btnBase} ${btnPrimary}`}>
                    <Square size={16} />
                    <span>Ramka</span>
                </button>

                <div className={divider} />

                {/* Grid & Snap */}
                <button
                    onClick={onToggleGrid}
                    className={btnToggle(showGrid)}
                    title="Siatka 5mm"
                >
                    <Grid3x3 size={16} />
                </button>
                <button
                    onClick={onToggleSnap}
                    className={btnToggle(snapToGrid)}
                    title="Przyciągaj do siatki"
                >
                    <Magnet size={16} />
                </button>

                <div className={divider} />

                {/* Undo / Redo */}
                <button onClick={onUndo} className={`${btnBase} ${btnIcon}`} title="Cofnij (Ctrl+Z)">
                    <Undo2 size={16} />
                </button>
                <button onClick={onRedo} className={`${btnBase} ${btnIcon}`} title="Dalej (Ctrl+Shift+Z)">
                    <Redo2 size={16} />
                </button>

                <div className={divider} />

                <button onClick={handleExportSVG} className={`${btnBase} ${btnPrimary}`}>
                    <Download size={16} />
                    <span>SVG</span>
                </button>
                <button onClick={handleExportPDF} className={`${btnBase} ${btnPrimary}`} title="PDF z osadzonymi fontami">
                    <FileText size={16} />
                    <span>PDF</span>
                </button>
                <button onClick={handleExportPDFFlat} className={`${btnBase} ${btnPrimary}`} title="PDF spłaszczony (300 DPI)">
                    <Image size={16} />
                    <span>PDF⚡</span>
                </button>

                <div className={divider} />

                <button
                    onClick={onToggleTheme}
                    className={`${btnBase} ${btnIcon}`}
                    title="Przełącz motyw"
                >
                    {dark ? <Sun size={16} /> : <Moon size={16} />}
                </button>
            </div>
        </div>
    );
}
