# Demo Script

## Opening

Mantle Agent Autopay is payroll for AI agents on Mantle mainnet.

Instead of giving an agent wallet access or paying manually every week, a user funds a schedule or a milestone escrow. The contract enforces timing, limits, refunds, and payment receipts.

## Demo Flow

1. Open the app and connect a wallet.
2. Paste the deployed contract address.
3. Create a schedule:

```text
Agent: demo agent wallet
Amount: 0.001 MNT
Period: 7 days
Payments: 4
Metadata: ipfs://wallet-monitoring-plan
```

4. Show the transaction on Mantle.
5. Inspect the schedule:

```text
Claimable amount
Remaining payments
Balance
Next claim
Status
```

6. Claim the first due payment or cancel the schedule and show the refund.
7. Create a milestone escrow for a one-off agent report.
8. Release the milestone and show the on-chain receipt event.

## Judge Message

This is not a pretend AI agent demo. It is a payment primitive that real AI agents, keepers, research bots, monitoring agents, and agent job boards can use immediately on Mantle mainnet.

The AI can be swapped in above the contract, but the payment rules stay enforced on-chain.
