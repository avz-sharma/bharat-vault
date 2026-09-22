// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AccessManager} from "@openzeppelin/contracts/access/manager/AccessManager.sol";
import {IAccessManaged} from "@openzeppelin/contracts/access/manager/IAccessManaged.sol";
import {RoleSBT} from "../src/RoleSBT.sol";
import {AssetNFT} from "../src/AssetNFT.sol";

contract RoleSBTActor {
    RoleSBT public sbt;

    constructor(RoleSBT _sbt) {
        sbt = _sbt;
    }

    function transfer(address to, uint256 tokenId) external {
        try sbt.transferFrom(address(this), to, tokenId) {} catch {}
    }

    function approveAndTransfer(address to, uint256 tokenId) external {
        try sbt.approve(address(this), tokenId) {} catch {}
        try sbt.transferFrom(address(this), to, tokenId) {} catch {}
    }
    
    // implement IERC721Receiver
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}

contract RoleSBTInvariants is Test {
    AccessManager public accessManager;
    RoleSBT public roleSBT;
    AssetNFT public assetNFT;
    RoleSBTActor public actor;

    address public admin = address(this);
    address public auditor = address(0x1111);
    address public unauthorized = address(0x2222);

    uint64 public constant AUDITOR_ROLE = 1;
    uint256 public constant TOKEN_ID = 1;

    function setUp() public {
        // Deploy contracts
        accessManager = new AccessManager(admin);
        roleSBT = new RoleSBT(admin);
        assetNFT = new AssetNFT(address(accessManager));
        actor = new RoleSBTActor(roleSBT);

        // Map AssetNFT.mintAsset.selector to AUDITOR_ROLE
        accessManager.setTargetFunctionRole(
            address(assetNFT), 
            assetNFT.mintAsset.selector, 
            AUDITOR_ROLE
        );

        // Grant role to auditor
        accessManager.grantRole(AUDITOR_ROLE, auditor, 0);

        // Mint a token to actor for invariant testing
        roleSBT.mint(address(actor), TOKEN_ID);

        // Target actor for invariant testing
        targetContract(address(actor));
    }

    /// @notice Statefuzz invariant: token owner can never change after minting.
    function invariant_soulboundTokenOwnerCannotChange() public {
        assertEq(roleSBT.ownerOf(TOKEN_ID), address(actor));
    }

    /// @notice Unauthorized addresses attempting to call AssetNFT.mintAsset revert immediately
    function test_unauthorizedMintAssetReverts() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(IAccessManaged.AccessManagedUnauthorized.selector, unauthorized));
        assetNFT.mintAsset(unauthorized, 1, "ipfs://hash");
    }

    /// @notice Authorized auditor can mint AssetNFT
    function test_authorizedMintAssetSucceeds() public {
        vm.prank(auditor);
        assetNFT.mintAsset(unauthorized, 1, "ipfs://hash");
        assertEq(assetNFT.ownerOf(1), unauthorized);
    }
}
