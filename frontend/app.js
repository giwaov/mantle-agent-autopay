const config = window.MANTLE_AGENT_AUTOPAY_CONFIG;
const { ethers } = window;

const ABI = [
  "function createNativeSchedule(address agent,uint96 amountPerPeriod,uint40 startTime,uint40 periodSeconds,uint32 maxPayments,string metadataURI) payable returns (uint256)",
  "function createNativeMilestone(address agent,bytes32 workHash,string metadataURI) payable returns (uint256)",
  "function claimSchedule(uint256 scheduleId) returns (uint256)",
  "function cancelSchedule(uint256 scheduleId) returns (uint256)",
  "function releaseMilestone(uint256 milestoneId)",
  "function cancelMilestone(uint256 milestoneId)",
  "function schedules(uint256 scheduleId) view returns (address payer,address agent,address token,uint96 amountPerPeriod,uint40 startTime,uint40 periodSeconds,uint32 maxPayments,uint32 paymentsClaimed,uint128 balance,bool cancelled,string metadataURI)",
  "function scheduleStatus(uint256 scheduleId) view returns (uint256 claimable,uint256 claimableAmount,uint256 nextClaimTime,uint256 remainingPayments,bool active)",
];

const els = {
  connectWallet: document.querySelector("#connectWallet"),
  networkBadge: document.querySelector("#networkBadge"),
  walletMetric: document.querySelector("#walletMetric"),
  contractMetric: document.querySelector("#contractMetric"),
  contractAddress: document.querySelector("#contractAddress"),
  saveContract: document.querySelector("#saveContract"),
  logOutput: document.querySelector("#logOutput"),
  clearLog: document.querySelector("#clearLog"),
  scheduleReadout: document.querySelector("#scheduleReadout"),
};

let browserProvider;
let signer;
let walletAddress;

function shorten(value) {
  if (!value || value.length < 12) return value || "";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function log(message, payload) {
  const stamp = new Date().toLocaleTimeString();
  const detail = payload ? `\n${JSON.stringify(payload, (_key, value) => (
    typeof value === "bigint" ? value.toString() : value
  ), 2)}` : "";
  els.logOutput.textContent = `[${stamp}] ${message}${detail}\n\n${els.logOutput.textContent}`;
}

function setBadge(text, ready = false) {
  els.networkBadge.textContent = text;
  els.networkBadge.classList.toggle("ready", ready);
}

function savedContract() {
  return localStorage.getItem("mantleAgentAutopayContract") || config.contractAddress || "";
}

function setContractAddress(value) {
  const address = value.trim();
  if (address && !ethers.isAddress(address)) {
    throw new Error("Contract address is not a valid EVM address.");
  }
  localStorage.setItem("mantleAgentAutopayContract", address);
  els.contractAddress.value = address;
  els.contractMetric.textContent = address ? shorten(address) : "Not set";
}

function requireContractAddress() {
  const address = savedContract();
  if (!ethers.isAddress(address)) {
    throw new Error("Save the deployed MantleAgentAutopay contract address first.");
  }
  return address;
}

async function ensureWallet() {
  if (!window.ethereum) {
    throw new Error("No injected wallet found.");
  }
  browserProvider = browserProvider || new ethers.BrowserProvider(window.ethereum);
  const network = await browserProvider.getNetwork();
  if (network.chainId !== 5000n) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: config.chainId }],
      });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [config],
      });
    }
    browserProvider = new ethers.BrowserProvider(window.ethereum);
  }
  signer = await browserProvider.getSigner();
  walletAddress = await signer.getAddress();
  els.walletMetric.textContent = shorten(walletAddress);
  els.connectWallet.textContent = shorten(walletAddress);
  setBadge("Mantle connected", true);
  return signer;
}

function contractWithSigner() {
  return new ethers.Contract(requireContractAddress(), ABI, signer);
}

