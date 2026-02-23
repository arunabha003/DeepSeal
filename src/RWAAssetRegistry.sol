// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract RWAAssetRegistry is Ownable {
    struct AssetRecord {
        uint256 requestId;
        address requester;
        address subject;
        bytes32 docBundleHash;
        string metadataUri;
        uint64 requestedAt;
        bool approved;
        uint32 riskScore;
        bytes32 attestationHash;
        uint64 decidedAt;
        address vault;
        bool exists;
    }

    mapping(bytes32 assetId => AssetRecord record) private _records;
    mapping(uint256 requestId => bytes32 assetId) private _assetIdByRequest;

    address public operator;

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event AssetUpserted(
        bytes32 indexed assetId,
        uint256 indexed requestId,
        address indexed requester,
        address subject,
        bytes32 docBundleHash,
        string metadataUri,
        uint64 requestedAt
    );
    event AssetDecisionUpdated(
        bytes32 indexed assetId, bool approved, uint32 riskScore, bytes32 attestationHash, uint64 decidedAt
    );
    event AssetVaultUpdated(bytes32 indexed assetId, address indexed vault);

    error ZeroAddress();
    error Unauthorized(address caller);
    error AssetNotFound(bytes32 assetId);

    constructor(address initialOwner, address initialOperator) Ownable(initialOwner) {
        _setOperator(initialOperator);
    }

    function setOperator(address newOperator) external onlyOwner {
        _setOperator(newOperator);
    }

    function upsertAsset(
        bytes32 assetId,
        uint256 requestId,
        address requester,
        address subject,
        bytes32 docBundleHash,
        string calldata metadataUri,
        uint64 requestedAt
    )
        external
    {
        _requireOwnerOrOperator();
        if (requester == address(0) || subject == address(0)) revert ZeroAddress();
        if (assetId == bytes32(0)) revert AssetNotFound(assetId);

        AssetRecord storage rec = _records[assetId];
        rec.requestId = requestId;
        rec.requester = requester;
        rec.subject = subject;
        rec.docBundleHash = docBundleHash;
        rec.metadataUri = metadataUri;
        rec.requestedAt = requestedAt;
        rec.exists = true;

        _assetIdByRequest[requestId] = assetId;

        emit AssetUpserted(assetId, requestId, requester, subject, docBundleHash, metadataUri, requestedAt);
    }

    function setDecision(bytes32 assetId, bool approved, uint32 riskScore, bytes32 attestationHash) external {
        _requireOwnerOrOperator();
        AssetRecord storage rec = _records[assetId];
        if (!rec.exists) revert AssetNotFound(assetId);

        uint64 decidedAt = uint64(block.timestamp);
        rec.approved = approved;
        rec.riskScore = riskScore;
        rec.attestationHash = attestationHash;
        rec.decidedAt = decidedAt;

        emit AssetDecisionUpdated(assetId, approved, riskScore, attestationHash, decidedAt);
    }

    function setVault(bytes32 assetId, address vault) external {
        _requireOwnerOrOperator();
        AssetRecord storage rec = _records[assetId];
        if (!rec.exists) revert AssetNotFound(assetId);
        if (vault == address(0)) revert ZeroAddress();
        rec.vault = vault;
        emit AssetVaultUpdated(assetId, vault);
    }

    function getAsset(bytes32 assetId) external view returns (AssetRecord memory) {
        return _records[assetId];
    }

    function getAssetIdByRequest(uint256 requestId) external view returns (bytes32) {
        return _assetIdByRequest[requestId];
    }

    function _setOperator(address newOperator) internal {
        if (newOperator == address(0)) revert ZeroAddress();
        address previous = operator;
        operator = newOperator;
        emit OperatorUpdated(previous, newOperator);
    }

    function _requireOwnerOrOperator() internal view {
        address caller = msg.sender;
        if (caller != owner() && caller != operator) revert Unauthorized(caller);
    }
}
