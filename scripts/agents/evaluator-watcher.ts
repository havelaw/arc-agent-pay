/**
 * Autonomous Evaluator Agent
 * Watches for JobSubmitted events and automatically evaluates with AI.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { ethers } from "ethers";
import { readFile } from "fs/promises";
import { ContractWatcher } from "./watcher.js";

const RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const EXPLORER = "https://testnet.arcscan.app";
const POLL_MS = 5000;

const TX_OPTS = {
  gasLimit: 500_000n,
  maxFeePerGas: ethers.parseUnits("100", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("25", "gwei"),
};

interface EvalResult {
  approved: boolean;
  score: number;
  reasoning: string;
}

async function evaluate(task: string, deliverableHash: string): Promise<EvalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("  [No ANTHROPIC_API_KEY — simulated evaluation]");
    const score = 70 + Math.floor(Math.random() * 25);
    return {
      approved: score >= 60,
      score,
      reasoning: `Simulated: score ${score}/100. Task "${task.substring(0, 40)}..." appears addressed.`,
    };
  }

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `You are an AI evaluator for an on-chain agent escrow. Evaluate whether the worker's submission meets the task requirements.

Task: "${task}"
Deliverable hash: ${deliverableHash}

Score 0-100 and approve if >= 60. Respond JSON only:
{"approved": true/false, "score": 0-100, "reasoning": "brief explanation"}`,
    }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return { approved: true, score: 70, reasoning: "Evaluation parse fallback — approved" };
}

async function main() {
  const pk = process.env.EVALUATOR_PRIVATE_KEY;
  const escrowAddr = process.env.ESCROW_ADDRESS;
  if (!pk || !escrowAddr) throw new Error("EVALUATOR_PRIVATE_KEY and ESCROW_ADDRESS required");

  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const wallet = new ethers.Wallet(pk, provider);
  const { abi } = JSON.parse(
    await readFile("artifacts/contracts/AgentEscrowNative.sol/AgentEscrowNative.json", "utf-8")
  );
  const escrow = new ethers.Contract(escrowAddr, abi, wallet);

  const balance = await provider.getBalance(wallet.address);
  console.log("╔═══════════════════════════════════════╗");
  console.log("║   Evaluator Agent (Autonomous + AI)   ║");
  console.log("╚═══════════════════════════════════════╝");
  console.log("Address:", wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "USDC");
  console.log("AI:", process.env.ANTHROPIC_API_KEY ? "Claude API connected" : "Simulated mode");
  console.log("Watching for submitted jobs...\n");

  const processedJobs = new Set<string>();

  const watcher = new ContractWatcher({
    provider,
    contract: escrow,
    pollIntervalMs: POLL_MS,
  });

  watcher.on("JobSubmitted", async (_log, parsed) => {
    const jobId = parsed.args[0];
    const deliverable = parsed.args[1];
    const key = jobId.toString();
    if (processedJobs.has(key)) return;

    console.log(`\n[${new Date().toISOString()}] Job #${key} submitted!`);

    const job = await escrow.getJob(jobId);
    const [client, workerAddr, assignedEvaluator, description, budget, , status] = job;

    if (assignedEvaluator.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log("  Skipping — assigned to different evaluator:", assignedEvaluator);
      return;
    }

    if (Number(status) !== 2) {
      console.log("  Skipping — not in Submitted status");
      return;
    }

    processedJobs.add(key);
    console.log("  Client:", client);
    console.log("  Worker:", workerAddr);
    console.log("  Budget:", ethers.formatEther(budget), "USDC");
    console.log("  Task:", description);
    console.log("  Deliverable:", deliverable);

    console.log("  Evaluating with AI...");
    const result = await evaluate(description, deliverable);
    console.log("  Score:", result.score + "/100");
    console.log("  Reasoning:", result.reasoning);
    console.log("  Verdict:", result.approved ? "APPROVED" : "REJECTED");

    const reasonHash = ethers.id(result.reasoning);

    if (result.approved) {
      console.log("  Releasing", ethers.formatEther(budget), "USDC to worker...");
      const tx = await escrow.complete(jobId, reasonHash, TX_OPTS);
      const receipt = await tx.wait();
      console.log("  Completed!", EXPLORER + "/tx/" + receipt.hash);
    } else {
      console.log("  Refunding", ethers.formatEther(budget), "USDC to client...");
      const tx = await escrow.reject(jobId, reasonHash, TX_OPTS);
      const receipt = await tx.wait();
      console.log("  Rejected!", EXPLORER + "/tx/" + receipt.hash);
    }
    console.log();
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down evaluator agent...");
    watcher.stop();
    process.exit(0);
  });

  await watcher.start();
}

main().catch((err) => {
  console.error("Evaluator watcher error:", err.message);
  process.exit(1);
});
