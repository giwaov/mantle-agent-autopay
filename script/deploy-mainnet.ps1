$ErrorActionPreference = "Stop"

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  forge build
  node mantle-agent-autopay.mjs doctor
  node mantle-agent-autopay.mjs deploy --broadcast
} finally {
  Pop-Location
}
