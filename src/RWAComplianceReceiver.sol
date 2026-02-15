// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {ComplianceRegistry} from "./ComplianceRegistry.sol";

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @notice Receiver contract for CRE `EVMClient.writeReport` workflows.
/// The Keystone Forwarder calls `onReport(metadata, report)` after verifying DON signatures.
/// This contract validates workflow identity from `metadata`, decodes `report`, and writes the
/// decision into the `ComplianceRegistry`.
contract RWAComplianceReceiver is Ownable, IReceiver {
    ComplianceRegistry public immutable complianceRegistry;

    /// @dev Keystone Forwarder address. If set to `address(0)`, anyone may call `onReport` (useful for local testing).
    address public forwarder;

    bytes32 public expectedWorkflowId; // optional (0 disables check)
    address public expectedAuthor; // optional (0 disables check)
    bytes10 public expectedWorkflowName; // optional (0 disables check)

    event ForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event WorkflowIdentityUpdated(bytes32 workflowId, address author, bytes10 workflowName);
    event ReportProcessed(address indexed subject, bool approved, uint32 riskScore, bytes32 attestationHash);

    error InvalidForwarder(address caller);
    error InvalidWorkflowId(bytes32 received, bytes32 expected);
    error InvalidAuthor(address received, address expected);
    error InvalidWorkflowName(bytes10 received, bytes10 expected);
    error ZeroAddress();

    constructor(
        address initialOwner,
        ComplianceRegistry complianceRegistry_,
        address initialForwarder,
        bytes32 initialExpectedWorkflowId,
        address initialExpectedAuthor,
        bytes10 initialExpectedWorkflowName
    )
        Ownable(initialOwner)
    {
        if (address(complianceRegistry_) == address(0)) revert ZeroAddress();
        complianceRegistry = complianceRegistry_;
        forwarder = initialForwarder;
        expectedWorkflowId = initialExpectedWorkflowId;
        expectedAuthor = initialExpectedAuthor;
        expectedWorkflowName = initialExpectedWorkflowName;
    }

    function setForwarder(address newForwarder) external onlyOwner {
        address previous = forwarder;
        forwarder = newForwarder;
        emit ForwarderUpdated(previous, newForwarder);
    }

    function setExpectedWorkflow(bytes32 workflowId, address author, bytes10 workflowName) external onlyOwner {
        expectedWorkflowId = workflowId;
        expectedAuthor = author;
        expectedWorkflowName = workflowName;
        emit WorkflowIdentityUpdated(workflowId, author, workflowName);
    }

    /// @notice Called by Keystone Forwarder with the DON-verified report.
    /// @param metadata Unused (required by the receiver interface).
    /// @param report ABI-encoded tuple: (address subject, bool approved, uint32 riskScore, bytes32 attestationHash)
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        address expectedForwarder = forwarder;
        if (expectedForwarder != address(0) && msg.sender != expectedForwarder) revert InvalidForwarder(msg.sender);

        (bytes32 workflowId, bytes10 workflowName, address workflowOwner) = _decodeMetadata(metadata);

        bytes32 expId = expectedWorkflowId;
        if (expId != bytes32(0) && workflowId != expId) revert InvalidWorkflowId(workflowId, expId);

        address expAuthor = expectedAuthor;
        if (expAuthor != address(0) && workflowOwner != expAuthor) revert InvalidAuthor(workflowOwner, expAuthor);

        bytes10 expName = expectedWorkflowName;
        if (expName != bytes10(0) && workflowName != expName) revert InvalidWorkflowName(workflowName, expName);

        (address subject, bool approved, uint32 riskScore, bytes32 attestationHash) =
            abi.decode(report, (address, bool, uint32, bytes32));

        complianceRegistry.setApproval(subject, approved, riskScore, attestationHash);
        emit ReportProcessed(subject, approved, riskScore, attestationHash);
    }

    /// @notice Extract workflow identity fields from the metadata parameter of onReport.
    function _decodeMetadata(bytes memory metadata) internal pure returns (bytes32 workflowId, bytes10 workflowName, address workflowOwner) {
        // Metadata structure:
        // - First 32 bytes: length of the byte array (standard for dynamic bytes)
        // - Offset 32, size 32: workflow_id (bytes32)
        // - Offset 64, size 10: workflow_name (bytes10)
        // - Offset 74, size 20: workflow_owner (address)
        assembly {
            workflowId := mload(add(metadata, 32))
            workflowName := mload(add(metadata, 64))
            workflowOwner := shr(mul(12, 8), mload(add(metadata, 74)))
        }
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
