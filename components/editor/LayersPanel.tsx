'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import * as fabric from 'fabric';
import {
    getUserObjects,
    moveLayerUp,
    moveLayerDown,
    toggleLock,
    toggleVisibility,
    deleteObject,
    bringToFront,
    sendToBack,
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
    Copy,
    ArrowUpToLine,
    ArrowDownToLine,
    X,
    MoreVertical
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
    const [editingId, setEditingId] = useState<string | null>(null);

    // Pobierz obiekty użytkownika (odwrócona kolejność – wierzch na górze)
    const layers = useMemo(() => {
        if (!canvas) return [];
        const userObjects = getUserObjects(canvas);
        // Gwarancja ID dla każdego obiektu przed wyrenderowaniem listy
        userObjects.forEach(obj => {
            if (!(obj as any).__uid) {
                (obj as any).__uid = 'id-' + Math.random().toString(36).substr(2, 9);
            }
        });
        return [...userObjects].reverse();
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

    // Helper to identify objects since fabric doesn't enforce IDs
    const getObjectId = (obj: fabric.FabricObject) => {
        if (!obj) return '-1';
        return (obj as any).__uid || (obj as any).id || '-1';
    };

    // Initialize UIDs for objects if missing
    useEffect(() => {
        if (!canvas) return;
        canvas.getObjects().forEach((obj) => {
            if (!(obj as any).__uid) {
                (obj as any).__uid = 'id-' + Math.random().toString(36).substr(2, 9);
            }
        });
    }, [canvas, refreshKey]);


    // Memoize the set of selected IDs for O(1) lookup during render
    const selectedIds = useMemo(() => {
        const ids = new Set<string>();

        // Use direct canvas state if available
        const activeObjects = canvas ? canvas.getActiveObjects() : (
            selectedObject ? (
                selectedObject.type === 'activeSelection'
                    ? (selectedObject as fabric.ActiveSelection).getObjects()
                    : [selectedObject]
            ) : []
        );

        activeObjects.forEach(obj => {
            const id = getObjectId(obj);
            if (id !== '-1') ids.add(id);
        });

        return ids;
    }, [canvas, selectedObject, refreshKey]);

    const handleSelect = (obj: fabric.FabricObject, e: React.MouseEvent) => {
        if (!canvas) return;
        if ((obj as any).__locked || !obj.visible) return;

        // Multi-selection logic with Ctrl/Shift
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            // Pobieramy aktualnie zaznaczone obiekty bezpośrednio z canvasa - to najpewniejsza metoda
            const currentSelection = canvas.getActiveObjects();
            const objId = getObjectId(obj);
            const isAlreadySelected = currentSelection.some(o => getObjectId(o) === objId);

            let nextSelection: fabric.FabricObject[];
            if (isAlreadySelected) {
                // Usuwamy z selekcji
                nextSelection = currentSelection.filter(o => getObjectId(o) !== objId);
            } else {
                // Dodajemy do selekcji
                nextSelection = [...currentSelection, obj];
            }

            // Czyścimy obecne zaznaczenie i ustawiamy nowe
            canvas.discardActiveObject();

            if (nextSelection.length === 1) {
                canvas.setActiveObject(nextSelection[0]);
            } else if (nextSelection.length > 1) {
                const sel = new fabric.ActiveSelection(nextSelection, { canvas });
                canvas.setActiveObject(sel);
            }

            // Powiadamiamy system o zmianie (przekazując obiekt ActiveSelection lub null)
            onSelectionChange(canvas.getActiveObject() || null);
        } else {
            // Single selection
            canvas.setActiveObject(obj);
            onSelectionChange(obj);
        }

        canvas.requestRenderAll();
        // Force refreshKey update to ensure memoized selectionIds updates
        onObjectModified();
    };

    const handleRename = (obj: fabric.FabricObject, name: string) => {
        (obj as any).__stampName = name;
        onObjectModified();
    };

    const handleRenameKeyDown = (e: React.KeyboardEvent, obj: fabric.FabricObject) => {
        if (e.key === 'Enter') {
            setEditingId(null);
        }
    };

    const handleToggleLock = (obj: fabric.FabricObject) => {
        toggleLock(obj);
        canvas?.requestRenderAll();
        onObjectModified();
    };

    const handleToggleVisibility = (obj: fabric.FabricObject) => {
        if (!canvas) return;
        toggleVisibility(canvas, obj);
        onObjectModified();
    };

    const handleBringToFrontAction = () => {
        if (!canvas || !selectedObject) return;
        if (selectedObject.type === 'activeSelection') {
            (selectedObject as fabric.ActiveSelection).forEachObject(o => bringToFront(canvas, o));
        } else {
            bringToFront(canvas, selectedObject);
        }
        onObjectModified();
    };

    const handleSendToBackAction = () => {
        if (!canvas || !selectedObject) return;
        if (selectedObject.type === 'activeSelection') {
            // Reverse order for send to back to maintain relative order if possible, or just send all
            (selectedObject as fabric.ActiveSelection).forEachObject(o => sendToBack(canvas, o));
        } else {
            sendToBack(canvas, selectedObject);
        }
        onObjectModified();
    };

    const handleDeleteAction = () => {
        if (!canvas) return;
        if (selectedObject) {
            if (selectedObject.type === 'activeSelection') {
                (selectedObject as fabric.ActiveSelection).forEachObject(o => deleteObject(canvas, o));
            } else {
                deleteObject(canvas, selectedObject);
            }
        }
        onSelectionChange(null);
        onObjectModified();
    };

    const handleDuplicateAction = () => {
        if (!canvas || !selectedObject) return;
        // Logic handles active object automatically
        import('@/lib/canvas-logic').then(mod => {
            mod.duplicateActive(canvas);
            onObjectModified();
        });
    };

    // Helper to get all currently selected objects as a flat array
    const getSelectedObjectsFlat = () => {
        if (!selectedObject) return [];
        if (selectedObject.type === 'activeSelection') {
            return (selectedObject as fabric.ActiveSelection).getObjects();
        }
        return [selectedObject];
    };

    const itemBg = (obj: fabric.FabricObject) => {
        const objId = getObjectId(obj);
        const isSelected = selectedIds.has(objId) || (canvas?.getActiveObjects() || []).includes(obj);

        if (isSelected) {
            return dark ? 'bg-indigo-500/30 border-indigo-400/50 shadow-sm' : 'bg-indigo-50 border-indigo-300 shadow-sm';
        }
        return dark ? 'bg-zinc-800/50 border-zinc-700/50 hover:bg-zinc-700/50' : 'bg-zinc-50 border-zinc-200 hover:bg-zinc-100';
    };

    const iconBtn = `flex items-center justify-center w-7 h-7 rounded-md transition-colors cursor-pointer ${dark ? 'hover:bg-zinc-600 text-zinc-400' : 'hover:bg-zinc-200 text-zinc-500'
        }`;
    const headerBtn = `flex items-center justify-center w-8 h-8 rounded-lg transition-colors cursor-pointer ${dark ? 'hover:bg-zinc-700 text-zinc-300' : 'hover:bg-zinc-100 text-zinc-600'}`;

    // ── Toolbar Actions (Top) ───────────────────────────
    const ToolbarActions = (
        <div className={`grid grid-cols-4 gap-1 p-2 border-b ${dark ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-200 bg-white'}`}>
            <button onClick={handleBringToFrontAction} className={headerBtn} title="Na wierzch">
                <ArrowUpToLine size={16} />
            </button>
            <button onClick={handleSendToBackAction} className={headerBtn} title="Pod spód">
                <ArrowDownToLine size={16} />
            </button>
            <button onClick={handleDuplicateAction} className={headerBtn} title="Duplikuj">
                <Copy size={16} />
            </button>
            <button onClick={handleDeleteAction} className={`${headerBtn} hover:text-red-500`} title="Usuń">
                <Trash2 size={16} />
            </button>
        </div>
    );

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
                const uid = (obj as any).__uid;
                const isEditing = editingId === uid;

                return (
                    <div
                        key={uid || idx}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all cursor-pointer select-none ${itemBg(obj)} ${!visible ? 'opacity-40' : ''
                            }`}
                        onClick={(e) => handleSelect(obj, e)}
                    >
                        {/* Icon */}
                        <span className={`flex-shrink-0 ${dark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            {getObjectIcon(obj)}
                        </span>

                        {/* Name (editable on double-click) */}
                        {isEditing ? (
                            <input
                                autoFocus
                                type="text"
                                className={`flex-1 min-w-0 text-xs font-semibold bg-transparent outline-none truncate ${dark ? 'text-zinc-100' : 'text-zinc-800'
                                    }`}
                                value={name}
                                onChange={(e) => handleRename(obj, e.target.value)}
                                onKeyDown={(e) => handleRenameKeyDown(e, obj)}
                                onBlur={() => setEditingId(null)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        ) : (
                            <span
                                className={`flex-1 min-w-0 text-xs font-semibold truncate ${dark ? 'text-zinc-300' : 'text-zinc-700'}`}
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingId(uid);
                                }}
                            >
                                {name}
                            </span>
                        )}

                        {/* Actions (Lock/Hide - kept on row) */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
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
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
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
                {ToolbarActions}

                <div className="overflow-y-auto px-3 pb-4 flex flex-col gap-1" style={{ maxHeight: 'calc(60vh - 100px)' }}>
                    {layerList}
                </div>
            </div>
        );
    }

    // ── Desktop: Sidebar ────────────────────────────────
    return (
        <div
            className={`w-96 border-l flex flex-col overflow-hidden transition-colors duration-300 ${dark ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
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

            {ToolbarActions}

            {/* Lista warstw */}
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                {layerList}
            </div>
        </div>
    );
}
