/**
 * React hooks for StarkFleet Clash contract interactions
 * Using direct account.execute for better control
 */

import { useAccount } from '@starknet-react/core';
import { Contract, RpcProvider, AccountInterface } from 'starknet';
import { STARKFLEET_CONTRACT_ADDRESS, STARKFLEET_ABI, NETWORK, RPC_URLS, STARKFLEET_STRK_TOKEN_ADDRESS } from './contract';
import { useState } from 'react';
import { useStarkzap } from '@/components/StarkzapProvider';

// STRK token address
const STRK_TOKEN_ADDRESS = STARKFLEET_STRK_TOKEN_ADDRESS;

// Create a dedicated RPC provider for read-only calls
// Using the Alchemy RPC endpoint for reliable read queries
const RPC_URL = NETWORK === 'mainnet' ? RPC_URLS.mainnet : RPC_URLS.sepolia;
const rpcProvider = new RpcProvider({ nodeUrl: RPC_URL });

/**
 * Helper hook to retrieve the currently active signing account,
 * whether it's through the Starkzap Wallet or Starknet-React.
 */
export function useActiveAccount(): AccountInterface | undefined {
    const { account: reactAccount } = useAccount();
    const { wallet } = useStarkzap();

    // Prefer Starkzap's connected wallet account if available
    if (wallet) {
        try {
            return wallet.getAccount() as any as AccountInterface;
        } catch (e) {
            console.warn('Starkzap wallet has no account accessible:', e);
        }
    }

    return reactAccount as any as AccountInterface;
}

/**
 * CRITICAL: This hook routes execute() through the CartridgeWallet layer
 * (which applies session keys) rather than the raw account.
 * Calling account.execute() directly bypasses session keys and
 * causes Cartridge to show approval popups for every transaction.
 */
export function useWalletExecute() {
    const { account: reactAccount } = useAccount();
    const { wallet } = useStarkzap();

    const execute = async (calls: any | any[]): Promise<{ transaction_hash: string }> => {
        const callsArray = Array.isArray(calls) ? calls : [calls];

        // If Cartridge wallet is connected, go through wallet.execute() to apply session keys
        if (wallet) {
            const tx = await (wallet as any).execute(callsArray);
            // CartridgeWallet returns a Tx object with .hash
            const hash = tx?.hash ?? tx?.transaction_hash;
            if (!hash) throw new Error('No transaction hash returned from wallet.execute()');
            return { transaction_hash: hash };
        }

        // Fallback: standard Argent/Braavos account
        if (reactAccount) {
            return (reactAccount as any).execute(callsArray);
        }

        throw new Error('No wallet connected');
    };

    const isConnected = !!wallet || !!reactAccount;

    return { execute, isConnected };
}

/**
 * Hook to create a new game with STRK approval
 */
