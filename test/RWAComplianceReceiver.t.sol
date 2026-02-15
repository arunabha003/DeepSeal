// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {RWAComplianceReceiver} from "../src/RWAComplianceReceiver.sol";

contract RWAComplianceReceiverTest is Test {
    address private owner = address(0xA11CE);
    address private operator = address(0xB0B);

    ComplianceRegistry private registry;
    RWAComplianceReceiver private receiver;

    function setUp() external {
        registry = new ComplianceRegistry(owner, operator);

        // forwarder unset -> anyone can call onReport (local testing)
        vm.prank(owner);
        receiver = new RWAComplianceReceiver(owner, registry, address(0));

        vm.prank(owner);
        registry.setWorkflowOperator(address(receiver));
    }

    function test_onReportWritesApproval() external {
        address subject = address(0xBEEF);
        bytes32 attHash = keccak256("att");

        bytes memory report = abi.encode(subject, true, uint32(123), attHash);
        receiver.onReport("", report);

        ComplianceRegistry.ComplianceRecord memory rec = registry.getRecord(subject);
        assertTrue(rec.approved);
        assertEq(rec.riskScore, 123);
        assertEq(rec.attestationHash, attHash);
        assertGt(rec.updatedAt, 0);
    }

    function test_onReportRespectsForwarderWhenSet() external {
        address subject = address(0xBEEF);
        bytes memory report = abi.encode(subject, true, uint32(1), keccak256("att"));

        address forwarder = address(0xF00D);
        vm.prank(owner);
        receiver.setReportForwarder(forwarder);

        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(RWAComplianceReceiver.InvalidForwarder.selector, address(0xBAD)));
        receiver.onReport("", report);

        vm.prank(forwarder);
        receiver.onReport("", report);
        assertTrue(registry.isApproved(subject));
    }
}
