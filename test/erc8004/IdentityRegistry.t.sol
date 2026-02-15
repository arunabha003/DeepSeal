// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {IdentityRegistry} from "../../src/erc8004/IdentityRegistry.sol";

contract IdentityRegistryTest is Test {
    IdentityRegistry private reg;

    uint256 private alicePk = 0xA11CE;
    address private alice = vm.addr(alicePk);

    uint256 private bobPk = 0xB0B;
    address private bob = vm.addr(bobPk);

    address private charlie = address(0xCAFE);

    function setUp() external {
        reg = new IdentityRegistry();
    }

    function test_registerSetsOwnerAndAgentWallet() external {
        vm.prank(alice);
        uint256 agentId = reg.register("ipfs://agent.json");

        assertEq(agentId, 1);
        assertEq(reg.ownerOf(agentId), alice);
        assertEq(reg.getAgentWallet(agentId), alice);
    }

    function test_setMetadataRejectsReservedAgentWalletKey() external {
        vm.prank(alice);
        uint256 agentId = reg.register();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IdentityRegistry.ReservedKey.selector, "agentWallet"));
        reg.setMetadata(agentId, "agentWallet", abi.encode(bob));
    }

    function test_setAgentWalletRequiresWalletSignature() external {
        vm.prank(alice);
        uint256 agentId = reg.register();

        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _signSetAgentWallet(agentId, bob, deadline, bobPk);

        vm.prank(alice);
        reg.setAgentWallet(agentId, bob, deadline, sig);

        assertEq(reg.getAgentWallet(agentId), bob);
        assertEq(abi.decode(reg.getMetadata(agentId, "agentWallet"), (address)), bob);
    }

    function test_setAgentWalletRejectsWrongSignature() external {
        vm.prank(alice);
        uint256 agentId = reg.register();

        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _signSetAgentWallet(agentId, bob, deadline, alicePk); // signed by wrong key

        vm.prank(alice);
        vm.expectRevert(IdentityRegistry.InvalidSignature.selector);
        reg.setAgentWallet(agentId, bob, deadline, sig);
    }

    function test_transferResetsAgentWallet() external {
        vm.prank(alice);
        uint256 agentId = reg.register();

        uint256 deadline = block.timestamp + 1 days;
        bytes memory sig = _signSetAgentWallet(agentId, bob, deadline, bobPk);
        vm.prank(alice);
        reg.setAgentWallet(agentId, bob, deadline, sig);
        assertEq(reg.getAgentWallet(agentId), bob);

        vm.prank(alice);
        reg.transferFrom(alice, charlie, agentId);

        assertEq(reg.ownerOf(agentId), charlie);
        assertEq(reg.getAgentWallet(agentId), address(0));
        assertEq(abi.decode(reg.getMetadata(agentId, "agentWallet"), (address)), address(0));
    }

    function _domainSeparator() private view returns (bytes32) {
        // OpenZeppelin EIP712: keccak256(abi.encode(TYPEHASH, nameHash, versionHash, chainId, verifyingContract))
        bytes32 typeHash = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
        bytes32 nameHash = keccak256(bytes("ERC-8004 Identity Registry"));
        bytes32 versionHash = keccak256(bytes("1"));
        return keccak256(abi.encode(typeHash, nameHash, versionHash, block.chainid, address(reg)));
    }

    function _signSetAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 deadline,
        uint256 signerPk
    ) private view returns (bytes memory) {
        bytes32 typeHash = keccak256("SetAgentWallet(uint256 agentId,address newWallet,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typeHash, agentId, newWallet, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, digest);
        return abi.encodePacked(r, s, v);
    }
}

