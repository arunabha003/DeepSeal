// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.24;

interface IIdentityRegistryForValidation {
    function ownerOf(uint256 tokenId) external view returns (address);
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

/// @notice ERC-8004 Validation Registry.
/// Spec: https://ercs.ethereum.org/ERCS/erc-8004
contract ValidationRegistry {
    struct ValidationStatus {
        address validatorAddress;
        uint256 agentId;
        uint8 response; // 0..100
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
        bool exists;
    }

    event ValidationRequest(address indexed validatorAddress, uint256 indexed agentId, string requestURI, bytes32 indexed requestHash);
    event ValidationResponse(
        address indexed validatorAddress,
        uint256 indexed agentId,
        bytes32 indexed requestHash,
        uint8 response,
        string responseURI,
        bytes32 responseHash,
        string tag
    );

    error NotInitialized();
    error AlreadyInitialized();
    error InvalidIdentityRegistry(address identityRegistry);
    error NotOwnerOrOperator(address caller, uint256 agentId);
    error InvalidAgentId(uint256 agentId);
    error InvalidValidator(address validatorAddress);
    error ResponseOutOfRange(uint8 response);
    error UnknownRequest(bytes32 requestHash);

    IIdentityRegistryForValidation private _identityRegistry;

    mapping(bytes32 requestHash => address validatorAddress) private _requestValidator;
    mapping(bytes32 requestHash => uint256 agentId) private _requestAgent;

    mapping(bytes32 requestHash => ValidationStatus status) private _status;

    mapping(uint256 agentId => bytes32[] requestHashes) private _agentValidations;
    mapping(address validator => bytes32[] requestHashes) private _validatorRequests;

    function initialize(address identityRegistry_) external {
        if (address(_identityRegistry) != address(0)) revert AlreadyInitialized();
        if (identityRegistry_ == address(0)) revert InvalidIdentityRegistry(identityRegistry_);
        _identityRegistry = IIdentityRegistryForValidation(identityRegistry_);
    }

    function getIdentityRegistry() external view returns (address identityRegistry) {
        identityRegistry = address(_identityRegistry);
        if (identityRegistry == address(0)) revert NotInitialized();
    }

    function validationRequest(address validatorAddress, uint256 agentId, string calldata requestURI, bytes32 requestHash) external {
        if (address(_identityRegistry) == address(0)) revert NotInitialized();
        if (validatorAddress == address(0)) revert InvalidValidator(validatorAddress);

        address owner = _ownerOf(agentId);
        if (owner == address(0)) revert InvalidAgentId(agentId);

        if (!_isOwnerOrOperator(owner, agentId, msg.sender)) revert NotOwnerOrOperator(msg.sender, agentId);

        _requestValidator[requestHash] = validatorAddress;
        _requestAgent[requestHash] = agentId;

        _agentValidations[agentId].push(requestHash);
        _validatorRequests[validatorAddress].push(requestHash);

        emit ValidationRequest(validatorAddress, agentId, requestURI, requestHash);
    }

    function validationResponse(bytes32 requestHash, uint8 response, string calldata responseURI, bytes32 responseHash, string calldata tag) external {
        address validator = _requestValidator[requestHash];
        if (validator == address(0)) revert UnknownRequest(requestHash);
        if (msg.sender != validator) revert InvalidValidator(msg.sender);
        if (response > 100) revert ResponseOutOfRange(response);

        uint256 agentId = _requestAgent[requestHash];

        ValidationStatus storage st = _status[requestHash];
        st.validatorAddress = validator;
        st.agentId = agentId;
        st.response = response;
        st.responseHash = responseHash;
        st.tag = tag;
        st.lastUpdate = block.timestamp;
        st.exists = true;

        emit ValidationResponse(validator, agentId, requestHash, response, responseURI, responseHash, tag);
    }

    function getValidationStatus(bytes32 requestHash)
        external
        view
        returns (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, string memory tag, uint256 lastUpdate)
    {
        ValidationStatus storage st = _status[requestHash];
        if (!st.exists) revert UnknownRequest(requestHash);
        return (st.validatorAddress, st.agentId, st.response, st.responseHash, st.tag, st.lastUpdate);
    }

    function getSummary(uint256 agentId, address[] calldata validatorAddresses, string calldata tag)
        external
        view
        returns (uint64 count, uint8 averageResponse)
    {
        bytes32 tagHash = keccak256(bytes(tag));
        bool filterTag = bytes(tag).length != 0;

        bytes32[] storage reqs = _agentValidations[agentId];
        if (reqs.length == 0) return (0, 0);

        uint256 sum = 0;
        uint256 matched = 0;

        for (uint256 i = 0; i < reqs.length; i++) {
            ValidationStatus storage st = _status[reqs[i]];
            if (!st.exists) continue;
            if (validatorAddresses.length != 0 && !_contains(validatorAddresses, st.validatorAddress)) continue;
            if (filterTag && keccak256(bytes(st.tag)) != tagHash) continue;
            matched++;
            sum += st.response;
        }

        if (matched == 0) return (0, 0);

        count = uint64(matched);
        averageResponse = uint8(sum / matched);
    }

    function getAgentValidations(uint256 agentId) external view returns (bytes32[] memory requestHashes) {
        return _agentValidations[agentId];
    }

    function getValidatorRequests(address validatorAddress) external view returns (bytes32[] memory requestHashes) {
        return _validatorRequests[validatorAddress];
    }

    function _contains(address[] calldata arr, address x) internal pure returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == x) return true;
        }
        return false;
    }

    function _ownerOf(uint256 agentId) internal view returns (address owner) {
        try _identityRegistry.ownerOf(agentId) returns (address o) {
            owner = o;
        } catch {
            owner = address(0);
        }
    }

    function _isOwnerOrOperator(address owner, uint256 agentId, address caller) internal view returns (bool) {
        return (caller == owner || _identityRegistry.getApproved(agentId) == caller || _identityRegistry.isApprovedForAll(owner, caller));
    }

    function getVersion() external pure returns (string memory) {
        return "2.0.0";
    }
}
