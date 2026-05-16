import "dotenv/config";
import { ethers } from "ethers";
import { getPipelineContract, getWallet, txLink } from "./pipeline-common.js";
import { parseUSDC, formatUSDC } from "./common.js";

async function main() {
  const pk = process.env.CLIENT_PRIVATE_KEY;
  const pipelineAddr = process.env.PIPELINE_ADDRESS;
  if (!pk || !pipelineAddr) throw new Error("CLIENT_PRIVATE_KEY and PIPELINE_ADDRESS required");

  const workerAddr = process.env.WORKER_ADDRESS!;
  const evaluatorAddr = process.env.EVALUATOR_ADDRESS!;

  const client = getWallet(pk);
  const pipeline = await getPipelineContract(pipelineAddr, client);

  console.log("=== Pipeline Client Bot ===");
  console.log("Client:", client.address);
  console.log("Pipeline Contract:", pipelineAddr);

  const pipelineName = process.argv[2] || "BTC Research Pipeline";
  const durationHours = Number(process.argv[3]) || 2;
  const expiredAt = Math.floor(Date.now() / 1000) + durationHours * 3600;

  const stepsConfig = [
    {
      worker: workerAddr,
      evaluator: evaluatorAddr,
      description: "Step 1: Collect BTC/USDC 4H OHLCV data and compute RSI, MACD, Bollinger Bands",
      reward: parseUSDC("0.5"),
      gasCompensation: parseUSDC("0.05"),
    },
    {
      worker: workerAddr,
      evaluator: evaluatorAddr,
      description: "Step 2: Identify key support/resistance levels from Step 1 indicators",
      reward: parseUSDC("0.5"),
      gasCompensation: parseUSDC("0.05"),
    },
    {
      worker: workerAddr,
      evaluator: evaluatorAddr,
      description: "Step 3: Generate final trade recommendation (entry, stop-loss, take-profit) based on Step 2 analysis",
      reward: parseUSDC("1.0"),
      gasCompensation: parseUSDC("0.1"),
    },
  ];

  const totalBudget = stepsConfig.reduce(
    (acc, s) => acc + s.reward + s.gasCompensation,
    0n
  );

  console.log(`\nPipeline: "${pipelineName}"`);
  console.log(`Steps: ${stepsConfig.length}`);
  console.log(`Total Budget: ${formatUSDC(totalBudget)} USDC`);
  console.log(`Expires: ${new Date(expiredAt * 1000).toISOString()}\n`);

  console.log("Creating pipeline...");
  const tx1 = await pipeline.createPipeline(
    pipelineName,
    expiredAt,
    stepsConfig.map((s) => s.worker),
    stepsConfig.map((s) => s.evaluator),
    stepsConfig.map((s) => s.description),
    stepsConfig.map((s) => s.reward),
    stepsConfig.map((s) => s.gasCompensation)
  );
  const receipt1 = await tx1.wait();
  console.log("Created:", txLink(receipt1.hash));

  const createdEvent = receipt1.logs
    .map((l: any) => {
      try { return pipeline.interface.parseLog(l); } catch { return null; }
    })
    .find((e: any) => e?.name === "PipelineCreated");

  const pid = createdEvent!.args[0];
  console.log(`Pipeline ID: ${pid}`);

  console.log("\nFunding pipeline...");
  const tx2 = await pipeline.fund(pid, { value: totalBudget });
  const receipt2 = await tx2.wait();
  console.log("Funded:", txLink(receipt2.hash));
  console.log("\nPipeline is now RUNNING. Step 0 activated.");
}

main().catch((err) => {
  console.error("Pipeline client error:", err.message || err);
  process.exit(1);
});
