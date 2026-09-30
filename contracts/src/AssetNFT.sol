// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IdentityAccessRegistry} from "./IdentityAccessRegistry.sol";

/// @notice Restricted ERC-721: ownership represents a stable identity, not its controller.
contract AssetNFT is ERC721, ReentrancyGuard, EIP712 {
    IdentityAccessRegistry public immutable registry;
    bytes32 public immutable scope;
    uint256 public nextTokenId = 1;
    uint256 public nextRequestId = 1;
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Handover(uint256 requestId,uint256 tokenId,address from,address to,uint64 bindingVersion,bytes32 nonce,bytes32 evidence,uint64 issuedAt,uint64 deadline)"
    );

    struct Asset {
        bytes32 commitment;
        bytes32 metadataHash;
        bytes32 binding;
        uint64 bindingVersion;
        uint64 policyVersion;
        uint8 status; // 1 active, 2 suspended, 3 retired
        bool managerRequired;
    }

    struct Request {
        uint256 tokenId;
        address from;
        address to;
        address fromController;
        address toController;
        address manager;
        address managerController;
        uint256 fromChanged;
        uint256 toChanged;
        uint256 managerChanged;
        uint64 fromVersion;
        uint64 toVersion;
        uint64 managerVersion;
        uint64 registryVersion;
        uint64 policyVersion;
        uint64 deadline;
        uint8 state; // 1 pending, 2 completed, 3 cancelled
    }

    struct Attestation {
        bytes32 nonce;
        bytes32 evidence;
        uint64 issuedAt;
        uint64 deadline;
        address verifier;
        bytes signature;
    }
    mapping(uint256 => Asset) public assets;
    mapping(uint256 => Request) private _requests;
    mapping(uint256 => uint256) public pendingRequest;
    mapping(bytes32 => bool) public registeredCommitment;
    mapping(bytes32 => bool) public registeredBinding;
    mapping(address => bool) public verifiers;
    mapping(bytes32 => bool) public usedAttestation;
    mapping(uint256 => string) private _uris;
    uint256 private _permittedToken;
    address private _permittedRecipient;
    error Unauthorized();
    error InvalidInput();
    error InvalidRequest();
    error PolicyChanged();
    error UseHandover();
    error InvalidEvidence();
    event AssetIssued(
        uint256 indexed tokenId, address indexed identity, bytes32 indexed commitment, bytes32 metadataHash
    );
    event AssetPolicyChanged(
        uint256 indexed tokenId, uint8 status, bool managerRequired, uint64 version, bytes32 reason
    );
    event BindingRegistered(uint256 indexed tokenId, bytes32 indexed binding, uint64 version);
    event VerifierChanged(address indexed verifier, bool allowed);
    event HandoverRequested(
        uint256 indexed requestId, uint256 indexed tokenId, address indexed from, address to, uint64 deadline
    );
    event HandoverApproved(uint256 indexed requestId, address indexed manager);
    event HandoverCancelled(uint256 indexed requestId);
    event HandoverCompleted(
        uint256 indexed requestId,
        uint256 indexed tokenId,
        address indexed from,
        address to,
        uint64 policyVersion,
        bytes32 evidence
    );

    constructor(IdentityAccessRegistry accessRegistry)
        ERC721("Bharat Vault Asset", "BVA")
        EIP712("BharatVaultHandover", "1")
    {
        registry = accessRegistry;
        scope = accessRegistry.organization();
    }
    modifier onlyAdmin(address actor) {
        if (!registry.isAdmin(actor, msg.sender)) revert Unauthorized();
        _;
    }

    function _authorize(address identity, uint8 action) private view {
        if (registry.controller(identity) != msg.sender || !registry.can(identity, action, scope)) {
            revert Unauthorized();
        }
    }

    function mintAsset(
        address actor,
        address to,
        bytes32 commitment,
        bytes32 metadataHash,
        string calldata uri,
        bool managerRequired
    ) external nonReentrant onlyAdmin(actor) returns (uint256 tokenId) {
        if (!registry.active(to) || commitment == 0 || metadataHash == 0 || registeredCommitment[commitment]) revert InvalidInput();
        bytes memory value = bytes(uri);
        if (value.length < 8 || value.length > 200 || bytes7(value) != bytes7("ipfs://")) revert InvalidInput();
        registeredCommitment[commitment] = true;
        tokenId = nextTokenId++;
        assets[tokenId] = Asset(commitment, metadataHash, 0, 0, 1, 1, managerRequired);
        _uris[tokenId] = uri;
        _permittedToken = tokenId;
        _permittedRecipient = to;
        _safeMint(to, tokenId);
        emit AssetIssued(tokenId, to, commitment, metadataHash);
    }

    function setAssetPolicy(address actor, uint256 tokenId, uint8 status, bool managerRequired, bytes32 reason)
        external
        nonReentrant
        onlyAdmin(actor)
    {
        _requireOwned(tokenId);
        Asset storage asset = assets[tokenId];
        if (asset.status == 3 || status < 1 || status > 3 || reason == 0) revert InvalidInput();
        asset.status = status;
        asset.managerRequired = managerRequired;
        emit AssetPolicyChanged(tokenId, status, managerRequired, ++asset.policyVersion, reason);
    }

    function registerBinding(address actor, uint256 tokenId, bytes32 binding) external nonReentrant onlyAdmin(actor) {
        _requireOwned(tokenId);
        Asset storage asset = assets[tokenId];
        if (asset.status != 1 || binding == 0 || registeredBinding[binding]) revert InvalidInput();
        registeredBinding[binding] = true;
        asset.binding = binding;
        ++asset.bindingVersion;
        ++asset.policyVersion;
        emit BindingRegistered(tokenId, binding, asset.bindingVersion);
    }

    function setVerifier(address actor, address verifier, bool allowed) external onlyAdmin(actor) {
        if (verifier == address(0)) revert InvalidInput();
        verifiers[verifier] = allowed;
        emit VerifierChanged(verifier, allowed);
    }

    function requestHandover(uint256 tokenId, address to, uint64 deadline)
        external
        nonReentrant
        returns (uint256 requestId)
    {
        address from = ownerOf(tokenId);
        _authorize(from, registry.REQUEST());
        if (
            !registry.can(to, registry.ACCEPT(), scope) || to == from || assets[tokenId].status != 1
                || deadline <= block.timestamp || deadline > block.timestamp + 7 days
        ) revert InvalidInput();
        uint256 old = pendingRequest[tokenId];
        if (old != 0 && _requests[old].state == 1) {
            _requests[old].state = 3;
            emit HandoverCancelled(old);
        }
        requestId = nextRequestId++;
        Request storage r = _requests[requestId];
        r.tokenId = tokenId;
        r.from = from;
        r.to = to;
        r.fromController = registry.controller(from);
        r.toController = registry.controller(to);
        r.fromChanged = registry.didRegistry().changed(from);
        r.toChanged = registry.didRegistry().changed(to);
        // ERC-1056 records a block number, not a rotation counter. Waiting one
        // block prevents rotate-away/rotate-back in the same block reviving intent.
        if (r.fromChanged >= block.number || r.toChanged >= block.number) revert PolicyChanged();
        r.fromVersion = registry.membershipVersion(from);
        r.toVersion = registry.membershipVersion(to);
        r.registryVersion = registry.policyVersion();
        r.policyVersion = assets[tokenId].policyVersion;
        r.deadline = deadline;
        r.state = 1;
        pendingRequest[tokenId] = requestId;
        emit HandoverRequested(requestId, tokenId, from, to, deadline);
    }

    function getRequest(uint256 requestId) external view returns (Request memory) {
        return _requests[requestId];
    }

    function _checkRequest(uint256 requestId) private view {
        Request storage r = _requests[requestId];
        if (
            r.state != 1 || r.deadline <= block.timestamp || pendingRequest[r.tokenId] != requestId
                || ownerOf(r.tokenId) != r.from
        ) revert InvalidRequest();
        if (
            assets[r.tokenId].status != 1 || r.policyVersion != assets[r.tokenId].policyVersion
                || r.registryVersion != registry.policyVersion() || r.fromController != registry.controller(r.from)
                || r.toController != registry.controller(r.to)
                || r.fromChanged != registry.didRegistry().changed(r.from)
                || r.toChanged != registry.didRegistry().changed(r.to)
                || r.fromVersion != registry.membershipVersion(r.from)
                || r.toVersion != registry.membershipVersion(r.to) || !registry.can(r.from, registry.REQUEST(), scope)
                || !registry.can(r.to, registry.ACCEPT(), scope)
        ) revert PolicyChanged();
    }

    function approveHandover(address manager, uint256 requestId) external nonReentrant {
        _authorize(manager, registry.APPROVE());
        _checkRequest(requestId);
        Request storage r = _requests[requestId];
        r.manager = manager;
        r.managerController = msg.sender;
        r.managerChanged = registry.didRegistry().changed(manager);
        if (r.managerChanged >= block.number) revert PolicyChanged();
        r.managerVersion = registry.membershipVersion(manager);
        emit HandoverApproved(requestId, manager);
    }

    function cancelHandover(uint256 requestId) external nonReentrant {
        Request storage r = _requests[requestId];
        if (r.state != 1 || (msg.sender != registry.controller(r.from) && msg.sender != registry.controller(r.to))) {
            revert Unauthorized();
        }
        r.state = 3;
        delete pendingRequest[r.tokenId];
        emit HandoverCancelled(requestId);
    }

    function attestationDigest(uint256 requestId, Attestation calldata proof) public view returns (bytes32) {
        Request storage r = _requests[requestId];
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    requestId,
                    r.tokenId,
                    r.from,
                    r.to,
                    assets[r.tokenId].bindingVersion,
                    proof.nonce,
                    proof.evidence,
                    proof.issuedAt,
                    proof.deadline
                )
            )
        );
    }

    function acceptHandover(uint256 requestId, Attestation calldata proof) external nonReentrant {
        _checkRequest(requestId);
        Request storage r = _requests[requestId];
        _authorize(r.to, registry.ACCEPT());
        Asset storage asset = assets[r.tokenId];
        if (
            asset.managerRequired
                && (!registry.can(r.manager, registry.APPROVE(), scope)
                    || r.managerController != registry.controller(r.manager)
                    || r.managerVersion != registry.membershipVersion(r.manager)
                    || r.managerChanged != registry.didRegistry().changed(r.manager))
        ) revert PolicyChanged();
        bytes32 evidence = bytes32(0);
        if (asset.binding != 0) {
            if (
                !verifiers[proof.verifier] || proof.nonce == 0 || proof.evidence == 0 || usedAttestation[proof.nonce]
                    || proof.issuedAt > block.timestamp || proof.deadline <= block.timestamp
                    || proof.deadline > proof.issuedAt + 5 minutes || proof.deadline > r.deadline
                    || !SignatureChecker.isValidSignatureNow(
                        proof.verifier, attestationDigest(requestId, proof), proof.signature
                    )
            ) revert InvalidEvidence();
            usedAttestation[proof.nonce] = true;
            evidence = proof.evidence;
        }
        r.state = 2;
        delete pendingRequest[r.tokenId];
        _permittedToken = r.tokenId;
        _permittedRecipient = r.to;
        _safeTransfer(r.from, r.to, r.tokenId, "");
        emit HandoverCompleted(requestId, r.tokenId, r.from, r.to, asset.policyVersion, evidence);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _uris[tokenId];
    }

    function approve(address, uint256) public pure override {
        revert UseHandover();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert UseHandover();
    }

    function transferFrom(address, address, uint256) public pure override {
        revert UseHandover();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert UseHandover();
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (
            _permittedToken != tokenId || _permittedRecipient != to || to == address(0) || auth != address(0)
                || !registry.active(to) || assets[tokenId].status != 1
        ) revert UseHandover();
        // Consume before receiver callbacks; there is no general transfer window.
        delete _permittedToken;
        delete _permittedRecipient;
        return super._update(to, tokenId, auth);
    }
}
