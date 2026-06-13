$ErrorActionPreference = "Stop"

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  forge build
  forge test -vv
  node mantle-agent-autopay.mjs help
  node mantle-agent-autopay.mjs schedule --payer 0x0000000000000000000000000000000000000001 --agent 0x0000000000000000000000000000000000000002 --amount 1 --period-days 7 --payments 4
  node mantle-agent-autopay.mjs milestone --payer 0x0000000000000000000000000000000000000001 --agent 0x0000000000000000000000000000000000000002 --amount 5 --work-hash "demo work"
} finally {
  Pop-Location
}
