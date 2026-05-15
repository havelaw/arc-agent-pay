/**
 * Full E2E Demo: deploys contracts on local network, then runs all 3 agent bots.
 * Shows the complete flow: Client creates → Worker submits → Evaluator approves.
 */
import hre from "hardhat";
import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";

const STATUS_NAMES = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"];

async function evaluateWithClaude(task: string, deliverable: string): Promise<{ approved: boolean; score: number; reasoning: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("  [No ANTHROPIC_API_KEY — using simulated evaluation]");
    return { approved: true, score: 85, reasoning: "Simulated: deliverable submitted, task addressed." };
  }

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Evaluate this agent task submission. Task: "${task}". Deliverable content: "${deliverable}". Respond JSON only: {"approved": true/false, "score": 0-100, "reasoning": "brief"}`,
    }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : { approved: true, score: 70, reasoning: "Parse fallback" };
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Arc Agent Pay — Full E2E Demo              ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // --- Setup ---
  const connection = await hre.network.connect();
  const provider = new ethers.BrowserProvider(connection.provider);
  const signers = await provider.listAccounts();
  const [clientSigner, workerSigner, evaluatorSigner] = signers;

  const usdcArtifact = await hre.artifacts.readArtifact("MockUSDC");
  const escrowArtifact = await hre.artifacts.readArtifact("AgentEscrow");

  const usdc = await new ethers.ContractFactory(usdcArtifact.abi, usdcArtifact.bytecode, clientSigner).deploy();
  await usdc.waitForDeployment();

  const escrow = await new ethers.ContractFactory(escrowArtifact.abi, escrowArtifact.bytecode, clientSigner).deploy(await usdc.getAddress());
  await escrow.waitForDeployment();

  console.log("[Deploy] MockUSDC:", await usdc.getAddress());
  console.log("[Deploy] AgentEscrow:", await escrow.getAddress());
  console.log();

  await usdc.mint(clientSigner.address, ethers.parseUnits("1000", 6));
  await usdc.approve(await escrow.getAddress(), ethers.MaxUint256);

  // === PHASE 1: CLIENT BOT ===
  console.log("━━━ Phase 1: Client Agent ━━━");
  console.log("Address:", clientSigner.address);

  const task = "Analyze BTC/USDC 4H chart: identify support/resistance, directional bias, entry/SL/TP";
  const budget = ethers.parseUnits("100", 6);
  const block = await provider.getBlock("latest");
  const expiry = BigInt(block!.timestamp) + 7200n;

  await escrow.createJob(workerSigner.address, evaluatorSigner.address, budget, expiry, task);
  console.log("Job #0 created — Budget: 100 USDC");

  await escrow.fund(0n);
  console.log("Job #0 funded");

  let job = await escrow.getJob(0n);
  console.log("Status:", STATUS_NAMES[Number(job[6])], "\n");

  // === PHASE 2: WORKER BOT ===
  console.log("━━━ Phase 2: Worker Agent ━━━");
  console.log("Address:", workerSigner.address);

  const analysis = "BTC/USDC 4H: Price at 68,500 consolidating above 200 EMA (67,200). Resistance at 70,100. Bias: LONG. Entry: 68,600 on pullback. SL: 67,000 (-2.3%). TP: 71,500 (+4.2%). R:R 1:1.8. Volume declining → breakout imminent. Confidence: 78%.";
  console.log("  Analysis:", analysis.substring(0, 80) + "...");

  const deliverableHash = ethers.id(analysis);
  const escrowAsWorker = escrow.connect(workerSigner) as typeof escrow;
  await escrowAsWorker.submit(0n, deliverableHash);
  console.log("Deliverable submitted");

  job = await escrow.getJob(0n);
  console.log("Status:", STATUS_NAMES[Number(job[6])], "\n");

  // === PHASE 3: EVALUATOR BOT (AI) ===
  console.log("━━━ Phase 3: Evaluator Agent (AI) ━━━");
  console.log("Address:", evaluatorSigner.address);

  const evalResult = await evaluateWithClaude(task, analysis);
  console.log("  Score:", evalResult.score + "/100");
  console.log("  Reasoning:", evalResult.reasoning);
  console.log("  Verdict:", evalResult.approved ? "APPROVED ✓" : "REJECTED ✗");

  const escrowAsEvaluator = escrow.connect(evaluatorSigner) as typeof escrow;
  const reasonHash = ethers.id(evalResult.reasoning);

  if (evalResult.approved) {
    await escrowAsEvaluator.complete(0n, reasonHash);
    console.log("100 USDC released to worker");
  } else {
    await escrowAsEvaluator.reject(0n, reasonHash);
    console.log("100 USDC refunded to client");
  }

  // === RESULTS ===
  console.log("\n━━━ Final Results ━━━");
  job = await escrow.getJob(0n);
  console.log("Job #0 status:", STATUS_NAMES[Number(job[6])]);

  const clientBal = await usdc.balanceOf(clientSigner.address);
  const workerBal = await usdc.balanceOf(workerSigner.address);
  console.log("Client balance:", ethers.formatUnits(clientBal, 6), "USDC");
  console.log("Worker balance:", ethers.formatUnits(workerBal, 6), "USDC");

  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   Demo Complete                              ║");
  console.log("╚══════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
