'use client';

import { useState, useCallback } from 'react';
import { Ship, SHIP_TEMPLATES, getShipCells, isValidPlacement, createEmptyBoard, generateBoard, BOARD_SIZE } from '@/lib/board';
import { GameBoard, CellState } from './GameBoard';

interface ShipPlacementProps {
    onPlacementComplete: (board: number[][], ships: Ship[]) => void;
}

export function ShipPlacement({ onPlacementComplete }: ShipPlacementProps) {
    const [ships, setShips] = useState<Ship[]>(
        SHIP_TEMPLATES.map(t => ({
            ...t,
            x: 0,
            y: 0,
            horizontal: true,
            placed: false,
        }))
    );
    const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
    const [isHorizontal, setIsHorizontal] = useState(true);

    const board = generateBoard(ships);

    const getCellStates = (): CellState[][] => {
        const states: CellState[][] = Array.from({ length: BOARD_SIZE }, () =>
            Array.from({ length: BOARD_SIZE }, () => 'water' as CellState)
        );

        for (const ship of ships) {
            if (ship.placed) {
                for (const [x, y] of getShipCells(ship)) {
                    states[y][x] = 'ship';
                }
            }
        }

        return states;
    };

    const handleCellClick = useCallback((x: number, y: number) => {
        if (!selectedShipId) return;

        const ship = ships.find(s => s.id === selectedShipId);
        if (!ship) return;

        const newShip: Ship = {
            ...ship,
            x,
            y,
            horizontal: isHorizontal,
            placed: true,
        };

        const placedShips = ships.filter(s => s.placed && s.id !== selectedShipId);
        const tempBoard = generateBoard(placedShips);

        if (isValidPlacement(newShip, tempBoard, placedShips)) {
            setShips(ships.map(s => s.id === selectedShipId ? newShip : s));
            setSelectedShipId(null);
        }
    }, [selectedShipId, ships, isHorizontal]);

    const handleRemoveShip = (shipId: string) => {
        setShips(ships.map(s => s.id === shipId ? { ...s, placed: false } : s));
    };

    const handleConfirm = () => {
        if (ships.every(s => s.placed)) {
            onPlacementComplete(board, ships);
        }
    };

    const unplacedShips = ships.filter(s => !s.placed);
    const placedShipsCount = ships.filter(s => s.placed).length;

    return (
        <div className="flex flex-col lg:flex-row gap-12 items-start animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Board Area */}
            <div className="flex flex-col items-center gap-10">
                <div className="text-center space-y-2">
                    <h3 className="text-4xl font-bold tracking-tighter t-shadow">CONSTRUCT <span className="neon-text">FLEET</span></h3>
                    <p className="text-[10px] text-slate-500 font-bold tracking-[0.3em] uppercase">Sector Deployment Protocol Active</p>
                </div>

                <div className="relative group/board-container">
                    <div className="absolute -inset-10 bg-neon-cyan/5 blur-[100px] rounded-full pointer-events-none group-hover/board-container:opacity-100 opacity-50 transition-opacity duration-1000"></div>
                    <GameBoard
                        cells={getCellStates()}
                        onCellClick={handleCellClick}
                        showShips={true}
                        disabled={!selectedShipId}
                    />
                </div>

                <div className="flex gap-6 w-full max-w-sm">
                    <button
                        onClick={() => setIsHorizontal(!isHorizontal)}
                        className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all font-bold text-xs tracking-[0.2em] uppercase group/btn overflow-hidden relative"
                    >
                        <span className="relative z-10 flex items-center justify-center gap-3">
                            <span className={`transition-transform duration-500 ${isHorizontal ? '' : 'rotate-90'}`}>↔️</span>
                            {isHorizontal ? 'HORIZONTAL' : 'VERTICAL'}
                        </span>
                        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover/btn:opacity-100 transition-opacity"></div>
                    </button>
                    <button
                        onClick={() => setShips(ships.map(s => ({ ...s, placed: false })))}
                        className="px-6 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 transition-all font-bold text-xs tracking-[0.2em] uppercase"
                    >
                        RESET
                    </button>
                </div>
            </div>

            {/* Ship selection panel */}
            <div className="glass-panel rounded-2xl p-8 min-w-[340px] relative overflow-hidden group/panel">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <svg className="w-20 h-20 text-white" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="5,5" />
                        <path d="M50 5 L50 95 M5 50 L95 50" stroke="currentColor" strokeWidth="1" />
                    </svg>
                </div>

                <div className="flex justify-between items-end mb-8 relative z-10">
                    <div>
                        <h3 className="text-2xl font-bold text-white tracking-tight">Vessels</h3>
                        <p className="text-[10px] text-slate-500 font-black tracking-widest uppercase mt-1">Allocation Required</p>
                    </div>
                    <div className="text-right">
                        <p className="text-2xl font-mono font-black text-neon-cyan leading-none">{placedShipsCount}<span className="text-xs text-slate-600 ml-1">/6</span></p>
                    </div>
                </div>

                <div className="space-y-3 mb-10 relative z-10">
                    {ships.map(ship => (
                        <div
                            key={ship.id}
                            className={`
                                group/ship flex items-center justify-between p-4 rounded-xl transition-all duration-300 cursor-pointer border
                                ${ship.placed
                                    ? 'bg-neon-cyan/5 border-neon-cyan/20 opacity-60'
                                    : selectedShipId === ship.id
                                        ? 'bg-neon-purple/10 border-neon-purple/50 shadow-[0_0_20px_rgba(188,19,254,0.2)]'
                                        : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/[0.08]'}
                            `}
                            onClick={() => !ship.placed && setSelectedShipId(ship.id)}
                        >
                            <div className="flex items-center gap-4">
                                <div className="flex gap-1">
                                    {Array.from({ length: ship.length }, (_, i) => (
                                        <div
                                            key={i}
                                            className={`w-3.5 h-3.5 rounded-sm transition-all duration-500 ${ship.placed
                                                    ? 'bg-neon-cyan shadow-[0_0_8px_rgba(0,247,255,0.6)]'
                                                    : selectedShipId === ship.id
                                                        ? 'bg-neon-purple shadow-[0_0_8px_rgba(188,19,254,0.6)]'
                                                        : 'bg-white/20'
                                                }`}
                                        />
                                    ))}
                                </div>
                                <span className={`text-[11px] font-black tracking-widest uppercase ${ship.placed ? 'text-neon-cyan' :
                                        selectedShipId === ship.id ? 'text-neon-purple' : 'text-slate-300'
                                    }`}>
                                    {ship.name}
                                </span >
                            </div >
                            {ship.placed && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveShip(ship.id);
                                    }}
                                    className="p-1 px-2 rounded bg-white/5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all text-[10px] font-black"
                                >
                                    REMOVE
                                </button>
                            )}
                        </div >
                    ))}
                </div >

                {unplacedShips.length > 0 ? (
                    <div className="mb-8 p-4 rounded-xl bg-neon-purple/5 border border-neon-purple/20 animate-pulse">
                        <p className="text-[10px] text-neon-purple font-black tracking-widest uppercase leading-relaxed">
                            Awaiting coordinate input for {ships.find(s => s.id === selectedShipId)?.name || 'Next Vessel'}
                        </p>
                    </div>
                ) : (
                    <div className="mb-8 p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                        <p className="text-[10px] text-green-400 font-black tracking-widest uppercase leading-relaxed">
                            Fleet configuration complete. Signal strength optimal.
                        </p>
                    </div>
                )}

                <button
                    onClick={handleConfirm}
                    disabled={!ships.every(s => s.placed)}
                    className={`
                        w-full py-4 rounded-xl font-black text-xs tracking-[0.3em] uppercase transition-all duration-500 relative overflow-hidden group/confirm
                        ${ships.every(s => s.placed)
                            ? 'bg-gradient-to-r from-neon-cyan to-blue-600 text-slate-950 shadow-[0_0_30px_rgba(0,247,255,0.4)] hover:shadow-[0_0_50px_rgba(0,247,255,0.6)]'
                            : 'bg-white/5 text-slate-600 cursor-not-allowed border border-white/5'}
                    `}
                >
                    <span className="relative z-10">{ships.every(s => s.placed) ? 'INITIALIZE COMBAT' : 'AWAITING DISPOSITION'}</span>
                    {ships.every(s => s.placed) && (
                        <div className="absolute inset-0 bg-white opacity-0 group-hover/confirm:opacity-20 transition-opacity"></div>
                    )}
                </button>
            </div >
        </div >
    );
}
