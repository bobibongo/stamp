'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import * as fabric from 'fabric';
import { Layers, SlidersHorizontal } from 'lucide-react';
import Toolbar from '@/components/editor/Toolbar';
import PropertiesPanel from '@/components/editor/PropertiesPanel';
import LayersPanel from '@/components/editor/LayersPanel';
import { useIsMobile } from '@/lib/useIsMobile';
import { undo, redo } from '@/lib/canvas-logic';

// Fabric.js wymaga dostępu do DOM – ładujemy dynamicznie (SSR off)
const StampCanvas = dynamic(() => import('@/components/editor/StampCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center text-zinc-400">
      Ładowanie edytora…
    </div>
  ),
});

type MobilePanel = 'layers' | 'properties' | null;

export default function Home() {
  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [selectedObject, setSelectedObject] = useState<fabric.FabricObject | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [activeMobilePanel, setActiveMobilePanel] = useState<MobilePanel>(null);

  const isMobile = useIsMobile();

  const handleCanvasReady = useCallback((c: fabric.Canvas) => {
    setCanvas(c);
  }, []);

  const handleSelectionChange = useCallback((obj: fabric.FabricObject | null) => {
    setSelectedObject(obj);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleObjectModified = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const toggleGrid = useCallback(() => {
    setShowGrid((prev) => !prev);
  }, []);

  const toggleSnap = useCallback(() => {
    setSnapToGrid((prev) => !prev);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!canvas) return;
    await undo(canvas);
    setSelectedObject(null);
    setRefreshKey((k) => k + 1);
  }, [canvas]);

  const handleRedo = useCallback(async () => {
    if (!canvas) return;
    await redo(canvas);
    setSelectedObject(null);
    setRefreshKey((k) => k + 1);
  }, [canvas]);

  const toggleMobilePanel = useCallback((panel: MobilePanel) => {
    setActiveMobilePanel((prev) => (prev === panel ? null : panel));
  }, []);

  const closeMobilePanel = useCallback(() => {
    setActiveMobilePanel(null);
  }, []);

  const dark = theme === 'dark';

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden transition-colors duration-300 ${dark ? 'bg-zinc-900 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
        }`}
    >
      <Toolbar
        canvas={canvas}
        theme={theme}
        onToggleTheme={toggleTheme}
        showGrid={showGrid}
        onToggleGrid={toggleGrid}
        snapToGrid={snapToGrid}
        onToggleSnap={toggleSnap}
        isMobile={isMobile}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Panel warstw – lewy (desktop) */}
        {!isMobile && (
          <LayersPanel
            canvas={canvas}
            selectedObject={selectedObject}
            onSelectionChange={handleSelectionChange}
            onObjectModified={handleObjectModified}
            theme={theme}
            refreshKey={refreshKey}
            isMobile={false}
            isOpen={true}
            onClose={() => { }}
          />
        )}

        {/* Canvas – środek / fullscreen na mobilce */}
        <StampCanvas
          onCanvasReady={handleCanvasReady}
          onSelectionChange={handleSelectionChange}
          onObjectModified={handleObjectModified}
          theme={theme}
          showGrid={showGrid}
          snapToGrid={snapToGrid}
          isMobile={isMobile}
        />

        {/* Panel właściwości – prawy (desktop) */}
        {!isMobile && (
          <PropertiesPanel
            selectedObject={selectedObject}
            canvas={canvas}
            theme={theme}
            refreshKey={refreshKey}
            isMobile={false}
            isOpen={true}
            onClose={() => { }}
          />
        )}
      </div>

      {/* ── Mobile: Bottom Sheet Panele ─────────────────── */}
      {isMobile && (
        <>
          {/* Backdrop */}
          {activeMobilePanel && (
            <div
              className="fixed inset-0 bg-black/40 z-40 transition-opacity"
              onClick={closeMobilePanel}
            />
          )}

          {/* Layers bottom sheet */}
          <LayersPanel
            canvas={canvas}
            selectedObject={selectedObject}
            onSelectionChange={handleSelectionChange}
            onObjectModified={handleObjectModified}
            theme={theme}
            refreshKey={refreshKey}
            isMobile={true}
            isOpen={activeMobilePanel === 'layers'}
            onClose={closeMobilePanel}
          />

          {/* Properties bottom sheet */}
          <PropertiesPanel
            selectedObject={selectedObject}
            canvas={canvas}
            theme={theme}
            refreshKey={refreshKey}
            isMobile={true}
            isOpen={activeMobilePanel === 'properties'}
            onClose={closeMobilePanel}
          />
        </>
      )}

      {/* ── Mobile: Bottom Tab Bar ──────────────────────── */}
      {isMobile && (
        <div
          className={`flex items-center justify-around py-2 border-t z-30 ${dark
            ? 'bg-zinc-900 border-zinc-700'
            : 'bg-white border-zinc-200'
            }`}
        >
          <button
            onClick={() => toggleMobilePanel('layers')}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors ${activeMobilePanel === 'layers'
              ? 'text-indigo-400'
              : dark ? 'text-zinc-400' : 'text-zinc-500'
              }`}
          >
            <Layers size={20} />
            <span className="text-[10px] font-medium">Warstwy</span>
          </button>
          <button
            onClick={() => toggleMobilePanel('properties')}
            className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors ${activeMobilePanel === 'properties'
              ? 'text-indigo-400'
              : dark ? 'text-zinc-400' : 'text-zinc-500'
              }`}
          >
            <SlidersHorizontal size={20} />
            <span className="text-[10px] font-medium">Właściwości</span>
          </button>
        </div>
      )}
    </div>
  );
}
