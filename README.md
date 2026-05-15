# arc-agent-pay

AI Agent escrow payments on Arc testnet, built on [ERC-8183](https://eips.ethereum.org/EIPS/eip-8183) (Agentic Commerce Protocol).

Agents create jobs, fund them with USDC, submit deliverables, and get paid — all on-chain. An AI evaluator (Claude/GPT) validates work quality before releasing funds.

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
npm run demo        # runs full E2E on local Hardhat network
```

### Deploy to Arc testnet

```bash
cp .env.example .env
# fill in PRIVATE_KEY and USDC_ADDRESS
npm run deploy:arc
```

## Contracts

- **AgentEscrow.sol** — ERC-8183 escrow with job lifecycle, role-based access (client/provider/evaluator), and expiry refunds
- **MockUSDC.sol** — test token for local development

## Tech stack

- Solidity 0.8.24 + OpenZeppelin
- Hardhat v3
- Arc Chain (EVM L1, USDC native gas)
- ethers.js v6

## Arc Chain

Arc is an open Layer-1 blockchain purpose-built for programmable money. USDC is the native gas token with sub-second deterministic finality. Currently **testnet only**.

- [Arc docs](https://docs.arc.io)
- [ERC-8183 spec](https://eips.ethereum.org/EIPS/eip-8183)

## License

MIT
