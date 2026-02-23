// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {DiligencePortal} from "../src/DiligencePortal.sol";
import {RWAAssetRegistry} from "../src/RWAAssetRegistry.sol";
import {RWAComplianceReceiver} from "../src/RWAComplianceReceiver.sol";
import {RWAVaultFactory} from "../src/RWAVaultFactory.sol";

contract RWAComplianceReceiverTest is Test {
    address private owner = address(0xA11CE);
    address private operator = address(0xB0B);

    ComplianceRegistry private registry;
    RWAComplianceReceiver private receiver;
    DemoUSD private asset;
    DiligencePortal private portal;
    RWAAssetRegistry private assetRegistry;
    RWAVaultFactory private vaultFactory;

    function setUp() external {
        registry = new ComplianceRegistry(owner, operator);

        // forwarder unset -> anyone can call onReport (local testing)
        vm.prank(owner);
        receiver = new RWAComplianceReceiver(owner, registry, address(0), bytes32(0), address(0), bytes10(0));

        vm.prank(owner);
        registry.setWorkflowOperator(address(receiver));

        asset = new DemoUSD(owner, "Demo USD", "dUSD", 6);
        portal = new DiligencePortal();
        assetRegistry = new RWAAssetRegistry(owner, owner);
        vaultFactory = new RWAVaultFactory(owner, asset, registry, owner);

        vm.startPrank(owner);
        receiver.setRWAAssetPipeline(address(portal), address(assetRegistry), address(vaultFactory), true);
        assetRegistry.setOperator(address(receiver));
        vaultFactory.setOperator(address(receiver));
        vm.stopPrank();
    }

    function test_onReportWritesApproval() external {
        address subject = address(0xBEEF);
        bytes32 attHash = keccak256("att");

        bytes memory report = abi.encode(uint256(0), subject, true, uint32(123), attHash);
        receiver.onReport(_metadata(bytes32(0), bytes10(0), address(0)), report);

        ComplianceRegistry.ComplianceRecord memory rec = registry.getRecord(subject);
        assertTrue(rec.approved);
        assertEq(rec.riskScore, 123);
        assertEq(rec.attestationHash, attHash);
        assertGt(rec.updatedAt, 0);
    }

    function test_onReportRespectsForwarderWhenSet() external {
        address subject = address(0xBEEF);
        bytes memory report = abi.encode(uint256(0), subject, true, uint32(1), keccak256("att"));

        address forwarder = address(0xF00D);
        vm.prank(owner);
        receiver.setForwarder(forwarder);

        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(RWAComplianceReceiver.InvalidForwarder.selector, address(0xBAD)));
        receiver.onReport(_metadata(bytes32(0), bytes10(0), address(0)), report);

        vm.prank(forwarder);
        receiver.onReport(_metadata(bytes32(0), bytes10(0), address(0)), report);
        assertTrue(registry.isApproved(subject));
    }

    function test_onReportValidatesWorkflowIdentity() external {
        bytes32 wid = keccak256("workflow");
        bytes10 wname = bytes10("RWA_DD_V1");
        address author = address(0xABCD);

        vm.prank(owner);
        receiver.setExpectedWorkflow(wid, author, wname);

        bytes memory report = abi.encode(uint256(0), address(0xBEEF), true, uint32(1), keccak256("att"));

        vm.expectRevert(abi.encodeWithSelector(RWAComplianceReceiver.InvalidWorkflowId.selector, bytes32(uint256(1)), wid));
        receiver.onReport(_metadata(bytes32(uint256(1)), wname, author), report);

        vm.expectRevert(abi.encodeWithSelector(RWAComplianceReceiver.InvalidAuthor.selector, address(0xBEEF), author));
        receiver.onReport(_metadata(wid, wname, address(0xBEEF)), report);

        vm.expectRevert(abi.encodeWithSelector(RWAComplianceReceiver.InvalidWorkflowName.selector, bytes10("WRONG____"), wname));
        receiver.onReport(_metadata(wid, bytes10("WRONG____"), author), report);

        receiver.onReport(_metadata(wid, wname, author), report);
        assertTrue(registry.isApproved(address(0xBEEF)));
    }

    function test_onReportLegacyFormatStillSupported() external {
        address subject = address(0xA0A0);
        bytes memory report = abi.encode(subject, false, uint32(777), keccak256("legacy"));
        receiver.onReport(_metadata(bytes32(0), bytes10(0), address(0)), report);

        ComplianceRegistry.ComplianceRecord memory rec = registry.getRecord(subject);
        assertFalse(rec.approved);
        assertEq(rec.riskScore, 777);
    }

    function test_onReportCreatesRwaRecordAndVaultPerRequest() external {
        address subject = address(0xBEEF);
        bytes32 bundle = keccak256("bundle");
        string memory uri = "ipfs://doc-1";

        vm.prank(address(0xC0FFEE));
        uint256 requestId = portal.submit(subject, bundle, uri);
        bytes32 assetId = portal.assetIdForRequest(requestId);
        bytes32 attHash = keccak256("attest");

        bytes memory report = abi.encode(requestId, subject, true, uint32(121), attHash);
        receiver.onReport(_metadata(bytes32(0), bytes10(0), address(0)), report);

        RWAAssetRegistry.AssetRecord memory rec = assetRegistry.getAsset(assetId);
        assertTrue(rec.exists);
        assertEq(rec.requestId, requestId);
        assertEq(rec.subject, subject);
        assertEq(rec.docBundleHash, bundle);
        assertEq(rec.metadataUri, uri);
        assertTrue(rec.approved);
        assertEq(rec.riskScore, 121);
        assertEq(rec.attestationHash, attHash);
        assertTrue(rec.vault != address(0));

        assertEq(vaultFactory.vaultByAssetId(assetId), rec.vault);
    }

    function _metadata(bytes32 workflowId, bytes10 workflowName, address workflowOwner) private pure returns (bytes memory) {
        return abi.encodePacked(workflowId, workflowName, workflowOwner);
    }
}
