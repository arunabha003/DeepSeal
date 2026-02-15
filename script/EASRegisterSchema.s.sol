// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ISchemaRegistry} from "../src/interfaces/ISchemaRegistry.sol";

contract EASRegisterSchema is Script {
    function run() external returns (bytes32 schemaUid) {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address schemaRegistry = vm.envAddress("EAS_SCHEMA_REGISTRY");

        string memory schema = vm.envString("EAS_SCHEMA");
        bool revocable = vm.envOr("EAS_SCHEMA_REVOCABLE", true);
        address resolver = vm.envOr("EAS_SCHEMA_RESOLVER", address(0));

        vm.startBroadcast(key);
        schemaUid = ISchemaRegistry(schemaRegistry).register(schema, resolver, revocable);
        vm.stopBroadcast();

        console2.log("SchemaRegistry:", schemaRegistry);
        console2.log("Resolver:", resolver);
        console2.log("Revocable:", revocable);
        console2.log("Schema:", schema);
        console2.logBytes32(schemaUid);
    }
}

