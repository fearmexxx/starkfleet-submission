#!/bin/bash
# StarkFleet Clash MAINNET Deployment Script
# 
# ⚠️ WARNING: THIS DEPLOYS TO MAINNET USING REAL ETH ⚠️
#
# Prerequisites:
# 1. Create an account file: accounts.json with your 'starfleet_mainnet' account
# 2. Fund your account with REAL ETH
# 3. Run this script from the contracts directory

set -e

echo "⚠️  CRITICAL WARNING ⚠️"
echo "You are about to deploy to Starknet MAINNET."
echo "This will consume REAL ETH."
echo ""
read -p "Are you absolutely sure? (Type 'DEPLOY_MAINNET' to confirm): " confirmation

if [ "$confirmation" != "DEPLOY_MAINNET" ]; then
    echo "Deployment aborted."
    exit 1
fi

echo "Building contracts..."
scarb build

echo ""
echo "Declaring StarkFleetClash contract on MAINNET..."
DECLARE_OUTPUT=$(sncast --profile mainnet declare --contract-name StarkFleetClash 2>&1)
EXIT_CODE=$?
echo "$DECLARE_OUTPUT"

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "❌ Declaration failed."
    if [[ "$DECLARE_OUTPUT" == *"password"* ]] || [[ "$DECLARE_OUTPUT" == *"keystore"* ]]; then
        echo "💡 TIP: It looks like this account might require a password or keystore."
        echo "Try running sncast manually with --keystore starkfleet_keystore.json if needed."
    fi
    exit 1
fi

# Extract class hash from output
CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep "class_hash:" | awk '{print $2}')

if [ -z "$CLASS_HASH" ]; then
    echo "Failed to extract class hash. Check if contract was already declared."
    echo "If already declared, use the existing class hash for deployment."
    read -p "Enter Class Hash manually (or press Enter to exit): " MANUAL_HASH
    if [ -n "$MANUAL_HASH" ]; then
        CLASS_HASH=$MANUAL_HASH
    else
        exit 1
    fi
fi

echo ""
echo "Deploying StarkFleetClash with class hash: $CLASS_HASH"

# Extract the account address to use as the owner
# Using more robust extraction from sncast account list
ACCOUNT_ADDRESS=$(sncast --profile mainnet account list | grep -A 5 "^- starfleet_mainnet:" | grep "address:" | awk '{print $2}')

if [ -z "$ACCOUNT_ADDRESS" ]; then
    echo "⚠️  Could not find address for 'starfleet_mainnet' account automatically."
    echo "This can happen if grep or sncast output formatting changed."
    read -p "Enter Owner Address manually (starting with 0x): " ACCOUNT_ADDRESS
    if [ -z "$ACCOUNT_ADDRESS" ]; then
        echo "Deployment aborted: Owner address required."
        exit 1
    fi
fi

echo "✅ Using Owner Address: $ACCOUNT_ADDRESS"
sncast --profile mainnet deploy --class-hash "$CLASS_HASH" --constructor-calldata "$ACCOUNT_ADDRESS"

echo ""
echo "Deployment complete!"
echo "Save the contract address immediately."
