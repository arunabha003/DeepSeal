// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ReputationRegistry} from "../src/erc8004/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/erc8004/ValidationRegistry.sol";

contract ReadERC8004State is Script {
    function run() external view {
        address reputationRegistryAddr = vm.envAddress("REPUTATION_REGISTRY");
        address validationRegistryAddr = vm.envAddress("VALIDATION_REGISTRY");

        uint256 reputationAgentId = vm.envUint("REPUTATION_AGENT_ID");
        uint256 validationAgentId = vm.envUint("VALIDATION_AGENT_ID");
        address reputationClient = vm.envOr("REPUTATION_CLIENT", address(0));
        uint64 feedbackIndex = uint64(vm.envOr("FEEDBACK_INDEX", uint256(1)));

        console2.log("ReputationRegistry:", reputationRegistryAddr);
        console2.log("ValidationRegistry:", validationRegistryAddr);
        console2.log("ReputationAgentId:", reputationAgentId);
        console2.log("ValidationAgentId:", validationAgentId);

        uint64 lastIndex = ReputationRegistry(reputationRegistryAddr).getLastIndex(reputationAgentId, reputationClient);
        console2.log("ReputationClient:", reputationClient);
        console2.log("LastFeedbackIndex:", lastIndex);

        if (reputationClient != address(0) && feedbackIndex != 0 && feedbackIndex <= lastIndex) {
            try ReputationRegistry(reputationRegistryAddr).readFeedback(reputationAgentId, reputationClient, feedbackIndex) returns (
                int128 value,
                uint8 valueDecimals,
                string memory tag1,
                string memory tag2,
                bool revoked
            ) {
                console2.logInt(int256(value));
                console2.log("ValueDecimals:", valueDecimals);
                console2.log("Tag1:", tag1);
                console2.log("Tag2:", tag2);
                console2.log("Revoked:", revoked);
            } catch {
                console2.log("Failed to read feedback entry");
            }
        }

        bytes32[] memory requestHashes = ValidationRegistry(validationRegistryAddr).getAgentValidations(validationAgentId);
        console2.log("ValidationRequests:", requestHashes.length);
        if (requestHashes.length > 0) {
            bytes32 requestHash = requestHashes[requestHashes.length - 1];
            console2.log("LatestValidationRequestHash:");
            console2.logBytes32(requestHash);
            (
                address validatorAddress,
                uint256 agentId,
                uint8 response,
                bytes32 responseHash,
                string memory tag,
                uint256 lastUpdate
            ) = ValidationRegistry(validationRegistryAddr).getValidationStatus(requestHash);
            console2.log("Validator:", validatorAddress);
            console2.log("ValidationAgentIdFromStatus:", agentId);
            console2.log("ValidationResponse:", response);
            console2.log("ValidationTag:", tag);
            console2.log("ValidationLastUpdate:", lastUpdate);
            console2.log("ValidationResponseHash:");
            console2.logBytes32(responseHash);
        }
    }
}
