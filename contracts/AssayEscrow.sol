// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title AssayEscrow
/// @notice Holds a buyer's ERC-20 provisional payment against an assay certificate.
///         An allowlisted agent may release tranches to the seller up to the CFO tranche cap.
///         The CFO or the arbiter can freeze the escrow on a grade dispute. While frozen, release reverts.
contract AssayEscrow is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant CFO_ROLE = keccak256("CFO_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

    enum Decision {
        Ok,
        UnknownEscrow,
        ZeroAmount,
        Frozen,
        ExceedsTrancheCap,
        InsufficientBalance,
        NotAllowlisted
    }

    struct Escrow {
        uint256 certId;
        address buyer;
        address seller;
        IERC20 token;
        uint256 funded;
        uint256 released;
        uint256 trancheCap;
        bool frozen;
        string freezeReason;
        address frozenBy;
        uint64 frozenAt;
        bool exists;
    }

    IERC721 public immutable certificate;
    uint256 public nextEscrowId = 1;

    mapping(uint256 => Escrow) private _escrows;
    mapping(address => bool) public agentAllowlist;

    error ZeroAddress();
    error ZeroCap();
    error UnknownCertificate();
    error UnknownEscrow(uint256 escrowId);
    error NotBuyer();
    error NotAgent(address agent);
    error ExceedsTrancheCap(uint256 amount, uint256 cap);
    error InsufficientBalance(uint256 amount, uint256 available);
    error FrozenByDispute(string reason);
    error ZeroAmount();
    error EmptyReason();
    error NotGuardian();
    error AlreadyFrozen();
    error NotFrozen();

    event EscrowOpened(
        uint256 indexed escrowId,
        uint256 indexed certId,
        address indexed buyer,
        address seller,
        address token,
        uint256 trancheCap
    );
    event EscrowFunded(uint256 indexed escrowId, address indexed from, uint256 amount, uint256 funded);
    event TrancheReleased(
        uint256 indexed escrowId, address indexed agent, address indexed seller, uint256 amount, uint256 released
    );
    event TrancheCapUpdated(uint256 indexed escrowId, uint256 trancheCap);
    event AgentUpdated(address indexed agent, bool allowed);
    event EscrowFrozen(uint256 indexed escrowId, address indexed by, string reason);
    event EscrowUnfrozen(uint256 indexed escrowId, address indexed by);

    constructor(address admin, address certificate_) {
        if (admin == address(0) || certificate_ == address(0)) revert ZeroAddress();
        certificate = IERC721(certificate_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CFO_ROLE, admin);
        _grantRole(ARBITER_ROLE, admin);
    }

    /// @notice CFO opens the escrow and stamps the per-tranche cap the agent must respect.
    ///         The seller is the only payee. That is the payment allowlist for this shipment.
    function openEscrow(
        uint256 certId,
        address buyer,
        address seller,
        address token,
        uint256 trancheCap
    ) external onlyRole(CFO_ROLE) returns (uint256 escrowId) {
        if (buyer == address(0) || seller == address(0) || token == address(0)) revert ZeroAddress();
        if (trancheCap == 0) revert ZeroCap();
        try certificate.ownerOf(certId) returns (address) {}
        catch {
            revert UnknownCertificate();
        }

        escrowId = nextEscrowId++;
        _escrows[escrowId] = Escrow({
            certId: certId,
            buyer: buyer,
            seller: seller,
            token: IERC20(token),
            funded: 0,
            released: 0,
            trancheCap: trancheCap,
            frozen: false,
            freezeReason: "",
            frozenBy: address(0),
            frozenAt: 0,
            exists: true
        });
        emit EscrowOpened(escrowId, certId, buyer, seller, token, trancheCap);
    }

    function setTrancheCap(uint256 escrowId, uint256 trancheCap) external onlyRole(CFO_ROLE) {
        if (trancheCap == 0) revert ZeroCap();
        Escrow storage escrow = _get(escrowId);
        escrow.trancheCap = trancheCap;
        emit TrancheCapUpdated(escrowId, trancheCap);
    }

    function setAgent(address agent, bool allowed) external onlyRole(CFO_ROLE) {
        if (agent == address(0)) revert ZeroAddress();
        agentAllowlist[agent] = allowed;
        emit AgentUpdated(agent, allowed);
    }

    function fund(uint256 escrowId, uint256 amount) external nonReentrant {
        Escrow storage escrow = _get(escrowId);
        if (msg.sender != escrow.buyer) revert NotBuyer();
        if (amount == 0) revert ZeroAmount();
        if (escrow.frozen) revert FrozenByDispute(escrow.freezeReason);
        escrow.funded += amount;
        escrow.token.safeTransferFrom(msg.sender, address(this), amount);
        emit EscrowFunded(escrowId, msg.sender, amount, escrow.funded);
    }

    /// @notice Allowlisted agent releases one tranche to the seller.
    ///         Reverts if the amount is above the CFO cap, the escrow is frozen, or funds are short.
    function release(uint256 escrowId, uint256 amount) external nonReentrant {
        Escrow storage escrow = _get(escrowId);
        if (!agentAllowlist[msg.sender]) revert NotAgent(msg.sender);
        if (amount == 0) revert ZeroAmount();
        if (escrow.frozen) revert FrozenByDispute(escrow.freezeReason);
        if (amount > escrow.trancheCap) revert ExceedsTrancheCap(amount, escrow.trancheCap);
        uint256 available = escrow.funded - escrow.released;
        if (amount > available) revert InsufficientBalance(amount, available);

        escrow.released += amount;
        escrow.token.safeTransfer(escrow.seller, amount);
        emit TrancheReleased(escrowId, msg.sender, escrow.seller, amount, escrow.released);
    }

    function freeze(uint256 escrowId, string calldata reason) external {
        if (!hasRole(CFO_ROLE, msg.sender) && !hasRole(ARBITER_ROLE, msg.sender)) revert NotGuardian();
        if (bytes(reason).length == 0) revert EmptyReason();
        Escrow storage escrow = _get(escrowId);
        if (escrow.frozen) revert AlreadyFrozen();
        escrow.frozen = true;
        escrow.freezeReason = reason;
        escrow.frozenBy = msg.sender;
        escrow.frozenAt = uint64(block.timestamp);
        emit EscrowFrozen(escrowId, msg.sender, reason);
    }

    function unfreeze(uint256 escrowId) external {
        if (!hasRole(CFO_ROLE, msg.sender) && !hasRole(ARBITER_ROLE, msg.sender)) revert NotGuardian();
        Escrow storage escrow = _get(escrowId);
        if (!escrow.frozen) revert NotFrozen();
        escrow.frozen = false;
        escrow.freezeReason = "";
        escrow.frozenBy = address(0);
        escrow.frozenAt = 0;
        emit EscrowUnfrozen(escrowId, msg.sender);
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _get(escrowId);
    }

    /// @notice Read-only decision the agent uses before it sends a transaction.
    function preview(uint256 escrowId, uint256 amount, address agent) external view returns (Decision) {
        if (escrowId == 0 || escrowId >= nextEscrowId || !_escrows[escrowId].exists) {
            return Decision.UnknownEscrow;
        }
        Escrow storage escrow = _escrows[escrowId];
        if (!agentAllowlist[agent]) return Decision.NotAllowlisted;
        if (amount == 0) return Decision.ZeroAmount;
        if (escrow.frozen) return Decision.Frozen;
        if (amount > escrow.trancheCap) return Decision.ExceedsTrancheCap;
        if (amount > escrow.funded - escrow.released) return Decision.InsufficientBalance;
        return Decision.Ok;
    }

    function _get(uint256 escrowId) internal view returns (Escrow storage escrow) {
        escrow = _escrows[escrowId];
        if (!escrow.exists) revert UnknownEscrow(escrowId);
    }
}
