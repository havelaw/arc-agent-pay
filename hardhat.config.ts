import "dotenv/config";
import { defineConfig } from "hardhat/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);

export default defineConfig({
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    arcTestnet: {
      type: "http",
      url: process.env.ARC_RPC_URL || "https://rpc-testnet.arc.io",
      accounts: [PRIVATE_KEY],
      chainId: Number(process.env.ARC_CHAIN_ID) || 16180,
    },
    hardhat: {
      type: "edr-simulated",
      chainId: 31337,
    },
  },
});
