# arc-agent-pay

AI Agent escrow payments on Arc testnet, built on [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) (Agentic Commerce Protocol).

Agents create jobs, fund them with USDC, submit deliverables, and get paid — all on-chain. An AI evaluator (Claude) validates work quality before releasing funds.

**[Live Dashboard](https://arc-agent-pay.vercel.app)** · **[Escrow Contract on ArcScan](https://testnet.arcscan.app/address/0x936083B0cA386f74E60405B551418f78247DdFd3)**

## How it works

```
Client Agent  ──createJob + fund──►  AgentEscrow (on Arc)
                                          │
Worker Agent  ◄──watches for jobs─────────┘
              ──submit(deliverableHash)──►
                                          │
AI Evaluator  ◄──reviews submission───────┘
              ──complete() or reject()──►  USDC auto-settles
```

### Job lifecycle (ERC-8183)

| Status | Description |
|--------|-------------|
| Open | Job created, not yet funded |
| Funded | USDC deposited into escrow |
| Submitted | Worker delivered result |
| Completed | Evaluator approved → worker paid |
| Rejected | Evaluator rejected → client refunded |
| Expired | Deadline passed → client can claim refund |

## Live on Arc Testnet

Contract deployed and verified with real transactions on Arc testnet (chain ID `5042002`).

**Deployed Contract:** [`0x936083B0cA386f74E60405B551418f78247DdFd3`](https://testnet.arcscan.app/address/0x936083B0cA386f74E60405B551418f78247DdFd3)

### On-chain transactions

| Step | Transaction | Description |
|------|-------------|-------------|
| Deploy | [`0x7cf778d6...`](https://testnet.arcscan.app/tx/0x7cf778d6395d868ab52d441dbaedfdd64fec452d6ae3e98a813eb1abf7f63c65) | AgentEscrowNative contract deployment |
| Job #0 Create | [`0xe97eb001...`](https://testnet.arcscan.app/tx/0xe97eb00147ff655457d2dd705b75a0ccc774487218ad2fc3fb959588aaf20aa3) | Client creates BTC analysis task |
| Job #0 Fund | [`0x5aca2dfe...`](https://testnet.arcscan.app/tx/0x5aca2dfe559f9d9b1bfb5de9dcd9775d4839d380f52edde4daefffa3c8efecea) | 1 USDC deposited into escrow |
| Job #0 Submit | [`0x929bf8c3...`](https://testnet.arcscan.app/tx/0x929bf8c35f6738fcdab209c837e95804f670a7b8f3b16cad982dbd02eef108fb) | Worker submits analysis deliverable |
| Job #0 Complete | [`0xece6dfa8...`](https://testnet.arcscan.app/tx/0xece6dfa80b1060d86e49ae96ae58d551d47033a080722a5739417baec2ab5811) | Evaluator approves → 1 USDC paid to worker |
| Job #1 Create | [`0x5d802f95...`](https://testnet.arcscan.app/tx/0x5d802f953d7923f66f0285aa591fc6db93541521ac59ea59feb77c11373b79bf) | Autonomous agent creates task |
| Job #1 Submit | [`0xf608888e...`](https://testnet.arcscan.app/tx/0xf608888e835feb4bb306e40a09054b702724c0967e8e795398cba423cc5c48b6) | Worker auto-detects and submits |
| Job #1 Complete | [`0xdd1543ac...`](https://testnet.arcscan.app/tx/0xdd1543acc6482e7ffcbdee9306d53a049fe40a97443898a2892f913af743b2e4) | Evaluator auto-approves (score 90/100) |

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
npm run demo:full   # runs all 3 agent bots E2E on local Hardhat network
```

### Autonomous agent mode

Agents watch the chain and react automatically — no human intervention:

```bash
# Run all 3 agents autonomously (polls Arc testnet every 3-4s)
npx tsx scripts/agents/run-all.ts
```

Or run each agent in a separate terminal:

```bash
npx tsx scripts/agents/worker-watcher.ts      # auto-picks up funded jobs
npx tsx scripts/agents/evaluator-watcher.ts   # auto-evaluates submissions
```

### Agent bots

| Bot | Role | Manual | Autonomous |
|-----|------|--------|------------|
| **Client** | Creates jobs, funds with USDC | `client-bot.ts` | `run-all.ts` |
| **Worker** | Detects jobs, performs analysis, submits | `worker-bot.ts` | `worker-watcher.ts` |
| **Evaluator** | AI evaluates quality, approves/rejects | `evaluator-bot.ts` | `evaluator-watcher.ts` |

### Deploy to Arc testnet

```bash
# 1. Generate agent wallets
npm run wallets

# 2. Configure
cp .env.example .env
# fill in private keys, ANTHROPIC_API_KEY (optional)

# 3. Fund wallets at https://faucet.circle.com (Arc Testnet, 20 USDC each)

# 4. Deploy
npx tsx scripts/deploy-arc.ts

# 5. Set ESCROW_ADDRESS in .env, then run agents
npx tsx scripts/agents/run-all.ts
```

### Web dashboard

Live dashboard at **[arc-agent-pay.vercel.app](https://arc-agent-pay.vercel.app)**:
- Real-time agent balances
- Job listing with status tracking
- Live event log (polls every 5s)
- MetaMask integration for creating jobs

```bash
npx serve web   # or visit the Vercel deployment
```

## Contracts

- **AgentEscrowNative.sol** — ERC-8183 escrow for Arc (native USDC via `msg.value`)
- **AgentEscrow.sol** — ERC-20 variant for standard EVM chains
- **MockUSDC.sol** — test token for local development

## Tech stack

- Solidity 0.8.24 + OpenZeppelin (ReentrancyGuard, SafeERC20)
- Hardhat v3
- Arc Chain (EVM L1, USDC native gas, chain ID 5042002)
- ethers.js v6
- Claude API (Anthropic SDK) for AI evaluation
- Vercel for dashboard hosting

## Arc Chain

Arc is an open Layer-1 blockchain by Circle, purpose-built for programmable money. USDC is the native gas token with sub-second deterministic finality. Currently **testnet only**.

- [Arc docs](https://docs.arc.io)
- [ERC-8183 spec](https://eips.ethereum.org/EIPS/eip-8183)
- [Faucet](https://faucet.circle.com)
- [Block explorer](https://testnet.arcscan.app)

## License

MIT
