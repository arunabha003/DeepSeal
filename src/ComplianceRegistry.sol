// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ComplianceRegistry is Ownable {
    struct ComplianceRecord {
        bool approved;
        uint32 riskScore;
        bytes32 attestationHash;
        uint64 updatedAt;
    }

    mapping(address subject => ComplianceRecord record) private _records;

    address public workflowOperator;

    event WorkflowOperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event ComplianceUpdated(
        address indexed subject,
        bool approved,
        uint32 riskScore,
        bytes32 attestationHash,
        uint64 updatedAt
    );

    error ZeroAddress();
    error Unauthorized(address caller);

    constructor(address initialOwner, address initialWorkflowOperator) Ownable(initialOwner) {
        _setWorkflowOperator(initialWorkflowOperator);
    }

    function setWorkflowOperator(address newWorkflowOperator) external onlyOwner {
        _setWorkflowOperator(newWorkflowOperator);
    }

    function setApproval(address subject, bool approved, uint32 riskScore, bytes32 attestationHash) external {
        _requireOwnerOrOperator();
        if (subject == address(0)) revert ZeroAddress();

        uint64 updatedAt = uint64(block.timestamp);
        _records[subject] = ComplianceRecord({
            approved: approved,
            riskScore: riskScore,
            attestationHash: attestationHash,
            updatedAt: updatedAt
        });

        emit ComplianceUpdated(subject, approved, riskScore, attestationHash, updatedAt);
    }

    function isApproved(address subject) external view returns (bool) {
        return _records[subject].approved;
    }

    function getRecord(address subject) external view returns (ComplianceRecord memory) {
        return _records[subject];
    }

    function _setWorkflowOperator(address newWorkflowOperator) internal {
        if (newWorkflowOperator == address(0)) revert ZeroAddress();

        address previous = workflowOperator;
        workflowOperator = newWorkflowOperator;
        emit WorkflowOperatorUpdated(previous, newWorkflowOperator);
    }

    function _requireOwnerOrOperator() internal view {
        address caller = msg.sender;
        if (caller != owner() && caller != workflowOperator) revert Unauthorized(caller);
    }
}
