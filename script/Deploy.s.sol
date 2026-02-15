// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DemoUSD} from "../src/DemoUSD.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {RWAVault} from "../src/RWAVault.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address workflowOperator = vm.envOr("WORKFLOW_OPERATOR", deployer);

        vm.startBroadcast(deployerKey);

        DemoUSD asset = new DemoUSD(deployer, "Demo USD", "dUSD", 6);
        ComplianceRegistry registry = new ComplianceRegistry(deployer, workflowOperator);
        RWAVault vault = new RWAVault(asset, registry, "RWA Vault Share", "RWAV");

        // Optional: seed deployer with demo funds for local testing
        uint256 seedAmount = vm.envOr("SEED_AMOUNT", uint256(1_000_000e6));
        asset.mint(deployer, seedAmount);

        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("WorkflowOperator:", workflowOperator);
        console2.log("DemoUSD:", address(asset));
        console2.log("ComplianceRegistry:", address(registry));
        console2.log("RWAVault:", address(vault));
    }
}
