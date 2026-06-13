#!/usr/bin/env node

import { ethers } from "ethers";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_RPC_URL = "https://rpc.mantle.xyz";
const EXPECTED_CHAIN_ID = 5000n;
const NETWORK_NAME = "Mantle Mainnet";
const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

const ABI = [
  "function createNativeSchedule(address agent,uint96 amountPerPeriod,uint40 startTime,uint40 periodSeconds,uint32 maxPayments,string metadataURI) payable returns (uint256)",
  "function createTokenSchedule(address agent,address token,uint96 amountPerPeriod,uint40 startTime,uint40 periodSeconds,uint32 maxPayments,uint128 fundedAmount,string metadataURI) returns (uint256)",
  "function fundNativeSchedule(uint256 scheduleId) payable",
  "function fundTokenSchedule(uint256 scheduleId,uint128 amount)",
  "function claimSchedule(uint256 scheduleId) returns (uint256)",
  "function cancelSchedule(uint256 scheduleId) returns (uint256)",
  "function createNativeMilestone(address agent,bytes32 workHash,string metadataURI) payable returns (uint256)",
  "function createTokenMilestone(address agent,address token,uint128 amount,bytes32 workHash,string metadataURI) returns (uint256)",
  "function releaseMilestone(uint256 milestoneId)",
  "function cancelMilestone(uint256 milestoneId)",
  "function claimablePeriods(uint256 scheduleId) view returns (uint256)",
  "function scheduleStatus(uint256 scheduleId) view returns (uint256 claimable,uint256 claimableAmount,uint256 nextClaimTime,uint256 remainingPayments,bool active)",
  "function schedules(uint256 scheduleId) view returns (address payer,address agent,address token,uint96 amountPerPeriod,uint40 startTime,uint40 periodSeconds,uint32 maxPayments,uint32 paymentsClaimed,uint128 balance,bool cancelled,string metadataURI)",
  "function scheduleCount() view returns (uint256)",
  "function milestoneCount() view returns (uint256)",
  "function VERSION() view returns (string)",
];

function emit(payload) {
  console.log(JSON.stringify(payload, (_key, value) => (
    typeof value === "bigint" ? value.toString() : value
  ), 2));
}

function ok(action, data) {
  emit({ status: "success", action, data, error: null });
}

function fail(action, code, message, next, data = {}) {
  emit({ status: "error", action, data, error: { code, message, next } });
}

function blocked(action, code, message, next, data = {}) {
  emit({ status: "blocked", action, data, error: { code, message, next } });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function provider() {
  return new ethers.JsonRpcProvider(process.env.MANTLE_RPC_URL || DEFAULT_RPC_URL);
}

function requireAddress(value, name) {
  if (!ethers.isAddress(value || "")) {
    throw new Error(`${name} must be a valid EVM address.`);
  }
  return ethers.getAddress(value);
}

function parseToken(value) {
  if (!value || value.toLowerCase() === "mnt" || value.toLowerCase() === "native") {
    return NATIVE_TOKEN;
  }
  return requireAddress(value, "--token");
}

function parseAmount(value, name = "--amount") {
  if (!value || !/^(0|[1-9]\d*)(\.\d{1,18})?$/.test(value)) {
    throw new Error(`${name} must be a positive token amount, like 1 or 0.25.`);
  }
  const parsed = ethers.parseEther(value);
  if (parsed <= 0n) throw new Error(`${name} must be greater than zero.`);
  return parsed;
}

function parseUint(value, name, fallback = null) {
  if ((value === undefined || value === null || value === "") && fallback !== null) return fallback;
  if (!/^\d+$/.test(String(value || ""))) {
    throw new Error(`${name} must be a whole number.`);
  }
  return BigInt(value);
}

function parsePeriodSeconds(args) {
  if (args["period-seconds"]) return parseUint(args["period-seconds"], "--period-seconds");
  if (args["period-days"]) return parseUint(args["period-days"], "--period-days") * 86400n;
  throw new Error("Pass --period-days or --period-seconds.");
}

function parseStart(args) {
  if (!args.start) return 0n;
  if (/^\d+$/.test(args.start)) return BigInt(args.start);
  const ms = Date.parse(args.start);
  if (Number.isNaN(ms)) {
    throw new Error("--start must be a unix timestamp or ISO date.");
  }
  return BigInt(Math.floor(ms / 1000));
}

function parseBytes32(value, name) {
  if (!value) return ethers.ZeroHash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    return ethers.keccak256(ethers.toUtf8Bytes(value));
  }
  return value;
}

