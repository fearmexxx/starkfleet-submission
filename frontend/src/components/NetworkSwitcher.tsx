'use client';

import { useState, useEffect } from 'react';
import { NetworkType, DEFAULT_NETWORK } from '@/lib/contract';

export function NetworkSwitcher() {
    const [network, setNetwork] = useState<NetworkType>(DEFAULT_NETWORK);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem('starkfleet_network') as NetworkType;
        if (stored && (stored === 'mainnet' || stored === 'sepolia')) {
            setNetwork(stored);
        }
    }, []);

    const toggleNetwork = () => {
        const newNetwork = network === 'mainnet' ? 'sepolia' : 'mainnet';
        localStorage.setItem('starkfleet_network', newNetwork);
        setNetwork(newNetwork);
        window.location.reload(); // Reload to ensure clean state
    };

    if (!mounted) return null;

    return (
        <button
            onClick={toggleNetwork}
            className={`
                px-4 py-2 rounded-lg font-mono text-xs font-bold tracking-widest uppercase transition-all duration-300 border
                ${network === 'mainnet'
                    ? 'bg-neon-cyan/10 text-neon-cyan border-neon-cyan/50 hover:bg-neon-cyan/20'
                    : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/50 hover:bg-yellow-500/20'}
            `}
            title="Click to switch network (reloads page)"
        >
            <span className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${network === 'mainnet' ? 'bg-neon-cyan animate-pulse' : 'bg-yellow-500'}`}></span>
                {network === 'mainnet' ? 'MAINNET' : 'SEPOLIA'}
            </span>
        </button>
    );
}
