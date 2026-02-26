# StarkFleet Clash - BROTHER MAXX @fearmekvv

**Privacy-Preserving Turn-Based Battleship on Starknet**

> Trustless Battleship. Real fog of war. Zero trust required.

A fully on-chain implementation of the classic Battleship game using Merkle-tree commit-reveal mechanics for cryptographic privacy on Starknet.

## 🎮 Overview

StarkFleet Clash is a pvp turn-based strategy game where players:
- Place their fleet secretly on a 10×10 grid
- Commit their board using a Merkle root (Pedersen hash)
- Take turns attacking opponent coordinates
- Reveal hit/miss with cryptographic proofs
- First to 7 hits wins the entire pot (quick game version)

## 🏗️ Architecture

```
starfleet/
├── contracts/              # Cairo smart contracts
│   ├── src/
│   │   ├── starkfleet_clash.cairo    # Main game contract
│   │   └── merkle_verifier.cairo     # Pedersen Merkle proofs
│   ├── tests/              # Contract tests (6 passing)
│   └── scripts/deploy.sh   # Deployment script
│
└── frontend/               # Next.js web app
    ├── src/
    │   ├── app/            # Pages (landing, game)
    │   ├── components/     # UI components
    │   └── lib/            # Merkle tree, board logic
    └── README.md
```

## ✨ Features

### Smart Contract (Cairo)
- ✅ Game creation with STRK staking
- ✅ Join game and match stake
- ✅ Merkle root commitment
- ✅ Attack submission
- ✅ Reveal with Pedersen proof verification
- ✅ Victory claiming (17 hits)
- ✅ Timeout forfeits (24h default)
- ✅ Pot distribution to winner

### Frontend (Next.js + React)
- ✅ Wallet connection (ArgentX/Braavos)
- ✅ Ship placement UI with validation
- ✅ Merkle tree generation (Pedersen)
- ✅ Board serialization
- ✅ Responsive design with Tailwind CSS
- ✅ Contract integration (in progress)
- ✅ Real-time game state
- ✅ Attack/reveal flow

## 🚀 Quick Start

### 1. Smart Contract

```bash
cd contracts

# Build contracts
scarb build

# Run tests
snforge test

# Deploy to Sepolia (requires funded account)
./scripts/deploy.sh
```

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Update contract address in src/lib/contract.ts
# STARKFLEET_CONTRACT_ADDRESS = '0x...'

# Run dev server
npm run dev

# Open http://localhost:3000
```

## 🎯 Game Rules

### Board
- 10×10 grid (columns A–J, rows 1–10)

### Fleet (17 cells total)
| Ship       | Length | Quantity |
|------------|--------|----------|
| Carrier    | 5      | 1        |
| Battleship | 4      | 1        |
| Cruiser    | 3      | 2        |
| Submarine  | 3      | 1        |
| Destroyer  | 2      | 1        |

### Placement Rules
- Horizontal or vertical only
- No overlapping ships
- **No adjacent placement** (including diagonally)

### Game Flow
1. **Create**: Player 1 stakes STRK, gets game ID
2. **Join**: Player 2 matches stake
3. **Commit**: Both submit Merkle roots of their boards
4. **Attack**: Players alternate attacking coordinates
5. **Reveal**: Defender reveals hit/miss + Merkle proof
6. **Win**: First to 7 hits claims the pot

### Timeouts
- 24 hours per turn
- Opponent can claim forfeit after timeout

## 🔐 Privacy Mechanics

### Merkle Tree Commitment
```
Board (10×10) → 100 leaves
Each leaf = pedersen(pedersen(pedersen(x, y), cell_value), salt)

Tree built bottom-up with Pedersen hash
Root committed on-chain
```

### Proof Generation
When attacked at (x, y):
1. Compute leaf for that cell
2. Generate Merkle proof (sibling hashes)
3. Submit proof to contract
4. Contract verifies proof matches committed root

### Privacy Guarantees
- Full board hidden until end
- Only attacked cells revealed
- Impossible to cheat without detection
- No trusted third party needed

## 📊 Contract Details

**Network**: Starknet Sepolia  /  Starknet Mainnet
**Language**: Cairo 2.15.0  
**Gas Target**: <300k L2 gas per tx  
**Minimum Stake**: 1 $STRK  
**Timeout**: 24 hours  

### Events
- `creat_game`, `join_game`, `commit_board`
- `attack`, `reveal`
-  `claim_victory`, 'claim_timeout'

## 🧪 Testing

```bash
# Contract tests
cd contracts && snforge test

# All 6 tests passing:
# - Merkle verifier (3 tests)
# - Contract integration (3 tests)
```

## 📝 Development Status

### Phase 1: Smart Contract ✅
- [x] Game logic implementation
- [x] Merkle proof verification
- [x] Staking and pot distribution
- [x] Timeout enforcement
- [x] Unit tests
- [x] Deployment scripts

### Phase 2: Merkle Library ✅
- [x] Pedersen hash implementation
- [x] Tree generation
- [x] Proof generation
- [x] Board validation

### Phase 3: Frontend ✅
- [x] Next.js setup
- [x] Wallet integration
- [x] Ship placement UI
- [x] Game board component
- [x] Landing page

### Phase 4: Integration 🚧
- [x] Contract hooks
- [x] Create/join game flow
- [x] Attack/reveal flow
- [x] Real-time updates
- [x] End-to-end testing

### Phase 5: Launch 📅
- [ ] UI polish
- [x] Documentation
- [ ] Community testing
- [x] Mainnet deployment

## 🛠️ Tech Stack

- **Smart Contracts**: Cairo 2.15, Scarb, Starknet Foundry
- **Frontend**: Next.js 15, React, TypeScript
- **Styling**: Tailwind CSS
- **Blockchain**: Starknet (Sepolia testnet)
- **Wallets**: starknet-react, ArgentX, Braavos
- **Cryptography**: Pedersen hash (native Starknet)

## 📚 Resources

- [Starknet Docs](https://docs.starknet.io/)
- [Cairo Book](https://book.cairo-lang.org/)
- [Starknet React](https://starknet-react.com/)
- [Sepolia Faucet](https://starknet-faucet.vercel.app/)

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

## 📄 License

MIT

---

**Built with ❤️ by Starknet Brother on Starknet**