function iface() {
  return new ethers.Interface(ABI);
}

async function doctor(args) {
  const rpc = provider();
  try {
    const [network, blockNumber, feeData] = await Promise.all([
      rpc.getNetwork(),
      rpc.getBlockNumber(),
      rpc.getFeeData(),
    ]);

    let contract = null;
    if (args.contract) {
      const contractAddress = requireAddress(args.contract, "--contract");
      const code = await rpc.getCode(contractAddress);
      contract = {
        address: contractAddress,
        deployed: code !== "0x",
        byteLength: code === "0x" ? 0 : (code.length - 2) / 2,
      };
    }

    ok("doctor", {
      runtime: { node: process.version, ethers: ethers.version },
      rpc: { url: process.env.MANTLE_RPC_URL || DEFAULT_RPC_URL, reachable: true },
      network: {
        name: NETWORK_NAME,
        expectedChainId: Number(EXPECTED_CHAIN_ID),
        actualChainId: Number(network.chainId),
        chainOk: network.chainId === EXPECTED_CHAIN_ID,
        latestBlock: blockNumber,
      },
      feeData: {
        gasPriceWei: feeData.gasPrice?.toString() || null,
        maxFeePerGasWei: feeData.maxFeePerGas?.toString() || null,
        maxPriorityFeePerGasWei: feeData.maxPriorityFeePerGas?.toString() || null,
      },
      contract,
      verdict: network.chainId === EXPECTED_CHAIN_ID ? "ready" : "wrong_chain",
    });
  } catch (error) {
    fail("doctor", "DOCTOR_ERROR", error.message, "Check Mantle RPC URL, network access, or contract address.");
  }
}

function buildSchedule(args) {
  const payer = requireAddress(args.payer, "--payer");
  const agent = requireAddress(args.agent, "--agent");
  const token = parseToken(args.token);
  const amountWei = parseAmount(args.amount);
  const periodSeconds = parsePeriodSeconds(args);
  const maxPayments = parseUint(args.payments, "--payments");
  const startTime = parseStart(args);
  const fundedAmountWei = args.fund
    ? parseAmount(args.fund, "--fund")
    : amountWei * maxPayments;

  if (periodSeconds <= 0n) throw new Error("Period must be greater than zero.");
  if (maxPayments <= 0n) throw new Error("--payments must be greater than zero.");

  return {
    payer,
    agent,
    token,
    amountWei,
    amountMnt: ethers.formatEther(amountWei),
    periodSeconds,
    periodDays: Number(periodSeconds) / 86400,
    maxPayments,
    startTime,
    fundedAmountWei,
    fundedAmountMnt: ethers.formatEther(fundedAmountWei),
    metadataURI: args["metadata-uri"] || "",
  };
}

async function schedule(args) {
  try {
    const data = buildSchedule(args);
    const call = iface();
    const native = data.token === NATIVE_TOKEN;
    const calldata = native
      ? call.encodeFunctionData("createNativeSchedule", [
          data.agent,
          data.amountWei,
          data.startTime,
          data.periodSeconds,
          data.maxPayments,
          data.metadataURI,
        ])
      : call.encodeFunctionData("createTokenSchedule", [
          data.agent,
          data.token,
          data.amountWei,
          data.startTime,
          data.periodSeconds,
          data.maxPayments,
          data.fundedAmountWei,
          data.metadataURI,
        ]);

    ok("schedule", {
      summary: `${data.payer} funds ${data.agent} for ${data.maxPayments} payments of ${data.amountMnt} ${native ? "MNT" : "tokens"}.`,
      transaction: {
        to: args.contract ? requireAddress(args.contract, "--contract") : "<deploy MantleAgentAutopay first>",
        from: data.payer,
        valueWei: native ? data.fundedAmountWei : 0n,
        calldata,
      },
      schedule: data,
      explanation: "This creates an escrowed autopay schedule. The agent can claim only periods that are due and already funded.",
    });
  } catch (error) {
    fail("schedule", "SCHEDULE_ERROR", error.message, "Check payer, agent, token, amount, period, payments, fund, and start arguments.");
  }
}

