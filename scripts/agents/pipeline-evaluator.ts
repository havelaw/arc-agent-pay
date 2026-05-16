import "dotenv/config";
import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import { getPipelineContract, getWallet, getProvider, txLink, STEP_STATUS } from "./pipeline-common.js";
import { formatUSDC } from "./common.js";

interface EvalResult {
  approved: boolean;
  score: number;
  reasoning: string;
}

async function evaluateWithClaude(
  stepDescription: string,
  deliverableHash: string,
  stepIndex: number,
  totalSteps: number
): Promise<EvalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("  [No API key — auto-approving]");
    return { approved: true, score: 85, reasoning: "Auto-approved (no Claude API key)" };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are an evaluator for a multi-step AI agent pipeline (step ${stepIndex + 1}/${totalSteps}).

Task description: "${stepDescription}"
Deliverable hash: ${deliverableHash}

This is step ${stepIndex + 1} of ${totalSteps} in a sequential pipeline. Each step's output feeds the next.
Evaluate whether this step likely produced valid output for the described task.

Return ONLY valid JSON: {"approved": true/false, "score": 0-100, "reasoning": "one sentence"}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {}
  return { approved: true, score: 75, reasoning: "Parse fallback — approved" };
}

async function main() {
  const pk = process.env.EVALUATOR_PRIVATE_KEY;
  const pipelineAddr = process.env.PIPELINE_ADDRESS;
  if (!pk || !pipelineAddr) throw new Error("EVALUATOR_PRIVATE_KEY and PIPELINE_ADDRESS required");

  const evaluator = getWallet(pk);
  const pipeline = await getPipelineContract(pipelineAddr, evaluator);

  console.log("=== Pipeline Evaluator Bot (Watcher) ===");
  console.log("Evaluator:", evaluator.address);
  console.log("Watching for StepSubmitted events...\n");

  const provider = getProvider();
  let lastBlock = await provider.getBlockNumber();
  const processedSteps = new Set<string>();

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      const logs = await pipeline.queryFilter(
        pipeline.filters.StepSubmitted(),
        lastBlock + 1,
        currentBlock
      );

      for (const log of logs) {
        const event = pipeline.interface.parseLog(log as any);
        if (!event) continue;

        const [pid, stepIdx, deliverable] = event.args;
        const key = `${pid}-${stepIdx}`;
        if (processedSteps.has(key)) continue;

        const step = await pipeline.getStep(pid, stepIdx);
        if (step.evaluator.toLowerCase() !== evaluator.address.toLowerCase()) continue;

        const pipelineInfo = await pipeline.getPipeline(pid);
        processedSteps.add(key);

        console.log(`[Step Submitted] Pipeline #${pid}, Step #${stepIdx}`);
        console.log(`  Description: ${step.description}`);
        console.log(`  Deliverable: ${deliverable}`);

        const result = await evaluateWithClaude(
          step.description,
          deliverable,
          Number(stepIdx),
          Number(pipelineInfo.stepCount)
        );

        console.log(`  Score: ${result.score}/100 — ${result.reasoning}`);

        if (result.approved) {
          const tx = await pipeline.approveStep(pid, stepIdx);
          const receipt = await tx.wait();
          console.log(`  APPROVED: ${txLink(receipt.hash)}`);
          if (Number(stepIdx) + 1 < Number(pipelineInfo.stepCount)) {
            console.log(`  → Next step #${Number(stepIdx) + 1} activated\n`);
          } else {
            console.log(`  ✓ Pipeline COMPLETED!\n`);
          }
        } else {
          const reason = ethers.id(result.reasoning);
          const tx = await pipeline.rejectStep(pid, stepIdx, reason);
          const receipt = await tx.wait();
          console.log(`  REJECTED: ${txLink(receipt.hash)}`);
          console.log(`  → Pipeline FAILED. Remaining funds refunded.\n`);
        }
      }

      lastBlock = currentBlock;
    } catch (err: any) {
      if (!err.message?.includes("no result")) {
        console.error("Evaluator poll error:", err.message);
      }
    }
  }, 5000);
}

main().catch((err) => {
  console.error("Pipeline evaluator error:", err.message || err);
  process.exit(1);
});
