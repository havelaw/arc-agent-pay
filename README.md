# arc-agent-pay

AI agents that work, evaluate, and get paid — fully autonomous, fully on-chain.

Built on [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) (Agentic Commerce Protocol) on Arc testnet. No humans in the loop.

**[Live Dashboard](https://arc-agent-pay.vercel.app)** · **[Escrow Contract](https://testnet.arcscan.app/address/0x936083B0cA386f74E60405B551418f78247DdFd3)** · **[Pipeline Contract](https://testnet.arcscan.app/address/0x3C789996743e456C73ab1110ab1A36E11deBA0eb)**

## What this does

```
┌──────────────────────────────────────────────────────────────────┐
│                    AI Agent Payment System                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🧑‍💼 Client AI        ⚡ Worker AI         🧠 Evaluator AI       │
│  Posts task +         Does the work &      Reviews quality       │
│  locks payment        submits results      (powered by Claude)   │
│       │                    │                     │               ��
│       ▼                    ▼                     ▼               │
│  ┌─────────────── On-Chain Escrow ───────────────────┐          │
│  │  Pass → Worker gets paid                          │          │
│  │  Fail → Client gets refunded                      │          │
│  └───────────────────────────────────────────────────┘          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Two modes

| Mode | Description | Contract |
|------|-------------|----------|
| **Single Job** | One task → one payment | AgentEscrowNative |
| **Multi-Step Pipeline** | Chained tasks → step-by-step payment + gas compensation | AgentPipelineNative |

### Pipeline example: BTC Analysis

```
Step 1                    Step 2                    Step 3
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ Collect OHLCV   │ ───► │ Find Support/   │ ───► │ Trade           │
│ data + compute  │      │ Resistance      │      │ Recommendation  │
│ RSI, MACD, BB   │      │ levels          │      │ (entry/SL/TP)   │
├─────────────────┤      ├─────────────────┤      ├─────────────────┤
│ +0.55 USDC      │      │ +0.55 USDC      │      │ +1.10 USDC      │
└─────────────────┘      └─────────────────┘      └─────────────────┘

Each step's output feeds the next step's input.
Worker earns reward + gas compensation per step.
If any step fails → remaining budget refunded to client.
```

## Live on Arc Testnet

All contracts deployed with real transactions on Arc testnet (chain ID `5042002`).

### Deployed Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| AgentEscrowNative | [`0x936083B0...DdFd3`](https://testnet.arcscan.app/address/0x936083B0cA386f74E60405B551418f78247DdFd3) | Single job escrow |
| AgentPipelineNative | [`0x3C789996...A0eb`](https://testnet.arcscan.app/address/0x3C789996743e456C73ab1110ab1A36E11deBA0eb) | Multi-step pipeline |

### On-chain proof: Single Job Flow

| Step | Transaction | Description |
|------|-------------|-------------|
| Deploy | [`0x7cf778d6...`](https://testnet.arcscan.app/tx/0x7cf778d6395d868ab52d441dbaedfdd64fec452d6ae3e98a813eb1abf7f63c65) | AgentEscrowNative deployment |
| Job #0 Create | [`0xe97eb001...`](https://testnet.arcscan.app/tx/0xe97eb00147ff655457d2dd705b75a0ccc774487218ad2fc3fb959588aaf20aa3) | Client creates BTC analysis task |
| Job #0 Fund | [`0x5aca2dfe...`](https://testnet.arcscan.app/tx/0x5aca2dfe559f9d9b1bfb5de9dcd9775d4839d380f52edde4daefffa3c8efecea) | 1 USDC deposited into escrow |
| Job #0 Submit | [`0x929bf8c3...`](https://testnet.arcscan.app/tx/0x929bf8c35f6738fcdab209c837e95804f670a7b8f3b16cad982dbd02eef108fb) | Worker submits deliverable |
| Job #0 Complete | [`0xece6dfa8...`](https://testnet.arcscan.app/tx/0xece6dfa80b1060d86e49ae96ae58d551d47033a080722a5739417baec2ab5811) | Evaluator approves → 1 USDC paid |
| Job #1 (Auto) | [`0x5d802f95...`](https://testnet.arcscan.app/tx/0x5d802f953d7923f66f0285aa591fc6db93541521ac59ea59feb77c11373b79bf) | Fully autonomous: create → submit → complete |

### On-chain proof: Multi-Step Pipeline

Pipeline #0 — "BTC Analysis Pipeline" (3 steps, 2.2 USDC total)

| Step | Transaction | Description |
|------|-------------|-------------|
| Deploy | [`0x68eb5839...`](https://testnet.arcscan.app/tx/0x68eb58391324c2f6bbef1759864f1374437ae09eef867235048bbb4cabd43ea9) | AgentPipelineNative deployment |
| Create Pipeline | [`0xef027aac...`](https://testnet.arcscan.app/tx/0xef027aacc0192c9461216b9eb28eafcf73340542ed65cc70739d335dc8cfbb19) | 3-step BTC analysis pipeline created |
| Fund (2.2 USDC) | [`0xf22d97f0...`](https://testnet.arcscan.app/tx/0xf22d97f0425c4e07a50c64c6eff69df99089f633ec2cc34cb15c0fa4927b0b36) | Budget locked, Step 0 activated |
| Step 1 Submit | [`0xfad809a2...`](https://testnet.arcscan.app/tx/0xfad809a2767bde17cb41265785adb3cd50e30ba14b5c8255da20ca89538d2bb7) | OHLCV data + RSI/MACD/BB computed |
| Step 1 Approved | [`0x9f4931d8...`](https://testnet.arcscan.app/tx/0x9f4931d81caa46a563c2d2559e675b97d007c812c9724cec81baa03504037cec) | +0.55 USDC → Worker |
| Step 2 Submit | [`0xb0493b17...`](https://testnet.arcscan.app/tx/0xb0493b17a25ffc03149f5d6d10af873e69412d7e77dd093dc62e7058b057ae7a) | Support/resistance levels identified |
| Step 2 Approved | [`0x9c4840a4...`](https://testnet.arcscan.app/tx/0x9c4840a4ca92f1ec7869628d2ea0379f24083a7b1e69f6d944ad7ab0712da614) | +0.55 USDC → Worker |
| Step 3 Submit | [`0xb02bd79f...`](https://testnet.arcscan.app/tx/0xb02bd79fc29085396ecfa314427dee28bfb13f4b34d8bea549e5c212fb98cae9) | Trade recommendation generated |
| Step 3 Approved | [`0xeea10451...`](https://testnet.arcscan.app/tx/0xeea10451d4e55ebf32425a54d9ce5fdf2d7b24122bc6eb4ce6c6c75506207770) | +1.10 USDC → Worker. Pipeline COMPLETE |

### Agent wallets

| Agent | Address | Role |
|-------|---------|------|
| Client | [`0xd9Ae...d091`](https://testnet.arcscan.app/address/0xd9Ae1876154a541A45ad623bE0E9106DC296d091) | Creates and funds jobs |
| Worker | [`0xE717...87e0`](https://testnet.arcscan.app/address/0xE717b1107C640A9273667Fd6d7566D7B9Eed87e0) | Performs work, submits deliverables |
| Evaluator | [`0xaa69...92E4`](https://testnet.arcscan.app/address/0xaa69e9e4E32D5Ca2Ae6378d9D85a8d5d63BF92E4) | AI-powered quality evaluation |

## Quick start

```bash
npm install
npm run compile

# Single job demo (local)
npm run demo:full

# Multi-step pipeline (Arc testnet)
npm run pipeline:run
```

### Run on Arc testnet

```bash
# 1. Generate agent wallets
npm run wallets

# 2. Configure
cp .env.example .env
# Fill in private keys, ANTHROPIC_API_KEY (optional)

# 3. Fund wallets at https://faucet.circle.com (Arc Testnet)

# 4. Deploy contracts
npm run deploy:arc        # single escrow
npm run deploy:pipeline   # multi-step pipeline

# 5. Run agents
npx tsx scripts/agents/run-all.ts           # single job mode
npx tsx scripts/agents/pipeline-run-all.ts  # pipeline mode
```

### Agent bots

| Bot | Single Job | Pipeline |
|-----|-----------|----------|
| **Client** | `client-bot.ts` | `pipeline-client.ts` |
| **Worker** | `worker-watcher.ts` | `pipeline-worker.ts` |
| **Evaluator** | `evaluator-watcher.ts` | `pipeline-evaluator.ts` |
| **All-in-one** | `run-all.ts` | `pipeline-run-all.ts` |

### Web dashboard

**[arc-agent-pay.vercel.app](https://arc-agent-pay.vercel.app)**

- Pipeline visualization (step-by-step progress)
- Real-time agent balances
- Live on-chain event feed
- Job listing with status tracking

## Contracts

| Contract | Purpose | Key Feature |
|----------|---------|-------------|
| **AgentEscrowNative.sol** | Single job escrow | ERC-8183, native USDC via `msg.value` |
| **AgentPipelineNative.sol** | Multi-step pipeline | Step chaining, gas compensation, partial refund |
| **AgentEscrow.sol** | ERC-20 variant | For standard EVM chains |
| **MockUSDC.sol** | Test token | Local development |

### Pipeline features

- **Step chaining**: Each step's deliverable becomes the next step's input
- **Gas compensation**: Workers receive reward + gas fee per step (USDC = gas on Arc)
- **Partial failure**: If step N fails, steps N..end budget is refunded to client
- **Expiry protection**: Anyone can trigger refund after deadline

## Tech stack

- Solidity 0.8.24 + OpenZeppelin (ReentrancyGuard)
- Hardhat v3 (viaIR, Solidity tests with forge-std)
- Arc Chain (EVM L1, USDC native gas, chain ID 5042002)
- ethers.js v6
- Claude API (Anthropic SDK) for AI evaluation
- Vercel for dashboard hosting

## Why Arc?

Arc is Circle's L1 blockchain where **USDC is the native gas token**. This means:
- No ETH needed — agents pay gas in the same token they earn
- Sub-second deterministic finality
- Gas compensation is trivial (just add USDC to the payout)

This makes it ideal for micro-payment agent economies where gas costs matter.

- [Arc docs](https://docs.arc.io)
- [ERC-8183 spec](https://eips.ethereum.org/EIPS/eip-8183)
- [Faucet](https://faucet.circle.com)
- [Block explorer](https://testnet.arcscan.app)

## License

MIT
