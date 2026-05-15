/**
 * Evaluator Agent Bot
 * Uses Claude API to evaluate worker submissions, then approves or rejects on-chain.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { ethers } from "ethers";
import {
  getWallet,
  getEscrowContract,
  txLink,
  formatUSDC,
  STATUS_NAMES,
} from "./common.js";

interface EvalResult {
  approved: boolean;
  score: number;
  reasoning: string;
}

async function evaluateWithClaude(
  taskDescription: string,
  deliverableHash: string
): Promise<EvalResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log(
      "  [Evaluator] No ANTHROPIC_API_KEY set, using simulated evaluation"
    );
    return {
      approved: true,
      score: 85,
      reasoning:
        "Simulated evaluation: deliverable hash present, task appears addressed. Auto-approved for demo.",
    };
  }

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `You are an AI evaluator for an on-chain agent escrow system. A client posted a task and a worker submitted a deliverable. Evaluate whether the submission meets the task requirements.

Task description: "${taskDescription}"

Deliverable hash (keccak256 of the result): ${deliverableHash}

Note: You only have the hash, not the full deliverable. In a production system you would fetch the full content from IPFS or another storage layer. For now, evaluate based on whether a deliverable was submitted at all and the task description is reasonable.

Respond in JSON format only:
{
  "approved": true/false,
  "score": 0-100,
  "reasoning": "brief explanation"
}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      approved: false,
      score: 0,
      reasoning: "Failed to parse evaluation response",
    };
  }

  return JSON.parse(jsonMatch[0]);
}

async function main() {
  const pk = process.env.EVALUATOR_PRIVATE_KEY;
  const escrowAddr = process.env.ESCROW_ADDRESS;

  if (!pk || !escrowAddr) {
    throw new Error(
      "EVALUATOR_PRIVATE_KEY and ESCROW_ADDRESS required in .env"
    );
  }

  const wallet = getWallet(pk);
  const escrow = await getEscrowContract(escrowAddr, wallet);

  console.log("=== Evaluator Agent Bot (AI-powered) ===");
  console.log("Address:", wallet.address);

  const balance = await wallet.provider!.getBalance(wallet.address);
  console.log("Balance:", formatUSDC(balance), "USDC (native)\n");

  const jobId = BigInt(process.argv[2] || "0");
  console.log("Reviewing job #" + jobId + "...");

  const job = await escrow.getJob(jobId);
  const [
    client,
    provider,
    evaluator,
    description,
    budget,
    expiredAt,
    status,
    deliverable,
  ] = job;

  console.log("  Client:", client);
  console.log("  Worker:", provider);
  console.log("  Budget:", formatUSDC(budget), "USDC");
  console.log("  Status:", STATUS_NAMES[Number(status)]);
  console.log("  Task:", description);
  console.log("  Deliverable:", deliverable);

  if (evaluator.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error("This job has a different evaluator: " + evaluator);
  }

  if (Number(status) !== 2) {
    throw new Error(
      "Job is not in Submitted status, current: " +
        STATUS_NAMES[Number(status)]
    );
  }

  console.log("\nRunning AI evaluation with Claude...");
  const evalResult = await evaluateWithClaude(description, deliverable);

  console.log("\n  Score:", evalResult.score + "/100");
  console.log("  Reasoning:", evalResult.reasoning);
  console.log("  Verdict:", evalResult.approved ? "APPROVED" : "REJECTED");

  const reasonHash = ethers.id(evalResult.reasoning);

  if (evalResult.approved) {
    console.log("\nApproving job and releasing", formatUSDC(budget), "USDC to worker...");
    const tx = await escrow.complete(jobId, reasonHash);
    const receipt = await tx.wait();
    console.log("Job completed!", txLink(receipt.hash));
  } else {
    console.log("\nRejecting job and refunding", formatUSDC(budget), "USDC to client...");
    const tx = await escrow.reject(jobId, reasonHash);
    const receipt = await tx.wait();
    console.log("Job rejected!", txLink(receipt.hash));
  }

  const updatedJob = await escrow.getJob(jobId);
  console.log("\nFinal job status:", STATUS_NAMES[Number(updatedJob[6])]);
  console.log("\n--- Evaluator Bot Done ---");
}

main().catch((err) => {
  console.error("Evaluator bot error:", err.message);
  process.exit(1);
});
