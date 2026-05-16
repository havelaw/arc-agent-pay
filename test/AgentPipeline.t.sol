// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/AgentPipelineNative.sol";

contract AgentPipelineNativeTest is Test {
    AgentPipelineNative pipeline;
    address client = address(0x1);
    address worker = address(0x2);
    address evaluator = address(0x3);
    address other = address(0x4);

    uint256 constant REWARD = 1 ether;
    uint256 constant GAS_COMP = 0.1 ether;
    uint256 constant STEP_TOTAL = REWARD + GAS_COMP;

    function setUp() public {
        pipeline = new AgentPipelineNative();
        vm.deal(client, 100 ether);
    }

    function _createPipeline(uint256 steps) internal returns (uint256) {
        address[] memory workers = new address[](steps);
        address[] memory evaluators = new address[](steps);
        string[] memory descriptions = new string[](steps);
        uint256[] memory rewards = new uint256[](steps);
        uint256[] memory gasComps = new uint256[](steps);

        for (uint256 i; i < steps; i++) {
            workers[i] = worker;
            evaluators[i] = evaluator;
            descriptions[i] = string(abi.encodePacked("Step ", vm.toString(i)));
            rewards[i] = REWARD;
            gasComps[i] = GAS_COMP;
        }

        vm.prank(client);
        return pipeline.createPipeline(
            "Test Pipeline",
            block.timestamp + 3600,
            workers, evaluators, descriptions, rewards, gasComps
        );
    }

    function _createAndFund(uint256 steps) internal returns (uint256 pid) {
        pid = _createPipeline(steps);
        vm.prank(client);
        pipeline.fund{value: STEP_TOTAL * steps}(pid);
    }

    function test_CreatePipeline() public {
        uint256 pid = _createPipeline(3);

        (address c, string memory name, uint256 budget, ,
            AgentPipelineNative.PipelineStatus status, , uint256 stepCount, ) =
            pipeline.getPipeline(pid);

        assertEq(c, client);
        assertEq(name, "Test Pipeline");
        assertEq(budget, STEP_TOTAL * 3);
        assertTrue(status == AgentPipelineNative.PipelineStatus.Open);
        assertEq(stepCount, 3);
    }

    function test_FundActivatesStep0() public {
        uint256 pid = _createAndFund(2);

        (, , , , AgentPipelineNative.PipelineStatus pStatus, uint256 currentStep, , ) = pipeline.getPipeline(pid);
        assertTrue(pStatus == AgentPipelineNative.PipelineStatus.Running);
        assertEq(currentStep, 0);

        (, , , , , AgentPipelineNative.StepStatus sStatus, , ) = pipeline.getStep(pid, 0);
        assertTrue(sStatus == AgentPipelineNative.StepStatus.Active);
    }

    function test_FullPipelineCompletion() public {
        uint256 pid = _createAndFund(3);
        uint256 workerBalBefore = worker.balance;

        for (uint256 i; i < 3; i++) {
            vm.prank(worker);
            pipeline.submit(pid, i, keccak256(abi.encodePacked("result", i)));

            vm.prank(evaluator);
            pipeline.approveStep(pid, i);
        }

        (, , , , AgentPipelineNative.PipelineStatus status, , , uint256 completed) = pipeline.getPipeline(pid);
        assertTrue(status == AgentPipelineNative.PipelineStatus.Completed);
        assertEq(completed, 3);
        assertEq(worker.balance - workerBalBefore, STEP_TOTAL * 3);
    }

    function test_InputChaining() public {
        uint256 pid = _createAndFund(2);
        bytes32 deliverable0 = keccak256("step0-output");

        vm.prank(worker);
        pipeline.submit(pid, 0, deliverable0);
        vm.prank(evaluator);
        pipeline.approveStep(pid, 0);

        (, , , , , , , bytes32 inputHash) = pipeline.getStep(pid, 1);
        assertEq(inputHash, deliverable0);
    }

    function test_RejectRefundsRemaining() public {
        uint256 pid = _createAndFund(3);

        // Complete step 0
        vm.prank(worker);
        pipeline.submit(pid, 0, keccak256("ok"));
        vm.prank(evaluator);
        pipeline.approveStep(pid, 0);

        // Submit & reject step 1
        uint256 clientBalBefore = client.balance;
        vm.prank(worker);
        pipeline.submit(pid, 1, keccak256("bad"));
        vm.prank(evaluator);
        pipeline.rejectStep(pid, 1, keccak256("low quality"));

        (, , , , AgentPipelineNative.PipelineStatus status2, , , ) = pipeline.getPipeline(pid);
        assertTrue(status2 == AgentPipelineNative.PipelineStatus.Failed);

        // Client gets steps 1+2 refund
        assertEq(client.balance - clientBalBefore, STEP_TOTAL * 2);
    }

    function test_RevertWrongWorker() public {
        uint256 pid = _createAndFund(1);

        vm.prank(other);
        vm.expectRevert(AgentPipelineNative.NotWorker.selector);
        pipeline.submit(pid, 0, keccak256("fake"));
    }

    function test_RevertWrongEvaluator() public {
        uint256 pid = _createAndFund(1);

        vm.prank(worker);
        pipeline.submit(pid, 0, keccak256("x"));

        vm.prank(other);
        vm.expectRevert(AgentPipelineNative.NotEvaluator.selector);
        pipeline.approveStep(pid, 0);
    }

    function test_ExpiryRefund() public {
        vm.prank(client);
        address[] memory w = new address[](1);
        w[0] = worker;
        address[] memory e = new address[](1);
        e[0] = evaluator;
        string[] memory d = new string[](1);
        d[0] = "x";
        uint256[] memory r = new uint256[](1);
        r[0] = REWARD;
        uint256[] memory g = new uint256[](1);
        g[0] = GAS_COMP;

        uint256 pid = pipeline.createPipeline("Short", block.timestamp + 10, w, e, d, r, g);
        vm.prank(client);
        pipeline.fund{value: STEP_TOTAL}(pid);

        vm.warp(block.timestamp + 20);

        uint256 clientBalBefore = client.balance;
        vm.prank(other);
        pipeline.claimRefund(pid);

        (, , , , AgentPipelineNative.PipelineStatus status3, , , ) = pipeline.getPipeline(pid);
        assertTrue(status3 == AgentPipelineNative.PipelineStatus.Expired);
        assertEq(client.balance - clientBalBefore, STEP_TOTAL);
    }

    function test_RevertNoSteps() public {
        address[] memory w;
        address[] memory e;
        string[] memory d;
        uint256[] memory r;
        uint256[] memory g;

        vm.prank(client);
        vm.expectRevert(AgentPipelineNative.NoSteps.selector);
        pipeline.createPipeline("Empty", block.timestamp + 100, w, e, d, r, g);
    }

    function test_RevertWrongFundAmount() public {
        uint256 pid = _createPipeline(1);

        vm.prank(client);
        vm.expectRevert(AgentPipelineNative.WrongAmount.selector);
        pipeline.fund{value: REWARD}(pid); // Missing gasComp
    }
}
