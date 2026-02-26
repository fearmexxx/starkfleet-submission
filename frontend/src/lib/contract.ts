/**
 * Contract configuration and ABI for StarkFleet Clash
 */

// Network configuration
let localNetwork = 'sepolia';
if (typeof window !== 'undefined') {
    localNetwork = window.localStorage.getItem('starkfleet_network') || 'sepolia';
}
export const NETWORK = process.env.NEXT_PUBLIC_STARKNET_NETWORK || localNetwork;

// StarkFleet Clash Contract Addresses
export const STARKNET_CONTRACTS = {
    sepolia: "0x0053ab85a4803d1b2c8235c8de466bb93abded77d3c8ec3a690606c36ad13c1d",
    mainnet: "0x054c02c0905a9c874686e49956cd5192663d6af3138afe7747af4d173849db84",
};

export type NetworkType = 'mainnet' | 'sepolia';
export const DEFAULT_NETWORK: NetworkType = 'mainnet';

export const RPC_URLS = {
    mainnet: 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/qXU4ta4yLmxUhIoLb-cZ7KtsNn808Pjw',
    sepolia: 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/qXU4ta4yLmxUhIoLb-cZ7KtsNn808Pjw'
};

export const STARKFLEET_CONTRACT_ADDRESS = NETWORK === 'mainnet'
    ? STARKNET_CONTRACTS.mainnet
    : STARKNET_CONTRACTS.sepolia;

// STRK token addresses
export const STRK_TOKEN_ADDRESSES = {
    sepolia: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    mainnet: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d'
};

export const STARKFLEET_STRK_TOKEN_ADDRESS = NETWORK === 'mainnet'
    ? STRK_TOKEN_ADDRESSES.mainnet
    : STRK_TOKEN_ADDRESSES.sepolia;

// Hits required to win (must match contract - 17 for production, reduced for testing)
export const HITS_TO_WIN = NETWORK === 'mainnet' ? 17 : 7;

// House fee in basis points (100 = 1%)
export const HOUSE_FEE_BPS = 100;

