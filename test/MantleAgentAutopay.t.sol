// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../contracts/MantleAgentAutopay.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
    function prank(address msgSender) external;
    function expectRevert(bytes4 revertData) external;
}

contract MockToken {
    string public name = "Mock Mantle Token";
    string public symbol = "MMT";
    uint8 public decimals = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 approved = allowance[from][msg.sender];
        if (approved != type(uint256).max) {
            allowance[from][msg.sender] = approved - amount;
        }
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MantleAgentAutopayTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    MantleAgentAutopay private autopay;
    MockToken private token;

    address private payer = address(0xA11CE);
    address private agent = address(0xA6E17);

    receive() external payable {}

    function setUp() public {
        autopay = new MantleAgentAutopay();
        token = new MockToken();
        vm.deal(payer, 100 ether);
        token.mint(payer, 100 ether);
    }

    function testNativeScheduleClaimsOnlyDuePeriods() public {
        vm.prank(payer);
        uint256 scheduleId = autopay.createNativeSchedule{value: 4 ether}(
            agent,
            1 ether,
            uint40(block.timestamp),
            7 days,
            4,
            "ipfs://weekly-monitor"
        );

        assertEq(autopay.claimablePeriods(scheduleId), 1);
        (uint256 claimable, uint256 claimableAmount,, uint256 remainingPayments, bool active) =
            autopay.scheduleStatus(scheduleId);
        assertEq(claimable, 1);
        assertEq(claimableAmount, 1 ether);
        assertEq(remainingPayments, 4);
        require(active, "schedule inactive");

        uint256 agentBefore = agent.balance;
        vm.prank(agent);
        uint256 paid = autopay.claimSchedule(scheduleId);

        assertEq(paid, 1 ether);
        assertEq(agent.balance - agentBefore, 1 ether);
        assertEq(autopay.claimablePeriods(scheduleId), 0);
    }

    function testScheduleCannotClaimBeforeFutureStart() public {
        vm.prank(payer);
        uint256 scheduleId = autopay.createNativeSchedule{value: 2 ether}(
            agent,
            1 ether,
            uint40(block.timestamp + 7 days),
            7 days,
            2,
            "ipfs://future-start"
        );

        assertEq(autopay.claimablePeriods(scheduleId), 0);
        vm.expectRevert(MantleAgentAutopay.NothingDue.selector);
        autopay.claimSchedule(scheduleId);
    }

    function testCancelScheduleRefundsUnusedFunds() public {
        vm.prank(payer);
        uint256 scheduleId = autopay.createNativeSchedule{value: 4 ether}(
            agent,
            1 ether,
            uint40(block.timestamp),
            7 days,
            4,
            "ipfs://cancellable"
        );

        autopay.claimSchedule(scheduleId);

        uint256 payerBefore = payer.balance;
        vm.prank(payer);
        uint256 refund = autopay.cancelSchedule(scheduleId);

        assertEq(refund, 3 ether);
        assertEq(payer.balance - payerBefore, 3 ether);
        assertEq(autopay.claimablePeriods(scheduleId), 0);
    }

    function testTokenScheduleClaim() public {
        vm.prank(payer);
        token.approve(address(autopay), 3 ether);

        vm.prank(payer);
        uint256 scheduleId = autopay.createTokenSchedule(
            agent,
            address(token),
            1 ether,
            uint40(block.timestamp),
            7 days,
            3,
            uint128(3 ether),
            "ipfs://token-schedule"
        );

        assertEq(token.balanceOf(address(autopay)), 3 ether);
        autopay.claimSchedule(scheduleId);
        assertEq(token.balanceOf(agent), 1 ether);
        assertEq(token.balanceOf(address(autopay)), 2 ether);
    }

    function testNativeMilestoneRelease() public {
        bytes32 workHash = keccak256("risk report");

        vm.prank(payer);
        uint256 milestoneId = autopay.createNativeMilestone{value: 5 ether}(
            agent,
            workHash,
            "ipfs://risk-report"
        );

        uint256 agentBefore = agent.balance;
        vm.prank(payer);
        autopay.releaseMilestone(milestoneId);

        assertEq(agent.balance - agentBefore, 5 ether);
    }

    function testMilestoneCancelRefundsPayer() public {
        vm.prank(payer);
        uint256 milestoneId = autopay.createNativeMilestone{value: 5 ether}(
            agent,
            keccak256("cancelled work"),
            "ipfs://cancelled"
        );

        uint256 payerBefore = payer.balance;
        vm.prank(payer);
        autopay.cancelMilestone(milestoneId);

        assertEq(payer.balance - payerBefore, 5 ether);
    }

    function assertEq(uint256 actual, uint256 expected) internal pure {
        require(actual == expected, "uint mismatch");
    }
}
