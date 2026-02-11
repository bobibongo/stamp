'use client';

import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
            setIsMobile(e.matches);
        };
        onChange(mql); // initial
        mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void);
        return () => mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void);
    }, []);

    return isMobile;
}
