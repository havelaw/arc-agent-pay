import "dotenv/config";
import { ethers } from "ethers";
import { getPipelineContract, getWallet, getProvider, txLink } from "./pipeline-common.js";
import { parseUSDC, formatUSDC } from "./common.js";

async function performWork(description: string, inputHash: string): Promise<string> {
  if (description.toLowerCase().includes("ohlcv")) {
    return JSON.stringify({
      pair: "BTC/USDC", timeframe: "4H", rsi: 58.3,
      macd: { line: 245.2, signal: 198.7, histogram: 46.5 },
      bollingerBands: { upper: 71200, middle: 69800, lower: 68400 },
    });
  }
  if (description.toLowerCase().includes("support")) {
    return JSON.stringify({
      support: [68400, 67200], resistance: [71200, 72500],
      pivotPoint: 69800, trend: "neutral-bullish", inputRef: inputHash.slice(0, 10),
    });
  }
  if (description.toLowerCase().includes("recommendation")) {
    return JSON.stringify({
      recommendation: "LONG", entry: 69800, stopLoss: 68200,
      takeProfit: [71200, 72500], riskReward: 2.1, inputRef: inputHash.slice(0, 10),
    });
  }
  return `Completed: ${description}`;
}

async function main() {
  const clientPk = process.env.CLIENT_PRIVATE_KEY!;
  const workerPk = process.env.WORKER_PRIVATE_KEY!;
  const evaluatorPk = process.env.EVALUATOR_PRIVATE_KEY!;
  const pipelineAddr = process.env.PIPELINE_ADDRESS!;

  if (!clientPk || !workerPk || !evaluatorPk || !pipelineAddr) {
    throw new Error("All private keys and PIPELINE_ADDRESS required in .env");
  }

  const clientWallet = getWallet(clientPk);
  const workerWallet = getWallet(workerPk);
  const evaluatorWallet = getWallet(evaluatorPk);

  const clientPipeline = await getPipelineContract(pipelineAddr, clientWallet);
  const workerPipeline = await getPipelineContract(pipelineAddr, workerWallet);
  const evaluatorPipeline = await getPipelineContract(pipelineAddr, evaluatorWallet);

  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Multi-Step Pipeline — Autonomous Run          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("Client:   ", clientWallet.address);
  console.log("Worker:   ", workerWallet.address);
  console.log("Evaluator:", evaluatorWallet.address);
  console.log("Contract: ", pipelineAddr);
  console.log("");

  const expiredAt = Math.floor(Date.now() / 1000) + 7200;
  const stepsConfig = [
    { desc: "Step 1: Collect BTC/USDC 4H OHLCV data and compute RSI, MACD, Bollinger Bands", reward: "0.5", gas: "0.05" },
    { desc: "Step 2: Identify support/resistance levels from indicators", reward: "0.5", gas: "0.05" },
    { desc: "Step 3: Generate trade recommendation (entry, SL, TP)", reward: "1.0", gas: "0.1" },
  ];

  const rewards = stepsConfig.map((s) => parseUSDC(s.reward));
  const gasComps = stepsConfig.map((s) => parseUSDC(s.gas));
  const totalBudget = rewards.reduce((a, b) => a + b, 0n) + gasComps.reduce((a, b) => a + b, 0n);

  console.log("━━━ PHASE 1: Create & Fund Pipeline ━━━\n");
  const tx1 = await clientPipeline.createPipeline(
    "BTC Analysis Pipeline",
    expiredAt,
    stepsConfig.map(() => workerWallet.address),
    stepsConfig.map(() => evaluatorWallet.address),
    stepsConfig.map((s) => s.desc),
    rewards,
    gasComps
  );
  const r1 = await tx1.wait();
  const createdEvent = r1.logs
    .map((l: any) => { try { return clientPipeline.interface.parseLog(l); } catch { return null; } })
    .find((e: any) => e?.name === "PipelineCreated");
  const pid = createdEvent!.args[0];

  console.log(`Pipeline #${pid} created: ${txLink(r1.hash)}`);
  console.log(`Total budget: ${formatUSDC(totalBudget)} USDC (${stepsConfig.length} steps)\n`);

  const tx2 = await clientPipeline.fund(pid, { value: totalBudget });
  const r2 = await tx2.wait();
  console.log(`Funded: ${txLink(r2.hash)}`);
  console.log("Status: Running — Step 0 activated\n");

  for (let i = 0; i < stepsConfig.length; i++) {
    console.log(`━━━ STEP ${i + 1}/${stepsConfig.length} ━━━\n`);

    const step = await workerPipeline.getStep(pid, i);
    console.log(`Task: ${step.description}`);
    console.log(`Reward: ${formatUSDC(step.reward)} + ${formatUSDC(step.gasCompensation)} gas`);

    const result = await performWork(step.description, step.inputHash);
    console.log(`Work: ${result.slice(0, 80)}...`);

    const deliverable = ethers.id(result);
    const txS = await workerPipeline.submit(pid, i, deliverable);
    const rS = await txS.wait();
    console.log(`Submitted: ${txLink(rS.hash)}`);

    console.log("Evaluating...");
    const txA = await evaluatorPipeline.approveStep(pid, i);
    const rA = await txA.wait();
    const payout = step.reward + step.gasCompensation;
    console.log(`Approved! Payout: ${formatUSDC(payout)} USDC → Worker`);
    console.log(`Tx: ${txLink(rA.hash)}\n`);
  }

  const finalState = await clientPipeline.getPipeline(pid);
  console.log("━━━ PIPELINE COMPLETE ━━━\n");
  console.log(`Pipeline #${pid} — Status: ${["Open","Funded","Running","Completed","Failed","Expired"][Number(finalState.status)]}`);
  console.log(`Steps completed: ${finalState.completedSteps}/${finalState.stepCount}`);
  console.log(`Total paid to worker: ${formatUSDC(totalBudget)} USDC`);
}

main().catch((err) => {
  console.error("Pipeline run error:", err.message || err);
  process.exit(1);
});
