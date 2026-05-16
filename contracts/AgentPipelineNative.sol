// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * Multi-step Job Pipeline with gas compensation for Arc testnet.
 * Chains sequential tasks — each step's output feeds the next.
 * Workers receive budget + gas compensation per step (USDC native).
 */
contract AgentPipelineNative is ReentrancyGuard {
    enum StepStatus { Pending, Active, Submitted, Completed, Rejected }
    enum PipelineStatus { Open, Funded, Running, Completed, Failed, Expired }

    struct Step {
        address worker;
        address evaluator;
        string description;
        uint256 reward;
        uint256 gasCompensation;
        StepStatus status;
        bytes32 deliverable;
        bytes32 inputHash;
    }

    struct Pipeline {
        address client;
        string name;
        uint256 totalBudget;
        uint256 expiredAt;
        PipelineStatus status;
        uint256 currentStep;
        uint256 stepCount;
        uint256 completedSteps;
    }

    uint256 public pipelineCount;
    mapping(uint256 => Pipeline) public pipelines;
    mapping(uint256 => mapping(uint256 => Step)) public steps;

    event PipelineCreated(uint256 indexed pipelineId, address indexed client, string name, uint256 totalBudget, uint256 stepCount);
    event PipelineFunded(uint256 indexed pipelineId, uint256 amount);
    event StepActivated(uint256 indexed pipelineId, uint256 indexed stepIndex, bytes32 inputHash);
    event StepSubmitted(uint256 indexed pipelineId, uint256 indexed stepIndex, bytes32 deliverable);
    event StepCompleted(uint256 indexed pipelineId, uint256 indexed stepIndex, uint256 payout);
    event StepRejected(uint256 indexed pipelineId, uint256 indexed stepIndex, bytes32 reason);
    event PipelineCompleted(uint256 indexed pipelineId);
    event PipelineFailed(uint256 indexed pipelineId, uint256 failedStep);
    event Refunded(uint256 indexed pipelineId, uint256 amount);

    error NotClient();
    error NotWorker();
    error NotEvaluator();
    error InvalidStatus();
    error InvalidStep();
    error PipelineExpired();
    error PipelineNotExpired();
    error ZeroAddress();
    error ZeroBudget();
    error WrongAmount();
    error TransferFailed();
    error NoSteps();
    error BudgetMismatch();

    modifier onlyClient(uint256 pid) {
        if (msg.sender != pipelines[pid].client) revert NotClient();
        _;
    }

    modifier onlyStepWorker(uint256 pid, uint256 stepIdx) {
        if (msg.sender != steps[pid][stepIdx].worker) revert NotWorker();
        _;
    }

    modifier onlyStepEvaluator(uint256 pid, uint256 stepIdx) {
        if (msg.sender != steps[pid][stepIdx].evaluator) revert NotEvaluator();
        _;
    }

    modifier notExpired(uint256 pid) {
        if (block.timestamp >= pipelines[pid].expiredAt) revert PipelineExpired();
        _;
    }

    function createPipeline(
        string calldata name,
        uint256 expiredAt,
        address[] calldata workers,
        address[] calldata evaluators,
        string[] calldata descriptions,
        uint256[] calldata rewards,
        uint256[] calldata gasCompensations
    ) external returns (uint256 pid) {
        uint256 count = workers.length;
        if (count == 0) revert NoSteps();
        if (count != evaluators.length || count != descriptions.length ||
            count != rewards.length || count != gasCompensations.length) revert BudgetMismatch();

        pid = pipelineCount++;
        Pipeline storage p = pipelines[pid];
        p.client = msg.sender;
        p.name = name;
        p.expiredAt = expiredAt;
        p.status = PipelineStatus.Open;
        p.stepCount = count;

        uint256 total;
        for (uint256 i; i < count; i++) {
            if (workers[i] == address(0) || evaluators[i] == address(0)) revert ZeroAddress();
            if (rewards[i] == 0) revert ZeroBudget();

            steps[pid][i] = Step({
                worker: workers[i],
                evaluator: evaluators[i],
                description: descriptions[i],
                reward: rewards[i],
                gasCompensation: gasCompensations[i],
                status: StepStatus.Pending,
                deliverable: bytes32(0),
                inputHash: bytes32(0)
            });
            total += rewards[i] + gasCompensations[i];
        }
        p.totalBudget = total;

        emit PipelineCreated(pid, msg.sender, name, total, count);
    }

    function fund(uint256 pid)
        external
        payable
        onlyClient(pid)
        notExpired(pid)
        nonReentrant
    {
        Pipeline storage p = pipelines[pid];
        if (p.status != PipelineStatus.Open) revert InvalidStatus();
        if (msg.value != p.totalBudget) revert WrongAmount();

        p.status = PipelineStatus.Funded;
        emit PipelineFunded(pid, msg.value);

        _activateStep(pid, 0, bytes32(0));
    }

    function submit(uint256 pid, uint256 stepIdx, bytes32 deliverable)
        external
        onlyStepWorker(pid, stepIdx)
        notExpired(pid)
    {
        Pipeline storage p = pipelines[pid];
        if (p.status != PipelineStatus.Running) revert InvalidStatus();
        if (p.currentStep != stepIdx) revert InvalidStep();

        Step storage s = steps[pid][stepIdx];
        if (s.status != StepStatus.Active) revert InvalidStatus();

        s.deliverable = deliverable;
        s.status = StepStatus.Submitted;
        emit StepSubmitted(pid, stepIdx, deliverable);
    }

    function approveStep(uint256 pid, uint256 stepIdx)
        external
        onlyStepEvaluator(pid, stepIdx)
        nonReentrant
    {
        Pipeline storage p = pipelines[pid];
        if (p.status != PipelineStatus.Running) revert InvalidStatus();
        if (p.currentStep != stepIdx) revert InvalidStep();

        Step storage s = steps[pid][stepIdx];
        if (s.status != StepStatus.Submitted) revert InvalidStatus();

        s.status = StepStatus.Completed;
        p.completedSteps++;

        uint256 payout = s.reward + s.gasCompensation;
        (bool ok, ) = s.worker.call{value: payout}("");
        if (!ok) revert TransferFailed();
        emit StepCompleted(pid, stepIdx, payout);

        if (stepIdx + 1 < p.stepCount) {
            _activateStep(pid, stepIdx + 1, s.deliverable);
        } else {
            p.status = PipelineStatus.Completed;
            emit PipelineCompleted(pid);
        }
    }

    function rejectStep(uint256 pid, uint256 stepIdx, bytes32 reason)
        external
        onlyStepEvaluator(pid, stepIdx)
        nonReentrant
    {
        Pipeline storage p = pipelines[pid];
        if (p.status != PipelineStatus.Running) revert InvalidStatus();
        if (p.currentStep != stepIdx) revert InvalidStep();

        Step storage s = steps[pid][stepIdx];
        if (s.status != StepStatus.Submitted) revert InvalidStatus();

        s.status = StepStatus.Rejected;
        p.status = PipelineStatus.Failed;
        emit StepRejected(pid, stepIdx, reason);
        emit PipelineFailed(pid, stepIdx);

        uint256 remaining = _remainingBudget(pid, stepIdx);
        if (remaining > 0) {
            (bool ok, ) = p.client.call{value: remaining}("");
            if (!ok) revert TransferFailed();
            emit Refunded(pid, remaining);
        }
    }

    function claimRefund(uint256 pid) external nonReentrant {
        Pipeline storage p = pipelines[pid];
        if (block.timestamp < p.expiredAt) revert PipelineNotExpired();
        if (p.status != PipelineStatus.Funded && p.status != PipelineStatus.Running)
            revert InvalidStatus();

        p.status = PipelineStatus.Expired;
        uint256 remaining = _remainingBudget(pid, p.currentStep);
        if (remaining > 0) {
            (bool ok, ) = p.client.call{value: remaining}("");
            if (!ok) revert TransferFailed();
            emit Refunded(pid, remaining);
        }
    }

    function getPipeline(uint256 pid)
        external
        view
        returns (
            address client,
            string memory name,
            uint256 totalBudget,
            uint256 expiredAt,
            PipelineStatus status,
            uint256 currentStep,
            uint256 stepCount,
            uint256 completedSteps
        )
    {
        Pipeline storage p = pipelines[pid];
        return (p.client, p.name, p.totalBudget, p.expiredAt, p.status, p.currentStep, p.stepCount, p.completedSteps);
    }

    function getStep(uint256 pid, uint256 stepIdx)
        external
        view
        returns (
            address worker,
            address evaluator,
            string memory description,
            uint256 reward,
            uint256 gasCompensation,
            StepStatus status,
            bytes32 deliverable,
            bytes32 inputHash
        )
    {
        Step storage s = steps[pid][stepIdx];
        return (s.worker, s.evaluator, s.description, s.reward, s.gasCompensation, s.status, s.deliverable, s.inputHash);
    }

    function _activateStep(uint256 pid, uint256 stepIdx, bytes32 inputHash) internal {
        Pipeline storage p = pipelines[pid];
        p.status = PipelineStatus.Running;
        p.currentStep = stepIdx;

        Step storage s = steps[pid][stepIdx];
        s.status = StepStatus.Active;
        s.inputHash = inputHash;

        emit StepActivated(pid, stepIdx, inputHash);
    }

    function _remainingBudget(uint256 pid, uint256 fromStep) internal view returns (uint256 remaining) {
        Pipeline storage p = pipelines[pid];
        for (uint256 i = fromStep; i < p.stepCount; i++) {
            Step storage s = steps[pid][i];
            if (s.status != StepStatus.Completed) {
                remaining += s.reward + s.gasCompensation;
            }
        }
    }
}
