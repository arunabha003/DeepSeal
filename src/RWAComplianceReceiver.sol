// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {ComplianceRegistry} from "./ComplianceRegistry.sol";

/// @notice Receiver contract for CRE `EVMClient.writeReport` workflows.
/// The CRE Forwarder calls `onReport(metadata, report)`. This contract decodes `report`
/// and writes the compliance decision into the `ComplianceRegistry`.
contract RWAComplianceReceiver is Ownable {
    ComplianceRegistry public immutable complianceRegistry;

    /// @dev CRE forwarder address. If set to `address(0)`, anyone may call `onReport` (useful for local testing).
    address public reportForwarder;

    event ReportForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event ReportProcessed(address indexed subject, bool approved, uint32 riskScore, bytes32 attestationHash);

    error InvalidForwarder(address caller);
    error ZeroAddress();

    constructor(address initialOwner, ComplianceRegistry complianceRegistry_, address initialForwarder)
        Ownable(initialOwner)
    {
        if (address(complianceRegistry_) == address(0)) revert ZeroAddress();
        complianceRegistry = complianceRegistry_;
        reportForwarder = initialForwarder;
    }

    function setReportForwarder(address newForwarder) external onlyOwner {
        address previous = reportForwarder;
        reportForwarder = newForwarder;
        emit ReportForwarderUpdated(previous, newForwarder);
    }

    /// @notice Called by CRE forwarder with the DON-verified report.
    /// @param metadata Unused (required by the receiver interface).
    /// @param report ABI-encoded tuple: (address subject, bool approved, uint32 riskScore, bytes32 attestationHash)
    function onReport(bytes calldata metadata, bytes calldata report) external {
        metadata; // silence unused var warning

        address forwarder = reportForwarder;
        if (forwarder != address(0) && msg.sender != forwarder) revert InvalidForwarder(msg.sender);

        (address subject, bool approved, uint32 riskScore, bytes32 attestationHash) =
            abi.decode(report, (address, bool, uint32, bytes32));

        complianceRegistry.setApproval(subject, approved, riskScore, attestationHash);
        emit ReportProcessed(subject, approved, riskScore, attestationHash);
    }
}

