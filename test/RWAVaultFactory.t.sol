// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {DemoUSD} from "../src/DemoUSD.sol";
import {RWAVaultFactory} from "../src/RWAVaultFactory.sol";

contract RWAVaultFactoryTest is Test {
    address private owner = address(0xA11CE);
    address private operator = address(0xB0B);

    DemoUSD private asset;
    ComplianceRegistry private compliance;
    RWAVaultFactory private factory;

    function setUp() external {
        asset = new DemoUSD(owner, "Demo USD", "dUSD", 6);
        compliance = new ComplianceRegistry(owner, owner);
        factory = new RWAVaultFactory(owner, asset, compliance, operator);
    }

    function test_createVaultReturnsSameAddressForSameAssetId() external {
        bytes32 assetId = keccak256("asset");

        vm.prank(operator);
        address first = factory.createVault(assetId, "DeepSeal RWA Vault #1", "DSRWA1");

        vm.prank(operator);
        address second = factory.createVault(assetId, "ignored", "ignored");

        assertTrue(first != address(0));
        assertEq(first, second);
        assertEq(factory.vaultByAssetId(assetId), first);
    }
}
