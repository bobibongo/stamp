'use client';

import { useMemo } from 'react';
import * as fabric from 'fabric';
import {
    getUserObjects,
    moveLayerUp,
    moveLayerDown,
    toggleLock,
    toggleVisibility,
    deleteObject,
} from '@/lib/canvas-logic';
import {
    ChevronUp,
    ChevronDown,
    Lock,
    Unlock,
    Eye,
    EyeOff,
    Trash2,
    Type as TypeIcon,
    Square,
    Image as ImageIcon,
    X,
} from 'lucide-react';

interface LayersPanelProps {
    canvas: fabric.Canvas | null;
    selectedObject: fabric.FabricObject | null;
    onSelectionChange: (obj: fabric.FabricObject | null) => void;
    onObjectModified: () => void;
    theme: 'light' | 'dark';
    refreshKey: number;
    isMobile: boolean;
    isOpen: boolean;
    onClose: () => void;
}

export default function LayersPanel({
    canvas,
    selectedObject,
    onSelectionChange,
    onObjectModified,
    theme,
    refreshKey,
    isMobile,
    isOpen,
    onClose,
}: LayersPanelProps) {
    const dark = theme === 'dark';

    // Pobierz obiekty użytkownika (odwrócona kolejność – wierzch na górze)
    const layers = useMemo(() => {
        if (!canvas) return [];
        return [...getUserObjects(canvas)].reverse();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvas, refreshKey]);

    const getObjectIcon = (obj: fabric.FabricObject) => {
        if (obj.type === 'i-text') return <TypeIcon size={13} />;
        if ((obj as any).__stampType === 'frame') return <Square size={13} />;
        return <ImageIcon size={13} />;
    };

    const getObjectName = (obj: fabric.FabricObject): string => {
        return (obj as any).__stampName || obj.type || 'Obiekt';
    };

    const handleSelect = (obj: fabric.FabricObject) => {
        if (!canvas) return;
        if ((obj as any).__locked || !obj.visible) return;
        canvas.setActiveObject(obj);
        canvas.renderAll();
        onSelectionChange(obj);
    };

    const handleRename = (obj: fabric.FabricObject, name: string) => {
        (obj as any).__stampName = name;
        onObjectModified();
    };

    const handleMoveUp = (obj: fabric.FabricObject) => {
        if (!canvas) return;
        moveLayerUp(canvas, obj);
        onObjectModified();
    };

    const handleMoveDown = (obj: fabric.FabricObject) => {
        if (!canvas) return;
        moveLayerDown(canvas, obj);
        onObjectModified();
    };

    const handleToggleLock = (obj: fabric.FabricObject) => {
        toggleLock(obj);
        canvas?.renderAll();
        onObjectModified();
    };

    const handleToggleVisibility = (obj: fabric.FabricObject) => {
        if (!canvas) return;
        toggleVisibility(canvas, obj);
        onObjectModified();
    };

    const handleDelete = (obj: fabric.FabricObject) => {
        if (!canvas) return;
        deleteObject(canvas, obj);
        onSelectionChange(null);
        onObjectModified();
    };

    const itemBg = (obj: fabric.FabricObject) => {
        const isSelected = selectedObject === obj;
        if (isSelected) return dark ? 'bg-indigo-500/20 border-indigo-500/40' : 'bg-indigo-50 border-indigo-300';
        return dark ? 'bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50' : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100';
    };

    const iconBtn = `flex items-center justify-center w-7 h-7 rounded-md transition-colors cursor-pointer ${dark ? 'hover:bg-zinc-600 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-500'
        }`;

    // ── Content shared between desktop + mobile ─────────
    const layerList = (
        <>
            {layers.length === 0 && (
                <div
                    className={`text-xs text-center py-6 ${dark ? 'text-zinc-500' : 'text-zinc-400'
                        }`}
                >
                    Brak elementów
                </div>
            )}

            {layers.map((obj, idx) => {
                const locked = !!(obj as any).__locked;
                const visible = obj.visible !== false;
                const name = getObjectName(obj);

                return (
                    <div
                        key={idx}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all cursor-pointer ${itemBg(obj)} ${!visible ? 'opacity-40' : ''
                            }`}
                        onClick={() => handleSelect(obj)}
                    >
                        {/* Icon */}
                        <span className={`flex-shrink-0 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            {getObjectIcon(obj)}
                        </span>

                        {/* Name (editable on double-click) */}
                        <input
                            type="text"
                            className={`flex-1 min-w-0 text-xs bg-transparent outline-none truncate ${dark ? 'text-zinc-200' : 'text-zinc-700'
                                }`}
                            value={name}
                            onChange={(e) => handleRename(obj, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => (e.target as HTMLInputElement).select()}
                        />

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveUp(obj);
                                }}
                                className={iconBtn}
                                title="Wyżej"
                            >
                                <ChevronUp size={12} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleMoveDown(obj);
                                }}
                                className={iconBtn}
                                title="Niżej"
                            >
                                <ChevronDown size={12} />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleLock(obj);
                                }}
                                className={iconBtn}
                                title={locked ? 'Odblokuj' : 'Zablokuj'}
                            >
                                {locked ? <Lock size={12} /> : <Unlock size={12} />}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleVisibility(obj);
                                }}
                                className={iconBtn}
                                title={visible ? 'Ukryj' : 'Pokaż'}
                            >
                                {visible ? <Eye size={12} /> : <EyeOff size={12} />}
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(obj);
                                }}
                                className={`${iconBtn} hover:text-red-400`}
                                title="Usuń"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                );
            })}
        </>
    );

    // ── Mobile: Bottom Sheet ────────────────────────────
    if (isMobile) {
        return (
            <div
                className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-out rounded-t-2xl shadow-2xl ${isOpen ? 'translate-y-0' : 'translate-y-full'
                    } ${dark ? 'bg-zinc-900 border-t border-zinc-700' : 'bg-white border-t border-zinc-200'
                    }`}
                style={{ maxHeight: '60vh' }}
            >
                {/* Handle bar + close */}
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-8 h-1 rounded-full ${dark ? 'bg-zinc-600' : 'bg-zinc-300'}`} />
                        <h2 className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            Warstwy ({layers.length})
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

                <div className="overflow-y-auto px-3 pb-4 flex flex-col gap-1" style={{ maxHeight: 'calc(60vh - 52px)' }}>
                    {layerList}
                </div>
            </div>
        );
    }

    // ── Desktop: Sidebar ────────────────────────────────
    return (
        <div
            className={`w-56 border-l flex flex-col overflow-hidden transition-colors duration-300 ${dark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
                }`}
        >
            {/* Header */}
            <div
                className={`px-4 py-3 border-b ${dark ? 'border-zinc-700' : 'border-zinc-200'}`}
            >
                <h2
                    className={`text-xs font-semibold uppercase tracking-wide ${dark ? 'text-zinc-400' : 'text-zinc-500'
                        }`}
                >
                    Warstwy ({layers.length})
                </h2>
            </div>

            {/* Lista warstw */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                {layerList}
            </div>
        </div>
    );
}
