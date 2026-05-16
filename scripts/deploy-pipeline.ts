import "dotenv/config";
import { ethers } from "ethers";
import { readFile } from "fs/promises";

async function main() {
  const rpc = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
  const chainId = Number(process.env.ARC_CHAIN_ID) || 5042002;
  const pk = process.env.PRIVATE_KEY;

  if (!pk) throw new Error("PRIVATE_KEY required in .env");

  const provider = new ethers.JsonRpcProvider(rpc, chainId);
  const wallet = new ethers.Wallet(pk, provider);

  console.log("=== Deploying AgentPipelineNative to Arc Testnet ===");
  console.log("RPC:", rpc);
  console.log("Chain ID:", chainId);
  console.log("Deployer:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "USDC\n");

  const raw = await readFile(
    "artifacts/contracts/AgentPipelineNative.sol/AgentPipelineNative.json",
    "utf-8"
  );
  const artifact = JSON.parse(raw);

  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );

  console.log("Deploying AgentPipelineNative...");
  const pipeline = await factory.deploy();
  console.log("Tx hash:", pipeline.deploymentTransaction()?.hash);

  await pipeline.waitForDeployment();
  const address = await pipeline.getAddress();

  console.log("\nAgentPipelineNative deployed at:", address);
  console.log("Explorer:", `https://testnet.arcscan.app/address/${address}`);
  console.log("\nAdd to .env:");
  console.log(`PIPELINE_ADDRESS=${address}`);
}

main().catch((err) => {
  console.error("Deploy error:", err.message || err);
  process.exit(1);
});
