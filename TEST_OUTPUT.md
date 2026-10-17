# Test output

Recorded 17 Oct 2026 in this workspace. Both commands exited 0.

## `npx hardhat test`

```


  AssayGate
    ✔ mints an assay certificate with grade, weight, and origin (355ms)
    ✔ funds an escrow against the certificate
    ✔ allowlisted agent release under the CFO cap succeeds
    ✔ agent release over the CFO cap reverts
    ✔ arbiter dispute freezes the escrow
    ✔ a freeze blocks agent release
    ✔ a caller who is not on the agent allowlist cannot release
    ✔ CFO unfreeze clears the dispute and a later under-cap release succeeds


  8 passing (425ms)
```

8 tests passed. The names match the MVP checks: mint, fund, release under the cap, release over the cap reverts, dispute freeze, freeze blocks release. Two extra tests cover the agent allowlist and CFO unfreeze.

## `npx hardhat run scripts/demo.ts`

In-process Hardhat chain. No Portaldot faucet. The agent releases 15,000 oUSD, refuses 25,000, and holds after the grade dispute. The chain reverts match `ExceedsTrancheCap` and `FrozenByDispute`.

```
[demo] deploy AssayCertificate, MockUSD (oUSD), AssayEscrow
[demo] mint certificate CO-LUAL-2026-014 grade=2150bps weight=24000kg origin=Lualaba, DRC
[demo] certificate #1 owner=0x90F79bf6EB2c4f870365E785982E1f101E93b906 mintTx=0x5be9316c3349a599a29265489c89b6b7e4b8b9216984c72dd805386c73ccf74f
[demo] CFO opens escrow cap=20000 oUSD seller=Lualaba Concentrate SPRL
[demo] escrow #1 openTx=0x51dbfaed0abd72c4530f3b5f986bedeb15dbf2f1803df2be83ea75f7c69bef6e
[demo] buyer Northshore Metals BV funds 100000 oUSD
[demo] funded tx=0x92ec1bf400713b694b8eeb90c0f82d5a5e693b0b266c8f8e6d92d2249dffd4ff
[demo] agent releases a tranche under the cap
[assaygate-agent] 2026-10-17T01:00:37.928Z escrow=1 agent=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 amount=15000000000 decision=RELEASE reason=within_cfo_cap cap=20000000000 remaining=100000000000 frozen=false
[assaygate-agent] 2026-10-17T01:00:37.930Z sent release tx=0x50beb4245b7c8a0bf092dace85fe60f53f78c68ba1a0933d5c3436f3fd20a6e1 block=12
[demo] agent considers a draw above the cap and must refuse
[assaygate-agent] 2026-10-17T01:00:37.932Z escrow=1 agent=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 amount=25000000000 decision=REJECT reason=exceeds_tranche_cap cap=20000000000 remaining=85000000000 frozen=false
[demo] chain reverted over-cap release: VM Exception while processing transaction: reverted with custom error 'ExceedsTrancheCap(25000000000, 20000000000)'
[demo] arbiter freezes the escrow on a grade dispute
[demo] frozen tx=0x48f33a073345ce43cd9a7af7853b9d3616e0ad23d4c42b1361a1493fd0d4ce9d
[demo] agent monitors the frozen shipment and holds
[assaygate-agent] 2026-10-17T01:00:37.939Z escrow=1 agent=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 amount=15000000000 decision=HOLD reason=dispute_freeze cap=20000000000 remaining=85000000000 frozen=true freezeReason="Buyer lab re-assay 19.10% Co versus certificate 21.50% Co. Provisional payment frozen pending umpire assay."
[demo] chain reverted frozen release: VM Exception while processing transaction: reverted with custom error 'FrozenByDispute("Buyer lab re-assay 19.10% Co versus certificate 21.50% Co. Provisional payment frozen pending umpire assay.")'
[demo] done funded=100000.0 released=15000.0 frozen=true
[demo] DEMO OK
```
