'use client';

import { useState, useRef } from 'react';
import { Upload, X, Download, AlertCircle, FileText } from 'lucide-react';
import { resizePdfService } from '@/lib/export-logic';

interface PdfResizerModalProps {
    isOpen: boolean;
    onClose: () => void;
    darkMode: boolean;
}

export default function PdfResizerModal({ isOpen, onClose, darkMode }: PdfResizerModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [widthMm, setWidthMm] = useState<string>('');
    const [heightMm, setHeightMm] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (selectedFile.type !== 'application/pdf') {
                setError('Proszę wybrać plik PDF.');
                return;
            }
            setFile(selectedFile);
            setError(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const selectedFile = e.dataTransfer.files[0];
            if (selectedFile.type !== 'application/pdf') {
                setError('Proszę upuścić plik PDF.');
                return;
            }
            setFile(selectedFile);
            setError(null);
        }
    };

    const handleSubmit = async () => {
        if (!file || !widthMm || !heightMm) {
            setError('Wypełnij wszystkie pola.');
            return;
        }

        const w = parseFloat(widthMm);
        const h = parseFloat(heightMm);

        if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
            setError('Nieprawidłowe wymiary.');
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            await resizePdfService(file, w, h);
            onClose(); // Zamknij modal po sukcesie (lub można zostawić otwarty z komunikatem sukcesu)
        } catch (err: any) {
            console.error(err);
            setError('Błąd podczas przetwarzania: ' + (err.message || 'Nieznany błąd'));
        } finally {
            setIsProcessing(false);
        }
    };

    const bgClass = darkMode ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900';
    const inputClass = `w-full p-2 rounded-lg border text-sm ${darkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-100' : 'bg-zinc-50 border-zinc-300 text-zinc-900'}`;
    const dropZoneClass = `border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer ${file
            ? (darkMode ? 'border-indigo-500/50 bg-indigo-500/10' : 'border-indigo-500/50 bg-indigo-50')
            : (darkMode ? 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50' : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50')
        }`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className={`w-full max-w-md rounded-2xl shadow-2xl border p-6 ${bgClass}`} onClick={e => e.stopPropagation()}>

                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Upload size={24} className="text-indigo-500" />
                            PDF Resizer
                        </h2>
                        <p className={`text-sm mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            Zmień wymiary gotowego pliku PDF
                        </p>
                    </div>
                    <button onClick={onClose} className={`p-1 rounded-lg transition-colors ${darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}>
                        <X size={20} />
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <div
                    className={dropZoneClass}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="application/pdf"
                        onChange={handleFileChange}
                    />

                    {file ? (
                        <div className="text-center">
                            <FileText size={48} className="mx-auto mb-2 text-indigo-500" />
                            <p className="font-medium text-sm truncate max-w-[200px]">{file.name}</p>
                            <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                {(file.size / 1024).toFixed(1)} KB
                            </p>
                            <button
                                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                className="mt-3 text-xs text-red-500 hover:underline"
                            >
                                Usuń plik
                            </button>
                        </div>
                    ) : (
                        <div className="text-center">
                            <Upload size={32} className={`mx-auto mb-3 ${darkMode ? 'text-zinc-600' : 'text-zinc-400'}`} />
                            <p className="text-sm font-medium">Kliknij lub upuść plik tutaj</p>
                            <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                Tylko format PDF
                            </p>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div>
                        <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            Nowa Szerokość (mm)
                        </label>
                        <input
                            type="number"
                            value={widthMm}
                            onChange={(e) => setWidthMm(e.target.value)}
                            placeholder="np. 38.00"
                            className={inputClass}
                            step="0.01"
                        />
                    </div>
                    <div>
                        <label className={`block text-xs font-medium mb-1.5 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                            Nowa Wysokość (mm)
                        </label>
                        <input
                            type="number"
                            value={heightMm}
                            onChange={(e) => setHeightMm(e.target.value)}
                            placeholder="np. 14.00"
                            className={inputClass}
                            step="0.01"
                        />
                    </div>
                </div>

                <div className="mt-8 flex gap-3">
                    <button
                        onClick={onClose}
                        className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors ${darkMode ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
                        disabled={isProcessing}
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isProcessing || !file}
                        className={`flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Przetwarzanie...
                            </>
                        ) : (
                            <>
                                <Download size={18} />
                                Pobierz PDF
                            </>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
}
