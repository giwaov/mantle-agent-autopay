// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title MantleAgentAutopay
/// @notice Escrowed recurring and milestone payments for AI agents on Mantle.
contract MantleAgentAutopay {
    address public constant NATIVE_TOKEN = address(0);
    string public constant VERSION = "1.0.0";

    uint256 public scheduleCount;
    uint256 public milestoneCount;
    uint256 private locked = 1;

    struct Schedule {
        address payer;
        address agent;
        address token;
        uint96 amountPerPeriod;
        uint40 startTime;
        uint40 periodSeconds;
        uint32 maxPayments;
        uint32 paymentsClaimed;
        uint128 balance;
        bool cancelled;
        string metadataURI;
    }

    struct Milestone {
        address payer;
        address agent;
        address token;
        uint128 amount;
        bytes32 workHash;
        bool released;
        bool cancelled;
        string metadataURI;
    }

    mapping(uint256 => Schedule) public schedules;
    mapping(uint256 => Milestone) public milestones;

    event ScheduleCreated(
        uint256 indexed scheduleId,
        address indexed payer,
        address indexed agent,
        address token,
        uint256 amountPerPeriod,
        uint256 periodSeconds,
        uint256 maxPayments,
        uint256 fundedAmount,
        string metadataURI
    );

    event ScheduleFunded(uint256 indexed scheduleId, address indexed payer, uint256 amount);
    event ScheduleClaimed(
        uint256 indexed scheduleId,
        bytes32 indexed receiptId,
        address indexed agent,
        uint256 periods,
        uint256 amount,
        uint256 paymentsClaimed
    );
    event ScheduleCancelled(uint256 indexed scheduleId, address indexed payer, uint256 refundAmount);

    event MilestoneCreated(
        uint256 indexed milestoneId,
        address indexed payer,
        address indexed agent,
        address token,
        uint256 amount,
        bytes32 workHash,
        string metadataURI
    );
    event MilestoneReleased(
        uint256 indexed milestoneId,
        bytes32 indexed receiptId,
        address indexed agent,
        uint256 amount,
        bytes32 workHash
    );
    event MilestoneCancelled(uint256 indexed milestoneId, address indexed payer, uint256 refundAmount);

    error InvalidAgent();
    error InvalidAmount();
    error InvalidPeriod();
    error InvalidPaymentCount();
    error InvalidFunding();
    error Unauthorized();
    error NothingDue();
    error ScheduleInactive();
    error MilestoneInactive();
    error TransferFailed();
    error ReentrantCall();

    modifier nonReentrant() {
        if (locked != 1) revert ReentrantCall();
        locked = 2;
        _;
        locked = 1;
    }

    function createNativeSchedule(
        address agent,
        uint96 amountPerPeriod,
        uint40 startTime,
        uint40 periodSeconds,
        uint32 maxPayments,
        string calldata metadataURI
    ) external payable returns (uint256 scheduleId) {
        return _createSchedule(
            msg.sender,
            agent,
            NATIVE_TOKEN,
            amountPerPeriod,
            startTime,
            periodSeconds,
            maxPayments,
            msg.value,
            metadataURI
        );
    }

    function createTokenSchedule(
        address agent,
        address token,
        uint96 amountPerPeriod,
        uint40 startTime,
        uint40 periodSeconds,
        uint32 maxPayments,
        uint128 fundedAmount,
        string calldata metadataURI
    ) external returns (uint256 scheduleId) {
        if (token == NATIVE_TOKEN) revert InvalidFunding();
        _pullToken(token, msg.sender, fundedAmount);
        return _createSchedule(
            msg.sender,
            agent,
            token,
            amountPerPeriod,
            startTime,
            periodSeconds,
            maxPayments,
            fundedAmount,
            metadataURI
        );
    }

    function fundNativeSchedule(uint256 scheduleId) external payable {
        if (msg.value == 0) revert InvalidAmount();
        Schedule storage schedule = schedules[scheduleId];
        if (schedule.payer == address(0) || schedule.cancelled) revert ScheduleInactive();
        if (schedule.token != NATIVE_TOKEN) revert InvalidFunding();

        schedule.balance += uint128(msg.value);
        emit ScheduleFunded(scheduleId, msg.sender, msg.value);
    }

    function fundTokenSchedule(uint256 scheduleId, uint128 amount) external {
        if (amount == 0) revert InvalidAmount();
        Schedule storage schedule = schedules[scheduleId];
        if (schedule.payer == address(0) || schedule.cancelled) revert ScheduleInactive();
        if (schedule.token == NATIVE_TOKEN) revert InvalidFunding();

        _pullToken(schedule.token, msg.sender, amount);
        schedule.balance += amount;
        emit ScheduleFunded(scheduleId, msg.sender, amount);
    }

    function claimSchedule(uint256 scheduleId) external nonReentrant returns (uint256 paidAmount) {
        Schedule storage schedule = schedules[scheduleId];
        if (schedule.payer == address(0) || schedule.cancelled) revert ScheduleInactive();

        uint256 duePeriods = claimablePeriods(scheduleId);
        if (duePeriods == 0) revert NothingDue();

        paidAmount = duePeriods * uint256(schedule.amountPerPeriod);
        // casting to uint32 is safe because duePeriods is capped by maxPayments, which is uint32.
        // forge-lint: disable-next-line(unsafe-typecast)
        schedule.paymentsClaimed += uint32(duePeriods);
        // casting to uint128 is safe because claimablePeriods caps paidAmount to the escrowed uint128 balance.
        // forge-lint: disable-next-line(unsafe-typecast)
        schedule.balance -= uint128(paidAmount);

        bytes32 receiptId = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                "SCHEDULE_CLAIM",
                scheduleId,
                schedule.payer,
                schedule.agent,
                schedule.token,
                paidAmount,
                schedule.paymentsClaimed,
                block.timestamp
            )
        );

        _pay(schedule.token, schedule.agent, paidAmount);
        emit ScheduleClaimed(scheduleId, receiptId, schedule.agent, duePeriods, paidAmount, schedule.paymentsClaimed);
    }

    function cancelSchedule(uint256 scheduleId) external nonReentrant returns (uint256 refundAmount) {
        Schedule storage schedule = schedules[scheduleId];
        if (schedule.payer == address(0) || schedule.cancelled) revert ScheduleInactive();
        if (msg.sender != schedule.payer) revert Unauthorized();

        schedule.cancelled = true;
        refundAmount = schedule.balance;
        schedule.balance = 0;

        if (refundAmount != 0) {
            _pay(schedule.token, schedule.payer, refundAmount);
        }
        emit ScheduleCancelled(scheduleId, schedule.payer, refundAmount);
    }

    function createNativeMilestone(
        address agent,
        bytes32 workHash,
        string calldata metadataURI
    ) external payable returns (uint256 milestoneId) {
        if (msg.value == 0 || msg.value > type(uint128).max) revert InvalidAmount();
        return _createMilestone(msg.sender, agent, NATIVE_TOKEN, uint128(msg.value), workHash, metadataURI);
    }

    function createTokenMilestone(
        address agent,
        address token,
        uint128 amount,
        bytes32 workHash,
        string calldata metadataURI
    ) external returns (uint256 milestoneId) {
        if (token == NATIVE_TOKEN) revert InvalidFunding();
        _pullToken(token, msg.sender, amount);
        return _createMilestone(msg.sender, agent, token, amount, workHash, metadataURI);
    }

    function releaseMilestone(uint256 milestoneId) external nonReentrant {
        Milestone storage milestone = milestones[milestoneId];
        if (milestone.payer == address(0) || milestone.released || milestone.cancelled) revert MilestoneInactive();
        if (msg.sender != milestone.payer) revert Unauthorized();

        milestone.released = true;
        bytes32 receiptId = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                "MILESTONE_RELEASE",
                milestoneId,
                milestone.payer,
                milestone.agent,
                milestone.token,
                milestone.amount,
                milestone.workHash,
                block.timestamp
            )
        );

        _pay(milestone.token, milestone.agent, milestone.amount);
        emit MilestoneReleased(milestoneId, receiptId, milestone.agent, milestone.amount, milestone.workHash);
    }

    function cancelMilestone(uint256 milestoneId) external nonReentrant {
        Milestone storage milestone = milestones[milestoneId];
        if (milestone.payer == address(0) || milestone.released || milestone.cancelled) revert MilestoneInactive();
        if (msg.sender != milestone.payer) revert Unauthorized();

        milestone.cancelled = true;
        _pay(milestone.token, milestone.payer, milestone.amount);
        emit MilestoneCancelled(milestoneId, milestone.payer, milestone.amount);
    }

    function claimablePeriods(uint256 scheduleId) public view returns (uint256) {
        Schedule memory schedule = schedules[scheduleId];
        if (schedule.payer == address(0) || schedule.cancelled) return 0;
        if (block.timestamp < schedule.startTime) return 0;

        uint256 elapsedPeriods = ((block.timestamp - schedule.startTime) / schedule.periodSeconds) + 1;
        if (elapsedPeriods > schedule.maxPayments) {
            elapsedPeriods = schedule.maxPayments;
        }
        if (elapsedPeriods <= schedule.paymentsClaimed) return 0;

        uint256 dueByTime = elapsedPeriods - schedule.paymentsClaimed;
        uint256 dueByBalance = schedule.balance / schedule.amountPerPeriod;
        return dueByTime < dueByBalance ? dueByTime : dueByBalance;
    }

    function scheduleStatus(uint256 scheduleId)
        external
        view
        returns (
            uint256 claimable,
            uint256 claimableAmount,
            uint256 nextClaimTime,
            uint256 remainingPayments,
            bool active
        )
    {
        Schedule memory schedule = schedules[scheduleId];
        if (schedule.payer == address(0) || schedule.cancelled) {
            return (0, 0, 0, 0, false);
        }

        claimable = claimablePeriods(scheduleId);
        claimableAmount = claimable * uint256(schedule.amountPerPeriod);
        remainingPayments = schedule.maxPayments - schedule.paymentsClaimed;
        active = remainingPayments > 0 && schedule.balance >= schedule.amountPerPeriod;

        if (!active || claimable > 0) {
            nextClaimTime = block.timestamp;
        } else {
            nextClaimTime = schedule.startTime + (uint256(schedule.paymentsClaimed) * schedule.periodSeconds);
        }
    }

    function _createSchedule(
        address payer,
        address agent,
        address token,
        uint96 amountPerPeriod,
        uint40 startTime,
        uint40 periodSeconds,
        uint32 maxPayments,
        uint256 fundedAmount,
        string calldata metadataURI
    ) internal returns (uint256 scheduleId) {
        if (agent == address(0)) revert InvalidAgent();
        if (amountPerPeriod == 0) revert InvalidAmount();
        if (periodSeconds == 0) revert InvalidPeriod();
        if (maxPayments == 0) revert InvalidPaymentCount();
        if (fundedAmount == 0 || fundedAmount > type(uint128).max) revert InvalidFunding();

        scheduleId = ++scheduleCount;
        schedules[scheduleId] = Schedule({
            payer: payer,
            agent: agent,
            token: token,
            amountPerPeriod: amountPerPeriod,
            startTime: startTime == 0 ? uint40(block.timestamp) : startTime,
            periodSeconds: periodSeconds,
            maxPayments: maxPayments,
            paymentsClaimed: 0,
            // casting to uint128 is safe because fundedAmount is checked against type(uint128).max above.
            // forge-lint: disable-next-line(unsafe-typecast)
            balance: uint128(fundedAmount),
            cancelled: false,
            metadataURI: metadataURI
        });

        emit ScheduleCreated(
            scheduleId,
            payer,
            agent,
            token,
            amountPerPeriod,
            periodSeconds,
            maxPayments,
            fundedAmount,
            metadataURI
        );
    }

    function _createMilestone(
        address payer,
        address agent,
        address token,
        uint128 amount,
        bytes32 workHash,
        string calldata metadataURI
    ) internal returns (uint256 milestoneId) {
        if (agent == address(0)) revert InvalidAgent();
        if (amount == 0) revert InvalidAmount();

        milestoneId = ++milestoneCount;
        milestones[milestoneId] = Milestone({
            payer: payer,
            agent: agent,
            token: token,
            amount: amount,
            workHash: workHash,
            released: false,
            cancelled: false,
            metadataURI: metadataURI
        });

        emit MilestoneCreated(milestoneId, payer, agent, token, amount, workHash, metadataURI);
    }

    function _pullToken(address token, address from, uint256 amount) internal {
        if (amount == 0 || amount > type(uint128).max) revert InvalidAmount();
        (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transferFrom, (from, address(this), amount)));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _pay(address token, address to, uint256 amount) internal {
        if (token == NATIVE_TOKEN) {
            (bool sent,) = payable(to).call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            (bool ok, bytes memory data) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
            if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
        }
    }
}
