# Mantle Agent Autopay Skill

## Purpose

Create and manage recurring or milestone payment plans for AI agents on Mantle.

## Commands

```powershell
node mantle-agent-autopay.mjs doctor [--contract <address>]
node mantle-agent-autopay.mjs schedule --payer <address> --agent <address> --amount <amount> --period-days <days> --payments <count> [--token <address|MNT>] [--fund <amount>] [--metadata-uri <uri>] [--contract <address>]
node mantle-agent-autopay.mjs milestone --payer <address> --agent <address> --amount <amount> --work-hash <bytes32|string> [--token <address|MNT>] [--metadata-uri <uri>] [--contract <address>]
node mantle-agent-autopay.mjs prepare-claim --contract <address> --schedule-id <id>
node mantle-agent-autopay.mjs status --contract <address> --schedule-id <id>
```

## Output Contract

All commands return JSON:

```json
{
  "status": "success | blocked | error",
  "action": "schedule",
  "data": {},
  "error": null
}
```

## Safety

This Skill prepares transactions and checks Mantle mainnet connectivity. Deployment and signed transactions require a local wallet key or external wallet confirmation.
