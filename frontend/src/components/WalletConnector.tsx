'use client';

import { useConnect, useDisconnect, useAccount } from '@starknet-react/core';
import { useState, useEffect } from 'react';
import { NetworkSwitcher } from './NetworkSwitcher';
import { useStarkzap } from './StarkzapProvider';

export function WalletConnector() {
    const { connect, connectors } = useConnect();
    const { disconnect: disconnectReactCore } = useDisconnect();
    const { address: reactAddress, status: reactStatus } = useAccount();

    // Starkzap integration
    const { wallet, connectCartridge, disconnect: disconnectStarkzap, isConnecting: isStarkzapConnecting } = useStarkzap();

    const [showConnectors, setShowConnectors] = useState(false);
    const [cartridgeUsername, setCartridgeUsername] = useState<string | null>(null);
    const [cartridgeAddress, setCartridgeAddress] = useState<string | null>(null);

    // Fetch Cartridge profile if connected via Starkzap
    useEffect(() => {
        if (wallet && 'username' in wallet) {
            (wallet as any).username().then((name: string) => {
                setCartridgeUsername(name);
            }).catch(console.error);
        } else {
            setCartridgeUsername(null);
        }

        if (wallet) {
            try {
                const account = wallet.getAccount();
                setCartridgeAddress(account.address);
            } catch (e) {
                setCartridgeAddress(null);
            }
        } else {
            setCartridgeAddress(null);
        }
    }, [wallet]);

    const isConnected = reactStatus === 'connected' || !!wallet;
    const isConnecting = reactStatus === 'connecting' || isStarkzapConnecting;
    const activeAddress = cartridgeAddress || reactAddress;

    const handleDisconnect = () => {
        if (wallet) {
            disconnectStarkzap();
        }
        if (reactStatus === 'connected') {
            disconnectReactCore();
        }
    };

    const formatAddress = (addr: string) => {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    if (isConnected && activeAddress) {
        return (
            <div className="flex items-center gap-4">
                <NetworkSwitcher />
                <div className="h-6 w-px bg-white/10"></div>

                <div className="px-5 py-2.5 bg-neon-cyan/5 rounded-xl border border-neon-cyan/20 group hover:border-neon-cyan/40 transition-all duration-300">
                    <p className="text-[8px] text-slate-500 font-black tracking-widest uppercase mb-0.5">Active Admiral</p>
                    <span className="text-neon-cyan font-mono text-xs font-bold tracking-widest">
                        {cartridgeUsername || formatAddress(activeAddress)}
                    </span>
                </div>
                <button
                    onClick={handleDisconnect}
                    className="p-3 bg-white/5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-xl border border-white/5 hover:border-red-500/20 transition-all duration-300 group"
                    title="Disconnect Link"
                >
                    <span className="text-lg group-hover:scale-110 transition-transform block">⏂</span>
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-4">
            <NetworkSwitcher />

            <div className="relative group/wallet">
                <button
                    onClick={() => setShowConnectors(!showConnectors)}
                    className={`
                        px-8 py-3.5 rounded-xl font-black text-[10px] tracking-[0.3em] uppercase transition-all duration-500 relative overflow-hidden flex items-center gap-3
                        ${isConnecting
                            ? 'bg-white/5 text-slate-500 border border-white/10'
                            : 'bg-gradient-to-r from-neon-cyan to-blue-600 text-slate-900 shadow-[0_0_20px_rgba(0,247,255,0.3)] hover:shadow-[0_0_40px_rgba(0,247,255,0.5)] transform hover:-translate-y-0.5'}
                    `}
                >
                    <span className="relative z-10">{isConnecting ? 'SYNCING...' : 'ESTABLISH LINK'}</span>
                    {!isConnecting && <div className="absolute inset-0 bg-white/20 opacity-0 group-hover/wallet:opacity-100 transition-opacity"></div>}
                </button>

                {showConnectors && (
                    <div className="absolute top-full mt-4 right-0 glass-panel rounded-2xl p-4 min-w-[240px] z-50 border-white/10 animate-in fade-in slide-in-from-top-4 duration-300">
                        <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase mb-4 px-2">Authorized Interfaces</p>
                        <div className="space-y-2">
                            {/* Starkzap Cartridge Connector */}
                            <button
                                onClick={async () => {
                                    setShowConnectors(false);
                                    await connectCartridge();
                                }}
                                disabled={isStarkzapConnecting}
                                className={`w-full px-4 py-4 text-left rounded-xl border border-transparent transition-all duration-300 flex items-center justify-between group/conn hover:bg-white/5 hover:border-white/10`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center border border-white/5 transition-colors group-hover/conn:border-neon-cyan/50`}>
                                        <span className="text-white font-black text-sm">C</span>
                                    </div>
                                    <span className="text-xs font-bold text-slate-300 capitalize tracking-wider group-hover/conn:text-white">
                                        Controller
                                    </span>
                                </div>
                                <div className={`w-1.5 h-1.5 rounded-full bg-white/20 group-hover/conn:bg-neon-cyan group-hover/conn:animate-pulse`}></div>
                            </button>

                            {/* React Core Connectors (Argent/Braavos) */}
                            {connectors.map((connector) => {
                                // Skip controller if it somehow still appears here
                                if (connector.id === 'controller') return null;

                                return (
                                    <button
                                        key={connector.id}
                                        onClick={async () => {
                                            setShowConnectors(false);
                                            try {
                                                await connect({ connector });
                                            } catch (error) {
                                                console.error('Connection error:', error);
                                                setShowConnectors(true);
                                            }
                                        }}
                                        className={`w-full px-4 py-4 text-left rounded-xl border border-transparent transition-all duration-300 flex items-center justify-between group/conn hover:bg-white/5 hover:border-white/10`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center border border-white/5 transition-colors group-hover/conn:border-neon-cyan/50`}>
                                                <span className="text-white font-black text-sm">
                                                    {connector.id.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-300 capitalize tracking-wider group-hover/conn:text-white">
                                                {connector.id}
                                            </span>
                                        </div>
                                        <div className={`w-1.5 h-1.5 rounded-full bg-white/20 group-hover/conn:bg-neon-cyan group-hover/conn:animate-pulse`}></div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
