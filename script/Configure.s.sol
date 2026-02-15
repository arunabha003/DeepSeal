// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

contract Configure is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");

        address registryAddr = vm.envAddress("REGISTRY_ADDRESS");
        address subject = vm.envAddress("SUBJECT");

        bool approved = vm.envBool("APPROVED");
        uint256 riskScoreRaw = vm.envUint("RISK_SCORE");
        bytes32 attestationHash = vm.envBytes32("ATTESTATION_HASH");

        require(riskScoreRaw <= type(uint32).max, "RISK_SCORE too large");
        uint32 riskScore = uint32(riskScoreRaw);

        vm.startBroadcast(key);
        ComplianceRegistry(registryAddr).setApproval(subject, approved, riskScore, attestationHash);
        vm.stopBroadcast();

        console2.log("Registry:", registryAddr);
        console2.log("Subject:", subject);
        console2.log("Approved:", approved);
        console2.log("RiskScore:", riskScore);
        console2.logBytes32(attestationHash);
    }
}