function contractWithProvider() {
  if (!window.ethereum) {
    throw new Error("Connect a wallet to read through its Mantle provider.");
  }
  browserProvider = browserProvider || new ethers.BrowserProvider(window.ethereum);
  return new ethers.Contract(requireContractAddress(), ABI, browserProvider);
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function positiveAmount(value, label) {
  if (!value || Number(value) <= 0) throw new Error(`${label} must be greater than zero.`);
  return ethers.parseEther(value);
}

function positiveInt(value, label) {
  if (!/^\d+$/.test(value || "") || Number(value) <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return BigInt(value);
}

async function sendAndReport(label, txPromise) {
  const tx = await txPromise;
  log(`${label} submitted`, { hash: tx.hash });
  const receipt = await tx.wait();
  log(`${label} confirmed`, {
    hash: receipt.hash,
    blockNumber: receipt.blockNumber,
    explorer: `${config.blockExplorerUrls[0]}/tx/${receipt.hash}`,
  });
}

async function createSchedule(event) {
  event.preventDefault();
  await ensureWallet();
  const values = formValues(event.currentTarget);
  const amount = positiveAmount(values.amount, "Amount");
  const payments = positiveInt(values.payments, "Payments");
  const periodDays = positiveInt(values.periodDays, "Period days");
  const funded = values.fund ? positiveAmount(values.fund, "Fund now") : amount * payments;
  const agent = ethers.getAddress(values.agent);
  const periodSeconds = periodDays * 86400n;
  const contract = contractWithSigner();

  await sendAndReport(
    "Schedule",
    contract.createNativeSchedule(agent, amount, 0, periodSeconds, payments, values.metadataURI || "", { value: funded }),
  );
}

async function createMilestone(event) {
  event.preventDefault();
  await ensureWallet();
  const values = formValues(event.currentTarget);
  const amount = positiveAmount(values.amount, "Amount");
  const agent = ethers.getAddress(values.agent);
  const workHash = /^0x[0-9a-fA-F]{64}$/.test(values.work)
    ? values.work
    : ethers.keccak256(ethers.toUtf8Bytes(values.work));
  const contract = contractWithSigner();

  await sendAndReport(
    "Milestone",
    contract.createNativeMilestone(agent, workHash, values.metadataURI || "", { value: amount }),
  );
}

async function claimSchedule(event) {
  event.preventDefault();
  await ensureWallet();
  const { scheduleId } = formValues(event.currentTarget);
  await sendAndReport("Claim", contractWithSigner().claimSchedule(positiveInt(scheduleId, "Schedule ID")));
}

async function cancelSchedule(event) {
  event.preventDefault();
  await ensureWallet();
  const { scheduleId } = formValues(event.currentTarget);
  await sendAndReport("Schedule cancellation", contractWithSigner().cancelSchedule(positiveInt(scheduleId, "Schedule ID")));
}

async function releaseMilestone(event) {
  event.preventDefault();
  await ensureWallet();
  const { milestoneId } = formValues(event.currentTarget);
  await sendAndReport("Milestone release", contractWithSigner().releaseMilestone(positiveInt(milestoneId, "Milestone ID")));
}

async function cancelMilestone(event) {
  event.preventDefault();
  await ensureWallet();
  const { milestoneId } = formValues(event.currentTarget);
  await sendAndReport("Milestone cancellation", contractWithSigner().cancelMilestone(positiveInt(milestoneId, "Milestone ID")));
}

async function inspectSchedule(event) {
  event.preventDefault();
  await ensureWallet();
  const { scheduleId } = formValues(event.currentTarget);
  const id = positiveInt(scheduleId, "Schedule ID");
  const contract = contractWithProvider();
  const [schedule, status] = await Promise.all([
    contract.schedules(id),
    contract.scheduleStatus(id),
  ]);

  const nextClaim = Number(status.nextClaimTime) > 0
    ? new Date(Number(status.nextClaimTime) * 1000).toLocaleString()
    : "Unavailable";

  els.scheduleReadout.innerHTML = `
    <div><span>Agent</span><strong>${shorten(schedule.agent)}</strong></div>
    <div><span>Claimable</span><strong>${ethers.formatEther(status.claimableAmount)} MNT</strong></div>
    <div><span>Remaining</span><strong>${status.remainingPayments.toString()} payments</strong></div>
    <div><span>Balance</span><strong>${ethers.formatEther(schedule.balance)} MNT</strong></div>
    <div><span>Next claim</span><strong>${nextClaim}</strong></div>
    <div><span>Status</span><strong>${schedule.cancelled ? "Cancelled" : status.active ? "Active" : "Inactive"}</strong></div>
  `;

  log("Schedule loaded", {
    scheduleId: id,
    payer: schedule.payer,
    agent: schedule.agent,
    balanceMnt: ethers.formatEther(schedule.balance),
    claimableMnt: ethers.formatEther(status.claimableAmount),
  });
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}`).classList.add("active");
  });
});

els.connectWallet.addEventListener("click", () => ensureWallet().catch((error) => log("Wallet error", { message: error.message })));
els.saveContract.addEventListener("click", () => {
  try {
    setContractAddress(els.contractAddress.value);
    log("Contract address saved", { contract: savedContract() || null });
  } catch (error) {
    log("Contract address error", { message: error.message });
  }
});
els.clearLog.addEventListener("click", () => {
  els.logOutput.textContent = "Ready.";
});

document.querySelector("#scheduleForm").addEventListener("submit", (event) => createSchedule(event).catch((error) => log("Schedule error", { message: error.message })));
document.querySelector("#milestoneForm").addEventListener("submit", (event) => createMilestone(event).catch((error) => log("Milestone error", { message: error.message })));
document.querySelector("#claimForm").addEventListener("submit", (event) => claimSchedule(event).catch((error) => log("Claim error", { message: error.message })));
document.querySelector("#cancelScheduleForm").addEventListener("submit", (event) => cancelSchedule(event).catch((error) => log("Cancel schedule error", { message: error.message })));
document.querySelector("#releaseMilestoneForm").addEventListener("submit", (event) => releaseMilestone(event).catch((error) => log("Release milestone error", { message: error.message })));
document.querySelector("#cancelMilestoneForm").addEventListener("submit", (event) => cancelMilestone(event).catch((error) => log("Cancel milestone error", { message: error.message })));
document.querySelector("#inspectForm").addEventListener("submit", (event) => inspectSchedule(event).catch((error) => log("Inspect error", { message: error.message })));

setContractAddress(savedContract());
setBadge("Wallet disconnected");
