// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// @title AssayCertificate
/// @notice ERC-721 assay certificate for one critical-minerals shipment.
///         Grade is stored in basis points (2150 = 21.50%). Weight is dry kilograms.
///         Origin, mine, and mineral sit on the token. An assay URI points at the lab PDF (IPFS or sample).
contract AssayCertificate is ERC721, AccessControl {
    bytes32 public constant ATTESTER_ROLE = keccak256("ATTESTER_ROLE");

    struct Assay {
        string shipmentId;
        string mine;
        string mineral;
        string origin;
        uint256 gradeBps;
        uint256 weightKg;
        string assayUri;
        address attester;
        uint64 attestedAt;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Assay) private _assays;

    error BadMetadata();
    error GradeOutOfRange();
    error ZeroWeight();
    error UnknownCertificate(uint256 tokenId);

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed to,
        address indexed attester,
        uint256 gradeBps,
        uint256 weightKg
    );

    constructor(address admin) ERC721("AssayGate Certificate", "ASSAY") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ATTESTER_ROLE, admin);
    }

    function mint(
        address to,
        string calldata shipmentId,
        string calldata mine,
        string calldata mineral,
        string calldata origin,
        uint256 gradeBps,
        uint256 weightKg,
        string calldata assayUri
    ) external onlyRole(ATTESTER_ROLE) returns (uint256 tokenId) {
        if (to == address(0)) revert BadMetadata();
        _bounded(shipmentId, 64);
        _bounded(mine, 64);
        _bounded(mineral, 64);
        _bounded(origin, 64);
        _bounded(assayUri, 128);
        if (gradeBps == 0 || gradeBps > 10_000) revert GradeOutOfRange();
        if (weightKg == 0) revert ZeroWeight();

        tokenId = nextId++;
        _assays[tokenId] = Assay({
            shipmentId: shipmentId,
            mine: mine,
            mineral: mineral,
            origin: origin,
            gradeBps: gradeBps,
            weightKg: weightKg,
            assayUri: assayUri,
            attester: msg.sender,
            attestedAt: uint64(block.timestamp)
        });
        _safeMint(to, tokenId);
        emit CertificateMinted(tokenId, to, msg.sender, gradeBps, weightKg);
    }

    function getAssay(uint256 tokenId) external view returns (Assay memory) {
        _requireKnown(tokenId);
        return _assays[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireKnown(tokenId);
        Assay memory assay = _assays[tokenId];
        string memory json = string.concat(
            '{"name":"Assay Certificate #',
            Strings.toString(tokenId),
            '","description":"AssayGate shipment certificate","attributes":[',
            '{"trait_type":"Shipment","value":"',
            assay.shipmentId,
            '"},{"trait_type":"Mine","value":"',
            assay.mine,
            '"},{"trait_type":"Mineral","value":"',
            assay.mineral,
            '"},{"trait_type":"Origin","value":"',
            assay.origin,
            '"},{"trait_type":"Grade bps","display_type":"number","value":',
            Strings.toString(assay.gradeBps),
            '},{"trait_type":"Weight kg","display_type":"number","value":',
            Strings.toString(assay.weightKg),
            "}]}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _requireKnown(uint256 tokenId) private view {
        if (_ownerOf(tokenId) == address(0)) revert UnknownCertificate(tokenId);
    }

    /// @dev Reject quotes, backslashes, and control bytes so tokenURI stays valid JSON.
    function _bounded(string calldata value, uint256 maxLen) private pure {
        bytes calldata raw = bytes(value);
        if (raw.length == 0 || raw.length > maxLen) revert BadMetadata();
        for (uint256 i = 0; i < raw.length; i++) {
            bytes1 char = raw[i];
            if (char == 0x22 || char == 0x5c || char < 0x20) revert BadMetadata();
        }
    }
}
