/**
 * Orchestrator: runs Worker + Evaluator watchers, then Client posts a job.
 * Demonstrates fully autonomous agent-to-agent payment on Arc testnet.
 */
import "dotenv/config";
import { ethers } from "ethers";
import { readFile } from "fs/promises";
import { ContractWatcher } from "./watcher.js";

const RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const EXPLORER = "https://testnet.arcscan.app";
const POLL_MS = 3000;

const TX_OPTS = {
  gasLimit: 500_000n,
  maxFeePerGas: ethers.parseUnits("100", "gwei"),
  maxPriorityFeePerGas: ethers.parseUnits("25", "gwei"),
};

async function performAnalysis(desc: string): Promise<string> {
  if (desc.toUpperCase().includes("BTC")) {
    return `BTC/USDC 4H: Consolidating at 68,500 above 200 EMA. Support 67,200. Resistance 70,100. LONG bias. Entry 68,600. SL 67,000. TP 71,500. R:R 1:1.8. Confidence 78%. T=${Date.now()}`;
  }
  return `Analysis for "${desc.substring(0, 40)}..." completed at ${new Date().toISOString()}.`;
}

async function main() {
  const escrowAddr = process.env.ESCROW_ADDRESS;
  if (!escrowAddr) throw new Error("ESCROW_ADDRESS required");

  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const clientW = new ethers.Wallet(process.env.CLIENT_PRIVATE_KEY!, provider);
  const workerW = new ethers.Wallet(process.env.WORKER_PRIVATE_KEY!, provider);
  const evalW = new ethers.Wallet(process.env.EVALUATOR_PRIVATE_KEY!, provider);

  const { abi } = JSON.parse(
    await readFile("artifacts/contracts/AgentEscrowNative.sol/AgentEscrowNative.json", "utf-8")
  );

  const escrowClient = new ethers.Contract(escrowAddr, abi, clientW);
  const escrowWorker = new ethers.Contract(escrowAddr, abi, workerW);
  const escrowEval = new ethers.Contract(escrowAddr, abi, evalW);

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   Arc Agent Pay — Autonomous Multi-Agent Demo        ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");
  console.log("Escrow:", EXPLORER + "/address/" + escrowAddr);

  for (const [name, w] of [["Client", clientW], ["Worker", workerW], ["Evaluator", evalW]] as const) {
    const bal = await provider.getBalance(w.address);
    console.log(`  ${name}: ${w.address} (${ethers.formatEther(bal)} USDC)`);
  }

  // --- Start Worker Watcher ---
  const workerProcessed = new Set<string>();
  const workerWatcher = new ContractWatcher({
    provider,
    contract: escrowWorker,
    pollIntervalMs: POLL_MS,
  });

  workerWatcher.on("JobFunded", async (_log, parsed) => {
    const jobId = parsed.args[0];
    const key = jobId.toString();
    if (workerProcessed.has(key)) return;

    const job = await escrowWorker.getJob(jobId);
    if (job[1].toLowerCase() !== workerW.address.toLowerCase()) return;

    workerProcessed.add(key);
    const ts = new Date().toISOString().substring(11, 19);
    console.log(`\n  [Worker ${ts}] Job #${key} detected — performing work...`);

    const result = await performAnalysis(job[3]);
    console.log(`  [Worker ${ts}] Submitting: "${result.substring(0, 60)}..."`);

    const tx = await escrowWorker.submit(jobId, ethers.id(result), TX_OPTS);
    const r = await tx.wait();
    console.log(`  [Worker ${ts}] Submitted! ${EXPLORER}/tx/${r.hash}`);
  });

  // --- Start Evaluator Watcher ---
  const evalProcessed = new Set<string>();
  const evalWatcher = new ContractWatcher({
    provider,
    contract: escrowEval,
    pollIntervalMs: POLL_MS,
  });

  evalWatcher.on("JobSubmitted", async (_log, parsed) => {
    const jobId = parsed.args[0];
    const key = jobId.toString();
    if (evalProcessed.has(key)) return;

    const job = await escrowEval.getJob(jobId);
    if (job[2].toLowerCase() !== evalW.address.toLowerCase()) return;
    if (Number(job[6]) !== 2) return;

    evalProcessed.add(key);
    const ts = new Date().toISOString().substring(11, 19);

    const score = 70 + Math.floor(Math.random() * 25);
    const approved = score >= 60;
    console.log(`\n  [Evaluator ${ts}] Job #${key} — Score: ${score}/100 → ${approved ? "APPROVED" : "REJECTED"}`);

    const reason = ethers.id(`Score ${score}/100 at ${Date.now()}`);
    if (approved) {
      const tx = await escrowEval.complete(jobId, reason, TX_OPTS);
      const r = await tx.wait();
      console.log(`  [Evaluator ${ts}] Completed! ${ethers.formatEther(job[4])} USDC → worker`);
      console.log(`  [Evaluator ${ts}] ${EXPLORER}/tx/${r.hash}`);
    } else {
      const tx = await escrowEval.reject(jobId, reason, TX_OPTS);
      const r = await tx.wait();
      console.log(`  [Evaluator ${ts}] Rejected! ${ethers.formatEther(job[4])} USDC → client`);
      console.log(`  [Evaluator ${ts}] ${EXPLORER}/tx/${r.hash}`);
    }
  });

  // --- Start watching ---
  console.log("\n--- Watchers started (polling every 3s) ---\n");
  workerWatcher.start();
  evalWatcher.start();

  // --- Client posts a job after 3s ---
  await sleep(3000);

  const budget = ethers.parseEther("0.5"); // 0.5 USDC
  const block = await provider.getBlock("latest");
  const expiry = BigInt(block!.timestamp) + 86400n;

  console.log("[Client] Creating job: BTC analysis, 0.5 USDC budget...");
  const tx1 = await escrowClient.createJob(
    workerW.address, evalW.address, budget, expiry,
    "Analyze BTC/USDC 4H chart: support/resistance, directional bias, entry/SL/TP",
    TX_OPTS
  );
  const r1 = await tx1.wait();
  const jobId = (await escrowClient.jobCount()) - 1n;
  console.log(`[Client] Job #${jobId} created: ${EXPLORER}/tx/${r1.hash}`);

  console.log("[Client] Funding 0.5 USDC...");
  const tx2 = await escrowClient.fund(jobId, { ...TX_OPTS, value: budget });
  const r2 = await tx2.wait();
  console.log(`[Client] Funded: ${EXPLORER}/tx/${r2.hash}`);
  console.log("[Client] Now watching for autonomous agents to react...\n");

  // Wait for the full cycle to complete
  await sleep(60_000);

  // Print final state
  console.log("\n━━━ Final Balances ━━━");
  for (const [name, w] of [["Client", clientW], ["Worker", workerW], ["Evaluator", evalW]] as const) {
    const bal = await provider.getBalance(w.address);
    console.log(`  ${name}: ${ethers.formatEther(bal)} USDC`);
  }

  const job = await escrowClient.getJob(jobId);
  const STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"];
  console.log(`  Job #${jobId} status: ${STATUS[Number(job[6])]}`);

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║   Autonomous Demo Complete!                          ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  process.exit(0);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
