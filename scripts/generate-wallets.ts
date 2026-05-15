import { ethers } from "ethers";

const roles = ["CLIENT", "WORKER", "EVALUATOR"];

console.log("=== Arc Agent Wallets ===\n");
console.log("Add these to your .env file:\n");

for (const role of roles) {
  const wallet = ethers.Wallet.createRandom();
  console.log(`# ${role}`);
  console.log(`${role}_PRIVATE_KEY=${wallet.privateKey}`);
  console.log(`# Address: ${wallet.address}`);
  console.log();
}

console.log("Fund each address with testnet USDC at: https://faucet.circle.com");
console.log("Select 'Arc Testnet' and paste each address (20 USDC per 2 hours)");
