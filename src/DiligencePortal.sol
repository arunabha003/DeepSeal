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
    mapping(uint256 requestId => bytes32 assetId) private _assetIds;

    event DiligenceRequested(
        uint256 indexed requestId,
        bytes32 indexed assetId,
        address requester,
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
        bytes32 assetId = _deriveAssetId(msg.sender, subject, docBundleHash, metadataUri);

        Request memory req = Request({
            requester: msg.sender,
            subject: subject,
            docBundleHash: docBundleHash,
            metadataUri: metadataUri,
            requestedAt: uint64(block.timestamp)
        });

        _requests[requestId] = req;
        _assetIds[requestId] = assetId;

        emit DiligenceRequested(
            requestId, assetId, req.requester, req.subject, req.docBundleHash, req.metadataUri, req.requestedAt
        );

        return requestId;
    }

    function getRequest(uint256 requestId) external view returns (Request memory) {
        return _requests[requestId];
    }

    function assetIdForRequest(uint256 requestId) external view returns (bytes32) {
        return _assetIds[requestId];
    }

    function computeAssetId(address requester, address subject, bytes32 docBundleHash, string calldata metadataUri)
        external
        pure
        returns (bytes32)
    {
        return _deriveAssetId(requester, subject, docBundleHash, metadataUri);
    }

    function _deriveAssetId(address requester, address subject, bytes32 docBundleHash, string memory metadataUri)
        private
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(requester, subject, docBundleHash, metadataUri));
    }
}
