// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DemoUSD} from "../src/DemoUSD.sol";
import {ComplianceRegistry} from "../src/ComplianceRegistry.sol";
import {RWAVault} from "../src/RWAVault.sol";

contract RWAVaultTest is Test {
    address private owner = address(this);
    address private operator = address(0xB0B);

    address private alice = address(0xA11CE);
    address private bob = address(0xB0B0);

    DemoUSD private asset;
    ComplianceRegistry private registry;
    RWAVault private vault;

    function setUp() external {
        asset = new DemoUSD(owner, "Demo USD", "dUSD", 6);
        registry = new ComplianceRegistry(owner, operator);
        vault = new RWAVault(asset, registry, "RWA Vault Share", "RWAV");

        asset.mint(alice, 1_000_000e6);
        vm.prank(alice);
        asset.approve(address(vault), type(uint256).max);
    }

    function test_depositBlockedWhenCallerNotApproved() external {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RWAVault.NotCompliant.selector, alice));
        vault.deposit(100e6, alice);
    }

    function test_depositBlockedWhenReceiverNotApproved() external {
        registry.setApproval(alice, true, 1, keccak256("att"));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RWAVault.NotCompliant.selector, bob));
        vault.deposit(100e6, bob);
    }

    function test_depositSucceedsWhenCallerAndReceiverApproved() external {
        registry.setApproval(alice, true, 1, keccak256("att"));
        registry.setApproval(bob, true, 1, keccak256("att2"));

        vm.prank(alice);
        uint256 shares = vault.deposit(100e6, bob);

        assertGt(shares, 0);
        assertEq(vault.balanceOf(bob), shares);
        assertEq(asset.balanceOf(bob), 0);
        assertEq(asset.balanceOf(address(vault)), 100e6);
    }

    function test_mintBlockedWhenNotApproved() external {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(RWAVault.NotCompliant.selector, alice));
        vault.mint(1e6, alice);
    }

    function test_maxDepositNonZeroEvenWhenNotApproved() external {
        vm.prank(alice);
        assertGt(vault.maxDeposit(alice), 0);
    }
}
