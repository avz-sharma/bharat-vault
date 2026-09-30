// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {VaultFixture} from "./Vault.t.sol";
import {AssetNFT} from "../src/AssetNFT.sol";

contract ContractController {
    address immutable signer;

    constructor(address owner) {
        signer = owner;
    }

    function execute(address target, bytes calldata payload) external returns (bytes memory result) {
        require(msg.sender == signer);
        (bool ok, bytes memory output) = target.call(payload);
        require(ok, "execution failed");
        return output;
    }

    function isValidSignature(bytes32 digest, bytes memory signature) external view returns (bytes4) {
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, signature);
        return error == ECDSA.RecoverError.NoError && recovered == signer ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

contract ContractControllerTest is VaultFixture {
    function testContractControllerCanRequestButOldEOACannot() public {
        uint256 token = _mint(false);
        address signer = vm.addr(555);
        ContractController controller = new ContractController(signer);
        vm.prank(ALICE);
        did.changeOwner(ALICE, address(controller));
        vm.roll(block.number + 1);
        vm.prank(ALICE);
        vm.expectRevert(AssetNFT.Unauthorized.selector);
        asset.requestHandover(token, BOB, 2000);
        vm.prank(signer);
        bytes memory result =
            controller.execute(address(asset), abi.encodeCall(asset.requestHandover, (token, BOB, 2000)));
        _accept(abi.decode(result, (uint256)));
        require(asset.ownerOf(token) == BOB);
    }

    function testERC1271VerifierAccepted() public {
        (, uint256 request, AssetNFT.Attestation memory proof) = _physical();
        ContractController signer = new ContractController(vm.addr(123));
        proof.verifier = address(signer);
        vm.prank(ADMIN);
        asset.setVerifier(ADMIN, address(signer), true);
        vm.prank(BOB);
        asset.acceptHandover(request, proof);
        require(asset.usedAttestation(proof.nonce));
    }
}
