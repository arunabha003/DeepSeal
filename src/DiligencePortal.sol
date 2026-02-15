// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DiligencePortal {
    struct Request {
        address requester;
        address subject;
        bytes32 docBundleHash;
        string metadataUri;
        uint64 requestedAt;
    }

    uint256 public nextRequestId = 1;
    mapping(uint256 requestId => Request request) private _requests;

    event DiligenceRequested(
        uint256 indexed requestId,
        address indexed requester,
        address indexed subject,
        bytes32 docBundleHash,
        string metadataUri,
        uint64 requestedAt
    );

    error ZeroAddress();
    error ZeroHash();

    function submit(address subject, bytes32 docBundleHash, string calldata metadataUri) external returns (uint256) {
        if (subject == address(0)) revert ZeroAddress();
        if (docBundleHash == bytes32(0)) revert ZeroHash();

        uint256 requestId = nextRequestId++;

        Request memory req = Request({
            requester: msg.sender,
            subject: subject,
            docBundleHash: docBundleHash,
            metadataUri: metadataUri,
            requestedAt: uint64(block.timestamp)
        });

        _requests[requestId] = req;

        emit DiligenceRequested(
            requestId, req.requester, req.subject, req.docBundleHash, req.metadataUri, req.requestedAt
        );

        return requestId;
    }

    function getRequest(uint256 requestId) external view returns (Request memory) {
        return _requests[requestId];
    }
}

