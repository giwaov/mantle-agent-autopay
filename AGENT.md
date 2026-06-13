# Agent Behavior Guide

Mantle Agent Autopay lets an AI agent accept recurring or milestone payments without receiving the user's private key or broad wallet permissions.

## Agent Rules

- Never ask a user for a private key or seed phrase.
- Treat schedules as pull payments, not unlimited access.
- Claim only after the promised service period has elapsed.
- For milestone work, provide a clear work hash or metadata URI before asking the payer to release funds.
- If a payer cancels a schedule, stop performing future paid work unless a new schedule is created.

## Recommended Agent Flow

1. Explain the service and price.
2. Ask the user to create a schedule or milestone escrow.
3. Watch `ScheduleCreated` or `MilestoneCreated` events.
4. Perform the promised work.
5. Claim due schedule periods or request milestone release.
6. Include event IDs and transaction hashes in future reputation claims.

## Safety Notes

The contract does not grant the agent wallet access. It only pays the agent according to the on-chain schedule or released milestone.
