import hre from "hardhat";
import { ethers } from "ethers";

async function main() {
  const usdcAddress = process.env.USDC_ADDRESS;
  if (!usdcAddress) {
    throw new Error("USDC_ADDRESS env var required");
  }

  console.log("Deploying AgentEscrow to", hre.globalOptions.network || "default network");

  const connection = await hre.network.connect();
  const provider = new ethers.BrowserProvider(connection.provider);
  const signer = (await provider.listAccounts())[0];

  const artifact = await hre.artifacts.readArtifact("AgentEscrow");
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    signer
  );

  const escrow = await factory.deploy(usdcAddress);
  await escrow.waitForDeployment();

  console.log("AgentEscrow deployed at:", await escrow.getAddress());
  console.log("USDC address:", usdcAddress);
  console.log("Deployer:", signer.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
