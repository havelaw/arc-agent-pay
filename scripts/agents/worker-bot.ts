/**
 * Worker Agent Bot
 * Watches for funded jobs, performs work, and submits deliverables.
 */
import "dotenv/config";
import { ethers } from "ethers";
import {
  getWallet,
  getEscrowContract,
  txLink,
  formatUSDC,
  STATUS_NAMES,
} from "./common.js";

async function performWork(description: string): Promise<string> {
  console.log("\n  [AI Worker] Analyzing task:", description);

  // Simulated AI analysis - in production this would call an LLM or run actual analysis
  const analyses: Record<string, string> = {
    BTC: "BTC/USDC 4H Analysis: Price consolidating at 68,500. Support: 67,200 (200 EMA). Resistance: 70,100 (previous high). Bias: LONG. Entry: 68,600 on pullback to support. Stop-loss: 67,000 (-2.3%). Take-profit: 71,500 (+4.2%). R:R = 1:1.8. Volume declining in consolidation suggests breakout imminent.",
    ETH: "ETH/USDC Analysis: Bullish divergence on RSI. Entry: 3,850. SL: 3,700. TP: 4,200.",
    default:
      "Analysis complete. Task deliverable generated based on provided parameters.",
  };

  const key = Object.keys(analyses).find((k) =>
    description.toUpperCase().includes(k)
  );
  const result = analyses[key || "default"];

  console.log("  [AI Worker] Result:", result.substring(0, 100) + "...");
  return result;
}

async function main() {
  const pk = process.env.WORKER_PRIVATE_KEY;
  const escrowAddr = process.env.ESCROW_ADDRESS;

  if (!pk || !escrowAddr) {
    throw new Error("WORKER_PRIVATE_KEY and ESCROW_ADDRESS required in .env");
  }

  const wallet = getWallet(pk);
  const escrow = await getEscrowContract(escrowAddr, wallet);

  console.log("=== Worker Agent Bot ===");
  console.log("Address:", wallet.address);

  const balance = await wallet.provider!.getBalance(wallet.address);
  console.log("Balance:", formatUSDC(balance), "USDC (native)\n");

  const jobId = BigInt(process.argv[2] || "0");
  console.log("Checking job #" + jobId + "...");

  const job = await escrow.getJob(jobId);
  const [client, provider, evaluator, description, budget, expiredAt, status] =
    job;

  console.log("  Client:", client);
  console.log("  Budget:", formatUSDC(budget), "USDC");
  console.log("  Status:", STATUS_NAMES[Number(status)]);
  console.log("  Task:", description);

  if (provider.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      "This job is assigned to a different worker: " + provider
    );
  }

  if (Number(status) !== 1) {
    throw new Error(
      "Job is not in Funded status, current: " + STATUS_NAMES[Number(status)]
    );
  }

  const result = await performWork(description);
  const deliverableHash = ethers.id(result);

  console.log("\nSubmitting deliverable...");
  console.log("  Hash:", deliverableHash);

  const tx = await escrow.submit(jobId, deliverableHash);
  const receipt = await tx.wait();
  console.log("Submitted!", txLink(receipt.hash));

  const updatedJob = await escrow.getJob(jobId);
  console.log("\nJob status:", STATUS_NAMES[Number(updatedJob[6])]);
  console.log("\n--- Worker Bot Done ---");
  console.log("Waiting for evaluator to review...");
}

main().catch((err) => {
  console.error("Worker bot error:", err.message);
  process.exit(1);
});
