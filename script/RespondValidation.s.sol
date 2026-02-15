// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ValidationRegistry} from "../src/erc8004/ValidationRegistry.sol";

contract RespondValidation is Script {
    function run() external {
        uint256 validatorKey = vm.envUint("PRIVATE_KEY");
        address validator = vm.addr(validatorKey);

        address valAddr = vm.envAddress("VALIDATION_REGISTRY");
        bytes32 requestHash = vm.envBytes32("REQUEST_HASH");

        uint8 response = uint8(vm.envUint("RESPONSE")); // 0..100
        string memory responseUri = vm.envOr("RESPONSE_URI", string(""));
        bytes32 responseHash = vm.envOr("RESPONSE_HASH", keccak256(bytes(responseUri)));
        string memory tag = vm.envOr("TAG", string(""));

        vm.startBroadcast(validatorKey);
        ValidationRegistry(valAddr).validationResponse(requestHash, response, responseUri, responseHash, tag);
        vm.stopBroadcast();

        console2.log("Validator:", validator);
        console2.log("ValidationRegistry:", valAddr);
        console2.logBytes32(requestHash);
        console2.log("Response:", response);
        console2.log("ResponseURI:", responseUri);
        console2.logBytes32(responseHash);
        console2.log("Tag:", tag);
    }
}

