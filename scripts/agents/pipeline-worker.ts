import "dotenv/config";
import { ethers } from "ethers";
import { getPipelineContract, getWallet, getProvider, txLink, STEP_STATUS } from "./pipeline-common.js";
import { formatUSDC } from "./common.js";

async function performWork(stepDescription: string, inputHash: string): Promise<string> {
  if (stepDescription.toLowerCase().includes("collect") && stepDescription.toLowerCase().includes("ohlcv")) {
    return JSON.stringify({
      pair: "BTC/USDC",
      timeframe: "4H",
      rsi: 58.3,
      macd: { line: 245.2, signal: 198.7, histogram: 46.5 },
      bollingerBands: { upper: 71200, middle: 69800, lower: 68400 },
      lastClose: 69950,
      timestamp: Date.now(),
    });
  }
  if (stepDescription.toLowerCase().includes("support") && stepDescription.toLowerCase().includes("resistance")) {
    return JSON.stringify({
      support: [68400, 67200, 65800],
      resistance: [71200, 72500, 74000],
      pivotPoint: 69800,
      trend: "neutral-bullish",
      inputRef: inputHash.slice(0, 10),
    });
  }
  if (stepDescription.toLowerCase().includes("trade recommendation")) {
    return JSON.stringify({
      recommendation: "LONG",
      entry: 69800,
      stopLoss: 68200,
      takeProfit: [71200, 72500],
      riskReward: 2.1,
      confidence: 0.72,
      reasoning: "Price above middle BB, MACD bullish crossover, RSI neutral with room to run",
      inputRef: inputHash.slice(0, 10),
    });
  }
  return `Work completed for: ${stepDescription}`;
}

async function main() {
  const pk = process.env.WORKER_PRIVATE_KEY;
  const pipelineAddr = process.env.PIPELINE_ADDRESS;
  if (!pk || !pipelineAddr) throw new Error("WORKER_PRIVATE_KEY and PIPELINE_ADDRESS required");

  const worker = getWallet(pk);
  const pipeline = await getPipelineContract(pipelineAddr, worker);

  console.log("=== Pipeline Worker Bot (Watcher) ===");
  console.log("Worker:", worker.address);
  console.log("Watching for StepActivated events...\n");

  const provider = getProvider();
  let lastBlock = await provider.getBlockNumber();
  const processedSteps = new Set<string>();

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      const logs = await pipeline.queryFilter(
        pipeline.filters.StepActivated(),
        lastBlock + 1,
        currentBlock
      );

      for (const log of logs) {
        const event = pipeline.interface.parseLog(log as any);
        if (!event) continue;

        const [pid, stepIdx, inputHash] = event.args;
        const key = `${pid}-${stepIdx}`;
        if (processedSteps.has(key)) continue;

        const step = await pipeline.getStep(pid, stepIdx);
        if (step.worker.toLowerCase() !== worker.address.toLowerCase()) continue;

        processedSteps.add(key);
        console.log(`[Step Activated] Pipeline #${pid}, Step #${stepIdx}`);
        console.log(`  Description: ${step.description}`);
        console.log(`  Reward: ${formatUSDC(step.reward)} + ${formatUSDC(step.gasCompensation)} gas`);
        console.log(`  Input hash: ${inputHash}`);

        const result = await performWork(step.description, inputHash);
        console.log(`  Work result: ${result.slice(0, 100)}...`);

        const deliverable = ethers.id(result);
        const tx = await pipeline.submit(pid, stepIdx, deliverable);
        const receipt = await tx.wait();
        console.log(`  Submitted: ${txLink(receipt.hash)}\n`);
      }

      lastBlock = currentBlock;
    } catch (err: any) {
      if (!err.message?.includes("no result")) {
        console.error("Worker poll error:", err.message);
      }
    }
  }, 5000);
}

main().catch((err) => {
  console.error("Pipeline worker error:", err.message || err);
  process.exit(1);
});
