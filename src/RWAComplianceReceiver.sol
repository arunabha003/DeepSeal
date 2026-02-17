// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {ComplianceRegistry} from "./ComplianceRegistry.sol";
import {IEAS} from "./interfaces/IEAS.sol";

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

interface IReputationRegistry {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
}

interface IValidationRegistry {
    function validationRequest(address validatorAddress, uint256 agentId, string calldata requestURI, bytes32 requestHash) external;
    function validationResponse(bytes32 requestHash, uint8 response, string calldata responseURI, bytes32 responseHash, string calldata tag)
        external;
}

/// @notice Receiver contract for CRE `EVMClient.writeReport` workflows.
/// The Keystone Forwarder calls `onReport(metadata, report)` after verifying DON signatures.
/// This contract validates workflow identity from `metadata`, decodes `report`, and writes the
/// decision into the `ComplianceRegistry`.
contract RWAComplianceReceiver is Ownable, IReceiver {
    ComplianceRegistry public immutable complianceRegistry;

    /// @dev Keystone Forwarder address. If set to `address(0)`, anyone may call `onReport` (useful for local testing).
    address public forwarder;

    /// @dev Optional: automated EAS attestations for each processed report.
    IEAS public eas;
    bytes32 public easSchemaUid;
    bool public easRevocable;

    /// @dev Optional: automated ERC-8004 side effects.
    IReputationRegistry public reputationRegistry;
    uint256 public reputationAgentId;
    uint8 public reputationValueDecimals;

    IValidationRegistry public validationRegistry;
    uint256 public validationAgentId;
    address public validationResponder;
    bool public validationAutoRespond;

    bytes32 public expectedWorkflowId; // optional (0 disables check)
    address public expectedAuthor; // optional (0 disables check)
    bytes10 public expectedWorkflowName; // optional (0 disables check)

    event ForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event WorkflowIdentityUpdated(bytes32 workflowId, address author, bytes10 workflowName);
    event ReportProcessed(address indexed subject, bool approved, uint32 riskScore, bytes32 attestationHash);
    event EASConfigUpdated(address indexed eas, bytes32 indexed schemaUid, bool revocable);
    event EASAttested(address indexed subject, bytes32 indexed uid);
    event EASAttestFailed(address indexed subject, bytes reason);
    event ERC8004ReputationConfigUpdated(address indexed registry, uint256 indexed agentId, uint8 valueDecimals);
    event ERC8004ValidationConfigUpdated(address indexed registry, uint256 indexed agentId, address indexed responder, bool autoRespond);
    event ERC8004ReputationWritten(uint256 indexed agentId, int128 value, uint8 valueDecimals, bytes32 feedbackHash);
    event ERC8004ReputationWriteFailed(uint256 indexed agentId, bytes reason);
    event ERC8004ValidationRequested(uint256 indexed agentId, bytes32 indexed requestHash, address indexed responder);
    event ERC8004ValidationRequestFailed(uint256 indexed agentId, bytes reason);
    event ERC8004ValidationResponded(uint256 indexed agentId, bytes32 indexed requestHash, uint8 response, bytes32 responseHash);
    event ERC8004ValidationResponseFailed(uint256 indexed agentId, bytes32 indexed requestHash, bytes reason);

    error InvalidForwarder(address caller);
    error InvalidWorkflowId(bytes32 received, bytes32 expected);
    error InvalidAuthor(address received, address expected);
    error InvalidWorkflowName(bytes10 received, bytes10 expected);
    error ZeroAddress();
    error ValueDecimalsOutOfRange(uint8 valueDecimals);

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
        easRevocable = true;
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

    /// @notice Configure automated EAS attestations. Set `eas_` and `schemaUid_` to non-zero to enable.
    /// @dev Schema MUST match the encoding in `_buildEASData(...)`:
    /// `address subject,bool approved,uint32 riskScore,bytes32 attestationHash,uint64 timestamp`.
    function setEAS(address eas_, bytes32 schemaUid_, bool revocable_) external onlyOwner {
        eas = IEAS(eas_);
        easSchemaUid = schemaUid_;
        easRevocable = revocable_;
        emit EASConfigUpdated(eas_, schemaUid_, revocable_);
    }

    function setERC8004Reputation(address registry_, uint256 agentId_, uint8 valueDecimals_) external onlyOwner {
        if (valueDecimals_ > 18) revert ValueDecimalsOutOfRange(valueDecimals_);
        reputationRegistry = IReputationRegistry(registry_);
        reputationAgentId = agentId_;
        reputationValueDecimals = valueDecimals_;
        emit ERC8004ReputationConfigUpdated(registry_, agentId_, valueDecimals_);
    }

    function setERC8004Validation(address registry_, uint256 agentId_, address responder_, bool autoRespond_) external onlyOwner {
        validationRegistry = IValidationRegistry(registry_);
        validationAgentId = agentId_;
        validationResponder = responder_;
        validationAutoRespond = autoRespond_;
        emit ERC8004ValidationConfigUpdated(registry_, agentId_, responder_, autoRespond_);
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

        IEAS eas_ = eas;
        bytes32 schema = easSchemaUid;
        if (address(eas_) != address(0) && schema != bytes32(0)) {
            IEAS.AttestationRequest memory req = IEAS.AttestationRequest({
                schema: schema,
                data: IEAS.AttestationRequestData({
                    recipient: subject,
                    expirationTime: 0,
                    revocable: easRevocable,
                    refUID: bytes32(0),
                    data: _buildEASData(subject, approved, riskScore, attestationHash),
                    value: 0
                })
            });

            try eas_.attest(req) returns (bytes32 uid) {
                emit EASAttested(subject, uid);
            } catch (bytes memory reason) {
                emit EASAttestFailed(subject, reason);
            }
        }

        _tryRecordERC8004Artifacts(subject, approved, riskScore, attestationHash);
    }

    function _buildEASData(address subject, bool approved, uint32 riskScore, bytes32 attestationHash)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(subject, approved, riskScore, attestationHash, uint64(block.timestamp));
    }

    function _tryRecordERC8004Artifacts(address subject, bool approved, uint32 riskScore, bytes32 attestationHash) internal {
        IReputationRegistry rep = reputationRegistry;
        uint256 repAgent = reputationAgentId;
        uint8 decimals = reputationValueDecimals;
        if (address(rep) != address(0) && repAgent != 0) {
            int128 value = _toReputationValue(approved, riskScore);
            bytes32 feedbackHash = keccak256(abi.encode(subject, approved, riskScore, attestationHash, block.timestamp));
            try rep.giveFeedback(
                repAgent, value, decimals, "diligence", approved ? "approved" : "rejected", "", "", feedbackHash
            ) {
                emit ERC8004ReputationWritten(repAgent, value, decimals, feedbackHash);
            } catch (bytes memory reason) {
                emit ERC8004ReputationWriteFailed(repAgent, reason);
            }
        }

        IValidationRegistry val = validationRegistry;
        uint256 valAgent = validationAgentId;
        address responder = validationResponder;
        if (address(val) != address(0) && valAgent != 0 && responder != address(0)) {
            bytes32 requestHash = keccak256(abi.encode(subject, attestationHash, valAgent, block.timestamp, address(this)));
            try val.validationRequest(responder, valAgent, "", requestHash) {
                emit ERC8004ValidationRequested(valAgent, requestHash, responder);

                if (validationAutoRespond && responder == address(this)) {
                    uint8 response = _toValidationResponse(approved, riskScore);
                    bytes32 responseHash = keccak256(abi.encode(attestationHash, riskScore, approved));
                    try val.validationResponse(requestHash, response, "", responseHash, approved ? "approved" : "rejected") {
                        emit ERC8004ValidationResponded(valAgent, requestHash, response, responseHash);
                    } catch (bytes memory reason) {
                        emit ERC8004ValidationResponseFailed(valAgent, requestHash, reason);
                    }
                }
            } catch (bytes memory reason) {
                emit ERC8004ValidationRequestFailed(valAgent, reason);
            }
        }
    }

    function _toReputationValue(bool approved, uint32 riskScore) internal pure returns (int128) {
        uint256 bounded = riskScore > 1000 ? 1000 : uint256(riskScore);
        if (approved) {
            return int128(int256(1000 - bounded));
        }
        return -int128(int256(bounded));
    }

    function _toValidationResponse(bool approved, uint32 riskScore) internal pure returns (uint8) {
        if (!approved) return 0;
        uint256 bounded = riskScore > 1000 ? 1000 : uint256(riskScore);
        return uint8(100 - (bounded / 10));
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