export function useCreateGame() {
    const { execute, isConnected } = useWalletExecute();
    const account = useActiveAccount();
    const [isPending, setIsPending] = useState(false);
    const [data, setData] = useState<any>(null);

    const createGame = async (stakeAmount: string) => {
        if (!isConnected) throw new Error('Wallet not connected');

        setIsPending(true);
        try {
            const stakeInWei = BigInt(Math.floor(parseFloat(stakeAmount) * 1e18));

            console.log('Creating game with stake:', stakeAmount, 'STRK');
            console.log('Stake in wei:', stakeInWei.toString());

            const approveCall = {
                contractAddress: STRK_TOKEN_ADDRESS,
                entrypoint: 'approve',
                calldata: [
                    STARKFLEET_CONTRACT_ADDRESS,
                    stakeInWei.toString(),
                    '0'
                ]
            };

            const createGameCall = {
                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                entrypoint: 'create_game',
                calldata: [
                    stakeInWei.toString(),
                    '0'
                ]
            };


            const result = await execute([approveCall, createGameCall]);
            console.log('Transaction sent:', result.transaction_hash);

            // Try to wait for transaction and get receipt, but don't fail if it times out
            try {
                console.log('Waiting for transaction confirmation...');
                if (account?.waitForTransaction) {
                    await Promise.race([
                        account.waitForTransaction(result.transaction_hash),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
                    ]);
                } else {
                    await Promise.race([
                        rpcProvider.waitForTransaction(result.transaction_hash),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
                    ]);
                }

                // Get the transaction receipt to extract the game ID from events
                // Note: starkzap account provides similar interface 
                const receipt = account && 'getTransactionReceipt' in account && typeof account.getTransactionReceipt === 'function'
                    ? await (account as unknown as any).getTransactionReceipt(result.transaction_hash)
                    : await rpcProvider.getTransactionReceipt(result.transaction_hash);
                console.log('Transaction receipt:', receipt);

                setData({ ...result, receipt });
                setIsPending(false);
                return { ...result, receipt };
            } catch (waitError) {
                console.warn('Could not wait for transaction or get receipt:', waitError);
                // Return without receipt - user will need to enter game ID manually
                setData(result);
                setIsPending(false);
                return result;
            }
        } catch (error) {
            console.error('Failed to create game:', error);
            setIsPending(false);
            throw error;
        }
    };

    return { createGame, data, isPending };
}

/**
 * Hook to join an existing game
 */
export function useJoinGame() {
    const { execute, isConnected } = useWalletExecute();
    const [isPending, setIsPending] = useState(false);
    const [data, setData] = useState<any>(null);

    const joinGame = async (gameId: number, stakeAmount: string) => {
        if (!isConnected) throw new Error('Wallet not connected');

        setIsPending(true);
        try {
            const stakeInWei = BigInt(Math.floor(parseFloat(stakeAmount) * 1e18));

            const approveCall = {
                contractAddress: STRK_TOKEN_ADDRESS,
                entrypoint: 'approve',
                calldata: [
                    STARKFLEET_CONTRACT_ADDRESS,
                    stakeInWei.toString(),
                    '0'
                ]
            };

            const joinGameCall = {
                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                entrypoint: 'join_game',
                calldata: [gameId.toString()]
            };

            const result = await execute([approveCall, joinGameCall]);
            console.log('Joined game:', result.transaction_hash);

            setData(result);
            setIsPending(false);
            return result;
        } catch (error) {
            console.error('Failed to join game:', error);
            setIsPending(false);
            throw error;
        }
    };

    return { joinGame, data, isPending };
}

/**
 * Hook to commit board Merkle root
 */
export function useCommitBoard() {
    const { execute } = useWalletExecute();
    const [isPending, setIsPending] = useState(false);
    const [data, setData] = useState<any>(null);

    const commitBoard = async (gameId: number, merkleRoot: string) => {
        setIsPending(true);
        try {
            const result = await execute({
                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                entrypoint: 'commit_board',
                calldata: [gameId.toString(), merkleRoot]
            });

            console.log('Board committed:', result.transaction_hash);
            setData(result);
            setIsPending(false);
            return result;
        } catch (error) {
            console.error('Failed to commit board:', error);
            setIsPending(false);
            throw error;
        }
    };

    return { commitBoard, data, isPending };
}

/**
 * Hook to attack a cell
 */
export function useAttack() {
    const { execute } = useWalletExecute();
    const [isPending, setIsPending] = useState(false);
    const [data, setData] = useState<any>(null);

    const attack = async (gameId: number, x: number, y: number) => {
        setIsPending(true);
        try {
            const result = await execute({
                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                entrypoint: 'attack',
                calldata: [gameId.toString(), x.toString(), y.toString()]
            });

            console.log('Attack sent:', result.transaction_hash);
            setData(result);
            setIsPending(false);
            return result;
        } catch (error) {
            console.error('Failed to attack:', error);
            setIsPending(false);
            throw error;
        }
    };

    return { attack, data, isPending };
}

/**
 * Hook to reveal a cell with Merkle proof
 */
