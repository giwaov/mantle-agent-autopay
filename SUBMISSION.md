# DoraHacks Submission Draft

## Project Name

Mantle Agent Autopay

## Mantle Mainnet Contract

```text
0xC659381Db77138942D43F8C6f2814Fb0770eAc57
```

## One-Line Description

Recurring and milestone payments for AI agents on Mantle mainnet.

## Track

Agentic Wallets & Economy

Secondary fit: AI DevTools

## Problem

AI agents can monitor wallets, run research, generate reports, route alerts, operate keepers, and perform useful Web3 tasks. But paying them is still awkward.

Users either send one-off transfers manually, give agents unsafe wallet access, or rely on off-chain invoices. None of these create a clean on-chain record of who paid which agent, for what, and when.

## Solution

Mantle Agent Autopay is a mainnet payment primitive for agent work.

It lets a user fund:

- a recurring payment schedule for an AI agent,
- or a milestone escrow for a one-off deliverable.

Agents can only claim what is due. Payers can cancel unused schedule funds. Every payout emits an on-chain receipt that can become part of the agent's public reputation.

## Why It Is Useful On Mainnet

This is not a demo-only primitive. It can be used immediately for:

- weekly wallet monitoring,
- monthly AI research subscriptions,
- DAO agent retainers,
- keeper and automation services,
- paid agent-to-agent work,
- public reputation based on real payments.

## Core Features

- Native MNT recurring schedules
- ERC20 recurring schedules
- Native MNT milestone escrows
- ERC20 milestone escrows
- Pull-based agent claims
- Payer cancellation and refund of unused schedule funds
- Browser app for mainnet schedule and milestone operation
- Schedule inspection with claimable amount and next claim timing
- On-chain events for payment receipts and agent reputation
- CLI transaction planner for Mantle mainnet

## Technical Architecture

```text
Payer
  |
  | fund schedule or milestone
  v
MantleAgentAutopay contract
  |
  +-- enforces payment amount
  +-- enforces period timing
  +-- holds unused escrow safely
  +-- emits public receipts
  |
  v
AI Agent receives MNT/ERC20 only when due or approved
```

## Main Demo

1. A user funds an AI wallet-monitoring agent for `1 MNT per week` for four weeks.
2. The agent performs the monitoring service.
3. After each week, the agent calls `claimSchedule`.
4. The contract pays only one due period at a time.
5. The user can cancel and recover remaining funds.

## Why It Fits Mantle

Mantle is building a home for AI agents, RWA assets, and on-chain liquidity. Agent economies need payment rails as much as they need models and wallets.

Mantle Agent Autopay turns MNT and Mantle ERC20 tokens into programmable payroll for autonomous services.

## Commands

Build:

```powershell
forge build
```

Test:

```powershell
forge test -vv
```

Check Mantle mainnet:

```powershell
node mantle-agent-autopay.mjs doctor
```

Plan a schedule:

```powershell
node mantle-agent-autopay.mjs schedule --payer 0xPayer --agent 0xAgent --amount 1 --period-days 7 --payments 4
```

Plan a milestone:

```powershell
node mantle-agent-autopay.mjs milestone --payer 0xPayer --agent 0xAgent --amount 5 --work-hash "risk report"
```

Run the frontend:

```text
Open frontend/index.html
```

Deploy:

```powershell
$env:MANTLE_DEPLOYER_PRIVATE_KEY="0x..."
.\script\deploy-mainnet.ps1
```

## What Is Already Built

- Solidity contract
- Foundry tests
- Static browser app
- CLI
- Mainnet RPC doctor check
- Local verification script
- Deployment runbook
- Demo script

## Future Work

- Frontend schedule creator
- Agent profile pages from payment events
- Rating and dispute layer
- Streaming-style partial claims
- Integration with agent job boards and keeper marketplaces
- Optional AI-generated invoices and work summaries stored as metadata
