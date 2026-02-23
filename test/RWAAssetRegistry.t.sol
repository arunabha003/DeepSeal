// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {RWAAssetRegistry} from "../src/RWAAssetRegistry.sol";

contract RWAAssetRegistryTest is Test {
    address private owner = address(0xA11CE);
    address private operator = address(0xB0B);

    RWAAssetRegistry private registry;

    function setUp() external {
        registry = new RWAAssetRegistry(owner, operator);
    }

    function test_upsertSetDecisionAndVault() external {
        bytes32 assetId = keccak256("asset-1");
        uint256 requestId = 1;

        vm.prank(operator);
        registry.upsertAsset(assetId, requestId, address(0xCAFE), address(0xBEEF), keccak256("bundle"), "ipfs://bundle", 123);

        vm.prank(operator);
        registry.setDecision(assetId, true, 90, keccak256("att"));

        vm.prank(operator);
        registry.setVault(assetId, address(0xA707));

        RWAAssetRegistry.AssetRecord memory rec = registry.getAsset(assetId);
        assertTrue(rec.exists);
        assertEq(rec.requestId, requestId);
        assertEq(rec.requester, address(0xCAFE));
        assertEq(rec.subject, address(0xBEEF));
        assertEq(rec.metadataUri, "ipfs://bundle");
        assertTrue(rec.approved);
        assertEq(rec.riskScore, 90);
        assertEq(rec.vault, address(0xA707));

        assertEq(registry.getAssetIdByRequest(requestId), assetId);
    }
}
