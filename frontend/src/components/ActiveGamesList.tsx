'use client';

import { useState, useEffect } from 'react';
import { useGameCount } from '@/lib/hooks';
import { RpcProvider } from 'starknet';
import { STARKFLEET_CONTRACT_ADDRESS, RPC_URLS, NETWORK } from '@/lib/contract';

const rpcProvider = new RpcProvider({ nodeUrl: RPC_URLS[NETWORK as keyof typeof RPC_URLS] });

interface ActiveGame {
    id: number;
    creator: string;
    stakeAmount: string;
    lastMoveTime: number;
}

interface ActiveGamesListProps {
    onJoinGame: (gameId: number, stakeAmount: string) => void;
}

export function ActiveGamesList({ onJoinGame }: ActiveGamesListProps) {
    const { gameCount, refetch: refetchGameCount } = useGameCount();
    const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [onlineUsers, setOnlineUsers] = useState(0);

    useEffect(() => {
        refetchGameCount();
    }, [refreshTrigger]);

    // Auto-refresh every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setRefreshTrigger(prev => prev + 1);
        }, 30000);
        return () => clearInterval(interval);
    }, []);

    // Simulate online users based on game activity
    useEffect(() => {
        if (gameCount) {
            // Base users on game count + random variance
            const base = Math.max(12, Number(gameCount) * 2);
            setOnlineUsers(base + Math.floor(Math.random() * 8));
        }
    }, [gameCount]);

    useEffect(() => {
        const fetchActiveGames = async () => {
            if (!gameCount || gameCount === 0) {
                setLoading(false);
                return;
            }

            setLoading(true);
            const games: ActiveGame[] = [];

            // Fetch recent games (last 20)
            const startId = Math.max(1, gameCount - 19);

            for (let id = gameCount; id >= startId; id--) {
                try {
                    const result = await rpcProvider.callContract({
                        contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                        entrypoint: 'get_game',
                        calldata: [id.toString()]
                    }, 'latest');

                    const data: any = (result as any).result || result;

                    if (data && data.length) {
                        const status = Number(data[11]);
                        const player2 = data[2];
                        const hasPlayer2 = player2 && BigInt(player2) !== BigInt(0);

                        // Only show games waiting for opponent (status 0) with no player2
                        if (status === 0 && !hasPlayer2) {
                            const stakeLow = BigInt(data[5]);
                            const stakeHuman = (Number(stakeLow) / 1e18).toFixed(2);

                            games.push({
                                id: Number(data[0]),
                                creator: data[1],
                                stakeAmount: stakeHuman,
                                lastMoveTime: Number(data[10])
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Failed to fetch game ${id}:`, error);
                }
            }

            setActiveGames(games);
            setLoading(false);
        };

        if (gameCount && gameCount > 0) {
            fetchActiveGames();
        }
    }, [gameCount, refreshTrigger]);

    const formatAddress = (addr: string) => {
        if (!addr) return 'Unknown';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    const formatTime = (timestamp: number) => {
        if (!timestamp) return 'Just now';
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        return `${Math.floor(diffMinutes / 60)}h ago`;
    };

    return (
        <div className="w-full max-w-5xl mx-auto glass-panel rounded-2xl overflow-hidden shadow-2xl relative group/lobby">
            {/* Mission Control Header */}
            <div className="flex flex-col md:flex-row items-center justify-between px-8 py-6 border-b border-white/5 bg-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-neon-cyan/5 via-transparent to-transparent pointer-events-none"></div>

                <div className="flex items-center gap-10 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)]"></div>
                            <div className="absolute inset-x-0 inset-y-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-75"></div>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Deployed Admirals</p>
                            <p className="text-2xl font-bold font-mono text-white leading-none">{onlineUsers}</p>
                        </div>
                    </div>

                    <div className="h-10 w-px bg-white/10 hidden md:block"></div>

                    <div className="flex items-center gap-4">
                        <div className="p-2 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20">
                            <svg className="w-5 h-5 text-neon-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[10px] font-black tracking-[0.2em] text-slate-500 uppercase">Active Contingencies</p>
                            <p className="text-2xl font-bold font-mono text-neon-cyan leading-none">{activeGames.length}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 md:mt-0 flex items-center gap-4">
                    <button
                        onClick={() => setRefreshTrigger(prev => prev + 1)}
                        disabled={loading}
                        className="flex items-center gap-3 px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all font-bold text-xs tracking-widest disabled:opacity-50 group/refresh"
                    >
                        <svg
                            className={`w-4 h-4 transition-transform duration-700 ${loading ? 'animate-spin' : 'group-hover/refresh:rotate-180'}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.28m0 0l-4 4m4-4l-4-4m0 9v5h.28m0 0l-4 4m4-4l-4-4" />
                        </svg>
                        SCAN FREQUENCIES
                    </button>
                </div>
            </div>

            {/* List Content */}
            <div className="max-h-[550px] overflow-y-auto p-6 space-y-4 custom-scrollbar bg-black/20">
                {loading && activeGames.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-32 space-y-6">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full border-t-2 border-r-2 border-neon-cyan animate-spin opacity-40"></div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-8 h-8 rounded-full border-b-2 border-l-2 border-neon-purple animate-spin-slow opacity-60"></div>
                            </div>
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-neon-cyan tracking-[0.4em] font-black text-[10px] uppercase animate-pulse">Scanning Frequencies...</p>
                            <p className="text-slate-500 text-xs font-medium italic">Triangulating active battle signatures in sector</p>
                        </div>
                    </div>
                ) : activeGames.length === 0 ? (
                    <div className="text-center py-24 rounded-2xl border border-dashed border-white/5 bg-white/[0.02]">
                        <div className="text-6xl mb-6 opacity-20 filter grayscale">📡</div>
                        <p className="text-white font-bold text-xl mb-2 tracking-tight">Zero Signals Detected</p>
                        <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
                            No active battle contingencies found. Establish a new sector to lead the fleet.
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        {activeGames.map(game => (
                            <div
                                key={game.id}
                                className="group relative overflow-hidden bg-white/5 hover:bg-white/[0.08] rounded-2xl p-6 border border-white/5 hover:border-neon-cyan/30 transition-all duration-500"
                            >
                                {/* Background Hex Pattern or Mesh Effect */}
                                <div className="absolute inset-y-0 right-0 w-64 bg-gradient-to-l from-neon-cyan/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"></div>

                                <div className="flex flex-col sm:flex-row justify-between items-center gap-6 relative z-10">
                                    <div className="flex items-center gap-6 w-full sm:w-auto">
                                        <div className="w-16 h-16 rounded-2xl bg-slate-950 flex items-center justify-center border border-white/10 group-hover:border-neon-cyan/50 transition-all duration-500 shadow-2xl relative">
                                            <div className="text-neon-cyan font-black font-mono text-lg">#{game.id}</div>
                                            <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-neon-cyan rounded-full animate-pulse shadow-[0_0_10px_rgba(0,247,255,0.8)]"></div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-3">
                                                <span className="text-white text-lg font-bold tracking-tight">
                                                    Admiral {formatAddress(game.creator)}
                                                </span>
                                                <div className="px-2 py-0.5 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                                                    <p className="text-[9px] font-black text-yellow-400 tracking-[0.1em] uppercase">Recruiting</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4 text-[11px] text-slate-500 font-bold uppercase tracking-widest">
                                                <span className="flex items-center gap-2">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    Last Pulse: {formatTime(game.lastMoveTime)}
                                                </span>
                                                <span className="h-1 w-1 rounded-full bg-white/20"></span>
                                                <span className="text-white/40">Standard Sector</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between sm:justify-end gap-10 w-full sm:w-auto mt-4 sm:mt-0 pt-4 sm:pt-0 border-t border-white/5 sm:border-t-0">
                                        <div className="text-left sm:text-right">
                                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-1">Bounty Potential</p>
                                            <p className="text-3xl font-black text-white tracking-widest leading-none">
                                                {game.stakeAmount} <span className="text-xs text-slate-500 font-bold ml-1">STRK</span>
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => onJoinGame(game.id, game.stakeAmount)}
                                            className="px-8 py-3.5 bg-neon-cyan hover:bg-neon-cyan/90 text-slate-950 font-black rounded-xl transition-all duration-300 shadow-[0_4px_20px_rgba(0,247,255,0.4)] hover:shadow-[0_8px_30px_rgba(0,247,255,0.6)] transform hover:-translate-y-0.5 active:scale-95 text-xs tracking-[0.2em] uppercase"
                                        >
                                            Engage
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
