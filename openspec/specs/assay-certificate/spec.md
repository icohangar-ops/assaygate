## ADDED Requirements

### Requirement: Mint an assay certificate

The system SHALL mint an ERC-721 whose stored assay includes shipment id, mine, mineral, origin, grade in basis points, dry weight in kilograms, assay URI, attester, and timestamp. Only an attester MAY mint.

#### Scenario: Attester mints a cobalt shipment

- **WHEN** an attester mints a certificate to the seller with grade 2150, weight 24000, and origin "Lualaba, DRC"
- **THEN** the seller owns token 1 and those three fields are readable

### Requirement: Certificate metadata

The token URI SHALL be a base64 JSON data URI carrying the shipment traits.

#### Scenario: Token URI is on-chain JSON

- **WHEN** token 1 has been minted
- **THEN** tokenURI starts with `data:application/json;base64,`
