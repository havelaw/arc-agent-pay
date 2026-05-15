import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  console.log("Deploying MockUSDC + AgentEscrow to local network...\n");

  const connection = await hre.network.connect();
  const provider = new ethers.BrowserProvider(connection.provider);

  const signers = await provider.listAccounts();
  const client = signers[0];
  const worker = signers[1];
  const evaluator = signers[2];

  const usdcArtifact = await hre.artifacts.readArtifact("MockUSDC");
  const escrowArtifact = await hre.artifacts.readArtifact("AgentEscrow");

  const USDCFactory = new ethers.ContractFactory(
    usdcArtifact.abi,
    usdcArtifact.bytecode,
    client
  );
  const usdc = await USDCFactory.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log("MockUSDC deployed at:", usdcAddr);

  const EscrowFactory = new ethers.ContractFactory(
    escrowArtifact.abi,
    escrowArtifact.bytecode,
    client
  );
  const escrow = await EscrowFactory.deploy(usdcAddr);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log("AgentEscrow deployed at:", escrowAddr);

  console.log("\nAccounts:");
  console.log("  Client:   ", client.address);
  console.log("  Worker:   ", worker.address);
  console.log("  Evaluator:", evaluator.address);

  const amount = 1000_000_000n; // 1000 USDC
  await usdc.mint(client.address, amount);
  await usdc.approve(escrowAddr, amount);
  console.log("\nMinted 1000 USDC to client, approved escrow");

  const block = await provider.getBlock("latest");
  const expiry = BigInt(block!.timestamp) + 7200n;
  const budget = 100_000_000n; // 100 USDC

  await escrow.createJob(
    worker.address,
    evaluator.address,
    budget,
    expiry,
    "Analyze BTC/USDC 4H chart and provide entry/exit signals"
  );
  console.log("\n--- Job #0 Created ---");
  console.log("  Budget: 100 USDC");
  console.log("  Task: Analyze BTC/USDC 4H chart");

  await escrow.fund(0n);
  console.log("  Status: Funded");

  const escrowAsWorker = escrow.connect(worker) as typeof escrow;
  const deliverable = ethers.id("BTC long entry 68500, SL 67800, TP 71000");
  await escrowAsWorker.submit(0n, deliverable);
  console.log("  Worker submitted analysis");

  const escrowAsEvaluator = escrow.connect(evaluator) as typeof escrow;
  const reason = ethers.id("Quality verified by AI evaluator");
  await escrowAsEvaluator.complete(0n, reason);
  console.log("  Evaluator approved -> 100 USDC paid to worker");

  const workerBal = await usdc.balanceOf(worker.address);
  console.log(`\nWorker USDC balance: ${Number(workerBal) / 1e6} USDC`);

  const job = await escrow.getJob(0n);
  const statusNames = [
    "Open",
    "Funded",
    "Submitted",
    "Completed",
    "Rejected",
    "Expired",
  ];
  console.log(`Job #0 final status: ${statusNames[Number(job[6])]}`);
  console.log("\n--- E2E Demo Complete ---");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
