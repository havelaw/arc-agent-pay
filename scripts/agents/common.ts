import { ethers } from "ethers";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ARC_RPC = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
export const CHAIN_ID = Number(process.env.ARC_CHAIN_ID) || 5042002;
export const EXPLORER = process.env.ARC_EXPLORER || "https://testnet.arcscan.app";

export function getProvider() {
  return new ethers.JsonRpcProvider(ARC_RPC, CHAIN_ID);
}

export function getWallet(privateKey: string) {
  return new ethers.Wallet(privateKey, getProvider());
}

export async function getEscrowABI(): Promise<ethers.InterfaceAbi> {
  const artifactPath = join(__dirname, "../../artifacts/contracts/AgentEscrow.sol/AgentEscrow.json");
  const raw = await readFile(artifactPath, "utf-8");
  return JSON.parse(raw).abi;
}

export function getEscrowContract(address: string, signer: ethers.Wallet) {
  return getEscrowABI().then(
    (abi) => new ethers.Contract(address, abi, signer)
  );
}

export function txLink(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}

export const STATUS_NAMES = [
  "Open",
  "Funded",
  "Submitted",
  "Completed",
  "Rejected",
  "Expired",
] as const;

export function formatUSDC(amount: bigint, decimals = 18): string {
  return ethers.formatUnits(amount, decimals);
}

export function parseUSDC(amount: string, decimals = 18): bigint {
  return ethers.parseUnits(amount, decimals);
}
