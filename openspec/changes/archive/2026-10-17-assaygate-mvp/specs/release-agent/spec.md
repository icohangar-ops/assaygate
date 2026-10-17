## ADDED Requirements

### Requirement: Agent decides before it sends

The agent SHALL read the escrow preview before sending a release. It SHALL send a transaction only when the preview is Ok. It SHALL log the decision, the amount, the cap, the remaining balance, and the freeze flag.

#### Scenario: Under the cap

- **WHEN** the preview is Ok
- **THEN** the agent logs RELEASE with reason within_cfo_cap and submits the release

#### Scenario: Over the cap

- **WHEN** the preview is ExceedsTrancheCap
- **THEN** the agent logs REJECT with reason exceeds_tranche_cap and does not submit

#### Scenario: Dispute freeze

- **WHEN** the preview is Frozen
- **THEN** the agent logs HOLD with reason dispute_freeze and does not submit
