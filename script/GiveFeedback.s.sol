// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ReputationRegistry} from "../src/erc8004/ReputationRegistry.sol";

contract GiveFeedback is Script {
    function run() external {
        uint256 clientKey = vm.envUint("PRIVATE_KEY");
        address client = vm.addr(clientKey);

        address repAddr = vm.envAddress("REPUTATION_REGISTRY");
        uint256 agentId = vm.envUint("AGENT_ID");

        int128 value = int128(int256(vm.envInt("VALUE")));
        uint8 valueDecimals = uint8(vm.envUint("VALUE_DECIMALS"));

        string memory tag1 = vm.envOr("TAG1", string(""));
        string memory tag2 = vm.envOr("TAG2", string(""));
        string memory endpoint = vm.envOr("ENDPOINT", string(""));
        string memory feedbackUri = vm.envOr("FEEDBACK_URI", string(""));

        bytes32 feedbackHash = vm.envOr("FEEDBACK_HASH", keccak256(bytes(feedbackUri)));

        vm.startBroadcast(clientKey);
        ReputationRegistry(repAddr).giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackUri, feedbackHash);
        vm.stopBroadcast();

        console2.log("Client:", client);
        console2.log("ReputationRegistry:", repAddr);
        console2.log("AgentId:", agentId);
        console2.logInt(int256(value));
        console2.log("ValueDecimals:", valueDecimals);
        console2.log("Tag1:", tag1);
        console2.log("Tag2:", tag2);
        console2.log("Endpoint:", endpoint);
        console2.log("FeedbackURI:", feedbackUri);
        console2.logBytes32(feedbackHash);
    }
}

