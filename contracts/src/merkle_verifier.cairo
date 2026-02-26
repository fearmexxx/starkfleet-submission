/// Merkle Tree Verifier using Pedersen hash
/// Used for verifying board cell proofs in StarkFleet Clash

use core::pedersen::pedersen;

/// Computes leaf hash for a board cell
/// leaf = pedersen(pedersen(pedersen(x, y), cell_value), salt)
pub fn compute_leaf(x: u8, y: u8, cell_value: u8, salt: felt252) -> felt252 {
    let h1 = pedersen(x.into(), y.into());
    let h2 = pedersen(h1, cell_value.into());
    pedersen(h2, salt)
}

/// Verifies a Merkle proof for a given leaf
/// Returns true if the proof is valid and leads to the expected root
pub fn verify_proof(
    root: felt252,
    leaf: felt252,
    proof: Span<felt252>,
    leaf_index: u32
) -> bool {
    let mut current_hash = leaf;
    let mut index = leaf_index;
    
    for sibling in proof {
        // If index is even, sibling is on the right
        // If index is odd, sibling is on the left
        current_hash = if index % 2 == 0 {
            pedersen(current_hash, *sibling)
        } else {
            pedersen(*sibling, current_hash)
        };
        index = index / 2;
    };
    
    current_hash == root
}

/// Converts (x, y) coordinates to leaf index in a 10x10 grid
/// Index = y * 10 + x (row-major order)
pub fn coords_to_index(x: u8, y: u8) -> u32 {
    (y.into() * 10_u32) + x.into()
}

#[cfg(test)]
mod tests {
    use super::{compute_leaf, verify_proof, coords_to_index};
    use core::pedersen::pedersen;
    
    #[test]
    fn test_coords_to_index() {
        assert!(coords_to_index(0, 0) == 0);
        assert!(coords_to_index(9, 0) == 9);
        assert!(coords_to_index(0, 1) == 10);
        assert!(coords_to_index(5, 5) == 55);
        assert!(coords_to_index(9, 9) == 99);
    }
    
    #[test]
    fn test_compute_leaf_deterministic() {
        let salt: felt252 = 0x12345;
        let leaf1 = compute_leaf(3, 4, 1, salt);
        let leaf2 = compute_leaf(3, 4, 1, salt);
        assert!(leaf1 == leaf2);
        
        // Different cell value should produce different leaf
        let leaf3 = compute_leaf(3, 4, 0, salt);
        assert!(leaf1 != leaf3);
    }
    
    #[test]
    fn test_simple_merkle_proof() {
        // Build a simple 2-leaf tree for testing
        let salt: felt252 = 0xABCDE;
        let leaf0 = compute_leaf(0, 0, 0, salt);
        let leaf1 = compute_leaf(1, 0, 1, salt);
        
        // Root = pedersen(leaf0, leaf1)
        let root = pedersen(leaf0, leaf1);
        
        // Proof for leaf0 (index 0, even): sibling is leaf1 on right
        let proof: Array<felt252> = array![leaf1];
        assert!(verify_proof(root, leaf0, proof.span(), 0));
        
        // Proof for leaf1 (index 1, odd): sibling is leaf0 on left
        let proof2: Array<felt252> = array![leaf0];
        assert!(verify_proof(root, leaf1, proof2.span(), 1));
    }
}
