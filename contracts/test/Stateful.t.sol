// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {AssetNFT} from "../src/AssetNFT.sol";
import {IdentityAccessRegistry, IDIDRegistry} from "../src/IdentityAccessRegistry.sol";
import {DIDRegistry} from "../src/DIDRegistry.sol";
import {Vm} from "./Vault.t.sol";

contract HandoverHandler {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    AssetNFT public immutable asset;
    IdentityAccessRegistry public immutable registry;
    address public immutable admin;
    address public constant ALICE = address(0x123);
    address public constant BOB = address(0x456);
    uint256 public successes;
    uint256 public denials;

    constructor(AssetNFT a, IdentityAccessRegistry r, address governance) {
        asset = a;
        registry = r;
        admin = governance;
    }

    function transfer() external {
        address from = asset.ownerOf(1);
        address to = from == ALICE ? BOB : ALICE;
        bytes32 scope = registry.organization();
        bool allowed = registry.can(from, 1, scope) && registry.can(to, 2, scope);
        vm.prank(from);
        (bool requested, bytes memory result) =
            address(asset).call(abi.encodeCall(asset.requestHandover, (1, to, uint64(block.timestamp + 100))));
        if (!allowed) {
            require(!requested && asset.ownerOf(1) == from, "revoked transfer succeeded");
            ++denials;
            return;
        }
        require(requested, "valid request failed");
        uint256 id = abi.decode(result, (uint256));
        AssetNFT.Attestation memory proof;
        vm.prank(to);
        asset.acceptHandover(id, proof);
        require(
            asset.ownerOf(1) == to && asset.getRequest(id).state == 2 && asset.pendingRequest(1) == 0, "bad completion"
        );
        ++successes;
    }

    function setMembership(bool alice, bool enabled) external {
        address identity = alice ? ALICE : BOB;
        bytes32 scope = registry.organization();
        vm.prank(admin);
        if (enabled) registry.grantRole(admin, identity, 4, scope, type(uint64).max);
        else registry.revokeRole(admin, identity, 4, scope);
    }

    function bypass(uint256 route) external {
        address from = asset.ownerOf(1);
        address to = from == ALICE ? BOB : ALICE;
        bytes memory payload = route % 2 == 0
            ? abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, 1)
            : abi.encodeWithSignature("safeTransferFrom(address,address,uint256,bytes)", from, to, 1, "");
        vm.prank(from);
        (bool ok,) = address(asset).call(payload);
        require(!ok && asset.ownerOf(1) == from, "bypass");
        ++denials;
    }
}

contract StatefulTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    HandoverHandler handler;
    AssetNFT asset;
    IdentityAccessRegistry registry;
    address constant ADMIN = address(0xAAA);

    function setUp() public {
        DIDRegistry did = new DIDRegistry();
        bytes32 scope = keccak256("scope");
        registry = new IdentityAccessRegistry(IDIDRegistry(address(did)), scope, ADMIN);
        asset = new AssetNFT(registry);
        handler = new HandoverHandler(asset, registry, ADMIN);
        address[2] memory holders = [handler.ALICE(), handler.BOB()];
        for (uint256 i; i < 2; ++i) {
            vm.prank(holders[i]);
            registry.enroll(holders[i]);
            vm.prank(ADMIN);
            registry.grantRole(ADMIN, holders[i], 4, scope, type(uint64).max);
        }
        vm.prank(ADMIN);
        asset.mintAsset(ADMIN, holders[0], keccak256("asset"), keccak256("metadata"), "ipfs://test", false);
        handler.transfer(); // guarantees reachable success, not an all-reverting handler
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function invariantOneOwnerAndNoUnauthorizedIssuance() public view {
        address a = handler.ALICE();
        address b = handler.BOB();
        require(asset.ownerOf(1) == a || asset.ownerOf(1) == b);
        require(asset.balanceOf(a) + asset.balanceOf(b) == 1);
        require(asset.nextTokenId() == 2 && handler.successes() > 0);
        require(asset.pendingRequest(1) == 0);
    }
}
