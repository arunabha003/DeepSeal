// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {IdentityRegistry} from "../../src/erc8004/IdentityRegistry.sol";
import {ReputationRegistry} from "../../src/erc8004/ReputationRegistry.sol";

contract ReputationRegistryTest is Test {
    IdentityRegistry private id;
    ReputationRegistry private rep;

    address private alice = address(0xA11CE);
    address private bob = address(0xB0B);

    function setUp() external {
        id = new IdentityRegistry();
        rep = new ReputationRegistry();
        rep.initialize(address(id));
    }

    function test_initializeOnlyOnce() external {
        vm.expectRevert(ReputationRegistry.AlreadyInitialized.selector);
        rep.initialize(address(id));
    }

    function test_giveFeedbackRejectsSelfFeedback() external {
        vm.prank(alice);
        uint256 agentId = id.register("ipfs://agent.json");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ReputationRegistry.SelfFeedbackNotAllowed.selector, alice));
        rep.giveFeedback(agentId, 10, 0, "kyb", "demo", "http://endpoint", "ipfs://fb", keccak256("fb"));
    }

    function test_giveReadRevokeAndSummary() external {
        vm.prank(alice);
        uint256 agentId = id.register("ipfs://agent.json");

        vm.prank(bob);
        rep.giveFeedback(agentId, 125, 2, "kyb", "demo", "http://endpoint", "ipfs://fb", keccak256("fb"));

        (int128 value, uint8 decimals, string memory tag1, string memory tag2, bool revoked) =
            rep.readFeedback(agentId, bob, 1);
        assertEq(value, 125);
        assertEq(decimals, 2);
        assertEq(tag1, "kyb");
        assertEq(tag2, "demo");
        assertFalse(revoked);

        address[] memory clients = new address[](1);
        clients[0] = bob;
        (uint64 count, int128 avg, uint8 avgDecimals) = rep.getSummary(agentId, clients, "kyb", "demo");
        assertEq(count, 1);
        assertEq(avgDecimals, 18);
        // 1.25 scaled to 18 decimals -> 1.25e18
        assertEq(int256(avg), int256(125) * int256(10 ** 16));

        vm.prank(bob);
        rep.revokeFeedback(agentId, 1);

        (, , , , revoked) = rep.readFeedback(agentId, bob, 1);
        assertTrue(revoked);
    }
}

