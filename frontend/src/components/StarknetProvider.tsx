'use client';
import { mainnet, sepolia } from '@starknet-react/chains';
import { StarknetConfig, jsonRpcProvider, argent, braavos } from '@starknet-react/core';
import { ReactNode, useState, useEffect, useMemo } from 'react';
import { RPC_URLS, NetworkType, DEFAULT_NETWORK } from '@/lib/contract';
import { StarkzapProvider } from './StarkzapProvider';

// Note: AutoConnect is now handled by StarknetConfig's autoConnect prop
// The library will automatically check for existing sessions on load

function ProviderContent({ network, children }: { network: NetworkType, children: ReactNode }) {
    const { chains, provider, connectors } = useMemo(() => {
        const currentChain = network === 'mainnet' ? mainnet : sepolia;
        // IMPORTANT: Only pass the current chain to StarknetConfig to prevent wallets 
        // from trying to auto-switch networks, which causes errors in some wallets (e.g. Braavos).
        const targetChains = [currentChain];

        const provider = jsonRpcProvider({
            rpc: (chain) => ({
                nodeUrl: chain.id === mainnet.id ? RPC_URLS.mainnet : RPC_URLS.sepolia,
            }),
        });

        return {
            chains: targetChains,
            provider,
            connectors: [argent(), braavos()]
        };
    }, [network]);

    return (
        <StarknetConfig
            chains={chains as any}
            provider={provider}
            connectors={connectors}
            autoConnect
        >
            {children}
        </StarknetConfig>
    );
}

export function StarknetProvider({ children }: { children: ReactNode }) {
    const [network, setNetwork] = useState<NetworkType>(DEFAULT_NETWORK);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('starkfleet_network') as NetworkType;
        if (stored && (stored === 'mainnet' || stored === 'sepolia')) {
            setNetwork(stored);
        }
        setMounted(true);
    }, []);

    if (!mounted) return null; // Prevent hydration mismatch and double-init

    return (
        <StarkzapProvider network={network}>
            <ProviderContent network={network}>
                {children}
            </ProviderContent>
        </StarkzapProvider>
    );
}
