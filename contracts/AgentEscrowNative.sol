// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * AgentEscrow for Arc testnet where USDC is the native gas token.
 * Funds are sent via msg.value instead of ERC-20 transferFrom.
 */
contract AgentEscrowNative is ReentrancyGuard {
    enum JobStatus {
        Open,
        Funded,
        Submitted,
        Completed,
        Rejected,
        Expired
    }

    struct Job {
        address client;
        address provider;
        address evaluator;
        string description;
        uint256 budget;
        uint256 expiredAt;
        JobStatus status;
        bytes32 deliverable;
        bytes32 reason;
    }

    uint256 public jobCount;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address provider,
        address evaluator,
        uint256 budget,
        uint256 expiredAt,
        string description
    );
    event JobFunded(uint256 indexed jobId, uint256 amount);
    event ProviderSet(uint256 indexed jobId, address indexed provider);
    event BudgetSet(uint256 indexed jobId, uint256 amount);
    event JobSubmitted(uint256 indexed jobId, bytes32 deliverable);
    event JobCompleted(uint256 indexed jobId, bytes32 reason, uint256 payout);
    event JobRejected(uint256 indexed jobId, bytes32 reason);
    event Refunded(uint256 indexed jobId, uint256 amount);

    error NotClient();
    error NotProvider();
    error NotEvaluator();
    error InvalidStatus(JobStatus current, JobStatus expected);
    error JobExpired();
    error JobNotExpired();
    error ZeroAddress();
    error ZeroBudget();
    error WrongAmount();
    error TransferFailed();

    modifier onlyClient(uint256 jobId) {
        if (msg.sender != jobs[jobId].client) revert NotClient();
        _;
    }

    modifier onlyProvider(uint256 jobId) {
        if (msg.sender != jobs[jobId].provider) revert NotProvider();
        _;
    }

    modifier onlyEvaluator(uint256 jobId) {
        if (msg.sender != jobs[jobId].evaluator) revert NotEvaluator();
        _;
    }

    modifier inStatus(uint256 jobId, JobStatus expected) {
        if (jobs[jobId].status != expected)
            revert InvalidStatus(jobs[jobId].status, expected);
        _;
    }

    modifier notExpired(uint256 jobId) {
        if (block.timestamp >= jobs[jobId].expiredAt) revert JobExpired();
        _;
    }

    function createJob(
        address provider,
        address evaluator,
        uint256 budget,
        uint256 expiredAt,
        string calldata description
    ) external returns (uint256 jobId) {
        if (provider == address(0) || evaluator == address(0))
            revert ZeroAddress();
        if (budget == 0) revert ZeroBudget();

        jobId = jobCount++;
        Job storage job = jobs[jobId];
        job.client = msg.sender;
        job.provider = provider;
        job.evaluator = evaluator;
        job.description = description;
        job.budget = budget;
        job.expiredAt = expiredAt;
        job.status = JobStatus.Open;

        emit JobCreated(
            jobId, msg.sender, provider, evaluator, budget, expiredAt, description
        );
    }

    function fund(uint256 jobId)
        external
        payable
        onlyClient(jobId)
        inStatus(jobId, JobStatus.Open)
        notExpired(jobId)
        nonReentrant
    {
        if (msg.value != jobs[jobId].budget) revert WrongAmount();
        jobs[jobId].status = JobStatus.Funded;
        emit JobFunded(jobId, msg.value);
    }

    function setProvider(uint256 jobId, address provider)
        external
        onlyClient(jobId)
        inStatus(jobId, JobStatus.Open)
    {
        if (provider == address(0)) revert ZeroAddress();
        jobs[jobId].provider = provider;
        emit ProviderSet(jobId, provider);
    }

    function setBudget(uint256 jobId, uint256 amount)
        external
        onlyClient(jobId)
        inStatus(jobId, JobStatus.Open)
    {
        if (amount == 0) revert ZeroBudget();
        jobs[jobId].budget = amount;
        emit BudgetSet(jobId, amount);
    }

    function submit(uint256 jobId, bytes32 deliverable)
        external
        onlyProvider(jobId)
        inStatus(jobId, JobStatus.Funded)
        notExpired(jobId)
    {
        jobs[jobId].deliverable = deliverable;
        jobs[jobId].status = JobStatus.Submitted;
        emit JobSubmitted(jobId, deliverable);
    }

    function complete(uint256 jobId, bytes32 _reason)
        external
        onlyEvaluator(jobId)
        inStatus(jobId, JobStatus.Submitted)
        nonReentrant
    {
        Job storage job = jobs[jobId];
        job.status = JobStatus.Completed;
        job.reason = _reason;
        (bool ok, ) = job.provider.call{value: job.budget}("");
        if (!ok) revert TransferFailed();
        emit JobCompleted(jobId, _reason, job.budget);
    }

    function reject(uint256 jobId, bytes32 _reason)
        external
        onlyEvaluator(jobId)
        inStatus(jobId, JobStatus.Submitted)
        nonReentrant
    {
        Job storage job = jobs[jobId];
        job.status = JobStatus.Rejected;
        job.reason = _reason;
        (bool ok, ) = job.client.call{value: job.budget}("");
        if (!ok) revert TransferFailed();
        emit JobRejected(jobId, _reason);
    }

    function claimRefund(uint256 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        if (block.timestamp < job.expiredAt) revert JobNotExpired();
        JobStatus s = job.status;
        if (s != JobStatus.Funded && s != JobStatus.Submitted)
            revert InvalidStatus(s, JobStatus.Funded);

        job.status = JobStatus.Expired;
        (bool ok, ) = job.client.call{value: job.budget}("");
        if (!ok) revert TransferFailed();
        emit Refunded(jobId, job.budget);
    }

    function getJob(uint256 jobId)
        external
        view
        returns (
            address client,
            address provider,
            address evaluator,
            string memory description,
            uint256 budget,
            uint256 expiredAt,
            JobStatus status,
            bytes32 deliverable,
            bytes32 reason
        )
    {
        Job storage job = jobs[jobId];
        return (
            job.client, job.provider, job.evaluator, job.description,
            job.budget, job.expiredAt, job.status, job.deliverable, job.reason
        );
    }
}
