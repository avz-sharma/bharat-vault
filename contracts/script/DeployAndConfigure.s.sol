// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {AccessManager} from "@openzeppelin/contracts/access/manager/AccessManager.sol";
import {RoleSBT} from "../src/RoleSBT.sol";
import {AssetNFT} from "../src/AssetNFT.sol";

contract DeployAndConfigure is Script {
    uint64 public constant AUDITOR_ROLE = 1;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy AccessManager
        AccessManager accessManager = new AccessManager(deployerAddress);

        // 2. Deploy RoleSBT and AssetNFT
        RoleSBT roleSBT = new RoleSBT(deployerAddress);
        AssetNFT assetNFT = new AssetNFT(address(accessManager));

        // 3. Define and configure roles
        // Map AssetNFT.mintAsset.selector to AUDITOR_ROLE via setTargetFunctionRole
        accessManager.setTargetFunctionRole(
            address(assetNFT), 
            AssetNFT.mintAsset.selector, 
            AUDITOR_ROLE
        );

        // 4. Grant AUDITOR_ROLE to the designated administrator address with zero execution delay
        accessManager.grantRole(AUDITOR_ROLE, deployerAddress, 0);

        vm.stopBroadcast();
    }
}
