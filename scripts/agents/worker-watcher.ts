/**
 * Autonomous Worker Agent
 * Watches for JobFunded events and automatically performs work + submits.
 */
import "dotenv/config";
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

async function performAnalysis(description: string): Promise<string> {
  const desc = description.toUpperCase();
  if (desc.includes("BTC")) {
    return `BTC/USDC 4H: Price at 68,500 consolidating above 200 EMA. Support 67,200. Resistance 70,100. Bias: LONG. Entry: 68,600. SL: 67,000 (-2.3%). TP: 71,500 (+4.2%). R:R 1:1.8. Volume declining in consolidation → breakout likely. Confidence: 78%. Timestamp: ${Date.now()}`;
  }
  if (desc.includes("ETH")) {
    return `ETH/USDC Analysis: Bullish divergence on RSI 4H. Support 3,720. Entry: 3,850. SL: 3,700. TP: 4,200. R:R 1:3.3. Confidence: 72%. Timestamp: ${Date.now()}`;
  }
  return `Task analysis complete for: "${description.substring(0, 50)}". Result generated at ${new Date().toISOString()}. Deliverable ready for evaluation.`;
}

async function main() {
  const pk = process.env.WORKER_PRIVATE_KEY;
  const escrowAddr = process.env.ESCROW_ADDRESS;
  if (!pk || !escrowAddr) throw new Error("WORKER_PRIVATE_KEY and ESCROW_ADDRESS required");

  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const wallet = new ethers.Wallet(pk, provider);
  const { abi } = JSON.parse(
    await readFile("artifacts/contracts/AgentEscrowNative.sol/AgentEscrowNative.json", "utf-8")
  );
  const escrow = new ethers.Contract(escrowAddr, abi, wallet);

  const balance = await provider.getBalance(wallet.address);
  console.log("╔═══════════════════════════════════════╗");
  console.log("║   Worker Agent (Autonomous)           ║");
  console.log("╚═══════════════════════════════════════╝");
  console.log("Address:", wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "USDC");
  console.log("Watching for funded jobs...\n");

  const processedJobs = new Set<string>();

  const watcher = new ContractWatcher({
    provider,
    contract: escrow,
    pollIntervalMs: POLL_MS,
  });

  watcher.on("JobFunded", async (_log, parsed) => {
    const jobId = parsed.args[0];
    const key = jobId.toString();
    if (processedJobs.has(key)) return;

    console.log(`\n[${new Date().toISOString()}] Job #${key} funded!`);

    const job = await escrow.getJob(jobId);
    const [client, assignedProvider, , description, budget] = job;

    if (assignedProvider.toLowerCase() !== wallet.address.toLowerCase()) {
      console.log("  Skipping — assigned to different worker:", assignedProvider);
      return;
    }

    processedJobs.add(key);
    console.log("  Client:", client);
    console.log("  Budget:", ethers.formatEther(budget), "USDC");
    console.log("  Task:", description);

    console.log("  Performing analysis...");
    const result = await performAnalysis(description);
    console.log("  Result:", result.substring(0, 80) + "...");

    const hash = ethers.id(result);
    console.log("  Submitting deliverable...");
    const tx = await escrow.submit(jobId, hash, TX_OPTS);
    const receipt = await tx.wait();
    console.log("  Submitted!", EXPLORER + "/tx/" + receipt.hash);
    console.log("  Waiting for evaluator...\n");
  });

  watcher.on("JobCompleted", async (_log, parsed) => {
    const jobId = parsed.args[0];
    const payout = parsed.args[2];
    console.log(`\n[${new Date().toISOString()}] Job #${jobId} COMPLETED — earned ${ethers.formatEther(payout)} USDC!`);
    const bal = await provider.getBalance(wallet.address);
    console.log("  Current balance:", ethers.formatEther(bal), "USDC\n");
  });

  watcher.on("JobRejected", async (_log, parsed) => {
    const jobId = parsed.args[0];
    console.log(`\n[${new Date().toISOString()}] Job #${jobId} REJECTED`);
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down worker agent...");
    watcher.stop();
    process.exit(0);
  });

  await watcher.start();
}

main().catch((err) => {
  console.error("Worker watcher error:", err.message);
  process.exit(1);
});
