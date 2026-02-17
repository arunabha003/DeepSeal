// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {RWAComplianceReceiver} from "../src/RWAComplianceReceiver.sol";
import {IdentityRegistry} from "../src/erc8004/IdentityRegistry.sol";
import {ReputationRegistry} from "../src/erc8004/ReputationRegistry.sol";
import {ValidationRegistry} from "../src/erc8004/ValidationRegistry.sol";

contract RWAComplianceReceiverERC8004Test is Test {
    address private owner = address(0xA11CE);
    address private operator = address(0xB0B);

    ComplianceRegistry private registry;
    RWAComplianceReceiver private receiver;
    IdentityRegistry private identity;
    ReputationRegistry private reputation;
    ValidationRegistry private validation;

    uint256 private reputationAgentId;
    uint256 private validationAgentId;

    function setUp() external {
        registry = new ComplianceRegistry(owner, operator);
        vm.prank(owner);
        receiver = new RWAComplianceReceiver(owner, registry, address(0), bytes32(0), address(0), bytes10(0));
        vm.prank(owner);
        registry.setWorkflowOperator(address(receiver));

        identity = new IdentityRegistry();
        reputation = new ReputationRegistry();
        validation = new ValidationRegistry();
        reputation.initialize(address(identity));
        validation.initialize(address(identity));

        vm.startPrank(owner);
        reputationAgentId = identity.register("ipfs://agent/reputation");
        validationAgentId = identity.register("ipfs://agent/validation");
        identity.approve(address(receiver), validationAgentId);
        receiver.setERC8004Reputation(address(reputation), reputationAgentId, 0);
        receiver.setERC8004Validation(address(validation), validationAgentId, address(receiver), true);
        vm.stopPrank();
    }

    function test_onReportWritesERC8004ArtifactsWhenConfigured() external {
        address subject = address(0xBEEF);
        uint32 riskScore = 120;
        bytes32 attHash = keccak256("att");

        bytes memory report = abi.encode(subject, true, riskScore, attHash);
        receiver.onReport(_metadata(bytes32(0), bytes10(0), address(0)), report);

        assertTrue(registry.isApproved(subject));

        uint64 last = reputation.getLastIndex(reputationAgentId, address(receiver));
        assertEq(last, 1);
        (int128 value,,,,) = reputation.readFeedback(reputationAgentId, address(receiver), 1);
        assertEq(value, 880);

        bytes32[] memory requestHashes = validation.getAgentValidations(validationAgentId);
        assertEq(requestHashes.length, 1);
        (address validatorAddress, uint256 gotAgentId, uint8 response, bytes32 responseHash,,) =
            validation.getValidationStatus(requestHashes[0]);
        assertEq(validatorAddress, address(receiver));
        assertEq(gotAgentId, validationAgentId);
        assertEq(response, 88);
        assertEq(responseHash, keccak256(abi.encode(attHash, riskScore, true)));
    }

    function test_onReportStillWritesComplianceWhenValidationNotAuthorized() external {
        vm.startPrank(owner);
        uint256 unapprovedValidationAgentId = identity.register("ipfs://agent/no-approval");
        receiver.setERC8004Validation(address(validation), unapprovedValidationAgentId, address(receiver), true);
        vm.stopPrank();

        address subject = address(0xCAFE);
        bytes memory report = abi.encode(subject, false, uint32(700), keccak256("att-2"));
        receiver.onReport(_metadata(bytes32(0), bytes10(0), address(0)), report);

        ComplianceRegistry.ComplianceRecord memory rec = registry.getRecord(subject);
        assertFalse(rec.approved);
        assertEq(rec.riskScore, 700);

        bytes32[] memory requestHashes = validation.getAgentValidations(unapprovedValidationAgentId);
        assertEq(requestHashes.length, 0);
    }

    function _metadata(bytes32 workflowId, bytes10 workflowName, address workflowOwner) private pure returns (bytes memory) {
        return abi.encodePacked(workflowId, workflowName, workflowOwner);
    }
}
