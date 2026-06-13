# Deployment Runbook

## Current Mantle Mainnet Deployment

```text
Contract: 0xC659381Db77138942D43F8C6f2814Fb0770eAc57
Deployer: 0x28abA2DFcf42eAdfEe60CeBFA650aC7184652424
Tx:       0x2d5ef10af1313f389250b04f8e3d26d5ff9edeb8b150c7b0c44b99e1d5948e95
Chain:    Mantle Mainnet, chain ID 5000
```

## 1. Verify Locally

```powershell
cd C:\Users\DELL\aibtc-godmode\submissions\mantle-agent-autopay
.\script\verify-local.ps1
```

Expected result:

```text
Compiler run successful
6 tests passed, 0 failed
```

## 2. Check Mantle Mainnet

```powershell
node mantle-agent-autopay.mjs doctor
```

Expected network:

```text
Mantle Mainnet
chainId 5000
```

## 3. Deploy

Set a funded deployer key locally. Do not commit it.

```powershell
$env:MANTLE_DEPLOYER_PRIVATE_KEY="0x..."
.\script\deploy-mainnet.ps1
```

The deploy command returns JSON with:

- `contract`
- `txHash`
- `deployer`
- `chainId`

## 4. Configure Frontend

Open:

```text
frontend/config.js
```

Set:

```js
contractAddress: "0xDEPLOYED_CONTRACT"
```

The frontend also lets a judge paste and save the address in-browser.

## 5. Demo Smoke Test

1. Open `frontend/index.html`.
2. Connect wallet.
3. Confirm the wallet switches to Mantle.
4. Create a small schedule.
5. Inspect schedule ID `1`.
6. Claim due payment or cancel unused funds.

For a real mainnet demo, use a tiny MNT amount such as `0.001`.
