/// StarkFleet Clash - Privacy-Preserving Turn-Based Battleship on Starknet
/// Main game contract handling game creation, attacks, reveals, and pot distribution

use starknet::ContractAddress;
use starknet::class_hash::ClassHash;

    /// Game status enum
    #[derive(Drop, Copy, Serde, starknet::Store, PartialEq)]
    pub enum GameStatus {
        #[default]
        WaitingForOpponent,     // Player 1 created, waiting for Player 2
        WaitingForCommitments,  // Both joined, waiting for board commitments
        InProgress,             // Both committed, game active
        Finished,               // Game ended normally (17 hits)
        Forfeited,              // Game ended via timeout
    }

    /// Stores game state
    #[derive(Drop, Copy, Serde, starknet::Store)]
    pub struct Game {
        pub id: u64,
        pub player1: ContractAddress,
        pub player2: ContractAddress,
        pub player1_root: felt252,          // Merkle root of player 1's board
        pub player2_root: felt252,          // Merkle root of player 2's board
        pub stake_amount: u256,             // Amount staked by each player
        pub current_turn: ContractAddress,  // Who needs to act next
        pub player1_hits: u8,               // Hits scored by player 1
        pub player2_hits: u8,               // Hits scored by player 2
        pub last_move_time: u64,            // Timestamp of last action
        pub status: GameStatus,
        pub winner: ContractAddress,        // Winner address (zero if ongoing)
        pub pending_attack_x: u8,           // Pending attack x coordinate
        pub pending_attack_y: u8,           // Pending attack y coordinate
        pub has_pending_attack: bool,       // Whether there's a pending attack to reveal
    }

    /// Interface for StarkFleet Clash game contract
    #[starknet::interface]
    pub trait IStarkFleetClash<TContractState> {
        /// Create a new game with STRK stake
        fn create_game(ref self: TContractState, stake_amount: u256) -> u64;
        
        /// Join an existing game by ID
        fn join_game(ref self: TContractState, game_id: u64);
        
        /// Commit board Merkle root after joining
        fn commit_board(ref self: TContractState, game_id: u64, merkle_root: felt252);
        
        /// Submit attack coordinates
        fn attack(ref self: TContractState, game_id: u64, x: u8, y: u8);
        
        /// Reveal cell after being attacked (with Merkle proof)
        fn reveal(
            ref self: TContractState,
            game_id: u64,
            x: u8,
            y: u8,
            is_hit: bool,
            salt: felt252,
            proof: Array<felt252>
        );
        
        /// Claim victory after reaching required hits
        fn claim_victory(ref self: TContractState, game_id: u64);
        
        /// Claim win via opponent timeout
        fn claim_timeout(ref self: TContractState, game_id: u64);
        
        /// Get game details
        fn get_game(self: @TContractState, game_id: u64) -> Game;
        
        /// Get total number of games created
        fn get_game_count(self: @TContractState) -> u64;
        
        /// Get timeout duration in seconds
        fn get_timeout_duration(self: @TContractState) -> u64;
        
        /// Get accumulated house fees
        fn get_house_balance(self: @TContractState) -> u256;
        
        /// Get house fee percentage (in basis points, 100 = 1%)
        fn get_house_fee_bps(self: @TContractState) -> u256;
        
        /// Get owner address
        fn get_owner(self: @TContractState) -> ContractAddress;
        
        /// Withdraw house funds (owner only)
        fn withdraw_house_funds(ref self: TContractState, amount: u256);
        
        /// Transfer ownership (owner only)
        fn transfer_ownership(ref self: TContractState, new_owner: ContractAddress);

        /// Upgrade contract class hash (owner only)
        fn upgrade(ref self: TContractState, new_class_hash: ClassHash);
    }

    /// Events emitted by the contract
    #[derive(Drop, starknet::Event)]
    pub struct GameCreated {
        #[key]
        pub game_id: u64,
        pub player1: ContractAddress,
        pub stake_amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct GameJoined {
        #[key]
        pub game_id: u64,
        pub player2: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct BoardCommitted {
        #[key]
        pub game_id: u64,
        pub player: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct AttackMade {
        #[key]
        pub game_id: u64,
        pub attacker: ContractAddress,
        pub x: u8,
        pub y: u8,
    }

    #[derive(Drop, starknet::Event)]
    pub struct CellRevealed {
        #[key]
        pub game_id: u64,
        pub x: u8,
        pub y: u8,
        pub is_hit: bool,
    }

    #[derive(Drop, starknet::Event)]
    pub struct GameWon {
        #[key]
        pub game_id: u64,
        pub winner: ContractAddress,
        pub total_pot: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct GameForfeited {
        #[key]
        pub game_id: u64,
        pub winner: ContractAddress,
        pub reason: felt252,
    }

    #[derive(Drop, starknet::Event)]
    pub struct HouseFeeCollected {
        #[key]
        pub game_id: u64,
        pub amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct HouseFundsWithdrawn {
        pub to: ContractAddress,
        pub amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OwnershipTransferred {
        pub previous_owner: ContractAddress,
        pub new_owner: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct ContractUpgraded {
        pub new_class_hash: ClassHash,
    }

    #[starknet::contract]
    pub mod StarkFleetClash {
        use starknet::{
            ContractAddress, 
            get_caller_address, 
            get_block_timestamp,
            contract_address_const,
            class_hash::ClassHash,
            syscalls::replace_class_syscall
        };
        use starknet::storage::{
            StoragePointerReadAccess, 
            StoragePointerWriteAccess,
            Map,
            StoragePathEntry
        };
        use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
        use super::{
            Game, GameStatus, IStarkFleetClash,
            GameCreated, GameJoined, BoardCommitted, AttackMade, CellRevealed, GameWon, GameForfeited,
            HouseFeeCollected, HouseFundsWithdrawn, OwnershipTransferred, ContractUpgraded
        };
        use starkfleet_clash::merkle_verifier::{compute_leaf, verify_proof, coords_to_index};

        /// Board size: 10x10 = 100 cells
        const BOARD_SIZE: u8 = 10;
        /// Total hits needed to win (reduced for testing - normally 17)
        const HITS_TO_WIN: u8 = 7;
        /// Default timeout: 24 hours in seconds
        const DEFAULT_TIMEOUT: u64 = 86400;
        /// Minimum stake: 1 STRK (1e18 wei)
        const MIN_STAKE: u256 = 1000000000000000000;
        /// House fee in basis points (100 = 1%)
        const HOUSE_FEE_BPS: u256 = 100;
        
        /// STRK token address on Starknet Sepolia
        /// Using the standard STRK contract address
        const STRK_ADDRESS: felt252 = 0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d;
        
        /// Default owner address (your wallet) - set this to your address before deployment
        const DEFAULT_OWNER: felt252 = 0x0;

        #[storage]
        struct Storage {
            /// Total number of games created
            game_count: u64,
            /// Game data by ID
            games: Map<u64, Game>,
            /// Track revealed cells per game: (game_id, player, cell_index) => revealed
            revealed_cells: Map<(u64, ContractAddress, u32), bool>,
            /// Owner address for house fee withdrawals
            owner: ContractAddress,
            /// Accumulated house fees from games
            house_balance: u256,
        }

        #[event]
        #[derive(Drop, starknet::Event)]
        pub enum Event {
            GameCreated: GameCreated,
            GameJoined: GameJoined,
            BoardCommitted: BoardCommitted,
            AttackMade: AttackMade,
            CellRevealed: CellRevealed,
            GameWon: GameWon,
            GameForfeited: GameForfeited,
            HouseFeeCollected: HouseFeeCollected,
            HouseFundsWithdrawn: HouseFundsWithdrawn,
            OwnershipTransferred: OwnershipTransferred,
            ContractUpgraded: ContractUpgraded,
        }
        
        /// Constructor to set owner
        #[constructor]
        fn constructor(ref self: ContractState, owner: ContractAddress) {
            self.owner.write(owner);
        }

        #[abi(embed_v0)]
        impl StarkFleetClashImpl of IStarkFleetClash<ContractState> {
            
            /// Create a new game with STRK stake
            fn create_game(ref self: ContractState, stake_amount: u256) -> u64 {
                let caller = get_caller_address();
                
                // Validate stake amount
                assert(stake_amount >= MIN_STAKE, 'Stake too low');
                
                // Transfer STRK from player to contract
                let strk = IERC20Dispatcher { 
                    contract_address: contract_address_const::<STRK_ADDRESS>() 
                };
                let success = strk.transfer_from(caller, starknet::get_contract_address(), stake_amount);
                assert(success, 'STRK transfer failed');
                
                // Create new game
                let game_id = self.game_count.read() + 1;
                self.game_count.write(game_id);
                
                let zero_addr = contract_address_const::<0>();
                let game = Game {
                    id: game_id,
                    player1: caller,
                    player2: zero_addr,
                    player1_root: 0,
                    player2_root: 0,
                    stake_amount,
                    current_turn: zero_addr,
                    player1_hits: 0,
                    player2_hits: 0,
                    last_move_time: get_block_timestamp(),
                    status: GameStatus::WaitingForOpponent,
                    winner: zero_addr,
                    pending_attack_x: 0,
                    pending_attack_y: 0,
                    has_pending_attack: false,
                };
                
                self.games.entry(game_id).write(game);
                
                self.emit(GameCreated { game_id, player1: caller, stake_amount });
                
                game_id
            }
            
            /// Join an existing game by ID
            fn join_game(ref self: ContractState, game_id: u64) {
                let caller = get_caller_address();
                let mut game = self.games.entry(game_id).read();
                
                // Validate game state
                assert(game.id != 0, 'Game does not exist');
                assert(game.status == GameStatus::WaitingForOpponent, 'Game not joinable');
                assert(caller != game.player1, 'Cannot join own game');
                
                // Transfer matching stake from player 2
                let strk = IERC20Dispatcher { 
                    contract_address: contract_address_const::<STRK_ADDRESS>() 
                };
                let success = strk.transfer_from(caller, starknet::get_contract_address(), game.stake_amount);
                assert(success, 'STRK transfer failed');
                
                // Update game state
                game.player2 = caller;
                game.status = GameStatus::WaitingForCommitments;
                game.last_move_time = get_block_timestamp();
                
                self.games.entry(game_id).write(game);
                
                self.emit(GameJoined { game_id, player2: caller });
            }
            
            /// Commit board Merkle root after joining
            fn commit_board(ref self: ContractState, game_id: u64, merkle_root: felt252) {
                let caller = get_caller_address();
                let mut game = self.games.entry(game_id).read();
                
                // Validate game state
                assert(game.id != 0, 'Game does not exist');
                assert(
                    game.status == GameStatus::WaitingForCommitments,
                    'Not in commitment phase'
                );
                
                // Validate caller is a player
                let is_player1 = caller == game.player1;
                let is_player2 = caller == game.player2;
                assert(is_player1 || is_player2, 'Not a player');
                
                // Validate not already committed
                if is_player1 {
                    assert(game.player1_root == 0, 'Already committed');
                    game.player1_root = merkle_root;
                } else {
                    assert(game.player2_root == 0, 'Already committed');
                    game.player2_root = merkle_root;
                }
                
                // Check if both players have committed
                if game.player1_root != 0 && game.player2_root != 0 {
                    game.status = GameStatus::InProgress;
                    
                    // Randomly choose who goes first based on timestamp
                    if get_block_timestamp() % 2 == 1 {
                        game.current_turn = game.player1;
                    } else {
                        game.current_turn = game.player2;
                    }
                }
                
                game.last_move_time = get_block_timestamp();
                self.games.entry(game_id).write(game);
                
                self.emit(BoardCommitted { game_id, player: caller });
            }
            
            /// Submit attack coordinates
            fn attack(ref self: ContractState, game_id: u64, x: u8, y: u8) {
                let caller = get_caller_address();
                let mut game = self.games.entry(game_id).read();
                
                // Validate game state
                assert(game.id != 0, 'Game does not exist');
                assert(game.status == GameStatus::InProgress, 'Game not in progress');
                assert(!game.has_pending_attack, 'Pending attack exists');
                assert(caller == game.current_turn, 'Not your turn');
                
                // Validate coordinates
                assert(x < BOARD_SIZE, 'X out of bounds');
                assert(y < BOARD_SIZE, 'Y out of bounds');
                
                // Check cell not already revealed
                let defender = if caller == game.player1 { game.player2 } else { game.player1 };
                let cell_index = coords_to_index(x, y);
                let already_revealed = self.revealed_cells.entry((game_id, defender, cell_index)).read();
                assert(!already_revealed, 'Cell already attacked');
                
                // Record pending attack
                game.pending_attack_x = x;
                game.pending_attack_y = y;
                game.has_pending_attack = true;
                game.current_turn = defender; // Defender must reveal
                game.last_move_time = get_block_timestamp();
                
                self.games.entry(game_id).write(game);
                
                self.emit(AttackMade { game_id, attacker: caller, x, y });
            }
            
            /// Reveal cell after being attacked (with Merkle proof)
            fn reveal(
                ref self: ContractState,
                game_id: u64,
                x: u8,
                y: u8,
                is_hit: bool,
                salt: felt252,
                proof: Array<felt252>
            ) {
                let caller = get_caller_address();
                let mut game = self.games.entry(game_id).read();
                
                // Validate game state
                assert(game.id != 0, 'Game does not exist');
                assert(game.status == GameStatus::InProgress, 'Game not in progress');
                assert(game.has_pending_attack, 'No pending attack');
                assert(caller == game.current_turn, 'Not your turn');
                
                // Validate coordinates match pending attack
                assert(x == game.pending_attack_x, 'Wrong X coordinate');
                assert(y == game.pending_attack_y, 'Wrong Y coordinate');
                
                // Get defender's root for verification
                let root = if caller == game.player1 { 
                    game.player1_root 
                } else { 
                    game.player2_root 
                };
                
                // Compute expected leaf and verify proof
                let cell_value: u8 = if is_hit { 1 } else { 0 };
                let leaf = compute_leaf(x, y, cell_value, salt);
                let leaf_index = coords_to_index(x, y);
                
                let valid = verify_proof(root, leaf, proof.span(), leaf_index);
                assert(valid, 'Invalid Merkle proof');
                
                // Mark cell as revealed
                self.revealed_cells.entry((game_id, caller, leaf_index)).write(true);
                
                // Update hit counter
                let attacker = if caller == game.player1 { game.player2 } else { game.player1 };
                if is_hit {
                    if attacker == game.player1 {
                        game.player1_hits += 1;
                    } else {
                        game.player2_hits += 1;
                    }
                }
                
                // Clear pending attack and switch turn to attacker for next attack
                game.has_pending_attack = false;
                game.current_turn = caller; // Defender (who just revealed) now attacks
                game.last_move_time = get_block_timestamp();
                
                self.games.entry(game_id).write(game);
                
                self.emit(CellRevealed { game_id, x, y, is_hit });
            }
            
            /// Claim victory after reaching required hits
            fn claim_victory(ref self: ContractState, game_id: u64) {
                let caller = get_caller_address();
                let mut game = self.games.entry(game_id).read();
                
                // Validate game state
                assert(game.id != 0, 'Game does not exist');
                assert(game.status == GameStatus::InProgress, 'Game not in progress');
                
                // Check if caller has won
                let is_player1 = caller == game.player1;
                let is_player2 = caller == game.player2;
                assert(is_player1 || is_player2, 'Not a player');
                
                let hits = if is_player1 { game.player1_hits } else { game.player2_hits };
                assert(hits >= HITS_TO_WIN, 'Not enough hits to win');
                
                // Calculate total pot and house fee (1%)
                let total_pot = game.stake_amount * 2;
                let house_fee = total_pot * HOUSE_FEE_BPS / 10000; // 100 bps = 1%
                let winner_payout = total_pot - house_fee;
                
                // Update game state
                game.status = GameStatus::Finished;
                game.winner = caller;
                self.games.entry(game_id).write(game);
                
                // Accumulate house fee
                let current_balance = self.house_balance.read();
                self.house_balance.write(current_balance + house_fee);
                
                // Transfer winnings to winner
                let strk = IERC20Dispatcher { 
                    contract_address: contract_address_const::<STRK_ADDRESS>() 
                };
                let success = strk.transfer(caller, winner_payout);
                assert(success, 'Prize transfer failed');
                
                self.emit(HouseFeeCollected { game_id, amount: house_fee });
                self.emit(GameWon { game_id, winner: caller, total_pot: winner_payout });
            }
            
            /// Claim win via opponent timeout
            fn claim_timeout(ref self: ContractState, game_id: u64) {
                let caller = get_caller_address();
                let mut game = self.games.entry(game_id).read();
                
                // Validate game state
                assert(game.id != 0, 'Game does not exist');
                assert(
                    game.status == GameStatus::WaitingForCommitments 
                    || game.status == GameStatus::InProgress,
                    'Game not active'
                );
                
                // Validate caller is a player but NOT the one who should act
                let is_player1 = caller == game.player1;
                let is_player2 = caller == game.player2;
                assert(is_player1 || is_player2, 'Not a player');
                
                // In WaitingForCommitments, check if opponent hasn't committed
                // In InProgress, check if it's opponent's turn and they timed out
                let zero_addr = contract_address_const::<0>();
                let timed_out_player = if game.status == GameStatus::WaitingForCommitments {
                    // Check who hasn't committed yet
                    if is_player1 && game.player2_root == 0 && game.player2 != zero_addr {
                        game.player2
                    } else if is_player2 && game.player1_root == 0 {
                        game.player1
                    } else {
                        zero_addr
                    }
                } else {
                    // InProgress: check if current_turn player timed out
                    if game.current_turn != caller {
                        game.current_turn
                    } else {
                        zero_addr
                    }
                };
                
                assert(timed_out_player != zero_addr, 'No timeout to claim');
                
                // Check if timeout has passed
                let current_time = get_block_timestamp();
                let elapsed = current_time - game.last_move_time;
                assert(elapsed >= DEFAULT_TIMEOUT, 'Timeout not reached');
                
                // Calculate pot (might be only 1x if opponent never joined/staked)
                let total_pot = if game.status == GameStatus::WaitingForCommitments 
                    && game.player2 == zero_addr {
                    game.stake_amount // Only player 1's stake
                } else {
                    game.stake_amount * 2
                };
                
                // Update game state
                game.status = GameStatus::Forfeited;
                game.winner = caller;
                self.games.entry(game_id).write(game);
                
                // Transfer winnings
                let strk = IERC20Dispatcher { 
                    contract_address: contract_address_const::<STRK_ADDRESS>() 
                };
                let success = strk.transfer(caller, total_pot);
                assert(success, 'Prize transfer failed');
                
                self.emit(GameForfeited { game_id, winner: caller, reason: 'timeout' });
            }
            
            /// Get game details
            fn get_game(self: @ContractState, game_id: u64) -> Game {
                self.games.entry(game_id).read()
            }
            
            /// Get total number of games created
            fn get_game_count(self: @ContractState) -> u64 {
                self.game_count.read()
            }
            
            /// Get timeout duration in seconds
            fn get_timeout_duration(self: @ContractState) -> u64 {
                DEFAULT_TIMEOUT
            }
            
            /// Get accumulated house fees
            fn get_house_balance(self: @ContractState) -> u256 {
                self.house_balance.read()
            }
            
            /// Get house fee percentage (in basis points, 100 = 1%)
            fn get_house_fee_bps(self: @ContractState) -> u256 {
                HOUSE_FEE_BPS
            }
            
            /// Get owner address
            fn get_owner(self: @ContractState) -> ContractAddress {
                self.owner.read()
            }
            
            /// Withdraw house funds (owner only)
            fn withdraw_house_funds(ref self: ContractState, amount: u256) {
                let caller = get_caller_address();
                let owner = self.owner.read();
                
                assert(caller == owner, 'Only owner can withdraw');
                
                let balance = self.house_balance.read();
                assert(amount <= balance, 'Insufficient house balance');
                
                // Update balance
                self.house_balance.write(balance - amount);
                
                // Transfer STRK to owner
                let strk = IERC20Dispatcher { 
                    contract_address: contract_address_const::<STRK_ADDRESS>() 
                };
                let success = strk.transfer(caller, amount);
                assert(success, 'Withdrawal transfer failed');
                
                self.emit(HouseFundsWithdrawn { to: caller, amount });
            }
            
            /// Transfer ownership (owner only)
            fn transfer_ownership(ref self: ContractState, new_owner: ContractAddress) {
                let caller = get_caller_address();
                let current_owner = self.owner.read();
                
                assert(caller == current_owner, 'Only owner can transfer');
                assert(new_owner != contract_address_const::<0>(), 'Invalid new owner');
                
                self.owner.write(new_owner);
                
                self.emit(OwnershipTransferred { previous_owner: current_owner, new_owner });
            }

            /// Upgrade contract class hash (owner only)
            fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
                let caller = get_caller_address();
                let owner = self.owner.read();
                
                assert(caller == owner, 'Only owner can upgrade');
                
                // Replace contract class
                replace_class_syscall(new_class_hash).unwrap();
                
                self.emit(ContractUpgraded { new_class_hash });
            }
        }
    }
