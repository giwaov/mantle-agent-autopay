# Mantle Agent Autopay

**One-sentence pitch:** Recurring and milestone payments for AI agents on Mantle mainnet.

Mantle Agent Autopay is a mainnet payment primitive for the agent economy. Users can fund an AI agent for weekly monitoring, monthly research, automation work, or one-off deliverables without giving the agent wallet access.

## Why It Matters

AI agents are starting to do useful work: monitor wallets, prepare reports, run keepers, answer data questions, and execute approved tasks. The missing piece is boring but important: reliable payment.

This project gives users and teams a simple way to:

- pay an agent on a recurring schedule,
- escrow a milestone bounty for completed work,
- cancel and recover unused funds,
- support native MNT or ERC20 tokens,
- create an on-chain payment history agents can use as reputation.

## Product Surface

Mantle Agent Autopay ships as:

- a Solidity contract for escrowed recurring and milestone payments,
- a browser app for creating and operating payments with a wallet,
- a CLI for transaction planning, mainnet checks, deployment, and schedule inspection,
- a deployment runbook and demo script.

## Mainnet Use Cases

- Weekly wallet monitoring paid in MNT
- Monthly AI research subscriptions
- Agent support retainers for DAOs or small teams
- Milestone payouts for reports, dashboards, or keeper tasks
- Agent reputation from public payment receipts

## Contract

`contracts/MantleAgentAutopay.sol` supports two payment modes:

| Mode | Description |
| --- | --- |
| Schedule | Payer funds recurring payments. Agent claims only periods that are due. |
| Milestone | Payer escrows one payment and releases it when the agent completes work. |

The contract is deliberately non-custodial from the agent side: agents cannot pull more than the schedule allows, and payers can cancel unused schedule funds.

## Quick Start

```powershell
cd C:\Users\DELL\aibtc-godmode\submissions\mantle-agent-autopay
npm install
forge build
forge test -vv
```

Open the app:

```text
frontend/index.html
```

The app supports:

- wallet connection,
- Mantle network switching,
- contract address configuration,
- native MNT schedules,
- native MNT milestones,
- claim/cancel/release actions,
- schedule inspection from mainnet.

Create a local transaction plan for a native MNT schedule:

```powershell
node mantle-agent-autopay.mjs schedule `
  --payer 0x0000000000000000000000000000000000000001 `
  --agent 0x0000000000000000000000000000000000000002 `
  --amount 1 `
  --period-days 7 `
  --payments 4 `
  --metadata-uri ipfs://agent-monitoring-plan
```

Create a milestone escrow plan:

```powershell
node mantle-agent-autopay.mjs milestone `
  --payer 0x0000000000000000000000000000000000000001 `
  --agent 0x0000000000000000000000000000000000000002 `
  --amount 5 `
  --work-hash "June risk report" `
  --metadata-uri ipfs://work-order
```

## Mantle Mainnet

Live deployment:

```text
0xC659381Db77138942D43F8C6f2814Fb0770eAc57
```

Default RPC:

```text
https://rpc.mantle.xyz
```

Expected chain ID:

```text
5000
```

Run a mainnet connectivity check:

```powershell
node mantle-agent-autopay.mjs doctor
```

Inspect a deployed schedule:

```powershell
node mantle-agent-autopay.mjs status --contract 0xAutopayContract --schedule-id 1
```

## Deploy

Set a deployer key in your local shell. Do not commit it.

```powershell
$env:MANTLE_DEPLOYER_PRIVATE_KEY="0x..."
node mantle-agent-autopay.mjs deploy --broadcast
```

## Demo Flow

1. User creates a schedule: `1 MNT / week for 4 weeks`.
2. AI monitoring agent performs the weekly service.
3. Agent calls `claimSchedule` after each period.
4. Payer can cancel and recover unused funds at any time.
5. Events provide a public payment/reputation trail.

## Files

| File | Purpose |
| --- | --- |
| `contracts/MantleAgentAutopay.sol` | Mainnet-ready autopay and milestone contract |
| `abi/MantleAgentAutopay.abi.json` | Canonical contract ABI for frontend integrations |
| `test/MantleAgentAutopay.t.sol` | Foundry tests |
| `frontend/` | Static wallet app for judges and users |
| `mantle-agent-autopay.mjs` | CLI for mainnet checks and transaction planning |
| `DEPLOYMENT.md` | Mainnet deployment runbook |
| `DEMO_SCRIPT.md` | Demo flow for the hackathon video |
| `SUBMISSION.md` | DoraHacks submission draft |
| `AGENT.md` | Agent behavior guide |
