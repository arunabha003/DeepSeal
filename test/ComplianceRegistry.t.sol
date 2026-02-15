// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";

contract ComplianceRegistryTest is Test {
    address private owner = address(0xA11CE);
    address private operator = address(0xB0B);
    address private subject = address(0xCAFE);

    ComplianceRegistry private registry;

    function setUp() external {
        registry = new ComplianceRegistry(owner, operator);
    }

    function test_ownerCanSetWorkflowOperator() external {
        address newOperator = address(0xD00D);
        vm.prank(owner);
        registry.setWorkflowOperator(newOperator);
        assertEq(registry.workflowOperator(), newOperator);
    }

    function test_nonOwnerCannotSetWorkflowOperator() external {
        vm.expectRevert();
        registry.setWorkflowOperator(address(0xD00D));
    }

    function test_ownerCanSetApproval() external {
        bytes32 hash = keccak256("att");
        vm.warp(123);

        vm.prank(owner);
        registry.setApproval(subject, true, 77, hash);

        ComplianceRegistry.ComplianceRecord memory record = registry.getRecord(subject);
        assertTrue(record.approved);
        assertEq(record.riskScore, 77);
        assertEq(record.attestationHash, hash);
        assertEq(record.updatedAt, 123);
    }

    function test_operatorCanSetApproval() external {
        bytes32 hash = keccak256("att");
        vm.prank(operator);
        registry.setApproval(subject, true, 1, hash);
        assertTrue(registry.isApproved(subject));
    }

    function test_randomCannotSetApproval() external {
        vm.prank(address(0xDEAD));
        vm.expectRevert(abi.encodeWithSelector(ComplianceRegistry.Unauthorized.selector, address(0xDEAD)));
        registry.setApproval(subject, true, 1, keccak256("att"));
    }

    function test_setApprovalZeroSubjectReverts() external {
        vm.prank(owner);
        vm.expectRevert(ComplianceRegistry.ZeroAddress.selector);
        registry.setApproval(address(0), true, 1, keccak256("att"));
    }

    function test_constructorZeroOperatorReverts() external {
        vm.expectRevert(ComplianceRegistry.ZeroAddress.selector);
        new ComplianceRegistry(owner, address(0));
    }
}