export const STARKFLEET_ABI = [
    {
        "type": "impl",
        "name": "StarkFleetClashImpl",
        "interface_name": "starkfleet_clash::starkfleet_clash::IStarkFleetClash"
    },
    {
        "type": "struct",
        "name": "core::integer::u256",
        "members": [
            { "name": "low", "type": "core::integer::u128" },
            { "name": "high", "type": "core::integer::u128" }
        ]
    },
    {
        "type": "enum",
        "name": "starkfleet_clash::starkfleet_clash::GameStatus",
        "variants": [
            { "name": "WaitingForOpponent", "type": "()" },
            { "name": "WaitingForCommitments", "type": "()" },
            { "name": "InProgress", "type": "()" },
            { "name": "Finished", "type": "()" },
            { "name": "Forfeited", "type": "()" }
        ]
    },
    {
        "type": "struct",
        "name": "starkfleet_clash::starkfleet_clash::Game",
        "members": [
            { "name": "id", "type": "core::integer::u64" },
            { "name": "player1", "type": "core::starknet::contract_address::ContractAddress" },
            { "name": "player2", "type": "core::starknet::contract_address::ContractAddress" },
            { "name": "player1_root", "type": "core::felt252" },
            { "name": "player2_root", "type": "core::felt252" },
            { "name": "stake_amount", "type": "core::integer::u256" },
            { "name": "current_turn", "type": "core::starknet::contract_address::ContractAddress" },
            { "name": "player1_hits", "type": "core::integer::u8" },
            { "name": "player2_hits", "type": "core::integer::u8" },
            { "name": "last_move_time", "type": "core::integer::u64" },
            { "name": "status", "type": "starkfleet_clash::starkfleet_clash::GameStatus" },
            { "name": "winner", "type": "core::starknet::contract_address::ContractAddress" },
            { "name": "pending_attack_x", "type": "core::integer::u8" },
            { "name": "pending_attack_y", "type": "core::integer::u8" },
            { "name": "has_pending_attack", "type": "core::bool" }
        ]
    },
    {
        "type": "interface",
        "name": "starkfleet_clash::starkfleet_clash::IStarkFleetClash",
        "items": [
            {
                "type": "function",
                "name": "create_game",
                "inputs": [{ "name": "stake_amount", "type": "core::integer::u256" }],
                "outputs": [{ "type": "core::integer::u64" }],
                "state_mutability": "external"
            },
            {
                "type": "function",
                "name": "join_game",
                "inputs": [{ "name": "game_id", "type": "core::integer::u64" }],
                "outputs": [],
                "state_mutability": "external"
            },
            {
                "type": "function",
                "name": "commit_board",
                "inputs": [
                    { "name": "game_id", "type": "core::integer::u64" },
                    { "name": "merkle_root", "type": "core::felt252" }
                ],
                "outputs": [],
                "state_mutability": "external"
            },
            {
                "type": "function",
                "name": "attack",
                "inputs": [
                    { "name": "game_id", "type": "core::integer::u64" },
                    { "name": "x", "type": "core::integer::u8" },
                    { "name": "y", "type": "core::integer::u8" }
                ],
                "outputs": [],
                "state_mutability": "external"
            },
            {
                "type": "function",
                "name": "reveal",
                "inputs": [
                    { "name": "game_id", "type": "core::integer::u64" },
                    { "name": "x", "type": "core::integer::u8" },
                    { "name": "y", "type": "core::integer::u8" },
                    { "name": "is_hit", "type": "core::bool" },
                    { "name": "salt", "type": "core::felt252" },
                    { "name": "proof", "type": "core::array::Array::<core::felt252>" }
                ],
                "outputs": [],
                "state_mutability": "external"
            },
            {
                "type": "function",
                "name": "claim_victory",
                "inputs": [{ "name": "game_id", "type": "core::integer::u64" }],
                "outputs": [],
                "state_mutability": "external"
            },
            {
                "type": "function",
                "name": "claim_timeout",
                "inputs": [{ "name": "game_id", "type": "core::integer::u64" }],
                "outputs": [],
                "state_mutability": "external"
            },
            {
                "type": "function",
                "name": "get_game",
                "inputs": [{ "name": "game_id", "type": "core::integer::u64" }],
                "outputs": [{ "type": "starkfleet_clash::starkfleet_clash::Game" }],
                "state_mutability": "view"
            },
            {
                "type": "function",
                "name": "get_game_count",
                "inputs": [],
                "outputs": [{ "type": "core::integer::u64" }],
                "state_mutability": "view"
            },
            {
                "type": "function",
                "name": "get_timeout_duration",
                "inputs": [],
                "outputs": [{ "type": "core::integer::u64" }],
                "state_mutability": "view"
            },
            {
                "type": "function",
                "name": "get_house_balance",
                "inputs": [],
                "outputs": [{ "type": "core::integer::u256" }],
                "state_mutability": "view"
            },
            {
                "type": "function",
                "name": "get_house_fee_bps",
                "inputs": [],
                "outputs": [{ "type": "core::integer::u256" }],
                "state_mutability": "view"
            },
            {
                "type": "function",
                "name": "get_owner",
                "inputs": [],
                "outputs": [{ "type": "core::starknet::contract_address::ContractAddress" }],
                "state_mutability": "view"
            },
            {
                "type": "function",
                "name": "withdraw_house_funds",
                "inputs": [{ "name": "amount", "type": "core::integer::u256" }],
                "outputs": [],
                "state_mutability": "external"
            },
            {
                "type": "function",
                "name": "transfer_ownership",
                "inputs": [{ "name": "new_owner", "type": "core::starknet::contract_address::ContractAddress" }],
                "outputs": [],
                "state_mutability": "external"
            }
        ]
    },
    {
        "type": "constructor",
        "name": "constructor",
        "inputs": [{ "name": "owner", "type": "core::starknet::contract_address::ContractAddress" }]
    },
    {
        "type": "event",
        "name": "starkfleet_clash::starkfleet_clash::GameCreated",
        "kind": "struct",
        "members": [
            { "name": "game_id", "type": "core::integer::u64", "kind": "key" },
            { "name": "player1", "type": "core::starknet::contract_address::ContractAddress", "kind": "data" },
            { "name": "stake_amount", "type": "core::integer::u256", "kind": "data" }
        ]
    },
    {
        "type": "event",
        "name": "starkfleet_clash::starkfleet_clash::GameJoined",
        "kind": "struct",
        "members": [
            { "name": "game_id", "type": "core::integer::u64", "kind": "key" },
            { "name": "player2", "type": "core::starknet::contract_address::ContractAddress", "kind": "data" }
        ]
    },
    {
        "type": "event",
        "name": "starkfleet_clash::starkfleet_clash::AttackMade",
        "kind": "struct",
        "members": [
            { "name": "game_id", "type": "core::integer::u64", "kind": "key" },
            { "name": "attacker", "type": "core::starknet::contract_address::ContractAddress", "kind": "data" },
            { "name": "x", "type": "core::integer::u8", "kind": "data" },
            { "name": "y", "type": "core::integer::u8", "kind": "data" }
        ]
    },
    {
        "type": "event",
        "name": "starkfleet_clash::starkfleet_clash::CellRevealed",
        "kind": "struct",
        "members": [
            { "name": "game_id", "type": "core::integer::u64", "kind": "key" },
            { "name": "x", "type": "core::integer::u8", "kind": "data" },
            { "name": "y", "type": "core::integer::u8", "kind": "data" },
            { "name": "is_hit", "type": "core::bool", "kind": "data" }
        ]
    },
    {
        "type": "event",
        "name": "starkfleet_clash::starkfleet_clash::GameWon",
        "kind": "struct",
        "members": [
            { "name": "game_id", "type": "core::integer::u64", "kind": "key" },
            { "name": "winner", "type": "core::starknet::contract_address::ContractAddress", "kind": "data" },
            { "name": "total_pot", "type": "core::integer::u256", "kind": "data" }
        ]
    },
    {
        "type": "event",
        "name": "starkfleet_clash::starkfleet_clash::HouseFeeCollected",
        "kind": "struct",
        "members": [
            { "name": "game_id", "type": "core::integer::u64", "kind": "key" },
            { "name": "amount", "type": "core::integer::u256", "kind": "data" }
        ]
    },
    {
        "type": "event",
        "name": "starkfleet_clash::starkfleet_clash::HouseFundsWithdrawn",
        "kind": "struct",
        "members": [
            { "name": "to", "type": "core::starknet::contract_address::ContractAddress", "kind": "data" },
            { "name": "amount", "type": "core::integer::u256", "kind": "data" }
        ]
    }
];
