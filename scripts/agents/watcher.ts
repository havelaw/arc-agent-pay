/**
 * Shared event watcher for AgentEscrow contract.
 * Polls for events and dispatches callbacks.
 */
import { ethers } from "ethers";

export interface WatcherConfig {
  provider: ethers.JsonRpcProvider;
  contract: ethers.Contract;
  pollIntervalMs: number;
}

export type EventHandler = (log: ethers.Log, parsed: ethers.LogDescription) => Promise<void>;

export class ContractWatcher {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private pollInterval: number;
  private lastBlock: number = 0;
  private running = false;
  private handlers: Map<string, EventHandler> = new Map();

  constructor(config: WatcherConfig) {
    this.provider = config.provider;
    this.contract = config.contract;
    this.pollInterval = config.pollIntervalMs;
  }

  on(eventName: string, handler: EventHandler) {
    this.handlers.set(eventName, handler);
    return this;
  }

  async start() {
    this.lastBlock = await this.provider.getBlockNumber();
    this.running = true;
    console.log(`[Watcher] Starting from block ${this.lastBlock}`);

    while (this.running) {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        if (currentBlock > this.lastBlock) {
          await this.processBlocks(this.lastBlock + 1, currentBlock);
          this.lastBlock = currentBlock;
        }
      } catch (err: any) {
        console.error("[Watcher] Poll error:", err.message);
      }
      await sleep(this.pollInterval);
    }
  }

  stop() {
    this.running = false;
    console.log("[Watcher] Stopped");
  }

  private async processBlocks(from: number, to: number) {
    const iface = this.contract.interface;
    const logs = await this.provider.getLogs({
      address: await this.contract.getAddress(),
      fromBlock: from,
      toBlock: to,
    });

    for (const log of logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
        if (!parsed) continue;

        const handler = this.handlers.get(parsed.name);
        if (handler) {
          await handler(log, parsed);
        }
      } catch {
        // skip unparseable logs
      }
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