function buildMilestone(args) {
  const payer = requireAddress(args.payer, "--payer");
  const agent = requireAddress(args.agent, "--agent");
  const token = parseToken(args.token);
  const amountWei = parseAmount(args.amount);
  const workHash = parseBytes32(args["work-hash"] || args.work, "--work-hash");
  const metadataURI = args["metadata-uri"] || "";

  return {
    payer,
    agent,
    token,
    amountWei,
    amountMnt: ethers.formatEther(amountWei),
    workHash,
    metadataURI,
  };
}

async function milestone(args) {
  try {
    const data = buildMilestone(args);
    const call = iface();
    const native = data.token === NATIVE_TOKEN;
    const calldata = native
      ? call.encodeFunctionData("createNativeMilestone", [data.agent, data.workHash, data.metadataURI])
      : call.encodeFunctionData("createTokenMilestone", [data.agent, data.token, data.amountWei, data.workHash, data.metadataURI]);

    ok("milestone", {
      summary: `${data.payer} escrows ${data.amountMnt} ${native ? "MNT" : "tokens"} for ${data.agent}.`,
      transaction: {
        to: args.contract ? requireAddress(args.contract, "--contract") : "<deploy MantleAgentAutopay first>",
        from: data.payer,
        valueWei: native ? data.amountWei : 0n,
        calldata,
      },
      milestone: data,
      explanation: "This creates a milestone escrow. The payer releases it after the AI agent completes the promised work.",
    });
  } catch (error) {
    fail("milestone", "MILESTONE_ERROR", error.message, "Check payer, agent, token, amount, work hash, and metadata arguments.");
  }
}

async function prepareClaim(args) {
  try {
    if (!args.contract) throw new Error("--contract is required.");
    const contract = requireAddress(args.contract, "--contract");
    const scheduleId = parseUint(args["schedule-id"], "--schedule-id");
    const calldata = iface().encodeFunctionData("claimSchedule", [scheduleId]);

    ok("prepare-claim", {
      to: contract,
      valueWei: "0",
      calldata,
      scheduleId,
      explanation: "Anyone can submit this transaction; funds are paid only to the schedule's configured agent.",
    });
  } catch (error) {
    fail("prepare-claim", "CLAIM_ERROR", error.message, "Pass --contract and --schedule-id.");
  }
}

async function status(args) {
  try {
    if (!args.contract) throw new Error("--contract is required.");
    const contractAddress = requireAddress(args.contract, "--contract");
    const scheduleId = parseUint(args["schedule-id"], "--schedule-id");
    const rpc = provider();
    const contract = new ethers.Contract(contractAddress, ABI, rpc);
    const [schedule, scheduleStatus, version] = await Promise.all([
      contract.schedules(scheduleId),
      contract.scheduleStatus(scheduleId),
      contract.VERSION().catch(() => null),
    ]);

    ok("status", {
      contract: contractAddress,
      version,
      scheduleId,
      schedule: {
        payer: schedule.payer,
        agent: schedule.agent,
        token: schedule.token,
        amountPerPeriodWei: schedule.amountPerPeriod,
        amountPerPeriod: ethers.formatEther(schedule.amountPerPeriod),
        startTime: schedule.startTime,
        periodSeconds: schedule.periodSeconds,
        maxPayments: schedule.maxPayments,
        paymentsClaimed: schedule.paymentsClaimed,
        balanceWei: schedule.balance,
        balance: ethers.formatEther(schedule.balance),
        cancelled: schedule.cancelled,
        metadataURI: schedule.metadataURI,
      },
      status: {
        claimablePeriods: scheduleStatus.claimable,
        claimableAmountWei: scheduleStatus.claimableAmount,
        claimableAmount: ethers.formatEther(scheduleStatus.claimableAmount),
        nextClaimTime: scheduleStatus.nextClaimTime,
        remainingPayments: scheduleStatus.remainingPayments,
        active: scheduleStatus.active,
      },
    });
  } catch (error) {
    fail("status", "STATUS_ERROR", error.message, "Pass --contract, --schedule-id, and a reachable Mantle RPC.");
  }
}

