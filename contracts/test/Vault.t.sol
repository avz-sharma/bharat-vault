// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {AssetNFT} from "../src/AssetNFT.sol";
import {IdentityAccessRegistry, IDIDRegistry} from "../src/IdentityAccessRegistry.sol";
import {DIDRegistry} from "../src/DIDRegistry.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function warp(uint256) external;
    function roll(uint256) external;
    function chainId(uint256) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

contract Receiver {
    AssetNFT immutable asset;
    bool public attempted;

    constructor(AssetNFT a) {
        asset = a;
    }

    function onERC721Received(address, address, uint256 token, bytes calldata) external returns (bytes4) {
        attempted = true;
        (bool ok,) = address(asset)
            .call(abi.encodeWithSignature("transferFrom(address,address,uint256)", address(this), address(9), token));
        require(!ok, "receiver bypass");
        return this.onERC721Received.selector;
    }
}

abstract contract VaultFixture {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    bytes32 constant SCOPE = keccak256("vault.demo.organization");
    address constant ADMIN = address(0xA);
    address constant MANAGER = address(0xB);
    address constant AUDITOR = address(0xC);
    address constant ALICE = address(0xD);
    address constant BOB = address(0xE);
    DIDRegistry internal did;
    IdentityAccessRegistry internal registry;
    AssetNFT internal asset;

    function setUp() public {
        vm.warp(1000);
        did = new DIDRegistry();
        registry = new IdentityAccessRegistry(IDIDRegistry(address(did)), SCOPE, ADMIN);
        asset = new AssetNFT(registry);
        _enroll(MANAGER, 2);
        _enroll(AUDITOR, 3);
        _enroll(ALICE, 4);
        _enroll(BOB, 4);
    }

    function _enroll(address identity, uint8 role) internal {
        vm.prank(identity);
        registry.enroll(identity);
        vm.prank(ADMIN);
        registry.grantRole(ADMIN, identity, role, SCOPE, type(uint64).max);
    }

    function _mint(bool manager) internal returns (uint256) {
        bytes32 commitment = bytes32(asset.nextTokenId());
        vm.prank(ADMIN);
        return asset.mintAsset(ADMIN, ALICE, commitment, keccak256("metadata"), "ipfs://test-public-content", manager);
    }

    function _request(uint256 token) internal returns (uint256) {
        vm.prank(ALICE);
        return asset.requestHandover(token, BOB, uint64(block.timestamp + 1000));
    }
    function _empty() internal pure returns (AssetNFT.Attestation memory p) {}

    function _accept(uint256 request) internal {
        vm.prank(BOB);
        asset.acceptHandover(request, _empty());
    }

    function _physical() internal returns (uint256 t, uint256 r, AssetNFT.Attestation memory p) {
        t = _mint(false);
        vm.prank(ADMIN);
        asset.registerBinding(ADMIN, t, keccak256("tag-commitment"));
        address signer = vm.addr(123);
        vm.prank(ADMIN);
        asset.setVerifier(ADMIN, signer, true);
        r = _request(t);
        p = AssetNFT.Attestation(keccak256("nonce"), keccak256("evidence"), 1000, 1100, signer, "");
        (uint8 v, bytes32 rr, bytes32 s) = vm.sign(123, asset.attestationDigest(r, p));
        p.signature = abi.encodePacked(rr, s, v);
    }
}