export function useReveal() {
    const { execute } = useWalletExecute();
    const [isPending, setIsPending] = useState(false);
    const [data, setData] = useState<any>(null);

    const reveal = async (
        gameId: number,
        x: number,
        y: number,
        isHit: boolean,
        salt: string,
        proof: string[]
    ) => {
        setIsPending(true);
        try {
            const result = await execute({
                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                entrypoint: 'reveal',
                calldata: [
                    gameId.toString(),
                    x.toString(),
                    y.toString(),
                    isHit ? '1' : '0',
                    salt,
                    proof.length.toString(),
                    ...proof
                ]
            });

            console.log('Reveal sent:', result.transaction_hash);
            setData(result);
            setIsPending(false);
            return result;
        } catch (error) {
            console.error('Failed to reveal:', error);
            setIsPending(false);
            throw error;
        }
    };

    return { reveal, data, isPending };
}

/**
 * Hook to get total game count
 */
export function useGameCount() {
    const [gameCount, setGameCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch and return the count directly (useful when you need the value immediately)
    const fetchGameCount = async (): Promise<number> => {
        try {
            const result = await rpcProvider.callContract({
                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                entrypoint: 'get_game_count',
                calldata: []
            }, 'latest');

            const data: any = (result as any).result || result;
            if (data && data.length > 0) {
                const count = Number(data[0]);
                console.log('Game count from contract:', count);
                setGameCount(count);
                return count;
            }
        } catch (error) {
            console.error('Failed to get game count:', error);
        }
        return 0;
    };

    const refetch = async () => {
        setIsLoading(true);
        await fetchGameCount();
        setIsLoading(false);
    };

    return { gameCount, isLoading, refetch, fetchGameCount };
}

/**
 * Hook to get game details
 */
export function useGame(gameId: number | null) {
    const account = useActiveAccount();
    const [game, setGame] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    const refetch = async (overrideId?: number) => {
        const targetId = overrideId !== undefined ? overrideId : gameId;
        if (targetId === null) return;

        setIsLoading(true);
        try {
            // Use our dedicated RPC provider to avoid wallet CORS issues
            const result = await rpcProvider.callContract({
                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                entrypoint: 'get_game',
                calldata: [targetId.toString()]
            }, 'latest'); // Use 'latest' instead of 'pending' for Alchemy v0_10 compatibility

            // Parse raw felts
            // Game struct layout:
            // 0: id (u64)
            // 1: player1 (Address)
            // 2: player2 (Address)
            // 3: player1_root (felt)
            // 4: player2_root (felt)
            // 5: stake_amount_low (u128)
            // 6: stake_amount_high (u128)
            // 7: current_turn (Address)
            // 8: player1_hits (u8)
            // 9: player2_hits (u8)
            // 10: last_move_time (u64)
            // 11: status (Enum index)
            // 12: winner (Address)
            // 13: pending_attack_x (u8)
            // 14: pending_attack_y (u8)
            // 15: has_pending_attack (bool)

            const data: any = (result as any).result || result; // Handle both types of response formats
            console.log('Raw game data:', data);

            if (!data || !data.length) {
                console.error('No data returned from contract for game:', targetId);
                setGame(null);
                return;
            }

            const parsedGame = {
                id: Number(data[0]),
                player1: data[1],
                player2: data[2],
                player1_root: data[3],
                player2_root: data[4],
                stake_amount: (BigInt(data[6]) << BigInt(128)) | BigInt(data[5]),
                current_turn: data[7],
                player1_hits: Number(data[8]),
                player2_hits: Number(data[9]),
                last_move_time: Number(data[10]),
                status: Number(data[11]),
                winner: data[12],
                pending_attack_x: Number(data[13]),
                pending_attack_y: Number(data[14]),
                has_pending_attack: Number(data[15]) !== 0
            };

            setGame(parsedGame);
            console.log('Game details (parsed):', parsedGame);
        } catch (error) {
            console.error('Failed to get game:', error);
            setGame(null);
        } finally {
            setIsLoading(false);
        }
    };

    return { game, isLoading, refetch };
}

/**
 * Hook to get all games for a player
 */
export function usePlayerGames(playerAddress: string | undefined) {
    const [games, setGames] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const refetch = async () => {
        if (!playerAddress) {
            setGames([]);
            return;
        }

        setIsLoading(true);
        try {
            // We'll need to query games by checking game IDs
            // Since we don't have a direct "get all games for player" function,
            // we'll check localStorage for game IDs this player has participated in
            const seenGameIds = new Set<number>();
            const playerGames: any[] = [];

            // Check localStorage for all game IDs
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(`game_`) && key.includes(playerAddress)) {
                    // Extract game ID from key like "game_9_0x123..._creator"
                    const parts = key.split('_');
                    if (parts.length >= 2) {
                        const gameId = parseInt(parts[1]);
                        // Skip invalid game IDs (0, NaN, or already seen)
                        if (isNaN(gameId) || gameId <= 0 || seenGameIds.has(gameId)) {
                            continue;
                        }
                        seenGameIds.add(gameId);

                        try {
                            // Fetch game details from contract using our RPC provider
                            const result = await rpcProvider.callContract({
                                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                                entrypoint: 'get_game',
                                calldata: [gameId.toString()]
                            }, 'latest');

                            const data: any = (result as any).result || result;
                            if (data && data.length) {
                                const parsedGame = {
                                    id: Number(data[0]),
                                    player1: data[1],
                                    player2: data[2],
                                    player1_root: data[3],
                                    player2_root: data[4],
                                    stake_amount: (BigInt(data[6]) << BigInt(128)) | BigInt(data[5]),
                                    current_turn: data[7],
                                    player1_hits: Number(data[8]),
                                    player2_hits: Number(data[9]),
                                    last_move_time: Number(data[10]),
                                    status: Number(data[11]),
                                    winner: data[12],
                                    pending_attack_x: Number(data[13]),
                                    pending_attack_y: Number(data[14]),
                                    has_pending_attack: Number(data[15]) !== 0
                                };

                                // Only add if player is actually in this game and game ID > 0
                                const isPlayer = BigInt(parsedGame.player1) === BigInt(playerAddress) ||
                                    BigInt(parsedGame.player2) === BigInt(playerAddress);
                                if (isPlayer && parsedGame.id > 0) {
                                    playerGames.push(parsedGame);
                                }
                            }
                        } catch (error) {
                            console.error(`Failed to fetch game ${gameId}:`, error);
                        }
                    }
                }
            }

            // Sort by game ID (most recent first)
            playerGames.sort((a, b) => b.id - a.id);
            setGames(playerGames);
        } catch (error) {
            console.error('Failed to get player games:', error);
            setGames([]);
        } finally {
            setIsLoading(false);
        }
    };

    return { games, isLoading, refetch };
}

/**
 * Hook to claim victory and receive reward
 */
export function useClaimVictory() {
    const { execute } = useWalletExecute();
    const account = useActiveAccount();
    const [isPending, setIsPending] = useState(false);
    const [data, setData] = useState<any>(null);

    const claimVictory = async (gameId: number) => {
        setIsPending(true);
        try {
            const result = await execute({
                contractAddress: STARKFLEET_CONTRACT_ADDRESS,
                entrypoint: 'claim_victory',
                calldata: [gameId.toString()]
            });

            console.log('Victory claimed:', result.transaction_hash);

            // Wait for transaction confirmation (best-effort)
            try {
                if (account?.waitForTransaction) {
                    await Promise.race([
                        account.waitForTransaction(result.transaction_hash),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 30000))
                    ]);
                }
            } catch (waitError) {
                console.warn('Could not wait for transaction:', waitError);
            }

            setData(result);
            setIsPending(false);
            return result;
        } catch (error) {
            console.error('Failed to claim victory:', error);
            setIsPending(false);
            throw error;
        }
    };

    return { claimVictory, data, isPending };
}
