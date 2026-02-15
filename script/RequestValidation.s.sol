// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ValidationRegistry} from "../src/erc8004/ValidationRegistry.sol";

contract RequestValidation is Script {
    function run() external returns (bytes32 requestHash) {
        uint256 requesterKey = vm.envUint("PRIVATE_KEY");
        address requester = vm.addr(requesterKey);

        address valAddr = vm.envAddress("VALIDATION_REGISTRY");
        address validator = vm.envAddress("VALIDATOR");
        uint256 agentId = vm.envUint("AGENT_ID");

        string memory requestUri = vm.envOr("REQUEST_URI", string(""));
        requestHash = vm.envOr("REQUEST_HASH", keccak256(bytes(requestUri)));

        vm.startBroadcast(requesterKey);
        ValidationRegistry(valAddr).validationRequest(validator, agentId, requestUri, requestHash);
        vm.stopBroadcast();

        console2.log("Requester:", requester);
        console2.log("ValidationRegistry:", valAddr);
        console2.log("Validator:", validator);
        console2.log("AgentId:", agentId);
        console2.log("RequestURI:", requestUri);
        console2.logBytes32(requestHash);
    }
}