contract VaultTest is VaultFixture {
    function testPhysicalProofWrongContractAndNonceReuseOnNewRequest() public {
        (uint256 token, uint256 request, AssetNFT.Attestation memory proof) = _physical();
        AssetNFT other = new AssetNFT(registry);
        vm.prank(ADMIN);
        other.mintAsset(ADMIN, ALICE, bytes32(uint256(1)), keccak256("metadata"), "ipfs://test", false);
        vm.prank(ADMIN); other.registerBinding(ADMIN, 1, keccak256("tag-commitment"));
        vm.prank(ADMIN); other.setVerifier(ADMIN, proof.verifier, true);
        vm.prank(ALICE); uint256 otherRequest = other.requestHandover(1, BOB, 2000);
        vm.prank(BOB); vm.expectRevert(AssetNFT.InvalidEvidence.selector);
        other.acceptHandover(otherRequest, proof);
        vm.prank(BOB); asset.acceptHandover(request, proof);
        vm.prank(BOB); uint256 next = asset.requestHandover(token, ALICE, 2000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(123, asset.attestationDigest(next, proof));
        proof.signature = abi.encodePacked(r, s, v);
        vm.prank(ALICE); vm.expectRevert(AssetNFT.InvalidEvidence.selector);
        asset.acceptHandover(next, proof);
        require(asset.ownerOf(token) == BOB);
    }
    function testDigitalLifecycleAndReplay() public {
        uint256 t = _mint(true);
        uint256 r = _request(t);
        vm.prank(MANAGER);
        asset.approveHandover(MANAGER, r);
        _accept(r);
        require(asset.ownerOf(t) == BOB && asset.pendingRequest(t) == 0);
        require(asset.getRequest(r).state == 2);
        vm.expectRevert(AssetNFT.InvalidRequest.selector);
        _accept(r);
    }

    function testRolesSharedIndependentAndNoEscalation() public {
        vm.prank(ADMIN);
        registry.revokeRole(ADMIN, ALICE, 4, SCOPE);
        require(!registry.hasRole(ALICE, 4, SCOPE) && registry.hasRole(BOB, 4, SCOPE));
        vm.prank(ALICE);
        vm.expectRevert(IdentityAccessRegistry.Unauthorized.selector);
        registry.grantRole(ALICE, ALICE, 1, SCOPE, type(uint64).max);
        vm.prank(ADMIN);
        vm.expectRevert(IdentityAccessRegistry.InvalidInput.selector);
        registry.defineRole(ADMIN, 5, 4);
        vm.prank(ADMIN);
        registry.defineRole(ADMIN, 5, 8);
        vm.prank(ADMIN);
        registry.grantRole(ADMIN, BOB, 5, SCOPE, 2000);
        require(registry.can(BOB, 8, SCOPE));
        vm.warp(2000);
        require(!registry.can(BOB, 8, SCOPE));
        require(!registry.can(BOB, 1, keccak256("other")));
    }

    function testOnlyAdminMintAndAllocation() public {
        address[4] memory denied = [MANAGER, AUDITOR, ALICE, address(99)];
        for (uint256 i; i < denied.length; ++i) {
            vm.prank(denied[i]);
            vm.expectRevert(AssetNFT.Unauthorized.selector);
            asset.mintAsset(denied[i], ALICE, bytes32(uint256(1)), bytes32(uint256(2)), "ipfs://test", false);
        }
        vm.prank(ADMIN);
        vm.expectRevert(AssetNFT.InvalidInput.selector);
        asset.mintAsset(ADMIN, address(99), bytes32(uint256(1)), bytes32(uint256(2)), "ipfs://test", false);
        _mint(false);
        vm.prank(ADMIN);
        vm.expectRevert(AssetNFT.InvalidInput.selector);
        asset.mintAsset(ADMIN, BOB, bytes32(uint256(1)), bytes32(uint256(2)), "ipfs://test", false);
    }

    function testAllERC721BypassesFail() public {
        uint256 t = _mint(false);
        vm.startPrank(ALICE);
        vm.expectRevert(AssetNFT.UseHandover.selector);
        asset.transferFrom(ALICE, BOB, t);
        vm.expectRevert(AssetNFT.UseHandover.selector);
        asset.safeTransferFrom(ALICE, BOB, t);
        vm.expectRevert(AssetNFT.UseHandover.selector);
        asset.safeTransferFrom(ALICE, BOB, t, "");
        vm.expectRevert(AssetNFT.UseHandover.selector);
        asset.approve(BOB, t);
        vm.expectRevert(AssetNFT.UseHandover.selector);
        asset.setApprovalForAll(BOB, true);
        vm.stopPrank();
        vm.prank(BOB);
        vm.expectRevert(AssetNFT.UseHandover.selector);
        asset.transferFrom(ALICE, BOB, t);
        require(asset.ownerOf(t) == ALICE);
    }

    function testManagerRevocationAndRegrantInvalidatesApproval() public {
        uint256 r = _request(_mint(true));
        vm.prank(MANAGER);
        asset.approveHandover(MANAGER, r);
        vm.prank(ADMIN);
        registry.revokeRole(ADMIN, MANAGER, 2, SCOPE);
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        _accept(r);
        vm.prank(ADMIN);
        registry.grantRole(ADMIN, MANAGER, 2, SCOPE, type(uint64).max);
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        _accept(r);
        vm.prank(MANAGER);
        asset.approveHandover(MANAGER, r);
        _accept(r);
    }

    function testExpiryCancellationAndPolicyChanges() public {
        uint256 t = _mint(false);
        uint256 r = _request(t);
        vm.warp(2000);
        vm.expectRevert(AssetNFT.InvalidRequest.selector);
        _accept(r);
        r = _request(t);
        vm.prank(BOB);
        asset.cancelHandover(r);
        vm.expectRevert(AssetNFT.InvalidRequest.selector);
        _accept(r);
        r = _request(t);
        vm.prank(ADMIN);
        asset.setAssetPolicy(ADMIN, t, 1, true, keccak256("review"));
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        _accept(r);
    }

    function testControllerRotationPreservesOwnerAndInvalidatesIntent() public {
        uint256 t = _mint(false);
        uint256 r = _request(t);
        vm.roll(2);
        vm.prank(ALICE);
        did.changeOwner(ALICE, address(77));
        require(asset.ownerOf(t) == ALICE);
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        _accept(r);
        vm.prank(ALICE);
        vm.expectRevert(AssetNFT.Unauthorized.selector);
        asset.requestHandover(t, BOB, 2000);
        vm.roll(3);
        vm.prank(address(77));
        r = asset.requestHandover(t, BOB, 2000);
        _accept(r);
        require(asset.ownerOf(t) == BOB);
    }

    function testRevokedOwnerAndSuspendedRecipientFail() public {
        uint256 t = _mint(false);
        uint256 r = _request(t);
        vm.prank(ADMIN);
        registry.revokeRole(ADMIN, ALICE, 4, SCOPE);
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        _accept(r);
        vm.prank(ADMIN);
        registry.setStatus(ADMIN, BOB, 2, keccak256("review"));
        vm.prank(ADMIN);
        vm.expectRevert(AssetNFT.InvalidInput.selector);
        asset.mintAsset(ADMIN, BOB, bytes32(uint256(999)), bytes32(uint256(2)), "ipfs://test", false);
    }

    function testSafeReceiverCannotBypass() public {
        Receiver receiver = new Receiver(asset);
        _enroll(address(receiver), 4);
        vm.prank(ADMIN);
        uint256 t =
            asset.mintAsset(ADMIN, address(receiver), bytes32(uint256(9)), bytes32(uint256(2)), "ipfs://test", false);
        require(receiver.attempted() && asset.ownerOf(t) == address(receiver));
    }

    function testPhysicalProofAndNonceConsumedAtomically() public {
        (uint256 t, uint256 r, AssetNFT.Attestation memory p) = _physical();
        vm.prank(BOB);
        asset.acceptHandover(r, p);
        require(asset.ownerOf(t) == BOB && asset.usedAttestation(p.nonce));
        vm.prank(BOB);
        vm.expectRevert(AssetNFT.InvalidRequest.selector);
        asset.acceptHandover(r, p);
    }

    function testPhysicalTamperingWrongChainAndRevokedVerifier() public {
        (uint256 t, uint256 r, AssetNFT.Attestation memory p) = _physical();
        p.evidence = bytes32(uint256(9));
        vm.prank(BOB);
        vm.expectRevert(AssetNFT.InvalidEvidence.selector);
        asset.acceptHandover(r, p);
        require(!asset.usedAttestation(p.nonce) && asset.ownerOf(t) == ALICE);
        p.evidence = keccak256("evidence");
        vm.chainId(block.chainid + 1);
        vm.prank(BOB);
        vm.expectRevert(AssetNFT.InvalidEvidence.selector);
        asset.acceptHandover(r, p);
        vm.chainId(block.chainid - 1);
        vm.prank(ADMIN);
        asset.setVerifier(ADMIN, p.verifier, false);
        vm.prank(BOB);
        vm.expectRevert(AssetNFT.InvalidEvidence.selector);
        asset.acceptHandover(r, p);
    }

    function testDuplicateBindingAndLastAdminDenied() public {
        (uint256 t,,) = _physical();
        vm.prank(ADMIN);
        vm.expectRevert(AssetNFT.InvalidInput.selector);
        asset.registerBinding(ADMIN, t, keccak256("tag-commitment"));
        vm.prank(ADMIN);
        vm.expectRevert(IdentityAccessRegistry.LastAdmin.selector);
        registry.revokeRole(ADMIN, ADMIN, 1, SCOPE);
    }

    function testSameBlockRotationCannotReviveRequest() public {
        uint256 t = _mint(false);
        vm.prank(ALICE);
        did.changeOwner(ALICE, address(77));
        vm.prank(address(77));
        did.changeOwner(ALICE, ALICE);
        vm.prank(ALICE);
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        asset.requestHandover(t, BOB, 2000);
        vm.roll(block.number + 1);
        uint256 r = _request(t);
        vm.prank(ALICE);
        did.changeOwner(ALICE, address(77));
        vm.prank(address(77));
        did.changeOwner(ALICE, ALICE);
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        _accept(r);
    }

    function testManagerExpiryAndRecipientRotation() public {
        vm.prank(ADMIN);
        registry.grantRole(ADMIN, MANAGER, 2, SCOPE, 1100);
        uint256 r = _request(_mint(true));
        vm.prank(MANAGER);
        asset.approveHandover(MANAGER, r);
        vm.warp(1100);
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        _accept(r);
        uint256 r2 = _request(_mint(false));
        vm.prank(BOB);
        did.changeOwner(BOB, address(88));
        vm.prank(address(88));
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        asset.acceptHandover(r2, _empty());
    }

    function testWrongRecipientAndExpiredPhysicalProof() public {
        (uint256 t, uint256 r, AssetNFT.Attestation memory p) = _physical();
        vm.prank(ALICE);
        vm.expectRevert(AssetNFT.Unauthorized.selector);
        asset.acceptHandover(r, p);
        vm.warp(1100);
        vm.prank(BOB);
        vm.expectRevert(AssetNFT.InvalidEvidence.selector);
        asset.acceptHandover(r, p);
        require(asset.ownerOf(t) == ALICE && !asset.usedAttestation(p.nonce));
    }

    function testChangedBindingInvalidatesProofAndDuplicateAcrossTokens() public {
        (uint256 t, uint256 r, AssetNFT.Attestation memory p) = _physical();
        uint256 other = _mint(false);
        vm.prank(ADMIN);
        vm.expectRevert(AssetNFT.InvalidInput.selector);
        asset.registerBinding(ADMIN, other, keccak256("tag-commitment"));
        vm.prank(ADMIN);
        asset.registerBinding(ADMIN, t, keccak256("replacement-tag"));
        vm.prank(BOB);
        vm.expectRevert(AssetNFT.PolicyChanged.selector);
        asset.acceptHandover(r, p);
        require(!asset.usedAttestation(p.nonce));
    }

    function testFuzzUnauthorizedMint(address caller) public {
        if (caller == ADMIN) return;
        vm.prank(caller);
        vm.expectRevert(AssetNFT.Unauthorized.selector);
        asset.mintAsset(ADMIN, ALICE, bytes32(uint256(1)), bytes32(uint256(2)), "ipfs://test", false);
        require(asset.nextTokenId() == 1);
    }
}
