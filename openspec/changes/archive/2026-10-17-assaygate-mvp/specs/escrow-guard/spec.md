## ADDED Requirements

### Requirement: Fund escrow against a certificate

The CFO SHALL open an escrow that references an existing certificate, a buyer, a seller, a payment token, and a non-zero tranche cap. Only the buyer SHALL fund it.

#### Scenario: Buyer funds the provisional payment

- **WHEN** the CFO has opened an escrow and the buyer transfers the funded amount in
- **THEN** the escrow's funded balance equals that amount and the contract holds the tokens

### Requirement: Tranche cap

An allowlisted agent SHALL release a tranche to the seller when the amount is within the cap, the escrow is not frozen, and the remaining balance covers it. A release above the cap SHALL revert and SHALL move no tokens.

#### Scenario: Release under the cap

- **WHEN** an allowlisted agent releases an amount less than or equal to the tranche cap
- **THEN** the seller receives that amount and the released total increases

#### Scenario: Release over the cap

- **WHEN** an allowlisted agent releases an amount greater than the tranche cap
- **THEN** the call reverts with ExceedsTrancheCap and the seller balance is unchanged

### Requirement: Agent allowlist

A caller who is not allowlisted SHALL NOT release.

#### Scenario: Stranger release

- **WHEN** an address outside the allowlist calls release
- **THEN** the call reverts with NotAgent

### Requirement: Dispute freeze

The CFO or the arbiter SHALL freeze an escrow with a non-empty reason, and SHALL unfreeze it. No other role SHALL freeze or unfreeze. While frozen, release SHALL revert and SHALL move no tokens.

#### Scenario: Arbiter freezes

- **WHEN** the arbiter freezes with a grade-dispute reason
- **THEN** the escrow is frozen and stores that reason and the arbiter address

#### Scenario: Freeze blocks release

- **WHEN** the escrow is frozen and the agent releases an amount that would otherwise be inside the cap
- **THEN** the call reverts with FrozenByDispute and the seller balance is unchanged

#### Scenario: Unfreeze restores release

- **WHEN** the CFO unfreezes a frozen escrow and the agent then releases under the cap
- **THEN** the release succeeds
