import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("AgentEscrow", function () {
  let escrow: any;
  let usdc: any;
  let client: any, worker: any, evaluator: any, stranger: any;
  const BUDGET = 100_000_000n; // 100 USDC (6 decimals)

  beforeEach(async function () {
    const signers = await hre.network.provider.request({
      method: "eth_accounts",
    }) as string[];

    const viem = await hre.viem.getPublicClient();
    const [clientWallet, workerWallet, evaluatorWallet, strangerWallet] =
      await Promise.all([
        hre.viem.getWalletClient(signers[0] as `0x${string}`),
        hre.viem.getWalletClient(signers[1] as `0x${string}`),
        hre.viem.getWalletClient(signers[2] as `0x${string}`),
        hre.viem.getWalletClient(signers[3] as `0x${string}`),
      ]);

    client = clientWallet;
    worker = workerWallet;
    evaluator = evaluatorWallet;
    stranger = strangerWallet;

    const mockUSDC = await hre.viem.deployContract("MockUSDC");
    usdc = mockUSDC;

    const agentEscrow = await hre.viem.deployContract("AgentEscrow", [
      usdc.address,
    ]);
    escrow = agentEscrow;

    await usdc.write.mint([client.account.address, BUDGET * 100n]);
    await usdc.write.approve([escrow.address, BUDGET * 100n], {
      account: client.account,
    });
  });

  it("creates a job with correct parameters", async function () {
    const block = await hre.viem.getPublicClient().then((c) => c.getBlock());
    const expiry = block.timestamp + 3600n;

    await escrow.write.createJob(
      [worker.account.address, evaluator.account.address, BUDGET, expiry, "Analyze BTC price data"],
      { account: client.account }
    );

    const job = await escrow.read.getJob([0n]);
    assert.equal(job[0].toLowerCase(), client.account.address.toLowerCase());
    assert.equal(job[4], BUDGET);
    assert.equal(job[6], 0); // Open
  });

  it("funds a job and transfers USDC", async function () {
    const block = await hre.viem.getPublicClient().then((c) => c.getBlock());
    const expiry = block.timestamp + 3600n;

    await escrow.write.createJob(
      [worker.account.address, evaluator.account.address, BUDGET, expiry, "test"],
      { account: client.account }
    );
    await escrow.write.fund([0n], { account: client.account });

    const job = await escrow.read.getJob([0n]);
    assert.equal(job[6], 1); // Funded
  });

  it("worker submits deliverable", async function () {
    const pub = await hre.viem.getPublicClient();
    const block = await pub.getBlock();
    const expiry = block.timestamp + 3600n;

    await escrow.write.createJob(
      [worker.account.address, evaluator.account.address, BUDGET, expiry, "test"],
      { account: client.account }
    );
    await escrow.write.fund([0n], { account: client.account });

    const hash = "0x" + "ab".repeat(32) as `0x${string}`;
    await escrow.write.submit([0n, hash], { account: worker.account });

    const job = await escrow.read.getJob([0n]);
    assert.equal(job[6], 2); // Submitted
  });

  it("evaluator completes and pays worker", async function () {
    const pub = await hre.viem.getPublicClient();
    const block = await pub.getBlock();
    const expiry = block.timestamp + 3600n;

    await escrow.write.createJob(
      [worker.account.address, evaluator.account.address, BUDGET, expiry, "test"],
      { account: client.account }
    );
    await escrow.write.fund([0n], { account: client.account });

    const deliverable = "0x" + "ab".repeat(32) as `0x${string}`;
    await escrow.write.submit([0n, deliverable], { account: worker.account });

    const balBefore = await usdc.read.balanceOf([worker.account.address]);
    const reason = "0x" + "cd".repeat(32) as `0x${string}`;
    await escrow.write.complete([0n, reason], { account: evaluator.account });
    const balAfter = await usdc.read.balanceOf([worker.account.address]);

    assert.equal(balAfter - balBefore, BUDGET);
    const job = await escrow.read.getJob([0n]);
    assert.equal(job[6], 3); // Completed
  });

  it("evaluator rejects and refunds client", async function () {
    const pub = await hre.viem.getPublicClient();
    const block = await pub.getBlock();
    const expiry = block.timestamp + 3600n;

    await escrow.write.createJob(
      [worker.account.address, evaluator.account.address, BUDGET, expiry, "test"],
      { account: client.account }
    );
    await escrow.write.fund([0n], { account: client.account });

    const deliverable = "0x" + "ab".repeat(32) as `0x${string}`;
    await escrow.write.submit([0n, deliverable], { account: worker.account });

    const balBefore = await usdc.read.balanceOf([client.account.address]);
    const reason = "0x" + "ee".repeat(32) as `0x${string}`;
    await escrow.write.reject([0n, reason], { account: evaluator.account });
    const balAfter = await usdc.read.balanceOf([client.account.address]);

    assert.equal(balAfter - balBefore, BUDGET);
    const job = await escrow.read.getJob([0n]);
    assert.equal(job[6], 4); // Rejected
  });
});
