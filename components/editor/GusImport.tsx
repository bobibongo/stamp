import React, { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface GusImportProps {
    onDataLoaded: (data: any) => void;
    dark?: boolean;
}

export const GusImport: React.FC<GusImportProps> = ({ onDataLoaded, dark }) => {
    const [nip, setNip] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async () => {
        if (!nip) return;
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/gus', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ type: 'NIP', value: nip }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Wystąpił błąd podczas pobierania danych');
            }

            onDataLoaded(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const containerClass = `p-4 rounded-xl mb-6 border ${dark
            ? 'bg-zinc-800/50 border-zinc-700/50'
            : 'bg-white border-zinc-200 shadow-sm'
        }`;

    const labelClass = `text-xs font-semibold uppercase tracking-wider mb-3 ${dark ? 'text-zinc-500' : 'text-zinc-400'
        }`;

    const inputClass = `flex-1 px-3 py-2 text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500 ${dark
            ? 'bg-zinc-900 border-zinc-700 text-zinc-100 placeholder-zinc-500'
            : 'bg-white border-zinc-300 text-zinc-900'
        }`;

    // Używamy styli zgodnych z resztą UI (np. przycisków w PropertiesPanel)
    // Ale tutaj mamy dedykowany przycisk
    const buttonClass = `px-4 py-2 rounded-md text-white flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${loading ? 'bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'
        }`;


    return (
        <div className={containerClass}>
            <h3 className={labelClass}>Pobierz dane z GUS</h3>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={nip}
                    onChange={(e) => setNip(e.target.value)}
                    placeholder="Wprowadź NIP"
                    className={inputClass}
                />
                <button
                    onClick={handleSearch}
                    disabled={loading || !nip}
                    className={buttonClass}
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span>Pobierz</span>
                </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
    );
};
