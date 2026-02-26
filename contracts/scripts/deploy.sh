#!/bin/bash
# StarkFleet Clash Deployment Script for Starknet Sepolia
# 
# Prerequisites:
# 1. Create an account file: accounts.json with your deployer account
# 2. Fund your account with Sepolia ETH from https://starknet-faucet.vercel.app/
# 3. Run this script from the contracts directory

set -e

echo "Building contracts..."
scarb build

echo ""
echo "Declaring StarkFleetClash contract..."
DECLARE_OUTPUT=$(sncast --profile sepolia declare --contract-name StarkFleetClash 2>&1)
echo "$DECLARE_OUTPUT"

# Extract class hash from output
CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep "class_hash:" | awk '{print $2}')

if [ -z "$CLASS_HASH" ]; then
    echo "Failed to extract class hash. Check if contract was already declared."
    echo "If already declared, use the existing class hash for deployment."
    exit 1
fi

echo ""
echo "Deploying StarkFleetClash with class hash: $CLASS_HASH"
# Pass the deployer address as the owner in the constructor
OWNER_ADDRESS="0x020da6ec50d63a5e8e6a97d1154c365975608c58c54024dec9e0230a485580a2"
sncast --profile sepolia deploy --class-hash "$CLASS_HASH" --constructor-calldata "$OWNER_ADDRESS"

echo ""
echo "Deployment complete!"
echo "Save the contract address from the output above."
