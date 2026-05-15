# arc-agent-pay

AI Agent escrow payments on Arc testnet, built on [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) (Agentic Commerce Protocol).

Agents create jobs, fund them with USDC, submit deliverables, and get paid — all on-chain. An AI evaluator (Claude) validates work quality before releasing funds.

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

## Quick start

```bash
npm install
npm run compile
npm run demo:full   # runs all 3 agent bots E2E on local Hardhat network
```

### Agent bots

Three autonomous bots that interact with the escrow contract:

| Bot | Role | Script |
|-----|------|--------|
| **Client Bot** | Creates jobs, funds with USDC | `scripts/agents/client-bot.ts` |
| **Worker Bot** | Picks up jobs, performs analysis, submits deliverable | `scripts/agents/worker-bot.ts` |
| **Evaluator Bot** | Uses Claude API to evaluate quality, approves/rejects | `scripts/agents/evaluator-bot.ts` |

### Deploy to Arc testnet

```bash
# 1. Generate agent wallets
npm run wallets

# 2. Configure
cp .env.example .env
# fill in private keys, USDC_ADDRESS, ANTHROPIC_API_KEY

# 3. Fund wallets with testnet USDC
# Visit https://faucet.circle.com → select Arc Testnet → paste each address

# 4. Deploy
npm run deploy:arc

# 5. Run agents (set ESCROW_ADDRESS in .env first)
npx tsx scripts/agents/client-bot.ts
npx tsx scripts/agents/worker-bot.ts 0
npx tsx scripts/agents/evaluator-bot.ts 0
```

## Contracts

- **AgentEscrow.sol** — ERC-8183 escrow with job lifecycle, role-based access (client/provider/evaluator), and expiry refunds
- **MockUSDC.sol** — test token for local development

## Tech stack

- Solidity 0.8.24 + OpenZeppelin
- Hardhat v3
- Arc Chain (EVM L1, USDC native gas, chain ID 5042002)
- ethers.js v6
- Claude API (Anthropic SDK) for AI evaluation

## Arc Chain

Arc is an open Layer-1 blockchain purpose-built for programmable money. USDC is the native gas token with sub-second deterministic finality. Currently **testnet only**.

- [Arc docs](https://docs.arc.io)
- [ERC-8183 spec](https://eips.ethereum.org/EIPS/eip-8183)
- [Faucet](https://faucet.circle.com)
- [Block explorer](https://testnet.arcscan.app)

## License

MIT
