// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEAS {
    struct AttestationRequestData {
        address recipient;
        uint64 expirationTime;
        bool revocable;
        bytes32 refUID;
        bytes data;
        uint256 value;
    }

    struct AttestationRequest {
        bytes32 schema;
        AttestationRequestData data;
    }

    function attest(AttestationRequest calldata request) external payable returns (bytes32);
}

