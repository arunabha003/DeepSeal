// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {IdentityRegistry} from "../../src/erc8004/IdentityRegistry.sol";
import {ValidationRegistry} from "../../src/erc8004/ValidationRegistry.sol";

contract ValidationRegistryTest is Test {
    IdentityRegistry private id;
    ValidationRegistry private val;

    address private alice = address(0xA11CE);
    address private bobValidator = address(0xB0B);
    address private eve = address(0xE1E);

    function setUp() external {
        id = new IdentityRegistry();
        val = new ValidationRegistry();
        val.initialize(address(id));
    }

    function test_requestAndResponseFlow() external {
        vm.prank(alice);
        uint256 agentId = id.register("ipfs://agent.json");

        bytes32 requestHash = keccak256("req");

        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(ValidationRegistry.NotOwnerOrOperator.selector, eve, agentId));
        val.validationRequest(bobValidator, agentId, "ipfs://req", requestHash);

        vm.prank(alice);
        val.validationRequest(bobValidator, agentId, "ipfs://req", requestHash);

        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSelector(ValidationRegistry.InvalidValidator.selector, eve));
        val.validationResponse(requestHash, 55, "ipfs://resp", keccak256("resp"), "kyb");

        vm.prank(bobValidator);
        val.validationResponse(requestHash, 55, "ipfs://resp", keccak256("resp"), "kyb");

        (address validator, uint256 gotAgentId, uint8 response, bytes32 responseHash, string memory tag, uint256 lastUpdate) =
            val.getValidationStatus(requestHash);
        assertEq(validator, bobValidator);
        assertEq(gotAgentId, agentId);
        assertEq(response, 55);
        assertEq(responseHash, keccak256("resp"));
        assertEq(tag, "kyb");
        assertGt(lastUpdate, 0);

        address[] memory validators = new address[](1);
        validators[0] = bobValidator;
        (uint64 count, uint8 avg) = val.getSummary(agentId, validators, "kyb");
        assertEq(count, 1);
        assertEq(avg, 55);
    }
}
