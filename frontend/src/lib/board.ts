/**
 * Board utilities for StarkFleet Clash
 * Handles ship placement, validation, and serialization
 */

export interface Ship {
    id: string;
    name: string;
    length: number;
    x: number;
    y: number;
    horizontal: boolean;
    placed: boolean;
}

export interface PlacedShip extends Ship {
    cells: [number, number][];
}

export const SHIP_TEMPLATES: Omit<Ship, 'x' | 'y' | 'horizontal' | 'placed'>[] = [
    { id: 'carrier', name: 'Carrier', length: 5 },
    { id: 'battleship', name: 'Battleship', length: 4 },
    { id: 'cruiser1', name: 'Cruiser', length: 3 },
    { id: 'cruiser2', name: 'Cruiser', length: 3 },
    { id: 'submarine', name: 'Submarine', length: 3 },
    { id: 'destroyer', name: 'Destroyer', length: 2 },
];

export const BOARD_SIZE = 10;
export const TOTAL_SHIP_CELLS = 17;

/**
 * Create initial empty board (10x10 of zeros)
 */
export function createEmptyBoard(): number[][] {
    return Array.from({ length: BOARD_SIZE }, () =>
        Array.from({ length: BOARD_SIZE }, () => 0)
    );
}

/**
 * Get all cells occupied by a ship
 */
export function getShipCells(ship: Ship): [number, number][] {
    const cells: [number, number][] = [];
    for (let i = 0; i < ship.length; i++) {
        const x = ship.horizontal ? ship.x + i : ship.x;
        const y = ship.horizontal ? ship.y : ship.y + i;
        cells.push([x, y]);
    }
    return cells;
}

/**
 * Check if a ship placement is valid
 */
export function isValidPlacement(
    ship: Ship,
    board: number[][],
    existingShips: Ship[]
): boolean {
    const cells = getShipCells(ship);

    // Check bounds
    for (const [x, y] of cells) {
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
            return false;
        }
    }

    // Check no overlap with existing ships
    for (const [x, y] of cells) {
        if (board[y][x] !== 0) {
            return false;
        }
    }

    // Check no adjacent ships (including diagonal)
    for (const [x, y] of cells) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE) {
                    // Check if this adjacent cell belongs to another ship
                    for (const other of existingShips) {
                        if (other.id === ship.id) continue;
                        const otherCells = getShipCells(other);
                        if (otherCells.some(([ox, oy]) => ox === nx && oy === ny)) {
                            return false;
                        }
                    }
                }
            }
        }
    }

    return true;
}

/**
 * Place a ship on the board
 */
export function placeShip(board: number[][], ship: Ship): number[][] {
    const newBoard = board.map(row => [...row]);
    const cells = getShipCells(ship);
    for (const [x, y] of cells) {
        newBoard[y][x] = 1;
    }
    return newBoard;
}

/**
 * Remove a ship from the board
 */
export function removeShip(board: number[][], ship: Ship): number[][] {
    const newBoard = board.map(row => [...row]);
    const cells = getShipCells(ship);
    for (const [x, y] of cells) {
        newBoard[y][x] = 0;
    }
    return newBoard;
}

/**
 * Count total ship cells on board
 */
export function countShipCells(board: number[][]): number {
    return board.flat().filter(cell => cell === 1).length;
}

/**
 * Check if all ships are placed correctly
 */
export function isFleetComplete(ships: Ship[]): boolean {
    const placedShips = ships.filter(s => s.placed);
    return placedShips.length === SHIP_TEMPLATES.length;
}

/**
 * Generate board from placed ships
 */
export function generateBoard(ships: Ship[]): number[][] {
    let board = createEmptyBoard();
    for (const ship of ships) {
        if (ship.placed) {
            board = placeShip(board, ship);
        }
    }
    return board;
}

/**
 * Column labels (A-J)
 */
export function getColumnLabel(x: number): string {
    return String.fromCharCode(65 + x); // A = 65
}

/**
 * Row labels (1-10)
 */
export function getRowLabel(y: number): string {
    return String(y + 1);
}

/**
 * Coordinate notation (e.g., "A1", "J10")
 */
export function getCellNotation(x: number, y: number): string {
    return `${getColumnLabel(x)}${getRowLabel(y)}`;
}