function loadBytecode() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const artifactPath = path.join(here, "out", "MantleAgentAutopay.sol", "MantleAgentAutopay.json");
  if (!fs.existsSync(artifactPath)) {
    throw new Error("Missing Foundry artifact. Run `forge build` first.");
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return artifact.bytecode?.object || artifact.bytecode;
}

async function deploy(args) {
  try {
    const privateKey = process.env.MANTLE_DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      blocked("deploy", "MISSING_PRIVATE_KEY", "MANTLE_DEPLOYER_PRIVATE_KEY is not set.", "Set it locally in a secure shell to deploy.");
      return;
    }
    if (!args.broadcast) {
      blocked("deploy", "BROADCAST_REQUIRED", "Deployment requires --broadcast.", "Rerun with --broadcast after checking the deployer wallet.");
      return;
    }

    const rpc = provider();
    const network = await rpc.getNetwork();
    if (network.chainId !== EXPECTED_CHAIN_ID) {
      blocked("deploy", "WRONG_CHAIN", "RPC is not Mantle mainnet.", "Set MANTLE_RPC_URL to https://rpc.mantle.xyz or another Mantle mainnet RPC.");
      return;
    }

    const wallet = new ethers.Wallet(privateKey, rpc);
    const factory = new ethers.ContractFactory(ABI, loadBytecode(), wallet);
    const contract = await factory.deploy();
    const tx = contract.deploymentTransaction();
    await contract.waitForDeployment();

    ok("deploy", {
      deployer: wallet.address,
      contract: await contract.getAddress(),
      txHash: tx?.hash || null,
      chainId: Number(network.chainId),
    });
  } catch (error) {
    fail("deploy", "DEPLOY_ERROR", error.message, "Run forge build, fund deployer wallet with MNT, and retry.");
  }
}

function help() {
  ok("help", {
    pitch: "Recurring and milestone payments for AI agents on Mantle mainnet.",
    commands: [
      "doctor [--contract <address>]",
      "schedule --payer <address> --agent <address> --amount <MNT-or-token> --period-days <n> --payments <n> [--fund <amount>] [--token <address|MNT>] [--start <unix|iso>] [--metadata-uri <uri>] [--contract <address>]",
      "milestone --payer <address> --agent <address> --amount <MNT-or-token> --work-hash <bytes32|string> [--token <address|MNT>] [--metadata-uri <uri>] [--contract <address>]",
      "prepare-claim --contract <address> --schedule-id <id>",
      "status --contract <address> --schedule-id <id>",
      "deploy --broadcast",
    ],
  });
}

const [command, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

if (!command || command === "help" || command === "--help" || command === "-h") {
  help();
} else if (command === "doctor") {
  await doctor(args);
} else if (command === "schedule") {
  await schedule(args);
} else if (command === "milestone") {
  await milestone(args);
} else if (command === "prepare-claim") {
  await prepareClaim(args);
} else if (command === "status") {
  await status(args);
} else if (command === "deploy") {
  await deploy(args);
} else {
  fail("cli", "UNKNOWN_COMMAND", `Unknown command: ${command}`, "Use doctor, schedule, milestone, prepare-claim, status, deploy, or help.");
}
