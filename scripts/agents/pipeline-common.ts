import { ethers } from "ethers";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getProvider, getWallet, EXPLORER } from "./common.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function getPipelineABI(): Promise<ethers.InterfaceAbi> {
  const artifactPath = join(
    __dirname,
    "../../artifacts/contracts/AgentPipelineNative.sol/AgentPipelineNative.json"
  );
  const raw = await readFile(artifactPath, "utf-8");
  return JSON.parse(raw).abi;
}

export async function getPipelineContract(address: string, signer: ethers.Wallet) {
  const abi = await getPipelineABI();
  return new ethers.Contract(address, abi, signer);
}

export const PIPELINE_STATUS = [
  "Open",
  "Funded",
  "Running",
  "Completed",
  "Failed",
  "Expired",
] as const;

export const STEP_STATUS = [
  "Pending",
  "Active",
  "Submitted",
  "Completed",
  "Rejected",
] as const;

export function txLink(hash: string) {
  return `${EXPLORER}/tx/${hash}`;
}

export { getProvider, getWallet };
