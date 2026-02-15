// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";

contract AgentRegister is Script {
    function run() external returns (uint256 agentId) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address identityRegistryAddr = vm.envAddress("IDENTITY_REGISTRY");
        string memory agentUri = vm.envOr("AGENT_URI", string(""));

        vm.startBroadcast(deployerKey);
        agentId = IdentityRegistry(identityRegistryAddr).register(agentUri);
        vm.stopBroadcast();

        console2.log("Registrar:", deployer);
        console2.log("IdentityRegistry:", identityRegistryAddr);
        console2.log("AgentId:", agentId);
        console2.log("AgentURI:", agentUri);
    }
}

