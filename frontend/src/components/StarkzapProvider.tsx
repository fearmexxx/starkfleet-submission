'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { StarkSDK, Wallet, ChainId } from 'starkzap';
import { STARKNET_CONTRACTS, NetworkType, RPC_URLS } from '@/lib/contract';

interface StarkzapContextType {
    sdk: StarkSDK | null;
    wallet: Wallet | null;
    setWallet: (wallet: Wallet | null) => void;
    connectCartridge: () => Promise<void>;
    disconnect: () => void;
    isConnecting: boolean;
}

const StarkzapContext = createContext<StarkzapContextType>({
    sdk: null,
    wallet: null,
    setWallet: () => { },
    connectCartridge: async () => { },
    disconnect: () => { },
    isConnecting: false,
});

export function useStarkzap() {
    return useContext(StarkzapContext);
}

export function StarkzapProvider({ network, children }: { network: NetworkType; children: ReactNode }) {
    const [sdk, setSdk] = useState<StarkSDK | null>(null);
    const [wallet, setWallet] = useState<Wallet | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);

    // Initialize SDK when network changes
    useEffect(() => {
        const rpcUrl = network === 'mainnet' ? 'https://api.cartridge.gg/x/starknet/mainnet' : 'https://api.cartridge.gg/x/starknet/sepolia';
        const chainId = network === 'mainnet' ? ChainId.MAINNET : ChainId.SEPOLIA;

        const newSdk = new StarkSDK({ rpcUrl, chainId });
        setSdk(newSdk);
    }, [network]);

    const connectCartridge = async () => {
        if (!sdk) return;

        setIsConnecting(true);
        try {
            const contractAddress = network === 'mainnet' ? STARKNET_CONTRACTS.mainnet : STARKNET_CONTRACTS.sepolia;

            const cartridgeWallet = await sdk.connectCartridge({
                policies: [
                    {
                        target: contractAddress,
                        method: 'create_game'
                    },
                    {
                        target: contractAddress,
                        method: 'join_game'
                    },
                    {
                        target: contractAddress,
                        method: 'commit_board'
                    },
                    {
                        target: contractAddress,
                        method: 'attack'
                    },
                    {
                        target: contractAddress,
                        method: 'reveal'
                    },
                    {
                        target: contractAddress,
                        method: 'claim_victory'
                    },
                    {
                        target: contractAddress,
                        method: 'claim_timeout'
                    },
                    {
                        target: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
                        method: 'approve',
                        spender: contractAddress,
                        amount: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
                    },
                    {
                        target: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
                        method: 'transfer'
                    }
                ] as any
            });

            setWallet(cartridgeWallet as unknown as Wallet);
        } catch (error) {
            console.error('Failed to connect Cartridge via Starkzap:', error);
        } finally {
            setIsConnecting(false);
        }
    };

    const disconnect = async () => {
        if (wallet) {
            try {
                if (typeof wallet.disconnect === 'function') {
                    await wallet.disconnect();
                } else if ('getController' in wallet) {
                    const controller = (wallet as any).getController();
                    if (controller && typeof controller.disconnect === 'function') {
                        await controller.disconnect();
                    }
                }
            } catch (e) {
                console.warn("Expected error disconnecting cartridge (often throws on toLowerCase):", e);
            }
        }

        // CRITICAL FIX: starkzap's CartridgeWallet creates a new Controller every time you connect.
        // However, the Controller NEVER removes the <div id="controller"> iframe container from the DOM when disconnected!
        // When reconnecting, the new Controller sees the old container exists and refuses to append its new iframe,
        // causing Penpal to timeout waiting for the unmounted iframe to reply.
        try {
            // Aggressively clean up all Cartridge controller DOM elements
            // since their library expects a full page reload on disconnect to not leak state
            document.querySelectorAll('#controller').forEach(el => el.remove());
            document.querySelectorAll('iframe[id^="controller-"]').forEach(el => el.remove());
            document.querySelectorAll('meta[id="controller-viewport"]').forEach(el => el.remove());

            if (document.body) {
                document.body.style.overflow = 'auto';
            }

            // Fallback clear of cartridge local storage
            localStorage.removeItem('lastUsedConnector');
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key?.startsWith("@cartridge/")) {
                    localStorage.removeItem(key);
                }
            }
        } catch (e) {
            console.error("DOM cleanup error:", e);
        }

        setWallet(null);
    };

    return (
        <StarkzapContext.Provider value={{ sdk, wallet, setWallet, connectCartridge, disconnect, isConnecting }}>
            {children}
        </StarkzapContext.Provider>
    );
}
