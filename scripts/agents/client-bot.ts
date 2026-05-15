/**
 * Client Agent Bot
 * Creates jobs and funds them with USDC on Arc testnet.
 */
import "dotenv/config";
import { ethers } from "ethers";
import {
  getWallet,
  getEscrowContract,
  txLink,
  parseUSDC,
  formatUSDC,
  STATUS_NAMES,
} from "./common.js";

async function main() {
  const pk = process.env.CLIENT_PRIVATE_KEY;
  const escrowAddr = process.env.ESCROW_ADDRESS;
  const usdcAddr = process.env.USDC_ADDRESS;
  const workerAddr = process.env.WORKER_ADDRESS;
  const evaluatorAddr = process.env.EVALUATOR_ADDRESS;

  if (!pk || !escrowAddr) {
    throw new Error("CLIENT_PRIVATE_KEY and ESCROW_ADDRESS required in .env");
  }

  const wallet = getWallet(pk);
  const escrow = await getEscrowContract(escrowAddr, wallet);

  console.log("=== Client Agent Bot ===");
  console.log("Address:", wallet.address);

  const balance = await wallet.provider!.getBalance(wallet.address);
  console.log("Balance:", formatUSDC(balance), "USDC (native)\n");

  const task =
    process.argv[2] ||
    "Analyze BTC/USDC 4H chart: identify support/resistance levels and provide a directional bias with entry, stop-loss, and take-profit";

  const budget = parseUSDC(process.argv[3] || "1");
  const durationHours = Number(process.argv[4] || "24");

  if (!workerAddr || !evaluatorAddr) {
    throw new Error("WORKER_ADDRESS and EVALUATOR_ADDRESS required in .env");
  }

  const block = await wallet.provider!.getBlock("latest");
  const expiry = BigInt(block!.timestamp) + BigInt(durationHours * 3600);

  console.log("Creating job...");
  console.log("  Task:", task);
  console.log("  Budget:", formatUSDC(budget), "USDC");
  console.log("  Expires in:", durationHours, "hours");
  console.log("  Worker:", workerAddr);
  console.log("  Evaluator:", evaluatorAddr);

  const tx1 = await escrow.createJob(
    workerAddr,
    evaluatorAddr,
    budget,
    expiry,
    task
  );
  const receipt1 = await tx1.wait();
  console.log("\nJob created!", txLink(receipt1.hash));

  const jobId = await escrow.jobCount() - 1n;
  console.log("Job ID:", jobId.toString());

  if (usdcAddr) {
    const usdc = new ethers.Contract(
      usdcAddr,
      ["function approve(address,uint256) returns (bool)"],
      wallet
    );
    console.log("\nApproving USDC spend...");
    const txApprove = await usdc.approve(escrowAddr, budget);
    await txApprove.wait();
    console.log("Approved.");
  }

  console.log("Funding job...");
  const tx2 = await escrow.fund(jobId);
  const receipt2 = await tx2.wait();
  console.log("Job funded!", txLink(receipt2.hash));

  const job = await escrow.getJob(jobId);
  console.log("\nJob status:", STATUS_NAMES[Number(job[6])]);
  console.log("\n--- Client Bot Done ---");
  console.log("Waiting for worker to submit deliverable...");
}

main().catch((err) => {
  console.error("Client bot error:", err.message);
  process.exit(1);
});
