/**
 * Pedersen-based Merkle Tree for StarkFleet Clash
 * Compatible with the Cairo contract's verify_proof function
 */

import { pedersen } from '@scure/starknet';

// Pedersen hash wrapper for compatibility
const computePedersenHash = (a: bigint, b: bigint): bigint => {
    return BigInt(pedersen(a, b));
};

export interface MerkleProof {
    leaf: bigint;
    proof: bigint[];
    leafIndex: number;
}

export interface MerkleTreeResult {
    root: bigint;
    leaves: bigint[];
    tree: bigint[][];
}

/**
 * Compute leaf hash for a board cell
 * Must match Cairo: pedersen(pedersen(pedersen(x, y), cell_value), salt)
 */
export function computeLeaf(
    x: number,
    y: number,
    cellValue: number,
    salt: bigint
): bigint {
    const h1 = computePedersenHash(BigInt(x), BigInt(y));
    const h2 = computePedersenHash(h1, BigInt(cellValue));
    return computePedersenHash(h2, salt);
}

/**
 * Convert (x, y) coordinates to leaf index
 * Must match Cairo: y * 10 + x (row-major order)
 */
export function coordsToIndex(x: number, y: number): number {
    return y * 10 + x;
}

/**
 * Convert leaf index back to coordinates
 */
export function indexToCoords(index: number): [number, number] {
    return [index % 10, Math.floor(index / 10)];
}

/**
 * Build a Merkle tree from board data
 * @param board 10x10 grid where 0 = water, 1 = ship
 * @param salt Random salt for privacy
 */
export function buildMerkleTree(
    board: number[][],
    salt: bigint
): MerkleTreeResult {
    if (board.length !== 10 || !board.every(row => row.length === 10)) {
        throw new Error('Board must be 10x10');
    }

    // Generate all 100 leaves
    const leaves: bigint[] = [];
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const cellValue = board[y][x];
            const leaf = computeLeaf(x, y, cellValue, salt);
            leaves.push(leaf);
        }
    }

    // Pad to 128 leaves (next power of 2 >= 100) for balanced tree
    const paddedLeaves = [...leaves];
    while (paddedLeaves.length < 128) {
        paddedLeaves.push(BigInt(0));
    }

    // Build tree bottom-up
    const tree: bigint[][] = [paddedLeaves];
    let currentLevel = paddedLeaves;

    while (currentLevel.length > 1) {
        const nextLevel: bigint[] = [];
        for (let i = 0; i < currentLevel.length; i += 2) {
            const left = currentLevel[i];
            const right = currentLevel[i + 1];
            const parent = computePedersenHash(left, right);
            nextLevel.push(parent);
        }
        tree.push(nextLevel);
        currentLevel = nextLevel;
    }

    return {
        root: tree[tree.length - 1][0],
        leaves,
        tree,
    };
}

/**
 * Generate Merkle proof for a specific cell
 */
export function generateProof(
    tree: bigint[][],
    x: number,
    y: number
): MerkleProof {
    const leafIndex = coordsToIndex(x, y);
    const leaf = tree[0][leafIndex];
    const proof: bigint[] = [];

    let index = leafIndex;
    for (let level = 0; level < tree.length - 1; level++) {
        const isLeft = index % 2 === 0;
        const siblingIndex = isLeft ? index + 1 : index - 1;
        proof.push(tree[level][siblingIndex]);
        index = Math.floor(index / 2);
    }

    return { leaf, proof, leafIndex };
}

/**
 * Verify a Merkle proof (for testing)
 */
export function verifyProof(
    root: bigint,
    leaf: bigint,
    proof: bigint[],
    leafIndex: number
): boolean {
    let currentHash = leaf;
    let index = leafIndex;

    for (const sibling of proof) {
        if (index % 2 === 0) {
            currentHash = computePedersenHash(currentHash, sibling);
        } else {
            currentHash = computePedersenHash(sibling, currentHash);
        }
        index = Math.floor(index / 2);
    }

    return currentHash === root;
}

/**
 * Generate a random salt for the game
 */
export function generateSalt(): bigint {
    const bytes = new Uint8Array(31); // 248 bits to stay under felt252 max
    crypto.getRandomValues(bytes);
    let salt = BigInt(0);
    for (const byte of bytes) {
        salt = (salt << BigInt(8)) | BigInt(byte);
    }
    return salt;
}
