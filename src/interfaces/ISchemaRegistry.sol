// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISchemaRegistry {
    function register(string calldata schema, address resolver, bool revocable) external returns (bytes32);
}

