# AssayGate — 3 minute demo script

Record the local desk at `http://127.0.0.1:43123` after `npm run chain` and `npm run deploy:local`. Keep the agent log and the on-chain history visible. Speak the lines in quotes. Cut pauses. Target 3:00.

Lot on screen: **CO-LUAL-2026-014**, cobalt hydroxide, Kolwezi South, 21.50% Co, 24,000 kg, buyer Northshore Metals BV, seller Lualaba Concentrate SPRL. Escrow 100,000 oUSD. CFO tranche cap 20,000 oUSD.

## 0:00–0:30 — The squeeze

On screen: the desk, certificate still stamped “Awaiting assay”, escrow at zero.

Narration:

> "A junior miner ships concentrate against an offtake and then waits. The buyer holds the provisional payment until someone argues about grade. AssayGate puts that shipment on Portaldot as an assay certificate, parks the buyer's payment in escrow, and lets an agent draw small tranches. The draw cannot exceed a cap the CFO set. If the grade is disputed, the funds freeze."

## 0:30–1:05 — Mint the certificate

On screen: click **1. Mint assay certificate**. The paper flips to Certified. Point at grade 21.50% Co, dry weight 24,000 kg, origin Lualaba, DRC, and the certificate address at the bottom.

Narration:

> "The lab attester mints an ERC-721 for lot CO-LUAL-2026-014. Grade, weight, and origin sit on the token. The URI points at the assay file. This is the shipment, not a picture of it."

## 1:05–1:35 — Fund the escrow

On screen: click **2. CFO opens escrow, cap 20,000**, then **3. Buyer funds 100,000 oUSD**. Point at Funded 100,000.00 and Tranche cap 20,000.00.

Narration:

> "The CFO opens the escrow and stamps the cap: twenty thousand dollars a draw. Northshore funds one hundred thousand of provisional payment. The seller is the only payee. The agent is on an allowlist. Nobody else can release."

## 1:35–2:15 — Agent release, then the cap

On screen: click **4. Agent releases 15,000**. Read the log line `decision=RELEASE reason=within_cfo_cap` and the transaction hash. Then click **5. Agent attempts 25,000**. Read `decision=REJECT reason=exceeds_tranche_cap` and the line `chain reverted: ExceedsTrancheCap`. Point at Released staying 15,000.00.

Narration:

> "The agent reads the escrow before it sends. Fifteen thousand is inside the cap, so it releases and the seller is paid. Twenty-five thousand is over the cap. The agent refuses, and the chain would revert if it sent the transaction anyway. The extra ten thousand never moves."

## 2:15–2:45 — Grade dispute

On screen: click **6. Arbiter files grade dispute**. The stamp changes to Disputed. Read the reason: buyer lab 19.10% versus certificate 21.50%. Click **4. Agent checks the frozen escrow**. Read `decision=HOLD reason=dispute_freeze` and `FrozenByDispute`.

Narration:

> "The buyer's lab comes back at 19.10 percent cobalt, not 21.50. The arbiter freezes the escrow. The agent holds. A release that was fine a moment ago now reverts. The remaining eighty-five thousand stays put until the CFO or the arbiter clears it."

## 2:45–3:00 — Where it goes

On screen: scroll to the contract addresses. Leave the Portaldot testnet line visible (chain 420420777). Do not pretend a local hash is the testnet deploy.

Narration:

> "Locally this runs on Hardhat, so judges can click it without a faucet. The same contracts deploy to Portaldot V3 testnet, chain 420420777, once tPOTv3 is on the deployer. Contract address and deploy hash are in the submission after that transaction. Next is a cumulative CFO budget and an umpire-assay path to unfreeze."

Stop at 3:00. If you still have the CFO clear-freeze control, do not spend the ending on it. One sentence in the roadmap is enough.
