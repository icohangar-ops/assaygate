# Proposal: AssayGate MVP

## Why

Junior miners on offtake contracts wait on provisional payment while grade and weight are argued. AssayGate puts the shipment on Portaldot as an ERC-721 assay certificate, escrows the buyer's ERC-20, and lets an agent draw small tranches only under a CFO cap. A grade dispute freezes the funds.

## What Changes

- `AssayCertificate`: ERC-721 with shipment, mine, mineral, origin, grade (basis points), dry weight, and assay URI.
- `AssayEscrow`: CFO-opened escrow, buyer funding, agent allowlist, per-tranche cap, arbiter/CFO freeze and unfreeze.
- `MockUSD`: six-decimal demo settlement token so the local flow needs no faucet.
- Agent script that reads `preview` and releases only when the decision is within the cap and the escrow is not frozen.
- Local Hardhat demo and a desk UI. Portaldot testnet deploy is configured and does not block the local demo.

## Impact

- New contracts, Hardhat tests, `scripts/agent.ts`, `scripts/demo.ts`, and the Next.js desk.
- Specs: `assay-certificate`, `escrow-guard`, `release-agent`.
