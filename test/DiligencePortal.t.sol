// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DiligencePortal} from "../src/DiligencePortal.sol";

contract DiligencePortalTest is Test {
    DiligencePortal private portal;

    function setUp() external {
        portal = new DiligencePortal();
    }

    function test_submitEmitsAndStores() external {
        address subject = address(0xBEEF);
        bytes32 bundle = keccak256("bundle");
        string memory uri = "ipfs://abc";
        bytes32 assetId = portal.computeAssetId(address(this), subject, bundle, uri);

        vm.warp(456);

        vm.expectEmit(true, true, true, true);
        emit DiligencePortal.DiligenceRequested(1, assetId, address(this), subject, bundle, uri, 456);

        uint256 id = portal.submit(subject, bundle, uri);
        assertEq(id, 1);
        assertEq(portal.nextRequestId(), 2);

        DiligencePortal.Request memory req = portal.getRequest(id);
        assertEq(req.requester, address(this));
        assertEq(req.subject, subject);
        assertEq(req.docBundleHash, bundle);
        assertEq(req.metadataUri, uri);
        assertEq(req.requestedAt, 456);
        assertEq(portal.assetIdForRequest(id), assetId);
    }

    function test_submitZeroSubjectReverts() external {
        vm.expectRevert(DiligencePortal.ZeroAddress.selector);
        portal.submit(address(0), keccak256("bundle"), "ipfs://abc");
    }

    function test_submitZeroHashReverts() external {
        vm.expectRevert(DiligencePortal.ZeroHash.selector);
        portal.submit(address(1), bytes32(0), "ipfs://abc");
    }
}
