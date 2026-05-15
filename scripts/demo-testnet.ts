/**
 * E2E Demo on Arc Testnet (live chain)
 * Runs Client → Worker → Evaluator flow with real USDC.
 */
import "dotenv/config";
import { ethers } from "ethers";
import { readFile } from "fs/promises";

const STATUS_NAMES = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"];
const RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;
const EXPLORER = "https://testnet.arcscan.app";

function link(type: string, hash: string) {
  return `${EXPLORER}/${type}/${hash}`;
}

async function main() {
  const escrowAddr = process.env.ESCROW_ADDRESS;
  if (!escrowAddr) throw new Error("ESCROW_ADDRESS required");

  const provider = new ethers.JsonRpcProvider(RPC, CHAIN_ID);
  const clientWallet = new ethers.Wallet(process.env.CLIENT_PRIVATE_KEY!, provider);
  const workerWallet = new ethers.Wallet(process.env.WORKER_PRIVATE_KEY!, provider);
  const evaluatorWallet = new ethers.Wallet(process.env.EVALUATOR_PRIVATE_KEY!, provider);

  const raw = await readFile("artifacts/contracts/AgentEscrowNative.sol/AgentEscrowNative.json", "utf-8");
  const { abi } = JSON.parse(raw);

  const escrowClient = new ethers.Contract(escrowAddr, abi, clientWallet);
  const escrowWorker = new ethers.Contract(escrowAddr, abi, workerWallet);
  const escrowEvaluator = new ethers.Contract(escrowAddr, abi, evaluatorWallet);

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Arc Agent Pay — LIVE Testnet E2E Demo          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("Escrow:", link("address", escrowAddr));
  console.log();

  // Check balances
  for (const [name, w] of [["Client", clientWallet], ["Worker", workerWallet], ["Evaluator", evaluatorWallet]] as const) {
    const bal = await provider.getBalance(w.address);
    console.log(`${name}: ${w.address} (${ethers.formatEther(bal)} USDC)`);
  }

  // === PHASE 1: CLIENT ===
  console.log("\n━━━ Phase 1: Client creates & funds job ━━━");
  const budget = ethers.parseEther("1"); // 1 USDC (18 decimals native)
  const block = await provider.getBlock("latest");
  const expiry = BigInt(block!.timestamp) + 86400n; // 24h

  const txOpts = {
    gasLimit: 500_000n,
    maxFeePerGas: ethers.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("25", "gwei"),
  };

  console.log("Creating job (budget: 1 USDC, expires 24h)...");
  const tx1 = await escrowClient.createJob(
    workerWallet.address,
    evaluatorWallet.address,
    budget,
    expiry,
    "Analyze BTC/USDC 4H chart: support/resistance, bias, entry/SL/TP",
    txOpts
  );
  const r1 = await tx1.wait();
  console.log("Job created!", link("tx", r1.hash));

  const jobId = (await escrowClient.jobCount()) - 1n;
  console.log("Job ID:", jobId.toString());

  console.log("Funding job with 1 USDC...");
  const tx2 = await escrowClient.fund(jobId, { ...txOpts, value: budget });
  const r2 = await tx2.wait();
  console.log("Funded!", link("tx", r2.hash));

  // === PHASE 2: WORKER ===
  console.log("\n━━━ Phase 2: Worker submits deliverable ━━━");
  const analysis = "BTC/USDC 4H: Consolidating at 68,500 above 200 EMA (67,200). Resistance 70,100. LONG bias. Entry: 68,600. SL: 67,000 (-2.3%). TP: 71,500 (+4.2%). R:R 1:1.8. Confidence: 78%.";
  const deliverableHash = ethers.id(analysis);
  console.log("Analysis:", analysis.substring(0, 80) + "...");

  const tx3 = await escrowWorker.submit(jobId, deliverableHash, txOpts);
  const r3 = await tx3.wait();
  console.log("Submitted!", link("tx", r3.hash));

  // === PHASE 3: EVALUATOR ===
  console.log("\n━━━ Phase 3: Evaluator approves ━━━");
  const reason = ethers.id("AI evaluation: score 85/100, analysis meets requirements");

  const workerBalBefore = await provider.getBalance(workerWallet.address);
  const tx4 = await escrowEvaluator.complete(jobId, reason, txOpts);
  const r4 = await tx4.wait();
  console.log("Approved!", link("tx", r4.hash));

  const workerBalAfter = await provider.getBalance(workerWallet.address);
  const earned = workerBalAfter - workerBalBefore;
  console.log("Worker earned:", ethers.formatEther(earned), "USDC");

  // === RESULTS ===
  console.log("\n━━━ Final Results ━━━");
  const job = await escrowClient.getJob(jobId);
  console.log("Job #" + jobId + " status:", STATUS_NAMES[Number(job[6])]);

  for (const [name, w] of [["Client", clientWallet], ["Worker", workerWallet], ["Evaluator", evaluatorWallet]] as const) {
    const bal = await provider.getBalance(w.address);
    console.log(`${name} balance: ${ethers.formatEther(bal)} USDC`);
  }

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║   LIVE Testnet Demo Complete!                    ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("\nView all transactions:");
  console.log("  Escrow:", link("address", escrowAddr));
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
