# Design: AssayGate MVP

## Context

Portaldot V3 exposes an Ethereum JSON-RPC (`https://test-evm-rpc-v3.portaldot.dev`, chain id `420420777`) in front of pallet-revive. The organiser's Hardhat sample is Solidity 0.8.24. There is no public faucet; hackathon tPOTv3 is distributed to a native POT address. The local demo must run without that distribution.

## Goals / Non-Goals

- Goals: mint a certificate, fund escrow, release under the cap, revert over the cap, freeze on dispute, block release while frozen, log the agent's decision.
- Non-goals: oracle grade feeds, NFT custody inside the escrow, a production audit, a cumulative agent budget beyond the tranche cap, mainnet.

## Decisions

- The certificate is the attestation. The escrow holds ERC-20, not the NFT. The seller address fixed at open is the only payee.
- The CFO opens the escrow and sets `trancheCap`. The buyer is the only funder. Allowlisted agents are the only releasers.
- Freeze is checked before the cap, so a dispute blocks every release, including one that would also exceed the cap.
- The agent calls `preview` and does not send a transaction unless the decision is `Ok`. The chain still enforces the same rules if a transaction is sent anyway.
- Settlement token is `MockUSD` (oUSD, 6 decimals), deployed with the escrow. Gas on Portaldot is tPOTv3 (14 decimals) and is separate.
- Local signers are Hardhat's public mnemonic and are refused by the desk UI unless chain id is 31337.

## Risks

- pallet-revive is not stock Ethereum. A testnet deploy can fail even when Hardhat tests pass. The README says to treat the first testnet transaction as a probe.
- Repeating under-cap tranches can draw the full escrow. The freeze is the stop. A cumulative CFO budget is a follow-on, not this MVP.
- Not audited. Do not escrow real offtake money.

## Migration Plan

- Local: `npm test`, `npm run demo`, then the desk against `npm run chain`.
- Testnet: map the deployer H160 through `reviveApi.accountId`, fund tPOTv3, `npm run deploy:portaldot`, paste address and tx hash into the DoraHacks checklist.
