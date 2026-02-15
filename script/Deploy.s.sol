// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {DemoUSD} from "../src/DemoUSD.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {RWAComplianceReceiver} from "../src/RWAComplianceReceiver.sol";
import {RWAVault} from "../src/RWAVault.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address reportForwarder = vm.envOr("CRE_REPORT_FORWARDER", address(0));
        bytes32 expectedWorkflowId = vm.envOr("CRE_WORKFLOW_ID", bytes32(0));
        address expectedAuthor = vm.envOr("CRE_WORKFLOW_AUTHOR", address(0));
        bytes10 expectedWorkflowName = bytes10(vm.envOr("CRE_WORKFLOW_NAME", bytes32(0)));

        vm.startBroadcast(deployerKey);

        DemoUSD asset = new DemoUSD(deployer, "Demo USD", "dUSD", 6);
        ComplianceRegistry registry = new ComplianceRegistry(deployer, deployer);
        RWAComplianceReceiver receiver = new RWAComplianceReceiver(
            deployer, registry, reportForwarder, expectedWorkflowId, expectedAuthor, expectedWorkflowName
        );
        registry.setWorkflowOperator(address(receiver));
        RWAVault vault = new RWAVault(asset, registry, "RWA Vault Share", "RWAV");

        // Optional: seed deployer with demo funds for local testing
        uint256 seedAmount = vm.envOr("SEED_AMOUNT", uint256(1_000_000e6));
        asset.mint(deployer, seedAmount);

        vm.stopBroadcast();

        console2.log("Deployer:", deployer);
        console2.log("CREReportForwarder:", reportForwarder);
        console2.logBytes32(expectedWorkflowId);
        console2.log("ExpectedAuthor:", expectedAuthor);
        console2.logBytes32(bytes32(expectedWorkflowName));
        console2.log("DemoUSD:", address(asset));
        console2.log("ComplianceRegistry:", address(registry));
        console2.log("RWAComplianceReceiver:", address(receiver));
        console2.log("RWAVault:", address(vault));
    }
}
