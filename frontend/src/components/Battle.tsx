'use client';

import { GameBoard, type SunkShip } from './GameBoard';
import { useState, useEffect } from 'react';
import { generateProof, buildMerkleTree } from '@/lib/merkle';
import { HITS_TO_WIN } from '@/lib/contract';
import { useToast } from './Toast';

type CellState = 'unknown' | 'water' | 'ship' | 'hit' | 'miss' | 'sunk';

interface BattleProps {
    gameId: number;
    isMyTurn: boolean;
    myBoard: number[][];
    opponentHits: [number, number][];
    opponentMisses: [number, number][];
    myHits: [number, number][];
    myMisses: [number, number][];
    myHitCount: number;
    opponentHitCount: number;
    merkleRoot: bigint;
    salt: bigint;
    onAttack: (x: number, y: number) => Promise<void>;
    onReveal: (x: number, y: number, isHit: boolean, salt: string, proof: string[]) => Promise<void>;
    pendingAttack: { x: number; y: number } | null;
    moveHistory: { player: 'Admiral' | 'Opponent'; x: number; y: number; result: 'HIT' | 'MISS' | 'SUNK'; timestamp: number }[];
    playerAddress: string;
    onBack: () => void;
}


export function Battle({
    gameId,
    isMyTurn,
    myBoard,
    opponentHits,
    opponentMisses,
    myHits,
    myMisses,
    myHitCount,
    opponentHitCount,
    merkleRoot,
    salt,
    onAttack,
    onReveal,
    pendingAttack,
    moveHistory,
    playerAddress,
    onBack
}: BattleProps) {
    const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
    const [isRevealing, setIsRevealing] = useState(false);
    const { showToast } = useToast();

    // Move history is handled by parent props

    // Helper to find all connected ship cells (flood fill)
    const findShipCells = (board: number[][], startX: number, startY: number, visited: Set<string>): [number, number][] => {
        const cells: [number, number][] = [];
        const stack: [number, number][] = [[startX, startY]];

        while (stack.length > 0) {
            const [x, y] = stack.pop()!;
            const key = `${x},${y}`;

            if (visited.has(key)) continue;
            if (x < 0 || x >= 10 || y < 0 || y >= 10) continue;
            if (board[y][x] !== 1) continue;

            visited.add(key);
            cells.push([x, y]);

            // Check adjacent cells (horizontal and vertical only)
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        return cells;
    };

    // Build my board state (what I see on my board) - with sunk ship detection
    const myBoardState: CellState[][] = Array(10).fill(null).map(() => Array(10).fill('water'));
    const hitSet = new Set(opponentHits.map(([x, y]) => `${x},${y}`));
    const missSet = new Set(opponentMisses.map(([x, y]) => `${x},${y}`));
    const visitedShips = new Set<string>();

    // First pass: mark all ships and misses
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            if (myBoard[y][x] === 1) {
                myBoardState[y][x] = 'ship';
            } else if (missSet.has(`${x},${y}`)) {
                myBoardState[y][x] = 'miss';
            }
        }
    }

    // Second pass: find ships and check if they're fully hit (sunk)
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            if (myBoard[y][x] === 1 && !visitedShips.has(`${x},${y}`)) {
                const shipCells = findShipCells(myBoard, x, y, visitedShips);
                const allHit = shipCells.every(([cx, cy]) => hitSet.has(`${cx},${cy}`));

                if (allHit && shipCells.length > 0) {
                    // Mark all cells of this ship as 'sunk'
                    shipCells.forEach(([cx, cy]) => {
                        myBoardState[cy][cx] = 'sunk';
                    });
                } else {
                    // Mark hit cells as 'hit', others stay 'ship'
                    shipCells.forEach(([cx, cy]) => {
                        if (hitSet.has(`${cx},${cy}`)) {
                            myBoardState[cy][cx] = 'hit';
                        }
                    });
                }
            }
        }
    }

    // Build opponent board state (what I see on opponent's board)
    const opponentBoardState: CellState[][] = Array(10).fill(null).map(() => Array(10).fill('unknown'));
    myHits.forEach(([x, y]) => {
        opponentBoardState[y][x] = 'hit';
    });
    myMisses.forEach(([x, y]) => {
        opponentBoardState[y][x] = 'miss';
    });

    // Simple inference for opponent sunk ships (based on hit clusters)
    const opponentSunkShips: SunkShip[] = [];
    const visitedOpponent = new Set<string>();
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            if (opponentBoardState[y][x] === 'hit' && !visitedOpponent.has(`${x},${y}`)) {
                const cluster: [number, number][] = [];
                const queue: [number, number][] = [[x, y]];
                visitedOpponent.add(`${x},${y}`);

                while (queue.length > 0) {
                    const [cx, cy] = queue.shift()!;
                    cluster.push([cx, cy]);
                    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10 && opponentBoardState[ny][nx] === 'hit' && !visitedOpponent.has(`${nx},${ny}`)) {
                            visitedOpponent.add(`${nx},${ny}`);
                            queue.push([nx, ny]);
                        }
                    });
                }

                // If it looks like a ship (at least 2 hits), we mark as sunk if it's isolated by misses/unknowns
                // For simplicity, if hits > 1, we treat as a ship for visual polish
                if (cluster.length >= 2) {
                    const minX = Math.min(...cluster.map(c => c[0])), maxX = Math.max(...cluster.map(c => c[0]));
                    const minY = Math.min(...cluster.map(c => c[1])), maxY = Math.max(...cluster.map(c => c[1]));
                    const horizontal = (maxX - minX) > (maxY - minY);
                    const length = horizontal ? (maxX - minX + 1) : (maxY - minY + 1);

                    // Map length to ship type
                    const shipType = length === 5 ? 'carrier' : length === 4 ? 'battleship' : length === 3 ? 'cruiser' : 'destroyer';
                    // opponentSunkShips.push({ id: shipType, x: minX, y: minY, length, horizontal });

                    // ALSO mark these cells as 'sunk' in the grid for better visual feedback (🔥 animation)
                    cluster.forEach(([cx, cy]) => {
                        opponentBoardState[cy][cx] = 'sunk';
                    });
                }
            }
        }
    }

    // My Sunk Ships
    const mySunkShips: SunkShip[] = [];
    const visitedMy = new Set<string>();
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            if (myBoardState[y][x] === 'sunk' && !visitedMy.has(`${x},${y}`)) {
                const cluster: [number, number][] = [];
                const queue: [number, number][] = [[x, y]];
                visitedMy.add(`${x},${y}`);
                while (queue.length > 0) {
                    const [cx, cy] = queue.shift()!;
                    cluster.push([cx, cy]);
                    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dx, dy]) => {
                        const nx = cx + dx, ny = cy + dy;
                        if (nx >= 0 && nx < 10 && ny >= 0 && ny < 10 && myBoardState[ny][nx] === 'sunk' && !visitedMy.has(`${nx},${ny}`)) {
                            visitedMy.add(`${nx},${ny}`);
                            queue.push([nx, ny]);
                        }
                    });
                }
                const minX = Math.min(...cluster.map(c => c[0])), maxX = Math.max(...cluster.map(c => c[0]));
                const minY = Math.min(...cluster.map(c => c[1])), maxY = Math.max(...cluster.map(c => c[1]));
                const horizontal = (maxX - minX) > (maxY - minY);
                const length = horizontal ? (maxX - minX + 1) : (maxY - minY + 1);
                const shipType = length === 5 ? 'carrier' : length === 4 ? 'battleship' : (cluster.length === 3 ? 'cruiser' : 'destroyer');
                // mySunkShips.push({ id: shipType, x: minX, y: minY, length, horizontal });
            }
        }
    }


    const handleCellClick = async (x: number, y: number) => {
        if (!isMyTurn) return;

        // Check if already attacked
        const alreadyAttacked = myHits.some(([hx, hy]) => hx === x && hy === y) ||
            myMisses.some(([mx, my]) => mx === x && my === y);
        if (alreadyAttacked) return;

        setSelectedCell({ x, y });
    };

    const handleConfirmAttack = async () => {
        if (!selectedCell) return;

        try {
            await onAttack(selectedCell.x, selectedCell.y);
            setSelectedCell(null);
        } catch (error: any) {
            console.error('Attack failed:', error);
            showToast({
                message: error?.message?.includes('User reject') ? 'Transaction cancelled' : 'Attack failed. Please try again.',
                type: 'error'
            });
        }
    };

    const handleRevealAttack = async () => {
        if (!pendingAttack) return;

        setIsRevealing(true);
        try {
            const { x, y } = pendingAttack;
            const isHit = myBoard[y][x] === 1;

            // Generate Merkle tree to get the proof
            const { tree } = buildMerkleTree(myBoard, salt);
            const merkleProof = generateProof(tree, x, y);
            const proofStrings = merkleProof.proof.map(p => '0x' + p.toString(16));

            console.log('Revealing:', { x, y, isHit, salt: '0x' + salt.toString(16), proof: proofStrings });

            await onReveal(x, y, isHit, '0x' + salt.toString(16), proofStrings);
        } catch (error: any) {
            console.error('Reveal failed:', error);
            showToast({
                message: error?.message?.includes('User reject') ? 'Transaction cancelled' : 'Reveal failed. Please try again.',
                type: 'error'
            });
        } finally {
            setIsRevealing(false);
        }
    };

    return (
        <div className="min-h-screen pt-24 pb-12 px-8 relative overflow-hidden bg-slate-950">
            {/* Atmospheric Background Elements */}
            <div className="fixed inset-0 pointer-events-none z-[-1]">
                <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-neon-cyan/5 blur-[120px] rounded-full animate-float"></div>
                <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-neon-purple/5 blur-[120px] rounded-full animate-float" style={{ animationDelay: '2s' }}></div>
            </div>

            <div className="max-w-7xl mx-auto space-y-10">
                {/* Tactical Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 glass-panel rounded-2xl p-8 border-white/5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-neon-cyan/5 via-transparent to-transparent opacity-50"></div>

                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-3">
                            <span className="text-3xl filter drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]">⚔️</span>
                            <h1 className="text-4xl font-bold tracking-tighter t-shadow uppercase italic">
                                Tactical <span className="neon-text">Engagement</span>
                            </h1>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="space-y-0.5">
                                <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Sector Identifier</p>
                                <p className="text-sm font-mono font-bold text-white tracking-widest">#000{gameId}</p>
                            </div>
                            <div className="h-8 w-px bg-white/10"></div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Admiral Signature</p>
                                <p className="text-sm font-mono font-bold text-slate-400">{playerAddress.slice(0, 8)}...{playerAddress.slice(-6)}</p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onBack}
                        className="px-8 py-3.5 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all text-xs font-black tracking-[0.2em] group/exit relative z-10"
                    >
                        ABORT MISSION
                    </button>
                </div>

                {/* Status Hub */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
                    {/* Admiral Intel Left */}
                    <div className="glass-panel rounded-2xl p-6 flex flex-col justify-center border-white/5 group">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Intel Strength</p>
                            <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse shadow-[0_0_10px_rgba(0,247,255,0.8)]"></div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-3xl font-black font-mono text-white tracking-widest">{myHitCount}<span className="text-xs text-slate-600 font-bold ml-2">/ {HITS_TO_WIN}</span></p>
                            <p className="text-[10px] text-neon-cyan font-bold tracking-widest uppercase">Sectors Neutralized</p>
                        </div>
                    </div>

                    {/* Turn Notification Center */}
                    <div className="relative group/turn-hub col-span-1 md:col-span-2">
                        <div className={`
                            h-full flex flex-col items-center justify-center rounded-2xl p-8 border-2 transition-all duration-700
                            ${isMyTurn
                                ? 'bg-neon-cyan/10 border-neon-cyan shadow-[0_0_40px_rgba(0,247,255,0.2)]'
                                : 'bg-white/5 border-white/10 opacity-70'}
                        `}>
                            <div className="text-center space-y-3 relative z-10">
                                <p className={`text-[10px] font-black tracking-[0.4em] uppercase ${isMyTurn ? 'text-neon-cyan animate-pulse' : 'text-slate-500'}`}>
                                    {isMyTurn ? 'Offensive Priority' : 'Awaiting Opponent Response'}
                                </p>
                                <h2 className="text-2xl font-black text-white tracking-widest uppercase leading-tight italic">
                                    {isMyTurn ? 'Execute Attack' : 'Defensive Maneuvers'}
                                </h2>
                            </div>

                            {isMyTurn && (
                                <div className="absolute inset-0 bg-neon-cyan/5 rounded-2xl animate-[pulse-ring_2s_infinite]"></div>
                            )}
                        </div>
                    </div>

                    {/* Enemy Intel Right */}
                    <div className="glass-panel rounded-2xl p-6 flex flex-col justify-center border-white/5 text-right">
                        <div className="flex items-center justify-between mb-4 flex-row-reverse">
                            <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase">Hull Integrity</p>
                            <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-3xl font-black font-mono text-white tracking-widest">{opponentHitCount}<span className="text-xs text-slate-600 font-bold ml-2">/ {HITS_TO_WIN}</span></p>
                            <p className="text-[10px] text-red-500 font-bold tracking-widest uppercase">Sectors Compromised</p>
                        </div>
                    </div>
                </div>

                {/* Engagement Sector Selection */}
                <div className="grid lg:grid-cols-[1fr_320px] gap-10 items-start pb-20">
                    <div className="space-y-10">
                        <div className="grid md:grid-cols-2 gap-10">
                            {/* Enemy Board - PRIMARY ATTACK TARGET */}
                            <div className="flex flex-col items-center gap-6">
                                <div className="text-center">
                                    <h3 className="text-xl font-black text-neon-cyan tracking-widest uppercase italic">Targeting Sensor</h3>
                                    <p className="text-[10px] text-slate-600 font-bold tracking-widest uppercase mt-1">Acquire coordinates in enemy sector</p>
                                </div>

                                <div className="relative group/attack-board">
                                    <div className="absolute -inset-10 bg-neon-cyan/5 blur-[80px] rounded-full pointer-events-none group-hover/attack-board:bg-neon-cyan/10 transition-colors duration-1000"></div>
                                    <GameBoard
                                        cells={opponentBoardState}
                                        onCellClick={isMyTurn && !pendingAttack ? handleCellClick : undefined}
                                        highlightedCells={selectedCell ? [[selectedCell.x, selectedCell.y]] : []}
                                        showShips={false}
                                        isOpponentBoard={true}
                                        sunkShips={[]}
                                    />
                                </div>

                                {isMyTurn && !pendingAttack && selectedCell && (
                                    <button
                                        onClick={handleConfirmAttack}
                                        className="w-full max-w-xs py-4 bg-neon-cyan hover:bg-neon-cyan/90 text-slate-950 rounded-xl font-black text-[10px] tracking-[0.3em] uppercase transition-all duration-300 shadow-[0_8px_30px_rgba(0,247,255,0.4)] hover:shadow-[0_12px_45px_rgba(0,247,255,0.6)] transform hover:-translate-y-1 active:scale-95"
                                    >
                                        Initiate Strike: {String.fromCharCode(65 + selectedCell.x)}{selectedCell.y + 1}
                                    </button>
                                )}
                            </div>

                            {/* My Board - DEFENSIVE STATION */}
                            <div className="flex flex-col items-center gap-6">
                                <div className="text-center">
                                    <h3 className="text-xl font-black text-slate-300 tracking-widest uppercase italic">Fleet Disposition</h3>
                                    <p className="text-[10px] text-slate-600 font-bold tracking-widest uppercase mt-1">Ship integrity and tactical positioning</p>
                                </div>

                                <div className="relative group/defend-board">
                                    <div className="absolute -inset-10 bg-neon-purple/5 blur-[80px] rounded-full pointer-events-none group-hover/defend-board:bg-neon-purple/10 transition-colors duration-1000"></div>
                                    <GameBoard
                                        cells={myBoardState}
                                        showShips={true}
                                        pendingAttack={pendingAttack}
                                        sunkShips={[]}
                                    />
                                </div>

                                {pendingAttack && (
                                    <div className="w-full max-w-xs space-y-4">
                                        <div className="p-3 rounded-xl bg-yellow-400/5 border border-yellow-400/20 text-center">
                                            <p className="text-[10px] text-yellow-400 font-bold tracking-[0.2em] uppercase animate-pulse">Incoming Strike Detected</p>
                                            <p className="text-[10px] text-slate-400 mt-1">Sector {String.fromCharCode(65 + pendingAttack.x)}{pendingAttack.y + 1}</p>
                                        </div>
                                        <button
                                            onClick={handleRevealAttack}
                                            disabled={isRevealing}
                                            className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-400 hover:to-orange-500 text-white rounded-xl font-black text-[10px] tracking-[0.3em] uppercase transition-all duration-300 shadow-[0_8px_30px_rgba(250,204,21,0.3)] disabled:opacity-50"
                                        >
                                            {isRevealing ? 'SYNCING...' : 'VERIFY INTEGRITY'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tactical Comms Panel */}
                    <div className="glass-panel rounded-2xl border-white/5 flex flex-col h-[600px] sticky top-24">
                        <div className="p-6 border-b border-white/5">
                            <h3 className="text-xs font-black text-white tracking-[0.3em] uppercase italic flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse"></span>
                                Tactical Comms
                            </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                            {moveHistory.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-30">
                                    <span className="text-4xl">📡</span>
                                    <p className="text-[10px] font-bold tracking-widest uppercase">Channels Silent</p>
                                </div>
                            ) : (
                                moveHistory.map((move, i) => (
                                    <div key={i} className={`p-4 rounded-xl border animate-in slide-in-from-right-4 duration-500 ${move.player === 'Admiral' ? 'bg-neon-cyan/5 border-neon-cyan/20' : 'bg-red-500/5 border-red-500/20'}`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <p className={`text-[8px] font-black tracking-widest uppercase ${move.player === 'Admiral' ? 'text-neon-cyan' : 'text-red-500'}`}>
                                                [{move.player}]
                                            </p>
                                            <p className="text-[8px] text-slate-600 font-mono">T+{Math.floor((Date.now() - move.timestamp) / 1000)}s</p>
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-300 tracking-wider">
                                            Strike at <span className="text-white italic">{String.fromCharCode(65 + move.x)}{move.y + 1}</span>
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-black tracking-widest uppercase ${move.result === 'HIT' ? 'bg-red-500/20 text-red-500' : 'bg-slate-500/20 text-slate-500'}`}>
                                                {move.result}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="p-4 bg-white/5 border-t border-white/5">
                            <p className="text-[8px] text-slate-500 font-black tracking-widest uppercase text-center">Encrypted Data Link Active</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
