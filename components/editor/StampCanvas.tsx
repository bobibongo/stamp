'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import {
    initCanvas,
    deleteSelected,
    drawRulersAndGrid,
    setupSnapToGrid,
    clampPosition,
    saveState,
    undo,
    redo,
    updateStampSize,
    StampSize,
    PX_PER_MM,
    getCanvasDimensions,
} from '@/lib/canvas-logic';

interface StampCanvasProps {
    onCanvasReady: (canvas: fabric.Canvas) => void;
    onSelectionChange: (obj: fabric.FabricObject | null) => void;
    onObjectModified: () => void;
    theme: 'light' | 'dark';
    showGrid: boolean;
    snapToGrid: boolean;
    isMobile: boolean;
    stampSize: StampSize;
}

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

export default function StampCanvas({
    onCanvasReady,
    onSelectionChange,
    onObjectModified,
    theme,
    showGrid,
    snapToGrid,
    isMobile,
    stampSize,
}: StampCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const themeRef = useRef(theme);
    const showGridRef = useRef(showGrid);
    const [zoom, setZoom] = useState(1);

    themeRef.current = theme;
    showGridRef.current = showGrid;

    const handleSelection = useCallback(
        (e: any) => {
            const activeObj = e.selected?.[0] ?? null;
            onSelectionChange(activeObj);
        },
        [onSelectionChange]
    );

    const handleClear = useCallback(() => {
        onSelectionChange(null);
    }, [onSelectionChange]);

    const handleObjModified = useCallback(() => {
        onObjectModified();
        // Zapisz stan do historii undo po każdej modyfikacji
        if (fabricRef.current) saveState(fabricRef.current);
    }, [onObjectModified]);

    useEffect(() => {
        if (!canvasRef.current || fabricRef.current) return;

        // Inicjalizacja z początkowym rozmiarem
        const canvas = initCanvas(canvasRef.current, stampSize);
        fabricRef.current = canvas;

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', handleClear);
        canvas.on('object:modified', handleObjModified);
        canvas.on('text:changed', handleObjModified);

        // Zapisz stan początkowy dla undo
        saveState(canvas);

        canvas.on('after:render', () => {
            drawRulersAndGrid(canvas, showGridRef.current, themeRef.current);
        });

        const handleKeyDown = (e: KeyboardEvent) => {
            const canvas = fabricRef.current;
            if (!canvas) return;

            const active = canvas.getActiveObject();
            if (active && (active as fabric.IText).isEditing) return;

            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                const deleted = deleteSelected(canvas);
                if (deleted) {
                    onSelectionChange(null);
                    onObjectModified();
                }
            }

            // Strzałki: przesuwanie o 1mm z clampPosition
            if (active && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const step = PX_PER_MM; // 1mm
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                active.set({ left: (active.left || 0) + dx, top: (active.top || 0) + dy });
                clampPosition(active);
                canvas.renderAll();
                onObjectModified();
                saveState(canvas);
            }

            // Ctrl+Z = cofnij, Ctrl+Shift+Z = dalej
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo(canvas).then(() => { onSelectionChange(null); onObjectModified(); });
                } else {
                    undo(canvas).then(() => { onSelectionChange(null); onObjectModified(); });
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo(canvas).then(() => { onSelectionChange(null); onObjectModified(); });
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        onCanvasReady(canvas);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            canvas.dispose();
            fabricRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Obsługa zmiany rozmiaru pieczątki ───────────────────
    useEffect(() => {
        if (!fabricRef.current) return;
        updateStampSize(fabricRef.current, stampSize);
    }, [stampSize]);

    // ── Auto-fit zoom for mobile ──────────────────────────
    useEffect(() => {
        if (!isMobile || !wrapperRef.current) return;
        const wrapper = wrapperRef.current;
        const padding = 16;
        const availW = wrapper.clientWidth - padding * 2;
        // Oblicz totalW dynamicznie dla obecnego rozmiaru
        const { totalW } = getCanvasDimensions(stampSize.widthMm, stampSize.heightMm);
        const fitZoom = Math.min(availW / totalW, 1);
        const clampedZoom = Math.max(ZOOM_MIN, Math.round(fitZoom * 100) / 100);
        setZoom(clampedZoom);
    }, [isMobile, stampSize]);

    // ── Zoom via Fabric.js setZoom ──────────────────────────
    useEffect(() => {
        const canvas = fabricRef.current;
        if (!canvas) return;

        canvas.setZoom(zoom);
        const { totalW, totalH } = getCanvasDimensions(stampSize.widthMm, stampSize.heightMm);
        canvas.setDimensions({
            width: totalW * zoom,
            height: totalH * zoom,
        });
        canvas.renderAll();
    }, [zoom, stampSize]);

    // Ctrl+Scroll zoom (desktop) + pinch-to-zoom (mobile)
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            setZoom((prev) => {
                const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
                return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((prev + delta) * 100) / 100));
            });
        };

        wrapper.addEventListener('wheel', handleWheel, { passive: false });
        return () => wrapper.removeEventListener('wheel', handleWheel);
    }, []);

    // ── Pinch-to-zoom for mobile ────────────────────────────
    useEffect(() => {
        if (!isMobile) return;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;

        let initialDistance = 0;
        let initialZoom = 1;

        const getDistance = (t1: Touch, t2: Touch) =>
            Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                initialDistance = getDistance(e.touches[0], e.touches[1]);
                initialZoom = zoom;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const currentDistance = getDistance(e.touches[0], e.touches[1]);
                const scale = currentDistance / initialDistance;
                const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(initialZoom * scale * 100) / 100));
                setZoom(newZoom);
            }
        };

        wrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
        wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
        return () => {
            wrapper.removeEventListener('touchstart', handleTouchStart);
            wrapper.removeEventListener('touchmove', handleTouchMove);
        };
    }, [isMobile, zoom]);

    // Theme change
    useEffect(() => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        canvas.backgroundColor = theme === 'dark' ? '#27272a' : '#e5e5e5';
        const workArea = canvas.getObjects()[0];
        if (workArea) {
            (workArea as fabric.Rect).set('fill', '#ffffff');
        }
        canvas.renderAll();
    }, [theme]);

    // Snap to grid toggle
    useEffect(() => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        setupSnapToGrid(canvas, snapToGrid);
    }, [snapToGrid]);

    // Re-render when grid visibility changes
    useEffect(() => {
        fabricRef.current?.renderAll();
    }, [showGrid]);

    const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, Math.round((z + ZOOM_STEP) * 100) / 100));
    const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, Math.round((z - ZOOM_STEP) * 100) / 100));
    const zoomFit = () => {
        if (isMobile && wrapperRef.current) {
            const padding = 16;
            const availW = wrapperRef.current.clientWidth - padding * 2;
            const { totalW } = getCanvasDimensions(stampSize.widthMm, stampSize.heightMm);
            const fitZoom = Math.min(availW / totalW, 1);
            setZoom(Math.max(ZOOM_MIN, Math.round(fitZoom * 100) / 100));
        } else {
            setZoom(1);
        }
    };

    const dark = theme === 'dark';
    const bgClass = dark ? 'bg-zinc-800' : 'bg-zinc-200';
    const zoomBtnClass = `flex items-center justify-center w-8 h-8 rounded-lg transition-colors cursor-pointer ${dark ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' : 'bg-white hover:bg-zinc-100 text-zinc-600 shadow-sm'
        }`;

    return (
        <div
            ref={wrapperRef}
            className={`flex flex-col flex-1 overflow-hidden ${bgClass} transition-colors duration-300`}
            style={isMobile ? { touchAction: 'none' } : undefined}
        >
            {/* Zoom controls */}
            <div className={`flex items-center justify-center gap-2 py-2 border-b ${dark ? 'border-zinc-700/50' : 'border-zinc-300/50'
                }`}>
                <button onClick={zoomOut} className={zoomBtnClass} title="Pomniejsz (Ctrl+scroll)">
                    <ZoomOut size={14} />
                </button>
                <span className={`text-xs font-medium min-w-[48px] text-center select-none ${dark ? 'text-zinc-400' : 'text-zinc-500'
                    }`}>
                    {Math.round(zoom * 100)}%
                </span>
                <button onClick={zoomIn} className={zoomBtnClass} title="Powiększ (Ctrl+scroll)">
                    <ZoomIn size={14} />
                </button>
                <button onClick={zoomFit} className={zoomBtnClass} title="Dopasuj">
                    <Maximize size={14} />
                </button>
            </div>

            {/* Canvas area */}
            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
                <div className="relative">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-zinc-400 font-medium select-none whitespace-nowrap">
                        {stampSize.widthMm} × {stampSize.heightMm} mm
                    </div>
                    <canvas
                        ref={canvasRef}
                        // Wymiary początkowe (zostaną nadpisane przez fabric)
                        width={getCanvasDimensions(stampSize.widthMm, stampSize.heightMm).totalW}
                        height={getCanvasDimensions(stampSize.widthMm, stampSize.heightMm).totalH}
                        className="rounded-lg shadow-2xl"
                    />
                </div>
            </div>
        </div>
    );
}
