// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IDIDRegistry {
    function identityOwner(address identity) external view returns (address);
    function changed(address identity) external view returns (uint256);
}

/// @notice One organization, stable identities, and live controller-aware permissions.
contract IdentityAccessRegistry {
    uint8 public constant ADMIN = 1;
    uint8 public constant MANAGER = 2;
    uint8 public constant AUDITOR = 3;
    uint8 public constant USER = 4;
    uint8 public constant REQUEST = 1;
    uint8 public constant ACCEPT = 2;
    uint8 public constant APPROVE = 4;
    uint8 public constant AUDIT = 8;
    uint8 public constant MAX_ROLES = 32;
    IDIDRegistry public immutable didRegistry;
    bytes32 public immutable organization;
    uint256 public adminCount;
    uint64 public policyVersion = 1;
    mapping(address => uint8) public status; // 0 unknown, 1 active, 2 suspended
    mapping(uint8 => uint8) public actions;
    mapping(address => mapping(uint8 => uint64)) public membership;
    mapping(address => uint64) public membershipVersion;
    error Unauthorized();
    error InvalidInput();
    error LastAdmin();
    event IdentityEnrolled(address indexed identity, address indexed controller, bytes32 indexed scope);
    event IdentityStatusChanged(address indexed identity, uint8 status, bytes32 reason);
    event RoleDefined(uint8 indexed role, uint8 actions, uint64 policyVersion);
    event RoleGranted(
        address indexed identity, uint8 indexed role, bytes32 indexed scope, uint64 expiry, uint64 version
    );
    event RoleRevoked(address indexed identity, uint8 indexed role, bytes32 indexed scope, uint64 version);

    constructor(IDIDRegistry registry, bytes32 scope, address initialAdmin) {
        if (address(registry).code.length == 0 || scope == 0 || initialAdmin == address(0)) revert InvalidInput();
        didRegistry = registry;
        organization = scope;
        actions[ADMIN] = REQUEST | ACCEPT | AUDIT;
        actions[MANAGER] = REQUEST | ACCEPT | APPROVE | AUDIT;
        actions[AUDITOR] = REQUEST | ACCEPT | AUDIT;
        actions[USER] = REQUEST | ACCEPT;
        status[initialAdmin] = 1;
        membership[initialAdmin][ADMIN] = type(uint64).max;
        membershipVersion[initialAdmin] = 1;
        adminCount = 1;
        emit IdentityEnrolled(initialAdmin, registry.identityOwner(initialAdmin), scope);
        emit RoleGranted(initialAdmin, ADMIN, scope, type(uint64).max, 1);
    }

    function controller(address identity) public view returns (address) {
        return didRegistry.identityOwner(identity);
    }

    function active(address identity) public view returns (bool) {
        return status[identity] == 1;
    }

    function hasRole(address identity, uint8 role, bytes32 scope) public view returns (bool) {
        return scope == organization && active(identity) && membership[identity][role] > block.timestamp;
    }

    function can(address identity, uint8 action, bytes32 scope) public view returns (bool) {
        if (scope != organization || !active(identity) || action == 0) return false;
        for (uint8 role = 1; role <= MAX_ROLES; ++role) {
            if ((actions[role] & action) == action && membership[identity][role] > block.timestamp) return true;
        }
        return false;
    }

    function isAdmin(address identity, address caller) public view returns (bool) {
        return caller == controller(identity) && hasRole(identity, ADMIN, organization);
    }
    modifier onlyAdmin(address actor) {
        if (!isAdmin(actor, msg.sender)) revert Unauthorized();
        _;
    }

    function enroll(address identity) external {
        if (identity == address(0) || controller(identity) != msg.sender || status[identity] != 0) {
            revert Unauthorized();
        }
        status[identity] = 1;
        emit IdentityEnrolled(identity, msg.sender, organization);
    }

    function setStatus(address actor, address identity, uint8 next, bytes32 reason) external onlyAdmin(actor) {
        if (status[identity] == 0 || (next != 1 && next != 2) || reason == 0) revert InvalidInput();
        if (next == 2 && membership[identity][ADMIN] != 0) revert LastAdmin();
        status[identity] = next;
        ++membershipVersion[identity];
        emit IdentityStatusChanged(identity, next, reason);
    }

    function defineRole(address actor, uint8 role, uint8 permissions) external onlyAdmin(actor) {
        // Custom roles cannot grant governance, minting or Manager approval.
        if (role <= USER || role > MAX_ROLES || permissions == 0 || (permissions & ~uint8(11)) != 0) {
            revert InvalidInput();
        }
        actions[role] = permissions;
        emit RoleDefined(role, permissions, ++policyVersion);
    }

    function grantRole(address actor, address identity, uint8 role, bytes32 scope, uint64 expiry)
        external
        onlyAdmin(actor)
    {
        if (scope != organization || !active(identity) || actions[role] == 0 || expiry <= block.timestamp) {
            revert InvalidInput();
        }
        if (role == ADMIN) {
            if (expiry != type(uint64).max) revert InvalidInput();
            if (membership[identity][role] == 0) ++adminCount;
        }
        membership[identity][role] = expiry;
        emit RoleGranted(identity, role, scope, expiry, ++membershipVersion[identity]);
    }

    function revokeRole(address actor, address identity, uint8 role, bytes32 scope) external onlyAdmin(actor) {
        if (scope != organization || actions[role] == 0) revert InvalidInput();
        if (membership[identity][role] == 0) return;
        if (role == ADMIN) {
            if (adminCount == 1) revert LastAdmin();
            --adminCount;
        }
        delete membership[identity][role];
        emit RoleRevoked(identity, role, scope, ++membershipVersion[identity]);
    }
}
