'use client';

import { BOARD_SIZE, getColumnLabel, getRowLabel, getCellNotation } from '@/lib/board';

export type CellState = 'unknown' | 'water' | 'ship' | 'hit' | 'miss' | 'sunk';

export interface SunkShip {
    id: string; // carrier, battleship, cruiser, submarine, destroyer
    x: number;
    y: number;
    length: number;
    horizontal: boolean;
}

interface GameBoardProps {
    cells: CellState[][];
    onCellClick?: (x: number, y: number) => void;
    showShips?: boolean;
    isOpponentBoard?: boolean;
    disabled?: boolean;
    highlightedCells?: [number, number][];
    pendingAttack?: { x: number; y: number } | null;
    sunkShips?: SunkShip[];
}

export function GameBoard({
    cells,
    onCellClick,
    showShips = true,
    isOpponentBoard = false,
    disabled = false,
    highlightedCells = [],
    pendingAttack,
    sunkShips = [],
}: GameBoardProps) {
    const getCellColor = (state: CellState, x: number, y: number) => {
        const isPending = pendingAttack?.x === x && pendingAttack?.y === y;
        const isHighlighted = highlightedCells.some(([hx, hy]) => hx === x && hy === y);

        if (isPending) {
            return 'bg-yellow-400/20 border-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.4)] animate-pulse';
        }

        switch (state) {
            case 'hit':
                return 'bg-gradient-to-br from-red-500/40 to-orange-600/40 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.4)]';
            case 'miss':
                return 'bg-slate-800/40 border-white/5 opacity-60';
            case 'sunk':
                return 'bg-gradient-to-br from-red-800/20 to-black/40 border-red-600/50';
            case 'ship':
                return showShips
                    ? `bg-gradient-to-br from-neon-cyan/40 to-blue-600/40 border-white/20 shadow-[0_0_10px_rgba(0,247,255,0.3)] ${isHighlighted ? 'ring-2 ring-white/40 border-white/40' : ''}`
                    : 'bg-white/[0.03] border-white/5';
            case 'water':
                return 'bg-white/[0.03] border-white/5';
            case 'unknown':
            default:
                return 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.08] hover:border-neon-cyan/40';
        }
    };

    const handleCellClick = (x: number, y: number) => {
        if (disabled || !onCellClick) return;
        if (cells[y][x] !== 'unknown' && isOpponentBoard) return;
        onCellClick(x, y);
    };

    return (
        <div className="inline-block relative group/board p-4">
            {/* Board Background Glow */}
            <div className="absolute -inset-4 bg-neon-cyan/5 blur-3xl opacity-0 group-hover/board:opacity-100 transition-opacity duration-1000 pointer-events-none"></div>

            <div className="relative">
                {/* Top Labels (A-J) */}
                <div className="grid grid-cols-[32px_1fr] mb-2">
                    <div /> {/* Spacer for row labels */}
                    <div className="grid grid-cols-10 gap-1 px-1.5">
                        {Array.from({ length: BOARD_SIZE }, (_, i) => (
                            <div
                                key={`col-${i}`}
                                className="w-10 flex items-center justify-center text-[10px] text-slate-500 font-mono font-black tracking-widest uppercase transition-colors group-hover/board:text-neon-cyan/60"
                            >
                                {getColumnLabel(i)}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex">
                    {/* Left Labels (1-10) */}
                    <div className="grid grid-rows-10 gap-1 py-1.5 mr-2">
                        {Array.from({ length: BOARD_SIZE }, (_, i) => (
                            <div
                                key={`row-${i}`}
                                className="h-10 w-8 flex items-center justify-end pr-2 text-[10px] text-slate-500 font-mono font-black tracking-widest transition-colors group-hover/board:text-neon-cyan/60"
                            >
                                {getRowLabel(i)}
                            </div>
                        ))}
                    </div>

                    {/* Main Grid Area */}
                    <div className="glass-panel p-1.5 rounded-xl border-white/10 relative bg-slate-900/40 backdrop-blur-md">
                        {/* Scanline Animation */}
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-neon-cyan/5 to-transparent h-20 w-full -translate-y-full animate-[scan_4s_linear_infinite] pointer-events-none z-30"></div>

                        <div className="grid grid-cols-10 gap-1 relative z-10">
                            {cells.map((row, y) =>
                                row.map((cell, x) => (
                                    <button
                                        key={`${x}-${y}`}
                                        onClick={() => handleCellClick(x, y)}
                                        disabled={disabled || (isOpponentBoard && cell !== 'unknown')}
                                        className={`
                                            w-10 h-10 rounded-lg border transition-all duration-300 relative group/cell overflow-hidden
                                            ${getCellColor(cell, x, y)}
                                            ${!disabled && onCellClick && (cell === 'unknown' || !isOpponentBoard)
                                                ? 'cursor-pointer hover:scale-[1.05] active:scale-95 z-20 hover:border-neon-cyan/50 hover:shadow-[0_0_15px_rgba(0,247,255,0.2)]'
                                                : 'cursor-default'}
                                        `}
                                        title={getCellNotation(x, y)}
                                    >
                                        {/* Cell Detail Dots */}
                                        <div className="absolute top-1 left-1 w-0.5 h-0.5 rounded-full bg-white/10"></div>

                                        {cell === 'hit' && (
                                            <div className="relative z-10 animate-in zoom-in duration-300">
                                                <span className="text-xl filter drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">💥</span>
                                            </div>
                                        )}
                                        {cell === 'miss' && (
                                            <div className="relative flex items-center justify-center w-full h-full">
                                                <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] animate-pulse"></div>
                                                <div className="absolute inset-0 bg-white/10 rounded-full animate-ping"></div>
                                            </div>
                                        )}
                                        {cell === 'sunk' && (
                                            <div className="relative z-10 animate-pulse">
                                                <span className="text-xl filter drop-shadow-[0_0_12px_rgba(153,27,27,0.9)] opacity-40">🔥</span>
                                            </div>
                                        )}

                                        {/* Sub-grid highlight on hover */}
                                        {!disabled && (
                                            <div className="absolute inset-0 bg-neon-cyan/5 opacity-0 group-hover/cell:opacity-100 transition-opacity pointer-events-none"></div>
                                        )}
                                    </button>
                                ))
                            )}

                            {/* Sunk Ship Overlays */}
                            {sunkShips.map((ship, idx) => {
                                const width = ship.horizontal ? ship.length * 40 + (ship.length - 1) * 4 : 40;
                                const height = ship.horizontal ? 40 : ship.length * 40 + (ship.length - 1) * 4;
                                const left = ship.x * (40 + 4);
                                const top = ship.y * (40 + 4);

                                return (
                                    <div
                                        key={`sunk-${idx}`}
                                        className="absolute pointer-events-none z-20 animate-in fade-in zoom-in duration-1000"
                                        style={{
                                            width: `${width}px`,
                                            height: `${height}px`,
                                            left: `${left}px`,
                                            top: `${top}px`,
                                        }}
                                    >
                                        <img
                                            src={`/ships/${ship.id}.png`}
                                            alt={ship.id}
                                            className={`w-full h-full object-contain opacity-80 filter brightness-125 saturate-150 drop-shadow-[0_0_20px_rgba(0,247,255,0.4)] ${!ship.horizontal ? 'rotate-90' : ''}`}
                                        />
                                        {/* Sunk Highlight */}
                                        <div className="absolute inset-0 bg-red-500/10 border border-red-500/30 rounded-lg backdrop-blur-[2px]"></div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
