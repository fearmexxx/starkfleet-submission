/// Integration tests for StarkFleet Clash contract
use snforge_std::{
    declare, ContractClassTrait, DeclareResultTrait,
    start_cheat_caller_address, stop_cheat_caller_address,
    start_cheat_block_timestamp, stop_cheat_block_timestamp
};
use starknet::{ContractAddress, contract_address_const};
use starkfleet_clash::starkfleet_clash::{
    IStarkFleetClashDispatcher, 
    IStarkFleetClashDispatcherTrait,
    GameStatus
};

/// Test helper: Deploy StarkFleet Clash contract
fn deploy_starkfleet_clash(owner: ContractAddress) -> ContractAddress {
    let contract = declare("StarkFleetClash").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![owner.into()]).unwrap();
    contract_address
}

/// Helper addresses for testing
fn player1() -> ContractAddress {
    contract_address_const::<0x1>()
}

fn player2() -> ContractAddress {
    contract_address_const::<0x2>()
}

/// Test: Game count starts at 0
#[test]
fn test_game_count_starts_at_zero() {
    let contract_address = deploy_starkfleet_clash(player1());
    let dispatcher = IStarkFleetClashDispatcher { contract_address };
    
    assert!(dispatcher.get_game_count() == 0);
}

/// Test: Timeout duration is 24 hours
#[test]
fn test_timeout_duration() {
    let contract_address = deploy_starkfleet_clash(player1());
    let dispatcher = IStarkFleetClashDispatcher { contract_address };
    
    assert!(dispatcher.get_timeout_duration() == 86400);
}

/// Test: Get non-existent game returns empty game
#[test]
fn test_get_nonexistent_game() {
    let contract_address = deploy_starkfleet_clash(player1());
    let dispatcher = IStarkFleetClashDispatcher { contract_address };
    
    let game = dispatcher.get_game(999);
    assert!(game.id == 0);
}

/// Test: Successful upgrade by owner
#[test]
fn test_upgrade_success() {
    let owner = player1();
    let contract_address = deploy_starkfleet_clash(owner);
    let dispatcher = IStarkFleetClashDispatcher { contract_address };
    
    // Get the class hash of the current contract
    let new_class_hash = declare("StarkFleetClash").unwrap().contract_class().class_hash;
    
    // Upgrade as owner
    start_cheat_caller_address(contract_address, owner);
    dispatcher.upgrade(*new_class_hash);
    stop_cheat_caller_address(contract_address);
}

/// Test: Failed upgrade by non-owner
#[test]
#[should_panic(expected: ('Only owner can upgrade', ))]
fn test_upgrade_fails_non_owner() {
    let owner = player1();
    let non_owner = player2();
    let contract_address = deploy_starkfleet_clash(owner);
    let dispatcher = IStarkFleetClashDispatcher { contract_address };
    
    let new_class_hash = declare("StarkFleetClash").unwrap().contract_class().class_hash;
    
    // Upgrade as non-owner (should panic)
    start_cheat_caller_address(contract_address, non_owner);
    dispatcher.upgrade(*new_class_hash);
    stop_cheat_caller_address(contract_address);
}
