'use client';

import { useState, useEffect } from 'react';
import { useAccount } from '@starknet-react/core';
import { WalletConnector } from '@/components/WalletConnector';
import { useStarkzap } from '@/components/StarkzapProvider';
import { ShipPlacement } from '@/components/ShipPlacement';
import { Battle } from '@/components/Battle';
import { Ship } from '@/lib/board';
import { buildMerkleTree, generateSalt } from '@/lib/merkle';
import { useCreateGame, useCommitBoard, useGameCount, useJoinGame, useGame, useAttack, useReveal, usePlayerGames, useClaimVictory } from '@/lib/hooks';
import { ActiveGamesList } from '@/components/ActiveGamesList';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';
import { HITS_TO_WIN, HOUSE_FEE_BPS } from '@/lib/contract';
import { useToast } from '@/components/Toast';

type GamePhase = 'landing' | 'creating' | 'placement' | 'committing' | 'waiting' | 'battle' | 'victory';

export default function Home() {
  const { address: reactAddress, status: reactStatus } = useAccount();
  const { wallet } = useStarkzap();
  const { showToast } = useToast();

  const address = reactAddress || (wallet ? wallet.getAccount().address : undefined);
  const status = reactStatus === 'connected' || !!wallet ? 'connected' : 'disconnected';

  const [gamePhase, setGamePhase] = useState<GamePhase>('landing');
  const [stakeAmount, setStakeAmount] = useState('1');
  const [gameId, setGameId] = useState<number | null>(null);
  const [joinGameId, setJoinGameId] = useState('');
  const [resumeGameId, setResumeGameId] = useState('');
  const [merkleData, setMerkleData] = useState<{
    root: bigint;
    salt: bigint;
    board: number[][];
  } | null>(null);
  const [myHits, setMyHits] = useState<[number, number][]>([]);
  const [myMisses, setMyMisses] = useState<[number, number][]>([]);
  const [opponentHits, setOpponentHits] = useState<[number, number][]>([]);
  const [opponentMisses, setOpponentMisses] = useState<[number, number][]>([]);
  const [moveHistory, setMoveHistory] = useState<{ player: 'Admiral' | 'Opponent'; x: number; y: number; result: 'HIT' | 'MISS' | 'SUNK'; timestamp: number }[]>([]);
  const [hasCommitted, setHasCommitted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [prevHasPendingAttack, setPrevHasPendingAttack] = useState<boolean | null>(null);
  const [hasClaimed, setHasClaimed] = useState(false);

  const { createGame, isPending: isCreating } = useCreateGame();
  const { joinGame, isPending: isJoining } = useJoinGame();
  const { commitBoard, isPending: isCommitting } = useCommitBoard();
  const { attack, isPending: isAttacking } = useAttack();
  const { reveal, isPending: isRevealing } = useReveal();
  const { gameCount, refetch: refetchGameCount, fetchGameCount } = useGameCount();
  const { game, refetch: refetchGame } = useGame(gameId);
  const { games: playerGames, refetch: refetchPlayerGames } = usePlayerGames(address);
  const { claimVictory, isPending: isClaiming } = useClaimVictory();

  const clearGameStorage = (targetGameId: number) => {
    if (!address) return;
    const prefix = `game_${targetGameId}_${address}`;
    localStorage.removeItem(`${prefix}_my_hits`);
    localStorage.removeItem(`${prefix}_my_misses`);
    localStorage.removeItem(`${prefix}_opponent_hits`);
    localStorage.removeItem(`${prefix}_opponent_misses`);
    localStorage.removeItem(`${prefix}_move_history`);
    localStorage.removeItem(`${prefix}_merkle_root`);
    localStorage.removeItem(`${prefix}_salt`);
    localStorage.removeItem(`${prefix}_board`);
    localStorage.removeItem(`${prefix}_pending_attack`);
    localStorage.removeItem(`${prefix}_committed`);
    console.log(`Cleared local storage for game ${targetGameId}`);
  };

  const resetGameState = () => {
    setMyHits([]);
    setMyMisses([]);
    setOpponentHits([]);
    setOpponentMisses([]);
    setMoveHistory([]);
    setMerkleData(null);
    setHasCommitted(false);
    setHasClaimed(false);
    setPrevHasPendingAttack(null);
  };

  // Poll game status when in battle
  useEffect(() => {
    if ((gamePhase === 'waiting' || gamePhase === 'battle') && gameId) {
      const interval = setInterval(() => {
        refetchGame();
      }, 5000); // Poll every 5 seconds

      return () => clearInterval(interval);
    }
  }, [gamePhase, gameId, refetchGame]);

  // Check if we should transition to battle phase and update commit status
  useEffect(() => {
    if (game && gamePhase === 'waiting' && merkleData && address) {
      // Game status enum: 0=WaitingForOpponent, 1=WaitingForCommitments, 2=InProgress, 3=Finished, 4=Forfeited
      const status = game.status;
      console.log('Game status:', status);

      // Check if current player has committed
      const isPlayer1 = BigInt(game.player1) === BigInt(address);
      const myRoot = isPlayer1 ? game.player1_root : game.player2_root;
      const hasCommittedBoard = myRoot !== '0x0' && myRoot !== '0' && BigInt(myRoot) !== BigInt(0);

      console.log('Commit status check:', {
        isPlayer1,
        myRoot,
        hasCommittedBoard,
        player1Root: game.player1_root,
        player2Root: game.player2_root
      });

      setHasCommitted(hasCommittedBoard);

      if (status === 2) {
        console.log('Both players committed! Starting battle...');
        setGamePhase('battle');
      }
    }
  }, [game, gamePhase, merkleData, address]);

  // Check for victory
  useEffect(() => {
    if (game && gamePhase === 'battle') {
      const player1Hits = game.player1_hits;
      const player2Hits = game.player2_hits;

      if (player1Hits >= HITS_TO_WIN || player2Hits >= HITS_TO_WIN) {
        setGamePhase('victory');
      }
    }
  }, [game, gamePhase]);

  // Track attack results for the attacker - only when pending attack is cleared
  useEffect(() => {
    if (game && gamePhase === 'battle' && address && gameId) {
      const pendingKey = `game_${gameId}_${address}_pending_attack`;
      const pendingStr = localStorage.getItem(pendingKey);
      const currentPending = game.has_pending_attack;

      // Only process when has_pending_attack transitions from true to false
      // AND we have a pending attack saved locally
      if (pendingStr && prevHasPendingAttack === true && currentPending === false) {
        // The reveal just happened!
        const pending = JSON.parse(pendingStr);
        const isPlayer1 = BigInt(game.player1) === BigInt(address);

        // Check if our hit count increased
        const currentHits = isPlayer1 ? game.player1_hits : game.player2_hits;
        const hitsKey = `game_${gameId}_${address}_my_hits`;
        const missesKey = `game_${gameId}_${address}_my_misses`;

        const savedHits: [number, number][] = JSON.parse(localStorage.getItem(hitsKey) || '[]');
        const savedMisses: [number, number][] = JSON.parse(localStorage.getItem(missesKey) || '[]');

        // Total tracked attacks so far
        const totalTracked = savedHits.length + savedMisses.length;
        const totalContractHits = currentHits;

        const historyKey = `game_${gameId}_${address}_move_history`;
        const savedHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');

        // If contract hits > tracked hits, this attack was a hit
        if (totalContractHits > savedHits.length) {
          console.log('Detected HIT through contract state update at', pending.x, pending.y);
          const newHits: [number, number][] = [...savedHits, [pending.x, pending.y]];
          setMyHits(newHits);
          localStorage.setItem(hitsKey, JSON.stringify(newHits));

          const newMove = { player: 'Admiral' as const, x: pending.x, y: pending.y, result: 'HIT' as const, timestamp: Date.now() };
          const updatedHistory = [newMove, ...savedHistory].slice(0, 15);
          setMoveHistory(updatedHistory);
          localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
        } else {
          console.log('Detected MISS through contract state update at', pending.x, pending.y);
          const newMisses: [number, number][] = [...savedMisses, [pending.x, pending.y]];
          setMyMisses(newMisses);
          localStorage.setItem(missesKey, JSON.stringify(newMisses));

          const newMove = { player: 'Admiral' as const, x: pending.x, y: pending.y, result: 'MISS' as const, timestamp: Date.now() };
          const updatedHistory = [newMove, ...savedHistory].slice(0, 15);
          setMoveHistory(updatedHistory);
          localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
        }

        // Clear pending attack
        localStorage.removeItem(pendingKey);
      }

      // Update previous state
      setPrevHasPendingAttack(currentPending);
    }
  }, [game, gamePhase, address, gameId, prevHasPendingAttack]);

  // Fetch game data when entering waiting phase
  useEffect(() => {
    if (gamePhase === 'waiting' && gameId && !game) {
      console.log('Fetching game data for waiting screen...');
      refetchGame();
    }
  }, [gamePhase, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch game count and player games when wallet connects
  useEffect(() => {
    if (address) {
      refetchGameCount();
      refetchPlayerGames();
    }
  }, [address]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync hit history from localStorage whenever gameId/address changes
  useEffect(() => {
    if (gameId && address) {
      const savedMyHits = localStorage.getItem(`game_${gameId}_${address}_my_hits`);
      const savedMyMisses = localStorage.getItem(`game_${gameId}_${address}_my_misses`);
      const savedOpponentHits = localStorage.getItem(`game_${gameId}_${address}_opponent_hits`);
      const savedOpponentMisses = localStorage.getItem(`game_${gameId}_${address}_opponent_misses`);
      const savedHistory = localStorage.getItem(`game_${gameId}_${address}_move_history`);

      setMyHits(savedMyHits ? JSON.parse(savedMyHits) : []);
      setMyMisses(savedMyMisses ? JSON.parse(savedMyMisses) : []);
      setOpponentHits(savedOpponentHits ? JSON.parse(savedOpponentHits) : []);
      setOpponentMisses(savedOpponentMisses ? JSON.parse(savedOpponentMisses) : []);
      setMoveHistory(savedHistory ? JSON.parse(savedHistory) : []);

      console.log('Synced tactical history for game', gameId);
    }
  }, [gameId, address]);

  const handleCreateGame = async () => {
    if (!address || status !== 'connected') return;

    try {
      setGamePhase('creating');
      console.log('Creating game with stake:', stakeAmount, 'STRK');

      const result = await createGame(stakeAmount);
      console.log('Game created! TX:', result.transaction_hash);

      // Extract game ID from events
      let newGameId: number | null = null;

      if ('receipt' in result && result.receipt && 'events' in result.receipt) {
        // Look for GameCreated event
        const events = (result.receipt as any).events || [];
        console.log('Transaction events:', events);

        for (const event of events) {
          // Cairo 1.x events put #[key] fields in event.keys (e.g. keys[1]), not data.
          const allValues = [...(event.keys || []), ...(event.data || [])];

          for (const val of allValues) {
            try {
              const potentialGameId = parseInt(val, 16);
              // Event selectors, player addresses, and stake amounts in wei are massive numbers.
              // A valid game ID is a small integer.
              if (potentialGameId > 0 && potentialGameId < 1000000) {
                newGameId = potentialGameId;
                console.log('Found game ID from event:', newGameId);
                break;
              }
            } catch (e) {
              // Continue searching
            }
          }
          if (newGameId) break;
        }
      }

      // Fallback: use game count to determine game ID
      if (!newGameId) {
        console.log('Could not extract game ID from events, using game count fallback...');

        // Wait a moment for the transaction to be indexed
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Fetch the latest game count directly (returns the value)
        const latestCount = await fetchGameCount();

        // The new game ID should be the current game count (games are 1-indexed)
        if (latestCount && latestCount > 0) {
          newGameId = latestCount;
          console.log('Using fetched game count as game ID:', newGameId);
        } else {
          // Last resort
          console.log('Game count unavailable, cannot determine game ID');
          showToast({ message: 'Game created! Please check your transaction on Voyager and use "Resume Game" with your game ID.', type: 'success' });
          setGamePhase('landing');
          return;
        }
      }

      setGameId(newGameId);

      // Ensure all states are fresh for a new game
      clearGameStorage(newGameId);
      resetGameState();

      localStorage.setItem('currentGameId', newGameId.toString());
      localStorage.setItem('stakeAmount', stakeAmount);
      localStorage.setItem(`game_${newGameId}_${address}_creator`, 'true'); // Mark as creator

      setGamePhase('placement');
    } catch (error) {
      console.error('Failed to create game:', error);
      setGamePhase('landing');
      showToast({ message: 'Failed to create game. Make sure you have enough STRK tokens and gas fees.', type: 'error' });
    }
  };

  const handleResumeGame = async (gameIdOverride?: number) => {
    if (!address || status !== 'connected') return;

    const gameIdToResume = gameIdOverride || (resumeGameId ? parseInt(resumeGameId) : null);
    if (!gameIdToResume) return;

    try {
      const gameIdNum = gameIdToResume;

      // First, fetch game state from contract to verify it exists and player is in it
      console.log('Fetching game state for resume...', gameIdNum);
      setGameId(gameIdNum);
      await refetchGame(gameIdNum);

      // Wait for game data to be fetched
      await new Promise(resolve => setTimeout(resolve, 1500));

      const { RpcProvider } = await import('starknet');
      const { STARKFLEET_CONTRACT_ADDRESS, NETWORK, RPC_URLS } = await import('@/lib/contract');
      const provider = new RpcProvider({ nodeUrl: NETWORK === 'mainnet' ? RPC_URLS.mainnet : RPC_URLS.sepolia });

      const result = await provider.callContract({
        contractAddress: STARKFLEET_CONTRACT_ADDRESS,
        entrypoint: 'get_game',
        calldata: [gameIdNum.toString()]
      }, 'latest');

      const data: any = (result as any).result || result;
      if (!data || data.length < 3) {
        showToast({ message: 'Game not found. Please check the game ID.', type: 'error' });
        setGameId(null);
        return;
      }

      const gamePlayer1 = data[1];
      const gamePlayer2 = data[2];

      // Verify player is actually in this game
      const isPlayer1 = BigInt(gamePlayer1) === BigInt(address);
      const isPlayer2 = gamePlayer2 && BigInt(gamePlayer2) !== BigInt(0) && BigInt(gamePlayer2) === BigInt(address);

      if (!isPlayer1 && !isPlayer2) {
        // Player is NOT in this game - check if they can join
        const hasPlayer2 = gamePlayer2 && BigInt(gamePlayer2) !== BigInt(0);
        if (!hasPlayer2) {
          showToast({ message: 'You are not in this game. Would you like to join it instead? Use the "Join Game" option.', type: 'success' });
        } else {
          showToast({ message: 'You are not a participant in this game.', type: 'error' });
        }
        setGameId(null);
        return;
      }

      // Try to load saved data from localStorage
      const savedRoot = localStorage.getItem(`game_${gameIdNum}_${address}_merkle_root`);
      const savedSalt = localStorage.getItem(`game_${gameIdNum}_${address}_salt`);
      const savedBoard = localStorage.getItem(`game_${gameIdNum}_${address}_board`);

      if (!savedRoot || !savedSalt || !savedBoard) {
        // No localStorage data but player IS in game - they need to place ships
        console.log('Player is in game but no board data - going to placement');
        localStorage.setItem(`game_${gameIdNum}_${address}_creator`, isPlayer1 ? 'true' : 'false');
        setGamePhase('placement');
        return;
      }


      const root = BigInt(savedRoot);
      const salt = BigInt(savedSalt);
      const board = JSON.parse(savedBoard);

      setMerkleData({ root, salt, board });

      // Load attack history from localStorage
      const savedMyHits = localStorage.getItem(`game_${gameIdNum}_${address}_my_hits`);
      const savedMyMisses = localStorage.getItem(`game_${gameIdNum}_${address}_my_misses`);
      const savedOpponentHits = localStorage.getItem(`game_${gameIdNum}_${address}_opponent_hits`);

      if (savedMyHits) {
        setMyHits(JSON.parse(savedMyHits));
      }
      if (savedMyMisses) {
        setMyMisses(JSON.parse(savedMyMisses));
      }
      if (savedOpponentHits) {
        setOpponentHits(JSON.parse(savedOpponentHits));
      }

      // The useEffect will handle transitioning to the correct phase based on game status
      setGamePhase('waiting');

      console.log('Resumed game', gameIdNum);
    } catch (error) {
      console.error('Failed to resume game:', error);
      showToast({ message: 'Failed to resume game. Make sure the game ID is correct.', type: 'error' });
      setGameId(null);
    }
  };


  const handleJoinGame = async (gameIdOverride?: number, stakeOverride?: string) => {
    // If proceeding with override, we don't need joinGameId state
    const targetGameIdRaw = gameIdOverride?.toString() || joinGameId;

    if (!address || status !== 'connected' || !targetGameIdRaw) return;

    try {
      setGamePhase('creating');
      const gameIdNum = parseInt(targetGameIdRaw);
      const targetStake = stakeOverride || stakeAmount; // Use override or default state

      console.log('Joining game:', gameIdNum, 'with stake:', targetStake, 'STRK');

      // First, verify the game exists and is joinable
      const { RpcProvider } = await import('starknet');
      const { STARKFLEET_CONTRACT_ADDRESS, NETWORK, RPC_URLS } = await import('@/lib/contract');
      const provider = new RpcProvider({ nodeUrl: NETWORK === 'mainnet' ? RPC_URLS.mainnet : RPC_URLS.sepolia });

      try {
        const result = await provider.callContract({
          contractAddress: STARKFLEET_CONTRACT_ADDRESS,
          entrypoint: 'get_game',
          calldata: [gameIdNum.toString()]
        }, 'latest');

        const data: any = (result as any).result || result;
        console.log('Game check result:', data);

        if (!data || data.length < 3) {
          showToast({ message: `Game #${gameIdNum} not found. Please check the game ID.`, type: 'error' });
          setGamePhase('landing');
          return;
        }

        const gamePlayer1 = data[1];
        const gamePlayer2 = data[2];

        // Check if game already has player 2
        if (gamePlayer2 && BigInt(gamePlayer2) !== BigInt(0)) {
          showToast({ message: `Game #${gameIdNum} already has two players.`, type: 'error' });
          setGamePhase('landing');
          return;
        }

        // Check if trying to join own game
        if (BigInt(gamePlayer1) === BigInt(address)) {
          showToast({ message: `You are already Player 1 in this game. Use Resume instead.`, type: 'error' });
          setGamePhase('landing');
          return;
        }

        console.log('Game is valid and joinable, proceeding...');
      } catch (checkError) {
        console.error('Error checking game:', checkError);
        // Continue to try joining anyway
      }

      const result = await joinGame(gameIdNum, targetStake);
      console.log('Joined game!', result);

      setGameId(gameIdNum);

      // Ensure all states are fresh for a new game
      clearGameStorage(gameIdNum);
      resetGameState();

      localStorage.setItem(`game_${gameIdNum}_${address}_creator`, 'false'); // Mark as joiner
      localStorage.setItem('currentGameId', gameIdNum.toString());
      localStorage.setItem('stakeAmount', targetStake);

      setGamePhase('placement');
    } catch (error: any) {
      console.error('Failed to join game:', error);
      setGamePhase('landing');

      // Extract more specific error message
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      if (errorMsg.includes('Game does not exist')) {
        showToast({ message: 'Game does not exist. Please check the game ID.', type: 'error' });
      } else if (errorMsg.includes('insufficient')) {
        showToast({ message: 'Insufficient STRK balance. Please ensure you have enough tokens.', type: 'error' });
      } else {
        showToast({ message: `Failed to join game: ${errorMsg.substring(0, 100)}`, type: 'error' });
      }
    }
  };


  const handlePlacementComplete = async (board: number[][], ships: Ship[]) => {
    const salt = generateSalt();
    const merkleTree = buildMerkleTree(board, salt);

    console.log('Board placed!');
    console.log('Merkle root:', '0x' + merkleTree.root.toString(16));
    console.log('Salt:', '0x' + salt.toString(16));
    console.log('Game ID:', gameId);

    setMerkleData({
      root: merkleTree.root,
      salt,
      board,
    });

    localStorage.setItem(`game_${gameId}_${address}_merkle_root`, '0x' + merkleTree.root.toString(16));
    localStorage.setItem(`game_${gameId}_${address}_salt`, '0x' + salt.toString(16));
    localStorage.setItem(`game_${gameId}_${address}_board`, JSON.stringify(board));

    // Fetch game state to update UI
    await refetchGame();

    setGamePhase('waiting');
  };

  const handleCommitBoard = async () => {
    if (!gameId || !merkleData) return;

    try {
      setGamePhase('committing');
      console.log('Committing board for game', gameId);

      const result = await commitBoard(gameId, '0x' + merkleData.root.toString(16));
      console.log('Board committed!', result);

      // Mark as committed in localStorage
      localStorage.setItem(`game_${gameId}_${address}_committed`, 'true');

      // Update state
      setHasCommitted(true);

      // Refetch game state to update UI
      setTimeout(() => refetchGame(), 2000);

      showToast({ message: 'Board committed! Waiting for opponent to commit...', type: 'success' });
      setGamePhase('waiting');
    } catch (error: any) {
      console.error('Failed to commit board:', error);
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      showToast({ message: `Failed to commit board: ${errorMsg}`, type: 'error' });
      setGamePhase('waiting');
    }
  };

  const handleAttack = async (x: number, y: number) => {
    if (!gameId) return;

    try {
      console.log('Attacking:', x, y);
      const result = await attack(gameId, x, y);
      console.log('Attack sent!', result);

      // Store pending attack in localStorage
      localStorage.setItem(`game_${gameId}_${address}_pending_attack`, JSON.stringify({ x, y }));

      // Wait a bit then refetch game state
      setTimeout(() => refetchGame(), 3000);
    } catch (error) {
      console.error('Attack failed:', error);
      throw error;
    }
  };

  const handleReveal = async (x: number, y: number, isHit: boolean, salt: string, proof: string[]) => {
    if (!gameId || !address) return;

    try {
      console.log('Revealing:', { x, y, isHit, salt, proof });
      const result = await reveal(gameId, x, y, isHit, salt, proof);
      console.log('Reveal sent!', result);

      // Track the result in opponent's hits (since we are the defender being hit)
      if (isHit) {
        const newHits: [number, number][] = [...opponentHits, [x, y]];
        setOpponentHits(newHits);
        localStorage.setItem(`game_${gameId}_${address}_opponent_hits`, JSON.stringify(newHits));

        const historyKey = `game_${gameId}_${address}_move_history`;
        const savedHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
        const newMove = { player: 'Opponent' as const, x, y, result: 'HIT' as const, timestamp: Date.now() };
        const updatedHistory = [newMove, ...savedHistory].slice(0, 15);
        setMoveHistory(updatedHistory);
        localStorage.setItem(historyKey, JSON.stringify(updatedHistory));

        console.log('Defender: Recorded opponent hit at', x, y);
      } else {
        const newMisses: [number, number][] = [...opponentMisses, [x, y]];
        setOpponentMisses(newMisses);
        localStorage.setItem(`game_${gameId}_${address}_opponent_misses`, JSON.stringify(newMisses));

        const historyKey = `game_${gameId}_${address}_move_history`;
        const savedHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
        const newMove = { player: 'Opponent' as const, x, y, result: 'MISS' as const, timestamp: Date.now() };
        const updatedHistory = [newMove, ...savedHistory].slice(0, 15);
        setMoveHistory(updatedHistory);
        localStorage.setItem(historyKey, JSON.stringify(updatedHistory));
      }

      // Wait a bit then refetch game state
      setTimeout(() => refetchGame(), 3000);
    } catch (error) {
      console.error('Reveal failed:', error);
      throw error;
    }
  };

  // Loading screen
  if (gamePhase === 'creating' || gamePhase === 'committing') {
    return (
      <main className="min-h-screen bg-deep-space flex items-center justify-center relative overflow-hidden">
        <div className="mesh-orb-1 animate-float"></div>
        <div className="mesh-orb-2 animate-float" style={{ animationDelay: '2s' }}></div>

        <div className="text-center relative z-10 space-y-8 glass-panel p-12 rounded-3xl border-white/10">
          <div className="relative w-24 h-24 mx-auto">
            <div className="absolute inset-0 border-4 border-neon-cyan/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-neon-cyan rounded-full animate-spin"></div>
            <div className="absolute inset-4 border-4 border-neon-purple/20 rounded-full"></div>
            <div className="absolute inset-4 border-4 border-b-neon-purple rounded-full animate-[spin_1.5s_linear_infinite_reverse]"></div>
          </div>

          <div>
            <h2 className="text-3xl font-black text-white mb-2 tracking-tighter uppercase italic t-shadow">
              {gamePhase === 'creating' ? 'Initializing Sector' : 'Syncing Tactical Data'}
            </h2>
            <p className="text-[10px] text-slate-500 font-black tracking-[0.4em] uppercase">Secure Channel Transmission... Please Wait</p>
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      </main>
    );
  }

  // Ship placement screen
  if (gamePhase === 'placement') {
    return (
      <main className="min-h-screen pt-32 pb-20 px-8 relative overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-16 glass-panel p-6 rounded-2xl border-white/5">
            <div className="flex items-center gap-5">
              <div className="text-3xl filter drop-shadow-[0_0_8px_rgba(0,247,255,0.6)]">⚓</div>
              <div>
                <h1 className="text-xl font-black text-white tracking-[0.2em] uppercase neon-text">
                  Combat Preparation
                </h1>
                <p className="text-[10px] text-slate-500 font-bold tracking-[0.2em] uppercase">Sector Coordination: #000{gameId}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  setGamePhase('landing');
                  setGameId(null);
                }}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 transition-all text-[11px] font-black tracking-widest uppercase"
              >
                ABORT
              </button>
              <div className="h-8 w-px bg-white/10 mx-2"></div>
              <WalletConnector />
            </div>
          </div>

          <div className="flex justify-center">
            <ShipPlacement onPlacementComplete={handlePlacementComplete} />
          </div>
        </div>
      </main>
    );
  }

  // Battle phase
  if (gamePhase === 'battle' && game && game.id === gameId && merkleData) {
    const isPlayer1 = BigInt(game.player1) === BigInt(address || '0');
    const isMyTurn = BigInt(game.current_turn) === BigInt(address || '0');
    const pendingAttack = game.has_pending_attack
      ? { x: game.pending_attack_x, y: game.pending_attack_y }
      : null;

    // Get hit counts from contract (accurate)
    const myHitCount = isPlayer1 ? game.player1_hits : game.player2_hits;
    const opponentHitCount = isPlayer1 ? game.player2_hits : game.player1_hits;

    return (
      <Battle
        gameId={gameId!}
        isMyTurn={isMyTurn}
        myBoard={merkleData.board}
        opponentHits={opponentHits}
        opponentMisses={opponentMisses}
        myHits={myHits}
        myMisses={myMisses}
        myHitCount={myHitCount}
        opponentHitCount={opponentHitCount}
        merkleRoot={merkleData.root}
        salt={merkleData.salt}
        onAttack={handleAttack}
        onReveal={handleReveal}
        pendingAttack={pendingAttack && isMyTurn ? pendingAttack : null}
        moveHistory={moveHistory}
        playerAddress={address || ''}
        onBack={() => {
          setGamePhase('landing');
          setGameId(null);
        }}
      />
    );
  }


  // Victory screen
  if (gamePhase === 'victory' && game) {
    const isPlayer1 = BigInt(game.player1) === BigInt(address || '0');
    const player1Hits = game.player1_hits;
    const player1Won = player1Hits >= HITS_TO_WIN;
    const isWinner = (isPlayer1 && player1Won) || (!isPlayer1 && !player1Won);
    const totalPot = stakeAmount ? parseFloat(stakeAmount) * 2 : 2;
    const houseFee = totalPot * HOUSE_FEE_BPS / 10000;
    const netWinnings = totalPot - houseFee;
    const alreadyClaimed = game.status === 3;

    const handleClaimVictory = async () => {
      if (!gameId || !isWinner) return;
      try {
        await claimVictory(gameId);
        setHasClaimed(true);
      } catch (error: any) {
        console.error('Failed to claim victory:', error);
        showToast({ message: `Failed to claim: ${error?.message || 'Unknown error'}`, type: 'error' });
      }
    };

    return (
      <main className="min-h-screen bg-deep-space flex items-center justify-center p-8 relative overflow-hidden">
        {/* Victory/Defeat Background Glow */}
        <div className={`absolute inset-0 opacity-20 blur-[150px] ${isWinner ? 'bg-neon-cyan' : 'bg-red-500'}`}></div>

        <div className="max-w-2xl w-full glass-panel rounded-[2rem] p-12 text-center relative z-10 border-white/10 group">
          <div className="text-9xl mb-10 transform group-hover:scale-110 transition-transform duration-1000">
            {isWinner ? '🏆' : '💀'}
          </div>

          <div className="space-y-4 mb-10">
            <h2 className={`text-7xl font-black italic tracking-tighter uppercase ${isWinner ? 'neon-text' : 'text-red-500 t-shadow'}`}>
              {isWinner ? 'MISSION SUCCESS' : 'SYSTEM FAILURE'}
            </h2>
            <p className="text-[10px] text-slate-500 font-black tracking-[0.5em] uppercase">Engagement Report Finalized</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="glass-card rounded-2xl p-6 text-left border-white/5">
              <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase mb-2">Operation Data</p>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400">Sector:</span>
                  <span className="text-xs font-mono font-bold text-white">#000{gameId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-400">Total Bounty:</span>
                  <span className="text-xs font-mono font-bold text-white">{totalPot.toFixed(2)} STRK</span>
                </div>
              </div>
            </div>

            <div className={`glass-card rounded-2xl p-6 text-left border-white/10 ${isWinner ? 'bg-neon-cyan/5' : 'bg-red-500/5'}`}>
              <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase mb-2">Net Allocation</p>
              <div className="space-y-3">
                {isWinner ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-400">House Fee:</span>
                      <span className="text-xs font-mono font-bold text-red-400">-{houseFee.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-white/5">
                      <span className="text-sm font-bold text-white">Reward:</span>
                      <span className="text-sm font-mono font-black text-neon-cyan">{netWinnings.toFixed(4)} STRK</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm font-black text-red-400 italic">FLEET NEUTRALIZED</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {isWinner && !hasClaimed && !alreadyClaimed && (
              <button
                onClick={handleClaimVictory}
                disabled={isClaiming}
                className="w-full py-5 bg-gradient-to-r from-neon-cyan to-blue-600 text-slate-900 rounded-xl font-black text-xs tracking-[0.4em] uppercase transition-all duration-500 shadow-[0_10px_40px_rgba(0,247,255,0.4)] hover:shadow-[0_15px_60px_rgba(0,247,255,0.6)]"
              >
                {isClaiming ? 'TRANSFERRING FUNDS...' : 'CLAIM REWARD'}
              </button>
            )}

            {(hasClaimed || alreadyClaimed) && isWinner && (
              <div className="w-full py-5 bg-green-500/10 border border-green-500/30 text-green-400 rounded-xl font-black text-[10px] tracking-[0.3em] uppercase">
                ✓ TRANSFER SUCCESSFUL
              </div>
            )}

            <button
              onClick={() => {
                setGamePhase('landing');
                setGameId(null);
                setMyHits([]);
                setMyMisses([]);
                setOpponentHits([]);
                setHasClaimed(false);
              }}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all text-xs font-black tracking-[0.3em] uppercase"
            >
              RETURN TO MISSION CONTROL
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Waiting screen
  if (gamePhase === 'waiting') {
    if (!game) {
      return (
        <main className="min-h-screen bg-deep-space flex items-center justify-center p-8 relative overflow-hidden">
          <div className="text-center relative z-10">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-neon-cyan mx-auto mb-6"></div>
            <h2 className="text-2xl font-black text-white mb-2 tracking-tighter uppercase italic">Linking Core Systems</h2>
            <p className="text-[10px] text-slate-500 font-black tracking-[0.3em] uppercase">Sector Coordination: #000{gameId}</p>
          </div>
        </main>
      );
    }

    const isPlayer1 = BigInt(game.player1) === BigInt(address || '0');
    const gameHasPlayer2 = game.player2 && BigInt(game.player2) !== BigInt(0);

    return (
      <main className="min-h-screen pt-32 pb-20 px-8 relative overflow-hidden bg-deep-space">
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-neon-cyan/5 blur-[120px] rounded-full"></div>
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-neon-purple/5 blur-[120px] rounded-full"></div>
        </div>

        <div className="max-w-2xl mx-auto relative z-10 glass-panel p-10 rounded-3xl border-white/5 group">
          <div className="text-center mb-12">
            <div className="text-6xl mb-6 transform group-hover:scale-110 transition-transform duration-700 filter drop-shadow-[0_0_10px_rgba(0,247,255,0.4)]">⚓</div>
            <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-2 t-shadow">
              {hasCommitted ? 'DEPLOYMENT CONFIRMED' : gameHasPlayer2 ? 'COMBAT READINESS' : 'ESTABLISHING FREQUENCY'}
            </h2>
            <p className="text-[10px] text-slate-500 font-black tracking-[0.3em] uppercase leading-relaxed">
              {hasCommitted
                ? 'Awaiting encrypted response from opponent fleet...'
                : gameHasPlayer2
                  ? 'Sector access confirmed. Lock in fleet coordinates for ignition.'
                  : 'Sector broadcast active. Awaiting opposition engagement.'}
            </p>
          </div>

          <div className="glass-card rounded-2xl p-8 mb-10 border-white/5 space-y-6">
            <div className="flex justify-between items-end border-b border-white/5 pb-4">
              <div>
                <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Target Sector</p>
                <p className="text-2xl font-mono font-black text-white tracking-widest mt-1">#000{gameId}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Initial Stake</p>
                <p className="text-lg font-mono font-bold text-neon-cyan mt-1">{stakeAmount} <span className="text-[10px] text-slate-600">STRK</span></p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Command Role</p>
                <p className="text-xs font-bold text-white uppercase tracking-widest">{isPlayer1 ? 'Fleet Commander' : 'Assault Admiral'}</p>
              </div>
              <div className="space-y-1 text-right">
                <p className="text-[9px] text-slate-500 font-black tracking-widest uppercase">Frequency Link</p>
                <p className={`text-xs font-bold uppercase tracking-widest ${hasCommitted ? 'text-green-400' : 'text-yellow-400'}`}>
                  {hasCommitted ? 'SYNC SUCCESS' : 'PENDING'}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5">
              <p className="text-[8px] text-slate-600 font-bold tracking-[0.2em] uppercase mb-2 italic">Merkle Authority Root</p>
              <p className="text-[10px] font-mono font-medium text-slate-500 break-all bg-black/20 p-3 rounded-lg border border-white/5">
                {merkleData ? '0x' + merkleData.root.toString(16) : 'AWAITING_DATA_LOCK'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {!gameHasPlayer2 ? (
              <div className="p-6 rounded-2xl bg-neon-cyan/5 border border-neon-cyan/20 text-center space-y-4">
                <div className="inline-block px-3 py-1 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 text-[9px] text-neon-cyan font-black tracking-widest uppercase animate-pulse">
                  Broadcast Signal Active
                </div>
                <p className="text-slate-400 text-sm italic font-medium">
                  Inform Admiral of Sector <span className="text-white font-bold">#000{gameId}</span> to initiate combat protocols.
                </p>
              </div>
            ) : hasCommitted ? (
              <div className="p-6 rounded-2xl bg-green-500/5 border border-green-500/20 text-center space-y-4">
                <div className="inline-block px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-[9px] text-green-400 font-black tracking-widest uppercase">
                  Data Layer Synchronized
                </div>
                <p className="text-slate-400 text-sm italic font-medium">
                  The protocol is awaiting the final coordinate reveal from the opposing fleet.
                </p>
              </div>
            ) : (
              <button
                onClick={handleCommitBoard}
                disabled={!merkleData}
                className="w-full py-5 bg-gradient-to-r from-neon-cyan to-blue-600 text-slate-900 rounded-xl font-black text-xs tracking-[0.4em] uppercase transition-all duration-500 shadow-[0_10px_30px_rgba(0,247,255,0.4)] hover:shadow-[0_15px_50px_rgba(0,247,255,0.6)]"
              >
                LOCK FLEET COORDINATES
              </button>
            )}

            <button
              onClick={() => {
                setGamePhase('landing');
                setGameId(null);
              }}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all text-[11px] font-black tracking-[0.3em] uppercase"
            >
              ABORT TO COMMAND CENTER
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Landing page
  return (
    <main className="min-h-screen">
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 backdrop-blur-xl bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-4 transition-transform hover:scale-105 duration-300">
            <div className="text-4xl filter drop-shadow-[0_0_10px_rgba(0,247,255,0.5)]">⚓</div>
            <div>
              <h1 className="text-2xl font-bold tracking-widest neon-text">
                STARKFLEET
              </h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400 font-medium">BATTLESHIP PROTOCOL</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <WalletConnector />
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-8 pt-40 pb-20 relative">
        <div className="text-center mb-24 relative">
          <div className="inline-block px-4 py-1.5 rounded-full border border-neon-cyan/30 bg-neon-cyan/5 text-neon-cyan text-xs font-bold tracking-[0.2em] uppercase mb-8 animate-pulse">
            Protocol Status: Online
          </div>
          <h2 className="text-7xl font-bold mb-8 tracking-tighter t-shadow">
            Trustless <span className="neon-text">Battleship</span>
          </h2>
          <p className="text-2xl text-slate-300 mb-6 font-light tracking-wide max-w-3xl mx-auto leading-relaxed">
            Experience the <span className="text-white font-medium">fog of war</span> on-chain. Securely hide your fleet using zero-knowledge commitments.
          </p>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-neon-cyan to-transparent mx-auto mt-12 opacity-50"></div>
        </div>

        <div className="mb-24 animate-float" style={{ animationDelay: '1s' }}>
          <ActiveGamesList onJoinGame={handleJoinGame} />
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
          {/* Create Game Card */}
          <div className="glass-card rounded-2xl p-8 animate-float group flex flex-col">
            <div className="text-6xl mb-6 transform group-hover:scale-110 transition-transform duration-500">🎮</div>
            <h3 className="text-2xl font-bold text-neon-cyan mb-4 tracking-tight">Establish Command</h3>
            <p className="text-slate-400 mb-8 leading-relaxed text-sm flex-grow">
              Initialize a new sector. Set your bounty stake and wait for an opposing Admiral to engage.
            </p>

            <div className="mb-8 space-y-3">
              <label className="block text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Stake Configuration (STRK)</label>
              <div className="relative group/input">
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={stakeAmount}
                  onChange={(e) => setStakeAmount(e.target.value)}
                  className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white focus:border-neon-cyan/50 focus:outline-none focus:ring-1 focus:ring-neon-cyan/30 transition-all font-mono text-lg"
                  placeholder="1.0"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">STRK</div>
              </div>
            </div>

            <button
              onClick={handleCreateGame}
              disabled={status !== 'connected' || isCreating}
              className={`
                w-full py-4 rounded-xl font-bold tracking-wider transition-all duration-500 overflow-hidden relative group/btn
                ${status === 'connected' && !isCreating
                  ? 'bg-gradient-to-r from-neon-cyan to-blue-600 text-slate-900 shadow-[0_0_20px_rgba(0,247,255,0.3)] hover:shadow-[0_0_35px_rgba(0,247,255,0.5)]'
                  : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'}
              `}
            >
              <span className="relative z-10">{isCreating ? 'INITIALIZING...' : status === 'connected' ? 'CREATE SECTOR' : 'CONNECT WALLET'}</span>
              <div className="absolute inset-0 bg-white opacity-0 group-hover/btn:opacity-20 transition-opacity"></div>
            </button>
          </div>

          {/* Join Game Card */}
          <div className="glass-card rounded-2xl p-8 animate-float group flex flex-col" style={{ animationDelay: '0.2s' }}>
            <div className="text-6xl mb-6 transform group-hover:scale-110 transition-transform duration-500">🔗</div>
            <h3 className="text-2xl font-bold text-neon-purple mb-4 tracking-tight">Signal Intercept</h3>
            <p className="text-slate-400 mb-8 leading-relaxed text-sm flex-grow">
              Known coordinates found? Input the Sector ID to initiate engagement with an active fleet.
            </p>

            <div className="mb-8 space-y-3">
              <label className="block text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Coordinates (Sector ID)</label>
              <input
                type="number"
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value)}
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white focus:border-neon-purple/50 focus:outline-none focus:ring-1 focus:ring-neon-purple/30 transition-all font-mono text-lg"
                placeholder="0000"
              />
            </div>

            <button
              onClick={() => handleJoinGame()}
              disabled={status !== 'connected' || !joinGameId || isJoining}
              className={`
                w-full py-4 rounded-xl font-bold tracking-wider transition-all duration-500 overflow-hidden relative group/btn
                ${status === 'connected' && joinGameId && !isJoining
                  ? 'bg-gradient-to-r from-neon-purple to-purple-900 text-white shadow-[0_0_20px_rgba(188,19,254,0.3)] hover:shadow-[0_0_35px_rgba(188,19,254,0.5)]'
                  : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'}
              `}
            >
              <span className="relative z-10">{isJoining ? 'JOINING...' : status === 'connected' ? 'ENGAGE SECTOR' : 'CONNECT WALLET'}</span>
              <div className="absolute inset-0 bg-white opacity-0 group-hover/btn:opacity-10 transition-opacity"></div>
            </button>
          </div>

          {/* Resume Game Card */}
          <div className="glass-card rounded-2xl p-8 animate-float group flex flex-col" style={{ animationDelay: '0.4s' }}>
            <div className="text-6xl mb-6 transform group-hover:scale-110 transition-transform duration-500">🎯</div>
            <h3 className="text-2xl font-bold text-white/90 mb-4 tracking-tight">Restore Comms</h3>
            <p className="text-slate-400 mb-8 leading-relaxed text-sm flex-grow">
              Return to your active command center. Resume a battle already in progress.
            </p>

            <div className="mb-8 space-y-3">
              <label className="block text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Active Sector ID</label>
              <input
                type="number"
                value={resumeGameId}
                onChange={(e) => setResumeGameId(e.target.value)}
                className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-xl text-white focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all font-mono text-lg"
                placeholder="0000"
              />
            </div>

            <button
              onClick={() => handleResumeGame()}
              disabled={status !== 'connected' || !resumeGameId}
              className={`
                w-full py-4 rounded-xl font-bold tracking-wider transition-all duration-500 overflow-hidden relative group/btn
                ${status === 'connected' && resumeGameId
                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-xl'
                  : 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'}
              `}
            >
              <span className="relative z-10">RESUME COMMAND</span>
            </button>
          </div>
        </div>




        {/* Game History */}
        {status === 'connected' && address && (
          <div className="mt-32 relative">
            <div className="flex justify-between items-end mb-10 border-b border-white/5 pb-6">
              <div>
                <h3 className="text-3xl font-bold text-white tracking-tight mb-2">Fleet Logs</h3>
                <p className="text-slate-500 text-sm tracking-widest uppercase">Personnel Combat History</p>
              </div>
              <button
                onClick={() => {
                  setShowHistory(!showHistory);
                  if (!showHistory) refetchPlayerGames();
                }}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 transition-all text-sm font-bold tracking-wider"
              >
                {showHistory ? 'HIDE LOGS' : 'ACCESS LOGS'}
              </button>
            </div>

            {showHistory && (
              <div className="glass-panel rounded-2xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {playerGames.length === 0 ? (
                  <div className="text-center py-20 bg-black/20 rounded-xl border border-dashed border-white/5">
                    <div className="text-6xl mb-6 opacity-30">📂</div>
                    <p className="text-slate-500 tracking-widest uppercase text-sm font-bold">No Records Found</p>
                    <p className="text-slate-600 text-xs mt-2">Initialize a sector to begin combat history logging.</p>
                  </div>
                ) : (
                  <div className="grid lg:grid-cols-2 gap-6">
                    {playerGames.map((game: any) => {
                      const isPlayer1 = BigInt(game.player1) === BigInt(address);
                      const hasPlayer2 = game.player2 && BigInt(game.player2) !== BigInt(0);
                      const myRoot = isPlayer1 ? game.player1_root : game.player2_root;
                      const opponentRoot = isPlayer1 ? game.player2_root : game.player1_root;
                      const hasCommitted = myRoot !== '0x0' && myRoot !== '0' && BigInt(myRoot) !== BigInt(0);
                      const opponentCommitted = opponentRoot !== '0x0' && opponentRoot !== '0' && BigInt(opponentRoot) !== BigInt(0);

                      // Game status: 0=WaitingForOpponent, 1=WaitingForCommitments, 2=InProgress, 3=Finished, 4=Forfeited
                      const statusLabels = ['RECRUITING', 'READY_SYNC', 'ACTIVE_COMBAT', 'ARCHIVED', 'ABORTED'];
                      const statusColors = ['text-yellow-400', 'text-blue-400', 'text-neon-cyan', 'text-green-400', 'text-red-400'];

                      // Determine winner from hit counts (more reliable for status === 3)
                      const p1Hits = game.player1_hits;
                      const p2Hits = game.player2_hits;
                      const player1Won = p1Hits >= HITS_TO_WIN || (game.status === 3 && p1Hits > p2Hits);
                      const isWinner = game.status === 3 && ((isPlayer1 && player1Won) || (!isPlayer1 && !player1Won));
                      const isLoser = game.status === 3 && !isWinner;

                      return (
                        <div
                          key={game.id}
                          className={`group relative overflow-hidden bg-white/5 rounded-xl p-6 border transition-all duration-300 ${isWinner ? 'border-green-500/30' :
                            isLoser ? 'border-red-500/30' :
                              'border-white/5 hover:border-white/20'
                            }`}
                        >
                          {/* Inner Glow for Win/Loss */}
                          {isWinner && <div className="absolute inset-0 bg-green-500/5 pointer-events-none"></div>}
                          {isLoser && <div className="absolute inset-0 bg-red-500/5 pointer-events-none"></div>}

                          <div className="flex justify-between items-start relative z-10">
                            <div className="space-y-4 w-full">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors font-mono font-bold text-sm ${isWinner ? 'text-green-400' : isLoser ? 'text-red-400' : 'text-slate-400'}`}>
                                    #{game.id}
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-white tracking-tight">Sector Access</h4>
                                    <p className={`text-[10px] font-black tracking-[0.2em] ${statusColors[game.status]}`}>
                                      {statusLabels[game.status]}
                                    </p>
                                  </div>
                                </div>
                                {game.status === 3 && (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-widest ${isWinner ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                    {isWinner ? 'VICTORY' : 'DEFEAT'}
                                  </span>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5">
                                <div>
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Scoreboard</p>
                                  <p className="text-lg font-mono font-bold text-white">
                                    {isPlayer1 ? game.player1_hits : game.player2_hits} <span className="text-slate-600 font-normal">/</span> {isPlayer1 ? game.player2_hits : game.player1_hits}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Combat Role</p>
                                  <p className="text-xs font-bold text-slate-300">
                                    {isPlayer1 ? 'Fleet Commander' : 'Assault Admiral'}
                                  </p>
                                </div>
                              </div>

                              <button
                                onClick={() => {
                                  setGameId(Number(game.id));
                                  // Update other states needed for resuming
                                  const stakeHuman = (Number(game.stake_amount) / 1e18).toString();
                                  setStakeAmount(stakeHuman);
                                  handleResumeGame(Number(game.id));
                                }}
                                className={`w-full py-2.5 rounded-lg border text-[11px] font-black tracking-widest transition-all ${game.status === 2 ? 'bg-neon-cyan border-neon-cyan text-slate-900 shadow-[0_0_15px_rgba(0,247,255,0.3)]' :
                                  'bg-white/5 border-white/10 text-white hover:bg-white/10'
                                  }`}
                              >
                                {game.status === 2 ? 'RE-ENTER BATTLE' : 'VIEW DETAILS'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Features */}
        <div className="mt-40 grid md:grid-cols-3 gap-10 relative">
          <div className="absolute inset-0 bg-neon-cyan/5 blur-[100px] rounded-full pointer-events-none"></div>

          <div className="glass-card rounded-2xl p-10 text-center relative group">
            <div className="text-5xl mb-6 transform group-hover:scale-110 transition-transform duration-500">🔒</div>
            <h4 className="text-xl font-bold text-neon-cyan mb-4 tracking-tight">Cryptographically Secure</h4>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
              Your fleet coordinates are hashed and hidden on-chain. Zero-knowledge commitments ensure a true fog of war without centralized trust.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-10 text-center relative group">
            <div className="text-5xl mb-6 transform group-hover:scale-110 transition-transform duration-500">⚡</div>
            <h4 className="text-xl font-bold text-neon-purple mb-4 tracking-tight">Scaled via Starknet</h4>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
              Leverage the power of Validity Rollups. Fast, cheap, and decentralized. Every shot fired is a verifiable transaction on the Layer 2 network.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-10 text-center relative group">
            <div className="text-5xl mb-6 transform group-hover:scale-110 transition-transform duration-500">🎯</div>
            <h4 className="text-xl font-bold text-white mb-4 tracking-tight">Unstoppable Logic</h4>
            <p className="text-sm text-slate-400 leading-relaxed font-medium">
              No servers, no admins, no backdoors. The protocol is the referee. Fair play is enforced by the immutable laws of mathematics.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-40 bg-black/40 backdrop-blur-md relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-neon-cyan/5 to-transparent pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-8 py-12 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <span className="text-2xl filter brightness-125">⚓</span>
              <div className="text-left">
                <p className="text-sm font-black tracking-[0.3em] text-white opacity-40 uppercase">StarkFleet Clash</p>
                <p className="text-[10px] text-slate-600 font-bold">THE ULTIMATE ON-CHAIN BATTLESHIP PROTOCOL</p>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <span className="text-[11px] font-bold text-slate-500 tracking-widest hover:text-white transition-colors cursor-pointer uppercase">Documentation</span>
              <span className="text-[11px] font-bold text-slate-500 tracking-widest hover:text-white transition-colors cursor-pointer uppercase">GitHub</span>
              <span className="text-[11px] font-bold text-slate-500 tracking-widest hover:text-white transition-colors cursor-pointer uppercase">Support</span>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-black text-slate-600 tracking-widest uppercase">Network Status</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Starknet Sepolia Active</span>
              </div>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/5 text-center">
            <p className="text-[9px] text-slate-600 font-bold tracking-[0.2em] uppercase">© 2026 StarkFleet BROTHER Protocol • Privacy-First Decentralized Gaming</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
